/**
 * Entity interpolation for remote players and world state on guest clients.
 *
 * Guests render remote entities between two known host snapshots,
 * producing smooth movement even when snapshots arrive irregularly.
 *
 * Design: Wall-clock interpolation with adaptive jitter buffer.
 * - Buffer recent snapshots with local arrival timestamps
 * - Adaptive delay: widens on jitter, tightens on stable connections
 * - Render at a wall-clock position interpolated between bracketing snapshots
 * - Sequence validation discards out-of-order packets
 */
import type { PlayerSlot, MatchState } from '../types';
import type { AuthSnapshot } from './snapshot';
import { GRAVITY, FIXED_TIMESTEP } from '../constants';

// Jitter buffer limits (in frames, converted to ms internally)
const FRAME_DURATION = FIXED_TIMESTEP * 1000;
const MIN_BUFFER_FRAMES = 1;
const MAX_BUFFER_FRAMES = 5;
const JITTER_ALPHA = 0.1;          // EMA smoothing for jitter estimate
const DELAY_LERP_SPEED = 2.0;      // frames/sec for smooth delay transitions
const MAX_EXTRAP_MS = 67;          // 4 frames — max extrapolation before freeze

interface BufferedSnapshot {
  snapshot: AuthSnapshot;
  arrivalTime: number;  // performance.now() when received
}

export class EntityInterpolation {
  // Ring buffer of snapshots with arrival timestamps
  private ring: (BufferedSnapshot | null)[];
  private ringHead = 0;
  private ringCount = 0;
  private maxBuffer = 30;

  // Sequence validation
  private lastReceivedFrame = -1;

  // Adaptive jitter buffer
  private lastArrivalTime = 0;
  private jitterEstimate = 0;       // ms — running EMA of arrival interval deviation
  private targetDelayMs = 2 * FRAME_DURATION; // start at 2 frames
  private currentDelayMs = 2 * FRAME_DURATION;

  private initialized = false;

  constructor() {
    this.ring = new Array(this.maxBuffer).fill(null);
  }

  /** Push a new snapshot from the host. Discards out-of-order packets. */
  pushSnapshot(snap: AuthSnapshot): void {
    // Sequence validation: discard stale/reordered snapshots
    if (snap.frame <= this.lastReceivedFrame) return;
    this.lastReceivedFrame = snap.frame;

    const now = performance.now();

    // Update jitter estimate from arrival interval variance
    if (this.lastArrivalTime > 0) {
      const interval = now - this.lastArrivalTime;
      const deviation = Math.abs(interval - FRAME_DURATION);
      this.jitterEstimate = this.jitterEstimate === 0
        ? deviation
        : this.jitterEstimate * (1 - JITTER_ALPHA) + deviation * JITTER_ALPHA;

      // Adapt target delay based on jitter
      const targetFrames = Math.max(
        MIN_BUFFER_FRAMES,
        Math.min(MAX_BUFFER_FRAMES, Math.ceil(this.jitterEstimate / FRAME_DURATION)),
      );
      this.targetDelayMs = targetFrames * FRAME_DURATION;
    }
    this.lastArrivalTime = now;



    // Write to ring buffer
    const entry: BufferedSnapshot = { snapshot: snap, arrivalTime: now };
    this.ring[this.ringHead] = entry;
    this.ringHead = (this.ringHead + 1) % this.maxBuffer;
    if (this.ringCount < this.maxBuffer) this.ringCount++;

    this.initialized = true;
  }

  /** Read ring entry by logical index (0 = oldest). */
  private entryAt(i: number): BufferedSnapshot {
    const start = (this.ringHead - this.ringCount + this.maxBuffer) % this.maxBuffer;
    return this.ring[(start + i) % this.maxBuffer]!;
  }

  /**
   * Get the interpolated state for the current render frame.
   * Uses wall-clock time with adaptive jitter buffer delay.
   */
  getInterpolatedState(): AuthSnapshot | null {
    if (!this.initialized || this.ringCount < 1) return null;

    // Smooth delay transitions (lerp toward target)
    const dt = FRAME_DURATION / 1000; // approximate per-frame dt
    if (this.currentDelayMs < this.targetDelayMs) {
      this.currentDelayMs = Math.min(
        this.targetDelayMs,
        this.currentDelayMs + DELAY_LERP_SPEED * FRAME_DURATION * dt,
      );
    } else if (this.currentDelayMs > this.targetDelayMs) {
      this.currentDelayMs = Math.max(
        this.targetDelayMs,
        this.currentDelayMs - DELAY_LERP_SPEED * FRAME_DURATION * dt,
      );
    }

    if (this.ringCount < 2) return this.entryAt(0).snapshot;

    const now = performance.now();
    const targetTime = now - this.currentDelayMs;

    // Find two snapshots bracketing the target wall-clock time
    let before: BufferedSnapshot | null = null;
    let after: BufferedSnapshot | null = null;

    for (let i = 0; i < this.ringCount - 1; i++) {
      const a = this.entryAt(i);
      const b = this.entryAt(i + 1);
      if (a.arrivalTime <= targetTime && b.arrivalTime >= targetTime) {
        before = a;
        after = b;
        break;
      }
    }

    // Target is before all buffered snapshots — use earliest
    if (!before && !after) {
      return this.entryAt(0).snapshot;
    }

    // Target is after all buffered snapshots — extrapolate from latest
    if (!after) {
      const latest = this.entryAt(this.ringCount - 1);
      const overshootMs = targetTime - latest.arrivalTime;
      if (overshootMs > 0 && overshootMs < MAX_EXTRAP_MS) {
        return extrapolateSnapshot(latest.snapshot, overshootMs / 1000);
      }
      // Beyond max extrapolation or exactly at latest — return as-is
      return latest.snapshot;
    }

    if (!before) return after.snapshot;

    // Wall-clock lerp factor
    const range = after.arrivalTime - before.arrivalTime;
    const t = range > 0
      ? Math.max(0, Math.min(1, (targetTime - before.arrivalTime) / range))
      : 0;

    return interpolateSnapshots(before.snapshot, after.snapshot, t);
  }

  /** Get the latest raw snapshot (no interpolation). */
  getLatestSnapshot(): AuthSnapshot | null {
    return this.ringCount > 0 ? this.entryAt(this.ringCount - 1).snapshot : null;
  }

  getBufferDepth(): number {
    return this.ringCount;
  }

  /** Current adaptive buffer delay in ms (for debug overlay). */
  getBufferDelayMs(): number {
    return this.currentDelayMs;
  }

  /** Current jitter estimate in ms (for debug overlay). */
  getJitterEstimate(): number {
    return this.jitterEstimate;
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
