import type { Arena, MatchState, Particle, Platform, Player, PlayerSlot, Gib } from './types';
import type { ThemeConfig } from './themes/types';
import { aabbOverlap } from './physics';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SCREEN_SHAKE_INTENSITY,
  SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  HITSTOP_DURATION, HITSTOP_ZOOM,
} from './constants';
import {
  drawCloud as drawCloudPrimitive, drawHill, drawPlatformMoss,
  capFrontY, capBackY, skewPx,
} from './themes/drawPrimitives';
import { hexToRGB } from './fastMath';
import { debugFlags } from './debugFlags';
import { drawNavDebugOverlay } from './navDebugOverlay';
import type { BotNavDebugState } from './navDebugOverlay';
import { drawNetDebugOverlay } from './net/core/debugOverlay';
import type { NetDebugStats } from './net/core/debugOverlay';

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

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

const _nearCarrotSet = new Set<PlayerSlot>();
const _isoOccluders: Platform[] = [];

/** Sprite extends ~12 px above the bbox top for tall ears, horns, and gib pivots. */
const SPRITE_TOP_PAD = 12;

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
  for (const plat of platforms) {
    if (plat.leftCollisionInset == null && plat.bottomCollisionInset == null) continue;
    if (playerBottom <= plat.y) continue;
    const platRight = plat.x + plat.width;
    if (playerRight <= plat.x || player.x >= platRight) continue;
    // Polygon spans capBack..bottom vertically (sprite ears reach into cap).
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
function addIsoPlatformPath(ctx: CanvasRenderingContext2D, plat: Platform): void {
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

export class Renderer {
  private bgCanvas: HTMLCanvasElement;
  private fgCanvas: HTMLCanvasElement;
  private hudCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
  private hudCtx: CanvasRenderingContext2D | null = null;
  // Cached fg overlay (platform body faces drawn after players). Built once
  // per arena/scale change in renderBackground; one drawImage per frame
  // beats N×decorations-per-platform-per-frame.
  private _overlayCanvas: OffscreenCanvas | null = null;
  // True if any platform in the current arena has an iso phantom-strip inset.
  // When false, the per-player findIsoOccluders scan is skipped entirely
  // (lobby, non-iso arenas).
  private _arenaHasIsoOccluders = false;
  private _renderScale = 1;
  private _lastBgArena: Arena | null = null;
  private _lastBgOriginalArena: Arena | undefined;
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

  // Lobby mode: when set, replaces the match-HUD/countdown/connection-quality
  // overlay path with a caller-supplied draw fn (see `setLobbyOverlayFn`).
  private _lobbyOverlayFn: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  constructor(
    bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, theme: ThemeConfig,
    mirrored = false, hudCanvas?: HTMLCanvasElement,
  ) {
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

  /** Lobby-mode HUD callback. Receives a clean ctx each frame. Set null to disable. */
  setLobbyOverlayFn(fn: ((ctx: CanvasRenderingContext2D) => void) | null): void {
    this._lobbyOverlayFn = fn;
  }

  /** E2E diagnostic: which rendering branches fired last frame. */
  getDiagnostics(): RenderDiagnostics { return this._diag; }

  renderBackground(arena: Arena, originalArena?: Arena): void {
    if (originalArena) this.originalArena = originalArena;
    this._lastBgArena = arena;
    this._lastBgOriginalArena = originalArena;
    this._arenaHasIsoOccluders = arena.platforms.some(
      p => p.leftCollisionInset != null || p.bottomCollisionInset != null,
    );
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
    const octx = this._overlayCanvas.getContext('2d')! as unknown as CanvasRenderingContext2D;
    octx.setTransform(s, 0, 0, s, 0, 0);
    octx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const plat of arena.platforms) {
      draw(octx, plat, plat.y >= 650);
    }
  }


  // ---- Clouds ----

  private updateAndDrawClouds(ctx: CanvasRenderingContext2D, dt: number): void {
    const color = this.theme.clouds.color;
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x - cloud.size > CANVAS_WIDTH) {
        cloud.x = -cloud.size * 2;
      }
      drawCloudPrimitive(ctx, cloud.x, cloud.y, cloud.size, color);
    }
  }


  private drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean): void {
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
    const a = hexToRGB(hex);
    const b = hexToRGB(target);
    const r = Math.round(a.r + (b.r - a.r) * amount);
    const g = Math.round(a.g + (b.g - a.g) * amount);
    const bl = Math.round(a.b + (b.b - a.b) * amount);
    return `rgb(${r},${g},${bl})`;
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
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Reset diagnostics each frame
    this._diag = freshDiag();
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

    // Players (iso clip applied when applicable — see findIsoOccluders).
    const useIsoClip = this._arenaHasIsoOccluders;
    for (const player of matchState.players) {
      if (!player.active) continue;
      if (player.state === 'respawning') continue;
      const occluders = useIsoClip ? findIsoOccluders(player, arena.platforms) : null;
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

    // Foreground nature -- delegated to theme (pass original arena, canvas transform handles mirroring)
    const themeArena = this.originalArena ?? arena;
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    this.theme.drawForegroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }

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
    if (this._lobbyOverlayFn) {
      this._renderLobbyOverlay(matchState);
      return;
    }
    const hudDirty = isHudDirty(matchState);
    if (this.hudCtx) {
      this._renderOverlayLayer(matchState, arena, hudDirty);
    } else {
      this._drawOverlayContent(this.fgCtx, matchState, arena, hudDirty);
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
    const hasOverlayContent = hasCountdown || hasFlash || hasAnimations || hasNavDebug || hasNetDebug;

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

    if (matchState.screenFlash > 0) {
      d.screenFlash = true;
      const flashAlpha = Math.min(1, matchState.screenFlash / SCREEN_FLASH_DURATION);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }
}
