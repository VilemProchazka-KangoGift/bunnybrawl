/**
 * Verifies that GameLoop.getInputAny() converts touch airborne-tap to fast-fall
 * using THIS side's view of the player state — even in network mode.
 *
 * Background: prior to this fix, network mode skipped the conversion and
 * relied on the host applying it via player.state. The host's view is delayed
 * by RTT/2 vs. the moment the user actually tapped, so a guest who tapped
 * jump while truly grounded would be silently converted to fast-fall (or vice
 * versa). The guest's local view of the player state is closer to "now" — it's
 * the same RTT/2 stale, but from the same direction the input is going.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MatchSettings, PlayerSlot } from '../types';

// Force isTouchPrimary() = true so GameLoop creates a TouchInputManager.
vi.mock('../touchDetect', () => ({
  isTouchPrimary: () => true,
}));

vi.mock('../audio', () => ({
  audio: {
    init: vi.fn(), play: vi.fn(), playMusic: vi.fn(), stopMusic: vi.fn(),
    stop: vi.fn(), setMute: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(),
    stopAllGameSounds: vi.fn(), playMenuMusic: vi.fn(), playAnimal: vi.fn(),
  },
}));

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
    getDiagnostics = vi.fn(() => ({ clouds: false, weather: false, wildlife: false, playersDrawn: 0 }));
  },
}));

vi.mock('howler', () => ({
  Howl: vi.fn(),
  Howler: { mute: vi.fn() },
}));

const mockCtx = {
  fillRect: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
  fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  scale: vi.fn(), drawImage: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
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
} as never;

import { GameLoop } from '../gameLoop';
import { makeArena } from './testHelpers';
import { registerBuiltinArenas } from '../arenas';
import { registerBuiltinCharacters } from '../characters';

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
      extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false,
      superBounce: false, mirrorArena: false, underwaterGravity: false,
    },
    ...overrides,
  };
}

let lastLoop: GameLoop | null = null;
function makeLoop(): GameLoop {
  const bg = document.createElement('canvas');
  const fg = document.createElement('canvas');
  bg.width = fg.width = 1280;
  bg.height = fg.height = 720;
  const loop = new GameLoop(
    bg, fg, makeArena(), makeSettings(),
    ['P1', 'P2'] as PlayerSlot[], vi.fn(),
  );
  loop.getState().phase = 'playing';
  lastLoop = loop;
  return loop;
}

describe('GameLoop.getInputAny touch airborne conversion', () => {
  beforeEach(() => {
    // Force isTouchPrimary cache reset by re-importing — simpler: mock
    // already returns true, so each loop gets a TouchInputManager.
  });

  afterEach(() => {
    lastLoop?.stop();
    lastLoop = null;
  });

  it('converts airborne jump-tap to fast-fall in network mode (uses local player state)', () => {
    const loop = makeLoop();
    loop.setNetworkMode(true);

    const touchInput = loop.getTouchInput();
    expect(touchInput).toBeTruthy();
    // Override the touch manager's getInputForPlayer so we can observe what
    // airborne flag the GameLoop passes to it.
    const spy = vi.spyOn(touchInput!, 'getInputForPlayer').mockReturnValue({
      left: false, right: false, jump: true, down: false,
    });

    // Set the touch player to airborne — the local view that should drive
    // the conversion.
    const touchPlayer = loop.getState().players.find(p => p.id === 'P1')!;
    touchPlayer.state = 'airborne';
    touchPlayer.vy = -200;

    loop.getInputAny();

    // The fix: getInputForPlayer should be called with airborne=true even in
    // network mode. Prior to the fix, network mode passed `false` here so the
    // conversion (jump→down) was deferred to the host.
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('passes airborne=false to touch manager when player is grounded (local view)', () => {
    const loop = makeLoop();
    loop.setNetworkMode(true);

    const touchInput = loop.getTouchInput();
    const spy = vi.spyOn(touchInput!, 'getInputForPlayer').mockReturnValue({
      left: false, right: false, jump: true, down: false,
    });

    const touchPlayer = loop.getState().players.find(p => p.id === 'P1')!;
    touchPlayer.state = 'idle';
    touchPlayer.vy = 0;

    loop.getInputAny();

    expect(spy).toHaveBeenCalledWith(false);
  });

  it('local mode also passes the airborne flag (no regression)', () => {
    const loop = makeLoop();
    // No setNetworkMode call — local mode default

    const touchInput = loop.getTouchInput();
    const spy = vi.spyOn(touchInput!, 'getInputForPlayer').mockReturnValue({
      left: false, right: false, jump: true, down: false,
    });

    const touchPlayer = loop.getState().players.find(p => p.id === 'P1')!;
    touchPlayer.state = 'airborne';
    touchPlayer.vy = -100;

    loop.getInputAny();

    expect(spy).toHaveBeenCalledWith(true);
  });
});
