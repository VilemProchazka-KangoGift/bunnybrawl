import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { MatchSettings, Arena, PlayerSlot, InputState } from './types';
import { makeArena } from './__tests__/testHelpers';
import { FIXED_TIMESTEP, DUST_LAND_VY_THRESHOLD, MATCH_COUNTDOWN, JUMP_IMPULSE } from './constants';

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
    setNetworkMode = vi.fn();
    getDiagnostics = vi.fn(() => ({ clouds: false, weather: false, wildlife: false, playersDrawn: 0 }));
  },
}));

vi.mock('howler', () => ({
  Howl: vi.fn(),
  Howler: { mute: vi.fn() },
}));

import { installMockCanvas2D } from './__tests__/mockCanvas';
installMockCanvas2D();

// Import after mocks are set up
import { GameLoop } from './gameLoop';
import { registerBuiltinArenas } from './arenas';
import { registerBuiltinCharacters } from './characters';
import { audio } from './audio';
import type { ParticleSystem } from './gameLoop/cosmetics/ParticleSystem';

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

let _lastLoop: GameLoop | null = null;

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
  // Default to 'playing' phase so cosmeticStep runs. Tests can flip to
  // 'loading' to exercise the early-return.
  loop.getState().phase = 'playing';
  _lastLoop = loop;
  return { loop, onMatchEnd, arena, settings };
}

// --- Setup ---

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

afterEach(() => {
  _lastLoop?.stop();
  _lastLoop = null;
  vi.restoreAllMocks();
});

// ===================================================================
// cosmeticStep transition detection tests
// ===================================================================

describe('cosmeticStep transition detection', () => {

  it('detects jump: grounded → airborne plays jump sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish initial grounded state
    player.state = 'idle';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Transition to airborne (jumped)
    player.state = 'airborne';
    player.vy = -400;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('jump');
  });

  it('does NOT play geyser sound on a normal jump from rest (regression for vy-heuristic false-positive)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish initial grounded state at rest
    player.state = 'idle';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Normal jump (vy = JUMP_IMPULSE), prev.vy = 0
    player.state = 'airborne';
    player.vy = JUMP_IMPULSE;
    loop.cosmeticStep(FIXED_TIMESTEP);

    // Jump SFX fires; geyser SFX must NOT
    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('jump');
    expect(vi.mocked(audio.play)).not.toHaveBeenCalledWith('geyser');
  });

  it('spawns jump dust on input-jump grounded → airborne transition', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Establish initial grounded state (no spring trail active)
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Transition to airborne via input.jump (vy = JUMP_IMPULSE)
    player.state = 'airborne';
    player.vy = JUMP_IMPULSE;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(player);
  });

  it('does NOT spawn jump dust when launched by a spring (springTrailTimer rising edge)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Grounded baseline, no active spring trail
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Spring contact this tick: airborne, vy = SPRING_BOUNCE,
    // springTrailTimer rises 0 → SPRING_TRAIL_DURATION (0.6).
    player.state = 'airborne';
    player.vy = -700;
    player.springTrailTimer = 0.6;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).not.toHaveBeenCalled();
  });

  it('spawns jump dust on input-jump while springTrailTimer is still decaying (not a rising edge)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Grounded baseline — springTrailTimer already > 0, decaying from an earlier spring
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0.3;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Input jump — springTrailTimer keeps decaying, NOT a 0 → positive rising edge
    player.state = 'airborne';
    player.vy = -560;
    player.springTrailTimer = 0.28;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(player);
  });

  it('detects landing: airborne → grounded with sufficient vy plays land sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish airborne state with high vy (exceeding DUST_LAND_VY_THRESHOLD)
    player.state = 'airborne';
    player.vy = DUST_LAND_VY_THRESHOLD + 100;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Land on ground
    player.state = 'idle';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('land');
  });

  it('detects stomp: alive → splat plays stomp sound and creates shockwave', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish alive state
    player.state = 'run';
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    const shockwavesBefore = state.shockwaves.length;

    // Player gets splatted
    player.state = 'splat';
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('stomp');
    expect(state.shockwaves.length).toBeGreaterThan(shockwavesBefore);
  });

  it('detects fast-fall start: fastFalling false → true plays fastfall sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish airborne, not fast-falling
    player.state = 'airborne';
    player.fastFalling = false;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Start fast-falling
    player.fastFalling = true;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('fastfall');
  });

  it('detects push bump: sideSquash drops below threshold plays bump sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish normal sideSquash (>= 0.95)
    player.state = 'idle';
    player.sideSquash = 1.0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Simulate push (sideSquash set to 0.8 by collidePlayersHorizontal)
    player.sideSquash = 0.8;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('bump');
  });

  it('detects burn start: burnTimer 0 → positive plays oof sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish no burn
    player.state = 'idle';
    player.burnTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Start burning
    player.burnTimer = 0.5;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('oof');
  });

  it('detects countdown tick: countdown second decreases plays countdown_beep', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    // Establish countdown where Math.ceil gives 3
    state.countdown = 2.9;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Countdown ticks down so Math.ceil drops from 3 to 2
    state.countdown = 1.9;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('countdown_beep');
  });

  it('detects match over: matchOver false → true plays victory sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    // Establish match not over, skip countdown to avoid extra sounds
    state.countdown = 0;
    state.matchOver = false;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Match ends
    state.matchOver = true;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('victory');
  });

  it('does not fire false transition sounds on first cosmeticStep call', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    // Set players to states that would normally trigger sounds if they were transitions
    const player = state.players[0];
    player.state = 'airborne';
    player.fastFalling = true;
    player.burnTimer = 0.5;
    player.sideSquash = 0.8;

    vi.mocked(audio.play).mockClear();

    // First cosmeticStep establishes prev-state — constructor already initialized prev-state,
    // so this IS the second call conceptually. We need to test a truly fresh player.
    // The constructor initializes prevCosmeticState, so transitions from constructor state
    // to the modified state above WILL fire. Let's verify the constructor init prevents
    // sounds on the very first cosmeticStep when state hasn't changed.
    const { loop: freshLoop } = createLoop();
    _lastLoop = freshLoop; // track for cleanup

    vi.mocked(audio.play).mockClear();

    // Call cosmeticStep without changing any state from defaults
    freshLoop.cosmeticStep(FIXED_TIMESTEP);

    // No transition sounds should fire because state hasn't changed from constructor init
    const transitionSounds = ['jump', 'land', 'fastfall', 'stomp', 'bump', 'oof', 'victory'];
    const transitionCalls = vi.mocked(audio.play).mock.calls.filter(
      (call: any[]) => transitionSounds.includes(call[0])
    );
    expect(transitionCalls.length).toBe(0);
  });

  it('accumulates footstep sounds when player is running', () => {
    const { loop } = createLoop();
    loop.setNetworkMode(true);
    loop.skipCountdown();
    const state = loop.getState();
    const player = state.players[0];

    // Place player on ground and set to running
    player.state = 'run';
    player.vx = 200;
    player.y = 620;

    vi.mocked(audio.play).mockClear();

    // Run cosmeticStep enough times for footstep accumulator to trigger
    // At vx=200, speedRatio ~0.54, interval ~0.156s. 15 ticks at ~16ms = ~0.25s → should trigger
    for (let i = 0; i < 15; i++) {
      loop.cosmeticStep(FIXED_TIMESTEP);
    }

    const footstepCalls = vi.mocked(audio.play).mock.calls.filter(
      (call: any[]) => call[0] === 'footstep_grass' || call[0] === 'footstep_wood'
    );
    expect(footstepCalls.length).toBeGreaterThan(0);
  });

  it('stomp also plays animal sound via audio.playAnimal', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish alive state
    player.state = 'idle';
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.playAnimal).mockClear();

    // Player gets splatted
    player.state = 'splat';
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.playAnimal)).toHaveBeenCalledWith(player.character.name);
  });

  it('countdown reaching zero plays countdown_go', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    // Establish countdown at 1 second (just above 0)
    state.countdown = 0.5;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Countdown reaches 0
    state.countdown = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('countdown_go');
  });

  it('landing with low vy does not play land sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish airborne with low vy (below threshold)
    player.state = 'airborne';
    player.vy = 50; // well below DUST_LAND_VY_THRESHOLD (300)
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Land
    player.state = 'idle';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    const landCalls = vi.mocked(audio.play).mock.calls.filter(
      (call: any[]) => call[0] === 'land'
    );
    expect(landCalls.length).toBe(0);
  });

  it('respawn (respawning → idle) plays land sound', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish respawning state
    player.state = 'respawning';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Respawn completes
    player.state = 'idle';
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('land');
  });

  it('score increase creates score animation', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];

    // Establish initial score
    player.score = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    const animsBefore = state.scoreAnimations.length;

    // Score increases (e.g. from a carrot pickup)
    player.score = 1;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(state.scoreAnimations.length).toBeGreaterThan(animsBefore);
  });
});
