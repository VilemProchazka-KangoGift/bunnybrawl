/**
 * GGPO-style rollback netcode engine.
 * Supports multiple remote players (multi-guest star topology).
 * Manages input buffers, predictions, snapshots, and resimulation.
 */
import type { InputState, PlayerSlot, Player } from '../types';
import type { GameLoop } from '../gameLoop';
import type { GameSnapshot } from './serialize';
import { takeSnapshot, restoreSnapshot, hashGameState, hashGameStateDetailed, hashSnapshot, takeSnapshotInto, createEmptySnapshot } from './serialize';
import { Transport } from './transport';
import {
  MsgType,
  encodeInputMessage, decodeInputMessage, decodeSlot,
} from './protocol';
import type { ReliableMessage, DesyncCheckMessage, DesyncRequestMessage, DesyncCorrectionMessage } from './protocol';
import { FIXED_TIMESTEP, STOMP_BOUNCE, SPLAT_DURATION } from '../constants';
import { isStomping } from '../stomp';

const BUFFER_SIZE = 128;          // ~2.1 seconds at 60fps
const MAX_ROLLBACK_FRAMES = 15;   // max frames we'll rewind (~250ms at 60fps)
const DEFAULT_INPUT_DELAY = 2;    // frames of local input delay
const MAX_INPUT_DELAY = 8;        // max adaptive delay (~133ms) — covers TURN relay RTT
const INPUT_BUNDLE_SIZE = 16;     // recent inputs to bundle per message (covers MAX_ROLLBACK_FRAMES + 1)
const DESYNC_CHECK_INTERVAL = 30; // frames between state sync checks (0.5s)
const STALL_TIMEOUT_MS = 8000;    // disconnect after 8s of stall

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

// Visual correction smoothing constants
const RENDER_OFFSET_DECAY = 0.7;
const RENDER_OFFSET_MIN = 0.5;
const CORRECTION_SNAP_DISTANCE = 30;
const STOMP_PRESERVE_THRESHOLD_SQ = 25 * 25; // preserve stomp if both players corrected < 25px
const STOMP_PRESERVE_MARGIN_H = 8;     // extra horizontal margin for generous stomp check
const STOMP_PRESERVE_MARGIN_TOP = 10;  // extra vertical margin above victim's top
const STATS_RESET_INTERVAL = 60;

export interface NetDebugStats {
  localFrame: number;
  remoteConfirmedFrame: number; // min across all remotes
  remoteLatestAck: number;
  rtt: number;
  jitter: number;
  inputDelay: number;
  stalled: boolean;
  rollbacksPerSec: number;
  maxRollbackDepth: number;
  isRelay: boolean;
  desyncChecks: number;      // total hash checks performed
  desyncMismatches: number;  // total hash mismatches detected
  desyncCorrections: number; // total corrections applied
  lastDesyncFrame: number;   // frame of last detected mismatch (-1 if none)
  lastDesyncSubsystem: string; // which subsystem diverged ('players', 'entities', 'timers', '')
}

/** Per-remote-slot input tracking state. */
interface RemoteSlotState {
  inputs: InputState[];
  confirmed: boolean[];
  confirmedFrame: number;
  latestAck: number;
  disconnected: boolean;
}

export interface RollbackConfig {
  localSlot: PlayerSlot;
  remoteSlots: PlayerSlot[];
  isHost: boolean;
  gameLoop: GameLoop;
  transport: Transport;
  onDesync?: (localHash: number, remoteHash: number, frame: number) => void;
  onStall?: (stalled: boolean) => void;
  onStallTimeout?: () => void;
  onPlayerDisconnect?: (slot: PlayerSlot) => void;
}

export class RollbackEngine {
  private localSlot: PlayerSlot;
  private remoteSlots: PlayerSlot[];
  private remoteState: Map<PlayerSlot, RemoteSlotState> = new Map();
  private isHost: boolean;
  private gameLoop: GameLoop;
  private transport: Transport;

  // Local input buffer (ring buffer, indexed by frame % BUFFER_SIZE)
  private localInputs: InputState[] = new Array(BUFFER_SIZE);

  // Frame tracking
  private localFrame = 0;
  private lastSyncedFrame = -1;

  // Snapshot ring buffer (pre-allocated)
  private snapshots: GameSnapshot[] = Array.from({ length: MAX_ROLLBACK_FRAMES }, () => createEmptySnapshot());

  // Input delay (adaptive)
  private inputDelay = DEFAULT_INPUT_DELAY;

  // Timing
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private rafId = 0;
  private stalled = false;
  private stallStartTime = 0;

  // Rollback stats (for debug overlay)
  private rollbackCount = 0;
  private rollbackCountPerSec = 0;
  private maxRollbackDepth = 0;
  private maxRollbackDepthPerSec = 0;
  private statsResetFrame = 0;
  private _cachedMinRemoteFrame = -1; // cached per-frame to avoid repeated Map iteration
  private _rollbackOccurredThisFrame = false;
  private lastDesyncCheckFrame = -999; // frame of last desync check (cooldown for post-rollback checks)

  // Reusable objects for hot 60fps loop
  private readonly inputMap = new Map<string, InputState>();
  private readonly sendBundle: Array<{ frame: number; input: InputState }> = Array.from(
    { length: INPUT_BUNDLE_SIZE },
    () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
  );
  private readonly preRollbackX: number[] = [];
  private readonly preRollbackY: number[] = [];
  private readonly preRollbackState: string[] = [];    // PlayerState before rollback
  private readonly preRollbackScore: number[] = [];    // score before rollback
  private _desyncChecks = 0;
  private _desyncMismatches = 0;
  private _desyncCorrections = 0;
  private _lastDesyncFrame = -1;
  private _lastDesyncSubsystem = '';
  private readonly _statsCache: NetDebugStats = {
    localFrame: 0, remoteConfirmedFrame: 0, remoteLatestAck: 0,
    rtt: 0, jitter: 0, inputDelay: 0, stalled: false,
    rollbacksPerSec: 0, maxRollbackDepth: 0, isRelay: false,
    desyncChecks: 0, desyncMismatches: 0, desyncCorrections: 0,
    lastDesyncFrame: -1, lastDesyncSubsystem: '',
  };

  // Callbacks
  private onStall?: (stalled: boolean) => void;
  private onStallTimeout?: () => void;
  private onPlayerDisconnect?: (slot: PlayerSlot) => void;

  constructor(config: RollbackConfig) {
    this.localSlot = config.localSlot;
    this.remoteSlots = [...config.remoteSlots];
    this.isHost = config.isHost;
    this.gameLoop = config.gameLoop;
    this.transport = config.transport;
    this.onStall = config.onStall;
    this.onStallTimeout = config.onStallTimeout;
    this.onPlayerDisconnect = config.onPlayerDisconnect;

    // Fill local input buffer
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this.localInputs[i] = { ...NO_INPUT };
    }

    // Initialize per-remote-slot state
    for (const slot of this.remoteSlots) {
      this.initRemoteSlot(slot);
    }
  }

  private initRemoteSlot(slot: PlayerSlot): void {
    const inputs = new Array<InputState>(BUFFER_SIZE);
    const confirmed = new Array<boolean>(BUFFER_SIZE);
    for (let i = 0; i < BUFFER_SIZE; i++) {
      inputs[i] = { ...NO_INPUT };
      confirmed[i] = false;
    }
    this.remoteState.set(slot, {
      inputs,
      confirmed,
      confirmedFrame: -1,
      latestAck: -1,
      disconnected: false,
    });
  }

  /** Add a new remote slot (for late-joining players). */
  addRemoteSlot(slot: PlayerSlot): void {
    if (this.remoteState.has(slot)) return;
    this.remoteSlots.push(slot);
    this.initRemoteSlot(slot);
  }

  /** Remove a remote slot (player disconnected mid-match). Stop expecting their inputs. */
  removeRemoteSlot(slot: PlayerSlot): void {
    const state = this.remoteState.get(slot);
    if (!state) return;
    state.disconnected = true;
    // Set confirmed frame to localFrame so this slot never causes stall
    state.confirmedFrame = this.localFrame;
    this.onPlayerDisconnect?.(slot);
  }

  /** Get the minimum confirmed frame across all active (non-disconnected) remote slots. */
  private getMinRemoteConfirmedFrame(): number {
    let minFrame = Infinity;
    let anyActive = false;
    for (const state of this.remoteState.values()) {
      if (state.disconnected) continue;
      anyActive = true;
      if (state.confirmedFrame < minFrame) minFrame = state.confirmedFrame;
    }
    return anyActive ? minFrame : this.localFrame;
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

  /** Process incoming remote input message. Routes by source slot. */
  handleInputMessage(data: ArrayBuffer): void {
    const decoded = decodeInputMessage(data);
    if (!decoded) {
      console.warn('[net] Failed to decode input message');
      return;
    }

    const sourceSlot = decodeSlot(decoded.source) as PlayerSlot;

    // Find the remote state for this source
    let remState = this.remoteState.get(sourceSlot);
    if (!remState) {
      // Unknown slot — might be a relay from host for a slot we don't track yet
      // In 1v1 mode, try the first remote slot as fallback
      if (this.remoteSlots.length === 1) {
        remState = this.remoteState.get(this.remoteSlots[0]);
      }
      if (!remState) return;
    }

    // NETCODE SAFETY: Overwriting inputs between confirmedFrame and localFrame is correct —
    // a newer confirmed input replacing a prediction is the desired behavior. Duplicate
    // messages for already-confirmed frames are skipped by the guard below.
    for (let i = 0; i < decoded.inputCount; i++) {
      const { frame, input } = decoded.inputs[i];
      if (frame < this.localFrame - BUFFER_SIZE) continue;
      if (frame > this.localFrame + BUFFER_SIZE) continue;

      const bufIdx = frame % BUFFER_SIZE;

      if (remState.confirmed[bufIdx] && frame <= remState.confirmedFrame) continue;

      remState.inputs[bufIdx] = input;
      remState.confirmed[bufIdx] = true;

      if (frame > remState.confirmedFrame) {
        remState.confirmedFrame = frame;
      }
    }

    remState.latestAck = decoded.latestAck;
  }

  /** Process a reliable message (desync check / state sync). */
  handleReliableMessage(msg: ReliableMessage): void {
    if (msg.type === MsgType.DESYNC_CHECK) {
      if (!this.isHost) {
        const check = msg as DesyncCheckMessage;
        // Use snapshot at host's frame for frame-correct comparison.
        // Fall back to current-state comparison when snapshot is overwritten (common
        // since desync check interval > snapshot ring buffer). The ±1 frame tolerance
        // causes some false positives (timeElapsed differs by FIXED_TIMESTEP) but this
        // is preferable to never detecting real desyncs.
        const cached = this.snapshots[check.frame % MAX_ROLLBACK_FRAMES];
        let localHash: number;
        if (cached.frame === check.frame) {
          localHash = hashSnapshot(cached);
        } else if (Math.abs(this.localFrame - check.frame) <= 1) {
          // Guest is at or very near host frame — compare current state
          localHash = hashGameState(this.gameLoop.getState(), this.gameLoop.getRng());
        } else {
          // Snapshot overwritten and frames too far apart — skip this check
          return;
        }
        this._desyncChecks++;
        if (check.hash !== localHash) {
          this._desyncMismatches++;
          this._lastDesyncFrame = check.frame;
          // Identify diverged subsystem via detailed hash if available
          if (check.playersHash !== undefined) {
            const detailed = hashGameStateDetailed(this.gameLoop.getState(), this.gameLoop.getRng());
            const parts: string[] = [];
            if (check.playersHash !== detailed.playersHash) parts.push('players');
            if (check.entitiesHash !== detailed.entitiesHash) parts.push('entities');
            if (check.timersHash !== detailed.timersHash) parts.push('timers');
            this._lastDesyncSubsystem = parts.join('+') || 'composite';
            console.log(`[net] Hash mismatch at frame ${check.frame} (local ${localHash} != host ${check.hash}) diverged: ${this._lastDesyncSubsystem}`);
          } else {
            console.log(`[net] Hash mismatch at frame ${check.frame} (local ${localHash} != host ${check.hash})`);
          }
          const req: DesyncRequestMessage = { type: MsgType.DESYNC_REQUEST, frame: check.frame };
          this.transport.sendReliable(req);
        }
      }
    } else if (msg.type === MsgType.DESYNC_REQUEST) {
      if (this.isHost) {
        const reqFrame = (msg as DesyncRequestMessage).frame;
        const cached = this.snapshots[reqFrame % MAX_ROLLBACK_FRAMES];
        let snap: GameSnapshot;
        let correctionFrame: number;
        if (cached.frame === reqFrame) {
          snap = cached;
          correctionFrame = reqFrame;
        } else {
          snap = takeSnapshot(this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers(), this.gameLoop.getAiRng());
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
      if (!this.isHost) {
        const correction = msg as DesyncCorrectionMessage;
        this._desyncCorrections++;
        console.log(`[net] Applying host correction at frame ${correction.frame} (localFrame was ${this.localFrame}, delta=${this.localFrame - correction.frame})`);
        restoreSnapshot(correction.snapshot as GameSnapshot, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers(), this.gameLoop.getAiRng());
        this.localFrame = correction.frame;
      }
    }
  }

  private networkLoop = (currentTime: number): void => {
    if (!this.running) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    this.accumulator += dt;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this._cachedMinRemoteFrame = this.getMinRemoteConfirmedFrame();
      const minRemoteFrame = this._cachedMinRemoteFrame;
      const frameAdvantage = this.localFrame - minRemoteFrame;

      // Skip stall during startup grace period (no inputs received yet from any remote)
      if (minRemoteFrame >= 0 && frameAdvantage >= MAX_ROLLBACK_FRAMES) {
        if (!this.stalled) {
          this.stalled = true;
          this.stallStartTime = performance.now();
          this.onStall?.(true);
        }
        // Stall timeout: end match if stalled too long
        if (performance.now() - this.stallStartTime > STALL_TIMEOUT_MS) {
          this.onStallTimeout?.();
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

    // Render
    this.gameLoop.renderFrame(dt);

    this.rafId = requestAnimationFrame(this.networkLoop);
  };

  private advanceFrame(): void {
    // 1. Read local input (delayed)
    const localInput = this.readLocalInput();
    const delayedFrame = this.localFrame + this.inputDelay;
    this.localInputs[delayedFrame % BUFFER_SIZE] = localInput;

    // 2. Send local input (bundled with recent unacked)
    // NETCODE SAFETY: sendInput runs BEFORE checkRollback. This is correct because
    // resimulation in checkRollback only calls fixedUpdate with buffered inputs — it
    // never calls sendInput or readLocalInput. One input is sent per advanceFrame call.
    this.sendInput(delayedFrame, localInput);

    // 3. Check for mispredictions and rollback if needed
    this.checkRollback();

    // 4. Predict remote inputs for current frame if not confirmed
    const bufIdx = this.localFrame % BUFFER_SIZE;
    for (const [, remState] of this.remoteState) {
      if (remState.disconnected) continue;
      if (!remState.confirmed[bufIdx]) {
        remState.inputs[bufIdx] = this.getLastConfirmedInput(remState);
      }
    }

    // 5. Build input map and advance
    this.inputMap.clear();
    this.inputMap.set(this.localSlot, this.localInputs[this.localFrame % BUFFER_SIZE]);
    for (const [slot, remState] of this.remoteState) {
      if (remState.disconnected) {
        this.inputMap.set(slot, NO_INPUT);
      } else {
        this.inputMap.set(slot, remState.inputs[bufIdx]);
      }
    }

    // Take snapshot before advancing (in-place)
    takeSnapshotInto(
      this.snapshots[this.localFrame % MAX_ROLLBACK_FRAMES],
      this.localFrame, this.gameLoop.getState(), this.gameLoop.getRng(), this.gameLoop.getAIControllers(), this.gameLoop.getAiRng(),
    );

    // Advance simulation
    this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);

    // Decay visual correction offsets
    for (const p of this.gameLoop.getState().players) {
      p.renderOffsetX *= RENDER_OFFSET_DECAY;
      p.renderOffsetY *= RENDER_OFFSET_DECAY;
      if (Math.abs(p.renderOffsetX) < RENDER_OFFSET_MIN) p.renderOffsetX = 0;
      if (Math.abs(p.renderOffsetY) < RENDER_OFFSET_MIN) p.renderOffsetY = 0;
    }

    // 6. Desync check — regular interval + tighter checks early match + post-rollback
    const isRegularCheck = this.localFrame > 0 && this.localFrame % DESYNC_CHECK_INTERVAL === 0;
    const isEarlyMatchCheck = this.localFrame > 0 && this.localFrame < 300 && this.localFrame % 10 === 0;
    const isPostRollbackCheck = this._rollbackOccurredThisFrame && (this.localFrame - this.lastDesyncCheckFrame >= 5);
    if (isRegularCheck || isEarlyMatchCheck || isPostRollbackCheck) {
      this.sendDesyncCheck();
    }
    this._rollbackOccurredThisFrame = false;

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
    // Find earliest frame with new confirmed input across any remote slot
    const minSyncedFrame = this.lastSyncedFrame;
    let earliestNewConfirm = Infinity;

    for (const remState of this.remoteState.values()) {
      if (remState.disconnected) continue;
      if (remState.confirmedFrame > minSyncedFrame && remState.confirmedFrame < earliestNewConfirm) {
        earliestNewConfirm = remState.confirmedFrame;
      }
    }

    // No new confirmed inputs
    if (earliestNewConfirm === Infinity) return;

    // Find the earliest frame that needs resimulation
    let rollbackFrame = -1;
    for (let f = Math.max(0, minSyncedFrame + 1, this.localFrame - MAX_ROLLBACK_FRAMES); f < this.localFrame; f++) {
      const bufIdx = f % BUFFER_SIZE;
      let hasNewConfirm = false;
      for (const remState of this.remoteState.values()) {
        if (remState.disconnected) continue;
        if (remState.confirmed[bufIdx]) {
          hasNewConfirm = true;
          break;
        }
      }
      if (hasNewConfirm) {
        const snap = this.snapshots[f % MAX_ROLLBACK_FRAMES];
        if (snap.frame === f) {
          rollbackFrame = f;
          break;
        }
      }
    }

    if (rollbackFrame < 0) {
      // Update synced frame to min confirmed across all remotes
      this.lastSyncedFrame = Math.max(this.lastSyncedFrame, this._cachedMinRemoteFrame);
      return;
    }

    const snap = this.snapshots[rollbackFrame % MAX_ROLLBACK_FRAMES];
    if (snap.frame !== rollbackFrame) return;

    // Track rollback stats
    const depth = this.localFrame - rollbackFrame;
    this.rollbackCount++;
    if (depth > this.maxRollbackDepth) this.maxRollbackDepth = depth;

    // Capture pre-rollback state for visual smoothing + stomp preservation
    const state = this.gameLoop.getState();
    for (let i = 0; i < state.players.length; i++) {
      this.preRollbackX[i] = state.players[i].x;
      this.preRollbackY[i] = state.players[i].y;
      this.preRollbackState[i] = state.players[i].state;
      this.preRollbackScore[i] = state.players[i].score;
    }

    this.gameLoop.setAudioEnabled(false);
    this.gameLoop.setResimulating(true);
    restoreSnapshot(snap, state, this.gameLoop.getRng(), this.gameLoop.getAIControllers(), this.gameLoop.getAiRng());

    // Resimulate
    for (let f = rollbackFrame; f < this.localFrame; f++) {
      const bufIdx = f % BUFFER_SIZE;
      this.inputMap.clear();
      this.inputMap.set(this.localSlot, this.localInputs[bufIdx]);
      for (const [slot, remState] of this.remoteState) {
        if (remState.disconnected) {
          this.inputMap.set(slot, NO_INPUT);
        } else {
          this.inputMap.set(slot, remState.inputs[bufIdx]);
        }
      }

      if (f > rollbackFrame) {
        takeSnapshotInto(
          this.snapshots[f % MAX_ROLLBACK_FRAMES],
          f, state, this.gameLoop.getRng(), this.gameLoop.getAIControllers(), this.gameLoop.getAiRng(),
        );
      }

      this.gameLoop.fixedUpdate(FIXED_TIMESTEP, this.inputMap);
    }

    this.gameLoop.setAudioEnabled(true);
    this.gameLoop.setResimulating(false);
    this._rollbackOccurredThisFrame = true;

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
    // Stomp preservation: if a kill was predicted before rollback but undone after,
    // and BOTH attacker and victim had small position corrections, re-apply the stomp.
    // This prevents "phantom misses" where visually-identical positions produce different stomp outcomes.
    for (let vi = 0; vi < state.players.length; vi++) {
      const victim = state.players[vi];
      // Was splatted before, alive now? → stomp was undone by rollback
      if (this.preRollbackState[vi] === 'splat' && victim.state !== 'splat' && victim.state !== 'respawning') {
        // Check victim's position correction
        const vdx = this.preRollbackX[vi] - victim.x;
        const vdy = this.preRollbackY[vi] - victim.y;
        if (vdx * vdx + vdy * vdy > STOMP_PRESERVE_THRESHOLD_SQ) continue;

        // Find who had higher score before (the attacker)
        for (let ai = 0; ai < state.players.length; ai++) {
          if (ai === vi) continue;
          const attacker = state.players[ai];
          // Attacker gained score before rollback but not after
          if (this.preRollbackScore[ai] <= attacker.score) continue;

          // Check attacker's position correction
          const adx = this.preRollbackX[ai] - attacker.x;
          const ady = this.preRollbackY[ai] - attacker.y;
          if (adx * adx + ady * ady > STOMP_PRESERVE_THRESHOLD_SQ) continue;

          // Both corrections are small — check if stomp geometry is still plausible
          // Use corrected positions with generous check
          if (isStomping(attacker, victim) || this.isNearStomp(attacker, victim)) {
            // Re-apply the stomp with full visual feedback
            victim.state = 'splat';
            victim.splatTimer = SPLAT_DURATION;
            victim.vx = 0;
            victim.vy = 0;
            attacker.vy = STOMP_BOUNCE;
            attacker.score += 2;
            state.killFeed.push({ attacker: attacker.id, victim: victim.id, timestamp: state.timeElapsed });
            break;
          }
        }
      }
    }

    this.lastSyncedFrame = Math.max(this.lastSyncedFrame, this._cachedMinRemoteFrame);
  }

  /** Generous stomp check — wider than normal, used for stomp preservation after rollback. */
  private isNearStomp(attacker: Player, victim: Player): boolean {
    const overlapX = attacker.x + attacker.width + STOMP_PRESERVE_MARGIN_H > victim.x - STOMP_PRESERVE_MARGIN_H &&
                     attacker.x - STOMP_PRESERVE_MARGIN_H < victim.x + victim.width + STOMP_PRESERVE_MARGIN_H;
    if (!overlapX) return false;

    const attackerBottom = attacker.y + attacker.height;
    const overlap = attackerBottom - victim.y;
    return overlap > -STOMP_PRESERVE_MARGIN_TOP && overlap < victim.height * 0.6;
  }

  private readLocalInput(): InputState {
    try {
      return this.gameLoop.getInputAny();
    } catch {
      return NO_INPUT;
    }
  }

  private sendInput(frame: number, _input: InputState): void {
    const startFrame = Math.max(0, frame - INPUT_BUNDLE_SIZE + 1);
    const count = frame - startFrame + 1;
    for (let i = 0; i < count; i++) {
      const f = startFrame + i;
      this.sendBundle[i].frame = f;
      this.sendBundle[i].input = this.localInputs[f % BUFFER_SIZE];
    }
    const msg = encodeInputMessage(this.sendBundle, this._cachedMinRemoteFrame, count, this.localSlot);
    this.transport.sendUnreliable(msg);
  }

  private getLastConfirmedInput(remState: RemoteSlotState): InputState {
    if (remState.confirmedFrame < 0) return NO_INPUT;
    return remState.inputs[remState.confirmedFrame % BUFFER_SIZE];
  }

  private sendDesyncCheck(): void {
    if (this.isHost) {
      const detailed = hashGameStateDetailed(this.gameLoop.getState(), this.gameLoop.getRng());
      const check: DesyncCheckMessage = {
        type: MsgType.DESYNC_CHECK,
        frame: this.localFrame,
        hash: detailed.hash,
        rngState: this.gameLoop.getRng()?.getState() ?? 0,
        playersHash: detailed.playersHash,
        entitiesHash: detailed.entitiesHash,
        timersHash: detailed.timersHash,
      };
      this.transport.sendReliable(check);
      this.lastDesyncCheckFrame = this.localFrame;
    }
  }

  private adaptInputDelay(): void {
    const rtt = this.transport.currentRtt;
    if (rtt <= 0) return;
    const tickMs = FIXED_TIMESTEP * 1000;
    const rttFrames = Math.ceil(rtt / 2 / tickMs);
    const jitterPad = Math.min(Math.ceil(this.transport.currentJitter / tickMs), 2);
    const target = Math.max(1, Math.min(MAX_INPUT_DELAY, rttFrames + jitterPad));
    if (target > this.inputDelay || target < this.inputDelay - 1) {
      this.inputDelay = target;
    }
  }

  /** Get current stats for debug display (returns cached object — no allocation). */
  getStats(): NetDebugStats {
    const s = this._statsCache;
    s.localFrame = this.localFrame;
    s.remoteConfirmedFrame = this._cachedMinRemoteFrame;
    s.remoteLatestAck = -1;
    for (const remState of this.remoteState.values()) {
      if (!remState.disconnected && remState.latestAck > s.remoteLatestAck) {
        s.remoteLatestAck = remState.latestAck;
      }
    }
    s.rtt = this.transport.currentRtt;
    s.jitter = this.transport.currentJitter;
    s.inputDelay = this.inputDelay;
    s.stalled = this.stalled;
    s.rollbacksPerSec = this.rollbackCountPerSec;
    s.maxRollbackDepth = this.maxRollbackDepthPerSec;
    s.isRelay = this.transport.isRelay;
    s.desyncChecks = this._desyncChecks;
    s.desyncMismatches = this._desyncMismatches;
    s.desyncCorrections = this._desyncCorrections;
    s.lastDesyncFrame = this._lastDesyncFrame;
    s.lastDesyncSubsystem = this._lastDesyncSubsystem;
    return s;
  }
}
