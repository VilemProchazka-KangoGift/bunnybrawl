/**
 * Unit tests for pure-function modules in src/engine/gameLoop/
 * Targets uncovered branches in:
 *   - gameplay/arenaEntities.ts  (lava rock spawn, ghost wrapping)
 *   - gameplay/match.ts          (touch input, bot input, keyboard fallback)
 *   - cosmetics/sfx.ts           (cooldown no-op, periodic ambient timer)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import i18n from 'i18next';

// ── Audio mock (required by sfx.ts) ─────────────────────────────────────────
vi.mock('../../audio', () => ({
  audio: {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  },
}));

// Force English so any i18n-dependent code is deterministic
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
  } else {
    await i18n.changeLanguage('en');
  }
});

// ── Imports after mocks ──────────────────────────────────────────────────────
import { updateLavaRocks, updateGhosts, updateGeyserTimers, updatePigeonFlocks } from '../gameplay/arenaEntities';
import { checkMatchEnd } from '../gameplay/match';
import {
  PlayerSfxCooldowns,
  updateCrowdCheering,
  tickPeriodicAmbient,
} from '../cosmetics/sfx';
import { Cooldowns } from '../../cooldowns';
import { audio } from '../../audio';
import type { PlayerSlot } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { makePlayer, makeState, makeSettings } from '../../__tests__/testHelpers';

// ── Shared helpers ───────────────────────────────────────────────────────────

const f = Math.fround;


/** Minimal ThemeConfig — just enough for lava rock tests. */
function makeThemeWithLavaRock(overrides: Partial<ThemeConfig['lavaRockConfig']> = {}): ThemeConfig {
  return {
    id: 'test',
    nameKey: 'test',
    previewGradient: '',
    previewIcon: '',
    sky: { gradient: [] },
    hills: [],
    ground: { surfaceColor: '#000', surfaceThickness: 1 },
    platform: {
      floatingBodyColor: '#000',
      floatingTopColor: '#000',
      groundBodyColor: '#000',
      groundTopColor: '#000',
      drawMoss: false,
    },
    clouds: { count: 0, color: '#fff', minSize: 10, maxSize: 20, minSpeed: 1, maxSpeed: 2, yRange: [0, 100] },
    weather: { particleCount: 0, types: [] },
    wildlife: { count: 0, types: [] },
    fog: { count: 0, baseY: 0, yVariance: 0, speedRange: [0, 1], alphaRange: [0, 1], color: '#fff', sizeX: 1, sizeY: 1 },
    ambientParticles: { count: 0, sizeRange: [1, 2], vxRange: [0, 1], vyRange: [0, 1], alphaRange: [0, 1], colors: [] },
    dayNight: { enabled: false, cycleDuration: 60, maxNightAlpha: 0.8, showFireflies: false, showShootingStars: false },
    drawBackgroundNature: vi.fn(),
    drawForegroundNature: vi.fn(),
    lavaRockConfig: {
      spawnInterval: [2, 4],
      fallSpeed: [100, 200],
      sizeRange: [10, 20],
      color: '#ff0000',
      glowColor: '#ff4400',
      ...overrides,
    },
  } as unknown as ThemeConfig;
}

function makeThemeWithoutLavaRock(): ThemeConfig {
  const t = makeThemeWithLavaRock();
  const { lavaRockConfig: _omit, ...rest } = t as any;
  return rest as ThemeConfig;
}

// ════════════════════════════════════════════════════════════════════════════
// arenaEntities.ts
// ════════════════════════════════════════════════════════════════════════════

describe('updateLavaRocks', () => {
  it('does nothing when theme has no lavaRockConfig', () => {
    const theme = makeThemeWithoutLavaRock();
    const state = makeState({ lavaRocks: [], lavaRockTimer: 5 });
    updateLavaRocks(state, theme, 1 / 60, () => 0.5);
    expect(state.lavaRocks).toHaveLength(0);
    // timer must not have been mutated
    expect(state.lavaRockTimer).toBe(5);
  });

  it('decrements the timer each tick', () => {
    const theme = makeThemeWithLavaRock();
    const state = makeState({ lavaRocks: [], lavaRockTimer: 2 });
    const dt = f(1 / 60);
    updateLavaRocks(state, theme, dt, () => 0.5);
    expect(state.lavaRockTimer).toBeCloseTo(2 - dt, 4);
  });

  it('spawns a lava rock when timer reaches zero', () => {
    const theme = makeThemeWithLavaRock({
      spawnInterval: [3, 3], // fixed interval
      fallSpeed: [150, 150],
      sizeRange: [10, 10],
    });
    // Use a timer small enough that one dt ticks it below 0
    const state = makeState({ lavaRocks: [], lavaRockTimer: 0.001 });
    const dt = f(1 / 60);
    updateLavaRocks(state, theme, dt, () => 0);
    // One rock should have been pushed
    expect(state.lavaRocks).toHaveLength(1);
    const rock = state.lavaRocks[0];
    // Rock spawns at y=-20 then is immediately advanced by vy*dt in the same update call
    expect(rock.y).toBeCloseTo(-20 + f(150) * f(1 / 60), 2);
    expect(rock.vy).toBe(f(150));
    expect(rock.size).toBe(f(10));
    expect(rock.active).toBe(true);
    // Timer should have been reset to spawnInterval[0] (since gameRandom() === 0)
    expect(state.lavaRockTimer).toBeCloseTo(3, 3);
  });

  it('uses gameRandom to spread rock x-position within valid range', () => {
    const theme = makeThemeWithLavaRock({ spawnInterval: [1, 1], fallSpeed: [100, 100], sizeRange: [10, 10] });
    const state = makeState({ lavaRocks: [], lavaRockTimer: 0 });
    // gameRandom always returns 0 → x = 80
    updateLavaRocks(state, theme, f(1 / 60), () => 0);
    expect(state.lavaRocks[0].x).toBe(f(80));

    // gameRandom always returns 1 → x = 80 + (CANVAS_WIDTH - 160) = CANVAS_WIDTH - 80
    const state2 = makeState({ lavaRocks: [], lavaRockTimer: 0 });
    updateLavaRocks(state2, theme, f(1 / 60), () => 1);
    expect(state2.lavaRocks[0].x).toBe(f(CANVAS_WIDTH - 80));
  });

  it('advances existing rock positions each tick', () => {
    const theme = makeThemeWithLavaRock();
    const state = makeState({
      lavaRocks: [{ x: 400, y: 50, vy: 120, size: 15, rotation: 0, active: true }],
      lavaRockTimer: 10, // no new spawn
    });
    const dt = f(1 / 60);
    updateLavaRocks(state, theme, dt, () => 0.5);
    expect(state.lavaRocks[0].y).toBeCloseTo(50 + 120 * dt, 2);
    expect(state.lavaRocks[0].rotation).toBeCloseTo(dt * 3, 4);
  });

  it('marks rocks inactive when they fall below canvas', () => {
    const theme = makeThemeWithLavaRock();
    // Start the rock just below the removal threshold (CANVAS_HEIGHT + 30)
    // so that even a single dt advance puts it past the boundary
    const state = makeState({
      lavaRocks: [
        { x: 400, y: CANVAS_HEIGHT + 28, vy: 200, size: 15, rotation: 0, active: true },
      ],
      lavaRockTimer: 10,
    });
    updateLavaRocks(state, theme, f(1 / 60), () => 0.5);
    // Rock y = 720+28 + 200*(1/60) ≈ 751.3 > 750 → active=false → removed
    expect(state.lavaRocks).toHaveLength(0);
  });

  it('removes inactive rocks via swapRemove', () => {
    const theme = makeThemeWithLavaRock();
    const state = makeState({
      lavaRocks: [
        { x: 200, y: CANVAS_HEIGHT + 50, vy: 0, size: 10, rotation: 0, active: false },
        { x: 600, y: 100, vy: 100, size: 10, rotation: 0, active: true },
      ],
      lavaRockTimer: 10,
    });
    updateLavaRocks(state, theme, f(1 / 60), () => 0.5);
    expect(state.lavaRocks).toHaveLength(1);
    expect(state.lavaRocks[0].x).toBe(600);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('updateGhosts', () => {
  const dt = f(1 / 60);

  it('advances ghost x position with vx', () => {
    const state = makeState({
      ghosts: [{ x: 100, y: 400, vx: 60, size: 20, alpha: 0.8, wobblePhase: 0 }],
    });
    updateGhosts(state, dt);
    expect(state.ghosts[0].x).toBeCloseTo(100 + 60 * dt, 3);
  });

  it('wraps ghost moving right past right edge back to left', () => {
    // Ghost moving right, placed just past the right edge
    const ghost = { x: CANVAS_WIDTH + 25, y: 400, vx: 60, size: 20, alpha: 0.8, wobblePhase: 1.0 };
    const state = makeState({ ghosts: [ghost] });
    updateGhosts(state, dt);
    // After wrapping: x should be reset to -size
    expect(state.ghosts[0].x).toBe(-20);
    // y should be recalculated based on wobblePhase
    expect(state.ghosts[0].y).toBeGreaterThanOrEqual(300);
    expect(state.ghosts[0].y).toBeLessThanOrEqual(600);
  });

  it('wraps ghost moving left past left edge back to right', () => {
    // Ghost moving left, positioned just past the left edge
    const ghost = { x: -25, y: 400, vx: -60, size: 20, alpha: 0.8, wobblePhase: 1.0 };
    const state = makeState({ ghosts: [ghost] });
    updateGhosts(state, dt);
    expect(state.ghosts[0].x).toBe(CANVAS_WIDTH + 20);
    expect(state.ghosts[0].y).toBeGreaterThanOrEqual(300);
    expect(state.ghosts[0].y).toBeLessThanOrEqual(600);
  });

  it('does not wrap ghost moving right that has not reached right edge', () => {
    const state = makeState({
      ghosts: [{ x: CANVAS_WIDTH - 10, y: 400, vx: 60, size: 20, alpha: 0.8, wobblePhase: 0 }],
    });
    updateGhosts(state, dt);
    // x advanced by vx*dt — still less than CANVAS_WIDTH + size
    expect(state.ghosts[0].x).toBeLessThan(CANVAS_WIDTH + 20);
    expect(state.ghosts[0].x).toBeGreaterThan(CANVAS_WIDTH - 10);
  });

  it('does not wrap ghost moving left that has not reached left edge', () => {
    const state = makeState({
      ghosts: [{ x: 10, y: 400, vx: -60, size: 20, alpha: 0.8, wobblePhase: 0 }],
    });
    updateGhosts(state, dt);
    expect(state.ghosts[0].x).toBeGreaterThan(-20);
  });

  it('updates wobblePhase every tick', () => {
    const state = makeState({
      ghosts: [{ x: 400, y: 400, vx: 0, size: 20, alpha: 0.8, wobblePhase: 0 }],
    });
    updateGhosts(state, dt);
    expect(state.ghosts[0].wobblePhase).toBeCloseTo(dt * 2, 4);
  });

  it('handles an empty ghost array without errors', () => {
    const state = makeState({ ghosts: [] });
    expect(() => updateGhosts(state, dt)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('updateGeyserTimers', () => {
  const dt = f(1 / 60);

  it('does nothing when geyserStates is empty', () => {
    const state = makeState({ geyserStates: [] });
    expect(() => updateGeyserTimers(state, [], dt)).not.toThrow();
  });

  it('skips a geyser state when corresponding zone is missing', () => {
    const state = makeState({
      geyserStates: [{ timer: 5, active: false, activeTimer: 0 }],
    });
    // Pass empty zone array — gz will be undefined
    updateGeyserTimers(state, [], dt);
    // Timer should be unchanged because the `continue` branch was taken
    expect(state.geyserStates[0].timer).toBe(5);
  });

  it('decrements inactive timer and activates when it hits zero', () => {
    const zone = { x: 100, y: 600, width: 60, height: 20, type: 'geyser' as const, duration: 3, interval: 10 };
    const state = makeState({
      geyserStates: [{ timer: 0.001, active: false, activeTimer: 0 }],
    });
    updateGeyserTimers(state, [zone], dt);
    expect(state.geyserStates[0].active).toBe(true);
    expect(state.geyserStates[0].activeTimer).toBe(3);
  });

  it('decrements activeTimer and deactivates geyser when it reaches zero', () => {
    const zone = { x: 100, y: 600, width: 60, height: 20, type: 'geyser' as const, duration: 3, interval: 10 };
    const state = makeState({
      geyserStates: [{ timer: 0, active: true, activeTimer: 0.001 }],
    });
    updateGeyserTimers(state, [zone], dt);
    expect(state.geyserStates[0].active).toBe(false);
    expect(state.geyserStates[0].timer).toBe(10);
  });

  it('uses default duration (3) and interval (10) when zone fields are absent', () => {
    const zone = { x: 0, y: 0, width: 10, height: 10, type: 'geyser' as const };
    // Activate
    const stateActivate = makeState({
      geyserStates: [{ timer: 0.001, active: false, activeTimer: 0 }],
    });
    updateGeyserTimers(stateActivate, [zone], dt);
    expect(stateActivate.geyserStates[0].activeTimer).toBe(3);

    // Deactivate
    const stateDeactivate = makeState({
      geyserStates: [{ timer: 0, active: true, activeTimer: 0.001 }],
    });
    updateGeyserTimers(stateDeactivate, [zone], dt);
    expect(stateDeactivate.geyserStates[0].timer).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('updatePigeonFlocks', () => {
  const dt = f(1 / 60);

  it('decrements respawnTimer for inactive flocks', () => {
    const state = makeState({
      pigeonFlocks: [
        { x: 200, y: 400, active: false, respawnTimer: 2, scatterParticles: [] },
      ],
    });
    updatePigeonFlocks(state, dt);
    expect(state.pigeonFlocks[0].respawnTimer).toBeCloseTo(2 - dt, 4);
    expect(state.pigeonFlocks[0].active).toBe(false);
  });

  it('reactivates a flock when respawnTimer reaches zero', () => {
    const state = makeState({
      pigeonFlocks: [
        { x: 200, y: 400, active: false, respawnTimer: 0.001, scatterParticles: [] },
      ],
    });
    updatePigeonFlocks(state, dt);
    expect(state.pigeonFlocks[0].active).toBe(true);
  });

  it('does not touch active flocks', () => {
    const state = makeState({
      pigeonFlocks: [
        { x: 200, y: 400, active: true, respawnTimer: 5, scatterParticles: [] },
      ],
    });
    updatePigeonFlocks(state, dt);
    expect(state.pigeonFlocks[0].respawnTimer).toBe(5);
    expect(state.pigeonFlocks[0].active).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// gameplay/match.ts
// ════════════════════════════════════════════════════════════════════════════

describe('checkMatchEnd', () => {
  it('returns null when no player has reached killLimit and no timeLimit', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', score: 5, active: true })],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 16, timeLimit: 0 }));
    expect(result).toBeNull();
  });

  it('returns the player id when score >= killLimit', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', score: 16, active: true })],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 16 }));
    expect(result).toBe('P1');
  });

  it('ignores inactive players for kill-limit check', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', score: 20, active: false })],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 16 }));
    expect(result).toBeNull();
  });

  it('returns highest-score active player when timeLimit is exceeded', () => {
    const state = makeState({
      timeElapsed: 120,
      players: [
        makePlayer({ id: 'P1', score: 5, active: true }),
        makePlayer({ id: 'P2', score: 8, active: true }),
      ],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 100, timeLimit: 60 }));
    expect(result).toBe('P2');
  });

  it('returns null for timeLimit when no active players exist', () => {
    const state = makeState({
      timeElapsed: 120,
      players: [makePlayer({ id: 'P1', score: 5, active: false })],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 100, timeLimit: 60 }));
    // maxScore stays -1, winner stays null
    expect(result).toBeNull();
  });

  it('does not trigger timeLimit end when timeElapsed < timeLimit', () => {
    const state = makeState({
      timeElapsed: 30,
      players: [makePlayer({ id: 'P1', score: 5, active: true })],
    });
    const result = checkMatchEnd(state, makeSettings({ killLimit: 100, timeLimit: 60 }));
    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// cosmetics/sfx.ts
// ════════════════════════════════════════════════════════════════════════════

describe('PlayerSfxCooldowns', () => {
  const dt = f(1 / 60);

  it('exposes three independent Cooldowns<PlayerSlot> instances', () => {
    const cd = new PlayerSfxCooldowns();
    expect(cd.land.isReady('P1')).toBe(true);
    expect(cd.headbonk.isReady('P1')).toBe(true);
    expect(cd.crouch.isReady('P1')).toBe(true);
  });

  it('isReady returns false for a slot whose timer is set, true once it elapses', () => {
    const cd = new PlayerSfxCooldowns();
    cd.land.set('P1', 0.1);
    expect(cd.land.isReady('P1')).toBe(false);
    cd.land.tick('P1', 0.1);
    expect(cd.land.isReady('P1')).toBe(true);
  });

  it('decay() ticks all three cooldowns by dt for the given slot', () => {
    const cd = new PlayerSfxCooldowns();
    cd.land.set('P1', 0.5);
    cd.headbonk.set('P1', 0.2);
    cd.crouch.set('P1', 0.1);
    cd.decay('P1', dt);
    expect(cd.land.isReady('P1')).toBe(false);
    expect(cd.headbonk.isReady('P1')).toBe(false);
    expect(cd.crouch.isReady('P1')).toBe(false);
    // Ticking enough to fully drain crouch (which had only 0.1s)
    cd.decay('P1', 0.1);
    expect(cd.crouch.isReady('P1')).toBe(true);
  });

  it('decay() is a no-op for a never-set slot', () => {
    const cd = new PlayerSfxCooldowns();
    expect(() => cd.decay('P1', dt)).not.toThrow();
    expect(cd.land.isReady('P1')).toBe(true);
  });

  it('keys are isolated across slots', () => {
    const cd = new PlayerSfxCooldowns();
    cd.land.set('P1', 0.3);
    expect(cd.land.isReady('P2')).toBe(true);
    cd.decay('P2', 1.0); // decaying a different slot doesn't drain P1
    expect(cd.land.isReady('P1')).toBe(false);
  });

  it('clear() resets all three cooldowns for all slots', () => {
    const cd = new PlayerSfxCooldowns();
    cd.land.set('P1', 0.5);
    cd.headbonk.set('P2', 0.5);
    cd.crouch.set('P3', 0.5);
    cd.clear();
    expect(cd.land.isReady('P1')).toBe(true);
    expect(cd.headbonk.isReady('P2')).toBe(true);
    expect(cd.crouch.isReady('P3')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('updateCrowdCheering', () => {
  const playSound = vi.fn();
  const setVolume = vi.fn();
  const stopSound = vi.fn();

  beforeEach(() => {
    playSound.mockReset();
    setVolume.mockReset();
    stopSound.mockReset();
  });

  it('starts crowd sound when leadScore >= killLimit - 3 and not already started', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 13, active: true })] });
    const settings = makeSettings({ killLimit: 16 }); // 13 >= 13 → crowd starts
    const result = updateCrowdCheering(state, settings, false, playSound, setVolume, stopSound);
    expect(result).toBe(true);
    expect(playSound).toHaveBeenCalledWith('crowd');
  });

  it('does not call playSound again if crowd already started', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 14, active: true })] });
    const settings = makeSettings({ killLimit: 16 });
    const result = updateCrowdCheering(state, settings, true, playSound, setVolume, stopSound);
    expect(result).toBe(true);
    expect(playSound).not.toHaveBeenCalled();
  });

  it('sets volume to 0.3 when player is within 1 kill of limit', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 15, active: true })] });
    const settings = makeSettings({ killLimit: 16 }); // 15 >= 15 → loud
    updateCrowdCheering(state, settings, true, playSound, setVolume, stopSound);
    expect(setVolume).toHaveBeenCalledWith('crowd', 0.3);
  });

  it('sets volume to 0.15 when player is 2 or 3 kills from limit', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 13, active: true })] });
    const settings = makeSettings({ killLimit: 16 }); // 13 < 15 → quiet
    updateCrowdCheering(state, settings, true, playSound, setVolume, stopSound);
    expect(setVolume).toHaveBeenCalledWith('crowd', 0.15);
  });

  it('stops crowd when lead drops back below threshold', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 5, active: true })] });
    const settings = makeSettings({ killLimit: 16 }); // 5 < 13 → stop
    const result = updateCrowdCheering(state, settings, true, playSound, setVolume, stopSound);
    expect(result).toBe(false);
    expect(stopSound).toHaveBeenCalledWith('crowd');
  });

  it('returns false and stays quiet when no player is near the limit', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 1, active: true })] });
    const settings = makeSettings({ killLimit: 16 }); // 1 < 13 → never started → no-op
    const result = updateCrowdCheering(state, settings, false, playSound, setVolume, stopSound);
    expect(result).toBe(false);
    expect(playSound).not.toHaveBeenCalled();
    expect(stopSound).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('tickPeriodicAmbient', () => {
  it('does nothing when theme has no ambientSoundConfig', () => {
    const theme = makeThemeWithoutLavaRock(); // no ambientSoundConfig
    const timers = new Cooldowns<string>();
    const playSound = vi.fn();
    expect(() => tickPeriodicAmbient(theme, timers, 1 / 60, playSound)).not.toThrow();
    expect(playSound).not.toHaveBeenCalled();
  });

  it('does nothing when ambientSoundConfig has no periodic array', () => {
    const theme = { ...makeThemeWithoutLavaRock(), ambientSoundConfig: { loops: ['wind'] } } as unknown as ThemeConfig;
    const timers = new Cooldowns<string>();
    const playSound = vi.fn();
    tickPeriodicAmbient(theme, timers, 1 / 60, playSound);
    expect(playSound).not.toHaveBeenCalled();
  });

  it('decrements timer and plays sound when it hits zero', () => {
    const playSound = vi.fn();
    const theme = {
      ...makeThemeWithoutLavaRock(),
      ambientSoundConfig: {
        periodic: [{ sound: 'bird_chirp', intervalRange: [5, 5] as [number, number] }],
      },
    } as unknown as ThemeConfig;
    const timers = new Cooldowns<string>();
    timers.set('bird_chirp', 0.001);
    const dt = 1 / 60;
    tickPeriodicAmbient(theme, timers, dt, playSound);
    expect(playSound).toHaveBeenCalledWith('bird_chirp');
    // After firing, timer should be re-set to ~5 — verify by ticking up to but
    // not past 5s and confirming no further fire, then crossing 5s and firing.
    expect(timers.tick('bird_chirp', 4.99)).toBe(false);
    expect(timers.tick('bird_chirp', 0.02)).toBe(true);
  });

  it('decrements timer without playing when it is still above zero', () => {
    const playSound = vi.fn();
    const theme = {
      ...makeThemeWithoutLavaRock(),
      ambientSoundConfig: {
        periodic: [{ sound: 'bird_chirp', intervalRange: [5, 10] as [number, number] }],
      },
    } as unknown as ThemeConfig;
    const dt = 1 / 60;
    const timers = new Cooldowns<string>();
    timers.set('bird_chirp', 3);
    tickPeriodicAmbient(theme, timers, dt, playSound);
    expect(playSound).not.toHaveBeenCalled();
    // Timer decremented by dt — confirm by ticking the residual to expiry.
    expect(timers.tick('bird_chirp', 3 - dt - 0.001)).toBe(false);
    expect(timers.tick('bird_chirp', 0.002)).toBe(true);
  });

  it('initialises missing timer to 0 and fires immediately on first tick', () => {
    const playSound = vi.fn();
    const theme = {
      ...makeThemeWithoutLavaRock(),
      ambientSoundConfig: {
        periodic: [{ sound: 'wind_gust', intervalRange: [4, 4] as [number, number] }],
      },
    } as unknown as ThemeConfig;
    const timers = new Cooldowns<string>(); // no entry for 'wind_gust' → uninitialized = ready
    tickPeriodicAmbient(theme, timers, 1 / 60, playSound);
    // Uninitialized → fires
    expect(playSound).toHaveBeenCalledWith('wind_gust');
  });

  it('handles multiple periodic sounds independently', () => {
    const playSound = vi.fn();
    const theme = {
      ...makeThemeWithoutLavaRock(),
      ambientSoundConfig: {
        periodic: [
          { sound: 'bird_chirp', intervalRange: [5, 5] as [number, number] },
          { sound: 'frog_croak', intervalRange: [8, 8] as [number, number] },
        ],
      },
    } as unknown as ThemeConfig;
    const dt = 1 / 60;
    // Only bird_chirp is about to fire
    const timers = new Cooldowns<string>();
    timers.set('bird_chirp', 0.001);
    timers.set('frog_croak', 4);
    tickPeriodicAmbient(theme, timers, dt, playSound);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('bird_chirp');
    // frog_croak decremented by dt — confirm via residual tick
    expect(timers.tick('frog_croak', 4 - dt - 0.001)).toBe(false);
    expect(timers.tick('frog_croak', 0.002)).toBe(true);
  });
});
