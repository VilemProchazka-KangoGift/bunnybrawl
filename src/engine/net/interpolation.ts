/**
 * Entity interpolation for remote players and world state on guest clients.
 *
 * Guests render remote entities between two known host snapshots,
 * producing smooth movement even when snapshots arrive irregularly.
 *
 * Design based on DDNet's IntraGameTick system:
 * - Buffer the two most recent snapshots
 * - Render at a position interpolated between them
 * - Effectively shows the game ~1-2 frames behind the host
 * - On gaps: brief extrapolation, then freeze
 */
import type { PlayerSlot, MatchState } from '../types';
import type { AuthSnapshot, SnapshotPlayer } from './snapshot';

// (INTERP_BUFFER_SIZE and MAX_EXTRAP_MS reserved for future tuning)

export interface InterpolatedPlayer {
  id: PlayerSlot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: SnapshotPlayer['state'];
  facing: SnapshotPlayer['facing'];
  animFrame: number;
  score: number;
  hitstopTimer: number;
  invincibleTimer: number;
  fastFalling: boolean;
  splatTimer: number;
  respawnTimer: number;
  fatTimer: number;
  slowTimer: number;
  burnTimer: number;
  squashScale: number;
  expression: SnapshotPlayer['expression'];
  killStreak: number;
  disconnected: boolean;
  active: boolean;
  width: number;
  height: number;
}

export class EntityInterpolation {
  // Snapshot buffer (ring)
  private snapshots: AuthSnapshot[] = [];
  private maxSnapshots = 30; // ~0.5s at 60Hz

  // Current interpolation time
  private renderTime = 0;
  // (serverTimeOffset reserved for future adaptive sync)
  private initialized = false;

  // Interpolation delay in frames (trades latency for smoothness)
  private interpDelay = 2; // render 2 frames behind latest snapshot

  // Last interpolated state for rendering
  private lastInterpolated: AuthSnapshot | null = null;

  /** Push a new snapshot from the host. */
  pushSnapshot(snap: AuthSnapshot, _receiveTime?: number): void {
    this.snapshots.push(snap);

    // Trim old snapshots
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Calibrate time offset from first snapshot
    if (!this.initialized && this.snapshots.length >= 2) {
      this.initialized = true;
      // Set render time to be interpDelay frames behind the latest snapshot
      this.renderTime = snap.frame - this.interpDelay;
    } else if (this.initialized) {
      // Track the latest server frame and stay interpDelay behind
      this.renderTime = snap.frame - this.interpDelay;
    }
  }

  /**
   * Get the interpolated state at the current render time.
   * Returns null if not enough snapshots buffered yet.
   */
  getInterpolatedState(): AuthSnapshot | null {
    if (this.snapshots.length < 2) return this.snapshots[0] ?? null;

    const targetFrame = this.renderTime;

    // Find the two snapshots that bracket the target frame
    let before: AuthSnapshot | null = null;
    let after: AuthSnapshot | null = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].frame <= targetFrame && this.snapshots[i + 1].frame >= targetFrame) {
        before = this.snapshots[i];
        after = this.snapshots[i + 1];
        break;
      }
    }

    // If target is before all snapshots, use earliest
    if (!before && this.snapshots.length > 0) {
      return this.snapshots[0];
    }

    // If target is after all snapshots, use latest (slight extrapolation)
    if (!after) {
      return this.snapshots[this.snapshots.length - 1];
    }

    if (!before) return after;

    // Interpolation factor (0 = before, 1 = after)
    const range = after.frame - before.frame;
    const t = range > 0 ? (targetFrame - before.frame) / range : 0;
    const alpha = Math.max(0, Math.min(1, t));

    this.lastInterpolated = this.interpolateSnapshots(before, after, alpha);
    return this.lastInterpolated;
  }

  /** Get the latest raw snapshot (no interpolation). */
  getLatestSnapshot(): AuthSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /** Get all buffered snapshots (for debug display). */
  getBufferDepth(): number {
    return this.snapshots.length;
  }

  /** Interpolate between two snapshots. */
  private interpolateSnapshots(a: AuthSnapshot, b: AuthSnapshot, t: number): AuthSnapshot {
    return {
      frame: Math.round(a.frame + (b.frame - a.frame) * t),
      players: this.interpolatePlayers(a.players, b.players, t),
      // Entities: use the "after" snapshot for discrete state (spawn/despawn)
      carrots: b.carrots,
      springs: b.springs,
      thorns: b.thorns,
      ghosts: this.interpolateGhosts(a.ghosts, b.ghosts, t),
      lavaRocks: this.interpolateLavaRocks(a.lavaRocks, b.lavaRocks, t),
      geyserStates: b.geyserStates,
      killFeed: b.killFeed,
      timeElapsed: lerp(a.timeElapsed, b.timeElapsed, t),
      countdown: lerp(a.countdown, b.countdown, t),
      dayPhase: lerp(a.dayPhase, b.dayPhase, t),
      matchOver: b.matchOver,
      winner: b.winner,
      screenShake: lerp(a.screenShake, b.screenShake, t),
      slowMotion: lerp(a.slowMotion, b.slowMotion, t),
      screenFlash: lerp(a.screenFlash, b.screenFlash, t),
      hitstopZoom: lerp(a.hitstopZoom, b.hitstopZoom, t),
      scoreAnimations: b.scoreAnimations,
    };
  }

  /** Interpolate player positions between two snapshot states. */
  private interpolatePlayers(a: SnapshotPlayer[], b: SnapshotPlayer[], t: number): SnapshotPlayer[] {
    return b.map(bp => {
      const ap = a.find(p => p.id === bp.id);
      if (!ap) return bp; // New player, no interpolation

      return {
        ...bp,
        // Interpolate continuous values
        x: lerp(ap.x, bp.x, t),
        y: lerp(ap.y, bp.y, t),
        vx: lerp(ap.vx, bp.vx, t),
        vy: lerp(ap.vy, bp.vy, t),
        // Discrete values: use "after" snapshot
        state: bp.state,
        facing: bp.facing,
        animFrame: bp.animFrame,
        expression: bp.expression,
      };
    });
  }

  private interpolateGhosts(
    a: AuthSnapshot['ghosts'],
    b: AuthSnapshot['ghosts'],
    t: number,
  ): AuthSnapshot['ghosts'] {
    // Match ghosts by index (they don't have IDs)
    return b.map((bg, i) => {
      const ag = a[i];
      if (!ag) return bg;
      return {
        x: lerp(ag.x, bg.x, t),
        y: lerp(ag.y, bg.y, t),
        vx: lerp(ag.vx, bg.vx, t),
        wobblePhase: lerp(ag.wobblePhase, bg.wobblePhase, t),
      };
    });
  }

  private interpolateLavaRocks(
    a: AuthSnapshot['lavaRocks'],
    b: AuthSnapshot['lavaRocks'],
    t: number,
  ): AuthSnapshot['lavaRocks'] {
    return b.map((br, i) => {
      const ar = a[i];
      if (!ar) return br;
      return {
        x: lerp(ar.x, br.x, t),
        y: lerp(ar.y, br.y, t),
        vy: lerp(ar.vy, br.vy, t),
        active: br.active,
      };
    });
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Apply an AuthSnapshot to a MatchState for rendering on the guest.
 * Updates player positions, entity positions, and global state.
 * Does NOT create new Player objects — updates existing ones in-place.
 */
export function applySnapshotToState(snap: AuthSnapshot, state: MatchState): void {
  // Update players
  for (const sp of snap.players) {
    const player = state.players.find(p => p.id === sp.id);
    if (!player) continue;

    player.x = sp.x;
    player.y = sp.y;
    player.vx = sp.vx;
    player.vy = sp.vy;
    player.state = sp.state;
    player.facing = sp.facing;
    player.animFrame = sp.animFrame;
    player.score = sp.score;
    player.hitstopTimer = sp.hitstopTimer;
    player.invincibleTimer = sp.invincibleTimer;
    player.fastFalling = sp.fastFalling;
    player.splatTimer = sp.splatTimer;
    player.respawnTimer = sp.respawnTimer;
    player.fatTimer = sp.fatTimer;
    player.slowTimer = sp.slowTimer;
    player.burnTimer = sp.burnTimer;
    player.squashScale = sp.squashScale;
    player.expression = sp.expression;
    player.killStreak = sp.killStreak;
    player.disconnected = sp.disconnected;
    player.active = sp.active;
    player.width = sp.width;
    player.height = sp.height;
  }

  // Update global state
  state.timeElapsed = snap.timeElapsed;
  state.countdown = snap.countdown;
  state.dayPhase = snap.dayPhase;
  state.matchOver = snap.matchOver;
  state.winner = snap.winner;
  state.screenShake = snap.screenShake;
  state.slowMotion = snap.slowMotion;
  state.screenFlash = snap.screenFlash;
  state.hitstopZoom = snap.hitstopZoom;
  state.killFeed = snap.killFeed;
  state.scoreAnimations = snap.scoreAnimations;

  // Update entities — resize arrays to match snapshot
  // Carrots
  while (state.carrots.length > snap.carrots.length) state.carrots.pop();
  for (let i = 0; i < snap.carrots.length; i++) {
    if (i >= state.carrots.length) {
      state.carrots.push({ x: snap.carrots[i].x, y: snap.carrots[i].y, active: snap.carrots[i].active, spawnTime: 0 });
    } else {
      state.carrots[i].x = snap.carrots[i].x;
      state.carrots[i].y = snap.carrots[i].y;
      state.carrots[i].active = snap.carrots[i].active;
    }
  }

  // Springs
  while (state.springs.length > snap.springs.length) state.springs.pop();
  for (let i = 0; i < snap.springs.length; i++) {
    if (i >= state.springs.length) {
      state.springs.push({
        x: snap.springs[i].x, y: snap.springs[i].y,
        platformIndex: 0, bounceTimer: snap.springs[i].bounceTimer,
        life: snap.springs[i].life, growTimer: snap.springs[i].growTimer,
      });
    } else {
      state.springs[i].x = snap.springs[i].x;
      state.springs[i].y = snap.springs[i].y;
      state.springs[i].bounceTimer = snap.springs[i].bounceTimer;
      state.springs[i].life = snap.springs[i].life;
      state.springs[i].growTimer = snap.springs[i].growTimer;
    }
  }

  // Thorns
  while (state.thorns.length > snap.thorns.length) state.thorns.pop();
  for (let i = 0; i < snap.thorns.length; i++) {
    if (i >= state.thorns.length) {
      state.thorns.push({
        x: snap.thorns[i].x, y: snap.thorns[i].y,
        width: 20, height: 20, platformIndex: 0,
        life: snap.thorns[i].life, growTimer: snap.thorns[i].growTimer,
        hit: snap.thorns[i].hit,
      });
    } else {
      state.thorns[i].x = snap.thorns[i].x;
      state.thorns[i].y = snap.thorns[i].y;
      state.thorns[i].life = snap.thorns[i].life;
      state.thorns[i].growTimer = snap.thorns[i].growTimer;
      state.thorns[i].hit = snap.thorns[i].hit;
    }
  }

  // Ghosts
  while (state.ghosts.length > snap.ghosts.length) state.ghosts.pop();
  for (let i = 0; i < snap.ghosts.length; i++) {
    if (i >= state.ghosts.length) {
      state.ghosts.push({
        x: snap.ghosts[i].x, y: snap.ghosts[i].y,
        vx: snap.ghosts[i].vx, size: 30, alpha: 0.6,
        wobblePhase: snap.ghosts[i].wobblePhase,
      });
    } else {
      state.ghosts[i].x = snap.ghosts[i].x;
      state.ghosts[i].y = snap.ghosts[i].y;
      state.ghosts[i].vx = snap.ghosts[i].vx;
      state.ghosts[i].wobblePhase = snap.ghosts[i].wobblePhase;
    }
  }

  // Lava rocks
  while (state.lavaRocks.length > snap.lavaRocks.length) state.lavaRocks.pop();
  for (let i = 0; i < snap.lavaRocks.length; i++) {
    if (i >= state.lavaRocks.length) {
      state.lavaRocks.push({
        x: snap.lavaRocks[i].x, y: snap.lavaRocks[i].y,
        vy: snap.lavaRocks[i].vy, size: 10, rotation: 0,
        active: snap.lavaRocks[i].active,
      });
    } else {
      state.lavaRocks[i].x = snap.lavaRocks[i].x;
      state.lavaRocks[i].y = snap.lavaRocks[i].y;
      state.lavaRocks[i].vy = snap.lavaRocks[i].vy;
      state.lavaRocks[i].active = snap.lavaRocks[i].active;
    }
  }

  // Geyser states
  while (state.geyserStates.length > snap.geyserStates.length) state.geyserStates.pop();
  for (let i = 0; i < snap.geyserStates.length; i++) {
    if (i >= state.geyserStates.length) {
      state.geyserStates.push({
        timer: snap.geyserStates[i].timer,
        active: snap.geyserStates[i].active,
        activeTimer: snap.geyserStates[i].activeTimer,
      });
    } else {
      state.geyserStates[i].timer = snap.geyserStates[i].timer;
      state.geyserStates[i].active = snap.geyserStates[i].active;
      state.geyserStates[i].activeTimer = snap.geyserStates[i].activeTimer;
    }
  }
}
