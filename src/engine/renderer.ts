import type { Arena, MatchState, Particle, Platform, Player, PlayerSlot, Gib, Ctx2D } from './types';
import type { ThemeConfig } from './themes/types';
import { aabbOverlap } from './physics';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SCREEN_SHAKE_INTENSITY,
  SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  HITSTOP_DURATION, HITSTOP_ZOOM,
} from './constants';
import {
  drawHill, drawPlatformMoss,
  capFrontY, capBackY, skewPx,
} from './themes/drawPrimitives';
import { hexToRGB, hexToHSL, blendRgb } from './fastMath';
import { debugFlags } from './debugFlags';
import { drawNavDebugOverlay } from './navDebugOverlay';
import type { BotNavDebugState } from './navDebugOverlay';
import { drawNetDebugOverlay } from './net/core/debugOverlay';
import type { NetDebugStats } from './net/core/debugOverlay';
import { drawFpsCounter } from './fpsCounter';

// Extracted rendering modules
import {
  drawCarrot, drawSpringMushroom, drawThorn,
  drawWeather, drawParticles, drawGibs, drawGibShape, drawConfetti, drawFireworks, drawWildlife, drawSpringTrail,
  drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock, drawScatterFlock,
  drawDayNightCycle, computeNightIntensity, fireflyPosition, FIREFLY_COUNT,
  drawHUD, drawCountdown, drawConnectionQuality, drawComboPopups, invalidateHudCache, isHudDirty,
  drawPlayer,
  warmSpriteCacheForCharacters,
  clearRenderingCaches,
  clearArenaCaches,
  drawSurfaceDecals, drawRipples,
} from './rendering';
import { setSpriteCacheScale } from './rendering/players';
import { setHudScale, setHudLanguage, warmHudFonts } from './rendering/hud';
import { applyRenderScaleToCanvas, getRenderScale } from './renderScale';
import { Lighting } from './lighting';
import type { Light, PointLight, RGB } from './lighting';
import { getArenaLights } from './arenas/operations';
import { swapRemove, makeDtTracker } from './themes/utils';
import { getBrightness } from './lighting/brightness';
import { getSlowDevice } from './perfFlags';
import { perfTrace } from './perfTrace';
import { getReactiveKind } from './gameLoop/cosmetics/reactiveDecorations';
import { getWildlifeKind } from './gameLoop/cosmetics/wildlife';

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

const _nearCarrotSet = new Set<PlayerSlot>();
const _isoOccluders: Platform[] = [];

/** Memoized hex→HSL for character colors. Bounded by character pack count (≤17). */
const _hslCache = new Map<string, { h: number; s: number; l: number }>();
function getCachedHsl(hex: string): { h: number; s: number; l: number } {
  let v = _hslCache.get(hex);
  if (!v) { v = hexToHSL(hex); _hslCache.set(hex, v); }
  return v;
}
const _invincibleHsl = getCachedHsl('#88BBFF');

/** Warm-orange tint used for the per-carrot glow emitter. Frozen + shared
 *  across all carrots — the renderer never mutates it. */
const CARROT_GLOW_RGB: Readonly<{ r: number; g: number; b: number }> =
  { r: 255, g: 180, b: 80 };
/** Seconds of bright pulse on carrot spawn before settling to baseline. */
const CARROT_SPAWN_FLASH_S = 0.6;

/** Yellow-green firefly emitter color, matches the visual draw in effects.ts. */
const FIREFLY_GLOW_RGB: Readonly<{ r: number; g: number; b: number }> =
  { r: 170, g: 255, b: 68 };
/** Reused scratch for fireflyPosition fills (avoids per-firefly alloc). */
const _fireflyPos = { x: 0, y: 0 };
/** Pre-built per-firefly flicker configs — distinct seeds so they pulse
 *  independently. Length follows FIREFLY_COUNT by construction. */
const FIREFLY_FLICKER: ReadonlyArray<{ seed: number; amplitude: number }> =
  Array.from({ length: FIREFLY_COUNT }, (_, i) => ({ seed: 101 + i, amplitude: 0.12 }));

/** Transient additive flash emitted on spawn / stomp. Drawn on fg with
 *  `'lighter'` blend so visible at any dayPhase. Coords + color are baked at
 *  emission time (does NOT track entity motion — these effects last <1s). */
interface LightBurst {
  x: number;
  y: number;
  age: number;
  duration: number;
  peakIntensity: number;
  peakRadius: number;
  color: RGB;
  kind: 'spawn' | 'stomp';
}

/** Spawn flash — sin-bell envelope (slow ramp up + down). Wide soft halo, not
 *  a spotlight — gentle warmth around the respawn point that fades quietly. */
const SPAWN_BURST_DURATION = 2.5;
const SPAWN_BURST_PEAK_INTENSITY = 0.15;
const SPAWN_BURST_PEAK_RADIUS = 320;
const SPAWN_BURST_COLOR: RGB = { r: 255, g: 248, b: 220 };

/** Stomp flash — sharp peak, quick fade. Punchy hit-cue; intensity peaks
 *  past saturation on bright daytime pixels so the flash is unambiguous on
 *  any arena. */
const STOMP_BURST_DURATION = 0.4;
const STOMP_BURST_PEAK_INTENSITY = 1.6;
const STOMP_BURST_PEAK_RADIUS = 180;
const STOMP_BURST_COLOR: RGB = { r: 255, g: 230, b: 180 };

/** Sprite extends ~12 px above the bbox top for tall ears, horns, and gib pivots. */
const SPRITE_TOP_PAD = 12;

/** Constructor options. Required: bgCanvas + fgCanvas + theme. All others
 *  are optional; lobby and tests pass only the required three and stay on the
 *  source-over fillRect lighting fallback. L2 will add light-canvas fields. */
/** Canvas surfaces the Renderer accepts. OffscreenCanvas variants are used
 *  by the worker render harness; HTMLCanvasElement variants by the main
 *  thread. The drawing code is identical because Ctx2D unifies both ctx
 *  types — only the night-opacity DOM driving differs (see
 *  `nightOpacityCallback`). */
export type RendererCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface RendererOptions {
  bgCanvas: RendererCanvas;
  fgCanvas: RendererCanvas;
  theme: ThemeConfig;
  mirrored?: boolean;
  hudCanvas?: RendererCanvas;
  bgNightCanvas?: RendererCanvas;
  /** Main-thread DOM div whose `style.opacity` carries the multiply-blend night
   *  tint over fg. Worker-hosted Renderers can't see this DOM node — they
   *  receive a `nightOpacityCallback` instead. */
  fgNightTint?: HTMLDivElement;
  /** L2 emitter compositing layer (single screen-blend DOM sibling above
   *  fg-night-tint). Bakeoff history: `perf-runs/l2-emitter-comparison/REPORT.md`. */
  lightCanvas?: RendererCanvas;
  /** When set, the Renderer skips direct DOM `style.opacity` writes for the
   *  bgNight cross-fade and the fg night-tint, and forwards quantized values
   *  here instead. The worker hooks this and posts the values back to main,
   *  which sets the DOM styles on its side. Quantization is to 3 decimal
   *  places — same as the main-thread DOM path — so postMessage chatter is
   *  bounded to ~thousands per match in the worst case. */
  nightOpacityCallback?: (kind: 'bg' | 'fg', opacity: number) => void;
  /** Initial UI language for HUD character-name translations. Defaults to
   *  `'en'`. Worker-hosted Renderers receive this on init from main; main-
   *  hosted Renderers don't need it (they call `setLanguage` from i18n). */
  language?: string;
}

/** Public Renderer surface used by GameLoop, ParticleSystem.bakeToRenderer,
 *  matchLoading, and CharacterSelect. The class `Renderer` and the worker-
 *  proxy `RendererProxy` both implement this so GameLoop can hold either
 *  without branching. */
export interface IRenderer {
  setRenderScale(scale: number): void;
  setBotNavDebugStates(states: BotNavDebugState[]): void;
  setNetDebugStats(stats: NetDebugStats | null): void;
  setPlayerNames(names: Record<string, string>): void;
  setTimeLimit(timeLimit: number): void;
  setNetworkMode(isNetwork: boolean): void;
  setConnectionQuality(rtt: number, jitter: number): void;
  setLobbyOverlayFn(fn: ((ctx: Ctx2D) => void) | null): void;
  getDiagnostics(): RenderDiagnostics;
  warmSpriteCache(names: string[]): void;
  hasWarmedAll(names: string[]): boolean;
  setTheme(theme: ThemeConfig): void;
  renderBackground(arena: Arena, originalArena?: Arena): void;
  /** Pre-render HUD font/glyph combinations so the first in-match HUD
   *  draw doesn't JIT a 30+ms font-shaping pass. Called from
   *  matchLoading. */
  warmHudFonts(): void;
  emitLightBurst(x: number, y: number, kind: 'spawn' | 'stomp'): void;
  setArenaLights(lights: ReadonlyArray<Light>): void;
  bakeGibs(gibs: Gib[]): void;
  renderBloodDrips(drips: Array<{ x: number; y: number; radius: number; color: string }>): void;
  renderFrame(
    matchState: MatchState,
    arena: Arena,
    particles: Particle[],
    cosmeticLead?: number,
    reactive?: import('./gameLoop/cosmetics/reactiveDecorations').ReactiveRenderArg,
    wildlife?: import('./gameLoop/cosmetics/wildlife').WildlifeRenderArg,
  ): void;
}

/** Diagnostic flags tracking which rendering branches fired each frame. */
export interface RenderDiagnostics {
  clouds: boolean;
  weather: boolean;
  wildlife: boolean;
  animatedBg: boolean;
  hazardZones: boolean;
  effectZones: boolean;
  bouncyPlatforms: boolean;
  pigeons: boolean;
  lavaRocks: boolean;
  springs: boolean;
  thorns: boolean;
  carrots: boolean;
  gibs: boolean;
  confetti: boolean;
  shockwaves: boolean;
  afterimages: boolean;
  fog: boolean;
  ambient: boolean;
  fireworks: boolean;
  dayNight: boolean;
  countdown: boolean;
  navDebug: boolean;
  netDebug: boolean;
  screenFlash: boolean;
  hitstop: boolean;
  screenShake: boolean;
  zeroGShimmer: boolean;
  playersDrawn: number;
  /** @internal test-only — bypasses renderer state machine */
  ctx?: Ctx2D;
}

/**
 * Collect iso platforms whose 3D footprint overlaps the player's sprite
 * extent. Caller subtracts each via evenodd clip when drawing the player
 * (see addIsoPlatformPath). Reuses a module-level array to avoid per-frame
 * allocation; the result is consumed before the next call.
 */
function findIsoOccluders(player: Player, platforms: Platform[]): Platform[] {
  _isoOccluders.length = 0;
  const playerBottom = player.y + player.height;
  const playerSpriteTop = player.y - SPRITE_TOP_PAD;
  const playerRight = player.x + player.width;
  // Caller passes the pre-filtered iso-platforms array, so the inset check
  // doesn't need to repeat here.
  for (const plat of platforms) {
    if (playerBottom <= plat.y) continue;
    const platRight = plat.x + plat.width;
    if (playerRight <= plat.x || player.x >= platRight) continue;
    if (playerBottom <= capBackY(plat) || playerSpriteTop >= plat.y + plat.height) continue;
    _isoOccluders.push(plat);
  }
  return _isoOccluders;
}

/**
 * Trace the iso occluder silhouette — body (front rectangle) plus the cap's
 * LEFT diagonal extension only. The cap's right-side iso shift and the
 * right face are deliberately excluded: a player adjacent to the platform
 * on the right is in front of those surfaces, not behind them. The left
 * diagonal stays so a player approaching from the left whose ears poke up
 * into the cap region still appears behind the cap there. Five vertices,
 * clockwise from the cap's back-left; closePath traces the cap-left
 * diagonal back to start.
 */
function addIsoPlatformPath(ctx: Ctx2D, plat: Platform): void {
  const sp = skewPx();
  const cF = capFrontY(plat);
  const cB = capBackY(plat);
  const bottom = plat.y + plat.height;
  ctx.moveTo(plat.x + sp, cB);
  ctx.lineTo(plat.x + plat.width, cB);
  ctx.lineTo(plat.x + plat.width, bottom);
  ctx.lineTo(plat.x, bottom);
  ctx.lineTo(plat.x, cF);
  ctx.closePath();
}

function freshDiag(): RenderDiagnostics {
  return {
    clouds: false, weather: false, wildlife: false, animatedBg: false,
    hazardZones: false, effectZones: false, bouncyPlatforms: false, pigeons: false,
    lavaRocks: false, springs: false, thorns: false, carrots: false,
    gibs: false, confetti: false, shockwaves: false, afterimages: false,
    fog: false, ambient: false, fireworks: false, dayNight: false,
    countdown: false, navDebug: false, netDebug: false, screenFlash: false,
    hitstop: false, screenShake: false, zeroGShimmer: false, playersDrawn: 0,
  };
}

/** Write style.opacity if it changed at 3-decimal resolution. Returns the
 *  new quantized value so callers can cache it. Skips DOM writes during
 *  dayPhase plateaus (noon/midnight) and pause. */
function setQuantizedOpacity(el: HTMLElement, target: number, last: number): number {
  const q = Math.round(target * 1000) / 1000;
  if (q !== last) el.style.opacity = String(q);
  return q;
}

function resetDiag(d: RenderDiagnostics): void {
  d.clouds = false; d.weather = false; d.wildlife = false; d.animatedBg = false;
  d.hazardZones = false; d.effectZones = false; d.bouncyPlatforms = false; d.pigeons = false;
  d.lavaRocks = false; d.springs = false; d.thorns = false; d.carrots = false;
  d.gibs = false; d.confetti = false; d.shockwaves = false; d.afterimages = false;
  d.fog = false; d.ambient = false; d.fireworks = false; d.dayNight = false;
  d.countdown = false; d.navDebug = false; d.netDebug = false; d.screenFlash = false;
  d.hitstop = false; d.screenShake = false; d.zeroGShimmer = false; d.playersDrawn = 0;
}

export class Renderer implements IRenderer {
  private bgCanvas: RendererCanvas;
  private bgNightCanvas: RendererCanvas | null = null;
  private fgCanvas: RendererCanvas;
  private hudCanvas: RendererCanvas | null = null;
  private lighting: Lighting;
  // L2 emitter compositing — single screen-blend DOM sibling, static cache
  // baked once at arena-load + dynamic stamps per frame.
  private _lightCanvas: RendererCanvas | null = null;
  private _lightCtx: Ctx2D | null = null;
  /** Static contribution baked once per arena; blitted onto lightCanvas each frame. */
  private _lightStaticCache: OffscreenCanvas | null = null;
  /** Per-frame buffer for dynamic emitters. Pooled — `_synthesizeDynamicLights`
   *  reuses entries by index, growing on demand. Cleared by trimming `length`. */
  private _dynamicLights: Light[] = [];
  private _lastLightOpacity = -1;
  /** Transient additive light flashes (spawn / stomp). Drawn directly on the
   *  fg ctx with `'lighter'` blend so they're visible regardless of dayPhase
   *  — the lightCanvas opacity gate (which fades emitters out at noon) does
   *  not apply. Grows; entries swap-removed on expiry. */
  private _lightBursts: LightBurst[] = [];
  private _burstDt = makeDtTracker(0.1);
  private bgCtx: Ctx2D;
  private bgNightCtx: Ctx2D | null = null;
  private fgCtx: Ctx2D;
  private hudCtx: Ctx2D | null = null;
  // Foreground night-tint overlay; mix-blend-mode: multiply triggers Chromium
  // GPU layer promotion for the fg canvas (perf win on top of the visual win).
  private _fgNightTint: HTMLDivElement | null = null;
  // Cached last-written opacity per element, avoids per-frame style-string
  // churn during dayPhase plateaus (noon/midnight) and pause. Sentinel -1
  // works because actual opacity is in [0, 1].
  private _lastBgNightOpacity = -1;
  private _lastFgTintOpacity = -1;
  // Set once at construction; lets _driveBgNightOpacity early-out for
  // renderer instances with no DOM darkening (lobby, tests).
  private _hasDomDarkening = false;
  // Set by bg-mutating paths (bakeGibs, renderBloodDrips) so the night-bake
  // happens once at the next renderFrame instead of N times per kill.
  private _bgNightDirty = false;
  // Cached fg overlay (platform body faces drawn after players). Built once
  // per arena/scale change in renderBackground; one drawImage per frame
  // beats N×decorations-per-platform-per-frame.
  private _overlayCanvas: OffscreenCanvas | null = null;
  // True if any platform in the current arena has an iso phantom-strip inset.
  // When false, the per-player findIsoOccluders scan is skipped entirely
  // (lobby, non-iso arenas).
  private _arenaHasIsoOccluders = false;
  // Pre-filtered to only the iso-occluder platforms (those with collision
  // insets). Avoids checking leftCollisionInset/bottomCollisionInset on every
  // platform every player every frame.
  private _isoOccluderPlatforms: Platform[] = [];
  private _renderScale = 1;
  private _lastBgArena: Arena | null = null;
  private _lastBgOriginalArena: Arena | undefined;
  // Cached foreground decorations (drawForegroundNature output). Static per
  // match — refreshed only on arena change or render-scale change. The arena
  // ref doubles as a dirty marker since renderBackground() also fires on
  // splat-mark / gib bake events that don't change foreground content.
  private _fgNatureCache: OffscreenCanvas | null = null;
  private _fgNatureCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
  private _fgNatureCacheScale = 0;
  private _fgNatureCacheArena: Arena | null = null;
  private clouds: Cloud[] = [];
  private lastCloudTime = 0;
  private theme: ThemeConfig;
  private frameTime = 0; // cached performance.now() per frame

  private _fogRGB: { r: number; g: number; b: number } | null = null;
  private _ambientRGBs: { r: number; g: number; b: number }[] | null = null;
  private _ambientRGBStrings: string[] | null = null;

  private mirrored = false;
  private originalArena: Arena | null = null;  // un-mirrored arena for theme draw calls
  private _botNavDebugStates: BotNavDebugState[] = [];
  private _netDebugStats: NetDebugStats | null = null;
  private _playerNames: Record<string, string> | null = null;
  private _timeLimit: number = 0;
  private _diag: RenderDiagnostics = freshDiag();
  private _netRtt = 0;
  private _netJitter = 0;
  private _isNetworkMatch = false;

  // Overlay-layer dirty tracking (only used when hudCtx is set)
  private _overlayHadContent = false;
  private _overlayLastRtt = -1;
  private _overlayLastJitter = -1;

  // Lobby mode: when set, replaces the match-HUD/countdown/connection-quality
  // overlay path with a caller-supplied draw fn (see `setLobbyOverlayFn`).
  private _lobbyOverlayFn: ((ctx: Ctx2D) => void) | null = null;

  // Worker-mode hook: when set, the Renderer routes night-tint opacity values
  // here instead of writing to `style.opacity` directly. See RendererOptions.
  private _nightOpacityCallback: ((kind: 'bg' | 'fg', opacity: number) => void) | null = null;

  // Sprite-cache warm tracking — the cache itself is module-scoped and keyed
  // by name+state+animFrame+flags (no theme). setTheme() calls
  // clearRenderingCaches() so the invariant "warmed under current theme" is
  // maintained. Consumers use hasWarmedAll() to verify preload coverage.
  private _warmedNames: Set<string> = new Set();

  constructor(opts: RendererOptions) {
    clearRenderingCaches();
    this.bgCanvas = opts.bgCanvas;
    this.fgCanvas = opts.fgCanvas;
    // Cast: when the canvas is a union of HTMLCanvasElement | OffscreenCanvas,
    // TS resolves getContext('2d') to RenderingContext (any of its overloads).
    // Both concrete return types implement the drawing API we use.
    this.bgCtx = opts.bgCanvas.getContext('2d')! as Ctx2D;
    this.fgCtx = opts.fgCanvas.getContext('2d')! as Ctx2D;
    this._diag.ctx = this.fgCtx;
    this.theme = opts.theme;
    this.mirrored = opts.mirrored ?? false;

    if (opts.hudCanvas) {
      this.hudCanvas = opts.hudCanvas;
      this.hudCtx = opts.hudCanvas.getContext('2d')! as Ctx2D;
    }

    // Optional cross-fade night-variant BG canvas; see lighting/pipeline.ts.
    if (opts.bgNightCanvas) {
      this.bgNightCanvas = opts.bgNightCanvas;
      this.bgNightCtx = opts.bgNightCanvas.getContext('2d')! as Ctx2D;
    }
    if (opts.fgNightTint) {
      this._fgNightTint = opts.fgNightTint;
    }

    if (opts.lightCanvas) {
      this._lightCanvas = opts.lightCanvas;
      this._lightCtx = opts.lightCanvas.getContext('2d')! as Ctx2D;
    }

    if (opts.nightOpacityCallback) {
      this._nightOpacityCallback = opts.nightOpacityCallback;
    }
    if (opts.language) {
      setHudLanguage(opts.language);
    }

    // Apply initial render scale to all canvases (sets backing-store dims + ctx transform)
    this._renderScale = getRenderScale();
    this._applyScaleToCanvases();
    setSpriteCacheScale(this._renderScale);
    setHudScale(this._renderScale);

    this.initClouds();
    this.lighting = new Lighting(CANVAS_WIDTH, CANVAS_HEIGHT);

    // Lobby/tests with no DOM darkening stay on the source-over fillRect path.
    // Worker mode: bgNightCanvas is an OffscreenCanvas (no `.style`), but the
    // night-opacity flow runs through `_nightOpacityCallback` in that case.
    // Either DOM-driving path (direct or via callback) counts as darkening.
    this._hasDomDarkening = this.bgNightCanvas !== null
      || this._fgNightTint !== null
      || this._nightOpacityCallback !== null;
    this.lighting.ambient.setHasDomDarkening(this._hasDomDarkening);
  }

  private _applyScaleToCanvases(): void {
    const s = this._renderScale;
    applyRenderScaleToCanvas(this.bgCanvas, this.bgCtx, s);
    applyRenderScaleToCanvas(this.fgCanvas, this.fgCtx, s);
    if (this.bgNightCanvas && this.bgNightCtx) {
      applyRenderScaleToCanvas(this.bgNightCanvas, this.bgNightCtx, s);
    }
    if (this.hudCanvas && this.hudCtx) {
      applyRenderScaleToCanvas(this.hudCanvas, this.hudCtx, s);
    }
    if (this._lightCanvas && this._lightCtx) {
      applyRenderScaleToCanvas(this._lightCanvas, this._lightCtx, s);
    }
  }

  /**
   * Update the render scale. Resizes all backing stores, re-applies ctx transforms,
   * invalidates sprite + HUD caches, and re-draws the static background — baked
   * gibs and blood drips on the bg canvas are lost (acceptable for a rare event
   * like a fullscreen toggle or monitor swap).
   */
  setRenderScale(scale: number): void {
    if (scale === this._renderScale) return;
    this._renderScale = scale;
    this._applyScaleToCanvases();
    setSpriteCacheScale(scale);
    setHudScale(scale);
    this.lighting.resize(CANVAS_WIDTH, CANVAS_HEIGHT, scale);
    if (this._lastBgArena) {
      this.renderBackground(this._lastBgArena, this._lastBgOriginalArena);
    }
  }

  setBotNavDebugStates(states: BotNavDebugState[]): void {
    this._botNavDebugStates = states;
  }

  setNetDebugStats(stats: NetDebugStats | null): void {
    this._netDebugStats = stats;
  }

  setPlayerNames(names: Record<string, string>): void {
    this._playerNames = names;
    invalidateHudCache();
  }

  setTimeLimit(timeLimit: number): void {
    this._timeLimit = timeLimit;
  }

  setNetworkMode(isNetwork: boolean): void {
    this._isNetworkMatch = isNetwork;
  }

  setConnectionQuality(rtt: number, jitter: number): void {
    this._netRtt = rtt;
    this._netJitter = jitter;
  }

  /** Lobby-mode HUD callback. Receives a clean ctx each frame. Set null to disable. */
  setLobbyOverlayFn(fn: ((ctx: Ctx2D) => void) | null): void {
    this._lobbyOverlayFn = fn;
  }

  /** E2E diagnostic: which rendering branches fired last frame. */
  getDiagnostics(): RenderDiagnostics { return this._diag; }

  /** Pre-populate the sprite cache for the given character names. Called during
   *  the loading phase so the first visible frame doesn't hitch on cache misses.
   *  Passes `this.theme` so bubble-helmet arenas bake the helmet into the cached
   *  bitmap — otherwise cache-miss at render time poisons the cache without it. */
  warmSpriteCache(names: string[]): void {
    warmSpriteCacheForCharacters(names, this.theme);
    for (const name of names) this._warmedNames.add(name);
  }

  /** Pre-render every HUD font + size combination so the first in-match
   *  draw doesn't JIT a font-shaping pass. The fg ctx is the right
   *  surface — the off-screen probe coords sit far outside the visible
   *  region so this is invisible to the eye. */
  warmHudFonts(): void {
    warmHudFonts(this.fgCtx);
  }

  /** True when every name has been warmed under the current theme. Used by
   *  the loading orchestrator to verify sprite-cache coverage before flipping
   *  phase to 'playing'. Any name not yet warmed would cause first-frame jank. */
  hasWarmedAll(names: string[]): boolean {
    for (const name of names) {
      if (!this._warmedNames.has(name)) return false;
    }
    return true;
  }

  /** Swap the active theme without tearing down the renderer. Used by
   *  `GameLoop.switchArena()` for in-place arena changes. Resets cloud layout
   *  and derived color caches; leaves the sprite cache intact (the cache key
   *  includes a bubble-helmet bit, so cross-arena sprite reuse is safe). */
  setTheme(theme: ThemeConfig): void {
    this.theme = theme;
    this._fogRGB = null;
    this._ambientRGBs = null;
    this._ambientRGBStrings = null;
    this.initClouds();
    clearArenaCaches();
    invalidateHudCache();
    // Characters warmed under the old theme may have used different helmet
    // settings — force re-warm under the new theme (cheap: cache hits for
    // entries already keyed with the current helmet bit).
    this._warmedNames.clear();
  }

  /** Populate `this.clouds` from the current theme's cloud config. */
  private initClouds(): void {
    const cc = this.theme.clouds;
    this.clouds = [];
    for (let i = 0; i < cc.count; i++) {
      this.clouds.push({
        x: (i / cc.count) * CANVAS_WIDTH + Math.random() * 100,
        y: cc.yRange[0] + Math.random() * (cc.yRange[1] - cc.yRange[0]),
        size: cc.minSize + Math.random() * (cc.maxSize - cc.minSize),
        speed: cc.minSpeed + Math.random() * (cc.maxSpeed - cc.minSpeed),
      });
    }
  }

  renderBackground(arena: Arena, originalArena?: Arena): void {
    if (originalArena) this.originalArena = originalArena;
    this._lastBgArena = arena;
    this._lastBgOriginalArena = originalArena;
    this._isoOccluderPlatforms.length = 0;
    for (const p of arena.platforms) {
      if (p.leftCollisionInset != null || p.bottomCollisionInset != null) {
        this._isoOccluderPlatforms.push(p);
      }
    }
    this._arenaHasIsoOccluders = this._isoOccluderPlatforms.length > 0;
    const themeArena = this.originalArena ?? arena; // un-mirrored arena for theme draw calls
    const ctx = this.bgCtx;
    const theme = this.theme;

    // Sky gradient from theme
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    for (const stop of theme.sky.gradient) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Mirror transform for theme decorations (hardcoded + arena-relative positions)
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }

    // Hills from theme
    for (const hill of theme.hills) {
      ctx.fillStyle = hill.color;
      drawHill(ctx, hill.x, hill.baseY, hill.width, hill.height);
    }

    // Far background (distant scenery -- treelines, mountains)
    if (theme.drawFarBackground) {
      theme.drawFarBackground(ctx, themeArena);
    }

    if (this.mirrored) { ctx.restore(); }

    // Platforms (use mirrored arena data, no canvas transform needed)
    for (const plat of arena.platforms) {
      this.drawPlatform(ctx, plat, plat.y >= 650);
    }

    // Ground-top grass blades + surface line — packs that own drawPlatform render their own ground cap.
    if (!this.theme.drawPlatform) {
      const ground = arena.platforms[0];
      ctx.fillStyle = theme.ground.surfaceColor;
      ctx.fillRect(ground.x, ground.y, ground.width, theme.ground.surfaceThickness);

      // Grass blades (if enabled by theme)
      if (theme.ground.grassBlades) {
        const gb = theme.ground.grassBlades;
        ctx.strokeStyle = gb.color;
        ctx.lineWidth = 2;
        for (let x = 10; x < CANVAS_WIDTH; x += gb.spacing + Math.random() * (gb.spacing * 0.67)) {
          const h = gb.heightRange[0] + Math.random() * (gb.heightRange[1] - gb.heightRange[0]);
          ctx.beginPath();
          ctx.moveTo(x, ground.y);
          ctx.lineTo(x - 3, ground.y - h);
          ctx.stroke();
        }
      }
    }

    // Theme-specific background nature (pass original arena, canvas transform handles mirroring)
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    theme.drawBackgroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }

    this.buildPlatformOverlay(arena);
    // Foreground nature is also static per-arena — render once into an
    // OffscreenCanvas here so renderFrame can blit it instead of re-running
    // 20+ shape primitives per frame. Heavy arenas (meadow, winter_lake)
    // have ~25 fg decorations each.
    this._renderForegroundNatureCache(themeArena);
    // Bake night variant of bg into the cross-fade canvas (when wired). Cheap:
    // one drawImage + one fillRect per arena-load / render-scale change. CSS
    // opacity then drives the day↔night cross-fade per frame at ~0 GPU cost.
    this._bakeBgNightVariant();
    // L2 emitters: load the static catalog from the arena pack registry and
    // bake into the light cache. Empty for arenas without a `lights` field.
    this.setArenaLights(getArenaLights(arena.id));
  }

  /** Drive bgNight + fg-tint opacity from the lighting pipeline. Quantized
   *  writes skip the style assignment when night intensity is unchanged. */
  private _driveBgNightOpacity(): void {
    if (!this._hasDomDarkening) return;
    // When lighting is off, getBgNightOpacity() returns 0 and the quantized
    // writes short-circuit on equal values — no DOM writes after the initial
    // settle.
    const intensity = this.lighting.ambient.getBgNightOpacity();
    const fgIntensity = this.lighting.ambient.getFgTintOpacity(intensity);
    if (this._nightOpacityCallback) {
      // Worker path: forward to main; quantize here so the callback fires only
      // on real change.
      const bgQ = Math.round(intensity * 1000) / 1000;
      const fgQ = Math.round(fgIntensity * 1000) / 1000;
      if (bgQ !== this._lastBgNightOpacity) {
        this._nightOpacityCallback('bg', bgQ);
        this._lastBgNightOpacity = bgQ;
      }
      if (fgQ !== this._lastFgTintOpacity) {
        this._nightOpacityCallback('fg', fgQ);
        this._lastFgTintOpacity = fgQ;
      }
      return;
    }
    if (this.bgNightCanvas && 'style' in this.bgNightCanvas) {
      this._lastBgNightOpacity = setQuantizedOpacity(
        this.bgNightCanvas, intensity, this._lastBgNightOpacity);
    }
    if (this._fgNightTint) {
      this._lastFgTintOpacity = setQuantizedOpacity(
        this._fgNightTint, fgIntensity, this._lastFgTintOpacity);
    }
  }

  /** Copy bg into bgNightCanvas with the night tint baked in. Called from
   *  renderBackground() (arena load + render-scale change) and from
   *  renderFrame when `_bgNightDirty` was set by bakeGibs/renderBloodDrips
   *  earlier in the frame (so kill marks track at night, with at most one
   *  bake per frame). Skipped when lighting is off (~15MB GPU bandwidth).
   *
   *  We do NOT skip when current bgNight opacity is small — the bake is a
   *  setup pass for a future cross-fade. Skipping at noon would leave the
   *  night canvas empty when dayPhase advances into the visible band. */
  private _bakeBgNightVariant(): void {
    if (!this.bgNightCanvas || !this.bgNightCtx) return;
    if (!this.lighting.isEnabled()) return;
    this._bgNightDirty = false;
    const ctx = this.bgNightCtx;
    const w = this.bgNightCanvas.width;
    const h = this.bgNightCanvas.height;
    ctx.save();
    // Identity: drawImage between two equally-scaled backing stores must run
    // at 1:1 px or the per-canvas render-scale transform would double-scale.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgCanvas, 0, 0);
    ctx.fillStyle = this.lighting.ambient.getBgNightBakeColor();
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Pool a `_dynamicLights` slot for a point emitter at the given index,
   *  creating it on first use. Clears `flicker` so reused slots don't carry
   *  stale config from a different emitter type the previous frame. */
  private _ensureLightSlot(i: number): PointLight {
    let slot = this._dynamicLights[i] as PointLight | undefined;
    if (!slot) {
      slot = {
        kind: 'point',
        x: 0, y: 0,
        color: { r: 0, g: 0, b: 0 },
        intensity: 0,
        radius: 0,
        falloff: 'smoothstep',
      };
      this._dynamicLights[i] = slot;
    }
    slot.flicker = undefined;
    return slot;
  }

  /** Synthesize per-frame dynamic emitters from live entity state. Pools
   *  Light objects in `_dynamicLights`, trimming `length` to the live count.
   *
   *  Sources:
   *  - Per-carrot glow — subtle warm-orange so carrots stay visible at night.
   *    Brightens briefly after spawn (uses `Carrot.spawnTime`).
   *  - Firefly emitters — per-particle yellow-green glow, locked to the
   *    visual draw via `fireflyPosition`.
   *
   *  Player-anchored lights (spawn pillar, stomp flash) are NOT here — they're
   *  drawn directly on the fg ctx via `_drawLightBursts` so they're visible at
   *  any dayPhase, not gated by the lightCanvas opacity. */
  private _synthesizeDynamicLights(matchState: MatchState): void {
    let i = 0;

    for (const carrot of matchState.carrots) {
      if (!carrot.active) continue;
      const slot = this._ensureLightSlot(i++);
      slot.x = carrot.x;
      slot.y = carrot.y;
      slot.color = CARROT_GLOW_RGB;
      slot.falloff = 'smoothstep';
      // Spawn flash: brief brightness pulse over CARROT_SPAWN_FLASH_S after
      // spawnTime, then settles to baseline. timeElapsed - spawnTime can be
      // negative briefly during snapshot interpolation; max(0,...) clamps.
      const age = Math.max(0, matchState.timeElapsed - carrot.spawnTime);
      const flash = age < CARROT_SPAWN_FLASH_S ? 1 - age / CARROT_SPAWN_FLASH_S : 0;
      slot.intensity = 0.25 + flash * 0.35;
      slot.radius = 30 + flash * 20;
    }

    // Firefly emitters — themes opt in via dayNight.showFireflies. Visible
    // only past the same nightIntensity > 0.4 threshold the visual draw uses
    // in `effects.ts`, so the lights match the bright dots one-to-one.
    if (this.theme.dayNight.showFireflies && this.theme.dayNight.enabled) {
      const nightIntensity = computeNightIntensity(matchState.dayPhase);
      if (nightIntensity > 0.4) {
        for (let f = 0; f < FIREFLY_COUNT; f++) {
          fireflyPosition(f, this.frameTime, _fireflyPos);
          const slot = this._ensureLightSlot(i++);
          slot.x = _fireflyPos.x;
          slot.y = _fireflyPos.y;
          slot.color = FIREFLY_GLOW_RGB;
          slot.intensity = 0.18;
          slot.radius = 30;
          slot.falloff = 'smoothstep';
          slot.flicker = FIREFLY_FLICKER[f];
        }
      }
    }

    this._dynamicLights.length = i;
  }

  /** Queue a transient additive light at (x, y). Drawn directly on the fg
   *  ctx with `'lighter'` blend by `_drawLightBursts` — bypasses the
   *  lightCanvas opacity gate, so visible at any dayPhase including noon.
   *  Called from PlayerTransitionSystem on splat / spawn transitions. */
  emitLightBurst(x: number, y: number, kind: 'spawn' | 'stomp'): void {
    if (kind === 'spawn') {
      this._lightBursts.push({
        x, y, age: 0,
        duration: SPAWN_BURST_DURATION,
        peakIntensity: SPAWN_BURST_PEAK_INTENSITY,
        peakRadius: SPAWN_BURST_PEAK_RADIUS,
        color: SPAWN_BURST_COLOR,
        kind,
      });
    } else {
      this._lightBursts.push({
        x, y, age: 0,
        duration: STOMP_BURST_DURATION,
        peakIntensity: STOMP_BURST_PEAK_INTENSITY,
        peakRadius: STOMP_BURST_PEAK_RADIUS,
        color: STOMP_BURST_COLOR,
        kind,
      });
    }
  }

  /** Draw + decay queued bursts on the fg ctx with `'lighter'` blend. Decay
   *  uses wall-clock dt — bursts last <1s of real time regardless of
   *  slowMotion or pause (pause stops `renderFrame` from being called, so
   *  age implicitly freezes there). The tracker is advanced every frame
   *  (even when empty) so the first frame after an idle window gets a real
   *  per-frame dt instead of a clamped `maxDt`. */
  private _drawLightBursts(ctx: Ctx2D): void {
    const dt = this._burstDt(this.frameTime);
    if (this._lightBursts.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this._lightBursts.length - 1; i >= 0; i--) {
      const burst = this._lightBursts[i];
      burst.age += dt;
      if (burst.age >= burst.duration) {
        swapRemove(this._lightBursts, i);
        continue;
      }
      const t = burst.age / burst.duration;
      let intensity: number;
      let radius: number;
      if (burst.kind === 'spawn') {
        // sin-bell envelope: 0 → 1 (mid) → 0
        const env = Math.sin(t * Math.PI);
        intensity = burst.peakIntensity * env;
        radius = burst.peakRadius * (0.6 + 0.4 * env);
      } else {
        // sharp peak then quadratic fade
        const env = (1 - t) * (1 - t);
        intensity = burst.peakIntensity * env;
        radius = burst.peakRadius * (0.7 + 0.3 * (1 - t));
      }
      const grad = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
      const { r, g, b } = burst.color;
      grad.addColorStop(0, `rgba(${r},${g},${b},${intensity})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${intensity * 0.35})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(burst.x - radius, burst.y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  /** L2: register the static emitter catalog for the current arena. Called
   *  from renderBackground after the bg cache is built. Triggers a one-time
   *  bake into an OffscreenCanvas, blitted onto lightCanvas each frame. */
  setArenaLights(lights: ReadonlyArray<Light>): void {
    this.lighting.emitters.setStaticLights(lights);
    this._bakeStaticEmitters();
  }

  private _bakeStaticEmitters(): void {
    if (!this._lightCanvas) return;
    const bw = this._lightCanvas.width;
    const bh = this._lightCanvas.height;
    if (!this._lightStaticCache || this._lightStaticCache.width !== bw || this._lightStaticCache.height !== bh) {
      this._lightStaticCache = new OffscreenCanvas(bw, bh);
    }
    const cacheCtx = this._lightStaticCache.getContext('2d')!;
    cacheCtx.save();
    cacheCtx.setTransform(this._renderScale, 0, 0, this._renderScale, 0, 0);
    cacheCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.lighting.emitters.bakeStatic(cacheCtx);
    cacheCtx.restore();
  }

  /** L2 emitter compositing — runs once per frame in renderFrame.
   *  Clear → blit static cache → dynamic stamps + flicker overlay. Skips
   *  the per-frame stamp work entirely during the day (light layer would
   *  composite at opacity 0 anyway). */
  private _compositeEmitters(): void {
    if (!this.lighting.isEnabled()) return;
    const ctx = this._lightCtx;
    const canvas = this._lightCanvas;
    if (!ctx || !canvas) return;
    this._driveLightOpacity();
    // Skip below JND threshold — the screen-blend layer at <2% opacity is
    // visually indistinguishable from "off" but the per-frame stamp work
    // (clearRect + drawImage(staticCache) + N gradient creations) isn't free.
    if (this._lastLightOpacity < 0.02) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this._lightStaticCache) {
      ctx.drawImage(this._lightStaticCache, 0, 0);
    }
    ctx.restore();
    this.lighting.emitters.compositeDynamic(ctx);
  }

  /** Light layer opacity tracks bgNightOpacity — emitters fade in with night,
   *  invisible during the day. Browser compositor skips zero-opacity layers. */
  private _driveLightOpacity(): void {
    if (!this._lightCanvas) return;
    const target = this.lighting.ambient.getBgNightOpacity();
    if ('style' in this._lightCanvas) {
      this._lastLightOpacity = setQuantizedOpacity(this._lightCanvas, target, this._lastLightOpacity);
    } else if (this._nightOpacityCallback) {
      // Worker mode: piggy-back on the night-opacity channel with a synthetic
      // `'light'` kind. The proxy on main fans this out to lightCanvas.style.
      const q = Math.round(target * 1000) / 1000;
      if (q !== this._lastLightOpacity) {
        // Reuse 'bg' channel name? No — light opacity is independent. The
        // callback signature is fixed to 'bg' | 'fg'; encoding 'light' would
        // require widening. For worker use we deliberately couple light
        // opacity to bgNight opacity (they were always equal anyway via this
        // method). Skip the worker-side write — main mirrors it from the
        // 'bg' callback.
        this._lastLightOpacity = q;
      }
    }
  }

  /**
   * Bake every platform's body-face overlay into a single OffscreenCanvas.
   * Drawn after players each frame as one drawImage, sparing the fg ctx the
   * per-platform decoration cost on every frame.
   */
  private buildPlatformOverlay(arena: Arena): void {
    const draw = this.theme.drawPlatformOverlay;
    if (!draw) { this._overlayCanvas = null; return; }
    const s = this._renderScale;
    const w = Math.max(1, Math.round(CANVAS_WIDTH * s));
    const h = Math.max(1, Math.round(CANVAS_HEIGHT * s));
    if (!this._overlayCanvas || this._overlayCanvas.width !== w || this._overlayCanvas.height !== h) {
      this._overlayCanvas = new OffscreenCanvas(w, h);
    }
    const octx = this._overlayCanvas.getContext('2d')!;
    octx.setTransform(s, 0, 0, s, 0, 0);
    octx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const plat of arena.platforms) {
      draw(octx, plat, plat.y >= 650);
    }
  }

  private _renderForegroundNatureCache(themeArena: Arena): void {
    // OffscreenCanvas isn't available in jsdom test envs — skip caching there;
    // renderFrame falls back to drawing foreground nature directly.
    if (typeof OffscreenCanvas === 'undefined') return;
    const s = this._renderScale;
    // Skip rebuild when nothing that affects foreground content has changed.
    // renderBackground() also fires on splat marks / gib bakes mid-match —
    // those don't touch foreground decorations.
    if (this._fgNatureCache
      && this._fgNatureCacheArena === themeArena
      && this._fgNatureCacheScale === s) return;
    if (!this._fgNatureCache || this._fgNatureCacheScale !== s) {
      this._fgNatureCache = new OffscreenCanvas(
        Math.max(1, Math.ceil(CANVAS_WIDTH * s)),
        Math.max(1, Math.ceil(CANVAS_HEIGHT * s)),
      );
      this._fgNatureCacheCtx = this._fgNatureCache.getContext('2d')!;
      this._fgNatureCacheCtx.scale(s, s);
      this._fgNatureCacheScale = s;
    }
    const cctx = this._fgNatureCacheCtx!;
    cctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this._drawForegroundNatureDirect(cctx, themeArena);
    this._fgNatureCacheArena = themeArena;
  }

  /** Draw the reactive decoration instances for one render layer. The caller
   *  passes a pre-bucketed list (system filters by layer at `setInstances`
   *  time) so this loop has no per-instance layer check or array allocation. */
  private _drawReactiveLayer(
    ctx: Ctx2D,
    instances: ReadonlyArray<import('./gameLoop/cosmetics/reactiveDecorations').ReactiveInstance>,
    windPhase: number,
    matchState: MatchState,
  ): void {
    if (!instances || instances.length === 0) return;
    const slow = getSlowDevice();
    const time = matchState.timeElapsed;
    const dayPhase = matchState.dayPhase ?? 0;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const cfg = getReactiveKind(inst.kind);
      if (!cfg) continue;
      const swayPhase = slow || !inst.windAmp
        ? 0
        : Math.sin(windPhase + inst.seed * 0.7) * inst.windAmp;
      cfg.draw(ctx, inst, swayPhase, time, dayPhase, matchState);
    }
  }

  /** Draw all wildlife instances for one layer. Like `_drawReactiveLayer`,
   *  iterates a pre-bucketed list — no per-frame allocation or layer filter. */
  private _drawWildlifeLayer(
    ctx: Ctx2D,
    instances: ReadonlyArray<import('./gameLoop/cosmetics/wildlife').WildlifeInstance>,
    matchState: MatchState,
  ): void {
    if (!instances || instances.length === 0) return;
    if (getSlowDevice()) return;
    const time = matchState.timeElapsed;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const cfg = getWildlifeKind(inst.kindId);
      if (!cfg) continue;
      cfg.draw(ctx, inst, time, matchState);
    }
  }

  /** Apply mirror transform and call into theme's foreground draw. Shared by
   *  the cache builder and the test-env (no OffscreenCanvas) fallback path. */
  private _drawForegroundNatureDirect(ctx: Ctx2D, themeArena: Arena): void {
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    this.theme.drawForegroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }
  }


  /** Mirror-aware draw helper, begin/end form. Returns true if a transform
   *  was applied — callers pass that flag to `_endMirror` to balance the
   *  save/restore. The split avoids the per-call closure that a `withMirror(fn)`
   *  wrapper would allocate at 7 call sites per renderFrame. */
  private _beginMirror(ctx: Ctx2D): boolean {
    if (!this.mirrored) return false;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-CANVAS_WIDTH, 0);
    return true;
  }
  private _endMirror(ctx: Ctx2D, applied: boolean): void {
    if (applied) ctx.restore();
  }

  // ---- Clouds ----

  private updateAndDrawClouds(ctx: Ctx2D, dt: number): void {
    // Inlined batch of theme-default clouds: one fillStyle, one beginPath/fill
    // for all clouds. Each cloud is 4 overlapping arcs (the original drawCloud
    // shape); moveTo before each cloud starts a new sub-path so neighbours
    // don't connect with a stray line. (The drawCloud primitive in
    // drawPrimitives is still used by menu + lobby renderers — those aren't
    // hot enough to justify duplicating this batch path there.)
    ctx.fillStyle = this.theme.clouds.color;
    ctx.beginPath();
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x - cloud.size > CANVAS_WIDTH) {
        cloud.x = -cloud.size * 2;
      }
      const x = cloud.x, y = cloud.y, s = cloud.size;
      ctx.moveTo(x + s * 0.5, y);
      ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
      ctx.arc(x + s * 0.4, y - s * 0.15, s * 0.4, 0, Math.PI * 2);
      ctx.arc(x + s * 0.8, y, s * 0.45, 0, Math.PI * 2);
      ctx.arc(x + s * 0.35, y + s * 0.1, s * 0.35, 0, Math.PI * 2);
    }
    ctx.fill();
  }


  private drawPlatform(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
    if (this.theme.drawPlatform) {
      this.theme.drawPlatform(ctx, platform, isGround);
      return;
    }

    const tp = this.theme.platform;
    if (tp.customDraw) {
      tp.customDraw(ctx, platform.x, platform.y, platform.width, platform.height, isGround);
      return;
    }

    const { x, y, width: w, height: h } = platform;
    if (isGround) {
      ctx.fillStyle = tp.groundBodyColor;
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = tp.groundTopColor;
      ctx.fillRect(x, y, w, 8);
      const spotColor = this.blendColor(tp.groundBodyColor, '#FFFFFF', 0.15);
      ctx.fillStyle = spotColor;
      for (let dx = 10; dx < w; dx += 30 + Math.random() * 20) {
        ctx.fillRect(x + dx, y + 15 + Math.random() * 20, 4, 3);
      }
    } else {
      ctx.fillStyle = tp.floatingBodyColor;
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = tp.floatingTopColor;
      ctx.fillRect(x, y, w, 6);
      if (tp.floatingAccentColor) {
        ctx.fillStyle = tp.floatingAccentColor;
        ctx.fillRect(x, y, w, 3);
      }
      if (tp.drawMoss) {
        drawPlatformMoss(ctx, x, y, h);
        drawPlatformMoss(ctx, x + w, y, h);
      }
    }
  }

  private blendColor(hex: string, target: string, amount: number): string {
    const c = blendRgb(hexToRGB(hex), hexToRGB(target), amount);
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  /** Bake gibs onto the bg canvas. Marks bgNight dirty so the cross-fade
   *  variant picks them up at the next renderFrame (single re-bake even when
   *  bakeGibs + renderBloodDrips both fire on the same kill frame). */
  bakeGibs(gibs: Gib[]): void {
    if (gibs.length === 0) return;
    const ctx = this.bgCtx;
    for (const gib of gibs) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(gib.x, gib.y);
      ctx.rotate(gib.rotation);
      drawGibShape(ctx, gib);
      ctx.restore();
    }
    this._bgNightDirty = true;
  }

  /** Bake blood-drip splats onto the bg canvas. Marks bgNight dirty (see
   *  bakeGibs for the coalesce contract). */
  renderBloodDrips(drips: Array<{ x: number; y: number; radius: number; color: string }>): void {
    if (drips.length === 0) return;
    const ctx = this.bgCtx;
    for (const drip of drips) {
      ctx.fillStyle = drip.color + '99';
      ctx.beginPath();
      ctx.arc(drip.x, drip.y, drip.radius, 0, Math.PI * 2);
      ctx.fill();
      // Small trail drops below
      const trailCount = 1 + Math.floor(Math.random() * 3);
      for (let t = 0; t < trailCount; t++) {
        const ty = drip.y + 2 + Math.random() * 4;
        const tx = drip.x + (Math.random() - 0.5) * 3;
        const tr = drip.radius * (0.3 + Math.random() * 0.4);
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this._bgNightDirty = true;
  }

  // ---- Frame rendering ----

  renderFrame(
    matchState: MatchState,
    arena: Arena,
    particles: Particle[],
    cosmeticLead = 0,
    reactive?: import('./gameLoop/cosmetics/reactiveDecorations').ReactiveRenderArg,
    wildlife?: import('./gameLoop/cosmetics/wildlife').WildlifeRenderArg,
  ): void {
    const tRender = perfTrace.begin('renderFrame');
    try {
      const ctx = this.fgCtx;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Reset diagnostics each frame (mutate in place — avoid 14k object allocs over 30s)
      resetDiag(this._diag);
      const d = this._diag;

      // Cache time once per frame
      this.frameTime = performance.now();
      this.lighting.ambient.beginFrame(this.theme, matchState.dayPhase);
      this._synthesizeDynamicLights(matchState);
      // Tick derived from timeElapsed (60Hz fixed-step). On guests, timeElapsed
      // is interpolated between snapshots → flicker advances smoothly without
      // a wire-format change for an explicit tick field.
      const tick = Math.floor(matchState.timeElapsed * 60);
      this.lighting.emitters.beginFrame(this._dynamicLights, tick);
      // Drain mid-match bg writes (gibs, splat marks) into the bgNight bake.
      if (this._bgNightDirty) this._bakeBgNightVariant();
      this._driveBgNightOpacity();

      ctx.save();

      // Hitstop zoom punch -- subtle scale centered on screen
      if (matchState.hitstopZoom > 0) {
        d.hitstop = true;
        const t = matchState.hitstopZoom / HITSTOP_DURATION; // 1 -> 0
        const scale = 1 + HITSTOP_ZOOM * t * t;              // ease-out
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.scale(scale, scale);
        ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
      }

      // Screen shake offset
      if (matchState.screenShake > 0) {
        d.screenShake = true;
        const intensity = SCREEN_SHAKE_INTENSITY * (matchState.screenShake / 0.3);
        ctx.translate(
          (Math.random() - 0.5) * intensity * 2,
          (Math.random() - 0.5) * intensity * 2,
        );
      }

      const bgStart = perfTrace.begin('render.bg');
      const slow = getSlowDevice();

      // Drawn before clouds so sky-atmosphere effects (aurora, distant space
      // objects) compose under weather and clouds.
      if (this.theme.drawAnimatedBackground) {
        const thA = this.originalArena ?? arena;
        { const m = this._beginMirror(ctx); this.theme.drawAnimatedBackground!(ctx, thA, matchState.timeElapsed, matchState.dayPhase, matchState); this._endMirror(ctx, m); }
        d.animatedBg = true;
      }
      // Wildlife — animBackground layer (e.g. treetops squirrels). Same slot
      // the legacy `drawAnimatedBackground` wildlife branch occupied.
      if (wildlife && wildlife.animBackground.length > 0) {
        { const m = this._beginMirror(ctx); this._drawWildlifeLayer(ctx, wildlife.animBackground, matchState); this._endMirror(ctx, m); }
      }

      const now = this.frameTime / 1000;
      const dt = now - (this.lastCloudTime || now);
      this.lastCloudTime = now;
      this.updateAndDrawClouds(ctx, dt);
      d.clouds = true;

      // Weather (leaves, petals)
      if (!slow) {
        drawWeather(ctx, matchState.weather, this.theme, cosmeticLead);
        if (matchState.weather.length > 0) d.weather = true;
      }

      // Wildlife: butterflies + birds (q) -- drawn after clouds/weather, before springs
      if (!slow && matchState.wildlife) {
        drawWildlife(ctx, matchState.wildlife);
        d.wildlife = true;
      }

      // Hazard zones (lava pools etc.)
      if (arena.hazardZones) {
        for (const hz of arena.hazardZones) {
          drawHazardZone(ctx, hz, this.theme, matchState.timeElapsed);
        }
        d.hazardZones = true;
      }

      // Effect zones (zero-G, currents, geysers)
      if (arena.effectZones) {
        let geyserIdx = 0;
        for (let zi = 0; zi < arena.effectZones.length; zi++) {
          const zone = arena.effectZones[zi];
          if (zone.type === 'zero_g') {
            drawZeroGZone(ctx, zone, matchState.timeElapsed);
          } else if (zone.type === 'current') {
            drawCurrentZone(ctx, zone, matchState.timeElapsed);
          } else if (zone.type === 'geyser') {
            const gs = matchState.geyserStates[geyserIdx];
            if (gs) drawGeyser(ctx, zone, gs, matchState.timeElapsed);
            geyserIdx++;
          }
        }
        d.effectZones = true;
      }

      // Bouncy platform wobble
      if (arena.bouncyPlatforms) {
        for (const bi of arena.bouncyPlatforms) {
          const bp = arena.platforms[bi];
          if (!bp) continue;
          const wobble = matchState.bouncyWobble.get(bi) || 0;
          drawBouncyPlatformOverlay(ctx, bp, wobble, matchState.timeElapsed);
        }
        d.bouncyPlatforms = true;
      }

      perfTrace.end('render.bg', bgStart);

      // Surface decals (cracks, scuffs) — drawn between platforms and entities so
      // platform caps occlude them only on edges (decal y is platform top + small fudge).
      drawSurfaceDecals(ctx, matchState);

      const entStart = perfTrace.begin('render.entities');
      // Pigeon flocks
      for (const flock of matchState.pigeonFlocks) {
        drawPigeonFlock(ctx, flock, matchState.timeElapsed, cosmeticLead);
        d.pigeons = true;
      }

      // Species-aware scatter flocks (birds, bats, crows)
      for (const flock of matchState.scatterFlocks) {
        drawScatterFlock(ctx, flock, matchState.timeElapsed, cosmeticLead);
      }

      // Lava rocks (falling hazards)
      for (const rock of matchState.lavaRocks) {
        if (!rock.active) continue;
        drawLavaRock(ctx, rock, this.theme);
        d.lavaRocks = true;
      }

      // Springs and thorns (behind players)
      for (const spring of matchState.springs) { drawSpringMushroom(ctx, spring, this.theme); d.springs = true; }
      for (const thorn of matchState.thorns) { drawThorn(ctx, thorn, this.theme); d.thorns = true; }

      // Carrots
      for (const carrot of matchState.carrots) {
        if (carrot.active) { drawCarrot(ctx, carrot, matchState.timeElapsed, this.frameTime); d.carrots = true; }
      }
      perfTrace.end('render.entities', entStart);

      const partStart = perfTrace.begin('render.particles');
      drawParticles(ctx, particles, cosmeticLead);

      if (matchState.gibs.length > 0) { drawGibs(ctx, matchState.gibs, cosmeticLead); d.gibs = true; }
      if (matchState.confetti.length > 0) { drawConfetti(ctx, matchState.confetti, cosmeticLead); d.confetti = true; }

      // Stomp shockwaves (e) -- after particles, before players
      if (matchState.shockwaves && matchState.shockwaves.length > 0) {
        d.shockwaves = true;
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        for (const sw of matchState.shockwaves) {
          const progress = 1 - sw.life / SHOCKWAVE_DURATION;
          ctx.globalAlpha = sw.life / SHOCKWAVE_DURATION;
          ctx.lineWidth = Math.max(1, 4 * (1 - progress));
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Liquid impact ripples (env-ripples)
      drawRipples(ctx, matchState);
      perfTrace.end('render.particles', partStart);

      const aiStart = perfTrace.begin('render.afterimages');
      // Afterimage ghost trails (drawn behind players).
      if (!slow) {
        let aiSaved = false;
        for (const player of matchState.players) {
          if (!player.active) continue;
          if (player.state === 'respawning') continue;
          const afterimages = player.afterimages;
          if (afterimages && afterimages.length > 0) {
            d.afterimages = true;
            if (!aiSaved) { ctx.save(); aiSaved = true; }
            const baseHsl = player.invincibleTimer > 0
              ? _invincibleHsl
              : getCachedHsl(player.character.color);
            const slSuffix = `,${Math.round(baseHsl.s * 100)}%,${Math.round(baseHsl.l * 100)}%)`;
            const total = afterimages.length;
            for (let i = 0; i < total; i++) {
              const img = afterimages[i];
              // Oldest (i=0) shifted -18°, newest (i=total-1) at base hue.
              const shift = ((i / Math.max(1, total - 1)) - 1) * 18;
              const h = (baseHsl.h + shift + 360) % 360;
              ctx.fillStyle = `hsl(${Math.round(h)}${slSuffix}`;
              ctx.globalAlpha = img.alpha;
              ctx.beginPath();
              ctx.ellipse(
                img.x + player.width / 2,
                img.y + player.height * 0.55,
                player.width * 0.38,
                player.height * 0.38,
                0, 0, Math.PI * 2
              );
              ctx.fill();
            }
          }
        }
        if (aiSaved) ctx.restore();
      }

      perfTrace.end('render.afterimages', aiStart);

      const playersStart = perfTrace.begin('render.players');
      // Compute which players are near a carrot (c) for blush
      _nearCarrotSet.clear();
      const nearCarrotSet = _nearCarrotSet;
      for (const player of matchState.players) {
        if (!player.active || player.state === 'respawning') continue;
        const pcx = player.x + player.width / 2;
        const pcy = player.y + player.height / 2;
        for (const carrot of matchState.carrots) {
          if (!carrot.active) continue;
          const dx = pcx - carrot.x;
          const dy = pcy - carrot.y;
          if (dx * dx + dy * dy < 10000) {
            nearCarrotSet.add(player.id);
            break;
          }
        }
      }

      // Players (iso clip applied when applicable — see findIsoOccluders).
      const useIsoClip = this._arenaHasIsoOccluders;
      const isoPlatforms = this._isoOccluderPlatforms;
      for (const player of matchState.players) {
        if (!player.active) continue;
        if (player.state === 'respawning') continue;
        const occluders = useIsoClip ? findIsoOccluders(player, isoPlatforms) : null;
        const clipped = occluders !== null && occluders.length > 0;
        if (clipped) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          for (const plat of occluders!) addIsoPlatformPath(ctx, plat);
          ctx.clip('evenodd');
        }
        drawPlayer(ctx, player, nearCarrotSet.has(player.id), this.theme, this.frameTime);
        if (clipped) ctx.restore();
        d.playersDrawn++;
      }

      // Platform body overlay (cached). Drawn AFTER players so the body face
      // occludes any player whose bbox enters the iso phantom strip — the
      // "going behind the platform" effect. Cached at arena/scale change in
      // buildPlatformOverlay; this is one drawImage instead of a per-platform
      // decoration loop on every frame.
      if (this._overlayCanvas) {
        ctx.drawImage(this._overlayCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      // Spring spiral trail (h) -- drawn near players
      for (const player of matchState.players) {
        if (!player.active || player.state === 'respawning') continue;
        if (player.springTrailTimer > 0) {
          drawSpringTrail(ctx, player, this.frameTime);
        }
      }

      // Zero-G character effect -- shimmer around players in zero-G zones
      if (arena.effectZones) {
        for (const player of matchState.players) {
          if (!player.active || player.state === 'splat' || player.state === 'respawning') continue;
          for (const zone of arena.effectZones) {
            if (zone.type !== 'zero_g') continue;
            if (aabbOverlap(player.x, player.y, player.width, player.height, zone.x, zone.y, zone.width, zone.height)) {
              const pcx = player.x + player.width / 2;
              const pcy = player.y + player.height / 2;
              ctx.save();
              // Cyan glow around player
              ctx.globalAlpha = 0.15 + Math.sin(matchState.timeElapsed * 4) * 0.05;
              const glow = ctx.createRadialGradient(pcx, pcy, 5, pcx, pcy, 25);
              glow.addColorStop(0, 'rgba(0, 220, 255, 0.3)');
              glow.addColorStop(1, 'rgba(0, 200, 255, 0)');
              ctx.fillStyle = glow;
              ctx.fillRect(pcx - 25, pcy - 25, 50, 50);
              // Sparkle ring
              ctx.globalAlpha = 0.35;
              for (let s = 0; s < 6; s++) {
                const angle = matchState.timeElapsed * 2 + s * Math.PI / 3;
                const sr = 18;
                const sx = pcx + Math.cos(angle) * sr;
                const sy = pcy + Math.sin(angle) * sr;
                ctx.fillStyle = '#88EEFF';
                ctx.beginPath();
                ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
              d.zeroGShimmer = true;
              break;
            }
          }
        }
      }

      perfTrace.end('render.players', playersStart);

      const fgStart = perfTrace.begin('render.fg-nature');
      // Ground fog (o) -- after players, before foreground nature
      const fogCfg = this.theme.fog;
      if (fogCfg && matchState.fogParticles && matchState.fogParticles.length > 0) {
        d.fog = true;
        if (!this._fogRGB) {
          this._fogRGB = hexToRGB(fogCfg.color);
        }
        const { r, g, b } = this._fogRGB;
        const opacity = fogCfg.opacity ?? 0.3;
        ctx.save();
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        for (const fp of matchState.fogParticles) {
          ctx.globalAlpha = fp.alpha * opacity;
          ctx.beginPath();
          ctx.ellipse(fp.x, fp.y, fogCfg.sizeX, fogCfg.sizeY, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Ground critters (snails, rats, crabs…) — drawn BEFORE fg-nature so
      // grass tufts / bushes can occlude them when they walk behind foliage.
      // Two paths: the legacy `theme.drawGroundCritters` callback (for any
      // arena pack still owning its critter state) and the WildlifeSystem
      // (post-migration packs).
      if (this.theme.drawGroundCritters) {
        const thA = this.originalArena ?? arena;
        { const m = this._beginMirror(ctx); this.theme.drawGroundCritters!(ctx, thA, matchState.timeElapsed, matchState.dayPhase, matchState); this._endMirror(ctx, m); }
      }
      if (wildlife && wildlife.groundCritter.length > 0) {
        { const m = this._beginMirror(ctx); this._drawWildlifeLayer(ctx, wildlife.groundCritter, matchState); this._endMirror(ctx, m); }
      }

      // Mirror is baked into the cache so blit at identity transform; explicit
      // logical W/H since the bitmap is at scaled-pixel dims. Fallback for
      // test envs without OffscreenCanvas: draw directly.
      if (this._fgNatureCache) {
        ctx.drawImage(this._fgNatureCache, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        this._drawForegroundNatureDirect(ctx, this.originalArena ?? arena);
      }

      // Reactive decorations — pre-player layer.
      if (reactive) {
        { const m = this._beginMirror(ctx); this._drawReactiveLayer(ctx, reactive.prePlayer, reactive.windPhase, matchState); this._endMirror(ctx, m); }
      }

      // Ghosts (drawn over foreground, semi-transparent)
      for (const ghost of matchState.ghosts) {
        drawGhost(ctx, ghost, this.theme, matchState.timeElapsed);
      }

      // Ambient particles (pollen / snow drift / sparkles)
      if (!slow && matchState.pollenParticles && matchState.pollenParticles.length > 0) {
        d.ambient = true;
        const ambCfg = this.theme.ambientParticles;
        if (!this._ambientRGBs) {
          this._ambientRGBs = ambCfg.colors.map(hexToRGB);
        }
        if (!this._ambientRGBStrings || this._ambientRGBStrings.length !== this._ambientRGBs.length) {
          this._ambientRGBStrings = this._ambientRGBs.map(c => `rgb(${c.r},${c.g},${c.b})`);
        }
        const colorStrings = this._ambientRGBStrings;
        const hasTwoColors = colorStrings.length > 1;
        ctx.save();
        let lastCi = -1;
        for (const pp of matchState.pollenParticles) {
          const ci = pp.size > 2 ? 0 : (hasTwoColors ? 1 : 0);
          if (ci !== lastCi) {
            ctx.fillStyle = colorStrings[ci];
            lastCi = ci;
          }
          ctx.globalAlpha = pp.alpha * 0.7;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, pp.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Fireworks when match is over
      if (matchState.matchOver) {
        drawFireworks(ctx, particles, this.frameTime, cosmeticLead);
        d.fireworks = true;
      }

      // Day/night cycle overlay (only if theme has it enabled)
      if (!slow && this.theme.dayNight.enabled && matchState.dayPhase !== undefined) {
        drawDayNightCycle(ctx, matchState.dayPhase, matchState, this.theme, this.frameTime);
        d.dayNight = true;
      }

      if (this.theme.drawAnimatedForeground) {
        const thA = this.originalArena ?? arena;
        { const m = this._beginMirror(ctx); this.theme.drawAnimatedForeground!(ctx, thA, matchState.timeElapsed, matchState.dayPhase, matchState); this._endMirror(ctx, m); }
      }

      // Reactive decorations — post-player layer.
      if (reactive) {
        { const m = this._beginMirror(ctx); this._drawReactiveLayer(ctx, reactive.postPlayer, reactive.windPhase, matchState); this._endMirror(ctx, m); }
      }

      if (!slow && this.theme.drawSceneTint) {
        this.theme.drawSceneTint(ctx, matchState.dayPhase, matchState.timeElapsed);
      }

      perfTrace.end('render.fg-nature', fgStart);

      // Transient additive light flashes (spawn / stomp). Drawn here on the
      // fg ctx with `'lighter'` blend so they punch through the entire scene
      // regardless of dayPhase — the lightCanvas opacity gate would otherwise
      // hide them at noon.
      this._drawLightBursts(ctx);

      // Lighting composite — multiplies the light buffer onto the fg ctx.
      // Sits inside the hitstop/screen-shake transform so lights ride the shake.
      if (this.lighting.isEnabled()) {
        this.lighting.ambient.composite(ctx);
      }
      // L2 emitter composite — writes to lightCanvas. Skipped silently
      // when not wired (lobby/tests stay on the source-over ambient fallback only).
      this._compositeEmitters();

      // Brightness slider: applied AFTER lighting so users can tune the whole
      // composited frame. Skipped at value 1.0.
      const brightness = getBrightness();
      if (brightness !== 1.0) {
        ctx.save();
        if (brightness < 1.0) {
          // Darken: multiply with rgb(b,b,b)
          ctx.globalCompositeOperation = 'multiply';
          const v = Math.round(brightness * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
          // Brighten: lighter blend with white at intensity (brightness - 1)
          ctx.globalCompositeOperation = 'lighter';
          const v = Math.round((brightness - 1) * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        ctx.restore();
      }

      ctx.restore();

      const overlayStart = perfTrace.begin('render.overlay');
      // Overlay layer: HUD, countdown, connection quality, debug overlays, screen flash.
      // When hudCtx is set, these go on a dedicated canvas above fg, redrawn only when
      // state changes (saving a per-frame blit). Otherwise fall back to drawing on fg.
      if (this._lobbyOverlayFn) {
        this._renderLobbyOverlay(matchState);
      } else {
        const hudDirty = isHudDirty(matchState);
        if (this.hudCtx) {
          this._renderOverlayLayer(matchState, arena, hudDirty);
        } else {
          this._drawOverlayContent(this.fgCtx, matchState, arena, hudDirty);
        }
      }
      perfTrace.end('render.overlay', overlayStart);
    } finally {
      perfTrace.end('renderFrame', tRender);
    }
  }

  /**
   * Lobby-mode overlay path. Caller-supplied draw fn paints the HUD each frame
   * (no dirty-tracking — lobby HUD has continuously-moving labels and the
   * ready-zone gradient). Screen flash still respected for stomp swaps.
   */
  private _renderLobbyOverlay(matchState: MatchState): void {
    const target = this.hudCtx ?? this.fgCtx;
    if (this.hudCtx) target.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (this._lobbyOverlayFn) this._lobbyOverlayFn(target);
    if (matchState.screenFlash > 0) {
      this._diag.screenFlash = true;
      const flashAlpha = Math.min(1, matchState.screenFlash / SCREEN_FLASH_DURATION);
      target.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      target.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  /** Draw HUD + overlays on the dedicated hud canvas, skipping clear+redraw when nothing changed. */
  private _renderOverlayLayer(matchState: MatchState, arena: Arena, hudDirty: boolean): void {
    const hctx = this.hudCtx!;

    const hasCountdown = matchState.countdown !== undefined && matchState.countdown > 0;
    const hasFlash = matchState.screenFlash > 0;
    const hasAnimations = !!(matchState.scoreAnimations && matchState.scoreAnimations.length > 0);
    const hasNavDebug = debugFlags.navDebugEnabled;
    const hasNetDebug = debugFlags.netDebugEnabled && !!this._netDebugStats;
    const hasFps = debugFlags.fpsEnabled;
    const hasOverlayContent = hasCountdown || hasFlash || hasAnimations || hasNavDebug || hasNetDebug || hasFps;

    const rttRounded = this._isNetworkMatch ? Math.round(this._netRtt) : -1;
    const jitterRounded = this._isNetworkMatch ? Math.round(this._netJitter) : -1;
    const qualityChanged = rttRounded !== this._overlayLastRtt || jitterRounded !== this._overlayLastJitter;

    // Redraw if: cache dirty, transient content active, content just ended (clear residue), or quality indicator changed.
    if (hudDirty || hasOverlayContent || this._overlayHadContent || qualityChanged) {
      hctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      this._drawOverlayContent(hctx, matchState, arena, hudDirty);
    }

    this._overlayHadContent = hasOverlayContent;
    this._overlayLastRtt = rttRounded;
    this._overlayLastJitter = jitterRounded;
  }

  /** Draw the HUD, connection quality, countdown, debug overlays, and screen flash onto a target ctx. */
  private _drawOverlayContent(ctx: Ctx2D, matchState: MatchState, arena: Arena, hudDirty: boolean): void {
    const d = this._diag;

    if (matchState.countdown !== undefined && matchState.countdown > 0) {
      drawCountdown(ctx, matchState.countdown);
      d.countdown = true;
    }

    // Combo popups float over the field but under the HUD pill, so draw before drawHUD.
    drawComboPopups(ctx, matchState);

    drawHUD(ctx, matchState, this.frameTime, this._playerNames, this._timeLimit, hudDirty);

    if (this._isNetworkMatch) {
      drawConnectionQuality(ctx, this._netRtt, this._netJitter, CANVAS_WIDTH);
    }

    if (debugFlags.navDebugEnabled) {
      drawNavDebugOverlay(ctx, arena, this.mirrored, this._botNavDebugStates);
      d.navDebug = true;
    }

    if (debugFlags.netDebugEnabled && this._netDebugStats) {
      drawNetDebugOverlay(ctx, this._netDebugStats, CANVAS_WIDTH);
      d.netDebug = true;
    }

    if (debugFlags.fpsEnabled) {
      drawFpsCounter(ctx, CANVAS_WIDTH);
    }

    if (matchState.screenFlash > 0) {
      d.screenFlash = true;
      const flashAlpha = Math.min(1, matchState.screenFlash / SCREEN_FLASH_DURATION);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }
}
