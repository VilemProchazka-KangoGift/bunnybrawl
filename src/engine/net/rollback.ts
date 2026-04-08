/**
 * GGPO-style rollback netcode engine.
 * Manages input buffers, predictions, snapshots, and resimulation.
 */
import type { InputState, PlayerSlot } from '../types';
import type { GameLoop } from '../gameLoop';
import type { GameSnapshot } from './serialize';
import { takeSnapshot, restoreSnapshot, hashGameState } from './serialize';
import { Transport } from './transport';
import {
  MsgType,
  encodeInputMessage, decodeInputMessage,
} from './protocol';
import type { ReliableMessage } from './protocol';
import { FIXED_TIMESTEP } from '../constants';

const BUFFER_SIZE = 128;          // ~2.1 seconds at 60fps
const MAX_ROLLBACK_FRAMES = 7;    // max frames we'll rewind
const DEFAULT_INPUT_DELAY = 2;    // frames of local input delay
const MAX_INPUT_DELAY = 4;
const INPUT_BUNDLE_SIZE = 10;     // recent inputs to bundle per message
const DESYNC_CHECK_INTERVAL = 30; // frames between state sync checks (0.5s)

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

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

  // Snapshot ring buffer
  private snapshots: (GameSnapshot | null)[] = new Array(MAX_ROLLBACK_FRAMES).fill(null);

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

  // Reusable objects for hot 60fps loop (avoid GC pressure)
  private readonly inputMap = new Map<string, InputState>();
  private readonly sendBundle: Array<{ frame: number; input: InputState }> = [];

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

    for (const { frame, input } of decoded.inputs) {
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
      const check = msg as any;
      if (!this.isHost && check.snapshot) {
        // Guest: apply host's authoritative state to correct any drift
        const localHash = hashGameState(this.gameLoop.getState(), this.gameLoop.getRng());
        if (check.hash !== localHash) {
          console.log(`[net] State sync from host at frame ${check.frame} (local hash ${localHash} != host hash ${check.hash})`);
          restoreSnapshot(check.snapshot, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());
          this.localFrame = check.frame;
        }
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
      const frameAdvantage = this.localFrame - this.remoteConfirmedFrame;
      if (frameAdvantage > MAX_ROLLBACK_FRAMES) {
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

    // Take snapshot before advancing
    this.snapshots[this.localFrame % MAX_ROLLBACK_FRAMES] =
      takeSnapshot(this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());

    // Advance simulation
    this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);

    // 6. Desync check
    if (this.localFrame > 0 && this.localFrame % DESYNC_CHECK_INTERVAL === 0) {
      this.sendDesyncCheck();
    }

    // 7. Adapt input delay based on RTT
    this.adaptInputDelay();

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
    if (!snap || snap.frame !== rollbackFrame) return;

    this.gameLoop.setAudioEnabled(false);
    restoreSnapshot(snap, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());

    // Resimulate from rollbackFrame to localFrame
    // Convention: snapshot[f] = state BEFORE tick f. We take snapshot, then tick.
    for (let f = rollbackFrame; f < this.localFrame; f++) {
      const bufIdx = f % BUFFER_SIZE;
      this.inputMap.clear();
      this.inputMap.set(this.localSlot, this.localInputs[bufIdx]);
      this.inputMap.set(this.remoteSlot, this.remoteInputs[bufIdx]);

      // Snapshot at f = state before tick f (already correct for rollbackFrame from restore)
      // For subsequent frames, capture state before ticking
      if (f > rollbackFrame) {
        this.snapshots[f % MAX_ROLLBACK_FRAMES] =
          takeSnapshot(f, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());
      }

      this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);
    }

    this.gameLoop.setAudioEnabled(true);
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
    // Bundle recent unacked inputs for redundancy (reuse array to avoid GC)
    this.sendBundle.length = 0;
    const startFrame = Math.max(0, frame - INPUT_BUNDLE_SIZE + 1);
    for (let f = startFrame; f <= frame; f++) {
      this.sendBundle.push({ frame: f, input: this.localInputs[f % BUFFER_SIZE] });
    }

    const msg = encodeInputMessage(this.sendBundle, this.remoteConfirmedFrame);
    this.transport.sendUnreliable(msg);
  }

  private getLastConfirmedRemoteInput(): InputState {
    if (this.remoteConfirmedFrame < 0) return NO_INPUT;
    return this.remoteInputs[this.remoteConfirmedFrame % BUFFER_SIZE];
  }

  private sendDesyncCheck(): void {
    if (this.isHost) {
      // Host sends authoritative state snapshot for guest to apply
      const snap = takeSnapshot(this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers());
      this.transport.sendReliable({
        type: MsgType.DESYNC_CHECK,
        frame: this.localFrame,
        hash: hashGameState(this.gameLoop.getState(), this.gameLoop.getRng()),
        rngState: this.gameLoop.getRng()?.getState() ?? 0,
        snapshot: snap,
      } as any);
    }
  }

  private adaptInputDelay(): void {
    const rtt = this.transport.currentRtt;
    if (rtt <= 0) return;
    const optimalDelay = Math.ceil(rtt / 2 / (FIXED_TIMESTEP * 1000));
    this.inputDelay = Math.max(1, Math.min(MAX_INPUT_DELAY, optimalDelay));
  }

  /** Get current stats for debug display. */
  getStats(): { localFrame: number; remoteConfirmedFrame: number; remoteLatestAck: number; rtt: number; inputDelay: number; stalled: boolean } {
    return {
      localFrame: this.localFrame,
      remoteConfirmedFrame: this.remoteConfirmedFrame,
      remoteLatestAck: this._remoteLatestAck,
      rtt: this.transport.currentRtt,
      inputDelay: this.inputDelay,
      stalled: this.stalled,
    };
  }
}
