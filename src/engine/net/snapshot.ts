/**
 * Binary snapshot format for host-authoritative netcode.
 * Host sends compact state snapshots to guests every tick.
 * Supports delta compression (XOR + RLE) against last-acked snapshot.
 *
 * Design goals:
 * - ~50 bytes per player, ~4 bytes per entity
 * - Zero allocation in steady state (pre-allocated buffers)
 * - Delta compression: unchanged frames ≈ 40-80 bytes
 */
import type {
  PlayerSlot, PlayerState, KillFeedEntry, MatchState,
} from '../types';
import { encodeSlot, decodeSlot } from './protocol';

// ---- Snapshot data structures ----

export interface SnapshotPlayer {
  id: PlayerSlot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: PlayerState;
  facing: 'left' | 'right';
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
  expression: 'normal' | 'scared' | 'angry' | 'dizzy';
  killStreak: number;
  disconnected: boolean;
  active: boolean;
  width: number;
  height: number;
  sideSquash: number;
  damageFlashTimer: number;
  damageFlashSide: 'left' | 'right' | null;
}

export interface AuthSnapshot {
  frame: number;
  players: SnapshotPlayer[];
  carrots: Array<{ x: number; y: number; active: boolean }>;
  springs: Array<{ x: number; y: number; bounceTimer: number; life: number; growTimer: number }>;
  thorns: Array<{ x: number; y: number; life: number; growTimer: number; hit: boolean }>;
  ghosts: Array<{ x: number; y: number; vx: number; wobblePhase: number }>;
  lavaRocks: Array<{ x: number; y: number; vy: number; active: boolean }>;
  geyserStates: Array<{ timer: number; active: boolean; activeTimer: number }>;
  killFeed: KillFeedEntry[];
  timeElapsed: number;
  countdown: number;
  dayPhase: number;
  matchOver: boolean;
  winner: PlayerSlot | null;
  screenShake: number;
  slowMotion: number;
  screenFlash: number;
  hitstopZoom: number;
  scoreAnimations: Array<{ playerId: PlayerSlot; value: number; timer: number }>;
}

// ---- State encoding helpers ----

const PLAYER_STATE_MAP: Record<PlayerState, number> = {
  idle: 0, run: 1, airborne: 2, splat: 3, respawning: 4,
};
const PLAYER_STATE_REVERSE: PlayerState[] = ['idle', 'run', 'airborne', 'splat', 'respawning'];

const EXPRESSION_MAP: Record<string, number> = {
  normal: 0, scared: 1, angry: 2, dizzy: 3,
};
const EXPRESSION_REVERSE = ['normal', 'scared', 'angry', 'dizzy'] as const;

/** Decode slot byte to PlayerSlot (type-narrowing wrapper around decodeSlot). */
const decodeSlotAs = (b: number) => decodeSlot(b) as PlayerSlot;

// ---- Binary encoding ----

// Pre-allocated encode buffer (4KB — handles 10 players + 30 entities comfortably)
const MAX_SNAPSHOT_BYTES = 4096;
const ENCODE_BUF = new ArrayBuffer(MAX_SNAPSHOT_BYTES);
const ENCODE_VIEW = new DataView(ENCODE_BUF);

/** Encode a timer (seconds) as a uint8 frame count (0-255). */
function encodeTimer(timer: number): number {
  if (timer <= 0) return 0;
  return Math.min(Math.round(timer * 60), 255);
}

/** Write N booleans as ceil(N/8) bitfield bytes into ENCODE_VIEW. Returns new offset. */
function writePackedBools(o: number, n: number, get: (i: number) => boolean): number {
  const byteCount = (n + 7) >> 3;
  for (let b = 0; b < byteCount; b++) {
    let byte = 0;
    const base = b * 8;
    const end = base + 8 <= n ? 8 : n - base;
    for (let bit = 0; bit < end; bit++) {
      if (get(base + bit)) byte |= (1 << bit);
    }
    ENCODE_VIEW.setUint8(o++, byte);
  }
  return o;
}

/** Read N booleans from ceil(N/8) bitfield bytes. Returns [bools, newOffset]. */
function readPackedBools(view: DataView, o: number, n: number): [boolean[], number] {
  const byteCount = (n + 7) >> 3;
  const bools: boolean[] = new Array(n);
  for (let b = 0; b < byteCount; b++) {
    const byte = view.getUint8(o + b);
    const base = b * 8;
    const end = base + 8 <= n ? 8 : n - base;
    for (let bit = 0; bit < end; bit++) {
      bools[base + bit] = !!(byte & (1 << bit));
    }
  }
  return [bools, o + byteCount];
}

/**
 * Encode an AuthSnapshot into a compact binary format.
 * Returns { buffer, length } where buffer is a shared pre-allocated buffer.
 * Caller must consume or copy before the next encodeSnapshot() call.
 */
export function encodeSnapshot(snap: AuthSnapshot): { buffer: ArrayBuffer; length: number } {
  let o = 0; // offset

  // Header
  ENCODE_VIEW.setUint32(o, snap.frame, true); o += 4;

  // Player count + players
  ENCODE_VIEW.setUint8(o++, snap.players.length);
  for (const p of snap.players) {
    ENCODE_VIEW.setUint8(o++, encodeSlot(p.id));
    ENCODE_VIEW.setFloat32(o, p.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, p.y, true); o += 4;
    ENCODE_VIEW.setFloat32(o, p.vx, true); o += 4;
    ENCODE_VIEW.setFloat32(o, p.vy, true); o += 4;
    ENCODE_VIEW.setUint8(o++, PLAYER_STATE_MAP[p.state] ?? 0);
    // Flags byte: facing(1) + fastFalling(1) + disconnected(1) + active(1) + expression(2) + damageFlashSide(2) = 8 bits
    const dfSide = p.damageFlashSide === 'left' ? 1 : p.damageFlashSide === 'right' ? 2 : 0;
    const flags =
      (p.facing === 'right' ? 1 : 0) |
      (p.fastFalling ? 2 : 0) |
      (p.disconnected ? 4 : 0) |
      (p.active ? 8 : 0) |
      ((EXPRESSION_MAP[p.expression] ?? 0) << 4) |
      (dfSide << 6);
    ENCODE_VIEW.setUint8(o++, flags);
    ENCODE_VIEW.setUint8(o++, p.animFrame & 0xFF);
    ENCODE_VIEW.setUint8(o++, Math.min(p.score, 255));

    // Timer presence mask + only non-zero timers.
    // Bits: 0=hitstop 1=invincible 2=splat 3=respawn 4=fat 5=slow 6=burn 7=damageFlash
    const hitstop = encodeTimer(p.hitstopTimer);
    const invinc = encodeTimer(p.invincibleTimer);
    const splat = encodeTimer(p.splatTimer);
    const respawn = encodeTimer(p.respawnTimer);
    const fat = encodeTimer(p.fatTimer);
    const slow = encodeTimer(p.slowTimer);
    const burn = encodeTimer(p.burnTimer);
    const dfTimer = encodeTimer(p.damageFlashTimer);
    const timerMask =
      (hitstop ? 1 : 0) |
      (invinc ? 2 : 0) |
      (splat ? 4 : 0) |
      (respawn ? 8 : 0) |
      (fat ? 16 : 0) |
      (slow ? 32 : 0) |
      (burn ? 64 : 0) |
      (dfTimer ? 128 : 0);
    ENCODE_VIEW.setUint8(o++, timerMask);
    if (hitstop) ENCODE_VIEW.setUint8(o++, hitstop);
    if (invinc) ENCODE_VIEW.setUint8(o++, invinc);
    if (splat) ENCODE_VIEW.setUint8(o++, splat);
    if (respawn) ENCODE_VIEW.setUint8(o++, respawn);
    if (fat) ENCODE_VIEW.setUint8(o++, fat);
    if (slow) ENCODE_VIEW.setUint8(o++, slow);
    if (burn) ENCODE_VIEW.setUint8(o++, burn);
    if (dfTimer) ENCODE_VIEW.setUint8(o++, dfTimer);

    ENCODE_VIEW.setUint8(o++, Math.round(p.squashScale * 50) & 0xFF); // 50 = 1.0 normal
    ENCODE_VIEW.setUint8(o++, Math.min(p.killStreak, 255));
    ENCODE_VIEW.setUint8(o++, Math.min(Math.round(p.width), 255));
    ENCODE_VIEW.setUint8(o++, Math.min(Math.round(p.height), 255));
    ENCODE_VIEW.setUint8(o++, Math.round(p.sideSquash * 50) & 0xFF); // 50 = 1.0 normal
  }

  // Carrots — bitfield of active flags, then positions
  ENCODE_VIEW.setUint8(o++, snap.carrots.length);
  o = writePackedBools(o, snap.carrots.length, i => snap.carrots[i].active);
  for (const c of snap.carrots) {
    ENCODE_VIEW.setFloat32(o, c.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, c.y, true); o += 4;
  }

  // Springs
  ENCODE_VIEW.setUint8(o++, snap.springs.length);
  for (const s of snap.springs) {
    ENCODE_VIEW.setFloat32(o, s.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, s.y, true); o += 4;
    ENCODE_VIEW.setFloat32(o, s.bounceTimer, true); o += 4;
    ENCODE_VIEW.setFloat32(o, s.life, true); o += 4;
    ENCODE_VIEW.setFloat32(o, s.growTimer, true); o += 4;
  }

  // Thorns — bitfield of hit flags, then bodies
  ENCODE_VIEW.setUint8(o++, snap.thorns.length);
  o = writePackedBools(o, snap.thorns.length, i => snap.thorns[i].hit);
  for (const t of snap.thorns) {
    ENCODE_VIEW.setFloat32(o, t.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, t.y, true); o += 4;
    ENCODE_VIEW.setFloat32(o, t.life, true); o += 4;
    ENCODE_VIEW.setFloat32(o, t.growTimer, true); o += 4;
  }

  // Ghosts
  ENCODE_VIEW.setUint8(o++, snap.ghosts.length);
  for (const g of snap.ghosts) {
    ENCODE_VIEW.setFloat32(o, g.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, g.y, true); o += 4;
    ENCODE_VIEW.setFloat32(o, g.vx, true); o += 4;
    ENCODE_VIEW.setFloat32(o, g.wobblePhase, true); o += 4;
  }

  // Lava rocks — bitfield of active flags, then bodies
  ENCODE_VIEW.setUint8(o++, snap.lavaRocks.length);
  o = writePackedBools(o, snap.lavaRocks.length, i => snap.lavaRocks[i].active);
  for (const r of snap.lavaRocks) {
    ENCODE_VIEW.setFloat32(o, r.x, true); o += 4;
    ENCODE_VIEW.setFloat32(o, r.y, true); o += 4;
    ENCODE_VIEW.setFloat32(o, r.vy, true); o += 4;
  }

  // Geyser states — bitfield of active flags, then bodies
  ENCODE_VIEW.setUint8(o++, snap.geyserStates.length);
  o = writePackedBools(o, snap.geyserStates.length, i => snap.geyserStates[i].active);
  for (const gs of snap.geyserStates) {
    ENCODE_VIEW.setFloat32(o, gs.timer, true); o += 4;
    ENCODE_VIEW.setFloat32(o, gs.activeTimer, true); o += 4;
  }

  // Kill feed (last 5 entries max)
  const kfLen = Math.min(snap.killFeed.length, 5);
  ENCODE_VIEW.setUint8(o++, kfLen);
  for (let i = snap.killFeed.length - kfLen; i < snap.killFeed.length; i++) {
    const kf = snap.killFeed[i];
    ENCODE_VIEW.setUint8(o++, encodeSlot(kf.attacker));
    ENCODE_VIEW.setUint8(o++, encodeSlot(kf.victim));
    ENCODE_VIEW.setFloat32(o, kf.timestamp, true); o += 4;
  }

  // Global state
  ENCODE_VIEW.setFloat32(o, snap.timeElapsed, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.countdown, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.dayPhase, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.screenShake, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.slowMotion, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.screenFlash, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.hitstopZoom, true); o += 4;

  // Match state flags
  ENCODE_VIEW.setUint8(o++, (snap.matchOver ? 1 : 0) | (snap.winner ? 2 : 0));
  if (snap.winner) {
    ENCODE_VIEW.setUint8(o++, encodeSlot(snap.winner));
  }

  // Score animations
  const saLen = Math.min(snap.scoreAnimations.length, 10);
  ENCODE_VIEW.setUint8(o++, saLen);
  for (let i = 0; i < saLen; i++) {
    const sa = snap.scoreAnimations[i];
    ENCODE_VIEW.setUint8(o++, encodeSlot(sa.playerId));
    ENCODE_VIEW.setUint8(o++, sa.value & 0xFF);
    ENCODE_VIEW.setFloat32(o, sa.timer, true); o += 4;
  }

  return { buffer: ENCODE_BUF, length: o };
}

/**
 * Decode a binary snapshot back into an AuthSnapshot object.
 */
export function decodeSnapshot(buf: ArrayBuffer): AuthSnapshot | null {
  if (buf.byteLength < 5) return null;
  try {
  const view = new DataView(buf);
  let o = 0;

  const frame = view.getUint32(o, true); o += 4;

  // Players
  const playerCount = view.getUint8(o++);
  const players: SnapshotPlayer[] = [];
  for (let i = 0; i < playerCount; i++) {
    const id = decodeSlotAs(view.getUint8(o++));
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vx = view.getFloat32(o, true); o += 4;
    const vy = view.getFloat32(o, true); o += 4;
    const stateIdx = view.getUint8(o++);
    const flags = view.getUint8(o++);
    const animFrame = view.getUint8(o++);
    const score = view.getUint8(o++);

    const timerMask = view.getUint8(o++);
    const hitstopTimer = (timerMask & 1) ? view.getUint8(o++) / 60 : 0;
    const invincibleTimer = (timerMask & 2) ? view.getUint8(o++) / 60 : 0;
    const splatTimer = (timerMask & 4) ? view.getUint8(o++) / 60 : 0;
    const respawnTimer = (timerMask & 8) ? view.getUint8(o++) / 60 : 0;
    const fatTimer = (timerMask & 16) ? view.getUint8(o++) / 60 : 0;
    const slowTimer = (timerMask & 32) ? view.getUint8(o++) / 60 : 0;
    const burnTimer = (timerMask & 64) ? view.getUint8(o++) / 60 : 0;
    const damageFlashTimer = (timerMask & 128) ? view.getUint8(o++) / 60 : 0;

    const squashScale = view.getUint8(o++) / 50;
    const killStreak = view.getUint8(o++);
    const width = view.getUint8(o++);
    const height = view.getUint8(o++);
    const sideSquash = view.getUint8(o++) / 50;

    const dfSide = (flags >> 6) & 3;
    const damageFlashSide: 'left' | 'right' | null = dfSide === 1 ? 'left' : dfSide === 2 ? 'right' : null;

    players.push({
      id,
      x, y, vx, vy,
      state: PLAYER_STATE_REVERSE[stateIdx] ?? 'idle',
      facing: (flags & 1) ? 'right' : 'left',
      fastFalling: !!(flags & 2),
      disconnected: !!(flags & 4),
      active: !!(flags & 8),
      expression: EXPRESSION_REVERSE[(flags >> 4) & 3] ?? 'normal',
      animFrame,
      score,
      hitstopTimer,
      invincibleTimer,
      splatTimer,
      respawnTimer,
      fatTimer,
      slowTimer,
      burnTimer,
      squashScale,
      killStreak,
      width, height,
      sideSquash,
      damageFlashTimer,
      damageFlashSide,
    });
  }

  // Carrots
  const carrotCount = view.getUint8(o++);
  let carrotActives: boolean[];
  [carrotActives, o] = readPackedBools(view, o, carrotCount);
  const carrots: AuthSnapshot['carrots'] = [];
  for (let i = 0; i < carrotCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    carrots.push({ x, y, active: carrotActives[i] });
  }

  // Springs
  const springCount = view.getUint8(o++);
  const springs: AuthSnapshot['springs'] = [];
  for (let i = 0; i < springCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const bounceTimer = view.getFloat32(o, true); o += 4;
    const life = view.getFloat32(o, true); o += 4;
    const growTimer = view.getFloat32(o, true); o += 4;
    springs.push({ x, y, bounceTimer, life, growTimer });
  }

  // Thorns
  const thornCount = view.getUint8(o++);
  let thornHits: boolean[];
  [thornHits, o] = readPackedBools(view, o, thornCount);
  const thorns: AuthSnapshot['thorns'] = [];
  for (let i = 0; i < thornCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const life = view.getFloat32(o, true); o += 4;
    const growTimer = view.getFloat32(o, true); o += 4;
    thorns.push({ x, y, life, growTimer, hit: thornHits[i] });
  }

  // Ghosts
  const ghostCount = view.getUint8(o++);
  const ghosts: AuthSnapshot['ghosts'] = [];
  for (let i = 0; i < ghostCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vx = view.getFloat32(o, true); o += 4;
    const wobblePhase = view.getFloat32(o, true); o += 4;
    ghosts.push({ x, y, vx, wobblePhase });
  }

  // Lava rocks
  const lrCount = view.getUint8(o++);
  let lrActives: boolean[];
  [lrActives, o] = readPackedBools(view, o, lrCount);
  const lavaRocks: AuthSnapshot['lavaRocks'] = [];
  for (let i = 0; i < lrCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vy = view.getFloat32(o, true); o += 4;
    lavaRocks.push({ x, y, vy, active: lrActives[i] });
  }

  // Geyser states
  const gsCount = view.getUint8(o++);
  let gsActives: boolean[];
  [gsActives, o] = readPackedBools(view, o, gsCount);
  const geyserStates: AuthSnapshot['geyserStates'] = [];
  for (let i = 0; i < gsCount; i++) {
    const timer = view.getFloat32(o, true); o += 4;
    const activeTimer = view.getFloat32(o, true); o += 4;
    geyserStates.push({ timer, active: gsActives[i], activeTimer });
  }

  // Kill feed
  const kfLen = view.getUint8(o++);
  const killFeed: KillFeedEntry[] = [];
  for (let i = 0; i < kfLen; i++) {
    const attacker = decodeSlotAs(view.getUint8(o++));
    const victim = decodeSlotAs(view.getUint8(o++));
    const timestamp = view.getFloat32(o, true); o += 4;
    killFeed.push({ attacker, victim, timestamp });
  }

  // Global state
  const timeElapsed = view.getFloat32(o, true); o += 4;
  const countdown = view.getFloat32(o, true); o += 4;
  const dayPhase = view.getFloat32(o, true); o += 4;
  const screenShake = view.getFloat32(o, true); o += 4;
  const slowMotion = view.getFloat32(o, true); o += 4;
  const screenFlash = view.getFloat32(o, true); o += 4;
  const hitstopZoom = view.getFloat32(o, true); o += 4;

  // Match state flags
  const matchFlags = view.getUint8(o++);
  const matchOver = !!(matchFlags & 1);
  let winner: PlayerSlot | null = null;
  if (matchFlags & 2) {
    winner = decodeSlotAs(view.getUint8(o++));
  }

  // Score animations
  const saLen = view.getUint8(o++);
  const scoreAnimations: AuthSnapshot['scoreAnimations'] = [];
  for (let i = 0; i < saLen; i++) {
    const playerId = decodeSlotAs(view.getUint8(o++));
    const value = view.getUint8(o++);
    const timer = view.getFloat32(o, true); o += 4;
    scoreAnimations.push({ playerId, value, timer });
  }

  return {
    frame,
    players,
    carrots,
    springs,
    thorns,
    ghosts,
    lavaRocks,
    geyserStates,
    killFeed,
    timeElapsed,
    countdown,
    dayPhase,
    matchOver,
    winner,
    screenShake,
    slowMotion,
    screenFlash,
    hitstopZoom,
    scoreAnimations,
  };
  } catch {
    // Corrupted or truncated buffer — return null instead of crashing
    return null;
  }
}

/**
 * Extract an AuthSnapshot from the current MatchState.
 * Called by the host every tick to prepare state for transmission.
 */
export function takeAuthSnapshot(frame: number, state: MatchState): AuthSnapshot {
  return {
    frame,
    players: state.players.map(p => ({
      id: p.id,
      x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      state: p.state,
      facing: p.facing,
      animFrame: p.animFrame,
      score: p.score,
      hitstopTimer: p.hitstopTimer,
      invincibleTimer: p.invincibleTimer,
      fastFalling: p.fastFalling,
      splatTimer: p.splatTimer,
      respawnTimer: p.respawnTimer,
      fatTimer: p.fatTimer,
      slowTimer: p.slowTimer,
      burnTimer: p.burnTimer,
      squashScale: p.squashScale,
      expression: p.expression,
      killStreak: p.killStreak,
      disconnected: p.disconnected,
      active: p.active,
      width: p.width,
      height: p.height,
      sideSquash: p.sideSquash,
      damageFlashTimer: p.damageFlashTimer,
      damageFlashSide: p.damageFlashSide,
    })),
    carrots: state.carrots.map(c => ({ x: c.x, y: c.y, active: c.active })),
    springs: state.springs.map(s => ({
      x: s.x, y: s.y,
      bounceTimer: s.bounceTimer, life: s.life, growTimer: s.growTimer,
    })),
    thorns: state.thorns.map(t => ({
      x: t.x, y: t.y,
      life: t.life, growTimer: t.growTimer, hit: t.hit,
    })),
    ghosts: state.ghosts.map(g => ({
      x: g.x, y: g.y, vx: g.vx, wobblePhase: g.wobblePhase,
    })),
    lavaRocks: state.lavaRocks.map(r => ({
      x: r.x, y: r.y, vy: r.vy, active: r.active,
    })),
    geyserStates: state.geyserStates.map(gs => ({
      timer: gs.timer, active: gs.active, activeTimer: gs.activeTimer,
    })),
    killFeed: state.killFeed,
    timeElapsed: state.timeElapsed,
    countdown: state.countdown,
    dayPhase: state.dayPhase,
    matchOver: state.matchOver,
    winner: state.winner,
    screenShake: state.screenShake,
    slowMotion: state.slowMotion,
    screenFlash: state.screenFlash,
    hitstopZoom: state.hitstopZoom,
    scoreAnimations: state.scoreAnimations,
  };
}

// ---- Delta compression (re-exported from core) ----
export { createDelta, applyDelta } from './core/deltaCompression';
