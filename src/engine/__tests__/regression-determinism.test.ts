// src/engine/__tests__/regression-determinism.test.ts
//
// Keystone regression-lock for the headless-simulator refactor (Task 0.2).
// Captures the simulation's deterministic-scenario fingerprint as a Vitest
// snapshot. After every refactor task, this test is re-run to verify
// observable behavior didn't change. If the snapshot diffs, the refactor
// changed simulation output and must be investigated before the snapshot
// is regenerated.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { GameLoop } from '../gameLoop';
import { registerBuiltinCharacters } from '../characters/builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import { getArena } from '../arenas';
import { SeededRNG } from '../net/prng';
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
});

/** Step `count` ticks with `getInput(frame, slot)` producing inputs per slot per frame. */
function runScenario(opts: {
  seed: number;
  arenaId: string;
  players: PlayerSlot[];
  count: number;
  getInput: (frame: number, slot: PlayerSlot) => InputState;
}): { kills: number; positions: Array<{ slot: PlayerSlot; x: number; y: number }>; phase: string } {
  const settings: MatchSettings = {
    killLimit: 16,
    timeLimit: 0,
    playerCount: opts.players.length,
    goreMode: false,
    arenaId: opts.arenaId,
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

  const arena = getArena(opts.arenaId);
  const rng = new SeededRNG(opts.seed); // deterministic seed → deterministic scenario

  const loop = new GameLoop(
    bg,
    fg,
    arena,
    settings,
    opts.players,
    () => {}, // onMatchEnd
    undefined, // hudCanvas
    rng,
  );

  // Network mode: tells fixedUpdate to use the explicit `networkInputs` arg
  // instead of reading from its internal KeyboardManager (which has no listeners attached in Node).
  loop.setNetworkMode(true);
  // Directly drive fixedUpdate. Set phase to 'playing' (test default is 'loading').
  loop.getState().phase = 'playing';

  for (let f = 0; f < opts.count; f++) {
    const inputs = new Map<string, InputState>();
    for (const slot of opts.players) {
      inputs.set(slot, opts.getInput(f, slot));
    }
    loop.fixedUpdate(FIXED_TIMESTEP, inputs);
  }

  const state = loop.getState();
  return {
    kills: state.killFeed.length,
    positions: state.players.map((p) => ({ slot: p.id, x: p.x, y: p.y })),
    phase: state.phase,
  };
}

describe('regression: determinism', () => {
  it('identical seed + inputs produce identical outcome (smoke)', () => {
    const scenario = {
      seed: 42,
      arenaId: 'meadow',
      players: ['P1', 'P2'] as PlayerSlot[],
      count: 600, // 10 seconds at 60Hz
      getInput: (frame: number, slot: PlayerSlot): InputState => {
        // P1 walks right, jumps every 30 frames.
        // P2 walks left, jumps every 45 frames (offset).
        if (slot === 'P1') {
          return { left: false, right: true, jump: frame % 30 === 0, down: false };
        }
        return { left: true, right: false, jump: frame % 45 === 0, down: false };
      },
    };

    const a = runScenario(scenario);
    const b = runScenario(scenario);

    expect(b).toEqual(a);
  });

  it('locks the deterministic-scenario fingerprint (refactor regression)', () => {
    const result = runScenario({
      seed: 42,
      arenaId: 'meadow',
      players: ['P1', 'P2'],
      count: 600,
      getInput: (frame, slot) => {
        if (slot === 'P1') return { left: false, right: true, jump: frame % 30 === 0, down: false };
        return { left: true, right: false, jump: frame % 45 === 0, down: false };
      },
    });

    // Lock-in fixture: this snapshot is the regression baseline.
    // If this test fails after a refactor, INVESTIGATE before updating —
    // any change here means observable simulation behavior changed.
    expect(result).toMatchSnapshot();
  });
});
