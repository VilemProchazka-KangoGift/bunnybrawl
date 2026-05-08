/**
 * GameLoop.switchArena() tests — in-place arena swap used by the pause-menu
 * arena picker. Scores reset, phase flips to 'loading', systems are re-init'd
 * for the new arena, onPhaseChange fires.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { MatchSettings, PlayerSlot } from '../../types';

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
    setTheme = vi.fn();
    warmSpriteCache = vi.fn();
    emitLightBurst = vi.fn();
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
  return origGetContext.call(this, type as never);
} as typeof HTMLCanvasElement.prototype.getContext;

// Import after mocks are set up
import { GameLoop } from '../GameLoop';
import { registerBuiltinArenas, getArena } from '../../arenas';
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

function createLoop(arenaId = 'meadow', players: PlayerSlot[] = ['P1', 'P2']) {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 1280;
  bgCanvas.height = 720;
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = 1280;
  fgCanvas.height = 720;
  const arena = getArena(arenaId);
  const settings = makeSettings({ arenaId });
  const loop = new GameLoop(
    bgCanvas,
    fgCanvas,
    arena,
    settings,
    players,
    vi.fn(),
  );
  _lastLoop = loop;
  return loop;
}

// --- Setup ---

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

afterEach(() => {
  _lastLoop?.stop();
  _lastLoop = null;
  vi.clearAllMocks();
});

// ===================================================================
// switchArena behavior
// ===================================================================

describe('GameLoop.switchArena', () => {
  it('resets scores to 0 when switching arenas', () => {
    const loop = createLoop('meadow');
    loop.setPhase('playing');
    const state = loop.getState();
    state.players[0].score = 5;
    state.players[1].score = 3;

    loop.switchArena('volcano');

    expect(state.players[0].score).toBe(0);
    expect(state.players[1].score).toBe(0);
  });

  it('flips phase to "loading" on switch', () => {
    const loop = createLoop();
    loop.setPhase('playing');
    expect(loop.getState().phase).toBe('playing');

    loop.switchArena('volcano');

    expect(loop.getState().phase).toBe('loading');
  });

  it('fires onPhaseChange with "loading" on switch', () => {
    const loop = createLoop();
    loop.setPhase('playing');
    const cb = vi.fn();
    loop.setOnPhaseChange(cb);
    cb.mockClear();

    loop.switchArena('volcano');

    expect(cb).toHaveBeenCalledWith('loading');
  });

  it('calls audio.stopAllGameSounds() to stop prior music + ambient loops', () => {
    const loop = createLoop('volcano'); // volcano has amb_lava ambient loop
    loop.setPhase('playing');
    vi.mocked(audio.stopAllGameSounds).mockClear();

    loop.switchArena('meadow');

    expect(audio.stopAllGameSounds).toHaveBeenCalled();
  });

  it('resets timeElapsed and countdown to initial values', () => {
    const loop = createLoop();
    loop.setPhase('playing');
    // Advance a few ticks — countdown decrements, timeElapsed grows
    for (let i = 0; i < 5; i++) loop.fixedUpdate(1 / 60);

    loop.switchArena('volcano');

    const state = loop.getState();
    expect(state.timeElapsed).toBe(0);
    expect(state.countdown).toBe(3); // MATCH_COUNTDOWN
    expect(state.matchOver).toBe(false);
    expect(state.winner).toBeNull();
  });

  it('clears per-match entity arrays (carrots, springs, thorns, killFeed)', () => {
    const loop = createLoop();
    loop.setPhase('playing');
    const state = loop.getState();
    state.carrots.push({ x: 100, y: 200, active: true, spawnTime: 0 });
    state.springs.push({
      x: 100, y: 200, platformIndex: 0, bounceTimer: 0, life: 1, growTimer: 0,
    });
    state.thorns.push({
      x: 100, y: 200, width: 20, height: 20, platformIndex: 0,
      life: 1, growTimer: 0, hit: false,
    });
    state.killFeed.push({ attacker: 'P1', victim: 'P2', timestamp: 0 });

    loop.switchArena('volcano');

    expect(state.carrots).toHaveLength(0);
    expect(state.springs).toHaveLength(0);
    expect(state.thorns).toHaveLength(0);
    expect(state.killFeed).toHaveLength(0);
  });

  it('respawns players at new arena spawn points', () => {
    const loop = createLoop('meadow');
    loop.setPhase('playing');
    const state = loop.getState();
    const meadowP1x = state.players[0].x;

    loop.switchArena('volcano');

    // Volcano has different spawn points than meadow. createInitialPlayers
    // centers the player's top-left x on (spawn.x - width/2), so allow a small
    // PLAYER_WIDTH/2 offset when comparing.
    const volcanoArena = getArena('volcano');
    const spawnX = volcanoArena.spawnPoints[0].x;
    expect(state.players[0].x).toBeCloseTo(spawnX - state.players[0].width / 2, 0);
    // And positions should not equal the old ones (unless by coincidence; volcano/meadow differ)
    expect(state.players[0].x).not.toBe(meadowP1x);
  });

  it('swaps the renderer theme', () => {
    const loop = createLoop('meadow');
    const renderer = loop.getRenderer();
    loop.setPhase('playing');
    vi.mocked(renderer.setTheme).mockClear();

    loop.switchArena('volcano');

    expect(renderer.setTheme).toHaveBeenCalled();
  });

  it('is idempotent w.r.t. setPhase — calling setPhase("playing") after switch starts music again', () => {
    const loop = createLoop('meadow');
    loop.setPhase('playing');
    loop.switchArena('volcano');
    vi.mocked(audio.playMusic).mockClear();

    loop.setPhase('playing');

    // Music for new arena should be triggered
    expect(audio.playMusic).toHaveBeenCalled();
  });
});
