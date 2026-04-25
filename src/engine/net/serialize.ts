/**
 * State snapshot/restore for local-mode game state.
 * Used by GameLoop.takeSnapshot()/restoreSnapshot() for test coverage.
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
  idleAction: number;
  idleActionTimer: number;
  idleActionDuration: number;
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
  aiRngState: number;
  players: PlayerSnapshot[];
  killFeed: KillFeedEntry[];
  timeElapsed: number;
  matchOver: boolean;
  winner: PlayerSlot | null;
  countdown: number;
  dayPhase: number;
  carrots: Carrot[];
  carrotTimer: number;
  springs: SpringMushroom[];
  thorns: Thorn[];
  springSpawnTimer: number;
  thornSpawnTimer: number;
  ghosts: GhostEntity[];
  lavaRocks: LavaRock[];
  lavaRockTimer: number;
  geyserStates: Array<{ timer: number; active: boolean; activeTimer: number }>;
  pigeonFlocks: Array<{ x: number; y: number; active: boolean; respawnTimer: number }>;
  bouncyWobble: [number, number][];
  screenShake: number;
  slowMotion: number;
  screenFlash: number;
  hitstopZoom: number;
  scoreAnimations: Array<{ playerId: PlayerSlot; value: number; timer: number }>;
  shockwaves: Array<{ x: number; y: number; radius: number; maxRadius: number; life: number }>;
  stats: [PlayerSlot, PlayerStats][];
  aiStates: [string, AISnapshot][];
}

// ---- Snapshot helpers ----

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
    idleAction: p.idleAction,
    idleActionTimer: p.idleActionTimer,
    idleActionDuration: p.idleActionDuration,
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
  p.idleAction = snap.idleAction;
  p.idleActionTimer = snap.idleActionTimer;
  p.idleActionDuration = snap.idleActionDuration;
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

function cloneArray<T>(arr: T[]): T[] {
  return arr.map(item => ({ ...item }));
}

function copyArrayInto<T extends object>(target: T[], source: T[]): void {
  const min = Math.min(target.length, source.length);
  for (let i = 0; i < min; i++) {
    Object.assign(target[i], source[i]);
  }
  for (let i = min; i < source.length; i++) {
    target.push({ ...source[i] });
  }
  target.length = source.length;
}

// ---- Public API ----

export function takeSnapshot(
  frame: number,
  state: MatchState,
  rng: SeededRNG | undefined,
  aiControllers: Map<string, AIController>,
  aiRng?: SeededRNG,
): GameSnapshot {
  return {
    frame,
    rngState: rng ? rng.getState() : 0,
    aiRngState: aiRng ? aiRng.getState() : 0,
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
  aiRng?: SeededRNG,
): void {
  if (rng) rng.setState(snap.rngState);
  if (aiRng) aiRng.setState(snap.aiRngState);

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

  state.stats.perPlayer.clear();
  for (let i = 0; i < snap.stats.length; i++) {
    const [slot, stats] = snap.stats[i];
    state.stats.perPlayer.set(slot, { ...stats });
  }

  for (const [id, aiSnap] of snap.aiStates) {
    const ai = aiControllers.get(id);
    if (ai) ai.restore(aiSnap);
  }
}

// ---- Hashing for desync detection ----

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

/** Compute CRC32 over raw bytes of a Float64Array (no string allocation). */
function crc32Bytes(buf: Uint8Array, len: number, offset = 0): number {
  let crc = 0xFFFFFFFF;
  const end = offset + len;
  for (let i = offset; i < end; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const HASH_BUF = new Float64Array(192);
const HASH_BYTES = new Uint8Array(HASH_BUF.buffer);

const STATE_HASH: Record<string, number> = {
  idle: 1, run: 2, airborne: 3, splat: 4, respawning: 5,
};

/**
 * Compute a fast hash of gameplay-critical state for desync detection. Zero allocation.
 */
export function hashGameState(state: MatchState, rng: SeededRNG | undefined): number {
  let idx = 0;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    HASH_BUF[idx++] = p.x || 0;
    HASH_BUF[idx++] = p.y || 0;
    HASH_BUF[idx++] = p.vx || 0;
    HASH_BUF[idx++] = p.vy || 0;
    HASH_BUF[idx++] = p.score;
    HASH_BUF[idx++] = STATE_HASH[p.state] ?? 0;
    HASH_BUF[idx++] = p.hitstopTimer;
    HASH_BUF[idx++] = p.fastFalling ? 1 : 0;
  }
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
  HASH_BUF[idx++] = state.timeElapsed;
  HASH_BUF[idx++] = state.dayPhase;
  HASH_BUF[idx++] = state.carrotTimer;
  HASH_BUF[idx++] = state.springSpawnTimer;
  HASH_BUF[idx++] = state.thornSpawnTimer;
  HASH_BUF[idx++] = state.lavaRockTimer;
  HASH_BUF[idx++] = rng ? rng.getState() : 0;
  return crc32Bytes(HASH_BYTES, idx * 8);
}
