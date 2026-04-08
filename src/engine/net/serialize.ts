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
  p.expression = snap.expression;
  p.killStreak = snap.killStreak;
  p.breathTimer = snap.breathTimer;
  p.springTrailTimer = snap.springTrailTimer;
  p.damageFlashSide = snap.damageFlashSide;
  p.damageFlashTimer = snap.damageFlashTimer;
  p.burnTimer = snap.burnTimer;
  p.hitstopTimer = snap.hitstopTimer;
}

// ---- Deep clone helpers (avoid shared references between snapshots) ----

function cloneArray<T>(arr: T[]): T[] {
  return arr.map(item => ({ ...item }));
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
    bouncyWobble: Array.from(state.bouncyWobble.entries()),
    screenShake: state.screenShake,
    slowMotion: state.slowMotion,
    screenFlash: state.screenFlash,
    hitstopZoom: state.hitstopZoom,
    scoreAnimations: state.scoreAnimations.map(s => ({ ...s })),
    shockwaves: state.shockwaves.map(s => ({ ...s })),
    stats: Array.from(state.stats.perPlayer.entries()).map(([slot, stats]) => [slot, { ...stats }]),
    aiStates: Array.from(aiControllers.entries()).map(([id, ai]) => [id, ai.serialize()]),
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

  state.killFeed.length = 0;
  state.killFeed.push(...cloneArray(snap.killFeed));

  state.timeElapsed = snap.timeElapsed;
  state.matchOver = snap.matchOver;
  state.winner = snap.winner;
  state.countdown = snap.countdown;
  state.dayPhase = snap.dayPhase;

  state.carrots.length = 0;
  state.carrots.push(...cloneArray(snap.carrots));
  state.carrotTimer = snap.carrotTimer;

  state.springs.length = 0;
  state.springs.push(...cloneArray(snap.springs));
  state.thorns.length = 0;
  state.thorns.push(...cloneArray(snap.thorns));
  state.springSpawnTimer = snap.springSpawnTimer;
  state.thornSpawnTimer = snap.thornSpawnTimer;

  state.ghosts.length = 0;
  state.ghosts.push(...cloneArray(snap.ghosts));
  state.lavaRocks.length = 0;
  state.lavaRocks.push(...cloneArray(snap.lavaRocks));
  state.lavaRockTimer = snap.lavaRockTimer;

  state.geyserStates.length = 0;
  state.geyserStates.push(...snap.geyserStates.map(g => ({ ...g })));

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

  state.scoreAnimations.length = 0;
  state.scoreAnimations.push(...snap.scoreAnimations.map(s => ({ ...s })));
  state.shockwaves.length = 0;
  state.shockwaves.push(...snap.shockwaves.map(s => ({ ...s })));

  state.stats.perPlayer.clear();
  for (const [slot, stats] of snap.stats) {
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

/** Compute a fast hash of gameplay-critical state for desync detection. */
export function hashGameState(state: MatchState, rng: SeededRNG | undefined): number {
  // Hash player positions, scores, and key timers — fast approximation
  let str = '';
  for (const p of state.players) {
    str += `${p.id}:${p.x.toFixed(2)},${p.y.toFixed(2)},${p.score},${p.state};`;
  }
  str += `t=${state.timeElapsed.toFixed(3)},c=${state.carrots.length},s=${state.springs.length}`;
  str += `,r=${rng ? rng.getState() : 0}`;
  return crc32(str);
}
