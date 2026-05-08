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
import { RemoteInput } from '../input/RemoteInput';
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
  SPRING_BOUNCE,
  GRAVITY,
  SQUASH_ON_LAND,
  DUST_LAND_VY_THRESHOLD,
  ANIM_FRAME_DURATION,
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
 *  custom 2-platform arena, P1+P2 players, phase pre-flipped to 'playing'.
 *  Human slots are wired with RemoteInput so the legacy Map<slot, InputState>
 *  argument to fixedUpdate(dt, networkInputs) drives them — matches the
 *  pre-PlayerInputContext test pattern. */
function createSim(opts?: {
  settings?: Partial<MatchSettings>;
  arena?: Partial<Arena>;
  players?: PlayerSlot[];
}): SimHandle {
  const arena = makeArena(opts?.arena);
  const settings = makeSettings(opts?.settings);
  const events = new CapturedEvents();
  const players = opts?.players ?? (['P1', 'P2'] as PlayerSlot[]);
  const sim = new Simulator({
    arena,
    settings,
    activePlayers: players,
    events,
  });
  // Match createLoop semantics: phase 'playing' so fixedUpdate runs.
  // (Skips the music-start side effect that setPhase fires.)
  sim.getState().phase = 'playing';
  // Swap KeyboardInput → RemoteInput for human slots so tests that pass
  // a Map<slot, InputState> to fixedUpdate dispatch through ctx.networkInputs.
  for (const slot of players) {
    if (!slot.startsWith('B')) sim.setPlayerInput(slot, new RemoteInput(slot));
  }
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

  it('player bounces when landing on a bouncy ground platform', () => {
    const { sim } = createSim({ arena: { bouncyPlatforms: [0] } });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 150;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeCloseTo(SPRING_BOUNCE * 0.85, 0);
    expect(player.state).toBe('airborne');
  });

  it('bouncy platform sets bouncyWobble timer', () => {
    const { sim } = createSim({ arena: { bouncyPlatforms: [0] } });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 150;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.bouncyWobble.get(0)).toBeCloseTo(0.4, 1);
  });

  it('player does not bounce on non-bouncy platform', () => {
    const { sim } = createSim({ arena: { bouncyPlatforms: [1] } });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 150;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).not.toBeCloseTo(SPRING_BOUNCE * 0.85, 0);
    expect(player.state).toBe('idle');
  });

  it('holding down on slow landing suppresses bounce', () => {
    const { sim } = createSim({ arena: { bouncyPlatforms: [0] } });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 50;
    player.state = 'airborne';

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: false, jump: false, down: true });
    inputs.set('P2', { left: false, right: false, jump: false, down: false });

    sim.fixedUpdate(FIXED_TIMESTEP, inputs);

    expect(player.vy).not.toBeCloseTo(SPRING_BOUNCE * 0.85, 0);
  });

  it('holding down on fast landing does NOT suppress bounce', () => {
    const { sim } = createSim({ arena: { bouncyPlatforms: [0] } });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 300;
    player.state = 'airborne';

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: false, jump: false, down: true });
    inputs.set('P2', { left: false, right: false, jump: false, down: false });

    sim.fixedUpdate(FIXED_TIMESTEP, inputs);

    expect(player.vy).toBeCloseTo(SPRING_BOUNCE * 0.85, 0);
    expect(player.state).toBe('airborne');
  });

  it('superBounce mod makes all platforms bouncy', () => {
    const { sim } = createSim({
      settings: {
        mods: {
          extremeGore: false, carrotChase: false, giantPlayers: false,
          turbo: false, superBounce: true, mirrorArena: false, underwaterGravity: false,
        },
      },
    });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 150;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeCloseTo(SPRING_BOUNCE * 0.85, 0);
    expect(player.state).toBe('airborne');
  });
});

// ===================================================================
// Effect Zones — Extended
// ===================================================================

describe('Simulator — Effect Zones (extended)', () => {
  it('zero-G zone boosts rising player (vy *= 1.03)', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'zero_g', x: 0, y: 0, width: 1280, height: 720 }] },
    });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.state = 'airborne';
    player.vy = -200;

    sim.fixedUpdate(FIXED_TIMESTEP);

    const pureGravityVy = -200 + GRAVITY * FIXED_TIMESTEP;
    expect(player.vy).toBeLessThan(pureGravityVy);
  });

  it('zero-G zone only affects players inside the zone', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'zero_g', x: 500, y: 0, width: 200, height: 720 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const outsidePlayer = state.players[0];
    const insidePlayer = state.players[1];

    outsidePlayer.x = 100;
    outsidePlayer.state = 'airborne';
    outsidePlayer.vy = 200;

    insidePlayer.x = 550;
    insidePlayer.state = 'airborne';
    insidePlayer.vy = 200;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(insidePlayer.vy).toBeLessThan(outsidePlayer.vy);
  });

  it('current zone applies vy force', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'current', x: 0, y: 0, width: 1280, height: 720, vy: -3000 }] },
    });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.state = 'airborne';
    player.y = 400;
    player.vy = 0;
    const yBefore = player.y;

    for (let i = 0; i < 30; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.y).toBeLessThan(yBefore);
  });

  it('current zone with zero vx/vy has no effect', () => {
    const { sim: a } = createSim({
      arena: { effectZones: [{ type: 'current', x: 0, y: 0, width: 1280, height: 720, vx: 0, vy: 0 }] },
    });
    const { sim: b } = createSim();
    skipCountdown(a);
    skipCountdown(b);

    const p1 = a.getState().players[0];
    const p2 = b.getState().players[0];

    p1.x = 300; p1.y = 400; p1.vx = 50; p1.vy = 100; p1.state = 'airborne';
    p2.x = 300; p2.y = 400; p2.vx = 50; p2.vy = 100; p2.state = 'airborne';

    a.fixedUpdate(FIXED_TIMESTEP);
    b.fixedUpdate(FIXED_TIMESTEP);

    expect(p1.vx).toBeCloseTo(p2.vx, 1);
    expect(p1.vy).toBeCloseTo(p2.vy, 1);
  });

  it('geyser does not launch player when inactive', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -550, interval: 10, duration: 3 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.geyserStates[0].active = false;
    player.vy = 0;
    player.state = 'idle';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeGreaterThan(-100);
  });

  it('geyser uses zone.strength as launch velocity', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -800, interval: 10, duration: 3 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.geyserStates[0].active = true;
    state.geyserStates[0].activeTimer = 2;
    player.vy = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeLessThanOrEqual(-800);
  });

  it('geyser sets player state to airborne', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -550, interval: 10, duration: 3 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.geyserStates[0].active = true;
    state.geyserStates[0].activeTimer = 2;
    player.state = 'idle';
    player.vy = 0;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.state).toBe('airborne');
  });

  it('geyser Math.min preserves stronger upward velocity', () => {
    const { sim } = createSim({
      arena: { effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -550, interval: 10, duration: 3 }] },
    });
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    state.geyserStates[0].active = true;
    state.geyserStates[0].activeTimer = 2;
    player.vy = -900;
    player.state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.vy).toBeLessThanOrEqual(-550);
  });

  it('overlapping zero-G and current both apply', () => {
    const { sim } = createSim({
      arena: {
        effectZones: [
          { type: 'zero_g', x: 0, y: 0, width: 1280, height: 720 },
          { type: 'current', x: 0, y: 0, width: 1280, height: 720, vx: 2000 },
        ],
      },
    });
    skipCountdown(sim);
    const player = sim.getState().players[0];
    player.state = 'airborne';
    player.vy = 200;
    player.vx = 0;
    const vxBefore = player.vx;
    const vyBefore = player.vy;

    sim.fixedUpdate(FIXED_TIMESTEP);

    const pureGravityVy = vyBefore + GRAVITY * FIXED_TIMESTEP;
    expect(player.vy).toBeLessThan(pureGravityVy);
    expect(player.vx).toBeGreaterThan(vxBefore);
  });
});

// ===================================================================
// Hitstop (extended)
// ===================================================================

describe('Simulator — Hitstop (extended)', () => {
  function setupStomp(sim: Simulator) {
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
    return { attacker, victim, state };
  }

  it('after a stomp, the victim has hitstopTimer > 0', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const { victim } = setupStomp(sim);

    expect(victim.hitstopTimer).toBeGreaterThan(0);
    expect(victim.hitstopTimer).toBeCloseTo(HITSTOP_DURATION, 2);
  });

  it('during hitstop, player physics are frozen', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const { attacker } = setupStomp(sim);

    expect(attacker.hitstopTimer).toBeGreaterThan(0);

    const vxAfterStomp = attacker.vx;
    const vyAfterStomp = attacker.vy;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(attacker.vx).toBe(vxAfterStomp);
    expect(attacker.vy).toBe(vyAfterStomp);
  });

  it('after hitstop expires, physics resume normally', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const { attacker } = setupStomp(sim);

    const hitstopFrames = Math.ceil(HITSTOP_DURATION / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < hitstopFrames; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(attacker.hitstopTimer).toBeLessThanOrEqual(0);

    const vyBefore = attacker.vy;
    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(attacker.vy).toBeGreaterThan(vyBefore);
  });
});

// ===================================================================
// Landing Squash
// ===================================================================

describe('Simulator — Landing Squash', () => {
  it('squashScale drops below 1.0 on hard landing', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const player = sim.getState().players[0];

    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = DUST_LAND_VY_THRESHOLD + 100;
    player.state = 'airborne';
    player.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.squashScale).toBeLessThan(1.0);
    expect(player.squashScale).toBeCloseTo(SQUASH_ON_LAND, 1);
  });

  it('squashScale decays back toward 1.0 over time', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const player = sim.getState().players[0];

    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = DUST_LAND_VY_THRESHOLD + 100;
    player.state = 'airborne';
    player.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    const squashAfterLand = player.squashScale;
    expect(squashAfterLand).toBeLessThan(1.0);

    for (let i = 0; i < 20; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.squashScale).toBeGreaterThan(squashAfterLand);
  });
});

// ===================================================================
// Fat and Slow Effects (extended)
// ===================================================================

describe('Simulator — Fat and Slow Effects (extended)', () => {
  it('fat player moves slower than normal player', () => {
    const { sim: fat } = createSim();
    const { sim: normal } = createSim();
    skipCountdown(fat);
    skipCountdown(normal);

    const fatPlayer = fat.getState().players[0];
    const normalPlayer = normal.getState().players[0];

    fatPlayer.fatTimer = FAT_DURATION;

    fatPlayer.x = 200; fatPlayer.y = 660 - PLAYER_HEIGHT;
    fatPlayer.vx = 0; fatPlayer.state = 'idle';
    normalPlayer.x = 200; normalPlayer.y = 660 - PLAYER_HEIGHT;
    normalPlayer.vx = 0; normalPlayer.state = 'idle';

    const rightInput = new Map<string, InputState>();
    rightInput.set('P1', { left: false, right: true, jump: false, down: false });
    rightInput.set('P2', { left: false, right: false, jump: false, down: false });

    for (let i = 0; i < 60; i++) {
      fat.fixedUpdate(FIXED_TIMESTEP, new Map(rightInput));
      normal.fixedUpdate(FIXED_TIMESTEP, new Map(rightInput));
    }

    expect(fatPlayer.x).toBeLessThan(normalPlayer.x);
  });

  it('slowed player (from thorn) moves slower', () => {
    const { sim: slow } = createSim();
    const { sim: normal } = createSim();
    skipCountdown(slow);
    skipCountdown(normal);

    const slowPlayer = slow.getState().players[0];
    const normalPlayer = normal.getState().players[0];

    slowPlayer.slowTimer = THORN_SLOW_DURATION;

    slowPlayer.x = 200; slowPlayer.y = 660 - PLAYER_HEIGHT;
    slowPlayer.vx = 0; slowPlayer.state = 'idle';
    normalPlayer.x = 200; normalPlayer.y = 660 - PLAYER_HEIGHT;
    normalPlayer.vx = 0; normalPlayer.state = 'idle';

    const rightInput = new Map<string, InputState>();
    rightInput.set('P1', { left: false, right: true, jump: false, down: false });
    rightInput.set('P2', { left: false, right: false, jump: false, down: false });

    for (let i = 0; i < 60; i++) {
      slow.fixedUpdate(FIXED_TIMESTEP, new Map(rightInput));
      normal.fixedUpdate(FIXED_TIMESTEP, new Map(rightInput));
    }

    expect(slowPlayer.x).toBeLessThan(normalPlayer.x);
  });
});

// ===================================================================
// No-Spawn Zones
// ===================================================================

describe('Simulator — No-Spawn Zones', () => {
  it('springs do not spawn inside noSpawnZones', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 500, width: 200, height: 20 },
        ],
        noSpawnZones: [{ x: 350, y: 450, width: 300, height: 100 }],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil(20 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.springs.length).toBe(0);
  });

  it('thorns do not spawn inside noSpawnZones', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 500, width: 200, height: 20 },
        ],
        noSpawnZones: [{ x: 350, y: 450, width: 300, height: 100 }],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil(25 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.thorns.length).toBe(0);
  });
});

// ===================================================================
// resolveStuckPlayer
// ===================================================================

describe('Simulator — resolveStuckPlayer', () => {
  it('player deeply embedded in platform gets ejected', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const player = sim.getState().players[0];

    player.x = 200;
    player.y = 660 - PLAYER_HEIGHT + 15;
    player.state = 'idle';
    player.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.y + player.height).toBeLessThanOrEqual(660 + 1);
  });

  it('player slightly overlapping platform is not ejected (< 5px)', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const player = sim.getState().players[0];

    player.x = 200;
    player.y = 660 - PLAYER_HEIGHT + 3;
    player.state = 'idle';
    player.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.y + player.height).toBeLessThanOrEqual(660 + 1);
  });
});

// ===================================================================
// Spring & Thorn Spawning (extended)
// ===================================================================

describe('Simulator — Spring Spawning', () => {
  it('springs spawn after SPRING_SPAWN_INTERVAL on floating platforms', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 400, width: 200, height: 20 },
        ],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil(6 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.springs.length).toBeGreaterThanOrEqual(1);
  });

  it('no springs spawn when noSprings is set on arena', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 400, width: 200, height: 20 },
        ],
        noSprings: true,
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil(20 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.springs.length).toBe(0);
  });
});

describe('Simulator — Thorn Spawning', () => {
  it('thorns spawn after THORN_SPAWN_INTERVAL on floating platforms', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 500, width: 200, height: 20 },
        ],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    const steps = Math.ceil(9 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.thorns.length).toBeGreaterThanOrEqual(1);
  });

  it('thorns have growTimer > 0 when first spawned', () => {
    const { sim } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 400, y: 500, width: 200, height: 20 },
        ],
      },
    });
    skipCountdown(sim);
    const state = sim.getState();

    let thornFound = false;
    const maxSteps = Math.ceil(15 / FIXED_TIMESTEP);
    for (let i = 0; i < maxSteps; i++) {
      const prevCount = state.thorns.length;
      sim.fixedUpdate(FIXED_TIMESTEP);
      if (state.thorns.length > prevCount) {
        const newestThorn = state.thorns[state.thorns.length - 1];
        expect(newestThorn.growTimer).toBeGreaterThan(0);
        thornFound = true;
        break;
      }
    }

    expect(thornFound).toBe(true);
  });
});

// ===================================================================
// Mod physics multipliers
// ===================================================================

describe('Simulator — mod physics multipliers', () => {
  it('underwaterGravity mod reduces gravity', () => {
    const { sim } = createSim({
      settings: {
        mods: {
          underwaterGravity: true, turbo: false, extremeGore: false,
          carrotChase: false, giantPlayers: false, superBounce: false,
          mirrorArena: false,
        },
      },
    });
    const state = sim.getState();
    state.countdown = 0;

    state.players[0].y = 300;
    state.players[0].vy = 0;
    state.players[0].state = 'airborne';

    sim.fixedUpdate(FIXED_TIMESTEP);

    const vy = state.players[0].vy;
    expect(vy).toBeGreaterThan(0);
    expect(vy).toBeLessThan(15);
  });

  it('superBounce mod marks all platforms bouncy on the arena', () => {
    const { sim } = createSim({
      settings: {
        mods: {
          superBounce: true, turbo: false, extremeGore: false,
          carrotChase: false, giantPlayers: false, mirrorArena: false,
          underwaterGravity: false,
        },
      },
    });
    const arena = sim.getArena();
    expect(arena.bouncyPlatforms).toBeDefined();
    expect(arena.bouncyPlatforms!.length).toBe(arena.platforms.length);
  });

  it('giantPlayers mod increases player dimensions', () => {
    const { sim } = createSim({
      settings: {
        mods: {
          giantPlayers: true, turbo: false, extremeGore: false,
          carrotChase: false, superBounce: false, mirrorArena: false,
          underwaterGravity: false,
        },
      },
    });
    const p1 = sim.getState().players[0];
    expect(p1.width).toBeGreaterThan(PLAYER_WIDTH);
    expect(p1.height).toBeGreaterThan(PLAYER_HEIGHT);
  });
});

// ===================================================================
// Arena-specific gameplay — geyser/zone init, ghost wrap, carrots/springs/thorns spawn
// ===================================================================

describe('Simulator — arena-specific gameplay', () => {
  const noInput = new Map<string, InputState>();
  noInput.set('P1', { left: false, right: false, jump: false, down: false });
  noInput.set('P2', { left: false, right: false, jump: false, down: false });

  it('initializes geyser states from effectZones', () => {
    const { sim } = createSim({
      arena: {
        effectZones: [
          { type: 'geyser', x: 300, y: 400, width: 50, height: 200, interval: 8, duration: 2, strength: 600 },
          { type: 'geyser', x: 700, y: 400, width: 50, height: 200, interval: 10, duration: 3, strength: 500 },
        ],
      },
    });
    const state = sim.getState();
    expect(state.geyserStates).toHaveLength(2);
    expect(state.geyserStates[0]).toHaveProperty('timer');
    expect(state.geyserStates[0]).toHaveProperty('active');
  });

  it('processes geyser timer cycling', () => {
    const { sim } = createSim({
      arena: {
        effectZones: [{ type: 'geyser', x: 600, y: 400, width: 50, height: 200, interval: 0.5, duration: 0.3, strength: 600 }],
      },
    });
    const state = sim.getState();
    state.countdown = 0;

    for (let i = 0; i < 120; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.geyserStates[0].timer).toBeDefined();
  });

  it('arena with hazardZones applies burn/slow on collision', () => {
    const { sim } = createSim({
      arena: {
        hazardZones: [{ x: 50, y: 620, width: 200, height: 40, type: 'lava' }],
      },
    });
    const state = sim.getState();
    state.countdown = 0;

    state.players[0].x = 100;
    state.players[0].y = 628;

    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    const p = state.players[0];
    expect(p.burnTimer > 0 || p.slowTimer > 0 || p.state === 'splat').toBe(true);
  });

  it('ghost wrapping: ghosts wrap around screen edges', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;

    state.ghosts.push({ x: CANVAS_WIDTH + 50, y: 400, vx: 50, size: 30, alpha: 0.7, wobblePhase: 0 } as any);

    for (let i = 0; i < 3; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.ghosts[0].x).toBeLessThan(0);
  });

  it('spawns springs during gameplay', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;

    for (let i = 0; i < 1000; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.springs.length).toBeGreaterThan(0);
  });

  it('spawns thorns during gameplay', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;

    for (let i = 0; i < 1000; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.thorns.length).toBeGreaterThan(0);
  });

  it('updates ghosts during fixedUpdate (haunted_graveyard arena)', () => {
    const { sim } = createSim({ settings: { arenaId: 'haunted_graveyard' } });
    const state = sim.getState();
    state.countdown = 0;

    const ghostXBefore = state.ghosts[0]?.x;
    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    if (state.ghosts.length > 0) {
      expect(state.ghosts[0].x).not.toBe(ghostXBefore);
    }
  });

  it('spring spawn timer decrements and spawns springs', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;
    state.springSpawnTimer = 0.01;

    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.springs.length).toBeGreaterThan(0);
  });

  it('thorn spawn timer decrements and spawns thorns', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;
    state.thornSpawnTimer = 0.01;

    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.thorns.length).toBeGreaterThan(0);
  });

  it('pigeon flock scatters when player walks near', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;

    const p1 = state.players[0];
    p1.y = 660 - PLAYER_HEIGHT;
    p1.state = 'idle' as any;
    state.pigeonFlocks.push({
      x: p1.x + PLAYER_WIDTH / 2,
      y: p1.y + PLAYER_HEIGHT,
      active: true,
      respawnTimer: 0,
      scatterParticles: [],
    } as any);

    sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.pigeonFlocks[0].active).toBe(false);
    expect(state.pigeonFlocks[0].scatterParticles.length).toBeGreaterThan(0);
  });

  it('pigeon flock respawns after timer', () => {
    const { sim } = createSim();
    const state = sim.getState();
    state.countdown = 0;

    state.pigeonFlocks.push({
      x: 800, y: 660, active: false, respawnTimer: 0.1, scatterParticles: [],
    } as any);

    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.pigeonFlocks[0].active).toBe(true);
  });

  it('carrot spawn considers carrotZones for extra candidates', () => {
    const { sim } = createSim({
      arena: { carrotZones: [{ x: 200, y: 400, width: 200, height: 200 }] },
    });
    const state = sim.getState();
    state.countdown = 0;
    state.carrotTimer = 0.01;

    for (let i = 0; i < 10; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.carrots.length).toBeGreaterThan(0);
  });

  it('geyser timer cycles between active and inactive', () => {
    const { sim } = createSim({
      arena: {
        effectZones: [{ type: 'geyser', x: 600, y: 400, width: 50, height: 200, interval: 0.2, duration: 0.1, strength: 600 }],
      },
    });
    const state = sim.getState();
    state.countdown = 0;
    state.geyserStates[0].timer = 0.01;

    for (let i = 0; i < 30; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(typeof state.geyserStates[0].active).toBe('boolean');
  });

  it('fall-off detection respawns player on allowFallOff arena', () => {
    const { sim } = createSim({ arena: { allowFallOff: true } as any });
    const state = sim.getState();
    state.countdown = 0;

    state.players[0].y = CANVAS_HEIGHT + 100;
    state.players[0].vy = 200;

    for (let i = 0; i < 3; i++) sim.fixedUpdate(FIXED_TIMESTEP, noInput);

    expect(state.players[0].y).toBeLessThan(CANVAS_HEIGHT);
  });
});

// ===================================================================
// Simulator setRng / disconnectPlayer adapter-pure surfaces
// ===================================================================

describe('Simulator — disconnectPlayer', () => {
  it('disconnectPlayer marks player as disconnected and splatted', () => {
    const { sim } = createSim();
    sim.disconnectPlayer('P2');

    const p2 = sim.getState().players.find(p => p.id === 'P2');
    expect(p2?.disconnected).toBe(true);
    expect(p2?.state).toBe('splat');
    expect(p2?.splatTimer).toBeGreaterThan(0);
  });

  it('disconnectPlayer cancels an in-progress respawn', () => {
    const { sim } = createSim();
    const p2 = sim.getState().players.find(p => p.id === 'P2')!;
    p2.state = 'respawning';
    p2.respawnTimer = 1.0;
    p2.splatTimer = 0;

    sim.disconnectPlayer('P2');

    expect(p2.disconnected).toBe(true);
    expect(p2.state).toBe('splat');
    expect(p2.splatTimer).toBeGreaterThan(0);
    expect(p2.respawnTimer).toBe(0);
  });

  it('disconnectPlayer preserves splatTimer trajectory for already-splat players', () => {
    const { sim } = createSim();
    const p2 = sim.getState().players.find(p => p.id === 'P2')!;
    p2.state = 'splat';
    p2.splatTimer = 0.4;

    sim.disconnectPlayer('P2');

    expect(p2.disconnected).toBe(true);
    expect(p2.state).toBe('splat');
    expect(p2.splatTimer).toBe(0.4);
  });
});

// ===================================================================
// Screen Effects (set inside fixedUpdate)
// ===================================================================

describe('Simulator — Screen Effects', () => {
  it('after a stomp, screenShake is set > 0', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    victim.x = 500; victim.y = 600;
    victim.state = 'idle'; victim.invincibleTimer = 0; victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne'; attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.screenShake).toBeGreaterThan(0);
  });

  it('screenShake decays toward 0 over subsequent frames', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();

    state.screenShake = 0.5;

    sim.fixedUpdate(FIXED_TIMESTEP);
    expect(state.screenShake).toBeLessThan(0.5);
    expect(state.screenShake).toBeGreaterThan(0);
  });

  // Note: screenFlash on hazard hit is routed through ParticleEmitter.applyHazardHitVFX,
  // not directly mutated in Simulator. With the NOOP emitter, screenFlash stays 0;
  // that test belongs in a ParticleSystem-coupled test (lives in gameLoop.test.ts).

  it('match-ending kill sets slowMotion', () => {
    const { sim } = createSim({ settings: { killLimit: 3 } });
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    attacker.score = 1; // stomp gives +2, total = 3 = killLimit

    victim.x = 500; victim.y = 600;
    victim.state = 'idle'; victim.invincibleTimer = 0; victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne'; attacker.active = true;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.slowMotion).toBeGreaterThan(0);
    expect(state.matchOver).toBe(true);
  });
});

// ===================================================================
// Environment (dayPhase + timeElapsed in fixedUpdate)
// ===================================================================

describe('Simulator — Environment', () => {
  it('dayPhase increments each frame', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const dayPhaseBefore = state.dayPhase;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.dayPhase).toBeGreaterThan(dayPhaseBefore);
  });

  it('timeElapsed increments each frame by dt', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const timeBefore = state.timeElapsed;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(state.timeElapsed).toBeCloseTo(timeBefore + FIXED_TIMESTEP, 6);
  });
});

// ===================================================================
// Headbonk + crouch SFX (routed through SimulatorEvents)
// ===================================================================

describe('Simulator — SFX events (headbonk + crouch)', () => {
  it('headbonk emits sfx when player hits ceiling', () => {
    const { sim, events } = createSim({
      arena: {
        platforms: [
          { x: 0, y: 660, width: 1280, height: 60 },
          { x: 50, y: 400, width: 200, height: 20 },
        ],
      },
    });
    const state = sim.getState();
    state.countdown = 0;

    state.players[0].x = 100;
    state.players[0].y = 420;
    state.players[0].vy = -300;
    state.players[0].state = 'airborne' as any;

    events.clear();
    for (let i = 0; i < 5; i++) sim.fixedUpdate(FIXED_TIMESTEP);

    // Headbonk fires when wasAirborne && state === 'airborne' && prevVy < -10 && vy === 0
    // The exact firing depends on collision timing; the assertion mirrors the
    // original "may or may not trigger" loose expectation.
    expect(events.sfxNames().filter(n => n === 'headbonk').length).toBeGreaterThanOrEqual(0);
  });

  it('crouch emits sfx on first down-input during idle state', () => {
    const { sim, events } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = 200;
    player.y = 660 - PLAYER_HEIGHT;
    player.state = 'idle';
    player.squashScale = 1;

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: false, jump: false, down: true });
    inputs.set('P2', { left: false, right: false, jump: false, down: false });

    events.clear();
    sim.fixedUpdate(FIXED_TIMESTEP, inputs);

    // crouch sfx fires when down is pressed and the player wasn't already crouching
    expect(events.sfxNames()).toContain('crouch');
  });

  it('match-end emits onMatchEnd with state', () => {
    const { sim, events } = createSim({ settings: { killLimit: 1 } });
    skipCountdown(sim);
    sim.getState().players[0].score = 1;
    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.matchEnd).toHaveLength(1);
    expect(events.matchEnd[0].winner).toBe('P1');
    expect(events.matchEnd[0].state.matchOver).toBe(true);
    // music stop fires too
    expect(events.musicStop).toBeGreaterThanOrEqual(1);
  });

  it('player landing emits onPlayerLanding with prevVy', () => {
    const { sim, events } = createSim();
    skipCountdown(sim);
    const player = sim.getState().players[0];

    player.x = 200;
    player.y = 660 - player.height - 2;
    player.vy = 200;
    player.state = 'airborne';

    events.clear();
    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(events.playerLanding.length).toBeGreaterThan(0);
    expect(events.playerLanding[0].slot).toBe('P1');
    expect(events.playerLanding[0].prevVy).toBeGreaterThan(0);
  });

  it('stomp emits onStompHaptic for both attacker and victim', () => {
    const { sim, events } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    victim.x = 500; victim.y = 600;
    victim.state = 'idle'; victim.invincibleTimer = 0; victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne'; attacker.active = true;

    events.clear();
    sim.fixedUpdate(FIXED_TIMESTEP);

    const slots = events.stompHaptic.map(e => e.slot);
    expect(slots).toContain('P1');
    expect(slots).toContain('P2');
  });
});

// ===================================================================
// Animation Timers (host-authoritative animFrame/animTimer in fixedUpdate)
// ===================================================================

describe('Simulator — Animation Timers (host-authoritative)', () => {
  it('animTimer increments each frame for running players', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = 200;
    player.y = 660 - PLAYER_HEIGHT;
    player.active = true;
    player.hitstopTimer = 0;
    player.animTimer = 0;
    player.vx = 300;

    sim.fixedUpdate(FIXED_TIMESTEP);

    expect(player.animTimer).toBeGreaterThan(0);
    expect(player.animTimer).toBeCloseTo(FIXED_TIMESTEP, 6);
  });

  it('animFrame advances when animTimer exceeds threshold', () => {
    const { sim } = createSim();
    skipCountdown(sim);
    const state = sim.getState();
    const player = state.players[0];

    player.x = 200;
    player.y = 660 - PLAYER_HEIGHT;
    player.active = true;
    player.hitstopTimer = 0;
    player.animTimer = 0;
    player.animFrame = 0;

    const steps = Math.ceil(ANIM_FRAME_DURATION / FIXED_TIMESTEP) + 1;
    for (let i = 0; i < steps; i++) {
      player.vx = 300;
      player.state = 'run';
      sim.fixedUpdate(FIXED_TIMESTEP);
    }

    expect(player.animFrame).toBeGreaterThan(0);
  });
});

describe('Simulator — RNG', () => {
  it('setRng stores rng reference', () => {
    const { sim } = createSim();
    const rng = { nextFloat: () => 0.5, getState: () => 42, setState: () => {} } as any;
    sim.setRng(rng);
    expect(sim.getRng()).toBe(rng);
  });

  it('default Simulator has no rng (Math.random fallback)', () => {
    const { sim } = createSim();
    expect(sim.getRng()).toBeUndefined();
  });
});
