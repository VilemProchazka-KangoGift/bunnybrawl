import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { MatchSettings, Arena, PlayerSlot, InputState } from './types';
import {
  FIXED_TIMESTEP, MATCH_COUNTDOWN,
  CARROT_FIRST_SPAWN_DELAY, SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL,
  HAZARD_LIFETIME, THORN_SLOW_DURATION,
  STOMP_VY_THRESHOLD, STOMP_BOUNCE,
  CANVAS_WIDTH, CANVAS_HEIGHT,
  DUST_LAND_VY_THRESHOLD,
  PLAYER_WIDTH, PLAYER_HEIGHT,
} from './constants';

// --- Mocks ---

vi.mock('./audio', () => ({
  audio: {
    init: vi.fn(),
    play: vi.fn(),
    playMusic: vi.fn(),
    stopMusic: vi.fn(),
    stop: vi.fn(),
    setMute: vi.fn(),
    setPaused: vi.fn(),
    setVolume: vi.fn(),
    stopAllGameSounds: vi.fn(),
    playMenuMusic: vi.fn(),
    playAnimal: vi.fn(),
  },
}));

vi.mock('./renderer', () => ({
  Renderer: class MockRenderer {
    renderBackground = vi.fn();
    renderFrame = vi.fn();
    setBotNavDebugStates = vi.fn();
    setNetDebugStats = vi.fn();
    setPlayerNames = vi.fn();
    setTimeLimit = vi.fn();
  },
}));

vi.mock('howler', () => ({
  Howl: vi.fn(),
  Howler: { mute: vi.fn() },
}));

// Mock canvas getContext since happy-dom may not support Canvas 2D
const mockCtx = {
  fillRect: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
  fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  scale: vi.fn(), drawImage: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  measureText: vi.fn(() => ({ width: 50 })),
  fillText: vi.fn(), strokeText: vi.fn(), closePath: vi.fn(),
  setTransform: vi.fn(), resetTransform: vi.fn(), clip: vi.fn(),
  rect: vi.fn(), ellipse: vi.fn(), quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(),
  canvas: { width: 1280, height: 720 },
  globalAlpha: 1, globalCompositeOperation: 'source-over',
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
  lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic',
  shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
};

const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type === '2d') return mockCtx as unknown as CanvasRenderingContext2D;
  return origGetContext.call(this, type as any);
} as any;

// Import after mocks are set up
import { GameLoop } from './gameLoop';
import { registerBuiltinArenas } from './arenas';
import { registerBuiltinCharacters } from './characters';

// --- Factories ---

function makeSettings(overrides?: Partial<MatchSettings>): MatchSettings {
  return {
    killLimit: 16,
    timeLimit: 0,
    playerCount: 2,
    goreMode: false,
    arenaId: 'meadow',
    botCount: 0,
    botDifficulty: 'medium' as const,
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

function makeArena(overrides?: Partial<Arena>): Arena {
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

function createLoop(opts?: {
  settings?: Partial<MatchSettings>;
  arena?: Partial<Arena>;
  players?: PlayerSlot[];
}) {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 1280;
  bgCanvas.height = 720;
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = 1280;
  fgCanvas.height = 720;
  const arena = makeArena(opts?.arena);
  const settings = makeSettings(opts?.settings);
  const onMatchEnd = vi.fn();
  const loop = new GameLoop(
    bgCanvas,
    fgCanvas,
    arena,
    settings,
    opts?.players ?? (['P1', 'P2'] as PlayerSlot[]),
    onMatchEnd,
  );
  return { loop, onMatchEnd, arena, settings };
}

// --- Setup ---

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================================================================
// 1. Lifecycle
// ===================================================================

describe('Lifecycle', () => {
  it('constructor creates players matching activePlayers count', () => {
    const { loop } = createLoop({ players: ['P1', 'P2', 'P3'] as PlayerSlot[] });
    const state = loop.getState();
    expect(state.players).toHaveLength(3);
    expect(state.players.map(p => p.id)).toEqual(['P1', 'P2', 'P3']);
  });

  it('getState() returns valid MatchState with players', () => {
    const { loop } = createLoop();
    const state = loop.getState();
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

  it('pause() and resume() toggle isPaused()', () => {
    const { loop } = createLoop();
    expect(loop.isPaused()).toBe(false);
    loop.pause();
    expect(loop.isPaused()).toBe(true);
    loop.resume();
    expect(loop.isPaused()).toBe(false);
  });

  it('skipCountdown() zeroes countdown', () => {
    const { loop } = createLoop();
    expect(loop.getState().countdown).toBe(MATCH_COUNTDOWN);
    loop.skipCountdown();
    expect(loop.getState().countdown).toBe(0);
  });

  it('stop() cleans up without error and allows no further updates', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    loop.fixedUpdate(FIXED_TIMESTEP);
    const timeBefore = loop.getState().timeElapsed;
    loop.stop();
    // After stop, state is still accessible
    expect(loop.getState().timeElapsed).toBe(timeBefore);
  });
});

// ===================================================================
// 2. fixedUpdate
// ===================================================================

describe('fixedUpdate', () => {
  it('increments timeElapsed by dt', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const before = loop.getState().timeElapsed;
    loop.fixedUpdate(FIXED_TIMESTEP);
    // timeElapsed is incremented even during countdown (since we skipped it, it's one tick)
    expect(loop.getState().timeElapsed).toBeCloseTo(before + FIXED_TIMESTEP, 6);
  });

  it('returns early when matchOver is true', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    loop.fixedUpdate(FIXED_TIMESTEP);
    const elapsed = loop.getState().timeElapsed;

    // Force matchOver
    loop.getState().matchOver = true;
    loop.fixedUpdate(FIXED_TIMESTEP);
    // timeElapsed should NOT have changed
    expect(loop.getState().timeElapsed).toBeCloseTo(elapsed, 6);
  });

  it('countdown decrements during fixedUpdate', () => {
    const { loop } = createLoop();
    const initial = loop.getState().countdown;
    expect(initial).toBe(MATCH_COUNTDOWN);

    loop.fixedUpdate(FIXED_TIMESTEP);
    expect(loop.getState().countdown).toBeCloseTo(MATCH_COUNTDOWN - FIXED_TIMESTEP, 6);
  });

  it('carrot spawns after timer expires', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    // Initial carrot timer is CARROT_FIRST_SPAWN_DELAY (10s)
    expect(state.carrotTimer).toBe(CARROT_FIRST_SPAWN_DELAY);

    // Advance past the carrot timer
    const steps = Math.ceil(CARROT_FIRST_SPAWN_DELAY / FIXED_TIMESTEP) + 1;
    for (let i = 0; i < steps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    // At least one carrot should have spawned
    expect(state.carrots.length).toBeGreaterThanOrEqual(1);
  });

  it('spring spawns after timer expires', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const initialTimer = state.springSpawnTimer; // 5s for first spring

    // Advance past the initial spring timer
    const steps = Math.ceil(initialTimer / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(state.springs.length).toBeGreaterThanOrEqual(1);
  });

  it('thorn spawns after timer expires', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const initialTimer = state.thornSpawnTimer; // 8s for first thorn

    // Advance past the initial thorn timer
    const steps = Math.ceil(initialTimer / FIXED_TIMESTEP) + 2;
    for (let i = 0; i < steps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(state.thorns.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// 3. Match End
// ===================================================================

describe('Match End', () => {
  it('kill limit reached triggers onMatchEnd', () => {
    const { loop, onMatchEnd } = createLoop({ settings: { killLimit: 5 } });
    loop.skipCountdown();
    const state = loop.getState();

    // Set player 0 score to killLimit
    state.players[0].score = 5;
    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(onMatchEnd).toHaveBeenCalledTimes(1);
    expect(onMatchEnd).toHaveBeenCalledWith('P1', expect.objectContaining({ matchOver: true }));
    expect(state.matchOver).toBe(true);
    expect(state.winner).toBe('P1');
  });

  it('time limit reached triggers onMatchEnd', () => {
    const { loop, onMatchEnd } = createLoop({ settings: { timeLimit: 10 } });
    loop.skipCountdown();

    // Advance close to 10 seconds
    const almostSteps = Math.floor(9.9 / FIXED_TIMESTEP);
    for (let i = 0; i < almostSteps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(onMatchEnd).not.toHaveBeenCalled();

    // Push past 10 seconds
    const remainingSteps = Math.ceil(0.2 / FIXED_TIMESTEP) + 1;
    for (let i = 0; i < remainingSteps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(onMatchEnd).toHaveBeenCalledTimes(1);
  });

  it('time limit: highest scorer wins', () => {
    const { loop, onMatchEnd } = createLoop({ settings: { timeLimit: 5 } });
    loop.skipCountdown();
    const state = loop.getState();

    // Give P2 a higher score
    state.players[0].score = 2;
    state.players[1].score = 7;

    // Advance past time limit
    const steps = Math.ceil(5.1 / FIXED_TIMESTEP);
    for (let i = 0; i < steps; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }

    expect(onMatchEnd).toHaveBeenCalledTimes(1);
    expect(onMatchEnd).toHaveBeenCalledWith('P2', expect.objectContaining({ matchOver: true }));
  });

  it('no match end when conditions not met', () => {
    const { loop, onMatchEnd } = createLoop({ settings: { killLimit: 16, timeLimit: 0 } });
    loop.skipCountdown();

    // Run a few ticks — no one at kill limit, no time limit
    for (let i = 0; i < 60; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(onMatchEnd).not.toHaveBeenCalled();
    expect(loop.getState().matchOver).toBe(false);
  });
});

// ===================================================================
// 4. Network Mode
// ===================================================================

describe('Network Mode', () => {
  it('setNetworkMode(true) enables network mode', () => {
    const { loop } = createLoop();
    loop.setNetworkMode(true);
    // In network mode, takeSnapshot should work (requires network mode)
    const snap = loop.takeSnapshot(0);
    expect(snap).toBeDefined();
    expect(snap.players.length).toBe(2);
  });

  it('fixedUpdate accepts networkInputs map', () => {
    const { loop } = createLoop();
    loop.setNetworkMode(true);
    loop.skipCountdown();

    const inputs = new Map<string, InputState>();
    inputs.set('P1', { left: false, right: true, jump: false, down: false });
    inputs.set('P2', { left: true, right: false, jump: false, down: false });

    loop.skipCountdown();
    const xBefore = loop.getState().players[0].x;
    loop.fixedUpdate(FIXED_TIMESTEP, inputs);
    // P1 has right=true, so player should have moved or have velocity
    const p1 = loop.getState().players[0];
    expect(p1.vx !== 0 || p1.x !== xBefore).toBe(true);
  });

  it('takeSnapshot returns a GameSnapshot with players', () => {
    const { loop } = createLoop();
    loop.setNetworkMode(true);

    const snap = loop.takeSnapshot(0);
    expect(snap).toBeDefined();
    expect(snap.frame).toBe(0);
    expect(snap.players).toHaveLength(2);
    expect(snap.players[0].id).toBe('P1');
    expect(snap.players[1].id).toBe('P2');
  });

  it('restoreSnapshot restores state', () => {
    const { loop } = createLoop();
    loop.setNetworkMode(true);
    loop.skipCountdown();

    // Take snapshot at initial state
    const snap = loop.takeSnapshot(0);
    const originalTimeElapsed = loop.getState().timeElapsed;

    // Advance state
    for (let i = 0; i < 30; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }
    expect(loop.getState().timeElapsed).toBeGreaterThan(originalTimeElapsed);

    // Restore
    loop.restoreSnapshot(snap);
    expect(loop.getState().timeElapsed).toBeCloseTo(originalTimeElapsed, 6);
  });
});

// ===================================================================
// 5. Entity Lifecycle
// ===================================================================

describe('Entity Lifecycle', () => {
  it('carrot pickup increases player score', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];
    const initialScore = player.score;

    // Manually place a carrot right on top of the player
    state.carrots.push({
      x: player.x + player.width / 2,
      y: player.y,
      active: true,
      spawnTime: 0,
    });

    loop.fixedUpdate(FIXED_TIMESTEP);
    expect(player.score).toBe(initialScore + 1);
  });

  it('spring removal when life expires', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();

    // Manually add a spring with nearly-expired life
    state.springs.push({
      x: 500,
      y: 500,
      platformIndex: 1,
      bounceTimer: 0,
      life: FIXED_TIMESTEP * 0.5, // will expire in less than one tick
      growTimer: 0,
    });
    expect(state.springs).toHaveLength(1);

    loop.fixedUpdate(FIXED_TIMESTEP);
    // Spring should be removed because its life dropped <= 0
    expect(state.springs).toHaveLength(0);
  });

  it('thorn removal when life expires', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();

    // Manually add a thorn with nearly-expired life
    state.thorns.push({
      x: 500,
      y: 488,
      width: 28,
      height: 12,
      platformIndex: 1,
      life: FIXED_TIMESTEP * 0.5,
      growTimer: 0,
      hit: false,
    });
    expect(state.thorns).toHaveLength(1);

    loop.fixedUpdate(FIXED_TIMESTEP);
    expect(state.thorns).toHaveLength(0);
  });

  it('countdown blocks gameplay logic (spawn timers do not tick)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    expect(state.countdown).toBe(MATCH_COUNTDOWN);

    const initialSpringTimer = state.springSpawnTimer;
    const initialThornTimer = state.thornSpawnTimer;
    const initialCarrotTimer = state.carrotTimer;

    // Advance one tick during countdown
    loop.fixedUpdate(FIXED_TIMESTEP);
    // Spawn timers should NOT have decremented during countdown
    expect(state.springSpawnTimer).toBe(initialSpringTimer);
    expect(state.thornSpawnTimer).toBe(initialThornTimer);
    expect(state.carrotTimer).toBe(initialCarrotTimer);
  });

  it('thorn removal when hit', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();

    // Manually add a thorn that has been hit
    state.thorns.push({
      x: 500,
      y: 488,
      width: 28,
      height: 12,
      platformIndex: 1,
      life: HAZARD_LIFETIME,
      growTimer: 0,
      hit: true,
    });
    expect(state.thorns).toHaveLength(1);

    loop.fixedUpdate(FIXED_TIMESTEP);
    expect(state.thorns).toHaveLength(0);
  });
});

// ===================================================================
// 6. Hazard Collision
// ===================================================================

describe('Hazard Collision', () => {
  it('thorn collision applies slowTimer', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Place a fully-grown thorn directly on the player
    state.thorns.push({
      x: player.x,
      y: player.y,
      width: 28,
      height: 12,
      platformIndex: 0,
      life: HAZARD_LIFETIME,
      growTimer: 0,
      hit: false,
    });

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBeGreaterThan(0);
    expect(state.thorns[0]?.hit ?? true).toBe(true);
  });

  it('lava hazard zone collision applies burnTimer', () => {
    // Lava hazard zones (not lava rocks) set burnTimer
    const { loop } = createLoop({
      arena: {
        hazardZones: [{ x: 0, y: 0, width: 1280, height: 720, type: 'lava' }],
      },
    });
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Ensure player is not already slowed or invincible
    player.slowTimer = 0;
    player.invincibleTimer = 0;

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(player.burnTimer).toBeGreaterThan(0);
    expect(player.slowTimer).toBeGreaterThan(0);
  });

  it('ghost collision applies slowTimer', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Place a ghost directly on the player
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    state.ghosts.push({
      x: pcx,
      y: pcy,
      vx: 0,
      size: 40,
      alpha: 1,
      wobblePhase: 0,
    });

    player.slowTimer = 0;
    player.invincibleTimer = 0;

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBeGreaterThan(0);
  });

  it('invincible player ignores thorn collision', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    player.invincibleTimer = 1.0;
    player.slowTimer = 0;

    // Place a fully-grown thorn directly on the player
    state.thorns.push({
      x: player.x,
      y: player.y,
      width: 28,
      height: 12,
      platformIndex: 0,
      life: HAZARD_LIFETIME,
      growTimer: 0,
      hit: false,
    });

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(player.slowTimer).toBe(0);
    expect(state.thorns[0].hit).toBe(false);
  });
});

// ===================================================================
// 7. Effect Zones
// ===================================================================

describe('Effect Zones', () => {
  it('zero-G zone slows falling player', () => {
    const { loop } = createLoop({
      arena: {
        effectZones: [{ type: 'zero_g', x: 0, y: 0, width: 1280, height: 720 }],
      },
    });
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Make player airborne and falling (positive vy = downward)
    player.state = 'airborne';
    player.vy = 200;
    const vyBefore = player.vy;

    loop.fixedUpdate(FIXED_TIMESTEP);

    // Zero-G slows falling: vy *= 0.92 (plus gravity adds some),
    // but the vy should be less than what gravity alone would produce
    // Zero-G effect is applied, so the vy should have been reduced from the
    // baseline by the 0.92 multiplier at some point during the tick
    // We just verify the zone was processed — player's vy should differ
    // from pure gravity (GRAVITY * dt + vyBefore)
    // The zero-G zone applies 0.92 multiplier to positive vy, so the result
    // should be less than vyBefore + GRAVITY * dt (what pure gravity would give)
    const pureGravityVy = vyBefore + 900 * FIXED_TIMESTEP;
    expect(player.vy).toBeLessThan(pureGravityVy);
  });

  it('current zone applies vx force', () => {
    // Use a strong current that overcomes friction (800 px/s²)
    const { loop } = createLoop({
      arena: {
        effectZones: [{ type: 'current', x: 0, y: 0, width: 1280, height: 720, vx: 2000 }],
      },
    });
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];
    const xBefore = player.x;

    // Run several ticks to let the current overcome friction and push the player
    for (let i = 0; i < 30; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }

    expect(player.x).toBeGreaterThan(xBefore);
  });

  it('geyser zone launches player when active', () => {
    const { loop } = createLoop({
      arena: {
        effectZones: [{ type: 'geyser', x: 0, y: 0, width: 1280, height: 720, strength: -550, interval: 10, duration: 3 }],
      },
    });
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Force geyser state to active
    state.geyserStates[0].active = true;
    state.geyserStates[0].activeTimer = 2;

    player.vy = 0;

    loop.fixedUpdate(FIXED_TIMESTEP);

    // Geyser sets vy to min(current, strength) = -550, launching player upward
    expect(player.vy).toBeLessThan(-100);
    expect(player.state).toBe('airborne');
  });
});

// ===================================================================
// 8. Stomp
// ===================================================================

describe('Stomp', () => {
  it('stomp from above grants 2 points', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    const initialScore = attacker.score;

    // Position attacker directly above victim, falling down
    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 0;
    victim.active = true;

    attacker.x = 500;
    // Attacker's bottom edge should be just entering victim's top half
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100; // well above threshold
    attacker.state = 'airborne';
    attacker.active = true;

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(attacker.score).toBe(initialScore + 2);
    expect(victim.state).toBe('splat');
  });

  it('invincible player cannot be stomped', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const attacker = state.players[0];
    const victim = state.players[1];

    // Position same as above
    victim.x = 500;
    victim.y = 600;
    victim.state = 'idle';
    victim.invincibleTimer = 1.0; // invincible!
    victim.active = true;

    attacker.x = 500;
    attacker.y = victim.y - attacker.height + 5;
    attacker.vy = STOMP_VY_THRESHOLD + 100;
    attacker.state = 'airborne';
    attacker.active = true;

    const initialScore = attacker.score;

    loop.fixedUpdate(FIXED_TIMESTEP);

    expect(victim.state).not.toBe('splat');
    expect(attacker.score).toBe(initialScore);
  });
});

// ===================================================================
// 9. Fall-off & Wrap
// ===================================================================

describe('Fall-off & Wrap', () => {
  it('player wraps horizontally', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Place player beyond the right edge
    player.x = CANVAS_WIDTH + 10;
    player.y = 620;
    player.state = 'idle';

    loop.fixedUpdate(FIXED_TIMESTEP);

    // wrapHorizontal: if player.x > arenaWidth, player.x = -player.width
    expect(player.x).toBeLessThan(CANVAS_WIDTH);
  });

  it('player below arena with allowFallOff respawns', () => {
    const { loop } = createLoop({
      arena: {
        allowFallOff: true,
      },
    });
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Position player far below the screen
    player.y = CANVAS_HEIGHT + 100;
    player.state = 'airborne';
    player.vy = 200;
    player.active = true;

    loop.fixedUpdate(FIXED_TIMESTEP);

    // Fall-off respawn: player repositioned to a spawn point, slowed, invincible
    expect(player.y).toBeLessThan(CANVAS_HEIGHT);
    expect(player.invincibleTimer).toBeGreaterThan(0);
    expect(player.slowTimer).toBeGreaterThan(0);
    expect(player.state).toBe('idle');
  });
});

// ===================================================================
// 10. Landing Dust
// ===================================================================

describe('Landing Dust', () => {
  it('landing dust spawns on hard landing', () => {
    const { loop } = createLoop();
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Position player just above the ground platform (y=660),
    // moving down fast enough to trigger dust
    player.x = 200;
    player.y = 660 - player.height - 2; // just above ground
    player.vy = DUST_LAND_VY_THRESHOLD + 100; // well above dust threshold
    player.state = 'airborne';
    player.active = true;

    // Access private particles via any-cast
    const particlesBefore = (loop as any).particles.length;

    loop.fixedUpdate(FIXED_TIMESTEP);

    // After landing with high velocity, dust particles should have been emitted
    expect((loop as any).particles.length).toBeGreaterThan(particlesBefore);
  });
});
