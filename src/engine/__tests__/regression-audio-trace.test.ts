// src/engine/__tests__/regression-audio-trace.test.ts
//
// Regression-lock for SFX timing/sequencing during the headless-simulator
// refactor (Task 0.3). Records the sequence of audio.play() calls during a
// scripted 5-second match, then locks the trace via Vitest snapshot.
//
// After every refactor task, this test is re-run to verify SFX call order
// and count didn't change. If the snapshot diffs, the refactor altered
// observable audio behavior and must be investigated before regenerating.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { GameLoop } from '../gameLoop';
import { registerBuiltinCharacters } from '../characters/builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import { getArena } from '../arenas';
import { SeededRNG } from '../net/prng';
import { audio } from '../audio';
import type { InputState, MatchSettings, PlayerSlot } from '../types';
import { FIXED_TIMESTEP } from '../constants';

// Mock browser APIs that GameLoop touches at construction.
vi.mock('howler', () => ({
  Howl: vi.fn(function (this: { play: () => void; stop: () => void; volume: () => void; unload: () => void; on: () => void; once: () => void; playing: () => boolean }) {
    this.play = vi.fn();
    this.stop = vi.fn();
    this.volume = vi.fn();
    this.unload = vi.fn();
    this.on = vi.fn();
    this.once = vi.fn();
    this.playing = vi.fn(() => false);
    return this;
  }),
  Howler: { mute: vi.fn() },
}));

// Mock the audio module so GameLoop construction + fixedUpdate don't try to
// touch the real audio singleton (which has a Howler dependency at import).
// audio.play is the spy that captures the SFX trace.
vi.mock('../audio', () => ({
  audio: {
    init: vi.fn(), play: vi.fn(), playMusic: vi.fn(), stopMusic: vi.fn(),
    stop: vi.fn(), setMute: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(),
    stopAllGameSounds: vi.fn(), playMenuMusic: vi.fn(), playAnimal: vi.fn(),
    preloadArena: vi.fn(() => Promise.resolve()),
    hasPreloadedArena: vi.fn(() => true),
  },
}));

// Mock Renderer so we don't need a real canvas 2D context for these tests.
vi.mock('../renderer', () => ({
  Renderer: class MockRenderer {
    renderBackground = vi.fn();
    renderFrame = vi.fn();
    setBotNavDebugStates = vi.fn();
    setNetDebugStats = vi.fn();
    setPlayerNames = vi.fn();
    setTimeLimit = vi.fn();
    setNetworkMode = vi.fn();
    setConnectionQuality = vi.fn();
    warmSpriteCache = vi.fn();
    hasWarmedAll = vi.fn(() => true);
    getDiagnostics = vi.fn(() => ({ clouds: false, weather: false, wildlife: false, playersDrawn: 0 }));
    setRenderScale = vi.fn();
    destroy = vi.fn();
  },
}));

// Provide a 2d context stub so any direct getContext('2d') calls don't crash.
const mockCtx = {
  save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
  fill: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
  strokeRect: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  setTransform: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillText: vi.fn(), measureText: vi.fn(() => ({ width: 0 })),
  setLineDash: vi.fn(), quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(),
  ellipse: vi.fn(), strokeText: vi.fn(),
  fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
  font: '', textAlign: '', textBaseline: '', globalAlpha: 1, globalCompositeOperation: '',
};
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type === '2d') return mockCtx as unknown as CanvasRenderingContext2D;
  return origGetContext.call(this, type as never);
} as never;

beforeAll(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

beforeEach(() => {
  // Re-register is idempotent (registry uses overwrite semantics) and ensures
  // pack lookups never fail across test files that share the registry.
  registerBuiltinCharacters();
  registerBuiltinArenas();
  // Reset the audio.play spy (and all other vi.fn()s) so each test sees a
  // clean call trace. Without this, calls accumulate across tests in this file.
  vi.clearAllMocks();
});

/**
 * Run the scripted scenario and return the ordered list of sound names passed
 * to `audio.play()`. cosmeticStep is invoked after each fixedUpdate so all
 * SFX-triggering cosmetic systems (transitions, particles, etc.) run.
 */
function runAudioScenario(): string[] {
  const players: PlayerSlot[] = ['P1', 'P2'];
  const settings: MatchSettings = {
    killLimit: 16,
    timeLimit: 0,
    playerCount: players.length,
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
  };

  // Build a real Canvas instance so the Renderer-mock layer accepts it.
  const bg = document.createElement('canvas');
  const fg = document.createElement('canvas');
  bg.width = fg.width = 1280;
  bg.height = fg.height = 720;

  const arena = getArena('meadow');
  const rng = new SeededRNG(42); // deterministic seed → deterministic SFX trace

  const loop = new GameLoop(
    bg,
    fg,
    arena,
    settings,
    players,
    () => {}, // onMatchEnd
    undefined, // hudCanvas
    rng,
  );

  // Network mode: tells fixedUpdate to use the explicit `networkInputs` arg
  // instead of reading from its internal InputManager (which has no listeners attached in Node).
  loop.setNetworkMode(true);
  // Directly drive fixedUpdate. Set phase to 'playing' (test default is 'loading',
  // and cosmeticStep early-returns during 'loading').
  loop.getState().phase = 'playing';

  // Scripted inputs:
  //   P1: walks right for the first 60 frames; jumps every 20 frames.
  //   P2: stays still (no input).
  const getInput = (frame: number, slot: PlayerSlot): InputState => {
    if (slot === 'P1') {
      return {
        left: false,
        right: frame < 60,
        jump: frame % 20 === 0,
        down: false,
      };
    }
    return { left: false, right: false, jump: false, down: false };
  };

  // 300 frames = 5 seconds at 60Hz.
  for (let f = 0; f < 300; f++) {
    const inputs = new Map<string, InputState>();
    for (const slot of players) {
      inputs.set(slot, getInput(f, slot));
    }
    loop.fixedUpdate(FIXED_TIMESTEP, inputs);
    // Run cosmetic systems (per-tick, not half-rate) so transition-driven
    // SFX fire deterministically. This mirrors what tests in the project
    // already do (per CLAUDE.md: "Tests call cosmeticStep(FIXED_TIMESTEP)
    // directly to exercise the unthrottled per-tick behavior").
    loop.cosmeticStep(FIXED_TIMESTEP);
  }

  // Pull the captured trace from the audio.play spy.
  const playMock = audio.play as unknown as ReturnType<typeof vi.fn>;
  return playMock.mock.calls.map((args) => args[0] as string);
}

describe('regression: audio call trace', () => {
  it('locks the SFX call sequence for the 5s scripted scenario (refactor regression)', () => {
    const trace = runAudioScenario();

    // Sanity: jumps every 20 frames should produce at least some SFX.
    expect(trace.length).toBeGreaterThan(0);

    // Lock-in fixture: this snapshot is the regression baseline.
    // If this test fails after a refactor, INVESTIGATE before updating —
    // a diff means SFX timing/sequencing changed.
    expect(trace).toMatchSnapshot();
  });
});
