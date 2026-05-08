/**
 * Binary snapshot codec for host-authoritative netcode.
 *
 * Wire format is byte-locked by `snapshot-wire-format.test.ts` and
 * versioned by `PROTOCOL_VERSION` in `net/core/protocol.ts`. Any change
 * to the byte layout REQUIRES a `PROTOCOL_VERSION` bump.
 *
 * Pure (Node-safe): zero imports from gameplay (`engine/types` is type-only).
 *
 * Design goals:
 * - ~50 bytes per player, ~4 bytes per entity
 * - Zero allocation in steady state (pre-allocated buffers)
 * - Delta compression: unchanged frames ≈ 40-80 bytes
 */
import type {
  PlayerSlot, PlayerState, KillFeedEntry, MatchPhase,
} from '../../types';
import { encodeSlot, decodeSlot } from '../protocol';
import type { AuthSnapshot, SnapshotPlayer } from './types';

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

/** Reused boolean array for readPackedBools — avoids `new Array(n)` per call.
 *  Decoder is single-threaded; the buffer is consumed before the next read. */
const PACKED_BOOLS_OUT: boolean[] = [];

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

/** Clamp a number to int16 range with rounding. */
function encodeInt16(v: number): number {
  const r = Math.round(v);
  return r < -32767 ? -32767 : r > 32767 ? 32767 : r;
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

/** Read N booleans from ceil(N/8) bitfield bytes. Returns [bools, newOffset].
 *  Reuses the module-scope `PACKED_BOOLS_OUT` array — caller must consume the
 *  result before the next call. */
function readPackedBools(view: DataView, o: number, n: number): [boolean[], number] {
  const byteCount = (n + 7) >> 3;
  const bools = PACKED_BOOLS_OUT;
  bools.length = n;
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
    // Velocity is visual/extrapolation data; int16 (±32767, 1-unit precision) is plenty.
    ENCODE_VIEW.setInt16(o, encodeInt16(p.vx), true); o += 2;
    ENCODE_VIEW.setInt16(o, encodeInt16(p.vy), true); o += 2;
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
    // Score / killStreak as Uint16 so mods (or carrots) that push past 255
    // don't silently freeze the guest's view of the scoreboard.
    ENCODE_VIEW.setUint16(o, Math.min(p.score, 65535), true); o += 2;

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
    ENCODE_VIEW.setUint16(o, Math.min(p.killStreak, 65535), true); o += 2;
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

  // Match-wide stomp counter — separate from the trimmed killFeed slice above
  // so guests can show an accurate "Total Splats" count without us having to
  // wire all kills onto the wire.
  ENCODE_VIEW.setUint16(o, Math.min(snap.totalKills, 65535), true); o += 2;

  // Global state
  ENCODE_VIEW.setFloat32(o, snap.timeElapsed, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.countdown, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.dayPhase, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.screenShake, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.slowMotion, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.screenFlash, true); o += 4;
  ENCODE_VIEW.setFloat32(o, snap.hitstopZoom, true); o += 4;

  // Match state flags
  // Bits: 0=matchOver, 1=winner-present, 2-3=phase (0=loading, 1=playing, 2=over)
  const phaseBits = snap.phase === 'loading' ? 0 : snap.phase === 'playing' ? 1 : 2;
  ENCODE_VIEW.setUint8(o++, (snap.matchOver ? 1 : 0) | (snap.winner ? 2 : 0) | (phaseBits << 2));
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

  // Defense in depth: every individual setFloat32/setUint16 past
  // MAX_SNAPSHOT_BYTES already throws RangeError, but a final assertion gives
  // a clearer signal of "snapshot grew past budget" if a future caller adds
  // a field that fits within the buffer for typical entity counts but
  // overflows on edge cases (e.g. carrot-rain mods).
  if (o > MAX_SNAPSHOT_BYTES) {
    throw new Error(`encodeSnapshot: ${o} bytes exceeds MAX_SNAPSHOT_BYTES (${MAX_SNAPSHOT_BYTES})`);
  }

  return { buffer: ENCODE_BUF, length: o };
}

/**
 * Decode a binary snapshot back into an AuthSnapshot object.
 *
 * If `out` is provided, writes into it in-place — pooled reuse pattern. Inner
 * arrays grow on demand and are trimmed via `length = N`; per-element objects
 * are mutated in place (allocated only when growing past current length). Net
 * allocations in steady state: zero. Without `out`, behaves like the original
 * allocating decoder (used by tests).
 *
 * `offset` lets callers skip a leading wrapper byte without `buf.slice(1)`.
 */
export function decodeSnapshot(buf: ArrayBuffer, offset = 0, out?: AuthSnapshot): AuthSnapshot | null {
  if (buf.byteLength - offset < 5) return null;
  try {
  const view = new DataView(buf, offset);
  let o = 0;

  const frame = view.getUint32(o, true); o += 4;

  // Players
  const playerCount = view.getUint8(o++);
  const players = out ? out.players : [];
  if (out && players.length > playerCount) players.length = playerCount;
  for (let i = 0; i < playerCount; i++) {
    const id = decodeSlotAs(view.getUint8(o++));
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vx = view.getInt16(o, true); o += 2;
    const vy = view.getInt16(o, true); o += 2;
    const stateIdx = view.getUint8(o++);
    const flags = view.getUint8(o++);
    const animFrame = view.getUint8(o++);
    const score = view.getUint16(o, true); o += 2;

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
    const killStreak = view.getUint16(o, true); o += 2;
    const width = view.getUint8(o++);
    const height = view.getUint8(o++);
    const sideSquash = view.getUint8(o++) / 50;

    const dfSide = (flags >> 6) & 3;
    const damageFlashSide: 'left' | 'right' | null = dfSide === 1 ? 'left' : dfSide === 2 ? 'right' : null;
    const state = PLAYER_STATE_REVERSE[stateIdx] ?? 'idle';
    const facing: 'left' | 'right' = (flags & 1) ? 'right' : 'left';
    const fastFalling = !!(flags & 2);
    const disconnected = !!(flags & 4);
    const active = !!(flags & 8);
    const expression = EXPRESSION_REVERSE[(flags >> 4) & 3] ?? 'normal';

    if (out && i < players.length) {
      const p = players[i];
      p.id = id; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.state = state; p.facing = facing; p.fastFalling = fastFalling;
      p.disconnected = disconnected; p.active = active; p.expression = expression;
      p.animFrame = animFrame; p.score = score;
      p.hitstopTimer = hitstopTimer; p.invincibleTimer = invincibleTimer;
      p.splatTimer = splatTimer; p.respawnTimer = respawnTimer;
      p.fatTimer = fatTimer; p.slowTimer = slowTimer; p.burnTimer = burnTimer;
      p.squashScale = squashScale; p.killStreak = killStreak;
      p.width = width; p.height = height; p.sideSquash = sideSquash;
      p.damageFlashTimer = damageFlashTimer; p.damageFlashSide = damageFlashSide;
    } else {
      players.push({
        id, x, y, vx, vy, state, facing, fastFalling, disconnected, active,
        expression, animFrame, score,
        hitstopTimer, invincibleTimer, splatTimer, respawnTimer,
        fatTimer, slowTimer, burnTimer,
        squashScale, killStreak, width, height, sideSquash,
        damageFlashTimer, damageFlashSide,
      });
    }
  }

  // Carrots
  const carrotCount = view.getUint8(o++);
  let carrotActives: boolean[];
  [carrotActives, o] = readPackedBools(view, o, carrotCount);
  const carrots = out ? out.carrots : [] as AuthSnapshot['carrots'];
  if (out && carrots.length > carrotCount) carrots.length = carrotCount;
  for (let i = 0; i < carrotCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const active = carrotActives[i];
    if (out && i < carrots.length) {
      carrots[i].x = x; carrots[i].y = y; carrots[i].active = active;
    } else {
      carrots.push({ x, y, active });
    }
  }

  // Springs
  const springCount = view.getUint8(o++);
  const springs = out ? out.springs : [] as AuthSnapshot['springs'];
  if (out && springs.length > springCount) springs.length = springCount;
  for (let i = 0; i < springCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const bounceTimer = view.getFloat32(o, true); o += 4;
    const life = view.getFloat32(o, true); o += 4;
    const growTimer = view.getFloat32(o, true); o += 4;
    if (out && i < springs.length) {
      const s = springs[i];
      s.x = x; s.y = y; s.bounceTimer = bounceTimer; s.life = life; s.growTimer = growTimer;
    } else {
      springs.push({ x, y, bounceTimer, life, growTimer });
    }
  }

  // Thorns
  const thornCount = view.getUint8(o++);
  let thornHits: boolean[];
  [thornHits, o] = readPackedBools(view, o, thornCount);
  const thorns = out ? out.thorns : [] as AuthSnapshot['thorns'];
  if (out && thorns.length > thornCount) thorns.length = thornCount;
  for (let i = 0; i < thornCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const life = view.getFloat32(o, true); o += 4;
    const growTimer = view.getFloat32(o, true); o += 4;
    const hit = thornHits[i];
    if (out && i < thorns.length) {
      const t = thorns[i];
      t.x = x; t.y = y; t.life = life; t.growTimer = growTimer; t.hit = hit;
    } else {
      thorns.push({ x, y, life, growTimer, hit });
    }
  }

  // Ghosts
  const ghostCount = view.getUint8(o++);
  const ghosts = out ? out.ghosts : [] as AuthSnapshot['ghosts'];
  if (out && ghosts.length > ghostCount) ghosts.length = ghostCount;
  for (let i = 0; i < ghostCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vx = view.getFloat32(o, true); o += 4;
    const wobblePhase = view.getFloat32(o, true); o += 4;
    if (out && i < ghosts.length) {
      const g = ghosts[i];
      g.x = x; g.y = y; g.vx = vx; g.wobblePhase = wobblePhase;
    } else {
      ghosts.push({ x, y, vx, wobblePhase });
    }
  }

  // Lava rocks
  const lrCount = view.getUint8(o++);
  let lrActives: boolean[];
  [lrActives, o] = readPackedBools(view, o, lrCount);
  const lavaRocks = out ? out.lavaRocks : [] as AuthSnapshot['lavaRocks'];
  if (out && lavaRocks.length > lrCount) lavaRocks.length = lrCount;
  for (let i = 0; i < lrCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const vy = view.getFloat32(o, true); o += 4;
    const active = lrActives[i];
    if (out && i < lavaRocks.length) {
      const r = lavaRocks[i];
      r.x = x; r.y = y; r.vy = vy; r.active = active;
    } else {
      lavaRocks.push({ x, y, vy, active });
    }
  }

  // Geyser states
  const gsCount = view.getUint8(o++);
  let gsActives: boolean[];
  [gsActives, o] = readPackedBools(view, o, gsCount);
  const geyserStates = out ? out.geyserStates : [] as AuthSnapshot['geyserStates'];
  if (out && geyserStates.length > gsCount) geyserStates.length = gsCount;
  for (let i = 0; i < gsCount; i++) {
    const timer = view.getFloat32(o, true); o += 4;
    const activeTimer = view.getFloat32(o, true); o += 4;
    const active = gsActives[i];
    if (out && i < geyserStates.length) {
      const g = geyserStates[i];
      g.timer = timer; g.active = active; g.activeTimer = activeTimer;
    } else {
      geyserStates.push({ timer, active, activeTimer });
    }
  }

  // Kill feed
  const kfLen = view.getUint8(o++);
  const killFeed = out ? out.killFeed : [] as KillFeedEntry[];
  if (out && killFeed.length > kfLen) killFeed.length = kfLen;
  for (let i = 0; i < kfLen; i++) {
    const attacker = decodeSlotAs(view.getUint8(o++));
    const victim = decodeSlotAs(view.getUint8(o++));
    const timestamp = view.getFloat32(o, true); o += 4;
    if (out && i < killFeed.length) {
      const k = killFeed[i];
      k.attacker = attacker; k.victim = victim; k.timestamp = timestamp;
    } else {
      killFeed.push({ attacker, victim, timestamp });
    }
  }

  // Match-wide stomp counter (Uint16) — accurate "Total Splats" for guests.
  const totalKills = view.getUint16(o, true); o += 2;

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
  const phaseBits = (matchFlags >> 2) & 3;
  const phase: MatchPhase = phaseBits === 0 ? 'loading' : phaseBits === 1 ? 'playing' : 'over';

  // Score animations
  const saLen = view.getUint8(o++);
  const scoreAnimations = out ? out.scoreAnimations : [] as AuthSnapshot['scoreAnimations'];
  if (out && scoreAnimations.length > saLen) scoreAnimations.length = saLen;
  for (let i = 0; i < saLen; i++) {
    const playerId = decodeSlotAs(view.getUint8(o++));
    const value = view.getUint8(o++);
    const timer = view.getFloat32(o, true); o += 4;
    if (out && i < scoreAnimations.length) {
      const s = scoreAnimations[i];
      s.playerId = playerId; s.value = value; s.timer = timer;
    } else {
      scoreAnimations.push({ playerId, value, timer });
    }
  }

  if (out) {
    out.frame = frame;
    out.phase = phase;
    out.totalKills = totalKills;
    out.timeElapsed = timeElapsed;
    out.countdown = countdown;
    out.dayPhase = dayPhase;
    out.matchOver = matchOver;
    out.winner = winner;
    out.screenShake = screenShake;
    out.slowMotion = slowMotion;
    out.screenFlash = screenFlash;
    out.hitstopZoom = hitstopZoom;
    return out;
  }

  return {
    frame, phase,
    players: players as SnapshotPlayer[],
    carrots: carrots as AuthSnapshot['carrots'],
    springs: springs as AuthSnapshot['springs'],
    thorns: thorns as AuthSnapshot['thorns'],
    ghosts: ghosts as AuthSnapshot['ghosts'],
    lavaRocks: lavaRocks as AuthSnapshot['lavaRocks'],
    geyserStates: geyserStates as AuthSnapshot['geyserStates'],
    killFeed: killFeed as KillFeedEntry[],
    totalKills,
    timeElapsed, countdown, dayPhase,
    matchOver, winner,
    screenShake, slowMotion, screenFlash, hitstopZoom,
    scoreAnimations: scoreAnimations as AuthSnapshot['scoreAnimations'],
  };
  } catch {
    // Corrupted or truncated buffer — return null instead of crashing
    return null;
  }
}
