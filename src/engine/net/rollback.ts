/**
 * GGPO-style rollback netcode engine.
 * Manages input buffers, predictions, snapshots, and resimulation.
 */
import type { InputState, PlayerSlot } from '../types';
import type { GameLoop } from '../gameLoop';
import type { GameSnapshot } from './serialize';
import { takeSnapshot, restoreSnapshot, hashGameState, takeSnapshotInto, createEmptySnapshot } from './serialize';
import { Transport } from './transport';
import {
  MsgType,
  encodeInputMessage, decodeInputMessage,
} from './protocol';
import type { ReliableMessage, DesyncCheckMessage, DesyncRequestMessage, DesyncCorrectionMessage } from './protocol';
import { FIXED_TIMESTEP } from '../constants';

const BUFFER_SIZE = 128;          // ~2.1 seconds at 60fps
const MAX_ROLLBACK_FRAMES = 7;    // max frames we'll rewind
const DEFAULT_INPUT_DELAY = 2;    // frames of local input delay
const MAX_INPUT_DELAY = 4;
const INPUT_BUNDLE_SIZE = 10;     // recent inputs to bundle per message
const DESYNC_CHECK_INTERVAL = 30; // frames between state sync checks (0.5s)

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

// Visual correction smoothing constants
const RENDER_OFFSET_DECAY = 0.7;
const RENDER_OFFSET_MIN = 0.5;        // threshold below which offset snaps to 0
const CORRECTION_SNAP_DISTANCE = 30;   // corrections larger than this snap (no lerp)
const STATS_RESET_INTERVAL = 60;       // frames between stats window reset (1 second)

export interface NetDebugStats {
  localFrame: number;
  remoteConfirmedFrame: number;
  remoteLatestAck: number;
  rtt: number;
  jitter: number;
  inputDelay: number;
  stalled: boolean;
  rollbacksPerSec: number;
  maxRollbackDepth: number;
}

export interface RollbackConfig {
  localSlot: PlayerSlot;
  remoteSlot: PlayerSlot;
  isHost: boolean;
  gameLoop: GameLoop;
  transport: Transport;
  onDesync?: (localHash: number, remoteHash: number, frame: number) => void;
  onStall?: (stalled: boolean) => void;
}

export class RollbackEngine {
  private localSlot: PlayerSlot;
  private remoteSlot: PlayerSlot;
  private isHost: boolean;
  private gameLoop: GameLoop;
  private transport: Transport;

  // Input buffers (ring buffer, indexed by frame % BUFFER_SIZE)
  private localInputs: InputState[] = new Array(BUFFER_SIZE);
  private remoteInputs: InputState[] = new Array(BUFFER_SIZE);
  private remoteConfirmed: boolean[] = new Array(BUFFER_SIZE);

  // Frame tracking
  private localFrame = 0;
  private remoteConfirmedFrame = -1;
  private _remoteLatestAck = -1; // latest local frame the remote has acknowledged

  // Snapshot ring buffer (pre-allocated to avoid GC pressure)
  private snapshots: GameSnapshot[] = Array.from({ length: MAX_ROLLBACK_FRAMES }, () => createEmptySnapshot());

  // Track the last frame we confirmed via rollback (avoid redundant resimulation)
  private lastSyncedFrame = -1;

  // Input delay (adaptive)
  private inputDelay = DEFAULT_INPUT_DELAY;

  // Timing
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private rafId = 0;
  private stalled = false;

  // Rollback stats (for debug overlay)
  private rollbackCount = 0;
  private rollbackCountPerSec = 0;
  private maxRollbackDepth = 0;
  private maxRollbackDepthPerSec = 0;
  private statsResetFrame = 0;

  // Reusable objects for hot 60fps loop (avoid GC pressure)
  private readonly inputMap = new Map<string, InputState>();
  private readonly sendBundle: Array<{ frame: number; input: InputState }> = Array.from(
    { length: INPUT_BUNDLE_SIZE },
    () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
  );
  private readonly preRollbackX: number[] = [];
  private readonly preRollbackY: number[] = [];
  private readonly _statsCache: NetDebugStats = {
    localFrame: 0, remoteConfirmedFrame: 0, remoteLatestAck: 0,
    rtt: 0, jitter: 0, inputDelay: 0, stalled: false,
    rollbacksPerSec: 0, maxRollbackDepth: 0,
  };

  // Callbacks
  private onStall?: (stalled: boolean) => void;

  constructor(config: RollbackConfig) {
    this.localSlot = config.localSlot;
    this.remoteSlot = config.remoteSlot;
    this.isHost = config.isHost;
    this.gameLoop = config.gameLoop;
    this.transport = config.transport;
    this.onStall = config.onStall;

    // Fill buffers with no-input
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this.localInputs[i] = { ...NO_INPUT };
      this.remoteInputs[i] = { ...NO_INPUT };
      this.remoteConfirmed[i] = false;
    }
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.gameLoop.setNetworkMode(true);
    this.gameLoop.start();
    this.networkLoop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.gameLoop.stop();
  }

  /** Process incoming remote input message. */
  handleInputMessage(data: ArrayBuffer): void {
    const decoded = decodeInputMessage(data);
    if (!decoded) {
      console.warn('[net] Failed to decode input message');
      return;
    }

    for (let i = 0; i < decoded.inputCount; i++) {
      const { frame, input } = decoded.inputs[i];
      // Bounds check: reject frames too far in past or future
      if (frame < this.localFrame - BUFFER_SIZE) continue;
      if (frame > this.localFrame + BUFFER_SIZE) continue;

      const bufIdx = frame % BUFFER_SIZE;

      // Only accept inputs for frames we haven't passed too far
      if (this.remoteConfirmed[bufIdx] && frame <= this.remoteConfirmedFrame) continue;

      this.remoteInputs[bufIdx] = input;
      this.remoteConfirmed[bufIdx] = true;

      if (frame > this.remoteConfirmedFrame) {
        this.remoteConfirmedFrame = frame;
      }
    }

    this._remoteLatestAck = decoded.latestAck;
  }

  /** Process a reliable message (desync check / state sync). */
  handleReliableMessage(msg: ReliableMessage): void {
    if (msg.type === MsgType.DESYNC_CHECK) {
      // Guest: compare hashes, request correction only on mismatch
      if (!this.isHost) {
        const check = msg as DesyncCheckMessage;
        const localHash = hashGameState(this.gameLoop.getState(), this.gameLoop.getRng());
        if (check.hash !== localHash) {
          console.log(`[net] Hash mismatch at frame ${check.frame} (local ${localHash} != host ${check.hash}), requesting correction`);
          const req: DesyncRequestMessage = { type: MsgType.DESYNC_REQUEST, frame: check.frame };
          this.transport.sendReliable(req);
        }
      }
    } else if (msg.type === MsgType.DESYNC_REQUEST) {
      // Host: guest reported mismatch, send snapshot from the check frame if available
      if (this.isHost) {
        const reqFrame = (msg as DesyncRequestMessage).frame;
        const cached = this.snapshots[reqFrame % MAX_ROLLBACK_FRAMES];
        let snap: GameSnapshot;
        let correctionFrame: number;
        if (cached.frame === reqFrame) {
          // Use the exact snapshot from the desync check frame
          snap = cached;
          correctionFrame = reqFrame;
        } else {
          // Frame aged out of ring buffer — fall back to current state
          snap = takeSnapshot(this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());
          correctionFrame = this.localFrame;
        }
        const correction: DesyncCorrectionMessage = {
          type: MsgType.DESYNC_CORRECTION,
          frame: correctionFrame,
          snapshot: snap,
        };
        this.transport.sendReliable(correction);
      }
    } else if (msg.type === MsgType.DESYNC_CORRECTION) {
      // Guest: apply host's authoritative state
      if (!this.isHost) {
        const correction = msg as DesyncCorrectionMessage;
        console.log(`[net] Applying host correction at frame ${correction.frame}`);
        restoreSnapshot(correction.snapshot as GameSnapshot, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());
        this.localFrame = correction.frame;
      }
    }
  }

  private networkLoop = (currentTime: number): void => {
    if (!this.running) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    this.accumulator += dt;

    // Process incoming messages (transport delivers via callbacks, already handled)

    // Advance simulation
    while (this.accumulator >= FIXED_TIMESTEP) {
      // Check if we're too far ahead of the remote (stall check)
      // Skip stall during startup grace period (remoteConfirmedFrame == -1 means no inputs received yet)
      const frameAdvantage = this.localFrame - this.remoteConfirmedFrame;
      if (this.remoteConfirmedFrame >= 0 && frameAdvantage >= MAX_ROLLBACK_FRAMES) {
        // Stalled — don't advance, wait for remote
        if (!this.stalled) {
          this.stalled = true;
          this.onStall?.(true);
        }
        this.accumulator = 0;
        break;
      }

      if (this.stalled) {
        this.stalled = false;
        this.onStall?.(false);
      }

      this.advanceFrame();
      this.accumulator -= FIXED_TIMESTEP;
    }

    // Push net debug stats to renderer before drawing
    this.gameLoop.setNetDebugStats(this.getStats());

    // Render (pass frameDt for real-time timer decay: slowMotion, screenFlash, hitstopZoom)
    this.gameLoop.renderFrame(dt);

    this.rafId = requestAnimationFrame(this.networkLoop);
  };

  private advanceFrame(): void {
    // 1. Read local input (delayed)
    const localInput = this.readLocalInput();
    const delayedFrame = this.localFrame + this.inputDelay;
    this.localInputs[delayedFrame % BUFFER_SIZE] = localInput;

    // 2. Send local input (bundled with recent unacked)
    this.sendInput(delayedFrame, localInput);

    // 3. Check for mispredictions and rollback if needed
    this.checkRollback();

    // 4. Predict remote input for current frame if not confirmed
    const bufIdx = this.localFrame % BUFFER_SIZE;
    if (!this.remoteConfirmed[bufIdx]) {
      // Predict: repeat last confirmed input
      this.remoteInputs[bufIdx] = this.getLastConfirmedRemoteInput();
    }

    // 5. Build input map and advance (reuse Map to avoid GC pressure at 60fps)
    this.inputMap.clear();
    this.inputMap.set(this.localSlot, this.localInputs[this.localFrame % BUFFER_SIZE]);
    this.inputMap.set(this.remoteSlot, this.remoteInputs[bufIdx]);

    // Take snapshot before advancing (in-place into pre-allocated slot)
    takeSnapshotInto(
      this.snapshots[this.localFrame % MAX_ROLLBACK_FRAMES],
      this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers(),
    );

    // Advance simulation
    this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);

    // Decay visual correction offsets (~3-5 frames to settle)
    for (const p of this.gameLoop.getState().players) {
      p.renderOffsetX *= RENDER_OFFSET_DECAY;
      p.renderOffsetY *= RENDER_OFFSET_DECAY;
      if (Math.abs(p.renderOffsetX) < RENDER_OFFSET_MIN) p.renderOffsetX = 0;
      if (Math.abs(p.renderOffsetY) < RENDER_OFFSET_MIN) p.renderOffsetY = 0;
    }

    // 6. Desync check
    if (this.localFrame > 0 && this.localFrame % DESYNC_CHECK_INTERVAL === 0) {
      this.sendDesyncCheck();
    }

    // 7. Adapt input delay based on RTT
    this.adaptInputDelay();

    // 8. Reset rollback stats window
    if (this.localFrame - this.statsResetFrame >= STATS_RESET_INTERVAL) {
      this.rollbackCountPerSec = this.rollbackCount;
      this.maxRollbackDepthPerSec = this.maxRollbackDepth;
      this.rollbackCount = 0;
      this.maxRollbackDepth = 0;
      this.statsResetFrame = this.localFrame;
    }

    this.localFrame++;
  }

  private checkRollback(): void {
    // Only rollback if NEW confirmed inputs have arrived since our last sync
    if (this.remoteConfirmedFrame <= this.lastSyncedFrame) return;

    // Find the earliest frame that needs resimulation
    let rollbackFrame = -1;
    for (let f = Math.max(0, this.lastSyncedFrame + 1, this.localFrame - MAX_ROLLBACK_FRAMES); f < this.localFrame; f++) {
      const bufIdx = f % BUFFER_SIZE;
      if (this.remoteConfirmed[bufIdx]) {
        const snap = this.snapshots[f % MAX_ROLLBACK_FRAMES];
        if (snap && snap.frame === f) {
          rollbackFrame = f;
          break;
        }
      }
    }

    if (rollbackFrame < 0) {
      this.lastSyncedFrame = this.remoteConfirmedFrame;
      return;
    }

    // Restore snapshot — snapshot[f] = state at START of frame f (before tick f)
    const snap = this.snapshots[rollbackFrame % MAX_ROLLBACK_FRAMES];
    if (snap.frame !== rollbackFrame) return;

    // Track rollback stats for debug overlay
    const depth = this.localFrame - rollbackFrame;
    this.rollbackCount++;
    if (depth > this.maxRollbackDepth) this.maxRollbackDepth = depth;

    // Capture pre-rollback positions for visual smoothing
    const state = this.gameLoop.getState();
    for (let i = 0; i < state.players.length; i++) {
      this.preRollbackX[i] = state.players[i].x;
      this.preRollbackY[i] = state.players[i].y;
    }

    this.gameLoop.setAudioEnabled(false);
    this.gameLoop.setResimulating(true);
    restoreSnapshot(snap, state, this.gameLoop.getRng(), this.gameLoop.getAIControllers());

    // Resimulate from rollbackFrame to localFrame
    // Convention: snapshot[f] = state BEFORE tick f. We take snapshot, then tick.
    for (let f = rollbackFrame; f < this.localFrame; f++) {
      const bufIdx = f % BUFFER_SIZE;
      this.inputMap.clear();
      this.inputMap.set(this.localSlot, this.localInputs[bufIdx]);
      this.inputMap.set(this.remoteSlot, this.remoteInputs[bufIdx]);

      // Snapshot at f = state before tick f (already correct for rollbackFrame from restore)
      // For subsequent frames, capture state before ticking (in-place)
      if (f > rollbackFrame) {
        takeSnapshotInto(
          this.snapshots[f % MAX_ROLLBACK_FRAMES],
          f, state, this.gameLoop.getRng(), this.gameLoop.getAIControllers(),
        );
      }

      this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);
    }

    this.gameLoop.setAudioEnabled(true);
    this.gameLoop.setResimulating(false);

    // Compute correction offsets for visual smoothing
    const snapDistSq = CORRECTION_SNAP_DISTANCE * CORRECTION_SNAP_DISTANCE;
    const minDistSq = RENDER_OFFSET_MIN * RENDER_OFFSET_MIN;
    for (let i = 0; i < state.players.length; i++) {
      const dx = this.preRollbackX[i] - state.players[i].x;
      const dy = this.preRollbackY[i] - state.players[i].y;
      const distSq = dx * dx + dy * dy;
      if (distSq > snapDistSq) {
        state.players[i].renderOffsetX = 0;
        state.players[i].renderOffsetY = 0;
      } else if (distSq > minDistSq) {
        state.players[i].renderOffsetX += dx;
        state.players[i].renderOffsetY += dy;
      }
    }
    this.lastSyncedFrame = this.remoteConfirmedFrame;
  }

  private readLocalInput(): InputState {
    // Read from the InputManager — use ALL key bindings for online play
    try {
      return this.gameLoop.getInputAny();
    } catch {
      return NO_INPUT;
    }
  }

  private sendInput(frame: number, _input: InputState): void {
    // Bundle recent unacked inputs into pre-allocated objects (zero allocation)
    const startFrame = Math.max(0, frame - INPUT_BUNDLE_SIZE + 1);
    const count = frame - startFrame + 1;
    for (let i = 0; i < count; i++) {
      const f = startFrame + i;
      this.sendBundle[i].frame = f;
      this.sendBundle[i].input = this.localInputs[f % BUFFER_SIZE];
    }
    // Pass count to encoder instead of truncating array (truncating destroys pre-allocated slots)
    const msg = encodeInputMessage(this.sendBundle, this.remoteConfirmedFrame, count, this.localSlot);
    this.transport.sendUnreliable(msg);
  }

  private getLastConfirmedRemoteInput(): InputState {
    if (this.remoteConfirmedFrame < 0) return NO_INPUT;
    return this.remoteInputs[this.remoteConfirmedFrame % BUFFER_SIZE];
  }

  private sendDesyncCheck(): void {
    if (this.isHost) {
      // Host sends hash only — guest requests full snapshot only on mismatch
      const check: DesyncCheckMessage = {
        type: MsgType.DESYNC_CHECK,
        frame: this.localFrame,
        hash: hashGameState(this.gameLoop.getState(), this.gameLoop.getRng()),
        rngState: this.gameLoop.getRng()?.getState() ?? 0,
      };
      this.transport.sendReliable(check);
    }
  }

  private adaptInputDelay(): void {
    const rtt = this.transport.currentRtt;
    if (rtt <= 0) return;
    const tickMs = FIXED_TIMESTEP * 1000;
    const rttFrames = Math.ceil(rtt / 2 / tickMs);
    // Add up to 2 extra frames for high jitter to prevent constant rollback churn
    const jitterPad = Math.min(Math.ceil(this.transport.currentJitter / tickMs), 2);
    const target = Math.max(1, Math.min(MAX_INPUT_DELAY, rttFrames + jitterPad));
    // Hysteresis: only change if difference is meaningful (prevents oscillation on jitter spikes)
    if (target > this.inputDelay || target < this.inputDelay - 1) {
      this.inputDelay = target;
    }
  }

  /** Get current stats for debug display (returns cached object — no allocation). */
  getStats(): NetDebugStats {
    const s = this._statsCache;
    s.localFrame = this.localFrame;
    s.remoteConfirmedFrame = this.remoteConfirmedFrame;
    s.remoteLatestAck = this._remoteLatestAck;
    s.rtt = this.transport.currentRtt;
    s.jitter = this.transport.currentJitter;
    s.inputDelay = this.inputDelay;
    s.stalled = this.stalled;
    s.rollbacksPerSec = this.rollbackCountPerSec;
    s.maxRollbackDepth = this.maxRollbackDepthPerSec;
    return s;
  }
}
