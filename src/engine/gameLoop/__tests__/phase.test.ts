/**
 * MatchPhase gating tests — verifies that fixedUpdate() early-returns when
 * state.phase === 'loading' and runs normally when state.phase === 'playing'.
 *
 * Rationale: during the loading phase (pre-match prep), the host should not
 * advance physics, countdown, or timers. Once all peers are ready, the phase
 * transitions to 'playing' and physics begins.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { MatchSettings, Arena, PlayerSlot } from '../../types';
import { makeArena } from '../../__tests__/testHelpers';
import { FIXED_TIMESTEP, MATCH_COUNTDOWN } from '../../constants';

// --- Mocks (must precede GameLoop import) ---

vi.mock('../../audio', () => ({
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

vi.mock('../../renderer', () => ({
  Renderer: class MockRenderer {
    renderBackground = vi.fn();
    renderFrame = vi.fn();
    setBotNavDebugStates = vi.fn();
    setNetDebugStats = vi.fn();
    setPlayerNames = vi.fn();
    setTimeLimit = vi.fn();
    getDiagnostics = vi.fn(() => ({ clouds: false, weather: false, wildlife: false, playersDrawn: 0 }));
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
import { GameLoop } from '../GameLoop';
import { registerBuiltinArenas } from '../../arenas';
import { registerBuiltinCharacters } from '../../characters';
import { audio } from '../../audio';

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
  _lastLoop = loop;
  return { loop, onMatchEnd };
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
// Phase gating
// ===================================================================

describe('MatchPhase gating in fixedUpdate', () => {
  it('does NOT advance physics when phase === "loading"', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    // Task 2 precondition: force loading phase.
    state.phase = 'loading';
    const startElapsed = state.timeElapsed;
    const startCountdown = state.countdown;
    expect(startCountdown).toBe(MATCH_COUNTDOWN); // sanity: default 3

    for (let i = 0; i < 10; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }

    // Physics should not have advanced
    expect(state.timeElapsed).toBe(startElapsed);
    // Countdown should be untouched
    expect(state.countdown).toBe(startCountdown);
  });

  it('DOES advance physics when phase === "playing"', () => {
    const { loop } = createLoop();
    const state = loop.getState();

    state.phase = 'playing';
    const startCountdown = state.countdown;

    for (let i = 0; i < 10; i++) {
      loop.fixedUpdate(FIXED_TIMESTEP);
    }

    // timeElapsed should have increased by ~10 * FIXED_TIMESTEP
    expect(state.timeElapsed).toBeGreaterThan(0);
    // Countdown should have decreased (initial 3s, after 10 frames at 1/60s ≈ 0.167s elapsed)
    expect(state.countdown).toBeLessThan(startCountdown);
  });
});

// ===================================================================
// setPhase API
// ===================================================================

describe('GameLoop.setPhase', () => {
  it('setPhase("playing") triggers playMusic + ambient', () => {
    const { loop } = createLoop();
    vi.mocked(audio.playMusic).mockClear();
    vi.mocked(audio.play).mockClear();

    loop.setPhase('playing');

    expect(vi.mocked(audio.playMusic)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('ambient');
  });

  it('setPhase to same value is idempotent — no re-trigger of playMusic', () => {
    const { loop } = createLoop();
    loop.setPhase('playing');
    vi.mocked(audio.playMusic).mockClear();

    loop.setPhase('playing'); // same value again

    expect(vi.mocked(audio.playMusic)).not.toHaveBeenCalled();
  });

  it('setPhase fires onPhaseChange callback on transition', () => {
    const { loop } = createLoop();
    const cb = vi.fn();
    loop.setOnPhaseChange(cb);

    loop.setPhase('playing');

    expect(cb).toHaveBeenCalledWith('playing');
  });

  it('setPhase to same value does NOT fire onPhaseChange', () => {
    const { loop } = createLoop();
    loop.setPhase('playing');
    const cb = vi.fn();
    loop.setOnPhaseChange(cb);

    loop.setPhase('playing'); // same value

    expect(cb).not.toHaveBeenCalled();
  });

  it('setPhase("over") fires callback but does NOT trigger music', () => {
    const { loop } = createLoop();
    loop.setPhase('playing'); // first play to get into non-loading state
    vi.mocked(audio.playMusic).mockClear();
    const cb = vi.fn();
    loop.setOnPhaseChange(cb);

    loop.setPhase('over');

    expect(cb).toHaveBeenCalledWith('over');
    expect(vi.mocked(audio.playMusic)).not.toHaveBeenCalled();
  });

  it('state.phase is updated synchronously by setPhase', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    expect(state.phase).toBe('loading');

    loop.setPhase('playing');
    expect(state.phase).toBe('playing');

    loop.setPhase('over');
    expect(state.phase).toBe('over');
  });

  it('tickCosmetic preserves residual cosmeticLead after a long gap', () => {
    // After a tab-switch with multi-second dt, tickCosmetic clamps the step
    // to COSMETIC_MAX_STEP and should subtract the consumed dt from
    // _cosmeticLead — not zero it. Without this, accumulators bound to
    // real-elapsed time stutter after a tab return.
    const { loop } = createLoop();
    loop.getState().phase = 'playing';

    // Simulate a 2-second gap. COSMETIC_MAX_STEP = 4 * FIXED_TIMESTEP ≈ 67ms,
    // so 2s should leave ~1.93s in residual.
    const lead0 = loop.getCosmeticLead();
    expect(lead0).toBe(0);

    loop.tickCosmetic(2.0);

    // After consuming one capped step, residual should still be substantial
    // (close to 2 seconds minus ~67ms).
    const remaining = loop.getCosmeticLead();
    expect(remaining).toBeGreaterThan(1.5);
    expect(remaining).toBeLessThan(2.0);

    // Next tickCosmetic with a normal dt drains another step from residual
    loop.tickCosmetic(FIXED_TIMESTEP);
    const remaining2 = loop.getCosmeticLead();
    expect(remaining2).toBeLessThan(remaining);
  });

  it('tickCosmetic with normal dt below COSMETIC_INTERVAL accumulates without firing', () => {
    const { loop } = createLoop();
    loop.getState().phase = 'playing';

    // FIXED_TIMESTEP alone is below COSMETIC_INTERVAL (which is 2x FT)
    loop.tickCosmetic(FIXED_TIMESTEP);
    expect(loop.getCosmeticLead()).toBeCloseTo(FIXED_TIMESTEP, 5);

    // Second tick crosses the threshold — leftover stays around 0
    loop.tickCosmetic(FIXED_TIMESTEP);
    expect(loop.getCosmeticLead()).toBeCloseTo(0, 5);
  });

  it('tickCosmetic ignores NaN / Infinity / non-positive dt without poisoning state', () => {
    // Without the guard, NaN propagates to _cosmeticLead and every subsequent
    // comparison returns false — silently disabling all SFX/particles for the
    // rest of the session. Regression for the dt-poisoning class of bug.
    const { loop } = createLoop();
    loop.getState().phase = 'playing';

    const initial = loop.getCosmeticLead();
    loop.tickCosmetic(NaN);
    loop.tickCosmetic(Infinity);
    loop.tickCosmetic(-0.5);
    loop.tickCosmetic(0);
    expect(loop.getCosmeticLead()).toBe(initial);
    expect(Number.isFinite(loop.getCosmeticLead())).toBe(true);

    // Subsequent normal tick still works correctly.
    loop.tickCosmetic(FIXED_TIMESTEP);
    expect(Number.isFinite(loop.getCosmeticLead())).toBe(true);
    expect(loop.getCosmeticLead()).toBeCloseTo(FIXED_TIMESTEP, 5);
  });

  it('setPhase("playing") re-primes cosmetic baselines so the next cosmeticStep does not fire spurious jump SFX', () => {
    // Without the baseline reprime, prev-state captured at construction
    // (phase=loading, players idle, score=0) would compare against the first
    // playing-phase cosmeticStep where players may already be moving (e.g.
    // the host's countdown ran before the snapshot reached the guest), and
    // fire spurious jump/land/score SFX.
    const { loop } = createLoop();
    const state = loop.getState();

    // Mutate state to simulate "host countdown advanced before phase flip" —
    // player is now airborne with vy. This is what prev-state would compare
    // against if no baseline reset happened.
    const p = state.players[0];
    p.state = 'airborne';
    p.vy = -400;

    vi.mocked(audio.play).mockClear();
    loop.setPhase('playing');
    loop.cosmeticStep(FIXED_TIMESTEP);

    // No 'jump' sound: baseline was reset to current state in setPhase, so
    // the prev=airborne / cur=airborne comparison sees no transition.
    const playCalls = vi.mocked(audio.play).mock.calls.map(c => c[0]);
    expect(playCalls).not.toContain('jump');
  });
});

// ===================================================================
// Arena ambient loops are gated on setPhase('playing'), not start()
// ===================================================================

describe('arena ambient loops are gated on setPhase("playing")', () => {
  // Volcano arena has amb_lava as a continuous ambient loop. If start() starts
  // the arena ambient loops, this sound plays during the loading phase — which
  // is wrong: the plan intent is that NO audio plays until we leave loading.
  it('start() does NOT play volcano amb_lava (ambient loops gated on setPhase)', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.mocked(audio.play).mockClear();

    const { loop } = createLoop({ arena: { themeId: 'volcano' } });
    loop.start();

    const calls = vi.mocked(audio.play).mock.calls.map(c => c[0]);
    expect(calls).not.toContain('amb_lava');
  });

  it('setPhase("playing") starts volcano amb_lava', () => {
    vi.mocked(audio.play).mockClear();

    const { loop } = createLoop({ arena: { themeId: 'volcano' } });
    loop.setPhase('playing');

    const calls = vi.mocked(audio.play).mock.calls.map(c => c[0]);
    expect(calls).toContain('amb_lava');
  });
});

// ===================================================================
// cosmeticStep gating on phase
// ===================================================================

describe('cosmeticStep gating on phase', () => {
  it('cosmeticStep during "loading" returns early (no particle/environment update)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    state.phase = 'loading';

    // Seed a player state transition that would normally fire a sound/particle
    // on cosmeticStep (grounded → airborne triggers jump sound).
    const player = state.players[0];
    player.state = 'idle';
    player.vy = 0;
    // Advance one step to establish prev-state baseline.
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Trigger transition: airborne. If cosmeticStep runs, it would fire 'jump'.
    player.state = 'airborne';
    player.vy = -400;
    loop.cosmeticStep(FIXED_TIMESTEP);

    // Phase is still 'loading' → cosmeticStep should early-return → no sound.
    expect(vi.mocked(audio.play)).not.toHaveBeenCalledWith('jump');
  });

  it('cosmeticStep during "playing" runs normally', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    state.phase = 'playing';

    // Establish prev-state: grounded
    const player = state.players[0];
    player.state = 'idle';
    player.vy = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    vi.mocked(audio.play).mockClear();

    // Transition: airborne
    player.state = 'airborne';
    player.vy = -400;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(vi.mocked(audio.play)).toHaveBeenCalledWith('jump');
  });
});

// ===================================================================
// getRenderer / getActiveCharacterNames
// ===================================================================

describe('GameLoop loading-phase accessors', () => {
  it('getRenderer returns the renderer instance', () => {
    const { loop } = createLoop();
    const r = loop.getRenderer();
    expect(r).toBeDefined();
  });

  it('getActiveCharacterNames returns one name per player', () => {
    const { loop } = createLoop({ players: ['P1', 'P2'] as PlayerSlot[] });
    const names = loop.getActiveCharacterNames();
    expect(names).toHaveLength(2);
    // Each name should be a non-empty string (character pack name)
    expect(names.every(n => typeof n === 'string' && n.length > 0)).toBe(true);
  });
});
