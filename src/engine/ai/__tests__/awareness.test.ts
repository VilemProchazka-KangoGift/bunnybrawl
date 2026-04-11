import { describe, it, expect } from 'vitest';
import { buildAwareness } from '../awareness';
import type { MatchState, Arena, PlayerSlot } from '../../types';
import { makePlayer, makeArena } from '../../__tests__/testHelpers';
import { PLAYER_WIDTH, PLAYER_HEIGHT, CANVAS_WIDTH } from '../../constants';

/** Minimal MatchState factory for awareness tests. */
function makeState(overrides?: Partial<MatchState>): MatchState {
  return {
    players: [],
    killFeed: [],
    timeElapsed: 30,
    matchOver: false,
    winner: null,
    carrots: [],
    carrotTimer: 10,
    springs: [],
    thorns: [],
    springSpawnTimer: 10,
    thornSpawnTimer: 10,
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
    lavaRockTimer: 10,
    geyserStates: [],
    pigeonFlocks: [],
    bouncyWobble: new Map(),
    gibs: [],
    confetti: [],
    ...overrides,
  };
}

describe('buildAwareness', () => {
  // ── Self state detection ──────────────────────────────────────────────

  describe('self state', () => {
    it('reports onGround=true when player is idle', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628, state: 'idle' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.onGround).toBe(true);
    });

    it('reports onGround=false when player is airborne', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 300, state: 'airborne' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.onGround).toBe(false);
    });

    it('reports slowed=true when slowTimer > 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, slowTimer: 3 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.slowed).toBe(true);
    });

    it('reports slowed=false when slowTimer is 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, slowTimer: 0 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.slowed).toBe(false);
    });

    it('reports fat=true when fatTimer > 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, fatTimer: 5 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.fat).toBe(true);
    });

    it('reports fat=false when fatTimer is 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, fatTimer: 0 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.fat).toBe(false);
    });

    it('reports invincible=true when invincibleTimer > 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, invincibleTimer: 1.5 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.invincible).toBe(true);
    });

    it('reports invincible=false when invincibleTimer is 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, invincibleTimer: 0 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.invincible).toBe(false);
    });

    it('copies position and velocity into self', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 300, vx: 50, vy: -100, score: 7 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.x).toBe(200);
      expect(snap.self.y).toBe(300);
      expect(snap.self.vx).toBe(50);
      expect(snap.self.vy).toBe(-100);
      expect(snap.self.score).toBe(7);
    });
  });

  // ── Nearest enemy detection ───────────────────────────────────────────

  describe('nearest enemy', () => {
    it('finds the closest active enemy', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const near = makePlayer({ id: 'P1' as PlayerSlot, x: 350, y: 628 });
      const far = makePlayer({ id: 'P2' as PlayerSlot, x: 900, y: 628 });
      const state = makeState({ players: [bot, near, far] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).not.toBeNull();
      expect(snap.nearestEnemy!.x).toBe(350);
    });

    it('ignores splatted enemies', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const splatted = makePlayer({ id: 'P1' as PlayerSlot, x: 250, y: 628, state: 'splat', splatTimer: 0.3 });
      const state = makeState({ players: [bot, splatted] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).toBeNull();
    });

    it('ignores respawning enemies', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const respawning = makePlayer({ id: 'P1' as PlayerSlot, x: 250, y: 628, state: 'respawning', respawnTimer: 0.5 });
      const state = makeState({ players: [bot, respawning] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).toBeNull();
    });

    it('ignores self in enemy scan', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).toBeNull();
    });

    it('returns null when no enemies within awareness radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const far = makePlayer({ id: 'P1' as PlayerSlot, x: 800, y: 628 });
      const state = makeState({ players: [bot, far] });
      const arena = makeArena();

      // Awareness radius 250px, enemy at ~700px away
      const snap = buildAwareness(bot, state, arena, 250);
      expect(snap.nearestEnemy).toBeNull();
    });

    it('includes dx, dy, dist, score for nearest enemy', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 400 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 500, y: 400, score: 5, vx: 100, vy: -50 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy!.dx).toBe(300);
      expect(snap.nearestEnemy!.dy).toBe(0);
      expect(snap.nearestEnemy!.dist).toBeCloseTo(300);
      expect(snap.nearestEnemy!.score).toBe(5);
      expect(snap.nearestEnemy!.vx).toBe(100);
      expect(snap.nearestEnemy!.vy).toBe(-50);
    });
  });

  // ── Stomp target (enemy below) ───────────────────────────────────────

  describe('stomp target', () => {
    it('detects enemy below and horizontally aligned', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 400, state: 'airborne' });
      const victim = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 520 });
      const state = makeState({ players: [bot, victim] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompTarget).not.toBeNull();
      expect(snap.stompTarget!.x).toBe(510);
    });

    it('returns null when enemy is too far below (dy > 200)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 100, state: 'airborne' });
      const victim = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 400 });
      const state = makeState({ players: [bot, victim] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      // dy = 300 > 200, should not detect
      expect(snap.stompTarget).toBeNull();
    });

    it('returns null when enemy is too far horizontally (|dx| > 80)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 400, state: 'airborne' });
      const victim = makePlayer({ id: 'P1' as PlayerSlot, x: 400, y: 500 });
      const state = makeState({ players: [bot, victim] });
      const arena = makeArena();

      // dx = 200, way beyond 80px
      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompTarget).toBeNull();
    });

    it('picks closest stomp target when multiple below', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 400, state: 'airborne' });
      const close = makePlayer({ id: 'P1' as PlayerSlot, x: 505, y: 450 });
      const far = makePlayer({ id: 'P2' as PlayerSlot, x: 520, y: 550 });
      const state = makeState({ players: [bot, close, far] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompTarget).not.toBeNull();
      expect(snap.stompTarget!.x).toBe(505);
    });
  });

  // ── Stomp threat (falling enemy above) ────────────────────────────────

  describe('stomp threat', () => {
    it('detects falling enemy above', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const threat = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 500, vy: 200, state: 'airborne' });
      const state = makeState({ players: [bot, threat] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompThreat).not.toBeNull();
      expect(snap.stompThreat!.x).toBe(510);
    });

    it('ignores enemy above with vy <= 0 (rising)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const rising = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 500, vy: -100, state: 'airborne' });
      const state = makeState({ players: [bot, rising] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompThreat).toBeNull();
    });

    it('ignores enemy that is too far above (dy < -200)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const farAbove = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 100, vy: 200, state: 'airborne' });
      const state = makeState({ players: [bot, farAbove] });
      const arena = makeArena();

      // dy = 100 - 628 = -528, below -200 limit
      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompThreat).toBeNull();
    });

    it('ignores threat too far horizontally (|dx| > 60)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const wide = makePlayer({ id: 'P1' as PlayerSlot, x: 600, y: 500, vy: 200, state: 'airborne' });
      const state = makeState({ players: [bot, wide] });
      const arena = makeArena();

      // dx = 100 > 60
      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.stompThreat).toBeNull();
    });
  });

  // ── Nearest carrot ────────────────────────────────────────────────────

  describe('nearest carrot', () => {
    it('finds nearest active carrot', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({
        players: [bot],
        carrots: [
          { x: 300, y: 620, active: true, spawnTime: 0 },
          { x: 800, y: 620, active: true, spawnTime: 0 },
        ],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestCarrot).not.toBeNull();
      expect(snap.nearestCarrot!.x).toBe(300);
    });

    it('ignores inactive carrots', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({
        players: [bot],
        carrots: [{ x: 250, y: 620, active: false, spawnTime: 0 }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestCarrot).toBeNull();
    });

    it('ignores carrots outside awareness radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({
        players: [bot],
        carrots: [{ x: 800, y: 620, active: true, spawnTime: 0 }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, 250);
      expect(snap.nearestCarrot).toBeNull();
    });
  });

  // ── Hazard detection ──────────────────────────────────────────────────

  describe('hazard detection', () => {
    it('detects hazard zones', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({ players: [bot] });
      const arena = makeArena({
        hazardZones: [{ x: 250, y: 650, width: 100, height: 20, type: 'lava' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestHazard).not.toBeNull();
      expect(snap.nearestHazard!.type).toBe('lava');
      expect(snap.nearbyHazards.length).toBeGreaterThan(0);
    });

    it('detects active thorns as hazards', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({
        players: [bot],
        thorns: [{
          x: 230, y: 650, width: 28, height: 12,
          platformIndex: 0, life: 10, growTimer: 0, hit: false,
        }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyHazards.some(h => h.type === 'thorn')).toBe(true);
    });

    it('ignores growing thorns (growTimer > 0)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({
        players: [bot],
        thorns: [{
          x: 230, y: 650, width: 28, height: 12,
          platformIndex: 0, life: 10, growTimer: 0.3, hit: false,
        }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyHazards.some(h => h.type === 'thorn')).toBe(false);
    });

    it('ignores hit thorns', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const state = makeState({
        players: [bot],
        thorns: [{
          x: 230, y: 650, width: 28, height: 12,
          platformIndex: 0, life: 10, growTimer: 0, hit: true,
        }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyHazards.some(h => h.type === 'thorn')).toBe(false);
    });

    it('detects active lava rocks', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 400 });
      const state = makeState({
        players: [bot],
        lavaRocks: [{ x: 220, y: 380, vy: 50, size: 15, rotation: 0, active: true }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyHazards.some(h => h.type === 'lavaRock')).toBe(true);
    });

    it('ignores inactive lava rocks', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 400 });
      const state = makeState({
        players: [bot],
        lavaRocks: [{ x: 220, y: 380, vy: 50, size: 15, rotation: 0, active: false }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyHazards.some(h => h.type === 'lavaRock')).toBe(false);
    });

    it('detects ghosts as hazards', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 500 });
      const state = makeState({
        players: [bot],
        ghosts: [{ x: 250, y: 500, vx: 50, size: 30, alpha: 0.7, wobblePhase: 0 }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestHazard).not.toBeNull();
      expect(snap.nearestHazard!.type).toBe('ghost');
    });
  });

  // ── Platform detection ────────────────────────────────────────────────

  describe('platform detection', () => {
    it('finds platform above the bot', () => {
      // Bot at ground level, floating platform above at y=500
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 628 });
      const state = makeState({ players: [bot] });
      const arena = makeArena(); // platforms[1] at x=400,y=500,w=200

      const snap = buildAwareness(bot, state, arena, Infinity);
      // Platform at y=500, bot feet at y=660. dy = 500 - 660 = -160, which is < -20
      expect(snap.nearestPlatformAbove).not.toBeNull();
      expect(snap.nearestPlatformAbove!.y).toBe(500);
    });

    it('finds platform below the bot', () => {
      // Bot on floating platform, ground below
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 468, state: 'idle' });
      const state = makeState({ players: [bot] });
      const arena = makeArena(); // platforms[0] is ground at y=660

      const snap = buildAwareness(bot, state, arena, Infinity);
      // Bot feet at 468+32=500. Ground at y=660. dy = 660 - 500 = 160 > 10
      expect(snap.nearestPlatformBelow).not.toBeNull();
      expect(snap.nearestPlatformBelow!.y).toBe(660);
    });

    it('returns null for platformAbove when no platform is above', () => {
      // Bot on the highest platform (no platform above)
      const arena = makeArena({
        platforms: [{ x: 0, y: 660, width: 1280, height: 60 }],
      });
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({ players: [bot] });

      const snap = buildAwareness(bot, state, arena, Infinity);
      // Ground at 660, bot feet at 660 => dy = 0 which is not < -20
      expect(snap.nearestPlatformAbove).toBeNull();
    });
  });

  // ── Effect zones ──────────────────────────────────────────────────────

  describe('effect zones', () => {
    it('detects zero_g zone when player is inside', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 300 });
      const state = makeState({ players: [bot] });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 200, width: 200, height: 200, type: 'zero_g' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.inZeroG).toBe(true);
    });

    it('does not detect zero_g when player is outside zone', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({ players: [bot] });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 200, width: 200, height: 200, type: 'zero_g' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.inZeroG).toBe(false);
    });

    it('detects current zone and returns vx push force', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 300 });
      const state = makeState({ players: [bot] });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 200, width: 200, height: 200, type: 'current', vx: 150 }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.inCurrent).toBe(150);
    });

    it('returns inCurrent=0 when not in a current zone', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({ players: [bot] });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 200, width: 200, height: 200, type: 'current', vx: 150 }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.inCurrent).toBe(0);
    });
  });

  // ── Leader score tracking ─────────────────────────────────────────────

  describe('leader score', () => {
    it('tracks highest score among all active players', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628, score: 3 });
      const leader = makePlayer({ id: 'P1' as PlayerSlot, x: 400, y: 628, score: 12 });
      const other = makePlayer({ id: 'P2' as PlayerSlot, x: 700, y: 628, score: 7 });
      const state = makeState({ players: [bot, leader, other] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.leaderScore).toBe(12);
    });

    it('includes bots own score in leader calculation', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628, score: 15 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 400, y: 628, score: 5 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.leaderScore).toBe(15);
    });

    it('returns 0 when all scores are 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628, score: 0 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 400, y: 628, score: 0 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.leaderScore).toBe(0);
    });
  });

  // ── Awareness radius ──────────────────────────────────────────────────

  describe('awareness radius', () => {
    it('finds enemy within radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const near = makePlayer({ id: 'P1' as PlayerSlot, x: 350, y: 628 });
      const state = makeState({ players: [bot, near] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, 300);
      expect(snap.nearestEnemy).not.toBeNull();
    });

    it('excludes enemy outside radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const far = makePlayer({ id: 'P1' as PlayerSlot, x: 800, y: 628 });
      const state = makeState({ players: [bot, far] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, 250);
      expect(snap.nearestEnemy).toBeNull();
    });
  });

  // ── Roam target ───────────────────────────────────────────────────────

  describe('roam target', () => {
    it('always finds a roam target regardless of awareness radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const far = makePlayer({ id: 'P1' as PlayerSlot, x: 1100, y: 628 });
      const state = makeState({ players: [bot, far] });
      const arena = makeArena();

      // Very small awareness radius, but roam target ignores it
      const snap = buildAwareness(bot, state, arena, 50);
      expect(snap.roamTarget).not.toBeNull();
    });

    it('overrides roam target with nearest carrot when one exists', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 1100, y: 628 });
      const state = makeState({
        players: [bot, enemy],
        carrots: [{ x: 300, y: 620, active: true, spawnTime: 0 }],
      });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.roamTarget).not.toBeNull();
      expect(snap.roamTarget!.x).toBe(300);
    });
  });

  // ── Airborne above ────────────────────────────────────────────────────

  describe('airborne above', () => {
    it('collects airborne enemies above within range', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const above = makePlayer({ id: 'P1' as PlayerSlot, x: 520, y: 450, state: 'airborne', vy: -50 });
      const state = makeState({ players: [bot, above] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      // dy = 450 - 628 = -178, within -250; |dx| = 20, within 100; dist ~178 < 300
      expect(snap.airborneAbove.length).toBe(1);
      expect(snap.airborneAbove[0].x).toBe(520);
    });

    it('ignores non-airborne enemies above', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const standing = makePlayer({ id: 'P1' as PlayerSlot, x: 520, y: 468, state: 'idle' });
      const state = makeState({ players: [bot, standing] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.airborneAbove.length).toBe(0);
    });
  });

  // ── Near edge detection ───────────────────────────────────────────────

  describe('near edge', () => {
    it('detects near edge on allowFallOff arena when at platform edge', () => {
      const arena = makeArena({
        allowFallOff: true,
        platforms: [
          { x: 200, y: 660, width: 200, height: 60 }, // small platform, not full width
        ],
      });
      // Bot at right edge of platform (x+PLAYER_WIDTH > platX + width - 20)
      // plat right edge at 400, so x+32 > 380 => x > 348
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 360, y: 628, state: 'idle' });
      const state = makeState({ players: [bot] });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearEdge).toBe(true);
    });

    it('does not detect near edge on non-falloff arena', () => {
      const arena = makeArena({ allowFallOff: false });
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 10, y: 628, state: 'idle' });
      const state = makeState({ players: [bot] });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearEdge).toBe(false);
    });
  });

  // ── Elevated platform ─────────────────────────────────────────────────

  describe('elevated platform', () => {
    it('reports onElevatedPlatform when on ground and feet above y=640', () => {
      // Bot on floating platform at y=500. Feet at 468+32=500 < 640
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 468, state: 'idle' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.onElevatedPlatform).toBe(true);
    });

    it('reports onElevatedPlatform=false at ground level', () => {
      // Bot at ground. Feet at 628+32=660 >= 640
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628, state: 'idle' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.onElevatedPlatform).toBe(false);
    });

    it('reports onElevatedPlatform=false when airborne even if high up', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 300, state: 'airborne' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.onElevatedPlatform).toBe(false);
    });
  });

  // ── Nearby bot count ──────────────────────────────────────────────────

  describe('nearby bot count', () => {
    it('counts other bots within 120px', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const nearBot = makePlayer({ id: 'B2' as PlayerSlot, x: 550, y: 628 });
      const farBot = makePlayer({ id: 'B3' as PlayerSlot, x: 900, y: 628 });
      const state = makeState({ players: [bot, nearBot, farBot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      // B2 is ~50px away (within 120), B3 is ~400px away (outside 120)
      expect(snap.nearbyBotCount).toBe(1);
    });

    it('does not count human players', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const human = makePlayer({ id: 'P1' as PlayerSlot, x: 510, y: 628 });
      const state = makeState({ players: [bot, human] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyBotCount).toBe(0);
    });

    it('does not count splatted bots', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const splatBot = makePlayer({ id: 'B2' as PlayerSlot, x: 510, y: 628, state: 'splat', splatTimer: 0.3 });
      const state = makeState({ players: [bot, splatBot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearbyBotCount).toBe(0);
    });
  });

  // ── Priority target ───────────────────────────────────────────────────

  describe('priority target', () => {
    it('identifies fat enemy as high-value target', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      const fat = makePlayer({ id: 'P1' as PlayerSlot, x: 350, y: 628, fatTimer: 5, invincibleTimer: 0 });
      const state = makeState({ players: [bot, fat] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.priorityTarget).not.toBeNull();
      expect(snap.priorityTarget!.juiciness).toBeGreaterThan(0);
    });

    it('does not target invincible enemies', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628 });
      // invincible + fat - but invincibleTimer > 0 excludes from priority
      const invincible = makePlayer({ id: 'P1' as PlayerSlot, x: 350, y: 628, fatTimer: 5, invincibleTimer: 1.5 });
      const state = makeState({ players: [bot, invincible] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.priorityTarget).toBeNull();
    });
  });

  // ── Landing platform ──────────────────────────────────────────────────

  describe('landing platform', () => {
    it('finds platform below when airborne and falling', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 350, state: 'airborne', vy: 100 });
      const state = makeState({ players: [bot] });
      const arena = makeArena(); // platform[1] at x=400,y=500,w=200

      const snap = buildAwareness(bot, state, arena, Infinity);
      // Bot feet at 382. Platform at 500. dy = 500 - 382 = 118 (in range 5-300)
      expect(snap.landingPlatform).not.toBeNull();
    });

    it('returns null when on ground', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 628, state: 'idle', vy: 0 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.landingPlatform).toBeNull();
    });

    it('returns null when airborne but rising (vy < 0)', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 350, state: 'airborne', vy: -200 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.landingPlatform).toBeNull();
    });
  });

  // ── Geyser detection ──────────────────────────────────────────────────

  describe('geyser', () => {
    it('detects nearby geyser zone', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 490, y: 580 });
      const state = makeState({
        players: [bot],
        geyserStates: [{ timer: 3, active: false, activeTimer: 0 }],
      });
      const arena = makeArena({
        effectZones: [{ x: 480, y: 500, width: 60, height: 200, type: 'geyser' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearGeyser).not.toBeNull();
      expect(snap.nearGeyser!.active).toBe(false);
      expect(snap.nearGeyser!.timer).toBe(3);
    });

    it('computes geyserEscapeDx when inside geyser zone', () => {
      // Bot inside the geyser zone
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 490, y: 550 });
      const state = makeState({
        players: [bot],
        geyserStates: [{ timer: 0, active: true, activeTimer: 1 }],
      });
      const arena = makeArena({
        effectZones: [{ x: 480, y: 500, width: 60, height: 200, type: 'geyser' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      // Bot center at 490+16=506. Zone from 480 to 540.
      // distToLeft = 506-480=26, distToRight = 540-506=34
      // distToLeft < distToRight => geyserEscapeDx = -(26+30) = -56
      expect(snap.geyserEscapeDx).toBeLessThan(0);
    });
  });

  // ── Screen wrap awareness ─────────────────────────────────────────────

  describe('screen wrap', () => {
    it('uses wrap-aware distance for enemies near screen edges', () => {
      // Bot near left edge, enemy near right edge. Wrap distance should be short.
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 50, y: 628 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 1230, y: 628 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).not.toBeNull();
      // Raw dx = 1180 > CANVAS_WIDTH/2, so wrap: 1180 - 1280 = -100
      expect(snap.nearestEnemy!.dx).toBeCloseTo(-100);
      expect(snap.nearestEnemy!.dist).toBeCloseTo(100);
    });

    it('computes wrapped dx ~60 when enemy at x=1250 and bot at x=30', () => {
      // Raw dx = 1250 - 30 = 1220 > CANVAS_WIDTH/2 (640)
      // Wrapped dx = 1220 - 1280 = -60 → enemy is 60px to the left via wrap
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 30, y: 628 });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 1250, y: 628 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).not.toBeNull();
      expect(snap.nearestEnemy!.dx).toBeCloseTo(-60);
      expect(snap.nearestEnemy!.dist).toBeCloseTo(60);
    });
  });

  // ── Priority target with multiple candidates ─────────────────────────

  describe('priority target selection', () => {
    it('picks highest juiciness among multiple candidates', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      // Slowed enemy (juiciness base = 2) at same distance
      const slowed = makePlayer({ id: 'P1' as PlayerSlot, x: 600, y: 628, slowTimer: 3, invincibleTimer: 0 });
      // Fat enemy (juiciness base = 3) at same distance
      const fat = makePlayer({ id: 'P2' as PlayerSlot, x: 400, y: 628, fatTimer: 5, invincibleTimer: 0 });
      const state = makeState({ players: [bot, slowed, fat] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.priorityTarget).not.toBeNull();
      // Fat (base 3) > slowed (base 2), both at ~100px distance
      expect(snap.priorityTarget!.x).toBe(400); // fat enemy position
    });
  });

  // ── Geyser escape direction sign ─────────────────────────────────────

  describe('geyser escape direction', () => {
    it('returns positive geyserEscapeDx when zone edge is to the right', () => {
      // Bot center closer to left edge → escape right (positive)
      // Zone x=400, width=200, so zone spans 400-600
      // Bot at x=560, center at 560+16=576. distToLeft = 576-400=176, distToRight = 600-576=24
      // distToRight < distToLeft → geyserEscapeDx = +(24+30) = +54
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 560, y: 550 });
      const state = makeState({
        players: [bot],
        geyserStates: [{ timer: 0, active: true, activeTimer: 1 }],
      });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 500, width: 200, height: 200, type: 'geyser' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.geyserEscapeDx).toBeGreaterThan(0);
    });

    it('returns negative geyserEscapeDx when zone edge is to the left', () => {
      // Bot center closer to left edge → escape left (negative)
      // Zone x=400, width=200. Bot at x=410, center at 426.
      // distToLeft = 426-400=26, distToRight = 600-426=174
      // distToLeft < distToRight → geyserEscapeDx = -(26+30) = -56
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 410, y: 550 });
      const state = makeState({
        players: [bot],
        geyserStates: [{ timer: 0, active: true, activeTimer: 1 }],
      });
      const arena = makeArena({
        effectZones: [{ x: 400, y: 500, width: 200, height: 200, type: 'geyser' }],
      });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.geyserEscapeDx).toBeLessThan(0);
    });
  });

  // ── Nearest platform considers all floating platforms ─────────────────

  describe('nearest platform above considers all platforms', () => {
    it('picks the nearest platform above among multiple floating platforms', () => {
      const arena = makeArena({
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },     // ground
          { x: 300, y: 400, width: 200, height: 20 },     // high platform (dy=-228)
          { x: 350, y: 550, width: 200, height: 20 },     // lower platform (dy=-78)
        ],
      });
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 400, y: 628, state: 'idle' });
      const state = makeState({ players: [bot] });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestPlatformAbove).not.toBeNull();
      // Bot feet at 660. Platform at 550: dy = 550-660=-110. Platform at 400: dy=400-660=-260.
      // -110 is closer than -260, so nearest above should be y=550
      expect(snap.nearestPlatformAbove!.y).toBe(550);
    });
  });

  // ── Self score correctly read ─────────────────────────────────────────

  describe('self score', () => {
    it('correctly reads score from the player', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628, score: 13 });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.self.score).toBe(13);
    });
  });

  // ── Navigation target with pathfindingDepth=0 ─────────────────────────

  describe('nav target with pathfindingDepth=0', () => {
    it('returns null navTarget when pathfindingDepth is 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 200, y: 628, state: 'idle' });
      const enemy = makePlayer({ id: 'P1' as PlayerSlot, x: 500, y: 468 });
      const state = makeState({ players: [bot, enemy] });
      const arena = makeArena();

      // pathfindingDepth=0 means no nav graph lookup
      const snap = buildAwareness(bot, state, arena, Infinity, 0);
      expect(snap.navTarget).toBeNull();
    });
  });

  // ── 5-enemy nearest pick ─────────────────────────────────────────────

  describe('nearest enemy with 5 enemies', () => {
    it('picks the closest among 5 enemies', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const e1 = makePlayer({ id: 'P1' as PlayerSlot, x: 200, y: 628 }); // dist ~300
      const e2 = makePlayer({ id: 'P2' as PlayerSlot, x: 400, y: 628 }); // dist ~100
      const e3 = makePlayer({ id: 'P3' as PlayerSlot, x: 700, y: 628 }); // dist ~200
      const e4 = makePlayer({ id: 'P4' as PlayerSlot, x: 900, y: 628 }); // dist ~400
      const e5 = makePlayer({ id: 'P5' as PlayerSlot, x: 480, y: 628 }); // dist ~20 (closest)
      const state = makeState({ players: [bot, e1, e2, e3, e4, e5] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).not.toBeNull();
      expect(snap.nearestEnemy!.x).toBe(480); // e5 is closest
    });
  });

  // ── All enemies splatted ─────────────────────────────────────────────

  describe('all enemies splatted', () => {
    it('returns null nearestEnemy when all enemies are splatted', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 628 });
      const s1 = makePlayer({ id: 'P1' as PlayerSlot, x: 300, y: 628, state: 'splat', splatTimer: 1 });
      const s2 = makePlayer({ id: 'P2' as PlayerSlot, x: 700, y: 628, state: 'splat', splatTimer: 0.5 });
      const s3 = makePlayer({ id: 'P3' as PlayerSlot, x: 400, y: 628, state: 'splat', splatTimer: 2 });
      const state = makeState({ players: [bot, s1, s2, s3] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestEnemy).toBeNull();
    });
  });

  // ── Carrot at exact awareness radius boundary ─────────────────────────

  describe('carrot at awareness radius boundary', () => {
    it('finds carrot at exactly the awareness radius distance', () => {
      // Bot at x=100, y=628. Carrot at x=350, y=628.
      // Distance = 250 (exactly at awareness radius)
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({
        players: [bot],
        carrots: [{ x: 350, y: 628, active: true, spawnTime: 0 }],
      });
      const arena = makeArena();

      // Awareness radius = 250. Distance is 250. Condition is dist < 250, so it should NOT be found
      const snap = buildAwareness(bot, state, arena, 250);
      expect(snap.nearestCarrot).toBeNull();
    });

    it('finds carrot just inside the awareness radius', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628 });
      const state = makeState({
        players: [bot],
        carrots: [{ x: 349, y: 628, active: true, spawnTime: 0 }],
      });
      const arena = makeArena();

      // Distance ~249 < 250, so it SHOULD be found
      const snap = buildAwareness(bot, state, arena, 250);
      expect(snap.nearestCarrot).not.toBeNull();
      expect(snap.nearestCarrot!.x).toBe(349);
    });
  });

  // ── Zero platforms ────────────────────────────────────────────────────

  describe('zero platforms', () => {
    it('returns null nearestPlatformAbove and nearestPlatformBelow with no platforms', () => {
      const arena = makeArena({ platforms: [] });
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 500, y: 400, state: 'airborne' });
      const state = makeState({ players: [bot] });

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.nearestPlatformAbove).toBeNull();
      expect(snap.nearestPlatformBelow).toBeNull();
    });
  });

  // ── currentPlatformIdx when airborne ──────────────────────────────────

  describe('currentPlatformIdx airborne', () => {
    it('is -1 when player is airborne', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 450, y: 300, state: 'airborne' });
      const state = makeState({ players: [bot] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.currentPlatformIdx).toBe(-1);
    });
  });

  // ── Leader score when all scores are 0 ────────────────────────────────

  describe('leader score all zero', () => {
    it('returns leaderScore 0 when all players have score 0', () => {
      const bot = makePlayer({ id: 'B1' as PlayerSlot, x: 100, y: 628, score: 0 });
      const e1 = makePlayer({ id: 'P1' as PlayerSlot, x: 400, y: 628, score: 0 });
      const e2 = makePlayer({ id: 'P2' as PlayerSlot, x: 700, y: 628, score: 0 });
      const e3 = makePlayer({ id: 'P3' as PlayerSlot, x: 900, y: 628, score: 0 });
      const state = makeState({ players: [bot, e1, e2, e3] });
      const arena = makeArena();

      const snap = buildAwareness(bot, state, arena, Infinity);
      expect(snap.leaderScore).toBe(0);
    });
  });
});
