/**
 * Tests for GameLoop.getPlayerInput dispatch — wiring the unified PlayerInput
 * abstraction. Every input source (keyboard, AI bot, network remote, touch) is
 * a PlayerInput in the simulator's playerInputs map. The per-tick context
 * (`PlayerInputContext`) carries network input buffer + local-touch airborne
 * flag.
 *
 * Strategy: uses a thin internal `getPlayerInputForTest` forwarder on GameLoop
 * to assert each dispatch branch directly, rather than driving full fixedUpdate
 * ticks. End-to-end behavior is covered by the regression-determinism and
 * regression-audio-trace snapshots.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { MatchSettings, PlayerSlot, InputState } from '../../types';

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
    setNetworkMode = vi.fn();
    setConnectionQuality = vi.fn();
    warmSpriteCache = vi.fn();
    emitLightBurst = vi.fn();
    getDiagnostics = vi.fn(() => ({ clouds: false, weather: false, wildlife: false, playersDrawn: 0 }));
    setRenderScale = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('howler', () => ({
  Howl: vi.fn(),
  Howler: { mute: vi.fn() },
}));

// Mock canvas getContext since happy-dom may not support Canvas 2D.
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

// Import after mocks are set up.
import { GameLoop } from '../GameLoop';
import { registerBuiltinArenas, getArena } from '../../arenas';
import { registerBuiltinCharacters } from '../../characters';
import { assignBotCharacters } from '../../characters/defaults';
import { KeyboardInput } from '../../input/KeyboardInput';
import { RuleBasedBot } from '../../input/RuleBasedBot';

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

function createLoop(arenaId = 'meadow', players: PlayerSlot[] = ['P1', 'B1']) {
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 1280;
  bgCanvas.height = 720;
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = 1280;
  fgCanvas.height = 720;
  // Bot characters must be assigned before constructing the loop with bots.
  const humans = players.filter((s): s is 'P1' | 'P2' | 'P3' | 'P4' | 'P5' => !s.startsWith('B'));
  const bots = players.filter((s): s is 'B1' | 'B2' | 'B3' | 'B4' | 'B5' => s.startsWith('B'));
  if (bots.length > 0) assignBotCharacters(humans, bots);
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
// Dispatch branches
// ===================================================================

describe('GameLoop.getPlayerInput dispatch', () => {
  it('routes to RemoteInput in network mode (returns buffered input verbatim)', () => {
    const loop = createLoop();
    loop.setNetworkMode(true);
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'idle';
    const netInput: InputState = { left: false, right: true, jump: false, down: false };
    const networkInputs = new Map<string, InputState>([['P1', netInput]]);

    const result = loop.getPlayerInputForTest(player, networkInputs);

    expect(result).toBe(netInput);
  });

  it('converts jump→down (fast-fall) for an airborne player in network mode', () => {
    const loop = createLoop();
    loop.setNetworkMode(true);
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'airborne';
    const netInput: InputState = { left: true, right: false, jump: true, down: false };
    const networkInputs = new Map<string, InputState>([['P1', netInput]]);

    const result = loop.getPlayerInputForTest(player, networkInputs);

    expect(result).toEqual({ left: true, right: false, jump: false, down: true });
  });

  it('RemoteInput returns all-false when networkInputs has no entry for the slot', () => {
    const loop = createLoop();
    loop.setNetworkMode(true);
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'idle';

    const networkInputs = new Map<string, InputState>([
      ['P2', { left: false, right: false, jump: false, down: false }],
    ]);
    const result = loop.getPlayerInputForTest(player, networkInputs);

    expect(result).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('a registered stub PlayerInput overrides the default KeyboardInput in local mode', () => {
    const loop = createLoop();
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'idle';
    const stubAction: InputState = { left: false, right: false, jump: true, down: false };
    const stub = { slot: 'P1' as PlayerSlot, getAction: vi.fn(() => stubAction) };
    loop.getSimulator().setPlayerInput('P1', stub);

    const result = loop.getPlayerInputForTest(player);

    expect(result).toBe(stubAction);
    expect(stub.getAction).toHaveBeenCalledTimes(1);
  });

  it('uses touch input when the player is the touch slot', () => {
    const loop = createLoop();
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'idle';
    const touchOut: InputState = { left: true, right: false, jump: false, down: false };
    const stubTouch = {
      getInputForPlayer: vi.fn((airborne: boolean) => ({ ...touchOut, _airborne: airborne } as unknown as InputState)),
    };
    // Simulate construction-time touch wiring (only applied on touch-primary devices).
    loop.getSimulator().setTouchInput(stubTouch, 'P1');

    const result = loop.getPlayerInputForTest(player);

    expect(stubTouch.getInputForPlayer).toHaveBeenCalledWith(false);
    // The returned object came from the touch stub.
    expect(result).toMatchObject({ left: true, right: false, jump: false, down: false });
  });

  it('passes airborne=true to touch when player.state === "airborne"', () => {
    const loop = createLoop();
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'airborne';
    const stubTouch = {
      getInputForPlayer: vi.fn(() => ({ left: false, right: false, jump: false, down: false } as InputState)),
    };
    loop.getSimulator().setTouchInput(stubTouch, 'P1');

    loop.getPlayerInputForTest(player);

    expect(stubTouch.getInputForPlayer).toHaveBeenCalledWith(true);
  });

  it('uses KeyboardInput for human slots without network/touch override', () => {
    const loop = createLoop();
    const pi = loop.getPlayerInputs().get('P1');
    expect(pi).toBeInstanceOf(KeyboardInput);
    expect(pi!.slot).toBe('P1');

    // Spy on getAction to confirm dispatch routes through it.
    const spy = vi.spyOn(pi!, 'getAction');
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    player.state = 'idle';

    loop.getPlayerInputForTest(player);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(loop.getState());
  });

  it('uses RuleBasedBot for bot slots without network override', () => {
    const loop = createLoop('meadow', ['P1', 'B1']);
    const pi = loop.getPlayerInputs().get('B1');
    expect(pi).toBeInstanceOf(RuleBasedBot);
    expect(pi!.slot).toBe('B1');

    // Replace getAction so we can detect the dispatch without involving the AIController.
    const stubAction: InputState = { left: false, right: true, jump: false, down: false };
    const spy = vi.spyOn(pi!, 'getAction').mockReturnValue(stubAction);
    const player = loop.getState().players.find(p => p.id === 'B1')!;

    const result = loop.getPlayerInputForTest(player);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toBe(stubAction);
  });

  it('returns all-false fallback when player has no entry in playerInputs (defensive)', () => {
    const loop = createLoop();
    const player = loop.getState().players.find(p => p.id === 'P1')!;
    // Defensive: drop the entry and verify the empty-input fallback. The
    // simulator's playerInputs is a Map; deleting via its setPlayerInput API
    // requires a value, so reach in and drop the entry directly.
    const sim = loop.getSimulator() as unknown as { _playerInputs: Map<PlayerSlot, unknown> };
    sim._playerInputs.delete('P1');

    const result = loop.getPlayerInputForTest(player);

    expect(result).toEqual({ left: false, right: false, jump: false, down: false });
  });
});

// ===================================================================
// switchArena propagates the new arena to every RuleBasedBot
// ===================================================================

describe('GameLoop.switchArena PlayerInput propagation', () => {
  it('updates each RuleBasedBot to point at the new arena', () => {
    const loop = createLoop('meadow', ['P1', 'B1', 'B2']);
    loop.setPhase('playing');

    // Capture the bot inputs and confirm they target the initial arena.
    const initialArena = loop.getArena();
    const bots = Array.from(loop.getPlayerInputs().values()).filter(
      (pi): pi is RuleBasedBot => pi instanceof RuleBasedBot,
    );
    expect(bots.length).toBe(2);
    for (const bot of bots) {
      expect((bot as unknown as { arena: unknown }).arena).toBe(initialArena);
    }

    loop.switchArena('volcano');

    const newArena = loop.getArena();
    expect(newArena).not.toBe(initialArena);
    // Same RuleBasedBot instances; arena reference updated via setArena().
    for (const bot of bots) {
      expect((bot as unknown as { arena: unknown }).arena).toBe(newArena);
    }
  });
});
