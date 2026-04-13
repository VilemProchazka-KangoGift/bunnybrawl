/**
 * State snapshot/restore for rollback netcode.
 * Captures all gameplay-affecting state, skips cosmetic-only fields.
 */
import type {
  MatchState, Player, PlayerSlot, PlayerStats, PlayerState,
  Carrot, SpringMushroom, Thorn, KillFeedEntry, GhostEntity, LavaRock,
  InputState,
} from '../types';
import type { SeededRNG } from './prng';
import type { AIController } from '../ai/aiController';

// ---- Snapshot types (plain objects, no Maps) ----

export interface PlayerSnapshot {
  id: PlayerSlot;
  x: number; y: number;
  vx: number; vy: number;
  width: number; height: number;
  state: PlayerState;
  facing: 'left' | 'right';
  splatTimer: number;
  respawnTimer: number;
  invincibleTimer: number;
  score: number;
  active: boolean;
  animFrame: number;
  animTimer: number;
  fastFalling: boolean;
  fatTimer: number;
  slowTimer: number;
  squashScale: number;
  squashTimer: number;
  sideSquash: number;
  idleAnimTimer: number;
  expression: 'normal' | 'scared' | 'angry' | 'dizzy';
  killStreak: number;
  breathTimer: number;
  springTrailTimer: number;
  damageFlashSide: 'left' | 'right' | null;
  damageFlashTimer: number;
  burnTimer: number;
  hitstopTimer: number;
  disconnected: boolean;
}

export interface AISnapshot {
  ringBuffer: InputState[];
  ringWrite: number;
  ringRead: number;
  stuckTimer: number;
  lastX: number;
  lastY: number;
  jumpCooldown: number;
  lastScore: number;
  tauntTimer: number;
  searchTimer: number;
  wasIdle: boolean;
  frameCounter: number;
}

export interface GameSnapshot {
  frame: number;
  rngState: number;
  // Core gameplay
  players: PlayerSnapshot[];
  killFeed: KillFeedEntry[];
  timeElapsed: number;
  matchOver: boolean;
  winner: PlayerSlot | null;
  countdown: number;
  dayPhase: number;
  // Pickups & hazards
  carrots: Carrot[];
  carrotTimer: number;
  springs: SpringMushroom[];
  thorns: Thorn[];
  springSpawnTimer: number;
  thornSpawnTimer: number;
  ghosts: GhostEntity[];
  lavaRocks: LavaRock[];
  lavaRockTimer: number;
  // Environmental state
  geyserStates: Array<{ timer: number; active: boolean; activeTimer: number }>;
  pigeonFlocks: Array<{ x: number; y: number; active: boolean; respawnTimer: number }>;
  bouncyWobble: [number, number][];
  // VFX timers (affect gameplay via slowMotion)
  screenShake: number;
  slowMotion: number;
  screenFlash: number;
  hitstopZoom: number;
  // Score animations (visual but frame-coupled)
  scoreAnimations: Array<{ playerId: PlayerSlot; value: number; timer: number }>;
  shockwaves: Array<{ x: number; y: number; radius: number; maxRadius: number; life: number }>;
  // Stats
  stats: [PlayerSlot, PlayerStats][];
  // AI state
  aiStates: [string, AISnapshot][];
}

// ---- Snapshot Player ----

function snapshotPlayer(p: Player): PlayerSnapshot {
  return {
    id: p.id,
    x: p.x, y: p.y,
    vx: p.vx, vy: p.vy,
    width: p.width, height: p.height,
    state: p.state,
    facing: p.facing,
    splatTimer: p.splatTimer,
    respawnTimer: p.respawnTimer,
    invincibleTimer: p.invincibleTimer,
    score: p.score,
    active: p.active,
    animFrame: p.animFrame,
    animTimer: p.animTimer,
    fastFalling: p.fastFalling,
    fatTimer: p.fatTimer,
    slowTimer: p.slowTimer,
    squashScale: p.squashScale,
    squashTimer: p.squashTimer,
    sideSquash: p.sideSquash,
    idleAnimTimer: p.idleAnimTimer,
    expression: p.expression,
    killStreak: p.killStreak,
    breathTimer: p.breathTimer,
    springTrailTimer: p.springTrailTimer,
    damageFlashSide: p.damageFlashSide,
    damageFlashTimer: p.damageFlashTimer,
    burnTimer: p.burnTimer,
    hitstopTimer: p.hitstopTimer,
    disconnected: p.disconnected,
  };
}

/** Copy player fields into an existing PlayerSnapshot (zero allocation). */
function snapshotPlayerInto(target: PlayerSnapshot, p: Player): void {
  target.id = p.id;
  target.x = p.x; target.y = p.y;
  target.vx = p.vx; target.vy = p.vy;
  target.width = p.width; target.height = p.height;
  target.state = p.state;
  target.facing = p.facing;
  target.splatTimer = p.splatTimer;
  target.respawnTimer = p.respawnTimer;
  target.invincibleTimer = p.invincibleTimer;
  target.score = p.score;
  target.active = p.active;
  target.animFrame = p.animFrame;
  target.animTimer = p.animTimer;
  target.fastFalling = p.fastFalling;
  target.fatTimer = p.fatTimer;
  target.slowTimer = p.slowTimer;
  target.squashScale = p.squashScale;
  target.squashTimer = p.squashTimer;
  target.sideSquash = p.sideSquash;
  target.idleAnimTimer = p.idleAnimTimer;
  target.expression = p.expression;
  target.killStreak = p.killStreak;
  target.breathTimer = p.breathTimer;
  target.springTrailTimer = p.springTrailTimer;
  target.damageFlashSide = p.damageFlashSide;
  target.damageFlashTimer = p.damageFlashTimer;
  target.burnTimer = p.burnTimer;
  target.hitstopTimer = p.hitstopTimer;
  target.disconnected = p.disconnected;
}

function restorePlayer(p: Player, snap: PlayerSnapshot): void {
  p.x = snap.x; p.y = snap.y;
  p.vx = snap.vx; p.vy = snap.vy;
  p.width = snap.width; p.height = snap.height;
  p.state = snap.state;
  p.facing = snap.facing;
  p.splatTimer = snap.splatTimer;
  p.respawnTimer = snap.respawnTimer;
  p.invincibleTimer = snap.invincibleTimer;
  p.score = snap.score;
  p.active = snap.active;
  p.animFrame = snap.animFrame;
  p.animTimer = snap.animTimer;
  p.fastFalling = snap.fastFalling;
  p.fatTimer = snap.fatTimer;
  p.slowTimer = snap.slowTimer;
  p.squashScale = snap.squashScale;
  p.squashTimer = snap.squashTimer;
  p.sideSquash = snap.sideSquash;
  p.idleAnimTimer = snap.idleAnimTimer;
  p.expression = snap.expression;
  p.killStreak = snap.killStreak;
  p.breathTimer = snap.breathTimer;
  p.springTrailTimer = snap.springTrailTimer;
  p.damageFlashSide = snap.damageFlashSide;
  p.damageFlashTimer = snap.damageFlashTimer;
  p.burnTimer = snap.burnTimer;
  p.hitstopTimer = snap.hitstopTimer;
  p.disconnected = snap.disconnected;
}

// ---- Map iteration helper (deterministic key order across peers) ----

/** Pre-allocated sort buffer to avoid allocation during sorted Map iteration. */
const _sortBuf: [unknown, unknown][] = [];

/** Iterate a Map in sorted-key order. Ensures deterministic serialization even if
 *  insertion order differs between peers. Reuses a module-level buffer. */
function forEachSorted<K extends string | number, V>(
  map: Map<K, V>,
  fn: (value: V, key: K, index: number) => void,
): void {
  let i = 0;
  map.forEach((v, k) => {
    if (i < _sortBuf.length) {
      _sortBuf[i][0] = k;
      _sortBuf[i][1] = v;
    } else {
      _sortBuf.push([k, v]);
    }
    i++;
  });
  _sortBuf.length = i;
  _sortBuf.sort((a, b) => {
    const ak = a[0] as string | number, bk = b[0] as string | number;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  for (let j = 0; j < i; j++) {
    fn(_sortBuf[j][1] as V, _sortBuf[j][0] as K, j);
  }
}

// ---- Deep clone helpers (avoid shared references between snapshots) ----

function cloneArray<T>(arr: T[]): T[] {
  return arr.map(item => ({ ...item }));
}

/**
 * Copy array of plain objects into a target array in-place.
 * Reuses existing target slots, pushes new objects only when source is larger.
 */
function copyArrayInto<T extends object>(target: T[], source: T[]): void {
  // Copy existing slots
  const min = Math.min(target.length, source.length);
  for (let i = 0; i < min; i++) {
    Object.assign(target[i], source[i]);
  }
  // Grow: push new copies
  for (let i = min; i < source.length; i++) {
    target.push({ ...source[i] });
  }
  // Shrink
  target.length = source.length;
}

/** Create an empty GameSnapshot for pre-allocation. */
export function createEmptySnapshot(): GameSnapshot {
  return {
    frame: -1,
    rngState: 0,
    players: [],
    killFeed: [],
    timeElapsed: 0,
    matchOver: false,
    winner: null,
    countdown: 0,
    dayPhase: 0,
    carrots: [],
    carrotTimer: 0,
    springs: [],
    thorns: [],
    springSpawnTimer: 0,
    thornSpawnTimer: 0,
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer: 0,
    geyserStates: [],
    pigeonFlocks: [],
    bouncyWobble: [],
    screenShake: 0,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [],
    shockwaves: [],
    stats: [],
    aiStates: [],
  };
}

/**
 * Copy game state into an existing GameSnapshot in-place (zero allocation in steady state).
 * Only allocates when arrays grow beyond their pre-existing capacity.
 */
export function takeSnapshotInto(
  target: GameSnapshot,
  frame: number,
  state: MatchState,
  rng: SeededRNG | undefined,
  aiControllers: Map<string, AIController>,
): void {
  target.frame = frame;
  target.rngState = rng ? rng.getState() : 0;

  // Players — grow target array if needed, copy fields in-place
  while (target.players.length < state.players.length) {
    target.players.push(snapshotPlayer(state.players[target.players.length]));
  }
  target.players.length = state.players.length;
  for (let i = 0; i < state.players.length; i++) {
    snapshotPlayerInto(target.players[i], state.players[i]);
  }

  copyArrayInto(target.killFeed, state.killFeed);

  target.timeElapsed = state.timeElapsed;
  target.matchOver = state.matchOver;
  target.winner = state.winner;
  target.countdown = state.countdown;
  target.dayPhase = state.dayPhase;

  copyArrayInto(target.carrots, state.carrots);
  target.carrotTimer = state.carrotTimer;
  copyArrayInto(target.springs, state.springs);
  copyArrayInto(target.thorns, state.thorns);
  target.springSpawnTimer = state.springSpawnTimer;
  target.thornSpawnTimer = state.thornSpawnTimer;
  copyArrayInto(target.ghosts, state.ghosts);
  copyArrayInto(target.lavaRocks, state.lavaRocks);
  target.lavaRockTimer = state.lavaRockTimer;

  // Geyser states
  const geyserSrc = state.geyserStates;
  while (target.geyserStates.length < geyserSrc.length) {
    target.geyserStates.push({ timer: 0, active: false, activeTimer: 0 });
  }
  target.geyserStates.length = geyserSrc.length;
  for (let i = 0; i < geyserSrc.length; i++) {
    const t = target.geyserStates[i], s = geyserSrc[i];
    t.timer = s.timer; t.active = s.active; t.activeTimer = s.activeTimer;
  }

  // Pigeon flocks
  const pigeonSrc = state.pigeonFlocks;
  while (target.pigeonFlocks.length < pigeonSrc.length) {
    target.pigeonFlocks.push({ x: 0, y: 0, active: false, respawnTimer: 0 });
  }
  target.pigeonFlocks.length = pigeonSrc.length;
  for (let i = 0; i < pigeonSrc.length; i++) {
    const t = target.pigeonFlocks[i], s = pigeonSrc[i];
    t.x = s.x; t.y = s.y; t.active = s.active; t.respawnTimer = s.respawnTimer;
  }

  // Bouncy wobble (Map → sorted tuples for deterministic order across peers)
  forEachSorted(state.bouncyWobble, (v, k, i) => {
    if (i < target.bouncyWobble.length) {
      target.bouncyWobble[i][0] = k;
      target.bouncyWobble[i][1] = v;
    } else {
      target.bouncyWobble.push([k, v]);
    }
  });
  target.bouncyWobble.length = state.bouncyWobble.size;

  target.screenShake = state.screenShake;
  target.slowMotion = state.slowMotion;
  target.screenFlash = state.screenFlash;
  target.hitstopZoom = state.hitstopZoom;

  copyArrayInto(target.scoreAnimations, state.scoreAnimations);
  copyArrayInto(target.shockwaves, state.shockwaves);

  // Stats (Map → sorted tuples for deterministic order across peers)
  forEachSorted(state.stats.perPlayer, (stats, slot, i) => {
    if (i < target.stats.length) {
      target.stats[i][0] = slot;
      Object.assign(target.stats[i][1], stats);
    } else {
      target.stats.push([slot, { ...stats }]);
    }
  });
  target.stats.length = state.stats.perPlayer.size;

  // AI states (sorted by ID for deterministic order across peers)
  forEachSorted(aiControllers, (ctrl, id, i) => {
    if (i < target.aiStates.length) {
      target.aiStates[i][0] = id;
      ctrl.serializeInto(target.aiStates[i][1]);
    } else {
      target.aiStates.push([id, ctrl.serialize()]);
    }
  });
  target.aiStates.length = aiControllers.size;
}

// ---- Public API ----

export function takeSnapshot(
  frame: number,
  state: MatchState,
  rng: SeededRNG | undefined,
  aiControllers: Map<string, AIController>,
): GameSnapshot {
  return {
    frame,
    rngState: rng ? rng.getState() : 0,
    players: state.players.map(snapshotPlayer),
    killFeed: cloneArray(state.killFeed),
    timeElapsed: state.timeElapsed,
    matchOver: state.matchOver,
    winner: state.winner,
    countdown: state.countdown,
    dayPhase: state.dayPhase,
    carrots: cloneArray(state.carrots),
    carrotTimer: state.carrotTimer,
    springs: cloneArray(state.springs),
    thorns: cloneArray(state.thorns),
    springSpawnTimer: state.springSpawnTimer,
    thornSpawnTimer: state.thornSpawnTimer,
    ghosts: cloneArray(state.ghosts),
    lavaRocks: cloneArray(state.lavaRocks),
    lavaRockTimer: state.lavaRockTimer,
    geyserStates: state.geyserStates.map(g => ({ ...g })),
    pigeonFlocks: state.pigeonFlocks.map(p => ({
      x: p.x, y: p.y, active: p.active, respawnTimer: p.respawnTimer,
    })),
    bouncyWobble: Array.from(state.bouncyWobble.entries()).sort((a, b) => a[0] - b[0]),
    screenShake: state.screenShake,
    slowMotion: state.slowMotion,
    screenFlash: state.screenFlash,
    hitstopZoom: state.hitstopZoom,
    scoreAnimations: state.scoreAnimations.map(s => ({ ...s })),
    shockwaves: state.shockwaves.map(s => ({ ...s })),
    stats: Array.from(state.stats.perPlayer.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([slot, stats]) => [slot, { ...stats }]),
    aiStates: Array.from(aiControllers.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([id, ai]) => [id, ai.serialize()]),
  };
}

export function restoreSnapshot(
  snap: GameSnapshot,
  state: MatchState,
  rng: SeededRNG | undefined,
  aiControllers: Map<string, AIController>,
): void {
  if (rng) rng.setState(snap.rngState);

  // Restore players (match by index — order is stable)
  for (let i = 0; i < state.players.length && i < snap.players.length; i++) {
    restorePlayer(state.players[i], snap.players[i]);
  }

  copyArrayInto(state.killFeed, snap.killFeed);

  state.timeElapsed = snap.timeElapsed;
  state.matchOver = snap.matchOver;
  state.winner = snap.winner;
  state.countdown = snap.countdown;
  state.dayPhase = snap.dayPhase;

  copyArrayInto(state.carrots, snap.carrots);
  state.carrotTimer = snap.carrotTimer;

  copyArrayInto(state.springs, snap.springs);
  copyArrayInto(state.thorns, snap.thorns);
  state.springSpawnTimer = snap.springSpawnTimer;
  state.thornSpawnTimer = snap.thornSpawnTimer;

  copyArrayInto(state.ghosts, snap.ghosts);
  copyArrayInto(state.lavaRocks, snap.lavaRocks);
  state.lavaRockTimer = snap.lavaRockTimer;

  copyArrayInto(state.geyserStates, snap.geyserStates);

  // Restore pigeon flocks (preserve scatterParticles — cosmetic)
  for (let i = 0; i < state.pigeonFlocks.length && i < snap.pigeonFlocks.length; i++) {
    const pf = state.pigeonFlocks[i];
    const sf = snap.pigeonFlocks[i];
    pf.x = sf.x; pf.y = sf.y; pf.active = sf.active; pf.respawnTimer = sf.respawnTimer;
  }

  state.bouncyWobble.clear();
  for (const [k, v] of snap.bouncyWobble) {
    state.bouncyWobble.set(k, v);
  }

  state.screenShake = snap.screenShake;
  state.slowMotion = snap.slowMotion;
  state.screenFlash = snap.screenFlash;
  state.hitstopZoom = snap.hitstopZoom;

  copyArrayInto(state.scoreAnimations, snap.scoreAnimations);
  copyArrayInto(state.shockwaves, snap.shockwaves);

  // Stats — copy snapshot values into state map (must not share references with snapshot)
  state.stats.perPlayer.clear();
  for (let i = 0; i < snap.stats.length; i++) {
    const [slot, stats] = snap.stats[i];
    state.stats.perPlayer.set(slot, { ...stats });
  }

  // Restore AI state
  for (const [id, aiSnap] of snap.aiStates) {
    const ai = aiControllers.get(id);
    if (ai) ai.restore(aiSnap);
  }
}

/** CRC32 lookup table (pre-computed). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

/** Compute CRC32 of a string (for desync detection). */
export function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc = CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Compute CRC32 over raw bytes of a Float64Array (no string allocation). */
function crc32Bytes(buf: Uint8Array, len: number, offset = 0): number {
  let crc = 0xFFFFFFFF;
  const end = offset + len;
  for (let i = offset; i < end; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Pre-allocated buffer for numeric hashing
// Capacity: 7 players * 8 + entities + ghosts + timers + RNG ≈ 160 floats max
const HASH_BUF = new Float64Array(192);
const HASH_BYTES = new Uint8Array(HASH_BUF.buffer);

/** Player state enum → numeric value for hashing. */
const STATE_HASH: Record<string, number> = {
  alive: 1, splatted: 2, respawning: 3,
};

/**
 * Compute a fast hash of gameplay-critical state for desync detection. Zero allocation.
 * Covers: player positions/scores, hazard positions, spawn timers, RNG state.
 *
 * IMPORTANT: Field order must be identical in hashGameState, hashGameStateDetailed, and
 * hashSnapshot. If you add fields here, update all three functions.
 */
export function hashGameState(state: MatchState, rng: SeededRNG | undefined): number {
  let idx = 0;
  // Players (position + velocity + key timers for early divergence detection)
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    HASH_BUF[idx++] = p.x;
    HASH_BUF[idx++] = p.y;
    HASH_BUF[idx++] = p.vx;
    HASH_BUF[idx++] = p.vy;
    HASH_BUF[idx++] = p.score;
    HASH_BUF[idx++] = STATE_HASH[p.state] ?? 0;
    HASH_BUF[idx++] = p.hitstopTimer;
    HASH_BUF[idx++] = p.fastFalling ? 1 : 0;
  }
  // Hazard & pickup positions (catch spawn desync)
  for (let i = 0; i < state.carrots.length; i++) {
    HASH_BUF[idx++] = state.carrots[i].x;
    HASH_BUF[idx++] = state.carrots[i].y;
  }
  for (let i = 0; i < state.springs.length; i++) {
    HASH_BUF[idx++] = state.springs[i].x;
  }
  for (let i = 0; i < state.thorns.length; i++) {
    HASH_BUF[idx++] = state.thorns[i].x;
  }
  for (let i = 0; i < state.lavaRocks.length; i++) {
    HASH_BUF[idx++] = state.lavaRocks[i].x;
    HASH_BUF[idx++] = state.lavaRocks[i].y;
  }
  // Ghost positions (collision affects player knockback; wrap triggers gameRandom)
  for (let i = 0; i < state.ghosts.length; i++) {
    HASH_BUF[idx++] = state.ghosts[i].x;
    HASH_BUF[idx++] = state.ghosts[i].y;
  }
  // Geyser states
  for (let i = 0; i < state.geyserStates.length; i++) {
    HASH_BUF[idx++] = state.geyserStates[i].timer;
    HASH_BUF[idx++] = state.geyserStates[i].active ? 1 : 0;
  }
  // Global timers + RNG
  HASH_BUF[idx++] = state.timeElapsed;
  HASH_BUF[idx++] = state.dayPhase;
  HASH_BUF[idx++] = state.carrotTimer;
  HASH_BUF[idx++] = state.springSpawnTimer;
  HASH_BUF[idx++] = state.thornSpawnTimer;
  HASH_BUF[idx++] = state.lavaRockTimer;
  HASH_BUF[idx++] = rng ? rng.getState() : 0;
  return crc32Bytes(HASH_BYTES, idx * 8);
}

/** Per-subsystem hash result (pre-allocated, reused). */
export interface DetailedHash {
  hash: number;
  playersHash: number;
  entitiesHash: number;
  timersHash: number;
}

const DETAILED_RESULT: DetailedHash = { hash: 0, playersHash: 0, entitiesHash: 0, timersHash: 0 };

/**
 * Compute per-subsystem hashes for desync diagnosis. Same field order as hashGameState.
 * Zero allocation — returns a reused result object (copy values if you need to keep them).
 */
export function hashGameStateDetailed(state: MatchState, rng: SeededRNG | undefined): DetailedHash {
  let idx = 0;
  // -- Players subsystem --
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    HASH_BUF[idx++] = p.x;
    HASH_BUF[idx++] = p.y;
    HASH_BUF[idx++] = p.vx;
    HASH_BUF[idx++] = p.vy;
    HASH_BUF[idx++] = p.score;
    HASH_BUF[idx++] = STATE_HASH[p.state] ?? 0;
    HASH_BUF[idx++] = p.hitstopTimer;
    HASH_BUF[idx++] = p.fastFalling ? 1 : 0;
  }
  const playersEnd = idx;
  DETAILED_RESULT.playersHash = crc32Bytes(HASH_BYTES, playersEnd * 8);

  // -- Entities subsystem --
  for (let i = 0; i < state.carrots.length; i++) {
    HASH_BUF[idx++] = state.carrots[i].x;
    HASH_BUF[idx++] = state.carrots[i].y;
  }
  for (let i = 0; i < state.springs.length; i++) {
    HASH_BUF[idx++] = state.springs[i].x;
  }
  for (let i = 0; i < state.thorns.length; i++) {
    HASH_BUF[idx++] = state.thorns[i].x;
  }
  for (let i = 0; i < state.lavaRocks.length; i++) {
    HASH_BUF[idx++] = state.lavaRocks[i].x;
    HASH_BUF[idx++] = state.lavaRocks[i].y;
  }
  for (let i = 0; i < state.ghosts.length; i++) {
    HASH_BUF[idx++] = state.ghosts[i].x;
    HASH_BUF[idx++] = state.ghosts[i].y;
  }
  for (let i = 0; i < state.geyserStates.length; i++) {
    HASH_BUF[idx++] = state.geyserStates[i].timer;
    HASH_BUF[idx++] = state.geyserStates[i].active ? 1 : 0;
  }
  const entitiesEnd = idx;
  DETAILED_RESULT.entitiesHash = crc32Bytes(HASH_BYTES, (entitiesEnd - playersEnd) * 8, playersEnd * 8);

  // -- Timers + RNG subsystem --
  HASH_BUF[idx++] = state.timeElapsed;
  HASH_BUF[idx++] = state.dayPhase;
  HASH_BUF[idx++] = state.carrotTimer;
  HASH_BUF[idx++] = state.springSpawnTimer;
  HASH_BUF[idx++] = state.thornSpawnTimer;
  HASH_BUF[idx++] = state.lavaRockTimer;
  HASH_BUF[idx++] = rng ? rng.getState() : 0;
  DETAILED_RESULT.timersHash = crc32Bytes(HASH_BYTES, (idx - entitiesEnd) * 8, entitiesEnd * 8);

  // Composite hash over entire buffer
  DETAILED_RESULT.hash = crc32Bytes(HASH_BYTES, idx * 8);
  return DETAILED_RESULT;
}

/**
 * Compute hash of a GameSnapshot object. Mirrors hashGameState field order exactly
 * so that hashSnapshot(snap) === hashGameState(state, rng) for the same game state.
 * Used for frame-correct desync comparison when guest is ahead of host.
 */
export function hashSnapshot(snap: GameSnapshot): number {
  let idx = 0;
  // Players (same order as hashGameState)
  for (let i = 0; i < snap.players.length; i++) {
    const p = snap.players[i];
    HASH_BUF[idx++] = p.x;
    HASH_BUF[idx++] = p.y;
    HASH_BUF[idx++] = p.vx;
    HASH_BUF[idx++] = p.vy;
    HASH_BUF[idx++] = p.score;
    HASH_BUF[idx++] = STATE_HASH[p.state] ?? 0;
    HASH_BUF[idx++] = p.hitstopTimer;
    HASH_BUF[idx++] = p.fastFalling ? 1 : 0;
  }
  // Entities
  for (let i = 0; i < snap.carrots.length; i++) {
    HASH_BUF[idx++] = snap.carrots[i].x;
    HASH_BUF[idx++] = snap.carrots[i].y;
  }
  for (let i = 0; i < snap.springs.length; i++) {
    HASH_BUF[idx++] = snap.springs[i].x;
  }
  for (let i = 0; i < snap.thorns.length; i++) {
    HASH_BUF[idx++] = snap.thorns[i].x;
  }
  for (let i = 0; i < snap.lavaRocks.length; i++) {
    HASH_BUF[idx++] = snap.lavaRocks[i].x;
    HASH_BUF[idx++] = snap.lavaRocks[i].y;
  }
  // Ghosts
  for (let i = 0; i < snap.ghosts.length; i++) {
    HASH_BUF[idx++] = snap.ghosts[i].x;
    HASH_BUF[idx++] = snap.ghosts[i].y;
  }
  // Geyser states
  for (let i = 0; i < snap.geyserStates.length; i++) {
    HASH_BUF[idx++] = snap.geyserStates[i].timer;
    HASH_BUF[idx++] = snap.geyserStates[i].active ? 1 : 0;
  }
  // Timers + RNG
  HASH_BUF[idx++] = snap.timeElapsed;
  HASH_BUF[idx++] = snap.dayPhase;
  HASH_BUF[idx++] = snap.carrotTimer;
  HASH_BUF[idx++] = snap.springSpawnTimer;
  HASH_BUF[idx++] = snap.thornSpawnTimer;
  HASH_BUF[idx++] = snap.lavaRockTimer;
  HASH_BUF[idx++] = snap.rngState;
  return crc32Bytes(HASH_BYTES, idx * 8);
}
