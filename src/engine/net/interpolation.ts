/**
 * Entity interpolation for remote players and world state on guest clients.
 *
 * Guests render remote entities between two known host snapshots,
 * producing smooth movement even when snapshots arrive irregularly.
 *
 * Design: Frame-based interpolation with adaptive delay.
 * - Buffer recent snapshots in a ring buffer
 * - Render at a frame position behind the latest snapshot (adaptive delay)
 * - Sequence validation discards out-of-order packets
 * - Extrapolation when next snapshot is late (capped at 4 frames)
 */
import type { PlayerSlot, MatchState } from '../types';
import type { AuthSnapshot } from './snapshot';
import { GRAVITY } from '../constants';

// Adaptive interpolation delay (in frames)
const MIN_DELAY_FRAMES = 2;
const MAX_DELAY_FRAMES = 5;
const MAX_EXTRAP_FRAMES = 4;

export class EntityInterpolation {
  // Ring buffer of snapshots
  private ring: (AuthSnapshot | null)[];
  private ringHead = 0;
  private ringCount = 0;
  private maxBuffer = 30;

  private latestHostFrame = 0;
  private lastReceivedFrame = -1; // sequence validation
  private interpDelayFrames = MIN_DELAY_FRAMES;
  private initialized = false;

  // Jitter tracking for adaptive delay
  private consecutiveLateCount = 0;
  private consecutiveOnTimeCount = 0;
  private readonly TIGHTEN_THRESHOLD = 120; // ~2s of on-time arrivals before tightening

  constructor() {
    this.ring = new Array(this.maxBuffer).fill(null);
  }

  /** Push a new snapshot from the host. Discards out-of-order packets. */
  pushSnapshot(snap: AuthSnapshot): void {
    // Sequence validation: discard stale/reordered snapshots
    if (snap.frame <= this.lastReceivedFrame) return;

    // Detect gaps (missed snapshots) to adapt delay
    if (this.lastReceivedFrame > 0) {
      const gap = snap.frame - this.lastReceivedFrame;
      if (gap > 1) {
        // Missed snapshots — widen buffer
        this.consecutiveLateCount += gap - 1;
        this.consecutiveOnTimeCount = 0;
        if (this.consecutiveLateCount > 3 && this.interpDelayFrames < MAX_DELAY_FRAMES) {
          this.interpDelayFrames++;
          this.consecutiveLateCount = 0;
        }
      } else {
        // Normal delivery — count toward tightening
        this.consecutiveLateCount = Math.max(0, this.consecutiveLateCount - 1);
        this.consecutiveOnTimeCount++;
        if (this.consecutiveOnTimeCount >= this.TIGHTEN_THRESHOLD
            && this.interpDelayFrames > MIN_DELAY_FRAMES) {
          this.interpDelayFrames--;
          this.consecutiveOnTimeCount = 0;
        }
      }
    }

    this.lastReceivedFrame = snap.frame;
    this.latestHostFrame = snap.frame;

    // Write to ring buffer
    this.ring[this.ringHead] = snap;
    this.ringHead = (this.ringHead + 1) % this.maxBuffer;
    if (this.ringCount < this.maxBuffer) this.ringCount++;

    this.initialized = true;
  }

  /** Read ring entry by logical index (0 = oldest). */
  private ringAt(i: number): AuthSnapshot {
    const start = (this.ringHead - this.ringCount + this.maxBuffer) % this.maxBuffer;
    return this.ring[(start + i) % this.maxBuffer]!;
  }

  /**
   * Get the interpolated state for the current render frame.
   * Uses frame-number-based interpolation with adaptive delay.
   */
  getInterpolatedState(): AuthSnapshot | null {
    if (!this.initialized || this.ringCount < 1) return null;
    if (this.ringCount < 2) return this.ringAt(0);

    // Target: render interpDelayFrames behind the latest snapshot
    const targetFrame = this.latestHostFrame - this.interpDelayFrames;

    // Find two snapshots bracketing the target frame
    let before: AuthSnapshot | null = null;
    let after: AuthSnapshot | null = null;

    for (let i = 0; i < this.ringCount - 1; i++) {
      const a = this.ringAt(i);
      const b = this.ringAt(i + 1);
      if (a.frame <= targetFrame && b.frame >= targetFrame) {
        before = a;
        after = b;
        break;
      }
    }

    // Target is before all snapshots — use earliest
    if (!before && !after) {
      return this.ringAt(0);
    }

    // Target is after all snapshots — extrapolate from latest
    if (!after) {
      const latest = this.ringAt(this.ringCount - 1);
      const overshootFrames = targetFrame - latest.frame;
      if (overshootFrames > 0 && overshootFrames <= MAX_EXTRAP_FRAMES) {
        return extrapolateSnapshot(latest, overshootFrames / 60);
      }
      return latest;
    }

    if (!before) return after;

    // Frame-based interpolation factor
    const range = after.frame - before.frame;
    const t = range > 0 ? Math.max(0, Math.min(1, (targetFrame - before.frame) / range)) : 0;

    return interpolateSnapshots(before, after, t);
  }

  /** Get the latest raw snapshot (no interpolation). */
  getLatestSnapshot(): AuthSnapshot | null {
    return this.ringCount > 0 ? this.ringAt(this.ringCount - 1) : null;
  }

  getBufferDepth(): number {
    return this.ringCount;
  }

  /** Current interpolation delay in frames (for debug). */
  getDelayFrames(): number {
    return this.interpDelayFrames;
  }
}

// ---- Extrapolation (for late snapshots) ----

let _extrapResult: AuthSnapshot | null = null;

/** Extrapolate a snapshot forward by dt seconds using entity velocities + gravity. */
function extrapolateSnapshot(snap: AuthSnapshot, dt: number): AuthSnapshot {
  if (!_extrapResult) {
    _extrapResult = { ...snap, players: [], ghosts: [], lavaRocks: [] };
  }
  const r = _extrapResult;
  r.frame = snap.frame;

  // Copy and extrapolate players
  if (r.players.length > snap.players.length) r.players.length = snap.players.length;
  for (let i = 0; i < snap.players.length; i++) {
    if (i >= r.players.length) {
      r.players.push({ ...snap.players[i] });
    } else {
      Object.assign(r.players[i], snap.players[i]);
    }
    const p = r.players[i];
    if (p.active && p.state !== 'splat' && p.state !== 'respawning') {
      p.x += p.vx * dt;
      p.y += p.vy * dt + 0.5 * GRAVITY * dt * dt;
    }
  }

  // Copy and extrapolate ghosts
  if (r.ghosts.length > snap.ghosts.length) r.ghosts.length = snap.ghosts.length;
  for (let i = 0; i < snap.ghosts.length; i++) {
    if (i >= r.ghosts.length) {
      r.ghosts.push({ ...snap.ghosts[i] });
    } else {
      Object.assign(r.ghosts[i], snap.ghosts[i]);
    }
    r.ghosts[i].x += r.ghosts[i].vx * dt;
  }

  // Copy and extrapolate lava rocks
  if (r.lavaRocks.length > snap.lavaRocks.length) r.lavaRocks.length = snap.lavaRocks.length;
  for (let i = 0; i < snap.lavaRocks.length; i++) {
    if (i >= r.lavaRocks.length) {
      r.lavaRocks.push({ ...snap.lavaRocks[i] });
    } else {
      Object.assign(r.lavaRocks[i], snap.lavaRocks[i]);
    }
    if (r.lavaRocks[i].active) {
      r.lavaRocks[i].y += r.lavaRocks[i].vy * dt;
    }
  }

  // Non-extrapolated fields: copy from source
  r.carrots = snap.carrots;
  r.springs = snap.springs;
  r.thorns = snap.thorns;
  r.geyserStates = snap.geyserStates;
  r.killFeed = snap.killFeed;
  r.scoreAnimations = snap.scoreAnimations;
  r.matchOver = snap.matchOver;
  r.winner = snap.winner;
  r.timeElapsed = snap.timeElapsed;
  r.countdown = snap.countdown;
  r.dayPhase = snap.dayPhase;
  r.screenShake = snap.screenShake;
  r.slowMotion = snap.slowMotion;
  r.screenFlash = snap.screenFlash;
  r.hitstopZoom = snap.hitstopZoom;

  return r;
}

// ---- Interpolation ----

// Reusable structures to avoid per-frame allocations in interpolateSnapshots
const _interpAById = new Map<string, import('./snapshot').SnapshotPlayer>();
let _interpResult: AuthSnapshot | null = null;

/** Interpolate between two snapshots. Reuses objects to minimize GC pressure. */
function interpolateSnapshots(a: AuthSnapshot, b: AuthSnapshot, t: number): AuthSnapshot {
  // Build player lookup for a (reuse Map)
  _interpAById.clear();
  for (const p of a.players) _interpAById.set(p.id, p);

  // Reuse result object — mutate players array in-place
  if (!_interpResult) {
    _interpResult = { ...b, players: [], ghosts: [], lavaRocks: [] };
  }
  const r = _interpResult;
  r.frame = Math.round(a.frame + (b.frame - a.frame) * t);

  // Players: reuse or grow array
  if (r.players.length > b.players.length) r.players.length = b.players.length;
  for (let i = 0; i < b.players.length; i++) {
    const bp = b.players[i];
    const ap = _interpAById.get(bp.id);
    if (i >= r.players.length) {
      r.players.push({ ...bp });
    } else {
      Object.assign(r.players[i], bp);
    }
    if (ap) {
      r.players[i].x = lerp(ap.x, bp.x, t);
      r.players[i].y = lerp(ap.y, bp.y, t);
      r.players[i].vx = lerp(ap.vx, bp.vx, t);
      r.players[i].vy = lerp(ap.vy, bp.vy, t);
    }
  }

  // Discrete state: use "after" snapshot
  r.carrots = b.carrots;
  r.springs = b.springs;
  r.thorns = b.thorns;
  r.geyserStates = b.geyserStates;
  r.killFeed = b.killFeed;
  r.scoreAnimations = b.scoreAnimations;
  r.matchOver = b.matchOver;
  r.winner = b.winner;

  // Ghosts: reuse array
  interpArrayInPlace(r.ghosts, a.ghosts, b.ghosts, (ag, bg, out) => {
    out.x = lerp(ag.x, bg.x, t);
    out.y = lerp(ag.y, bg.y, t);
    out.vx = lerp(ag.vx, bg.vx, t);
    out.wobblePhase = lerp(ag.wobblePhase, bg.wobblePhase, t);
  });
  // Lava rocks: reuse array
  interpArrayInPlace(r.lavaRocks, a.lavaRocks, b.lavaRocks, (ar, br, out) => {
    out.x = lerp(ar.x, br.x, t);
    out.y = lerp(ar.y, br.y, t);
    out.vy = lerp(ar.vy, br.vy, t);
    out.active = br.active;
  });

  // Scalars
  r.timeElapsed = lerp(a.timeElapsed, b.timeElapsed, t);
  r.countdown = lerp(a.countdown, b.countdown, t);
  r.dayPhase = lerp(a.dayPhase, b.dayPhase, t);
  r.screenShake = lerp(a.screenShake, b.screenShake, t);
  r.slowMotion = lerp(a.slowMotion, b.slowMotion, t);
  r.screenFlash = lerp(a.screenFlash, b.screenFlash, t);
  r.hitstopZoom = lerp(a.hitstopZoom, b.hitstopZoom, t);

  return r;
}

/** Interpolate arrays in-place — reuses existing objects, grows/shrinks as needed. */
function interpArrayInPlace<T extends Record<string, any>>(
  out: T[], aArr: T[], bArr: T[],
  fn: (a: T, b: T, out: T) => void,
): void {
  if (out.length > bArr.length) out.length = bArr.length;
  for (let i = 0; i < bArr.length; i++) {
    if (i >= out.length) {
      out.push({ ...bArr[i] });
    }
    const ai = aArr[i];
    if (ai) {
      fn(ai, bArr[i], out[i]);
    } else {
      Object.assign(out[i], bArr[i]);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Reusable Map to avoid allocation per frame in applySnapshotToState
const _playerLookup = new Map<string, import('../types').Player>();

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
  // Update players (O(1) lookup, reused Map to avoid GC pressure)
  _playerLookup.clear();
  for (const p of state.players) _playerLookup.set(p.id, p);
  const playerById = _playerLookup;
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
    player.sideSquash = sp.sideSquash;
    player.damageFlashTimer = sp.damageFlashTimer;
    player.damageFlashSide = sp.damageFlashSide;
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
