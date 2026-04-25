import type { Player, PlayerSlot, Arena, MatchState, MatchSettings } from '../types';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../constants';

/** Canonical test factory for Player objects. Includes ALL Player fields with sensible defaults. */
export function makePlayer(overrides: Partial<Player> & { id?: PlayerSlot } = {}): Player {
  const id = overrides.id ?? ('P1' as PlayerSlot);
  return {
    id,
    character: { slot: id, name: 'Bunny', color: '#FFFFFF', darkColor: '#CCCCCC', lightColor: '#FFFFFF' },
    x: 100,
    y: 400,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    state: 'idle',
    facing: 'right',
    splatTimer: 0,
    respawnTimer: 0,
    invincibleTimer: 0,
    score: 0,
    active: true,
    animFrame: 0,
    animTimer: 0,
    fastFalling: false,
    fatTimer: 0,
    slowTimer: 0,
    squashScale: 1,
    squashTimer: 0,
    sideSquash: 1,
    afterimages: [],
    idleAction: -1,
    idleActionTimer: 0,
    idleActionDuration: 0,
    expression: 'normal',
    killStreak: 0,
    breathTimer: 0,
    springTrailTimer: 0,
    damageFlashSide: null,
    damageFlashTimer: 0,
    burnTimer: 0,
    hitstopTimer: 0,
    renderOffsetX: 0,
    renderOffsetY: 0,
    disconnected: false,
    ...overrides,
  };
}

/** Minimal arena for tests that need one. 2 platforms, 2 spawn points. */
export function makeArena(overrides?: Partial<Arena>): Arena {
  return {
    id: 'test',
    name: 'Test',
    themeId: 'meadow',
    width: 1280,
    height: 720,
    platforms: [
      { x: 0, y: 660, width: 1280, height: 60 },
      { x: 400, y: 500, width: 200, height: 20 },
    ],
    spawnPoints: [
      { x: 100, y: 620 },
      { x: 1100, y: 620 },
    ],
    ...overrides,
  };
}

/** Minimal MatchState with sensible defaults. Override what your test needs. */
export function makeState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    players: [],
    phase: 'playing',
    killFeed: [],
    totalKills: 0,
    timeElapsed: 0,
    matchOver: false,
    winner: null,
    carrots: [],
    carrotTimer: 5,
    springs: [],
    thorns: [],
    springSpawnTimer: 5,
    thornSpawnTimer: 5,
    screenShake: 0,
    slowMotion: 0,
    weather: [],
    dayPhase: 0,
    countdown: 0,
    stats: { perPlayer: new Map() },
    shockwaves: [],
    screenFlash: 0,
    hitstopZoom: 0,
    wildlife: [],
    fogParticles: [],
    pollenParticles: [],
    shootingStars: [],
    scoreAnimations: [],
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer: 5,
    geyserStates: [],
    pigeonFlocks: [],
    bouncyWobble: new Map(),
    gibs: [],
    confetti: [],
    ...overrides,
  } as MatchState;
}

/** Minimal MatchSettings with sensible defaults. Override what your test needs. */
export function makeSettings(overrides: Partial<MatchSettings> = {}): MatchSettings {
  return {
    killLimit: 16,
    timeLimit: 0,
    playerCount: 2,
    goreMode: false,
    arenaId: 'meadow',
    botCount: 0,
    botDifficulty: 'medium',
    mods: {
      extremeGore: false,
      carrotChase: false,
      giantPlayers: false,
      turbo: false,
      superBounce: false,
      mirrorArena: false,
      underwaterGravity: false,
    },
    ...overrides,
  };
}
