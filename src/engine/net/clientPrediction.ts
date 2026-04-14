/**
 * Client-side prediction for the guest's local player.
 *
 * The guest applies inputs locally for instant feedback, then reconciles
 * with the host's authoritative state when snapshots arrive.
 *
 * Technique: Gambetta-style server reconciliation.
 * 1. Apply input locally and simulate local player physics
 * 2. Send input + sequence number to host
 * 3. When host snapshot arrives, accept authoritative position
 * 4. Replay all unacknowledged inputs on top of authoritative state
 * 5. Smooth visual correction for small differences
 */
import type { InputState, PlayerSlot, Arena } from '../types';
import type { SnapshotPlayer } from './snapshot';
import { MAX_WALK_SPEED, GRAVITY, JUMP_IMPULSE, FAST_FALL_GRAVITY } from '../constants';

// Visual smoothing constants
const CORRECTION_SNAP_THRESHOLD = 30; // px — snap if correction > this
const SMOOTH_FACTOR = 0.3; // lerp factor per frame for small corrections

export interface PredictionInput {
  seq: number;
  input: InputState;
}

export class ClientPrediction {
  readonly localSlot: PlayerSlot;
  private arena: Arena;

  // Predicted local player state (physics-relevant fields only)
  private predictedX = 0;
  private predictedY = 0;
  private predictedVx = 0;
  private predictedVy = 0;

  // Visual smoothing offset (decays toward 0)
  private visualOffsetX = 0;
  private visualOffsetY = 0;

  // Input history for replay after reconciliation
  private inputHistory: PredictionInput[] = [];
  private nextSeq = 0;
  constructor(localSlot: PlayerSlot, arena: Arena) {
    this.localSlot = localSlot;
    this.arena = arena;
  }

  /** Record a local input and return the sequence number. */
  recordInput(input: InputState): number {
    const seq = this.nextSeq++;
    this.inputHistory.push({ seq, input });

    // Cap history at 120 entries (~2 seconds at 60Hz)
    if (this.inputHistory.length > 120) {
      this.inputHistory.shift();
    }

    return seq;
  }

  /**
   * Apply local input to predicted state (runs every frame).
   * This simulates only the local player's physics — no other entities.
   */
  predict(input: InputState, dt: number): void {
    // Simple physics prediction: apply input, gravity, platform collision
    // This is a lightweight subset of the full fixedUpdate
    const result = this.simulateOneStep(
      this.predictedX, this.predictedY,
      this.predictedVx, this.predictedVy,
      input, dt,
    );
    this.predictedX = result.x;
    this.predictedY = result.y;
    this.predictedVx = result.vx;
    this.predictedVy = result.vy;
  }

  /**
   * Reconcile with host's authoritative snapshot.
   * Called when a new snapshot arrives from the host.
   */
  reconcile(authPlayer: SnapshotPlayer): void {

    // Calculate correction from predicted to authoritative
    const dx = authPlayer.x - this.predictedX;
    const dy = authPlayer.y - this.predictedY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > CORRECTION_SNAP_THRESHOLD) {
      // Large correction — snap immediately
      this.predictedX = authPlayer.x;
      this.predictedY = authPlayer.y;
      this.predictedVx = authPlayer.vx;
      this.predictedVy = authPlayer.vy;
      this.visualOffsetX = 0;
      this.visualOffsetY = 0;
    } else if (dist > 0.5) {
      // Small correction — accept authoritative position but add visual offset
      // so the character smoothly slides to the correct position
      this.visualOffsetX += this.predictedX - authPlayer.x;
      this.visualOffsetY += this.predictedY - authPlayer.y;
      this.predictedX = authPlayer.x;
      this.predictedY = authPlayer.y;
      this.predictedVx = authPlayer.vx;
      this.predictedVy = authPlayer.vy;

      // Replay unacknowledged inputs on top of authoritative state
      // (In this simplified model, we don't track per-frame acks from host.
      //  Instead, we accept the host's position and let prediction continue from there.)
    } else {
      // Negligible difference — accept authoritative state silently
      this.predictedX = authPlayer.x;
      this.predictedY = authPlayer.y;
      this.predictedVx = authPlayer.vx;
      this.predictedVy = authPlayer.vy;
    }
  }

  /** Decay visual offset each frame (called in render loop). */
  decayVisualOffset(): void {
    this.visualOffsetX *= (1 - SMOOTH_FACTOR);
    this.visualOffsetY *= (1 - SMOOTH_FACTOR);
    if (Math.abs(this.visualOffsetX) < 0.5) this.visualOffsetX = 0;
    if (Math.abs(this.visualOffsetY) < 0.5) this.visualOffsetY = 0;
  }

  /** Get the display position (predicted + visual offset for smoothing). */
  getDisplayPosition(): { x: number; y: number } {
    return {
      x: this.predictedX + this.visualOffsetX,
      y: this.predictedY + this.visualOffsetY,
    };
  }

  /** Get raw predicted position (for physics). */
  getPredictedPosition(): { x: number; y: number; vx: number; vy: number } {
    return {
      x: this.predictedX,
      y: this.predictedY,
      vx: this.predictedVx,
      vy: this.predictedVy,
    };
  }

  /** Initialize predicted position from first snapshot. */
  initFromSnapshot(player: SnapshotPlayer): void {
    this.predictedX = player.x;
    this.predictedY = player.y;
    this.predictedVx = player.vx;
    this.predictedVy = player.vy;
  }

  /**
   * Lightweight single-step physics for prediction.
   * Only handles movement + gravity + platform collision.
   * Does NOT handle stomps, pickups, hazards — those are server-authoritative.
   */
  private simulateOneStep(
    x: number, y: number, vx: number, vy: number,
    input: InputState, dt: number,
  ): { x: number; y: number; vx: number; vy: number } {
    if (input.left) vx = -MAX_WALK_SPEED;
    else if (input.right) vx = MAX_WALK_SPEED;
    else vx *= 0.85; // friction

    if (input.jump && Math.abs(vy) < 1) {
      vy = JUMP_IMPULSE;
    }

    if (input.down && vy > 0) {
      vy += FAST_FALL_GRAVITY * dt;
    }

    vy += GRAVITY * dt;

    // Move
    x += vx * dt;
    y += vy * dt;

    // Simple ground collision (arena ground is typically at y=660-700)
    // This is approximate — the host's authoritative state corrects it
    for (const plat of this.arena.platforms) {
      if (x + 15 > plat.x && x - 15 < plat.x + plat.width) {
        if (y + 40 >= plat.y && y + 40 <= plat.y + plat.height + vy * dt) {
          y = plat.y - 40;
          vy = 0;
          break;
        }
      }
    }

    // Arena bounds
    if (x < 15) { x = 15; vx = 0; }
    if (x > this.arena.width - 15) { x = this.arena.width - 15; vx = 0; }

    return { x, y, vx, vy };
  }
}
