/**
 * Entity interpolation for remote players and world state on guest clients.
 *
 * Uses the generic SnapshotInterpolation from core/ for the ring buffer,
 * adaptive delay, and frame targeting. Game-specific interpolation (which
 * fields to lerp vs snap) and applySnapshotToState are defined here.
 */
import type { MatchState } from '../types';
import type { AuthSnapshot } from './snapshot';
import { GRAVITY } from '../constants';
import { SnapshotInterpolation } from './core/interpolation';
import type { InterpolationConfig } from './core/types';

// ---- Game-specific interpolation config ----

const crInterpolationConfig: InterpolationConfig<AuthSnapshot> = {
  getFrame(snap) { return snap.frame; },
};

export class EntityInterpolation {
  private engine: SnapshotInterpolation<AuthSnapshot>;

  constructor() {
    this.engine = new SnapshotInterpolation(crInterpolationConfig);
  }

  pushSnapshot(snap: AuthSnapshot): void {
    this.engine.pushSnapshot(snap);
  }

  getInterpolatedState(): AuthSnapshot | null {
    const result = this.engine.getRawResult();
    if (!result) return null;

    switch (result.kind) {
      case 'single':
        return result.snapshot;
      case 'interpolate':
        return interpolateSnapshots(result.before, result.after, result.t);
      case 'extrapolate':
        return extrapolateSnapshot(result.snapshot, result.overshootFrames / 60);
    }
  }

  getLatestSnapshot(): AuthSnapshot | null {
    return this.engine.getLatestSnapshot();
  }

  getBufferDepth(): number {
    return this.engine.getBufferDepth();
  }

  getDelayFrames(): number {
    return this.engine.getDelayFrames();
  }

  reset(): void {
    this.engine.reset();
  }
}

// ---- Extrapolation (for late snapshots) ----

let _extrapResult: AuthSnapshot | null = null;

function extrapolateSnapshot(snap: AuthSnapshot, dt: number): AuthSnapshot {
  if (!_extrapResult) {
    _extrapResult = { ...snap, players: [], ghosts: [], lavaRocks: [] };
  }
  const r = _extrapResult;
  r.frame = snap.frame;

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

  if (r.ghosts.length > snap.ghosts.length) r.ghosts.length = snap.ghosts.length;
  for (let i = 0; i < snap.ghosts.length; i++) {
    if (i >= r.ghosts.length) {
      r.ghosts.push({ ...snap.ghosts[i] });
    } else {
      Object.assign(r.ghosts[i], snap.ghosts[i]);
    }
    r.ghosts[i].x += r.ghosts[i].vx * dt;
  }

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

  r.carrots = snap.carrots;
  r.springs = snap.springs;
  r.thorns = snap.thorns;
  r.geyserStates = snap.geyserStates;
  r.killFeed = snap.killFeed;
  r.scoreAnimations = snap.scoreAnimations;
  r.phase = snap.phase;
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

let _interpResult: AuthSnapshot | null = null;

function interpolateSnapshots(a: AuthSnapshot, b: AuthSnapshot, t: number): AuthSnapshot {
  if (!_interpResult) {
    _interpResult = { ...b, players: [], ghosts: [], lavaRocks: [] };
  }
  const r = _interpResult;
  r.frame = Math.round(a.frame + (b.frame - a.frame) * t);

  // Player arrays have stable order (from takeAuthSnapshot iterating state.players),
  // so index-based access works and avoids Map rebuild every frame.
  if (r.players.length > b.players.length) r.players.length = b.players.length;
  for (let i = 0; i < b.players.length; i++) {
    const bp = b.players[i];
    const ap = a.players[i]; // same index — stable order guaranteed by host
    if (i >= r.players.length) {
      r.players.push({ ...bp });
    }
    const rp = r.players[i];
    // Explicit field copy (faster than Object.assign for known shapes)
    rp.id = bp.id;
    rp.state = bp.state;
    rp.facing = bp.facing;
    rp.animFrame = bp.animFrame;
    rp.score = bp.score;
    rp.hitstopTimer = bp.hitstopTimer;
    rp.invincibleTimer = bp.invincibleTimer;
    rp.fastFalling = bp.fastFalling;
    rp.splatTimer = bp.splatTimer;
    rp.respawnTimer = bp.respawnTimer;
    rp.fatTimer = bp.fatTimer;
    rp.slowTimer = bp.slowTimer;
    rp.burnTimer = bp.burnTimer;
    rp.squashScale = bp.squashScale;
    rp.expression = bp.expression;
    rp.killStreak = bp.killStreak;
    rp.disconnected = bp.disconnected;
    rp.active = bp.active;
    rp.width = bp.width;
    rp.height = bp.height;
    rp.sideSquash = bp.sideSquash;
    rp.damageFlashTimer = bp.damageFlashTimer;
    rp.damageFlashSide = bp.damageFlashSide;
    // Lerp positions/velocities
    if (ap) {
      rp.x = lerp(ap.x, bp.x, t);
      rp.y = lerp(ap.y, bp.y, t);
      rp.vx = lerp(ap.vx, bp.vx, t);
      rp.vy = lerp(ap.vy, bp.vy, t);
    } else {
      rp.x = bp.x;
      rp.y = bp.y;
      rp.vx = bp.vx;
      rp.vy = bp.vy;
    }
  }

  r.carrots = b.carrots;
  r.springs = b.springs;
  r.thorns = b.thorns;
  r.geyserStates = b.geyserStates;
  r.killFeed = b.killFeed;
  r.scoreAnimations = b.scoreAnimations;
  r.phase = b.phase;
  r.matchOver = b.matchOver;
  r.winner = b.winner;

  interpArrayInPlace(r.ghosts, a.ghosts, b.ghosts, (ag, bg, out) => {
    out.x = lerp(ag.x, bg.x, t);
    out.y = lerp(ag.y, bg.y, t);
    out.vx = lerp(ag.vx, bg.vx, t);
    out.wobblePhase = lerp(ag.wobblePhase, bg.wobblePhase, t);
  });
  interpArrayInPlace(r.lavaRocks, a.lavaRocks, b.lavaRocks, (ar, br, out) => {
    out.x = lerp(ar.x, br.x, t);
    out.y = lerp(ar.y, br.y, t);
    out.vy = lerp(ar.vy, br.vy, t);
    out.active = br.active;
  });

  r.timeElapsed = lerp(a.timeElapsed, b.timeElapsed, t);
  r.countdown = lerp(a.countdown, b.countdown, t);
  r.dayPhase = lerp(a.dayPhase, b.dayPhase, t);
  r.screenShake = lerp(a.screenShake, b.screenShake, t);
  r.slowMotion = lerp(a.slowMotion, b.slowMotion, t);
  r.screenFlash = lerp(a.screenFlash, b.screenFlash, t);
  r.hitstopZoom = lerp(a.hitstopZoom, b.hitstopZoom, t);

  return r;
}

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

// ---- Apply snapshot to state (game-specific) ----

/**
 * Apply an AuthSnapshot to a MatchState for rendering on the guest.
 * Player arrays have stable order, so index-based access avoids Map overhead.
 */
export function applySnapshotToState(
  snap: AuthSnapshot,
  state: MatchState,
): void {
  // Index-based: snap.players and state.players have the same order
  // (both derived from the host's state.players array)
  const len = Math.min(snap.players.length, state.players.length);
  for (let i = 0; i < len; i++) {
    const sp = snap.players[i];
    const player = state.players[i];
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
    player.sideSquash = sp.sideSquash;
    player.damageFlashTimer = sp.damageFlashTimer;
    player.damageFlashSide = sp.damageFlashSide;
  }

  state.phase = snap.phase;
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
