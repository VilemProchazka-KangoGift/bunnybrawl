/**
 * Microbench: schema-driven encoder vs. inlined encoder (kept here as a
 * reference implementation). Run via:
 *   npx vite-node scripts/benchSnapshotEncode.ts
 *
 * Acceptance gate for Phase 12: schema path within 5% of inlined.
 *
 * Inputs:
 *   - 5-player roster (full max)
 *   - Mix of zero / non-zero timers (exercises timerMask branches)
 *   - 6 carrots / 1 spring / 1 thorn / 1 ghost / 1 lava rock / 1 geyser
 *
 * Both encoders write to the same shared 4KB buffer. Inlined encoder is
 * inlined here verbatim from the pre-cutover binaryCodec.ts so that the
 * bench survives Phase 12 cutover.
 */
import { takeAuthSnapshot, encodeSnapshot } from '../src/engine/net/snapshot/index.ts';
import { encodeSlot } from '../src/engine/net/protocol.ts';
import type {
  AuthSnapshot, SnapshotPlayer,
} from '../src/engine/net/snapshot/types.ts';
import type {
  MatchState, PlayerSlot, KillFeedEntry, MatchPhase, PlayerState,
} from '../src/engine/types.ts';

// ---- Inlined reference (pre-Phase-12) ----

const PLAYER_STATE_MAP_REF: Record<PlayerState, number> = {
  idle: 0, run: 1, airborne: 2, splat: 3, respawning: 4,
};
const EXPRESSION_MAP_REF: Record<string, number> = {
  normal: 0, scared: 1, angry: 2, dizzy: 3,
};
const REF_BUF = new ArrayBuffer(4096);
const REF_VIEW = new DataView(REF_BUF);

function refEncodeTimer(t: number): number {
  if (t <= 0) return 0;
  return Math.min(Math.round(t * 60), 255);
}
function refEncodeInt16(v: number): number {
  const r = Math.round(v);
  return r < -32767 ? -32767 : r > 32767 ? 32767 : r;
}
function refWritePackedBools(o: number, n: number, get: (i: number) => boolean): number {
  const byteCount = (n + 7) >> 3;
  for (let b = 0; b < byteCount; b++) {
    let byte = 0;
    const base = b * 8;
    const end = base + 8 <= n ? 8 : n - base;
    for (let bit = 0; bit < end; bit++) {
      if (get(base + bit)) byte |= (1 << bit);
    }
    REF_VIEW.setUint8(o++, byte);
  }
  return o;
}

function refEncodeSnapshot(snap: AuthSnapshot): number {
  let o = 0;
  REF_VIEW.setUint32(o, snap.frame, true); o += 4;
  REF_VIEW.setUint8(o++, snap.players.length);
  for (const p of snap.players) {
    REF_VIEW.setUint8(o++, encodeSlot(p.id));
    REF_VIEW.setFloat32(o, p.x, true); o += 4;
    REF_VIEW.setFloat32(o, p.y, true); o += 4;
    REF_VIEW.setInt16(o, refEncodeInt16(p.vx), true); o += 2;
    REF_VIEW.setInt16(o, refEncodeInt16(p.vy), true); o += 2;
    REF_VIEW.setUint8(o++, PLAYER_STATE_MAP_REF[p.state] ?? 0);
    const dfSide = p.damageFlashSide === 'left' ? 1 : p.damageFlashSide === 'right' ? 2 : 0;
    const flags =
      (p.facing === 'right' ? 1 : 0) |
      (p.fastFalling ? 2 : 0) |
      (p.disconnected ? 4 : 0) |
      (p.active ? 8 : 0) |
      ((EXPRESSION_MAP_REF[p.expression] ?? 0) << 4) |
      (dfSide << 6);
    REF_VIEW.setUint8(o++, flags);
    REF_VIEW.setUint8(o++, p.animFrame & 0xFF);
    REF_VIEW.setUint16(o, Math.min(p.score, 65535), true); o += 2;

    const hitstop = refEncodeTimer(p.hitstopTimer);
    const invinc = refEncodeTimer(p.invincibleTimer);
    const splat = refEncodeTimer(p.splatTimer);
    const respawn = refEncodeTimer(p.respawnTimer);
    const fat = refEncodeTimer(p.fatTimer);
    const slow = refEncodeTimer(p.slowTimer);
    const burn = refEncodeTimer(p.burnTimer);
    const dfTimer = refEncodeTimer(p.damageFlashTimer);
    const timerMask =
      (hitstop ? 1 : 0) |
      (invinc ? 2 : 0) |
      (splat ? 4 : 0) |
      (respawn ? 8 : 0) |
      (fat ? 16 : 0) |
      (slow ? 32 : 0) |
      (burn ? 64 : 0) |
      (dfTimer ? 128 : 0);
    REF_VIEW.setUint8(o++, timerMask);
    if (hitstop) REF_VIEW.setUint8(o++, hitstop);
    if (invinc) REF_VIEW.setUint8(o++, invinc);
    if (splat) REF_VIEW.setUint8(o++, splat);
    if (respawn) REF_VIEW.setUint8(o++, respawn);
    if (fat) REF_VIEW.setUint8(o++, fat);
    if (slow) REF_VIEW.setUint8(o++, slow);
    if (burn) REF_VIEW.setUint8(o++, burn);
    if (dfTimer) REF_VIEW.setUint8(o++, dfTimer);

    REF_VIEW.setUint8(o++, Math.round(p.squashScale * 50) & 0xFF);
    REF_VIEW.setUint16(o, Math.min(p.killStreak, 65535), true); o += 2;
    REF_VIEW.setUint8(o++, Math.min(Math.round(p.width), 255));
    REF_VIEW.setUint8(o++, Math.min(Math.round(p.height), 255));
    REF_VIEW.setUint8(o++, Math.round(p.sideSquash * 50) & 0xFF);
  }

  // Carrots
  REF_VIEW.setUint8(o++, snap.carrots.length);
  o = refWritePackedBools(o, snap.carrots.length, i => snap.carrots[i].active);
  for (const c of snap.carrots) {
    REF_VIEW.setFloat32(o, c.x, true); o += 4;
    REF_VIEW.setFloat32(o, c.y, true); o += 4;
  }
  // Springs
  REF_VIEW.setUint8(o++, snap.springs.length);
  for (const s of snap.springs) {
    REF_VIEW.setFloat32(o, s.x, true); o += 4;
    REF_VIEW.setFloat32(o, s.y, true); o += 4;
    REF_VIEW.setFloat32(o, s.bounceTimer, true); o += 4;
    REF_VIEW.setFloat32(o, s.life, true); o += 4;
    REF_VIEW.setFloat32(o, s.growTimer, true); o += 4;
  }
  // Thorns
  REF_VIEW.setUint8(o++, snap.thorns.length);
  o = refWritePackedBools(o, snap.thorns.length, i => snap.thorns[i].hit);
  for (const t of snap.thorns) {
    REF_VIEW.setFloat32(o, t.x, true); o += 4;
    REF_VIEW.setFloat32(o, t.y, true); o += 4;
    REF_VIEW.setFloat32(o, t.life, true); o += 4;
    REF_VIEW.setFloat32(o, t.growTimer, true); o += 4;
  }
  // Ghosts
  REF_VIEW.setUint8(o++, snap.ghosts.length);
  for (const g of snap.ghosts) {
    REF_VIEW.setFloat32(o, g.x, true); o += 4;
    REF_VIEW.setFloat32(o, g.y, true); o += 4;
    REF_VIEW.setFloat32(o, g.vx, true); o += 4;
    REF_VIEW.setFloat32(o, g.wobblePhase, true); o += 4;
  }
  // Lava rocks
  REF_VIEW.setUint8(o++, snap.lavaRocks.length);
  o = refWritePackedBools(o, snap.lavaRocks.length, i => snap.lavaRocks[i].active);
  for (const r of snap.lavaRocks) {
    REF_VIEW.setFloat32(o, r.x, true); o += 4;
    REF_VIEW.setFloat32(o, r.y, true); o += 4;
    REF_VIEW.setFloat32(o, r.vy, true); o += 4;
  }
  // Geyser states
  REF_VIEW.setUint8(o++, snap.geyserStates.length);
  o = refWritePackedBools(o, snap.geyserStates.length, i => snap.geyserStates[i].active);
  for (const gs of snap.geyserStates) {
    REF_VIEW.setFloat32(o, gs.timer, true); o += 4;
    REF_VIEW.setFloat32(o, gs.activeTimer, true); o += 4;
  }
  // Kill feed
  const kfLen = Math.min(snap.killFeed.length, 5);
  REF_VIEW.setUint8(o++, kfLen);
  for (let i = snap.killFeed.length - kfLen; i < snap.killFeed.length; i++) {
    const kf = snap.killFeed[i];
    REF_VIEW.setUint8(o++, encodeSlot(kf.attacker));
    REF_VIEW.setUint8(o++, encodeSlot(kf.victim));
    REF_VIEW.setFloat32(o, kf.timestamp, true); o += 4;
  }
  REF_VIEW.setUint16(o, Math.min(snap.totalKills, 65535), true); o += 2;
  REF_VIEW.setFloat32(o, snap.timeElapsed, true); o += 4;
  REF_VIEW.setFloat32(o, snap.countdown, true); o += 4;
  REF_VIEW.setFloat32(o, snap.dayPhase, true); o += 4;
  REF_VIEW.setFloat32(o, snap.screenShake, true); o += 4;
  REF_VIEW.setFloat32(o, snap.slowMotion, true); o += 4;
  REF_VIEW.setFloat32(o, snap.screenFlash, true); o += 4;
  REF_VIEW.setFloat32(o, snap.hitstopZoom, true); o += 4;
  const phaseBits = snap.phase === 'loading' ? 0 : snap.phase === 'playing' ? 1 : 2;
  REF_VIEW.setUint8(o++, (snap.matchOver ? 1 : 0) | (snap.winner ? 2 : 0) | (phaseBits << 2));
  if (snap.winner) REF_VIEW.setUint8(o++, encodeSlot(snap.winner));
  const saLen = Math.min(snap.scoreAnimations.length, 10);
  REF_VIEW.setUint8(o++, saLen);
  for (let i = 0; i < saLen; i++) {
    const sa = snap.scoreAnimations[i];
    REF_VIEW.setUint8(o++, encodeSlot(sa.playerId));
    REF_VIEW.setUint8(o++, sa.value & 0xFF);
    REF_VIEW.setFloat32(o, sa.timer, true); o += 4;
  }
  return o;
}

// ---- Build a representative state ----

function buildState(): MatchState {
  const players: SnapshotPlayer[] = (['P1', 'P2', 'P3', 'P4', 'P5'] as PlayerSlot[]).map((id, i) => ({
    id,
    x: 100 + i * 50,
    y: 400 + (i % 2) * 30,
    vx: i * 10,
    vy: i % 2 ? -120 : 0,
    state: (i % 3 === 0 ? 'idle' : i % 3 === 1 ? 'run' : 'airborne') as PlayerState,
    facing: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
    animFrame: i,
    score: i * 2,
    hitstopTimer: 0,
    invincibleTimer: i * 0.1,
    fastFalling: i % 2 === 1,
    splatTimer: 0,
    respawnTimer: 0,
    fatTimer: 0,
    slowTimer: 0.1,
    burnTimer: i % 2 ? 0.05 : 0,
    squashScale: 1,
    expression: (i % 2 ? 'normal' : 'angry') as 'normal' | 'scared' | 'angry' | 'dizzy',
    killStreak: i,
    disconnected: false,
    active: true,
    width: 32,
    height: 32,
    sideSquash: 1,
    damageFlashTimer: i % 2 ? 0.05 : 0,
    damageFlashSide: (i % 2 ? 'left' : null) as 'left' | 'right' | null,
  }));
  return {
    phase: 'playing' as MatchPhase,
    players,
    carrots: Array.from({ length: 6 }, (_, k) => ({ x: 200 + k * 100, y: 350, active: k % 2 === 0 })),
    springs: [{ x: 320, y: 640, bounceTimer: 0.1, life: 5, growTimer: 0.3 }],
    thorns: [{ x: 900, y: 640, life: 8, growTimer: 0, hit: false }],
    ghosts: [{ x: 700, y: 400, vx: -30, wobblePhase: 1.25 }],
    lavaRocks: [{ x: 500, y: 200, vy: 250, active: true }],
    geyserStates: [{ timer: 1.5, active: false, activeTimer: 0 }],
    killFeed: [] as KillFeedEntry[],
    totalKills: 5,
    timeElapsed: 42.5,
    countdown: 0,
    dayPhase: 0.25,
    matchOver: false,
    winner: null,
    screenShake: 0,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [],
  } as unknown as MatchState;
}

function bench(label: string, iters: number, fn: () => void): number {
  for (let i = 0; i < 2000; i++) fn(); // warm-up
  const samples: number[] = [];
  for (let s = 0; s < 5; s++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[2];
  console.log(`${label}: median ${median.toFixed(2)} ms / ${iters} iters (samples: ${samples.map((s) => s.toFixed(2)).join(', ')})`);
  return median;
}

const ITERS = 10_000;
const state = buildState();
const snap = takeAuthSnapshot(42, state);

// 1) Reference inlined encoder (pre-Phase-12 baseline)
const refMs = bench('inlined  reference', ITERS, () => {
  refEncodeSnapshot(snap);
});

// 2) Schema-driven encoder (current encodeSnapshot post-Phase-12)
const newMs = bench('schema   encodeSnapshot', ITERS, () => {
  encodeSnapshot(snap);
});

const ratio = newMs / refMs;
console.log('');
console.log(`Schema / inlined-ref ratio: ${ratio.toFixed(3)}  (1.00 = parity, 1.05 = 5% slower)`);
if (ratio <= 1.05) {
  console.log('PASS: schema codec is within 5% of the inlined reference.');
} else {
  console.log(`FAIL: ${((ratio - 1) * 100).toFixed(1)}% regression — investigate before merge.`);
}
