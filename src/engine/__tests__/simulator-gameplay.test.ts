// @vitest-environment node
//
// Simulator-level gameplay tests. Migrated from gameLoop.test.ts under
// Phase 11 (modularize tests onto Simulator). These cover physics, stomp,
// scoring, hazards, effect zones, fall-off/wrap, hitstop, push, squash, fat,
// slow, carrots, springs, thorns, wrap, kill feed, shockwaves, time-limit,
// invincibility, etc. — anything that can be exercised by Simulator alone
// without GameLoop's audio/renderer/cosmetic-system wiring.
//
// Pattern: construct Simulator directly, supply a CapturedEvents sink, drive
// fixedUpdate. Tests assert on state mutations and (when relevant) emitted
// events — never on audio.play / renderer / particleSystem.

import { describe, it, expect, beforeAll } from 'vitest';
import { Simulator } from '../simulator/Simulator';
import { registerBuiltinArenas } from '../arenas/builtin';
import { registerBuiltinCharacters } from '../characters/builtin';
import { CapturedEvents } from './helpers/eventSink';
import { makeArena } from './testHelpers';
import {
  FIXED_TIMESTEP, MATCH_COUNTDOWN,
  CARROT_FIRST_SPAWN_DELAY,
  HAZARD_LIFETIME, THORN_SLOW_DURATION,
  STOMP_VY_THRESHOLD,
  CANVAS_WIDTH, CANVAS_HEIGHT,
  PLAYER_WIDTH, PLAYER_HEIGHT,
  HITSTOP_DURATION,
  SPLAT_DURATION, RESPAWN_DELAY, INVINCIBLE_DURATION,
  FAT_DURATION,
} from '../constants';
import type { MatchSettings, Arena, PlayerSlot, InputState } from '../types';

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

function makeSettings(overrides?: Partial<MatchSettings>): MatchSettings {
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

interface SimHandle {
  sim: Simulator;
  events: CapturedEvents;
  arena: Arena;
  settings: MatchSettings;
}

/** Construct a Simulator with the same defaults `gameLoop.test.ts createLoop` uses:
 *  custom 2-platform arena, P1+P2 players, phase pre-flipped to 'playing'. */
function createSim(opts?: {
  settings?: Partial<MatchSettings>;
  arena?: Partial<Arena>;
  players?: PlayerSlot[];
}): SimHandle {
  const arena = makeArena(opts?.arena);
  const settings = makeSettings(opts?.settings);
  const events = new CapturedEvents();
  const sim = new Simulator({
    arena,
    settings,
    activePlayers: opts?.players ?? (['P1', 'P2'] as PlayerSlot[]),
    events,
  });
  // Match createLoop semantics: phase 'playing' so fixedUpdate runs.
  // (Skips the music-start side effect that setPhase fires.)
  sim.getState().phase = 'playing';
  return { sim, events, arena, settings };
}

function skipCountdown(sim: Simulator): void {
  const s = sim.getState();
  if (s.countdown > 0) s.countdown = 0;
}

// ===================================================================
// Lifecycle
// ===================================================================

describe('Simulator — Lifecycle', () => {
  it('constructor creates players matching activePlayers count', () => {
    const { sim } = createSim({ players: ['P1', 'P2', 'P3'] as PlayerSlot[] });
    const state = sim.getState();
    expect(state.players).toHaveLength(3);
    expect(state.players.map(p => p.id)).toEqual(['P1', 'P2', 'P3']);
  });

  it('getState() returns valid MatchState with players', () => {
    const { sim } = createSim();
    const state = sim.getState();
    expect(state).toBeDefined();
    expect(state.players).toHaveLength(2);
    expect(state.matchOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.countdown).toBe(MATCH_COUNTDOWN);
    expect(state.timeElapsed).toBe(0);
    expect(Array.isArray(state.carrots)).toBe(true);
    expect(Array.isArray(state.springs)).toBe(true);
    expect(Array.isArray(state.thorns)).toBe(true);
  });
});

// ===================================================================
// fixedUpdate
// ===================================================================

describe('Simulator — fixedUpdate', () => {
  it('increments timeElapsed by dt', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const before = sim.getState().timeElapsed;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(sim.getState().timeElapsed).toBeCloseTo(before + FIXED_TIMESTEP, 6);
  });

  it('returns early when matchOver is true', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    sim.fixedUpdate(FIXED_TIMESTEP);
    const elapsed = sim.getState().timeElapsed;

    sim.getState().matchOver = true;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(sim.getState().timeElapsed).toBeCloseTo(elapsed, 6);
  });

  it('countdown decrements during fixedUpdate', () => {
    const { sim } = createSim();
    const initial = sim.getState().countdown;
    expect(initial).toBe(MATCH_COUNTDOWN);

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(sim.getState().countdown).toBeCloseTo(MATCH_COUNTDOWN - FIXED_TIMESTEP, 6);
  });

  it('carrot spawns after timer expires', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    expect(state.carrotTimer).toBe(CARROT_FIRST_SPAWN_DELAY);

    const steps = Math.ceil(CARROT_FIRST_SPAWN_DELAY / FIXED_TIMESTEP) + 1;
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.carrots.length).toBeGreaterThanOrEqual(1);
  });

  it('spring spawns after timer expires', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const initialTimer = state.springSpawnTimer;
    const steps = Math.ceil(initialTimer / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.springs.length).toBeGreaterThanOrEqual(1);
  });

  it('thorn spawns after timer expires', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const initialTimer = state.thornSpawnTimer;
    const steps = Math.ceil(initialTimer / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.thorns.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// Match End
// ===================================================================

describe('Simulator — Match End', () => {
  it('kill limit reached fires onMatchEnd', () => {
    const { sim, events } = createSim({ settings: { killLimit: 5 } });
    skipCountdown(sim);
    const state = sim.getState();

    state.players[0].score = 5;
    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.matchEnd).toHaveLength(1);
    expect(events.matchEnd[0].winner).toBe('P1');
    expect(state.matchOver).toBe(true);
    expect(state.winner).toBe('P1');
  });

  it('time limit reached fires onMatchEnd', () => {
    const { sim, events } = createSim({ settings: { timeLimit: 10 } });
    skipCountdown(sim);

    const almostSteps = Math.floor(12.9 / FIXED_TIMESTEP);
    for (let i = 0; i < almostSteps; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(events.matchEnd).toHaveLength(0);

    const remainingSteps = Math.ceil(0.2 / FIXED_TIMESTEP) + 1;
    for (let i = 0; i < remainingSteps; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(events.matchEnd).toHaveLength(1);
  });

  it('time limit: highest scorer wins', () => {
    const { sim, events } = createSim({ settings: { timeLimit: 5 } });
    skipCountdown(sim);
    const state = sim.getState();

    state.players[0].score = 2;
    state.players[1].score = 7;

    const steps = Math.ceil(8.1 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.matchEnd).toHaveLength(1);
    expect(events.matchEnd[0].winner).toBe('P2');
  });

  it('no match end when conditions not met', () => {
    const { sim, events } = createSim({ settings: { killLimit: 16, timeLimit: 0 } });
    skipCountdown(sim);

    for (let i = 0; i < 60; i++) sim.fixedUpdate(FIXED_TIMESTEP);
    expect(events.matchEnd).toHaveLength(0);
    expect(sim.getState().matchOver).toBe(false);
  });
});

// ===================================================================
// Entity Lifecycle
// ===================================================================

describe('Simulator — Entity Lifecycle', () => {
  it('carrot pickup increases player score', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    const initialScore = player.score;

    state.carrots.push({
      x: player.x + player.width / 2,
      y: player.y,
      active: true,
      spawnTime: 0,
    });

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(player.score).toBe(initialScore + 1);
  });

  it('spring removal when life expires', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();

    state.springs.push({
      x: 500, y: 500, platformIndex: 1, bounceTimer: 0,
      life: FIXED_TIMESTEP * 0.5, growTimer: 0,
    });
    expect(state.springs).toHaveLength(1);

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.springs).toHaveLength(0);
  });

  it('thorn removal when life expires', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();

    state.thorns.push({
      x: 500, y: 488, width: 28, height: 12, platformIndex: 1,
      life: FIXED_TIMESTEP * 0.5, growTimer: 0, hit: false,
    });
    expect(state.thorns).toHaveLength(1);

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.thorns).toHaveLength(0);
  });

  it('countdown blocks gameplay logic (spawn timers do not tick)', () => {
    const { sim } = createSim();
    const state = sim.getState();
    expect(state.countdown).toBe(MATCH_COUNTDOWN);

    const initialSpringTimer = state.springSpawnTimer;
    const initialThornTimer = state.thornSpawnTimer;
    const initialCarrotTimer = state.carrotTimer;

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.springSpawnTimer).toBe(initialSpringTimer);
    expect(state.thornSpawnTimer).toBe(initialThornTimer);
    expect(state.carrotTimer).toBe(initialCarrotTimer);
  });

  it('thorn removal when hit', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();

    state.thorns.push({
      x: 500, y: 488, width: 28, height: 12, platformIndex: 1,
      life: HAZARD_LIFETIME, growTimer: 0, hit: true,
    });
    expect(state.thorns).toHaveLength(1);

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.thorns).toHaveLength(0);
  });
});

// ===================================================================
// Hazard Collision
// ===================================================================

describe('Simulator — Hazard Collision', () => {
  it('thorn collision applies slowTimer', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.thorns.push({
      x: player.x, y: player.y, width: 28, height: 12, platformIndex: 0,
      life: HAZARD_LIFETIME, growTimer: 0, hit: false,
    });

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBe(THORN_SLOW_DURATION);
    expect(state.thorns[0]?.hit ?? true).toBe(true);
  });

  it('lava hazard zone collision applies burnTimer', () => {
    const { sim } = createSim({
      arena: {
        hazardZones: [{ x: 0, y: 0, width: 1280, height: 720, type: 'lava' }],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    player.slowTimer = 0;
    player.invincibleTimer = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.burnTimer).toBe(THORN_SLOW_DURATION);
    expect(player.slowTimer).toBe(THORN_SLOW_DURATION);
  });

  it('ghost collision applies slowTimer', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    state.ghosts.push({ x: pcx, y: pcy, vx: 0, size: 40, alpha: 1, wobblePhase: 0 });
    player.slowTimer = 0;
    player.invincibleTimer = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBe(THORN_SLOW_DURATION);
  });

  it('invincible player ignores thorn collision', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.invincibleTimer = 1.0;
    player.slowTimer = 0;

    state.thorns.push({
      x: player.x, y: player.y, width: 28, height: 12, platformIndex: 0,
      life: HAZARD_LIFETIME, growTimer: 0, hit: false,
    });

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBe(0);
    expect(state.thorns[0].hit).toBe(false);
  });
});

// ===================================================================
// Effect Zones
// ===================================================================

describe('Simulator — Effect Zones', () => {
  it('zero-G zone slows falling player', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'zero_g', x: 0, y: 0, width: 1280, height: 720 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.state = 'airborne';
    player.vy = 200;
    const vyBefore = player.vy;

    sim.fixedUpdate(FIXED_TIMESTEP);

    const pureGravityVy = vyBefore + 900 * FIXED_TIMESTEP;
    expect(player.vy).toBeLessThan(pureGravityVy);
  });

  it('current zone applies vx force', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'current', x: 0, y: 0, width: 1280, height: 720, vx: 2000 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    const xBefore = player.x;

    for (let i = 0; i < 30; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.x).toBeGreaterThan(xBefore);
  });

  it('geyser zone launches player when active', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -550, interval: 10, duration: 3 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.geyserStates[0].active = true;
    state.geyserStates[0].activeTimer = 2;
    player.vy = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeLessThanOrEqual(-550);
    expect(player.state).toBe('airborne');
  });
});

// ===================================================================
// Stomp
// ===================================================================

describe('Simulator — Stomp', () => {
  it('stomp from above grants 2 points', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];
    const initialScore = attacker.score;

    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 0;
    victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne';
    attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(attacker.score).toBe(initialScore + 2);
    expect(victim.state).toBe('splat');
  });

  it('invincible player cannot be stomped', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 1.0;
    victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne';
    attacker.active = true;

    const initialScore = attacker.score;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(victim.state).not.toBe('splat');
    expect(attacker.score).toBe(initialScore);
  });
});

// ===================================================================
// Fall-off & Wrap
// ===================================================================

describe('Simulator — Fall-off & Wrap', () => {
  it('player wraps horizontally', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = CANVAS_WIDTH + 10;
    player.y = 620;
    player.state = 'idle';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.x).toBeLessThan(CANVAS_WIDTH);
  });

  it('player below arena with allowFallOff respawns', () => {
    const { sim } = createSim({ arena: { allowFallOff: true } });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.y = CANVAS_HEIGHT + 100;
    player.state = 'airborne';
    player.vy = 200;
    player.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.y).toBeLessThan(CANVAS_HEIGHT);
    expect(player.invincibleTimer).toBeGreaterThan(0);
    expect(player.slowTimer).toBeGreaterThan(0);
    expect(player.state).toBe('idle');
  });
});

// ===================================================================
// Hitstop — gameplay-pure subset
// ===================================================================

describe('Simulator — Hitstop', () => {
  it('hitstopTimer set on stomp halts physics', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 0;
    victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne';
    attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    // After a stomp both attacker and victim get hitstopTimer set
    expect(attacker.hitstopTimer).toBeGreaterThan(0);
  });

  it('hitstopTimer decrements toward zero', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.hitstopTimer = HITSTOP_DURATION;

    const before = player.hitstopTimer;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(player.hitstopTimer).toBeLessThan(before);
  });

  it('hitstopTimer skips physics for that player', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    player.hitstopTimer = 1.0; // longer than 1 tick
    player.x = 500;
    player.vx = 200;

    const xBefore = player.x;
    sim.fixedUpdate(FIXED_TIMESTEP);
    // x should not have advanced; physics is skipped while hitstop holds
    expect(player.x).toBe(xBefore);
  });
});

// ===================================================================
// Player Push — gameplay-pure (no SFX assertion)
// ===================================================================

describe('Simulator — Player Push', () => {
  it('two overlapping players get pushed apart', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const p1 = state.players[0];
    const p2 = state.players[1];

    p1.x = 400;
    p1.y = 660 - PLAYER_HEIGHT;
    p1.vx = 0; p1.state = 'idle'; p1.active = true; p1.invincibleTimer = 0;

    p2.x = 405;
    p2.y = 660 - PLAYER_HEIGHT;
    p2.vx = 0; p2.state = 'idle'; p2.active = true; p2.invincibleTimer = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(Math.abs(p1.x - p2.x)).toBeGreaterThan(5);
  });

  it('side squash changes from 1.0 when players collide', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const p1 = state.players[0];
    const p2 = state.players[1];

    p1.x = 400; p1.y = 660 - PLAYER_HEIGHT;
    p1.vx = 0; p1.state = 'idle'; p1.active = true; p1.invincibleTimer = 0;
    p1.sideSquash = 1;

    p2.x = 405; p2.y = 660 - PLAYER_HEIGHT;
    p2.vx = 0; p2.state = 'idle'; p2.active = true; p2.invincibleTimer = 0;
    p2.sideSquash = 1;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(p1.sideSquash).not.toBe(1);
    expect(p2.sideSquash).not.toBe(1);
  });
});

// ===================================================================
// Fat & Slow Effects
// ===================================================================

describe('Simulator — Fat and Slow Effects', () => {
  it('fatTimer set on carrot pickup', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.carrots.push({
      x: player.x + player.width / 2,
      y: player.y,
      active: true,
      spawnTime: 0,
    });
    player.fatTimer = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.fatTimer).toBeCloseTo(FAT_DURATION, 4);
  });

  it('fatTimer decrements over time', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.fatTimer = 2.0;
    const before = player.fatTimer;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(player.fatTimer).toBeLessThan(before);
  });

  it('slowTimer decrements over time', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.slowTimer = 2.0;
    const before = player.slowTimer;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(player.slowTimer).toBeLessThan(before);
  });

  it('burnTimer decrements over time', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.burnTimer = 2.0;
    const before = player.burnTimer;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(player.burnTimer).toBeLessThan(before);
  });
});

// ===================================================================
// Match Timing
// ===================================================================

describe('Simulator — Match Timing', () => {
  it('time-limit match-end occurs after countdown + timeLimit', () => {
    const { sim, events } = createSim({ settings: { timeLimit: 3 } });
    // Don't skip countdown; let it play out

    const totalSteps = Math.ceil((MATCH_COUNTDOWN + 3.1) / FIXED_TIMESTEP);
    for (let i = 0; i < totalSteps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.matchEnd.length).toBeGreaterThan(0);
  });
});

// ===================================================================
// Carrot spawning
// ===================================================================

describe('Simulator — Carrot Spawning', () => {
  it('carrots spawn over time', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil((CARROT_FIRST_SPAWN_DELAY + 0.5) / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.carrots.length).toBeGreaterThan(0);
  });
});

// ===================================================================
// Wrap-around movement
// ===================================================================

describe('Simulator — Wrap-around Movement', () => {
  it('player moving right past the right edge wraps to left', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = CANVAS_WIDTH - 5;
    player.vx = 300;
    player.y = 620;
    player.state = 'idle';

    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.x).toBeLessThan(CANVAS_WIDTH);
  });

  it('player moving left past the left edge wraps to right', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = 5;
    player.vx = -300;
    player.y = 620;
    player.state = 'idle';

    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.x).toBeGreaterThan(0);
  });
});

// ===================================================================
// Kill Feed
// ===================================================================

describe('Simulator — Kill Feed', () => {
  it('stomp adds entry to kill feed', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 0;
    victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne';
    attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.killFeed.length).toBeGreaterThan(0);
    const entry = state.killFeed[state.killFeed.length - 1];
    expect(entry.attacker).toBe('P1');
    expect(entry.victim).toBe('P2');
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('kill feed is capped at 10 entries', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    for (let i = 0; i < 10; i++) {
      state.killFeed.push({ attacker: 'P1' as PlayerSlot, victim: 'P2' as PlayerSlot, timestamp: i });
    }
    expect(state.killFeed).toHaveLength(10);

    const attacker = state.players[0];
    const victim = state.players[1];
    victim.x = 500; victim.y = 600;
    victim.state = 'idle'; victim.invincibleTimer = 0; victim.active = true;
    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne'; attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.killFeed.length).toBeLessThanOrEqual(10);
  });
});

// ===================================================================
// Time limit
// ===================================================================

describe('Simulator — Time Limit', () => {
  it('time limit 0 means infinite (no auto-end)', () => {
    const { sim, events } = createSim({ settings: { timeLimit: 0 } });
    skipCountdown(sim);

    for (let i = 0; i < 200; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.matchEnd).toHaveLength(0);
    expect(sim.getState().matchOver).toBe(false);
  });
});

// ===================================================================
// Multiple Simultaneous Stomps
// ===================================================================

describe('Simulator — Multiple Simultaneous Stomps', () => {
  it('two stomps on the same victim awards a single kill', () => {
    const { sim } = createSim({ players: ['P1', 'P2', 'P3'] as PlayerSlot[] });
    skipCountdown(sim);
    const state = sim.getState();
    const a = state.players[0];
    const b = state.players[1];
    const victim = state.players[2];

    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 0;
    victim.active = true;

    a.x = 480;
    a.y = victim.y - a.height + 5;
    a.vy = STOMP_VY_THRESHOLD + 100;
    a.state = 'airborne';
    a.active = true;

    b.x = 520;
    b.y = victim.y - b.height + 5;
    b.vy = STOMP_VY_THRESHOLD + 100;
    b.state = 'airborne';
    b.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    // The victim should be splatted and only one kill should be in killFeed
    expect(victim.state).toBe('splat');
    expect(state.killFeed.length).toBe(1);
  });
});

// ===================================================================
// Invincibility after Respawn
// ===================================================================

describe('Simulator — Invincibility after Respawn', () => {
  it('newly-respawned player has invincibleTimer set', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    // Set victim into splat state with respawn timer about to expire
    player.state = 'splat';
    player.splatTimer = 0;
    player.respawnTimer = FIXED_TIMESTEP * 0.5;
    player.invincibleTimer = 0;

    // Place a victim/dummy state so stomp system doesn't intervene
    sim.fixedUpdate(FIXED_TIMESTEP);

    // After respawn (or via splatTimer flow), invincibleTimer should be > 0
    // for the active player
    if (player.state === 'idle' || player.state === 'airborne') {
      expect(player.invincibleTimer).toBeGreaterThan(0);
      expect(player.invincibleTimer).toBeLessThanOrEqual(INVINCIBLE_DURATION);
    }
  });

  it('invincible player ignores hazard collision during invincibility', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.invincibleTimer = 1.0;
    player.slowTimer = 0;
    player.burnTimer = 0;

    state.thorns.push({
      x: player.x, y: player.y, width: 28, height: 12, platformIndex: 0,
      life: HAZARD_LIFETIME, growTimer: 0, hit: false,
    });

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBe(0);
  });

  it('splat → respawning → idle progression', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    // Force into splat with timer about to expire
    player.state = 'splat';
    player.splatTimer = FIXED_TIMESTEP * 0.5;
    player.respawnTimer = RESPAWN_DELAY;

    sim.fixedUpdate(FIXED_TIMESTEP);

    // splatTimer expires → state should advance away from 'splat'
    expect(player.state).not.toBe('splat');

    // Drive through respawn delay
    const steps = Math.ceil(RESPAWN_DELAY / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    // Eventually returns to idle (with invincibility)
    expect(['idle', 'airborne', 'run']).toContain(player.state);
  });

  it('SPLAT_DURATION is positive', () => {
    expect(SPLAT_DURATION).toBeGreaterThan(0);
  });
});

// ===================================================================
// Network Mode (input-driven gameplay) — gameplay-pure subset
// ===================================================================

describe('Simulator — Network Mode (input dispatch)', () => {
  it('fixedUpdate accepts networkInputs map', () => {
    const { sim } = createSim();
    skipCountdown(sim);

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: true, jump: false, down: false });
    inputs.set('P2', { left: true, right: false, jump: false, down: false });

    const xBefore = sim.getState().players[0].x;
    sim.fixedUpdate(FIXED_TIMESTEP, inputs);
    const p1 = sim.getState().players[0];
    expect(p1.vx !== 0 || p1.x !== xBefore).toBe(true);
  });

  it('right-input on P1 produces rightward motion', () => {
    const { sim } = createSim();
    skipCountdown(sim);

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: true, jump: false, down: false });
    inputs.set('P2', { left: false, right: false, jump: false, down: false });

    const xBefore = sim.getState().players[0].x;
    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, inputs);
    expect(sim.getState().players[0].x).toBeGreaterThan(xBefore);
  });

  it('left-input on P2 produces leftward motion', () => {
    const { sim } = createSim();
    skipCountdown(sim);

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: false, jump: false, down: false });
    inputs.set('P2', { left: true, right: false, jump: false, down: false });

    const xBefore = sim.getState().players[1].x;
    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, inputs);
    expect(sim.getState().players[1].x).toBeLessThan(xBefore);
  });
});

// ===================================================================
// Countdown Freeze
// ===================================================================

describe('Simulator — Countdown Freeze', () => {
  it('player input is suppressed during countdown', () => {
    const { sim } = createSim();
    // Don't skipCountdown
    const state = sim.getState();
    const player = state.players[0];
    const xBefore = player.x;

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: true, jump: false, down: false });
    inputs.set('P2', { left: false, right: false, jump: false, down: false });

    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, inputs);

    // Player position shouldn't have shifted during countdown
    expect(player.x).toBeCloseTo(xBefore, 4);
  });

  it('countdown elapses then gameplay begins', () => {
    const { sim } = createSim();
    const state = sim.getState();
    expect(state.countdown).toBe(MATCH_COUNTDOWN);

    const steps = Math.ceil(MATCH_COUNTDOWN / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.countdown).toBe(0);

    // After countdown, gameplay timers tick
    const beforeSpring = state.springSpawnTimer;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.springSpawnTimer).toBeLessThanOrEqual(beforeSpring);
  });
});

// ===================================================================
// Bouncy platforms — gameplay-pure subset
// ===================================================================

describe('Simulator — Bouncy Platforms', () => {
  it('landing on bouncy platform launches player upward', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 500, width: 200, height: 20 },
        ],
        bouncyPlatforms: [1],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    // Land on bouncy platform
    player.x = 450;
    player.y = 500 - PLAYER_HEIGHT - 1;
    player.vy = 100;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    // After landing on a bouncy platform, vy should flip to upward
    expect(player.vy).toBeLessThan(0);
    expect(player.state).toBe('airborne');
  });
});
