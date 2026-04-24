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
