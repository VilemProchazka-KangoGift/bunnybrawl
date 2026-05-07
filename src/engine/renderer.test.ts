import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all rendering sub-modules before importing Renderer
vi.mock('./rendering', () => ({
  drawCarrot: vi.fn(),
  drawSpringMushroom: vi.fn(),
  drawThorn: vi.fn(),
  drawWeather: vi.fn(),
  drawParticles: vi.fn(),
  drawGibs: vi.fn(),
  drawGibShape: vi.fn(),
  drawConfetti: vi.fn(),
  drawFireworks: vi.fn(),
  drawWildlife: vi.fn(),
  drawSpringTrail: vi.fn(),
  drawHazardZone: vi.fn(),
  drawGhost: vi.fn(),
  drawLavaRock: vi.fn(),
  drawZeroGZone: vi.fn(),
  drawCurrentZone: vi.fn(),
  drawGeyser: vi.fn(),
  drawBouncyPlatformOverlay: vi.fn(),
  drawPigeonFlock: vi.fn(),
  drawDayNightCycle: vi.fn(),
  drawHUD: vi.fn(),
  drawCountdown: vi.fn(),
  drawConnectionQuality: vi.fn(),
  drawComboPopups: vi.fn(),
  invalidateHudCache: vi.fn(),
  isHudDirty: vi.fn(() => false),
  drawPlayer: vi.fn(),
  clearRenderingCaches: vi.fn(),
  warmSpriteCacheForCharacters: vi.fn(),
  clearArenaCaches: vi.fn(),
  drawSurfaceDecals: vi.fn(),
  drawRipples: vi.fn(),
}));

vi.mock('./rendering/players', () => ({
  setSpriteCacheScale: vi.fn(),
}));

vi.mock('./rendering/hud', () => ({
  setHudScale: vi.fn(),
}));

vi.mock('./themes/drawPrimitives', () => ({
  drawCloud: vi.fn(),
  drawHill: vi.fn(),
  drawPlatformMoss: vi.fn(),
}));

vi.mock('./navDebugOverlay', () => ({
  drawNavDebugOverlay: vi.fn(),
}));

vi.mock('./net/core/debugOverlay', () => ({
  drawNetDebugOverlay: vi.fn(),
}));

vi.mock('./debugFlags', () => ({
  debugFlags: { navDebugEnabled: false, netDebugEnabled: false },
}));

import { Renderer } from './renderer';
import type { RenderDiagnostics } from './renderer';
import { debugFlags } from './debugFlags';
import {
  drawCarrot, drawSpringMushroom, drawThorn,
  drawWeather, drawParticles, drawGibs, drawGibShape, drawConfetti, drawFireworks, drawWildlife, drawSpringTrail,
  drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock,
  drawDayNightCycle,
  drawHUD, drawCountdown,
  drawPlayer,
} from './rendering';
import { drawNavDebugOverlay } from './navDebugOverlay';
import { drawNetDebugOverlay } from './net/core/debugOverlay';

// ---- Canvas mock ----

function makeMockGradient() {
  return { addColorStop: vi.fn() };
}

function makeMockCtx() {
  return {
    fillStyle: '' as any,
    strokeStyle: '' as any,
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    createLinearGradient: vi.fn(() => makeMockGradient()),
    createRadialGradient: vi.fn(() => makeMockGradient()),
    drawImage: vi.fn(),
    canvas: { width: 1280, height: 720 },
  } as any;
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  const ctx = makeMockCtx();
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);
  return { canvas, ctx };
}

// ---- Theme mock ----

function makeTheme() {
  return {
    sky: { gradient: [{ offset: 0, color: '#87CEEB' }, { offset: 1, color: '#B0E0E6' }] },
    hills: [{ x: 200, baseY: 600, width: 300, height: 100, color: '#4A7C3F' }],
    ground: { color: '#4A7C3F', surfaceColor: '#5A8C4F', surfaceThickness: 4, grassBlades: { color: '#2D5025', spacing: 15, heightRange: [5, 12] } },
    platform: {
      groundTopColor: '#5A8C4F', groundBodyColor: '#4A7C3F',
      floatingTopColor: '#6A5C4F', floatingBodyColor: '#5A4C3F',
      floatingAccentColor: '#7A6C5F', drawMoss: true,
      customDraw: null,
    },
    clouds: { count: 3, color: '#fff', minSize: 30, maxSize: 60, minSpeed: 10, maxSpeed: 20, yRange: [30, 80] },
    weather: { type: 'leaves', count: 20 },
    fog: { color: '#AABBCC', sizeX: 40, sizeY: 15, opacity: 0.3 },
    ambientParticles: { colors: ['#FFD700', '#FF69B4'], count: 10, sizeRange: [1, 3], speedRange: [5, 15] },
    dayNight: { enabled: false },
    drawBackgroundNature: vi.fn(),
    drawForegroundNature: vi.fn(),
    drawFarBackground: vi.fn(),
    drawAnimatedBackground: null as any,
    pigeonConfig: null as any,
  } as any;
}

// ---- Arena mock ----

function makeArena() {
  return {
    id: 'test',
    platforms: [
      { x: 0, y: 660, width: 1280, height: 60, isGround: true },
      { x: 400, y: 500, width: 200, height: 20 },
    ],
    spawnPoints: [{ x: 200, y: 600 }],
    width: 1280, height: 720,
    hazardZones: null as any,
    effectZones: null as any,
    bouncyPlatforms: null as any,
    navData: null as any,
  } as any;
}

// ---- MatchState mock ----

function makeState(overrides?: any) {
  return {
    players: [
      {
        id: 'P1', active: true, state: 'idle', x: 200, y: 628, vx: 0, vy: 0,
        width: 32, height: 32, score: 0, character: { color: '#FF8800' },
        afterimages: [], invincibleTimer: 0, springTrailTimer: 0, renderOffsetX: 0, renderOffsetY: 0,
      },
      {
        id: 'P2', active: true, state: 'idle', x: 600, y: 628, vx: 0, vy: 0,
        width: 32, height: 32, score: 0, character: { color: '#0088FF' },
        afterimages: [], invincibleTimer: 0, springTrailTimer: 0, renderOffsetX: 0, renderOffsetY: 0,
      },
    ],
    weather: [],
    wildlife: null,
    timeElapsed: 5,
    matchOver: false,
    countdown: 0,
    hitstopZoom: 0,
    screenShake: 0,
    screenFlash: 0,
    dayPhase: 0,
    killFeed: [],
    carrots: [],
    springs: [],
    thorns: [],
    gibs: [],
    confetti: [],
    shockwaves: [],
    ghosts: [],
    lavaRocks: [],
    pigeonFlocks: [],
    fogParticles: null,
    pollenParticles: null,
    geyserStates: [],
    bouncyWobble: new Map(),
    // scatterFlocks defaulted here as a workaround — the production state
    // factory in `simulator/initialState.ts` populates it, but this mock
    // pre-dates that field. Without the default, every test that exercises
    // `renderer.renderFrame` crashes on `for (const f of state.scatterFlocks)`.
    scatterFlocks: [],
    ...overrides,
  } as any;
}

// ---- Tests ----

describe('Renderer — construction', () => {
  it('creates with valid canvases and theme', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());
    expect(renderer).toBeDefined();
  });

  it('initializes clouds from theme config', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const theme = makeTheme();
    theme.clouds.count = 5;
    const renderer = new Renderer(bg, fg, theme);
    expect((renderer as any).clouds).toHaveLength(5);
  });

  it('handles mirrored mode', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme(), true);
    expect((renderer as any).mirrored).toBe(true);
  });
});

describe('Renderer — setters', () => {
  let renderer: Renderer;
  beforeEach(() => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    renderer = new Renderer(bg, fg, makeTheme());
  });

  it('setPlayerNames stores names', () => {
    renderer.setPlayerNames({ P1: 'Alice', P2: 'Bob' });
    expect((renderer as any)._playerNames).toEqual({ P1: 'Alice', P2: 'Bob' });
  });

  it('setTimeLimit stores time limit', () => {
    renderer.setTimeLimit(120);
    expect((renderer as any)._timeLimit).toBe(120);
  });

  it('setNetDebugStats stores stats', () => {
    const stats = { localFrame: 10, rtt: 50 } as any;
    renderer.setNetDebugStats(stats);
    expect((renderer as any)._netDebugStats).toBe(stats);
  });

  it('setBotNavDebugStates stores states', () => {
    const states = [{ slot: 'B1', x: 100, y: 200, navTarget: null }];
    renderer.setBotNavDebugStates(states);
    expect((renderer as any)._botNavDebugStates).toBe(states);
  });

  it('getDiagnostics returns diagnostic object', () => {
    const d = renderer.getDiagnostics();
    expect(d).toBeDefined();
    expect(typeof d.clouds).toBe('boolean');
    expect(typeof d.playersDrawn).toBe('number');
  });
});

describe('Renderer — renderBackground', () => {
  it('draws sky gradient, hills, platforms, and ground', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());

    renderer.renderBackground(makeArena());

    expect(bgCtx.createLinearGradient).toHaveBeenCalled();
    expect(bgCtx.fillRect).toHaveBeenCalled();
  });

  it('calls theme.drawFarBackground when defined', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const theme = makeTheme();
    const renderer = new Renderer(bg, fg, theme);

    renderer.renderBackground(makeArena());
    expect(theme.drawFarBackground).toHaveBeenCalled();
  });

  it('draws grass blades when theme enables them', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());

    renderer.renderBackground(makeArena());
    expect(bgCtx.stroke).toHaveBeenCalled(); // grass blade strokes
  });

  it('applies mirror transform when mirrored', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme(), true);

    renderer.renderBackground(makeArena());
    expect(bgCtx.scale).toHaveBeenCalledWith(-1, 1);
  });

  it('draws floating platform with accent color and moss', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());

    renderer.renderBackground(makeArena());
    // Multiple fillRect calls for ground + floating platforms
    expect(bgCtx.fillRect.mock.calls.length).toBeGreaterThan(3);
  });

  it('uses customDraw when platform theme provides it', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const theme = makeTheme();
    theme.platform.customDraw = vi.fn();
    const renderer = new Renderer(bg, fg, theme);

    renderer.renderBackground(makeArena());
    expect(theme.platform.customDraw).toHaveBeenCalled();
  });
});

describe('Renderer — renderFrame basics', () => {
  let renderer: Renderer;
  let fgCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const { canvas: bg } = makeCanvas();
    const fg = makeCanvas();
    fgCtx = fg.ctx;
    renderer = new Renderer(bg.canvas ?? bg as any, fg.canvas, makeTheme());
  });

  it('clears foreground canvas each frame', () => {
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(fgCtx.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
  });

  it('draws HUD every frame', () => {
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(drawHUD).toHaveBeenCalled();
  });

  it('draws players', () => {
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(drawPlayer).toHaveBeenCalledTimes(2); // P1 + P2
    expect(renderer.getDiagnostics().playersDrawn).toBe(2);
  });

  it('skips inactive players', () => {
    const state = makeState();
    state.players[1].active = false;
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().playersDrawn).toBe(1);
  });

  it('skips respawning players', () => {
    const state = makeState();
    state.players[0].state = 'respawning';
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().playersDrawn).toBe(1);
  });

  it('sets clouds diagnostic flag', () => {
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(renderer.getDiagnostics().clouds).toBe(true);
  });
});

describe('Renderer — renderFrame conditional branches', () => {
  let renderer: Renderer;

  beforeEach(() => {
    vi.clearAllMocks();
    const { canvas: bg } = makeCanvas();
    const fg = makeCanvas();
    renderer = new Renderer(bg.canvas ?? bg as any, fg.canvas, makeTheme());
  });

  it('draws weather when particles present', () => {
    const state = makeState({ weather: [{ x: 100, y: 200 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawWeather).toHaveBeenCalled();
    expect(renderer.getDiagnostics().weather).toBe(true);
  });

  it('draws wildlife when present', () => {
    const state = makeState({ wildlife: [{ x: 100, y: 200 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawWildlife).toHaveBeenCalled();
    expect(renderer.getDiagnostics().wildlife).toBe(true);
  });

  it('draws animated background when theme provides it', () => {
    const { canvas: bg } = makeCanvas();
    const fg = makeCanvas();
    const theme = makeTheme();
    theme.drawAnimatedBackground = vi.fn();
    const r = new Renderer(bg.canvas ?? bg as any, fg.canvas, theme);
    r.renderFrame(makeState(), makeArena(), []);
    expect(theme.drawAnimatedBackground).toHaveBeenCalled();
    expect(r.getDiagnostics().animatedBg).toBe(true);
  });

  it('draws hazard zones when arena has them', () => {
    const arena = makeArena();
    arena.hazardZones = [{ x: 100, y: 600, width: 200, height: 60 }];
    renderer.renderFrame(makeState(), arena, []);
    expect(drawHazardZone).toHaveBeenCalled();
    expect(renderer.getDiagnostics().hazardZones).toBe(true);
  });

  it('draws zero-G effect zones', () => {
    const arena = makeArena();
    arena.effectZones = [{ type: 'zero_g', x: 100, y: 200, width: 200, height: 200 }];
    renderer.renderFrame(makeState(), arena, []);
    expect(drawZeroGZone).toHaveBeenCalled();
    expect(renderer.getDiagnostics().effectZones).toBe(true);
  });

  it('draws current effect zones', () => {
    const arena = makeArena();
    arena.effectZones = [{ type: 'current', x: 100, y: 200, width: 200, height: 200 }];
    renderer.renderFrame(makeState(), arena, []);
    expect(drawCurrentZone).toHaveBeenCalled();
  });

  it('draws geyser effect zones', () => {
    const arena = makeArena();
    arena.effectZones = [{ type: 'geyser', x: 100, y: 200, width: 50, height: 300 }];
    const state = makeState({ geyserStates: [{ height: 100, speed: 200 }] });
    renderer.renderFrame(state, arena, []);
    expect(drawGeyser).toHaveBeenCalled();
  });

  it('draws bouncy platforms when arena has them', () => {
    const arena = makeArena();
    arena.bouncyPlatforms = [1]; // platform index 1
    renderer.renderFrame(makeState(), arena, []);
    expect(drawBouncyPlatformOverlay).toHaveBeenCalled();
    expect(renderer.getDiagnostics().bouncyPlatforms).toBe(true);
  });

  it('draws pigeon flocks when present', () => {
    const state = makeState({ pigeonFlocks: [{ x: 200, y: 100, active: true }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawPigeonFlock).toHaveBeenCalled();
    expect(renderer.getDiagnostics().pigeons).toBe(true);
  });

  it('draws active lava rocks', () => {
    const state = makeState({ lavaRocks: [{ active: true, x: 200, y: 100 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawLavaRock).toHaveBeenCalled();
    expect(renderer.getDiagnostics().lavaRocks).toBe(true);
  });

  it('skips inactive lava rocks', () => {
    const state = makeState({ lavaRocks: [{ active: false, x: 200, y: 100 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawLavaRock).not.toHaveBeenCalled();
  });

  it('draws springs and thorns', () => {
    const state = makeState({ springs: [{ x: 300, y: 600 }], thorns: [{ x: 500, y: 600 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawSpringMushroom).toHaveBeenCalled();
    expect(drawThorn).toHaveBeenCalled();
    const d = renderer.getDiagnostics();
    expect(d.springs).toBe(true);
    expect(d.thorns).toBe(true);
  });

  it('draws active carrots', () => {
    const state = makeState({ carrots: [{ active: true, x: 400, y: 400 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawCarrot).toHaveBeenCalled();
    expect(renderer.getDiagnostics().carrots).toBe(true);
  });

  it('draws gibs when present', () => {
    const state = makeState({ gibs: [{ x: 100, y: 100 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawGibs).toHaveBeenCalled();
    expect(renderer.getDiagnostics().gibs).toBe(true);
  });

  it('draws confetti when present', () => {
    const state = makeState({ confetti: [{ x: 100, y: 100 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawConfetti).toHaveBeenCalled();
    expect(renderer.getDiagnostics().confetti).toBe(true);
  });

  it('draws shockwaves when present', () => {
    const state = makeState({ shockwaves: [{ x: 400, y: 400, radius: 30, life: 0.5 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().shockwaves).toBe(true);
  });

  it('draws afterimages when player has them', () => {
    const state = makeState();
    state.players[0].afterimages = [{ x: 190, y: 620, alpha: 0.5 }];
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().afterimages).toBe(true);
  });

  it('uses hue-shifted hsl fillStyle for afterimages, not raw character color', () => {
    const state = makeState();
    state.players[0].afterimages = [
      { x: 190, y: 620, alpha: 0.3 },
      { x: 200, y: 620, alpha: 0.5 },
      { x: 210, y: 620, alpha: 0.7 },
    ];
    const seen: string[] = [];
    const ctx = renderer.getDiagnostics().ctx as CanvasRenderingContext2D;
    Object.defineProperty(ctx, 'fillStyle', {
      set(v) { seen.push(String(v)); },
      get() { return ''; },
      configurable: true,
    });
    renderer.renderFrame(state, makeArena(), []);
    const hslFills = seen.filter(s => s.startsWith('hsl('));
    const unique = new Set(hslFills);
    expect(hslFills.length).toBeGreaterThanOrEqual(3);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('draws fog particles when present', () => {
    const state = makeState({ fogParticles: [{ x: 100, y: 600, alpha: 0.5 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().fog).toBe(true);
  });

  it('draws ambient particles (pollen) when present', () => {
    const state = makeState({ pollenParticles: [{ x: 200, y: 300, size: 2, alpha: 0.5 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().ambient).toBe(true);
  });

  it('draws ghosts when present', () => {
    const state = makeState({ ghosts: [{ x: 300, y: 400 }] });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawGhost).toHaveBeenCalled();
  });

  it('draws fireworks when match is over', () => {
    const state = makeState({ matchOver: true });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawFireworks).toHaveBeenCalled();
    expect(renderer.getDiagnostics().fireworks).toBe(true);
  });

  it('draws day/night cycle when enabled', () => {
    const { canvas: bg } = makeCanvas();
    const fg = makeCanvas();
    const theme = makeTheme();
    theme.dayNight.enabled = true;
    const r = new Renderer(bg.canvas ?? bg as any, fg.canvas, theme);
    const state = makeState({ dayPhase: 0.5 });
    r.renderFrame(state, makeArena(), []);
    expect(drawDayNightCycle).toHaveBeenCalled();
    expect(r.getDiagnostics().dayNight).toBe(true);
  });

  it('draws countdown when countdown > 0', () => {
    const state = makeState({ countdown: 3 });
    renderer.renderFrame(state, makeArena(), []);
    expect(drawCountdown).toHaveBeenCalled();
    expect(renderer.getDiagnostics().countdown).toBe(true);
  });

  it('applies hitstop zoom when hitstopZoom > 0', () => {
    const state = makeState({ hitstopZoom: 0.05 });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().hitstop).toBe(true);
  });

  it('applies screen shake when screenShake > 0', () => {
    const state = makeState({ screenShake: 0.2 });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().screenShake).toBe(true);
  });

  it('draws screen flash when screenFlash > 0', () => {
    const state = makeState({ screenFlash: 0.3 });
    renderer.renderFrame(state, makeArena(), []);
    expect(renderer.getDiagnostics().screenFlash).toBe(true);
  });

  it('draws nav debug overlay when enabled', () => {
    (debugFlags as any).navDebugEnabled = true;
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(drawNavDebugOverlay).toHaveBeenCalled();
    expect(renderer.getDiagnostics().navDebug).toBe(true);
    (debugFlags as any).navDebugEnabled = false;
  });

  it('draws net debug overlay when enabled with stats', () => {
    (debugFlags as any).netDebugEnabled = true;
    renderer.setNetDebugStats({ localFrame: 10, rtt: 50 } as any);
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(drawNetDebugOverlay).toHaveBeenCalled();
    expect(renderer.getDiagnostics().netDebug).toBe(true);
    (debugFlags as any).netDebugEnabled = false;
  });

  it('does not draw net debug without stats even when flag enabled', () => {
    (debugFlags as any).netDebugEnabled = true;
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(drawNetDebugOverlay).not.toHaveBeenCalled();
    expect(renderer.getDiagnostics().netDebug).toBe(false);
    (debugFlags as any).netDebugEnabled = false;
  });

  it('draws spring trail for players with active trail', () => {
    const state = makeState();
    state.players[0].springTrailTimer = 0.5;
    renderer.renderFrame(state, makeArena(), []);
    expect(drawSpringTrail).toHaveBeenCalled();
  });

  it('draws zero-G shimmer for players in zero-G zone', () => {
    const arena = makeArena();
    arena.effectZones = [{ type: 'zero_g', x: 180, y: 600, width: 100, height: 100 }];
    const state = makeState();
    // Player at x=200, y=628 overlaps zone at x=180..280, y=600..700
    renderer.renderFrame(state, arena, []);
    expect(renderer.getDiagnostics().zeroGShimmer).toBe(true);
  });

  it('draws mirrored foreground nature', () => {
    const { canvas: bg } = makeCanvas();
    const fg = makeCanvas();
    const theme = makeTheme();
    const r = new Renderer(bg.canvas ?? bg as any, fg.canvas, theme, true);
    r.renderFrame(makeState(), makeArena(), []);
    expect(theme.drawForegroundNature).toHaveBeenCalled();
  });
});

describe('Renderer — bakeGibs', () => {
  it('draws gibs onto background canvas', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());
    const gibs = [{ x: 100, y: 200, rotation: 0.5, type: 'ear', width: 8, height: 6, color: '#FF0000' }];
    renderer.bakeGibs(gibs as any);
    expect(bgCtx.save).toHaveBeenCalled();
    expect(bgCtx.translate).toHaveBeenCalled();
    expect(bgCtx.rotate).toHaveBeenCalled();
    expect(drawGibShape).toHaveBeenCalled();
    expect(bgCtx.restore).toHaveBeenCalled();
  });
});

describe('Renderer — renderBloodDrips', () => {
  it('draws blood drips onto background canvas', () => {
    const { canvas: bg, ctx: bgCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());
    const drips = [{ x: 200, y: 300, radius: 3, color: '#880000' }];
    renderer.renderBloodDrips(drips);
    expect(bgCtx.arc).toHaveBeenCalled();
    expect(bgCtx.fill).toHaveBeenCalled();
  });
});

describe('Renderer — bgNight bake on bg writes', () => {
  it('bakeGibs marks bgNight dirty without baking eagerly', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: bgNight, ctx: bgNightCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const fgTint = document.createElement('div');
    const renderer = new Renderer(bg, fg, makeTheme(), false, undefined, bgNight, fgTint);
    const gibs = [{ x: 100, y: 200, rotation: 0.5, type: 'ear', width: 8, height: 6, color: '#FF0000' }];
    (bgNightCtx.drawImage as any).mockClear();
    renderer.bakeGibs(gibs as any);
    // Should NOT bake eagerly — just set the dirty flag.
    expect(bgNightCtx.drawImage).not.toHaveBeenCalled();
  });

  it('bakeGibs followed by renderFrame triggers exactly one bgNight bake', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: bgNight, ctx: bgNightCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const fgTint = document.createElement('div');
    const renderer = new Renderer(bg, fg, makeTheme(), false, undefined, bgNight, fgTint);
    const gibs = [{ x: 100, y: 200, rotation: 0.5, type: 'ear', width: 8, height: 6, color: '#FF0000' }];
    const drips = [{ x: 200, y: 300, radius: 3, color: '#880000' }];
    (bgNightCtx.drawImage as any).mockClear();

    // Coalesce: both bg-mutating paths fire same frame, ONE bake on next render.
    renderer.bakeGibs(gibs as any);
    renderer.renderBloodDrips(drips);
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(bgNightCtx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('renderFrame without prior bg writes does not bake', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: bgNight, ctx: bgNightCtx } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const fgTint = document.createElement('div');
    const renderer = new Renderer(bg, fg, makeTheme(), false, undefined, bgNight, fgTint);
    (bgNightCtx.drawImage as any).mockClear();
    renderer.renderFrame(makeState(), makeArena(), []);
    expect(bgNightCtx.drawImage).not.toHaveBeenCalled();
  });
});

describe('Renderer — blendColor', () => {
  it('blends two hex colors', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());
    const blended = (renderer as any).blendColor('#FF0000', '#0000FF', 0.5);
    expect(blended).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    // Should be purple-ish (128, 0, 128)
    expect(blended).toBe('rgb(128,0,128)');
  });

  it('returns first color at amount=0', () => {
    const { canvas: bg } = makeCanvas();
    const { canvas: fg } = makeCanvas();
    const renderer = new Renderer(bg, fg, makeTheme());
    const blended = (renderer as any).blendColor('#FF0000', '#0000FF', 0);
    expect(blended).toBe('rgb(255,0,0)');
  });
});
