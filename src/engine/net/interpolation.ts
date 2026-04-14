/**
 * Entity interpolation for remote players and world state on guest clients.
 *
 * Guests render remote entities between two known host snapshots,
 * producing smooth movement even when snapshots arrive irregularly.
 *
 * Design: DDNet-style interpolation with wall-clock time tracking.
 * - Buffer recent snapshots with timestamps
 * - Render at a position interpolated between two bracketing snapshots
 * - renderTime advances by real dt each frame, stays ~2 frames behind latest
 */
import type { PlayerSlot, MatchState } from '../types';
import type { AuthSnapshot } from './snapshot';

// Interpolation delay: render this many frames behind the latest snapshot.
// Higher = smoother (more buffer), lower = less latency.
const INTERP_DELAY_FRAMES = 2;

interface TimestampedSnapshot {
  snap: AuthSnapshot;
}

export class EntityInterpolation {
  private buffer: TimestampedSnapshot[] = [];
  private maxBuffer = 30;

  private latestHostFrame = 0;
  private initialized = false;

  /** Push a new snapshot from the host. */
  pushSnapshot(snap: AuthSnapshot): void {
    this.buffer.push({ snap });

    // Trim old snapshots
    while (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }

    this.latestHostFrame = snap.frame;
    this.initialized = true;
  }

  /**
   * Get the interpolated state for the current render frame.
   * Call this once per render frame.
   */
  getInterpolatedState(): AuthSnapshot | null {
    if (!this.initialized || this.buffer.length < 1) return null;
    if (this.buffer.length < 2) return this.buffer[0].snap;

    // Target: render INTERP_DELAY_FRAMES behind the latest snapshot
    const targetFrame = this.latestHostFrame - INTERP_DELAY_FRAMES;

    // Find two snapshots bracketing the target frame
    let before: AuthSnapshot | null = null;
    let after: AuthSnapshot | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].snap.frame <= targetFrame && this.buffer[i + 1].snap.frame >= targetFrame) {
        before = this.buffer[i].snap;
        after = this.buffer[i + 1].snap;
        break;
      }
    }

    // If target is before all snapshots, use earliest
    if (!before && !after) {
      return this.buffer[0].snap;
    }

    // If target is after all snapshots (sparse arrival), use latest
    if (!after) {
      return this.buffer[this.buffer.length - 1].snap;
    }

    if (!before) return after;

    // Interpolation factor
    const range = after.frame - before.frame;
    const t = range > 0 ? Math.max(0, Math.min(1, (targetFrame - before.frame) / range)) : 0;

    return interpolateSnapshots(before, after, t);
  }

  /** Get the latest raw snapshot (no interpolation). */
  getLatestSnapshot(): AuthSnapshot | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].snap : null;
  }

  getBufferDepth(): number {
    return this.buffer.length;
  }
}

/** Interpolate between two snapshots. */
function interpolateSnapshots(a: AuthSnapshot, b: AuthSnapshot, t: number): AuthSnapshot {
  // Build player lookup for a (O(1) per player instead of O(n) .find)
  const aById = new Map(a.players.map(p => [p.id, p]));

  return {
    frame: Math.round(a.frame + (b.frame - a.frame) * t),
    players: b.players.map(bp => {
      const ap = aById.get(bp.id);
      if (!ap) return bp;
      return {
        ...bp,
        x: lerp(ap.x, bp.x, t),
        y: lerp(ap.y, bp.y, t),
        vx: lerp(ap.vx, bp.vx, t),
        vy: lerp(ap.vy, bp.vy, t),
      };
    }),
    // Discrete state: use "after" snapshot (entities spawn/despawn instantly)
    carrots: b.carrots,
    springs: b.springs,
    thorns: b.thorns,
    ghosts: interpolateByIndex(a.ghosts, b.ghosts, (ag, bg) => ({
      x: lerp(ag.x, bg.x, t),
      y: lerp(ag.y, bg.y, t),
      vx: lerp(ag.vx, bg.vx, t),
      wobblePhase: lerp(ag.wobblePhase, bg.wobblePhase, t),
    })),
    lavaRocks: interpolateByIndex(a.lavaRocks, b.lavaRocks, (ar, br) => ({
      x: lerp(ar.x, br.x, t),
      y: lerp(ar.y, br.y, t),
      vy: lerp(ar.vy, br.vy, t),
      active: br.active,
    })),
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

/** Interpolate arrays matched by index (ghosts, lava rocks). */
function interpolateByIndex<T>(a: T[], b: T[], fn: (a: T, b: T) => T): T[] {
  return b.map((bi, i) => {
    const ai = a[i];
    return ai ? fn(ai, bi) : bi;
  });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Apply an AuthSnapshot to a MatchState for rendering on the guest.
 * Updates player positions, entity states, and global timers in-place.
 */
export function applySnapshotToState(
  snap: AuthSnapshot,
  state: MatchState,
  localSlot?: PlayerSlot,
  localOverride?: { x: number; y: number },
): void {
  // Update players (O(1) lookup)
  const playerById = new Map(state.players.map(p => [p.id, p]));
  for (const sp of snap.players) {
    const player = playerById.get(sp.id);
    if (!player) continue;

    // If this is the local player and we have a prediction override, use it
    if (localSlot && sp.id === localSlot && localOverride) {
      player.x = localOverride.x;
      player.y = localOverride.y;
    } else {
      player.x = sp.x;
      player.y = sp.y;
    }
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

  // Global state
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

  // Sync entity arrays
  syncArray(state.carrots, snap.carrots, (s) => ({ x: s.x, y: s.y, active: s.active, spawnTime: 0 }), (dst, src) => {
    dst.x = src.x; dst.y = src.y; dst.active = src.active;
  });
  syncArray(state.springs, snap.springs, (s) => ({
    x: s.x, y: s.y, platformIndex: 0, bounceTimer: s.bounceTimer, life: s.life, growTimer: s.growTimer,
  }), (dst, src) => {
    dst.x = src.x; dst.y = src.y; dst.bounceTimer = src.bounceTimer; dst.life = src.life; dst.growTimer = src.growTimer;
  });
  syncArray(state.thorns, snap.thorns, (s) => ({
    x: s.x, y: s.y, width: 20, height: 20, platformIndex: 0, life: s.life, growTimer: s.growTimer, hit: s.hit,
  }), (dst, src) => {
    dst.x = src.x; dst.y = src.y; dst.life = src.life; dst.growTimer = src.growTimer; dst.hit = src.hit;
  });
  syncArray(state.ghosts, snap.ghosts, (s) => ({
    x: s.x, y: s.y, vx: s.vx, size: 30, alpha: 0.6, wobblePhase: s.wobblePhase,
  }), (dst, src) => {
    dst.x = src.x; dst.y = src.y; dst.vx = src.vx; dst.wobblePhase = src.wobblePhase;
  });
  syncArray(state.lavaRocks, snap.lavaRocks, (s) => ({
    x: s.x, y: s.y, vy: s.vy, size: 10, rotation: 0, active: s.active,
  }), (dst, src) => {
    dst.x = src.x; dst.y = src.y; dst.vy = src.vy; dst.active = src.active;
  });
  syncArray(state.geyserStates, snap.geyserStates, (s) => ({
    timer: s.timer, active: s.active, activeTimer: s.activeTimer,
  }), (dst, src) => {
    dst.timer = src.timer; dst.active = src.active; dst.activeTimer = src.activeTimer;
  });
}

/** Sync a state array to match a snapshot array — reuse existing objects, grow/shrink as needed. */
function syncArray<TState, TSnap>(
  stateArr: TState[],
  snapArr: TSnap[],
  factory: (snap: TSnap) => TState,
  update: (state: TState, snap: TSnap) => void,
): void {
  while (stateArr.length > snapArr.length) stateArr.pop();
  for (let i = 0; i < snapArr.length; i++) {
    if (i >= stateArr.length) {
      stateArr.push(factory(snapArr[i]));
    } else {
      update(stateArr[i], snapArr[i]);
    }
  }
}
