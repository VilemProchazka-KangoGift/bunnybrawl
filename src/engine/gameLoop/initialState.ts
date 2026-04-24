// Pure constructors for GameLoop initial state.
// Extracted from GameLoop constructor to keep the class focused on wiring systems together.

import type {
  Arena, MatchSettings, MatchState, Player, PlayerSlot, PlayerStats, MatchStats,
  WeatherParticle, WildlifeEntity,
} from '../types';
import type { ThemeConfig } from '../themes/types';
import { getCharacterForSlot } from '../characters';
import { createWeatherParticle } from './cosmetics/environment';
import { randRange, pickWeighted } from '../themes/utils';
import {
  PLAYER_WIDTH, PLAYER_HEIGHT, GIANT_SCALE,
  CARROT_FIRST_SPAWN_DELAY, CARROT_CHASE_FIRST_SPAWN_DELAY,
  MATCH_COUNTDOWN,
  CANVAS_WIDTH, CANVAS_HEIGHT,
  GRAVITY, FRICTION, MAX_WALK_SPEED, JUMP_IMPULSE, MAX_FALL_SPEED,
} from '../constants';

export interface EffectivePhysics {
  gravity: number;
  friction: number;
  walkSpeed: number;
  jumpImpulse: number;
  maxFallSpeed: number;
}

/** Derive runtime physics constants from base constants, theme modifiers, and active mods. */
export function computeEffectivePhysics(theme: ThemeConfig, mods: MatchSettings['mods']): EffectivePhysics {
  const pm = theme.physics;
  let gravity = GRAVITY * (pm?.gravity ?? 1);
  let friction = FRICTION * (pm?.friction ?? 1);
  let walkSpeed = MAX_WALK_SPEED * (pm?.walkSpeed ?? 1);
  let jumpImpulse = JUMP_IMPULSE * (pm?.jumpImpulse ?? 1);
  let maxFallSpeed = MAX_FALL_SPEED * (pm?.gravity ?? 1);

  if (mods.turbo) {
    walkSpeed *= 2;
    jumpImpulse *= 1.5;
  }
  if (mods.underwaterGravity) {
    gravity *= 0.6;
    maxFallSpeed *= 0.6;
    jumpImpulse *= 0.9;
  }

  return { gravity, friction, walkSpeed, jumpImpulse, maxFallSpeed };
}

/** Build the initial player array for a match. */
export function createInitialPlayers(activePlayers: PlayerSlot[], arena: Arena, giantPlayers: boolean): Player[] {
  const pw = giantPlayers ? PLAYER_WIDTH * GIANT_SCALE : PLAYER_WIDTH;
  const ph = giantPlayers ? PLAYER_HEIGHT * GIANT_SCALE : PLAYER_HEIGHT;

  return activePlayers.map((slot, index) => ({
    id: slot,
    character: getCharacterForSlot(slot),
    x: arena.spawnPoints[index % arena.spawnPoints.length].x - pw / 2,
    y: arena.spawnPoints[index % arena.spawnPoints.length].y - ph,
    vx: 0, vy: 0,
    width: pw, height: ph,
    state: 'idle' as const, facing: 'right' as const,
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true, animFrame: 0, animTimer: 0,
    fastFalling: false, fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [], idleAnimTimer: 0,
    expression: 'normal' as const, killStreak: 0,
    breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
  }));
}

/** Build the initial MatchState from arena, theme, settings, and players. */
export function createInitialMatchState(
  arena: Arena,
  theme: ThemeConfig,
  settings: MatchSettings,
  players: Player[],
  activePlayers: PlayerSlot[],
  gameRandom: () => number,
): MatchState {
  const weather: WeatherParticle[] = [];
  for (let i = 0; i < theme.weather.particleCount; i++) {
    weather.push(createWeatherParticle(theme, true));
  }

  const statsMap = new Map<PlayerSlot, PlayerStats>();
  for (const slot of activePlayers) {
    statsMap.set(slot, { bestStreak: 0, timeAirborne: 0, distanceTraveled: 0, carrotsEaten: 0 });
  }
  const stats: MatchStats = { perPlayer: statsMap };

  const wildlife: WildlifeEntity[] = [];
  const wc = theme.wildlife;
  for (let i = 0; i < wc.count; i++) {
    const chosen = pickWeighted(wc.types);
    wildlife.push({
      type: chosen.type,
      x: chosen.type === 'bird' ? -50 - Math.random() * 100 : Math.random() * CANVAS_WIDTH,
      y: randRange(chosen.yRange) * CANVAS_HEIGHT,
      vx: randRange(chosen.speedRange),
      vy: 0,
      wingPhase: Math.random() * Math.PI * 2,
      color: chosen.colors[Math.floor(Math.random() * chosen.colors.length)],
    });
  }

  const fc = theme.fog;
  const fogParticles: Array<{ x: number; y: number; vx: number; alpha: number }> = [];
  for (let i = 0; i < fc.count; i++) {
    fogParticles.push({
      x: Math.random() * CANVAS_WIDTH,
      y: fc.baseY + (Math.random() * 2 - 1) * fc.yVariance,
      vx: randRange(fc.speedRange),
      alpha: randRange(fc.alphaRange),
    });
  }

  const ac = theme.ambientParticles;
  const pollenParticles: Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number }> = [];
  for (let i = 0; i < ac.count; i++) {
    pollenParticles.push({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      vx: randRange(ac.vxRange),
      vy: randRange(ac.vyRange),
      size: randRange(ac.sizeRange),
      alpha: randRange(ac.alphaRange),
    });
  }

  const lavaRockTimer = theme.lavaRockConfig
    ? theme.lavaRockConfig.spawnInterval[0] + gameRandom() * (theme.lavaRockConfig.spawnInterval[1] - theme.lavaRockConfig.spawnInterval[0])
    : 9999;

  return {
    players,
    phase: 'loading',
    killFeed: [],
    timeElapsed: 0, matchOver: false, winner: null,
    carrots: [],
    carrotTimer: settings.mods.carrotChase ? CARROT_CHASE_FIRST_SPAWN_DELAY : CARROT_FIRST_SPAWN_DELAY,
    springs: [], thorns: [],
    springSpawnTimer: 5,
    thornSpawnTimer: 8,
    screenShake: 0, slowMotion: 0, hitstopZoom: 0,
    weather,
    dayPhase: 0,
    countdown: MATCH_COUNTDOWN,
    stats,
    shockwaves: [],
    screenFlash: 0,
    wildlife,
    fogParticles,
    pollenParticles,
    shootingStars: [],
    scoreAnimations: [],
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer,
    geyserStates: (arena.effectZones || []).filter(z => z.type === 'geyser').map(z => ({
      timer: (z.interval || 10) * gameRandom(),
      active: false,
      activeTimer: 0,
    })),
    pigeonFlocks: (theme.pigeonConfig?.positions || []).map(p => ({
      x: p.x, y: p.y, active: true, respawnTimer: 0,
      scatterParticles: [],
    })),
    bouncyWobble: new Map(),
    gibs: [],
    confetti: [],
  };
}
