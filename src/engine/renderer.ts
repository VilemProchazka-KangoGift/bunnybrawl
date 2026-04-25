import type { Arena, MatchState, Particle, PlayerSlot, Gib } from './types';
import type { ThemeConfig } from './themes/types';
import { aabbOverlap } from './physics';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SCREEN_SHAKE_INTENSITY,
  SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  HITSTOP_DURATION, HITSTOP_ZOOM,
} from './constants';
import { drawHill, drawPlatformMoss } from './themes/drawPrimitives';
import { hexToRGB } from './fastMath';
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
  drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock,
  drawDayNightCycle,
  drawHUD, drawCountdown, drawConnectionQuality, invalidateHudCache, isHudDirty,
  drawPlayer,
  clearRenderingCaches,
} from './rendering';
import { setSpriteCacheScale } from './rendering/players';
import { setHudScale } from './rendering/hud';
import { applyRenderScaleToCanvas, getRenderScale } from './renderScale';
import { getSlowDevice } from './perfFlags';
import { perfTrace } from './perfTrace';

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

const _nearCarrotSet = new Set<PlayerSlot>();

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

function resetDiag(d: RenderDiagnostics): void {
  d.clouds = false; d.weather = false; d.wildlife = false; d.animatedBg = false;
  d.hazardZones = false; d.effectZones = false; d.bouncyPlatforms = false; d.pigeons = false;
  d.lavaRocks = false; d.springs = false; d.thorns = false; d.carrots = false;
  d.gibs = false; d.confetti = false; d.shockwaves = false; d.afterimages = false;
  d.fog = false; d.ambient = false; d.fireworks = false; d.dayNight = false;
  d.countdown = false; d.navDebug = false; d.netDebug = false; d.screenFlash = false;
  d.hitstop = false; d.screenShake = false; d.zeroGShimmer = false; d.playersDrawn = 0;
}

export class Renderer {
  private bgCanvas: HTMLCanvasElement;
  private fgCanvas: HTMLCanvasElement;
  private hudCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
  private hudCtx: CanvasRenderingContext2D | null = null;
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

  private mirrored = false;
  private originalArena: Arena | null = null;  // un-mirrored arena for theme draw calls
  private _botNavDebugStates: BotNavDebugState[] = [];
  private _netDebugStats: NetDebugStats | null = null;
  private _playerNames: Record<string, string> | null = null;
  private _timeLimit: number = 0;
  private _diag: RenderDiagnostics = freshDiag();
  private _netRtt = 0;
  private _netJitter = 0;
  private _isNetworkGuest = false;

  // Overlay-layer dirty tracking (only used when hudCtx is set)
  private _overlayHadContent = false;
  private _overlayLastRtt = -1;
  private _overlayLastJitter = -1;

  constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, theme: ThemeConfig, mirrored = false, hudCanvas?: HTMLCanvasElement) {
    clearRenderingCaches();
    this.bgCanvas = bgCanvas;
    this.fgCanvas = fgCanvas;
    this.bgCtx = bgCanvas.getContext('2d')!;
    this.fgCtx = fgCanvas.getContext('2d')!;
    this.theme = theme;
    this.mirrored = mirrored;

    if (hudCanvas) {
      this.hudCanvas = hudCanvas;
      this.hudCtx = hudCanvas.getContext('2d')!;
    }

    // Apply initial render scale to all canvases (sets backing-store dims + ctx transform)
    this._renderScale = getRenderScale();
    this._applyScaleToCanvases();
    setSpriteCacheScale(this._renderScale);
    setHudScale(this._renderScale);

    // Init clouds from theme config
    const cc = theme.clouds;
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

  private _applyScaleToCanvases(): void {
    const s = this._renderScale;
    applyRenderScaleToCanvas(this.bgCanvas, this.bgCtx, s);
    applyRenderScaleToCanvas(this.fgCanvas, this.fgCtx, s);
    if (this.hudCanvas && this.hudCtx) {
      applyRenderScaleToCanvas(this.hudCanvas, this.hudCtx, s);
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

  setConnectionQuality(rtt: number, jitter: number): void {
    this._netRtt = rtt;
    this._netJitter = jitter;
    this._isNetworkGuest = true;
  }

  /** E2E diagnostic: which rendering branches fired last frame. */
  getDiagnostics(): RenderDiagnostics { return this._diag; }

  renderBackground(arena: Arena, originalArena?: Arena): void {
    if (originalArena) this.originalArena = originalArena;
    this._lastBgArena = arena;
    this._lastBgOriginalArena = originalArena;
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
      this.drawPlatform(ctx, plat.x, plat.y, plat.width, plat.height, plat.y >= 650);
    }

    // Ground surface line
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

    // Theme-specific background nature (pass original arena, canvas transform handles mirroring)
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    theme.drawBackgroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }

    // Foreground nature is also static per-arena — render once into an
    // OffscreenCanvas here so renderFrame can blit it instead of re-running
    // 20+ shape primitives per frame. Heavy arenas (meadow, winter_lake)
    // have ~25 fg decorations each; the per-frame cost showed up as 2.2%
    // drawFgBush self-time + ~10% summed `:0 (fill)` calls.
    this._renderForegroundNatureCache(themeArena);
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
    this._drawForegroundNatureDirect(cctx as unknown as CanvasRenderingContext2D, themeArena);
    this._fgNatureCacheArena = themeArena;
  }

  /** Apply mirror transform and call into theme's foreground draw. Shared by
   *  the cache builder and the test-env (no OffscreenCanvas) fallback path. */
  private _drawForegroundNatureDirect(ctx: CanvasRenderingContext2D, themeArena: Arena): void {
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    this.theme.drawForegroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }
  }


  // ---- Clouds ----

  private updateAndDrawClouds(ctx: CanvasRenderingContext2D, dt: number): void {
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


  private drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isGround: boolean): void {
    const tp = this.theme.platform;

    // Allow theme to completely override platform drawing
    if (tp.customDraw) {
      tp.customDraw(ctx, x, y, w, h, isGround);
      return;
    }

    if (isGround) {
      ctx.fillStyle = tp.groundBodyColor;
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = tp.groundTopColor;
      ctx.fillRect(x, y, w, 8);
      // Ground texture spots
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
    const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = parse(hex);
    const [r2, g2, b2] = parse(target);
    const r = Math.round(r1 + (r2 - r1) * amount);
    const g = Math.round(g1 + (g2 - g1) * amount);
    const b = Math.round(b1 + (b2 - b1) * amount);
    return `rgb(${r},${g},${b})`;
  }

  bakeGibs(gibs: Gib[]): void {
    const ctx = this.bgCtx;
    for (const gib of gibs) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(gib.x, gib.y);
      ctx.rotate(gib.rotation);
      drawGibShape(ctx, gib);
      ctx.restore();
    }
  }

  renderBloodDrips(drips: Array<{ x: number; y: number; radius: number; color: string }>): void {
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
  }

  // ---- Frame rendering ----

  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[], cosmeticLead = 0): void {
    const _t = perfTrace.begin('renderFrame');
    try {
      const ctx = this.fgCtx;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Reset diagnostics each frame (mutate in place — avoid 14k object allocs over 30s)
      resetDiag(this._diag);
      const d = this._diag;

      // Cache time once per frame
      this.frameTime = performance.now();

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

      // Animated clouds
      const now = this.frameTime / 1000;
      const dt = now - (this.lastCloudTime || now);
      this.lastCloudTime = now;
      this.updateAndDrawClouds(ctx, dt);
      d.clouds = true;

      const slow = getSlowDevice();

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

      // Theme-specific animated background (e.g. space objects through windows)
      if (this.theme.drawAnimatedBackground) {
        const thA = this.originalArena ?? arena;
        if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
        this.theme.drawAnimatedBackground(ctx, thA, matchState.timeElapsed);
        if (this.mirrored) { ctx.restore(); }
        d.animatedBg = true;
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

      // Pigeon flocks
      for (const flock of matchState.pigeonFlocks) {
        drawPigeonFlock(ctx, flock, matchState.timeElapsed);
        d.pigeons = true;
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

      // Particles
      drawParticles(ctx, particles, cosmeticLead);

      // Gibs and confetti
      if (matchState.gibs.length > 0) { drawGibs(ctx, matchState.gibs, cosmeticLead); d.gibs = true; }
      if (matchState.confetti.length > 0) { drawConfetti(ctx, matchState.confetti, cosmeticLead); d.confetti = true; }

      // Stomp shockwaves (e) -- after particles, before players
      if (matchState.shockwaves) {
        if (matchState.shockwaves.length > 0) d.shockwaves = true;
        for (const sw of matchState.shockwaves) {
          const progress = 1 - sw.life / SHOCKWAVE_DURATION;
          const alpha = sw.life / SHOCKWAVE_DURATION;
          const lineW = Math.max(1, 4 * (1 - progress));
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = lineW;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Afterimage ghost trails (drawn behind players)
      if (!slow) {
        for (const player of matchState.players) {
          if (!player.active) continue;
          if (player.state === 'respawning') continue;
          const afterimages = player.afterimages;
          if (afterimages && afterimages.length > 0) {
            d.afterimages = true;
            const isInvincible = player.invincibleTimer > 0;
            const trailColor = isInvincible ? '#88BBFF' : player.character.color;
            const { r, g, b } = hexToRGB(trailColor);
            for (const img of afterimages) {
              ctx.fillStyle = `rgba(${r},${g},${b},${img.alpha})`;
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
      }

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

      // Players
      for (const player of matchState.players) {
        if (!player.active) continue;
        if (player.state === 'respawning') continue;
        drawPlayer(ctx, player, nearCarrotSet.has(player.id), this.theme, this.frameTime);
        d.playersDrawn++;
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

      // Ground fog (o) -- after players, before foreground nature
      if (matchState.fogParticles) {
        d.fog = true;
        const fogCfg = this.theme.fog;
        if (!this._fogRGB) {
          this._fogRGB = hexToRGB(fogCfg.color);
        }
        const { r, g, b } = this._fogRGB;
        for (const fp of matchState.fogParticles) {
          ctx.fillStyle = `rgba(${r},${g},${b},${fp.alpha * (fogCfg.opacity ?? 0.3)})`;
          ctx.beginPath();
          ctx.ellipse(fp.x, fp.y, fogCfg.sizeX, fogCfg.sizeY, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Mirror is baked into the cache so blit at identity transform; explicit
      // logical W/H since the bitmap is at scaled-pixel dims. Fallback for
      // test envs without OffscreenCanvas: draw directly.
      if (this._fgNatureCache) {
        ctx.drawImage(this._fgNatureCache, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        this._drawForegroundNatureDirect(ctx, this.originalArena ?? arena);
      }

      // Ghosts (drawn over foreground, semi-transparent)
      for (const ghost of matchState.ghosts) {
        drawGhost(ctx, ghost, this.theme, matchState.timeElapsed);
      }

      // Ambient particles (pollen / snow drift / sparkles)
      if (!slow && matchState.pollenParticles) {
        d.ambient = true;
        const ambCfg = this.theme.ambientParticles;
        if (!this._ambientRGBs) {
          this._ambientRGBs = ambCfg.colors.map(hexToRGB);
        }
        for (const pp of matchState.pollenParticles) {
          const ci = pp.size > 2 ? 0 : (this._ambientRGBs.length > 1 ? 1 : 0);
          const { r, g, b } = this._ambientRGBs[ci];
          ctx.fillStyle = `rgba(${r},${g},${b},${pp.alpha * 0.7})`;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, pp.size, 0, Math.PI * 2);
          ctx.fill();
        }
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

      ctx.restore();

      // Overlay layer: HUD, countdown, connection quality, debug overlays, screen flash.
      // When hudCtx is set, these go on a dedicated canvas above fg, redrawn only when
      // state changes (saving a per-frame blit). Otherwise fall back to drawing on fg.
      const hudDirty = isHudDirty(matchState);
      if (this.hudCtx) {
        this._renderOverlayLayer(matchState, arena, hudDirty);
      } else {
        this._drawOverlayContent(this.fgCtx, matchState, arena, hudDirty);
      }
    } finally {
      perfTrace.end('renderFrame', _t);
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

    const rttRounded = this._isNetworkGuest ? Math.round(this._netRtt) : -1;
    const jitterRounded = this._isNetworkGuest ? Math.round(this._netJitter) : -1;
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
  private _drawOverlayContent(ctx: CanvasRenderingContext2D, matchState: MatchState, arena: Arena, hudDirty: boolean): void {
    const d = this._diag;

    if (matchState.countdown !== undefined && matchState.countdown > 0) {
      drawCountdown(ctx, matchState.countdown);
      d.countdown = true;
    }

    drawHUD(ctx, matchState, this.frameTime, this._playerNames, this._timeLimit, hudDirty);

    if (this._isNetworkGuest) {
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
