/**
 * Systems lifecycle tests — verifies that each System class correctly wires
 * to its underlying pure functions via init/update/cleanup.
 *
 * Strategy: create a minimal MatchState + Arena, call the method under test,
 * and assert that the observable side-effect of the underlying pure function
 * occurred (state mutation, Map population, array cleared, etc.).
 * We do NOT re-test pure function logic in isolation here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatchState, MatchSettings, Arena, Player, PlayerSlot } from '../../types';
import { makePlayer, makeArena, makeState, makeSettings } from '../../__tests__/testHelpers';

// ── Mocks (must be declared before any import that transitively loads them) ──

vi.mock('../../audio', () => ({
  audio: {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    playAnimal: vi.fn(),
    stopAllGameSounds: vi.fn(),
  },
}));

vi.mock('../../haptics', () => ({
  haptics: {
    isLocal: () => false,
    init: vi.fn(),
    bump: vi.fn(),
    hazardHit: vi.fn(),
    spring: vi.fn(),
    hitstop: vi.fn(),
    landing: vi.fn(),
  },
}));

// ── System imports (after mocks) ──

import { EnvironmentSystem } from '../cosmetics/EnvironmentSystem';
import { EntityTransitionSystem } from '../cosmetics/EntityTransitionSystem';
import { ParticleSystem } from '../cosmetics/ParticleSystem';
import { PlayerTransitionSystem } from '../cosmetics/PlayerTransitionSystem';
import { PlayerCosmeticSystem } from '../cosmetics/PlayerCosmeticSystem';
import { HUDFeedbackSystem } from '../cosmetics/HUDFeedbackSystem';
import { HazardSystem } from '../gameplay/HazardSystem';
import { CarrotSystem } from '../gameplay/CarrotSystem';
import { ArenaEntitySystem } from '../gameplay/ArenaEntitySystem';
import { EffectZoneSystem } from '../gameplay/EffectZoneSystem';
import { PlayerCollisionSystem } from '../gameplay/PlayerCollisionSystem';
import { StompSystem } from '../gameplay/StompSystem';
import { MatchSystem } from '../gameplay/MatchSystem';

// ── Shared mock fixtures ─────────────────────────────────────────────────────

const mockArena: Arena = {
  id: 'test',
  name: 'Test',
  themeId: 'meadow',
  width: 1280,
  height: 720,
  platforms: [
    { x: 0, y: 700, width: 1280, height: 20 },
    { x: 200, y: 400, width: 200, height: 20 },
  ],
  spawnPoints: [{ x: 640, y: 650 }],
  effectZones: [],
} as any;

const mockTheme = {
  weather: { particleCount: 0, types: [] },
  wildlife: { count: 0, types: [] },
  fog: { count: 0 },
  ambientParticles: { count: 0 },
  dayNight: { enabled: false, cycleDuration: 120, showShootingStars: false },
  platform: { floatingBodyColor: '#888', groundTopColor: '#666' },
  physics: {},
} as any;

const mockSettings = makeSettings({ killLimit: 5 });

/** Systems.test.ts default: two players, countdown=3, high timers to prevent accidental spawns. */
function makeSystemState(overrides?: Partial<MatchState>): MatchState {
  return makeState({
    players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
    countdown: 3,
    carrotTimer: 99,
    springSpawnTimer: 99,
    thornSpawnTimer: 99,
    lavaRockTimer: 99,
    ...overrides,
  });
}

// ── EnvironmentSystem ────────────────────────────────────────────────────────

describe('EnvironmentSystem', () => {
  it('init() is a no-op (returns without error)', () => {
    const state = makeSystemState();
    const sys = new EnvironmentSystem(state, mockTheme);
    expect(() => sys.init()).not.toThrow();
  });

  it('cosmeticUpdate() advances wildlife wingPhase', () => {
    const state = makeSystemState({
      wildlife: [{ type: 'butterfly', x: 100, y: 200, vx: 20, vy: 0, wingPhase: 0, color: '#fff' }],
    });
    const sys = new EnvironmentSystem(state, mockTheme);
    sys.init();
    sys.cosmeticUpdate(1 / 60);
    // updateWildlife increments wingPhase by dt * 8
    expect(state.wildlife[0].wingPhase).toBeGreaterThan(0);
  });

  it('cosmeticUpdate() advances shockwave radius', () => {
    // life must be < SHOCKWAVE_DURATION (0.4) so that progress = 1 - life/duration > 0
    const state = makeSystemState({
      shockwaves: [{ x: 100, y: 100, radius: 0, maxRadius: 200, life: 0.2 }],
    });
    const sys = new EnvironmentSystem(state, mockTheme);
    sys.init();
    sys.cosmeticUpdate(1 / 60);
    // updateShockwaves: radius = maxRadius * (1 - life/SHOCKWAVE_DURATION) > 0 when life < duration
    expect(state.shockwaves[0].radius).toBeGreaterThan(0);
  });

  it('cleanup() is a no-op (returns without error)', () => {
    const state = makeSystemState();
    const sys = new EnvironmentSystem(state, mockTheme);
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── EntityTransitionSystem ───────────────────────────────────────────────────

describe('EntityTransitionSystem', () => {
  it('init() seeds springBounces from state.springs', () => {
    const state = makeSystemState({
      springs: [
        { x: 300, y: 400, platformIndex: 1, bounceTimer: 0.2, life: 5, growTimer: 0 },
        { x: 500, y: 400, platformIndex: 1, bounceTimer: 0, life: 5, growTimer: 0 },
      ],
    });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    // Trigger cosmeticUpdate with unchanged springs — no sound expected
    // (both bounce timers remain same as captured at init)
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).not.toHaveBeenCalledWith('spring');
  });

  it('init() captures countdownSec from state.countdown', () => {
    const state = makeSystemState({ countdown: 2.7 });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    // Countdown drops from ceil(2.7)=3 to ceil(2.0)=2 → should play beep
    state.countdown = 2.0;
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).toHaveBeenCalledWith('countdown_beep');
  });

  it('cosmeticUpdate() plays "spring" sound when bounceTimer rises from 0', () => {
    const state = makeSystemState({
      springs: [{ x: 300, y: 400, platformIndex: 1, bounceTimer: 0, life: 5, growTimer: 0 }],
    });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    // Simulate spring being hit — bounceTimer goes from 0 → positive
    state.springs[0].bounceTimer = 0.3;
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).toHaveBeenCalledWith('spring');
  });

  it('cosmeticUpdate() plays "countdown_go" when countdown transitions from >0 to 0', () => {
    const state = makeSystemState({ countdown: 0.5 });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    state.countdown = 0;
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).toHaveBeenCalledWith('countdown_go');
  });

  it('cosmeticUpdate() plays "victory" when matchOver transitions false → true', () => {
    const state = makeSystemState({ matchOver: false });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    state.matchOver = true;
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).toHaveBeenCalledWith('victory');
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = new EntityTransitionSystem(state, vi.fn());
    expect(() => sys.cleanup()).not.toThrow();
  });

  // ─── Spring identity (not array index) ─────────────────────────────────
  // Springs are removed via swapRemove(): a dead slot is overwritten by the
  // last spring in the array. If detection is keyed by index, the moved-in
  // spring's `bounceTimer = 0` could be compared against the dead spring's
  // prior nonzero bounceTimer and miss the next bounce.
  it('detection survives swapRemove of an earlier spring (identity-keyed)', () => {
    const springA = { x: 100, y: 400, platformIndex: 1, bounceTimer: 0, life: 5, growTimer: 0 };
    const springB = { x: 500, y: 400, platformIndex: 1, bounceTimer: 0, life: 5, growTimer: 0 };
    const state = makeSystemState({ springs: [springA, springB] });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    // First, springA bounces — capture its prev=0 → cur=0.3 transition
    springA.bounceTimer = 0.3;
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).toHaveBeenCalledWith('spring');
    playSound.mockClear();

    // Now springA is removed via swapRemove — springB shifts into slot 0,
    // and a NEW spring fills slot 1.
    const springC = { x: 800, y: 400, platformIndex: 1, bounceTimer: 0, life: 5, growTimer: 0 };
    state.springs[0] = springB;
    state.springs[1] = springC;
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).not.toHaveBeenCalled();

    // springB bounces. With INDEX-keyed detection this would compare against
    // springA's prior 0.3 (still in slot 0) and miss the 0→0.3 transition.
    // With IDENTITY-keyed detection, springB's own prev=0 is read.
    springB.bounceTimer = 0.4;
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).toHaveBeenCalledWith('spring');
  });

  it('resetBaseline() re-primes prev-state to suppress spurious next-tick fire', () => {
    const state = makeSystemState({ matchOver: false });
    const playSound = vi.fn();
    const sys = new EntityTransitionSystem(state, playSound);
    sys.init();

    // State changes drastically (simulating snapshot apply on reconnect)
    state.matchOver = true;
    state.countdown = 0;
    sys.resetBaseline();

    // After reset, the next cosmeticUpdate should NOT fire victory or
    // countdown sounds, because the baseline now matches current state.
    sys.cosmeticUpdate(1 / 60);
    expect(playSound).not.toHaveBeenCalledWith('victory');
    expect(playSound).not.toHaveBeenCalledWith('countdown_go');
  });
});

// ── ParticleSystem ───────────────────────────────────────────────────────────

describe('ParticleSystem', () => {
  function makeParticleSystem(state: MatchState) {
    return new ParticleSystem(
      state,
      mockArena,
      mockTheme,
      mockSettings,
      new Map(),
    );
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('emitParticle() adds to internal particle pool', () => {
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    sys.init();
    sys.emitParticle(100, 200, 0, -50, 0.5, 3, '#ff0000');
    expect(sys.getParticles().length).toBe(1);
  });

  it('cosmeticUpdate() decays particle life', () => {
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    sys.init();
    sys.emitParticle(100, 200, 0, -50, 0.5, 3, '#ff0000');

    const dt = 1 / 60;
    sys.cosmeticUpdate(dt);

    const p = sys.getParticles()[0];
    expect(p.life).toBeLessThan(0.5);
  });

  it('cosmeticUpdate() removes expired particles from pool', () => {
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    sys.init();
    sys.emitParticle(100, 200, 0, 0, 0.001, 3, '#ff0000'); // nearly dead

    sys.cosmeticUpdate(1); // 1s — well past life
    expect(sys.getParticles().length).toBe(0);
  });

  it('cleanup() clears particle arrays', () => {
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    sys.init();
    sys.emitParticle(100, 200, 0, -50, 0.5, 3, '#ff0000');
    expect(sys.getParticles().length).toBe(1);

    sys.cleanup();
    expect(sys.getParticles().length).toBe(0);
  });

  it('emitParticle enforces a soft cap so bulk emitters cannot grow live count unbounded', () => {
    // Regression: spawnGoreParticles + matchOver firework spam could push the
    // live array into the thousands and stutter mobile GC. Cap is 600.
    const state = makeSystemState();
    const sys = makeParticleSystem(state);
    sys.init();
    for (let i = 0; i < 1500; i++) {
      sys.emitParticle(0, 0, 0, 0, 1.0, 3, '#fff');
    }
    expect(sys.getParticles().length).toBeLessThanOrEqual(600);
  });
});

// ── PlayerTransitionSystem ───────────────────────────────────────────────────

describe('PlayerTransitionSystem', () => {
  function makePlayerTransitionSystem(state: MatchState) {
    const particleSys = new ParticleSystem(state, mockArena, mockTheme, mockSettings, new Map());
    const playSound = vi.fn();
    const playAnimal = vi.fn();
    return { sys: new PlayerTransitionSystem(state, mockSettings, playSound, playAnimal, particleSys), playSound, playAnimal };
  }

  it('init() populates prevCosmeticState for each player', () => {
    const state = makeSystemState();
    const { sys } = makePlayerTransitionSystem(state);
    sys.init();

    // getSfxCooldowns returns the PlayerSfxCooldowns instance — all three
    // cooldowns are ready (uninitialized) for any slot at start.
    const cooldowns = sys.getSfxCooldowns();
    expect(cooldowns.land.isReady('P1')).toBe(true);
    expect(cooldowns.headbonk.isReady('P1')).toBe(true);
    expect(cooldowns.crouch.isReady('P1')).toBe(true);
  });

  it('cosmeticUpdate() fires jump sound on grounded → airborne transition', () => {
    const player = makePlayer({ id: 'P1', state: 'idle' });
    const state = makeSystemState({ players: [player] });
    const { sys, playSound } = makePlayerTransitionSystem(state);
    sys.init();

    // Transition player to airborne
    player.state = 'airborne';
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).toHaveBeenCalledWith('jump');
  });

  it('cosmeticUpdate() decays damageFlashTimer', () => {
    const player = makePlayer({ id: 'P1', state: 'idle', damageFlashTimer: 0.3 });
    const state = makeSystemState({ players: [player] });
    const { sys } = makePlayerTransitionSystem(state);
    sys.init();

    sys.cosmeticUpdate(1 / 60);

    expect(player.damageFlashTimer).toBeLessThan(0.3);
  });

  it('cleanup() clears prevCosmeticState and sfxCooldowns', () => {
    const state = makeSystemState();
    const { sys } = makePlayerTransitionSystem(state);
    sys.init();
    // Set a cooldown so we can observe the clear.
    sys.getSfxCooldowns().land.set('P1', 0.5);
    expect(sys.getSfxCooldowns().land.isReady('P1')).toBe(false);
    sys.cleanup();
    expect(sys.getSfxCooldowns().land.isReady('P1')).toBe(true);
  });

  it('score increase WITHOUT fatTimer change (kill score +2) does NOT fire crunch', () => {
    // Regression: previously the score-delta branch fired `crunch` + carrot
    // pickup VFX unconditionally. A stomp adds +2 to the attacker, which
    // wrongly triggered carrot SFX every kill. Now gated on fatTimer transition.
    const player = makePlayer({ id: 'P1', state: 'idle', score: 0, fatTimer: 0 });
    const state = makeSystemState({ players: [player] });
    const { sys, playSound } = makePlayerTransitionSystem(state);
    sys.init();

    // Simulate kill: score +2, fatTimer unchanged.
    player.score = 2;
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).not.toHaveBeenCalledWith('crunch');
    // Score animation still pushed (used for the floating "+2" text).
    expect(state.scoreAnimations.length).toBe(1);
    expect(state.scoreAnimations[0].value).toBe(2);
  });

  it('fatTimer 0 → positive (carrot pickup) DOES fire crunch + animal + VFX', () => {
    const player = makePlayer({ id: 'P1', state: 'idle', score: 0, fatTimer: 0 });
    const state = makeSystemState({ players: [player] });
    const { sys, playSound, playAnimal } = makePlayerTransitionSystem(state);
    sys.init();

    // Simulate carrot pickup: score +1, fatTimer set to FAT_DURATION.
    player.score = 1;
    player.fatTimer = 8; // FAT_DURATION-ish
    sys.cosmeticUpdate(1 / 60);

    expect(playSound).toHaveBeenCalledWith('crunch');
    expect(playAnimal).toHaveBeenCalled();
    expect(state.scoreAnimations.length).toBe(1);
    expect(state.scoreAnimations[0].value).toBe(1);
  });

  it('resetBaseline() suppresses spurious jump SFX after a state jump', () => {
    // Simulates the reconnect path: prev-state captured at construction shows
    // an idle player; after the disconnect/reconnect window, the snapshot
    // shows the player airborne with a different score. Without resetBaseline,
    // the next cosmeticUpdate would fire 'jump' (idle→airborne) and N×'crunch'
    // for the score delta. With resetBaseline, the new state IS the baseline.
    const player = makePlayer({ id: 'P1', state: 'idle', score: 0 });
    const state = makeSystemState({ players: [player] });
    const { sys, playSound } = makePlayerTransitionSystem(state);
    sys.init();

    // Mutate to "post-reconnect" state
    player.state = 'airborne';
    player.score = 4;
    sys.resetBaseline();
    playSound.mockClear();

    sys.cosmeticUpdate(1 / 60);
    expect(playSound).not.toHaveBeenCalledWith('jump');
    expect(playSound).not.toHaveBeenCalledWith('crunch');
  });
});

// ── PlayerCosmeticSystem ─────────────────────────────────────────────────────

describe('PlayerCosmeticSystem', () => {
  function makePlayerCosmeticSystem(state: MatchState) {
    const particleSys = new ParticleSystem(state, mockArena, mockTheme, mockSettings, new Map());
    const playSound = vi.fn();
    return new PlayerCosmeticSystem(state, 200, particleSys, playSound);
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const sys = makePlayerCosmeticSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('cosmeticUpdate() does NOT advance animTimer (now in Simulator.fixedUpdate)', () => {
    const player = makePlayer({ id: 'P1', state: 'run', animTimer: 0 });
    const state = makeSystemState({ players: [player] });
    const sys = makePlayerCosmeticSystem(state);
    sys.init();

    sys.cosmeticUpdate(1 / 60);

    // animFrame is in the snapshot — guest's local cosmetic clock would drift
    // vs host and override the authoritative value. Advance lives in
    // Simulator.fixedUpdate now (host-authoritative).
    expect(player.animTimer).toBe(0);
  });

  it('cosmeticUpdate() does NOT alter squashScale for non-fat player (squash decay is in GameLoop physics, not here)', () => {
    // PlayerCosmeticSystem only modifies squashScale for fat wobble (fatTimer > 0).
    // Squash decay toward 1 is handled in GameLoop's fixedUpdate per-player physics block.
    const player = makePlayer({ id: 'P1', state: 'idle', squashScale: 0.7, squashTimer: 0.3, fatTimer: 0 });
    const state = makeSystemState({ players: [player] });
    const sys = makePlayerCosmeticSystem(state);
    sys.init();

    sys.cosmeticUpdate(1 / 60);

    // No change expected — squashScale decay is not PlayerCosmeticSystem's responsibility
    expect(player.squashScale).toBe(0.7);
  });

  it('cleanup() clears afterimage and footstep accumulators', () => {
    const state = makeSystemState();
    const sys = makePlayerCosmeticSystem(state);
    // Run a few frames to populate accumulator Maps internally
    sys.init();
    sys.cosmeticUpdate(1 / 60);
    sys.cleanup();
    // After cleanup, no throw on subsequent usage
    expect(() => sys.cosmeticUpdate(1 / 60)).not.toThrow();
  });
});

// ── HazardSystem ─────────────────────────────────────────────────────────────

describe('HazardSystem', () => {
  it('init() populates floatingPlatforms from arena (excludes ground platforms)', () => {
    const state = makeSystemState();
    const sys = new HazardSystem(state, mockArena, Math.random);
    sys.init();

    // mockArena has 2 platforms: y=700 (ground, excluded) and y=400 (floating, included)
    expect(sys.floatingPlatforms).toHaveLength(1);
    expect(sys.floatingPlatforms[0].plat.y).toBe(400);
  });

  it('init() excludes platforms inside noSpawnZones', () => {
    const arenaWithNoSpawn: Arena = {
      ...mockArena,
      noSpawnZones: [{ x: 190, y: 390, width: 220, height: 40 }], // covers the floating plat
    };
    const state = makeSystemState();
    const sys = new HazardSystem(state, arenaWithNoSpawn, Math.random);
    sys.init();

    expect(sys.floatingPlatforms).toHaveLength(0);
  });

  it('fixedUpdate() decrements springSpawnTimer', () => {
    const state = makeSystemState({ springSpawnTimer: 10 });
    const sys = new HazardSystem(state, mockArena, Math.random);
    sys.init();

    sys.fixedUpdate(1 / 60);

    expect(state.springSpawnTimer).toBeLessThan(10);
  });

  it('fixedUpdate() decrements thornSpawnTimer', () => {
    const state = makeSystemState({ thornSpawnTimer: 10 });
    const sys = new HazardSystem(state, mockArena, Math.random);
    sys.init();

    sys.fixedUpdate(1 / 60);

    expect(state.thornSpawnTimer).toBeLessThan(10);
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = new HazardSystem(state, mockArena, Math.random);
    sys.init();
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── CarrotSystem ──────────────────────────────────────────────────────────────

describe('CarrotSystem', () => {
  function makeCarrotSystem(state: MatchState, carrotTimer = 99) {
    state.carrotTimer = carrotTimer;
    const particleSys = new ParticleSystem(state, mockArena, mockTheme, mockSettings, new Map());
    return new CarrotSystem(state, mockArena, mockSettings, [], Math.random, particleSys);
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const sys = makeCarrotSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('fixedUpdate() decrements carrotTimer each tick', () => {
    const state = makeSystemState({ carrotTimer: 5 });
    const sys = makeCarrotSystem(state, 5);
    sys.fixedUpdate(1 / 60);
    expect(state.carrotTimer).toBeLessThan(5);
  });

  it('fixedUpdate() resets carrotTimer and attempts to spawn a carrot when timer expires', () => {
    const state = makeSystemState({ carrotTimer: 0.001 });
    const sys = makeCarrotSystem(state, 0.001);
    sys.fixedUpdate(1); // big dt to push timer below zero
    // Timer should have been reset (positive again)
    expect(state.carrotTimer).toBeGreaterThan(0);
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = makeCarrotSystem(state);
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── ArenaEntitySystem ─────────────────────────────────────────────────────────

describe('ArenaEntitySystem', () => {
  const arenaWithZones: Arena = {
    ...mockArena,
    effectZones: [
      { x: 0, y: 0, width: 200, height: 100, type: 'geyser', interval: 5, duration: 1, strength: 800 },
      { x: 300, y: 0, width: 200, height: 100, type: 'zero_g' },
      { x: 600, y: 0, width: 200, height: 100, type: 'current', vx: 50, vy: 0 },
    ],
  };

  it('init() caches geyser and zero-G zone arrays', () => {
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, arenaWithZones, mockTheme, Math.random);
    sys.init();

    expect(sys.cachedGeyserZones).toHaveLength(1);
    expect(sys.cachedZeroGZones).toHaveLength(1);
  });

  it('init() builds geyserIndexMap', () => {
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, arenaWithZones, mockTheme, Math.random);
    sys.init();

    expect(sys.geyserIndexMap.size).toBe(1);
    const [zone] = sys.cachedGeyserZones;
    expect(sys.geyserIndexMap.get(zone)).toBe(0);
  });

  it('init() initializes geyserStates from state (empty when no geyser zones use array)', () => {
    const state = makeSystemState({ geyserStates: [] });
    const sys = new ArenaEntitySystem(state, arenaWithZones, mockTheme, Math.random);
    sys.init();
    // No crash; geyserStates remains whatever the caller set up
    expect(state.geyserStates).toBeDefined();
  });

  it('init() spawns ghosts into state when theme has ghostConfig', () => {
    const themeWithGhosts = {
      ...mockTheme,
      ghostConfig: { count: 3, speed: 60, size: 30 },
    };
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, mockArena, themeWithGhosts, Math.random);
    sys.init();

    expect(state.ghosts).toHaveLength(3);
  });

  it('getCachedGeyserZones() returns same reference set during init()', () => {
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, arenaWithZones, mockTheme, Math.random);
    sys.init();
    expect(sys.getCachedGeyserZones()).toBe(sys.cachedGeyserZones);
  });

  it('getCachedZeroGZones() returns same reference set during init()', () => {
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, arenaWithZones, mockTheme, Math.random);
    sys.init();
    expect(sys.getCachedZeroGZones()).toBe(sys.cachedZeroGZones);
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = new ArenaEntitySystem(state, mockArena, mockTheme, Math.random);
    sys.init();
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── EffectZoneSystem ──────────────────────────────────────────────────────────

describe('EffectZoneSystem', () => {
  const zeroGArena: Arena = {
    ...mockArena,
    effectZones: [
      { x: 0, y: 0, width: 1280, height: 720, type: 'zero_g' },
    ],
  };

  function makeEffectZoneSystem(state: MatchState, arena = zeroGArena) {
    const arenaEntitySys = new ArenaEntitySystem(state, arena, mockTheme, Math.random);
    arenaEntitySys.init();
    const playSound = vi.fn();
    const stopSound = vi.fn();
    return {
      sys: new EffectZoneSystem(
        state, arena, arenaEntitySys,
        () => new Map(),
        playSound,
        stopSound,
      ),
      playSound,
      stopSound,
    };
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const { sys } = makeEffectZoneSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('applyToPlayer() applies zero-g effect when player is inside zone', () => {
    const player = makePlayer({ id: 'P1', x: 100, y: 100, vy: 50 });
    const state = makeSystemState({ players: [player] });
    const { sys } = makeEffectZoneSystem(state);
    sys.init();

    sys.applyToPlayer(player, false, false, 0, 1 / 60);

    // zero-g damps downward velocity (vy * 0.92)
    expect(player.vy).toBeLessThan(50);
  });

  it('fixedUpdate() does not throw', () => {
    const state = makeSystemState();
    const { sys } = makeEffectZoneSystem(state);
    sys.init();
    expect(() => sys.fixedUpdate(1 / 60)).not.toThrow();
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const { sys } = makeEffectZoneSystem(state);
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── PlayerCollisionSystem ─────────────────────────────────────────────────────

describe('PlayerCollisionSystem', () => {
  function makePlayerCollisionSystem(state: MatchState) {
    const particleSys = new ParticleSystem(state, mockArena, mockTheme, mockSettings, new Map());
    return new PlayerCollisionSystem(state, mockArena, particleSys, () => false);
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const sys = makePlayerCollisionSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('checkCollisions() runs without error for an ordinary player', () => {
    const player = makePlayer({ id: 'P1', x: 640, y: 600, state: 'idle' });
    const state = makeSystemState({ players: [player] });
    const sys = makePlayerCollisionSystem(state);
    sys.init();
    expect(() => sys.checkCollisions(player)).not.toThrow();
  });

  it('fixedUpdate() is a no-op', () => {
    const state = makeSystemState();
    const sys = makePlayerCollisionSystem(state);
    sys.init();
    expect(() => sys.fixedUpdate(1 / 60)).not.toThrow();
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = makePlayerCollisionSystem(state);
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── StompSystem ───────────────────────────────────────────────────────────────

describe('StompSystem', () => {
  function makeStompSystem(state: MatchState) {
    return new StompSystem(state, mockArena, mockSettings, () => false, () => undefined);
  }

  it('init() is a no-op', () => {
    const state = makeSystemState();
    const sys = makeStompSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('fixedUpdate() processes state without throwing', () => {
    const state = makeSystemState({ countdown: 0 });
    const sys = makeStompSystem(state);
    sys.init();
    expect(() => sys.fixedUpdate(1 / 60)).not.toThrow();
  });

  it('fixedUpdate() applies hitstop when a stomp occurs mid-air → grounded', () => {
    // Position P2 directly above P1 so P2 stomps P1
    const victim = makePlayer({
      id: 'P1',
      x: 640, y: 600,
      state: 'idle',
      score: 0,
      invincibleTimer: 0,
      splatTimer: 0,
    });
    const stomper = makePlayer({
      id: 'P2',
      x: 640, y: victim.y - victim.height + 2,
      vy: 200, // falling fast
      state: 'airborne',
    });
    const state = makeSystemState({ players: [victim, stomper], countdown: 0 });
    const sys = makeStompSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(stomper.hitstopTimer).toBeGreaterThan(0);
  });

  it('increments totalKills on each stomp (uncapped, distinct from trimmed killFeed)', () => {
    // VictoryScreen "Total Splats" reads state.totalKills; killFeed is trimmed
    // to last 10. Verify the counter advances by one stomp event regardless of
    // whether the killFeed slice wraps.
    const victim = makePlayer({
      id: 'P1',
      x: 640, y: 600,
      state: 'idle',
      score: 0,
      invincibleTimer: 0,
      splatTimer: 0,
    });
    const stomper = makePlayer({
      id: 'P2',
      x: 640, y: victim.y - victim.height + 2,
      vy: 200,
      state: 'airborne',
    });
    const state = makeSystemState({ players: [victim, stomper], countdown: 0, totalKills: 0 });
    const sys = makeStompSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(state.totalKills).toBe(1);
  });

  it('cleanup() is a no-op', () => {
    const state = makeSystemState();
    const sys = makeStompSystem(state);
    expect(() => sys.cleanup()).not.toThrow();
  });
});

// ── MatchSystem ───────────────────────────────────────────────────────────────

describe('MatchSystem', () => {
  function makeMatchSystem(state: MatchState, onMatchEnd = vi.fn()) {
    const playSound = vi.fn();
    const stopSound = vi.fn();
    const setSoundVolume = vi.fn();
    const sys = new MatchSystem(
      state, mockSettings, mockTheme,
      playSound, stopSound, setSoundVolume, () => false,
      onMatchEnd,
    );
    return { sys, playSound, stopSound, setSoundVolume, onMatchEnd };
  }

  it('init() with no ambientSoundConfig does not call playSound', () => {
    const state = makeSystemState();
    const { sys, playSound } = makeMatchSystem(state);
    sys.init();
    expect(playSound).not.toHaveBeenCalled();
  });

  it('init() starts ambient loops defined in theme ambientSoundConfig', () => {
    const themeWithAmbient = {
      ...mockTheme,
      ambientSoundConfig: {
        loops: ['wind', 'water'],
        periodic: [],
      },
    };
    const state = makeSystemState();
    const playSound = vi.fn();
    const sys = new MatchSystem(state, mockSettings, themeWithAmbient, playSound, vi.fn(), vi.fn(), () => false, vi.fn());
    sys.init();

    expect(playSound).toHaveBeenCalledWith('wind');
    expect(playSound).toHaveBeenCalledWith('water');
  });

  it('fixedUpdate() invokes checkMatchEnd and fires onMatchEnd when score limit reached', () => {
    const winner = makePlayer({ id: 'P1', score: 5 }); // equals killLimit=5
    const state = makeSystemState({ players: [winner], countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);

    expect(onMatchEnd).toHaveBeenCalledWith('P1');
    expect(state.slowMotion).toBeGreaterThan(0);
  });

  it('fixedUpdate() does not fire onMatchEnd when no player has reached killLimit', () => {
    const state = makeSystemState({ countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);

    expect(onMatchEnd).not.toHaveBeenCalled();
  });

  it('fixedUpdate() skips crowd + ambient tick when resimulating', () => {
    const state = makeSystemState({ countdown: 0 });
    const playSound = vi.fn();
    const sys = new MatchSystem(state, mockSettings, mockTheme, playSound, vi.fn(), vi.fn(), () => true, vi.fn());
    sys.init();
    sys.fixedUpdate(1 / 60);

    // crowd cheering should not fire during resimulation
    expect(playSound).not.toHaveBeenCalledWith('crowd');
  });

  it('cleanup() clears activeAmbientLoops and periodicAmbientTimers', () => {
    const themeWithAmbient = {
      ...mockTheme,
      ambientSoundConfig: {
        loops: ['wind'],
        periodic: [{ sound: 'bird', intervalRange: [5, 10] as [number, number] }],
      },
    };
    const state = makeSystemState();
    const sys = new MatchSystem(state, mockSettings, themeWithAmbient, vi.fn(), vi.fn(), vi.fn(), () => false, vi.fn());
    sys.init();
    sys.cleanup();
    // No throw; internal maps reset
    expect(() => sys.fixedUpdate(1 / 60)).not.toThrow();
  });

  it('cleanup() stops every ambient loop init() started (so endMatch can silence them mid-match)', () => {
    // GameLoop.endMatch calls matchSystem.cleanup() before the 1.5s victory
    // delay so theme ambient loops (wind, lava, etc.) don't keep playing
    // audibly until Match.tsx unmount. Verify cleanup actually emits stop()
    // for each registered loop via the injected stopSound callback.
    const themeWithAmbient = {
      ...mockTheme,
      ambientSoundConfig: {
        loops: ['wind', 'lava'],
        periodic: [],
      },
    };
    const stopSound = vi.fn();

    const state = makeSystemState();
    const sys = new MatchSystem(state, mockSettings, themeWithAmbient, vi.fn(), stopSound, vi.fn(), () => false, vi.fn());
    sys.init();
    sys.cleanup();

    expect(stopSound).toHaveBeenCalledWith('wind');
    expect(stopSound).toHaveBeenCalledWith('lava');
  });

  it('cleanup() is idempotent — second call is a no-op (endMatch + GameLoop.stop both call it)', () => {
    const themeWithAmbient = {
      ...mockTheme,
      ambientSoundConfig: {
        loops: ['wind'],
        periodic: [],
      },
    };
    const stopSound = vi.fn();

    const state = makeSystemState();
    const sys = new MatchSystem(state, mockSettings, themeWithAmbient, vi.fn(), stopSound, vi.fn(), () => false, vi.fn());
    sys.init();
    sys.cleanup();
    const firstCallCount = stopSound.mock.calls.length;
    sys.cleanup();
    // No additional stop() calls — activeAmbientLoops is now empty.
    expect(stopSound.mock.calls.length).toBe(firstCallCount);
  });

  // --- host match-end guard: no-humans-remaining ---

  it('ends match as self-winner when only one human remains and no bots', () => {
    const p1 = makePlayer({ id: 'P1', score: 0 });
    const p2 = makePlayer({ id: 'P2', score: 0, disconnected: true });
    const state = makeSystemState({ players: [p1, p2], countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(onMatchEnd).toHaveBeenCalledWith('P1');
  });

  it('ends match with null winner when all players disconnected', () => {
    const p1 = makePlayer({ id: 'P1', score: 0, disconnected: true });
    const p2 = makePlayer({ id: 'P2', score: 0, disconnected: true });
    const state = makeSystemState({ players: [p1, p2], countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(onMatchEnd).toHaveBeenCalledWith(null);
  });

  it('does NOT end match when one human + one bot remain (match continues)', () => {
    const p1 = makePlayer({ id: 'P1', score: 0 });
    const b1 = makePlayer({ id: 'B1', score: 0 });
    const state = makeSystemState({ players: [p1, b1], countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(onMatchEnd).not.toHaveBeenCalled();
  });

  it('does NOT end match when two humans both active', () => {
    const p1 = makePlayer({ id: 'P1', score: 0 });
    const p2 = makePlayer({ id: 'P2', score: 0 });
    const state = makeSystemState({ players: [p1, p2], countdown: 0 });
    const { sys, onMatchEnd } = makeMatchSystem(state);
    sys.init();
    sys.fixedUpdate(1 / 60);
    expect(onMatchEnd).not.toHaveBeenCalled();
  });
});

// ── HUDFeedbackSystem ────────────────────────────────────────────────────────

describe('HUDFeedbackSystem', () => {
  it('init() snapshots scores and clears combo windows', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1', score: 5 }), makePlayer({ id: 'P2', score: 3 })],
    });
    const sys = new HUDFeedbackSystem(state);
    expect(() => sys.init()).not.toThrow();
  });

  it('single kill spawns no combo popup', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2', x: 200, y: 100 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 5 });
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(0);
  });

  it('two kills within window spawn ×2 popup', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2', x: 220, y: 110 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 5.0 });
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 5.5 });
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(1);
    expect(state.comboPopups[0].count).toBe(2);
    expect(state.comboPopups[0].killer).toBe('P1');
  });

  it('three kills within window spawns ×2 then ×3 (popups stack on same chain)', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2', x: 220, y: 110 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push(
      { attacker: 'P1', victim: 'P2', timestamp: 5.0 },
      { attacker: 'P1', victim: 'P2', timestamp: 5.4 },
      { attacker: 'P1', victim: 'P2', timestamp: 5.8 },
    );
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups.map(p => p.count)).toEqual([2, 3]);
  });

  it('kill outside the window resets the combo to 1', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2', x: 220, y: 110 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 5.0 });
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(0);
    // Second kill 2.0s later — outside the 1.5s window.
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 7.0 });
    state.timeElapsed = 7.0;
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(0);
  });

  it('different killers do not share combo windows', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' }), makePlayer({ id: 'B1', x: 300, y: 200 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push(
      { attacker: 'P1', victim: 'B1', timestamp: 5.0 },
      { attacker: 'P2', victim: 'B1', timestamp: 5.2 },
    );
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(0);
  });

  it('combo popup positioned at victim location', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2', x: 350, y: 280, width: 30 })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push(
      { attacker: 'P1', victim: 'P2', timestamp: 5.0 },
      { attacker: 'P1', victim: 'P2', timestamp: 5.3 },
    );
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups[0].x).toBe(365); // 350 + 30/2
    expect(state.comboPopups[0].y).toBe(280);
  });

  it('popup timer decays and removes when expired', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push(
      { attacker: 'P1', victim: 'P2', timestamp: 5.0 },
      { attacker: 'P1', victim: 'P2', timestamp: 5.3 },
    );
    sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(1);
    // Advance enough to expire the popup (COMBO_POPUP_DURATION = 1.0s).
    for (let i = 0; i < 90; i++) sys.cosmeticUpdate(1 / 60);
    expect(state.comboPopups).toHaveLength(0);
  });

  it('score rising edge sets goal pulse timer', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1', score: 0 }), makePlayer({ id: 'P2', score: 0 })],
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.players[0].score = 1;
    sys.cosmeticUpdate(1 / 60);
    expect(state.goalPulseTimers.get('P1')).toBeGreaterThan(0);
    expect(state.goalPulseTimers.has('P2')).toBe(false);
  });

  it('goal pulse decays and clears', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1', score: 0 })],
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.players[0].score = 1;
    sys.cosmeticUpdate(1 / 60);
    const initial = state.goalPulseTimers.get('P1')!;
    sys.cosmeticUpdate(1 / 60);
    expect(state.goalPulseTimers.get('P1')).toBeLessThan(initial);
    // Advance enough to expire (GOAL_PULSE_DURATION = 0.45s).
    for (let i = 0; i < 60; i++) sys.cosmeticUpdate(1 / 60);
    expect(state.goalPulseTimers.has('P1')).toBe(false);
  });

  it('score going down does not trigger pulse', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1', score: 5 })],
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.players[0].score = 4;
    sys.cosmeticUpdate(1 / 60);
    expect(state.goalPulseTimers.has('P1')).toBe(false);
  });

  it('resetBaseline ignores a new kill that landed before reset', () => {
    const state = makeSystemState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
      timeElapsed: 5,
    });
    const sys = new HUDFeedbackSystem(state);
    sys.init();
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 5.0 });
    state.timeElapsed = 6;
    sys.resetBaseline();
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 6.5 });
    sys.cosmeticUpdate(1 / 60);
    // Single kill since baseline → no combo (rolled-up timestamps cleared).
    expect(state.comboPopups).toHaveLength(0);
  });
});
