/**
 * Netcode hot-path microbenchmark.
 *
 * Measures the cost of the per-frame guest snapshot pipeline:
 *   1. encodeSnapshot   — host hot path, ~60 calls/sec
 *   2. decodeSnapshot   — guest hot path, ~60 calls/sec, with and without pool
 *   3. applySnapshotToState — guest hot path, ~60 calls/sec
 *
 * Builds a representative match state (5 players, 6 carrots, 4 springs,
 * 4 thorns, 8 ghosts, 8 lava rocks, 4 geysers, killFeed) so the benchmark
 * exercises the same allocation patterns as a real match.
 *
 * Usage: npx vite-node scripts/bench-netcode.ts
 */

import { performance } from 'node:perf_hooks';
import { registerBuiltinArenas } from '../src/engine/arenas/builtin';
import { registerBuiltinCharacters } from '../src/engine/characters/builtin';
import { getArena } from '../src/engine/arenas';
import {
  takeAuthSnapshot, encodeSnapshot, decodeSnapshot, createEmptySnapshot,
  applySnapshotToState,
} from '../src/engine/net';
import type { MatchState } from '../src/engine/types';

registerBuiltinArenas();
registerBuiltinCharacters();

// --- Build a representative match state -------------------------------------

function makeRichState(): MatchState {
  const arena = getArena('space_station');
  const state: MatchState = {
    phase: 'playing',
    players: [],
    carrots: [],
    springs: [],
    thorns: [],
    ghosts: [],
    lavaRocks: [],
    geyserStates: [],
    killFeed: [],
    totalKills: 0,
    timeElapsed: 12.5,
    countdown: 0,
    dayPhase: 0.3,
    matchOver: false,
    winner: null,
    screenShake: 0.05,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [],
    splatMarks: [],
    newSplatsSinceRender: [],
    bouncyWobble: new Map(),
    pigeonFlocks: [],
    stats: { perPlayer: new Map() },
  } as unknown as MatchState;

  // 5 players in mid-match conditions
  const slots = ['P1', 'P2', 'P3', 'P4', 'B1'] as const;
  for (let i = 0; i < 5; i++) {
    state.players.push({
      id: slots[i],
      x: 200 + i * 150,
      y: 400 + Math.sin(i) * 50,
      vx: (i % 2 === 0 ? 1 : -1) * 180,
      vy: i === 2 ? -340 : 0,
      width: 32,
      height: 32,
      state: i === 2 ? 'airborne' : 'run',
      facing: i % 2 === 0 ? 'right' : 'left',
      animFrame: i % 4,
      animTimer: 0.05,
      score: i * 3,
      hitstopTimer: i === 1 ? 0.05 : 0,
      invincibleTimer: i === 0 ? 0.6 : 0,
      fastFalling: false,
      splatTimer: 0,
      respawnTimer: 0,
      fatTimer: i === 3 ? 1.2 : 0,
      slowTimer: 0,
      burnTimer: i === 4 ? 0.4 : 0,
      squashScale: 1.0,
      sideSquash: 1.0,
      damageFlashTimer: i === 1 ? 0.1 : 0,
      damageFlashSide: i === 1 ? 'left' : null,
      expression: 'normal',
      killStreak: i === 0 ? 3 : 0,
      disconnected: false,
      active: true,
      springTrailTimer: 0,
      squashTimer: 0,
      idleAction: null,
      idleActionTimer: 0,
      idleActionDuration: 0,
      afterimages: [],
      isInZeroG: false,
    } as unknown as MatchState['players'][number]);
  }

  // Entities — counts roughly matching space station + active gameplay
  for (let i = 0; i < 6; i++) {
    state.carrots.push({ x: 100 + i * 180, y: 300, active: i % 2 === 0, spawnTime: 0 });
  }
  for (let i = 0; i < 4; i++) {
    state.springs.push({
      x: 250 + i * 200, y: 350, platformIndex: i,
      bounceTimer: 0, life: 8 - i, growTimer: 0,
    });
  }
  for (let i = 0; i < 4; i++) {
    state.thorns.push({
      x: 300 + i * 150, y: 380, width: 20, height: 20,
      platformIndex: i, life: 6 - i, growTimer: 0, hit: false,
    });
  }
  for (let i = 0; i < 8; i++) {
    state.ghosts.push({
      x: 100 + i * 120, y: 200 + (i % 3) * 80,
      vx: (i % 2 === 0 ? 1 : -1) * 30,
      size: 30, alpha: 0.6, wobblePhase: i * 0.3,
    });
  }
  for (let i = 0; i < 8; i++) {
    state.lavaRocks.push({
      x: 200 + i * 100, y: 100 + i * 30,
      vy: 200 + i * 20, size: 10, rotation: i * 0.5,
      active: true,
    });
  }
  for (let i = 0; i < 4; i++) {
    state.geyserStates.push({ timer: 1 + i * 0.5, active: i % 2 === 0, activeTimer: 0.3 });
  }
  // killFeed (HUD slice)
  for (let i = 0; i < 4; i++) {
    state.killFeed.push({
      attacker: slots[i % slots.length],
      victim: slots[(i + 1) % slots.length],
      timestamp: 11 - i * 0.5,
    });
  }
  state.totalKills = 12;
  // scoreAnimations
  for (let i = 0; i < 3; i++) {
    state.scoreAnimations.push({
      playerId: slots[i],
      value: i + 1,
      timer: 1.0 - i * 0.3,
    });
  }

  // Avoid arena export warning
  void arena;
  return state;
}

// --- Benchmark harness ------------------------------------------------------

function bench(name: string, iterations: number, fn: () => void): { name: string; opsPerSec: number; nsPerOp: number; totalMs: number } {
  // Warm-up to let V8 optimize the hot path
  for (let i = 0; i < Math.min(1000, iterations / 10); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;
  const opsPerSec = (iterations / totalMs) * 1000;
  const nsPerOp = (totalMs / iterations) * 1e6;
  return { name, opsPerSec, nsPerOp, totalMs };
}

function fmt(n: number, places = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: places });
}

// --- Run benchmarks ---------------------------------------------------------

console.log('Building representative match state…');
const state = makeRichState();
const snap = takeAuthSnapshot(42, state);

// Encode once to get the wire buffer for decode benchmarks.
const encoded = encodeSnapshot(snap);
const wireBuf = encoded.buffer.slice(0, encoded.length); // copy out so the shared encode buf isn't aliased

console.log(`Snapshot wire size: ${encoded.length} bytes`);
console.log(`Players: ${snap.players.length}, carrots: ${snap.carrots.length}, springs: ${snap.springs.length}, thorns: ${snap.thorns.length}, ghosts: ${snap.ghosts.length}, lavaRocks: ${snap.lavaRocks.length}, geysers: ${snap.geyserStates.length}, killFeed: ${snap.killFeed.length}`);
console.log('');

const ITERATIONS = 100_000;
console.log(`Running ${fmt(ITERATIONS)} iterations per benchmark…\n`);

// Sinks consume return values so V8 can't eliminate the calls as dead code.
let SINK_X = 0;
let SINK_LEN = 0;

// 1. encodeSnapshot
const r1 = bench('encodeSnapshot', ITERATIONS, () => {
  const r = encodeSnapshot(snap);
  SINK_LEN += r.length;
});

// 2. decodeSnapshot WITHOUT pool (allocating, old behavior)
const r2 = bench('decodeSnapshot — no pool (allocating)', ITERATIONS, () => {
  const s = decodeSnapshot(wireBuf);
  if (s) SINK_X += s.players.length;
});

// 3. decodeSnapshot WITH pool (in-place, new behavior)
const pool: ReturnType<typeof createEmptySnapshot>[] = Array.from(
  { length: 30 }, () => createEmptySnapshot(),
);
let poolIdx = 0;
const r3 = bench('decodeSnapshot — pooled (in-place)', ITERATIONS, () => {
  const out = pool[poolIdx];
  poolIdx = (poolIdx + 1) % pool.length;
  const s = decodeSnapshot(wireBuf, 0, out);
  if (s) SINK_X += s.players.length;
});

// 4. applySnapshotToState
const targetState = makeRichState(); // separate state to apply into
const r4 = bench('applySnapshotToState', ITERATIONS, () => {
  applySnapshotToState(snap, targetState);
  SINK_X += targetState.players.length;
});

// Memory pressure: count allocations indirectly via heap delta.
// Run a lot of decodes back-to-back, force GC if available, measure heap.
function measureHeap(label: string, iterations: number, fn: () => void): void {
  if (typeof global.gc !== 'function') return;
  global.gc(); global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) fn();
  const afterPre = process.memoryUsage().heapUsed;
  global.gc(); global.gc();
  const afterPost = process.memoryUsage().heapUsed;
  const peak = (afterPre - before) / 1024;
  const retained = (afterPost - before) / 1024;
  console.log(`  ${label}: peak +${peak.toFixed(0)} KB, retained ${retained > 0 ? '+' : ''}${retained.toFixed(0)} KB after GC`);
}

// --- Report ----------------------------------------------------------------

const rows = [r1, r2, r3, r4];
const nameW = Math.max(...rows.map(r => r.name.length));
console.log('Results:');
console.log('-'.repeat(nameW + 60));
console.log(
  'name'.padEnd(nameW) + '  '
  + 'ops/sec'.padStart(14) + '  '
  + 'ns/op'.padStart(10) + '  '
  + 'total ms'.padStart(10),
);
console.log('-'.repeat(nameW + 60));
for (const r of rows) {
  console.log(
    r.name.padEnd(nameW) + '  '
    + fmt(r.opsPerSec).padStart(14) + '  '
    + fmt(r.nsPerOp).padStart(10) + '  '
    + fmt(r.totalMs, 1).padStart(10),
  );
}
console.log('');

// Pool speedup analysis
const speedup = (r2.nsPerOp / r3.nsPerOp);
const savedNsPerOp = r2.nsPerOp - r3.nsPerOp;
const savedMsPerSec = (savedNsPerOp * 60) / 1e6;
console.log('Pool analysis:');
console.log(`  Speedup: ${speedup.toFixed(2)}× (${((speedup - 1) * 100).toFixed(1)}% faster)`);
console.log(`  Saved per snapshot: ${fmt(savedNsPerOp)} ns`);
console.log(`  Saved per second of gameplay (60 snap/s): ${savedMsPerSec.toFixed(2)} ms`);

// Frame budget analysis (60Hz = 16.67ms budget)
console.log('\nFrame budget impact (16.67 ms @ 60 Hz):');
const decodeNoPoolMsPerFrame = r2.nsPerOp / 1e6;
const decodePoolMsPerFrame = r3.nsPerOp / 1e6;
const applyMsPerFrame = r4.nsPerOp / 1e6;
console.log(`  decode (no pool):  ${decodeNoPoolMsPerFrame.toFixed(3)} ms (${(decodeNoPoolMsPerFrame / 16.67 * 100).toFixed(2)}% of frame)`);
console.log(`  decode (pooled):   ${decodePoolMsPerFrame.toFixed(3)} ms (${(decodePoolMsPerFrame / 16.67 * 100).toFixed(2)}% of frame)`);
console.log(`  applySnapshotToState: ${applyMsPerFrame.toFixed(3)} ms (${(applyMsPerFrame / 16.67 * 100).toFixed(2)}% of frame)`);
