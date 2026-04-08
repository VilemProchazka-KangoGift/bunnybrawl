import type { Arena, Player, MatchState, Particle, Carrot, SpringMushroom, Thorn, WeatherParticle, WildlifeEntity, PlayerSlot, Gib, ConfettiParticle } from './types';
import { isBotSlot } from './types';
import type { ThemeConfig } from './themes/types';
import { aabbOverlap } from './physics';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CARROT_SIZE, SPRING_SIZE, FAT_SCALE,
  SCREEN_SHAKE_INTENSITY, HAZARD_GROW_TIME,
  SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION, SPRING_TRAIL_DURATION, SCORE_ANIM_DURATION,
  HITSTOP_DURATION, HITSTOP_ZOOM,
} from './constants';
import { drawCloud as drawCloudPrimitive, drawHill, drawPlatformMoss } from './themes/drawPrimitives';
import { hexToRGB } from './fastMath';
import { getCharacterEmoji, hasCustomEyes, getSpriteRenderer, getGibRenderer, getCharacterPack, getCharacterDisplayName } from './characters';
import { drawHighlightSpot, drawFurEdge } from './spriteShading';
import type { BodyEllipseParams } from './spriteShading';
import { debugFlags } from './debugFlags';
import { drawNavDebugOverlay } from './navDebugOverlay';
import type { BotNavDebugState } from './navDebugOverlay';
import i18n from '../i18n';

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

function lerpCh(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t); }

const _hazardAnim = { growScale: 1, fadeAlpha: 1 };
function calcHazardAnim(growTimer: number, life: number) {
  _hazardAnim.growScale = growTimer > 0 ? 1 - (growTimer / HAZARD_GROW_TIME) : 1;
  _hazardAnim.fadeAlpha = life < 2 ? life / 2 : 1;
  return _hazardAnim;
}

const _nearCarrotSet = new Set<PlayerSlot>();

export class Renderer {
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
  private clouds: Cloud[] = [];
  private lastCloudTime = 0;
  private theme: ThemeConfig;
  private frameTime = 0; // cached performance.now() per frame

  // Gradient caches (avoid per-frame creation)
  private cachedLavaGradients: Map<string, { body: CanvasGradient; halo: CanvasGradient }> = new Map();
  private cachedZeroGBgGradients: Map<string, CanvasGradient> = new Map();
  private cachedGhostGlowGradients: Map<string, CanvasGradient> = new Map();
  private cachedJellyGradients: Map<string, CanvasGradient> = new Map();
  private _fogRGB: { r: number; g: number; b: number } | null = null;
  private _ambientRGBs: { r: number; g: number; b: number }[] | null = null;

  // HUD cache
  private hudCache: OffscreenCanvas | null = null;
  private hudCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
  private hudLastTimer: number = -1;
  private hudLastPlayerCount: number = -1;
  private _hudPlayerScores: Record<string, number> = {};
  private _hudPlayerActive: Record<string, boolean> = {};
  // Shared between _drawHUDImpl and _drawScoreAnimations
  private _hudActivePlayers: Player[] = [];
  private _hudStartX: number = 0;
  private _hudScoreWidth: number = 0;

  // Sprite cache: key → OffscreenCanvas with pre-drawn character sprite
  private spriteCache = new Map<string, OffscreenCanvas>();
  private mirrored = false;
  private originalArena: Arena | null = null;  // un-mirrored arena for theme draw calls
  private _botNavDebugStates: BotNavDebugState[] = [];

  constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, theme: ThemeConfig, mirrored = false) {
    this.bgCtx = bgCanvas.getContext('2d')!;
    this.fgCtx = fgCanvas.getContext('2d')!;
    this.theme = theme;
    this.mirrored = mirrored;

    bgCanvas.width = CANVAS_WIDTH;
    bgCanvas.height = CANVAS_HEIGHT;
    fgCanvas.width = CANVAS_WIDTH;
    fgCanvas.height = CANVAS_HEIGHT;

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

  setBotNavDebugStates(states: BotNavDebugState[]): void {
    this._botNavDebugStates = states;
  }

  renderBackground(arena: Arena, originalArena?: Arena): void {
    if (originalArena) this.originalArena = originalArena;
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

    // Far background (distant scenery — treelines, mountains)
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
      this.drawGibShape(ctx, gib);
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

  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[]): void {
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cache time once per frame
    this.frameTime = performance.now();

    ctx.save();

    // Hitstop zoom punch — subtle scale centered on screen
    if (matchState.hitstopZoom > 0) {
      const t = matchState.hitstopZoom / HITSTOP_DURATION; // 1 → 0
      const scale = 1 + HITSTOP_ZOOM * t * t;              // ease-out
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(scale, scale);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    }

    // Screen shake offset
    if (matchState.screenShake > 0) {
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

    // Weather (leaves, petals)
    this.drawWeather(ctx, matchState.weather);

    // Wildlife: butterflies + birds (q) — drawn after clouds/weather, before springs
    if (matchState.wildlife) {
      this.drawWildlife(ctx, matchState.wildlife);
    }

    // Theme-specific animated background (e.g. space objects through windows)
    if (this.theme.drawAnimatedBackground) {
      const thA = this.originalArena ?? arena;
      if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
      this.theme.drawAnimatedBackground(ctx, thA, matchState.timeElapsed);
      if (this.mirrored) { ctx.restore(); }
    }

    // Hazard zones (lava pools etc.)
    if (arena.hazardZones) {
      for (const hz of arena.hazardZones) {
        this.drawHazardZone(ctx, hz, matchState.timeElapsed);
      }
    }

    // Effect zones (zero-G, currents, geysers)
    if (arena.effectZones) {
      let geyserIdx = 0;
      for (let zi = 0; zi < arena.effectZones.length; zi++) {
        const zone = arena.effectZones[zi];
        if (zone.type === 'zero_g') {
          this.drawZeroGZone(ctx, zone, matchState.timeElapsed);
        } else if (zone.type === 'current') {
          this.drawCurrentZone(ctx, zone, matchState.timeElapsed);
        } else if (zone.type === 'geyser') {
          const gs = matchState.geyserStates[geyserIdx];
          if (gs) this.drawGeyser(ctx, zone, gs, matchState.timeElapsed);
          geyserIdx++;
        }
      }
    }

    // Bouncy platform wobble
    if (arena.bouncyPlatforms) {
      for (const bi of arena.bouncyPlatforms) {
        const bp = arena.platforms[bi];
        if (!bp) continue;
        const wobble = matchState.bouncyWobble.get(bi) || 0;
        this.drawBouncyPlatformOverlay(ctx, bp, wobble, matchState.timeElapsed);
      }
    }

    // Pigeon flocks
    for (const flock of matchState.pigeonFlocks) {
      this.drawPigeonFlock(ctx, flock, matchState.timeElapsed);
    }


    // Lava rocks (falling hazards)
    for (const rock of matchState.lavaRocks) {
      if (!rock.active) continue;
      this.drawLavaRock(ctx, rock);
    }

    // Springs and thorns (behind players)
    for (const spring of matchState.springs) this.drawSpringMushroom(ctx, spring);
    for (const thorn of matchState.thorns) this.drawThorn(ctx, thorn);

    // Carrots
    for (const carrot of matchState.carrots) {
      if (carrot.active) this.drawCarrot(ctx, carrot, matchState.timeElapsed);
    }

    // Particles
    this.drawParticles(ctx, particles);

    // Gibs and confetti
    if (matchState.gibs.length > 0) this.drawGibs(ctx, matchState.gibs);
    if (matchState.confetti.length > 0) this.drawConfetti(ctx, matchState.confetti);

    // Stomp shockwaves (e) — after particles, before players
    if (matchState.shockwaves) {
      for (const sw of matchState.shockwaves) {
        const progress = 1 - sw.life / SHOCKWAVE_DURATION;
        const alpha = sw.life / SHOCKWAVE_DURATION;
        const radius = sw.radius;
        const lineW = Math.max(1, 4 * (1 - progress));
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Afterimage ghost trails (drawn behind players)
    for (const player of matchState.players) {
      if (!player.active) continue;
      if (player.state === 'respawning') continue;
      const afterimages = player.afterimages;
      if (afterimages && afterimages.length > 0) {
        const isInvincible = player.invincibleTimer > 0;
        const trailColor = isInvincible ? '#88BBFF' : player.character.color;
        for (const img of afterimages) {
          ctx.save();
          ctx.globalAlpha = img.alpha;
          ctx.fillStyle = trailColor;
          ctx.beginPath();
          ctx.ellipse(
            img.x + player.width / 2,
            img.y + player.height * 0.55,
            player.width * 0.38,
            player.height * 0.38,
            0, 0, Math.PI * 2
          );
          ctx.fill();
          ctx.restore();
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
      this.drawPlayer(ctx, player, nearCarrotSet.has(player.id));
    }

    // Spring spiral trail (h) — drawn near players
    for (const player of matchState.players) {
      if (!player.active || player.state === 'respawning') continue;
      if (player.springTrailTimer > 0) {
        this.drawSpringTrail(ctx, player);
      }
    }

    // Zero-G character effect — shimmer around players in zero-G zones
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
            break;
          }
        }
      }
    }

    // Ground fog (o) — after players, before foreground nature
    if (matchState.fogParticles) {
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

    // Foreground nature — delegated to theme (pass original arena, canvas transform handles mirroring)
    const themeArena = this.originalArena ?? arena;
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    this.theme.drawForegroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }

    // Ghosts (drawn over foreground, semi-transparent)
    for (const ghost of matchState.ghosts) {
      this.drawGhost(ctx, ghost, matchState.timeElapsed);
    }

    // Ambient particles (pollen / snow drift / sparkles)
    if (matchState.pollenParticles) {
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
      this.drawFireworks(ctx, particles);
    }

    // Day/night cycle overlay (only if theme has it enabled)
    if (this.theme.dayNight.enabled && matchState.dayPhase !== undefined) {
      this.drawDayNightCycle(ctx, matchState.dayPhase, matchState);
    }

    ctx.restore();

    // Countdown overlay
    if (matchState.countdown !== undefined && matchState.countdown > 0) {
      this.drawCountdown(ctx, matchState.countdown);
    }

    // HUD (not affected by shake)
    this.drawHUD(ctx, matchState);

    // Nav debug overlay (dev only — ?debug=nav)
    if (debugFlags.navDebugEnabled) {
      drawNavDebugOverlay(ctx, arena, this.mirrored, this._botNavDebugStates);
    }

    // Screen flash (f) — drawn after everything
    if (matchState.screenFlash > 0) {
      const flashAlpha = Math.min(1, matchState.screenFlash / SCREEN_FLASH_DURATION);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
  }

  // ---- Weather ----

  private drawWeather(ctx: CanvasRenderingContext2D, weather: WeatherParticle[]): void {
    const customDraw = this.theme.drawWeatherParticle;
    for (const w of weather) {
      if (customDraw) {
        customDraw(ctx, w);
        continue;
      }
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);
      if (w.type === 'leaf') {
        ctx.fillStyle = 'rgba(90, 160, 60, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 120, 40, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-w.size * 0.7, 0);
        ctx.lineTo(w.size * 0.7, 0);
        ctx.stroke();
      } else if (w.type === 'petal') {
        ctx.fillStyle = 'rgba(255, 180, 200, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (w.type === 'snow') {
        ctx.fillStyle = w.color || 'rgba(230, 240, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(0, 0, w.size, 0, Math.PI * 2);
        ctx.fill();
        if (w.size > 3.5) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(0, -w.size * 0.3, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (w.type === 'ember') {
        ctx.fillStyle = w.color || 'rgba(255, 120, 30, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, w.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, w.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (w.type === 'ash') {
        ctx.fillStyle = w.color || 'rgba(150, 150, 150, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- Game objects ----

  private drawCarrot(ctx: CanvasRenderingContext2D, carrot: Carrot, timeElapsed: number): void {
    const x = carrot.x;
    const y = carrot.y;
    const bob = Math.sin(this.frameTime / 300) * 3;
    const age = timeElapsed - carrot.spawnTime;

    // Spawn glow ring (fades over 2 seconds)
    if (age < 2) {
      const ring = 1 - age / 2;
      ctx.strokeStyle = `rgba(255, 200, 50, ${ring * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + CARROT_SIZE / 2 + bob, 20 + age * 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y + CARROT_SIZE / 2 + bob);
    ctx.rotate(-0.3); // tilted sideways

    const hw = CARROT_SIZE * 0.35;
    const hh = CARROT_SIZE * 0.65;

    // Carrot body (big, sideways)
    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(hh, 0);
    ctx.quadraticCurveTo(hh * 0.3, -hw, -hh * 0.3, -hw * 0.7);
    ctx.quadraticCurveTo(-hh, 0, -hh * 0.3, hw * 0.7);
    ctx.quadraticCurveTo(hh * 0.3, hw, hh, 0);
    ctx.fill();

    // Stripes
    ctx.strokeStyle = '#E07000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hh * 0.2, -hw * 0.5);
    ctx.lineTo(hh * 0.2, hw * 0.5);
    ctx.moveTo(-hh * 0.15, -hw * 0.4);
    ctx.lineTo(-hh * 0.15, hw * 0.4);
    ctx.stroke();

    // Green top (left side)
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.ellipse(-hh * 0.6, -3, 4, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-hh * 0.6, 3, 4, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2EA52E';
    ctx.beginPath();
    ctx.ellipse(-hh * 0.7, 0, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Sparkle
    const sparkle = Math.sin(this.frameTime / 200) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255,255,200,${sparkle * 0.8})`;
    ctx.beginPath();
    ctx.arc(x + 8, y + 4 + bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSpringMushroom(ctx: CanvasRenderingContext2D, spring: SpringMushroom): void {
    const x = spring.x;
    const y = spring.y;
    const squash = spring.bounceTimer > 0 ? Math.sin(spring.bounceTimer * 20) * 5 : 0;
    const s = SPRING_SIZE * 1.4;

    const { growScale, fadeAlpha } = calcHazardAnim(spring.growTimer, spring.life);

    // Custom spring renderer
    if (this.theme.drawCustomSpring) {
      this.theme.drawCustomSpring(ctx, x, y, s, squash, growScale, fadeAlpha);
      return;
    }

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(x, y);
    ctx.scale(growScale, growScale);
    ctx.translate(-x, -y);

    // Stem
    ctx.fillStyle = '#F5F0E0';
    ctx.fillRect(x - 6, y - s * 0.7 + squash, 12, s * 0.7 - squash);

    // Spring coils on stem
    ctx.strokeStyle = '#AAA';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const cy = y - 4 - i * 6;
      ctx.beginPath();
      ctx.moveTo(x - 5, cy);
      ctx.lineTo(x + 5, cy - 3);
      ctx.stroke();
    }

    // Cap
    ctx.fillStyle = '#2ECC40';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.7 + squash, s * 0.7, s * 0.4 - squash * 0.5, 0, Math.PI, 0);
    ctx.fill();

    // Cap highlight
    ctx.fillStyle = '#5DDE70';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.8 + squash, s * 0.4, s * 0.15, 0, Math.PI, 0);
    ctx.fill();

    // Spots
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(x - 6, y - s * 0.85 + squash, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 6, y - s * 0.75 + squash, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - s * 0.9 + squash, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawThorn(ctx: CanvasRenderingContext2D, thorn: Thorn): void {
    const { x, y, width, height } = thorn;

    const { growScale, fadeAlpha } = calcHazardAnim(thorn.growTimer, thorn.life);

    // Custom thorn renderer (e.g. zombie hand)
    if (this.theme.drawCustomThorn) {
      this.theme.drawCustomThorn(ctx, x, y, width, height, growScale, fadeAlpha);
      return;
    }

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(x + width / 2, y + height);
    ctx.scale(growScale, growScale);
    ctx.translate(-(x + width / 2), -(y + height));

    // Vine base
    ctx.fillStyle = '#3A5C1E';
    ctx.fillRect(x, y + height - 4, width, 4);

    // Spikes
    const spikeCount = Math.floor(width / 7);
    for (let i = 0; i < spikeCount; i++) {
      const sx = x + 4 + i * (width / spikeCount);
      const spikeH = height + 4 + (i % 2) * 3;
      ctx.fillStyle = '#5C3A1E';
      ctx.beginPath();
      ctx.moveTo(sx - 4, y + height - 4);
      ctx.lineTo(sx, y + height - spikeH);
      ctx.lineTo(sx + 4, y + height - 4);
      ctx.fill();
      ctx.fillStyle = '#DD2222';
      ctx.beginPath();
      ctx.arc(sx, y + height - spikeH + 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ---- Hazard zones ----

  private drawHazardZone(ctx: CanvasRenderingContext2D, hz: { x: number; y: number; width: number; height: number; type: string }, time: number): void {
    if (this.theme.drawCustomHazardZone) {
      this.theme.drawCustomHazardZone(ctx, hz.x, hz.y, hz.width, hz.height, time);
      return;
    }
    ctx.save();
    if (hz.type === 'lava') {
      // Animated lava pool
      const pulse = 0.7 + Math.sin(time * 3) * 0.15;

      // Lava body + halo (cached gradients)
      const lavaKey = `${hz.x}_${hz.y}`;
      let cachedLava = this.cachedLavaGradients.get(lavaKey);
      if (!cachedLava) {
        const body = ctx.createLinearGradient(hz.x, hz.y, hz.x, hz.y + hz.height);
        body.addColorStop(0, '#FF6600');
        body.addColorStop(0.5, '#FF4400');
        body.addColorStop(1, '#CC2200');
        const halo = ctx.createRadialGradient(
          hz.x + hz.width / 2, hz.y + hz.height / 2, 2,
          hz.x + hz.width / 2, hz.y + hz.height / 2, hz.width * 0.8
        );
        halo.addColorStop(0, 'rgba(255, 100, 0, 0.3)');
        halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
        cachedLava = { body, halo };
        this.cachedLavaGradients.set(lavaKey, cachedLava);
      }
      ctx.fillStyle = cachedLava.body;
      ctx.beginPath();
      ctx.ellipse(hz.x + hz.width / 2, hz.y + hz.height / 2, hz.width / 2, hz.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bright center (pulsing)
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#FFCC33';
      ctx.beginPath();
      ctx.ellipse(hz.x + hz.width / 2, hz.y + hz.height / 2, hz.width * 0.3, hz.height * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glow halo
      ctx.globalAlpha = 0.15 + Math.sin(time * 2) * 0.05;
      ctx.fillStyle = cachedLava.halo;
      ctx.fillRect(hz.x - hz.width * 0.3, hz.y - hz.height, hz.width * 1.6, hz.height * 3);

      // Bubble spots
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#FFAA00';
      const bubbleX = hz.x + hz.width * (0.3 + Math.sin(time * 4) * 0.15);
      const bubbleY = hz.y + hz.height * 0.3;
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Ghost entities ----

  private drawGhost(ctx: CanvasRenderingContext2D, ghost: { x: number; y: number; size: number; alpha: number; wobblePhase: number }, time: number): void {
    // Custom ghost renderer (e.g. wasps)
    if (this.theme.drawCustomGhost) {
      this.theme.drawCustomGhost(ctx, ghost.x, ghost.y + Math.sin(ghost.wobblePhase + time * 2) * 3, ghost.size, ghost.alpha, time);
      return;
    }
    ctx.save();
    const wobble = Math.sin(ghost.wobblePhase + time * 2) * 3;
    ctx.translate(ghost.x, ghost.y + wobble);
    ctx.globalAlpha = ghost.alpha * (0.5 + Math.sin(time * 1.5) * 0.15);

    const gc = this.theme.ghostConfig;
    const color = gc?.color || '#AABBDD';
    const glowColor = gc?.glowColor || '#6688BB';
    const s = ghost.size;

    // Ghost glow (cached gradient)
    const gKey = `${s}_${glowColor}`;
    let glow = this.cachedGhostGlowGradients.get(gKey);
    if (!glow) {
      glow = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.5);
      glow.addColorStop(0, glowColor + '33');
      glow.addColorStop(1, glowColor + '00');
      this.cachedGhostGlowGradients.set(gKey, glow);
    }
    ctx.fillStyle = glow;
    ctx.fillRect(-s * 1.5, -s * 1.5, s * 3, s * 3);

    // Ghost body (rounded top, wavy bottom)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -s * 0.2, s * 0.5, Math.PI, 0);
    ctx.lineTo(s * 0.5, s * 0.3);
    // Wavy bottom
    const waves = 4;
    for (let w = 0; w < waves; w++) {
      const wx = s * 0.5 - (w + 1) * (s / waves);
      const wy = s * 0.3 + Math.sin(time * 3 + w * 1.5) * s * 0.08;
      const cx = wx + s / (waves * 2);
      ctx.quadraticCurveTo(cx, wy + s * 0.12, wx, wy);
    }
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.02, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---- Effect zones ----

  private drawLavaRock(ctx: CanvasRenderingContext2D, rock: { x: number; y: number; size: number; rotation: number }): void {
    const lrc = this.theme.lavaRockConfig;
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.rotation);
    // Glow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = lrc?.glowColor || '#FF6600';
    ctx.beginPath();
    ctx.arc(0, 0, rock.size * 1.8, 0, Math.PI * 2);
    ctx.fill();
    // Rock body — jagged
    ctx.globalAlpha = 1;
    ctx.fillStyle = lrc?.color || '#4A2010';
    ctx.beginPath();
    const s = rock.size;
    ctx.moveTo(-s, -s * 0.3);
    ctx.lineTo(-s * 0.5, -s);
    ctx.lineTo(s * 0.3, -s * 0.8);
    ctx.lineTo(s, -s * 0.2);
    ctx.lineTo(s * 0.7, s * 0.6);
    ctx.lineTo(-s * 0.2, s * 0.8);
    ctx.lineTo(-s * 0.8, s * 0.3);
    ctx.closePath();
    ctx.fill();
    // Hot cracks
    ctx.strokeStyle = '#FF8800';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.5);
    ctx.lineTo(s * 0.1, s * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.3);
    ctx.lineTo(-s * 0.1, s * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  private drawZeroGZone(ctx: CanvasRenderingContext2D, zone: { x: number; y: number; width: number; height: number }, time: number): void {
    ctx.save();

    // Pulsing background fill (cached gradient)
    ctx.globalAlpha = 0.1 + Math.sin(time * 1.5) * 0.04;
    const zKey = `${zone.x}_${zone.y}`;
    let bgGrad = this.cachedZeroGBgGradients.get(zKey);
    if (!bgGrad) {
      bgGrad = this.fgCtx.createLinearGradient(zone.x, zone.y, zone.x, zone.y + zone.height);
      bgGrad.addColorStop(0, 'rgba(0, 180, 255, 0.2)');
      bgGrad.addColorStop(0.5, 'rgba(0, 220, 255, 0.08)');
      bgGrad.addColorStop(1, 'rgba(0, 180, 255, 0.2)');
      this.cachedZeroGBgGradients.set(zKey, bgGrad);
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);

    // Animated dashed border — double line
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#00CCFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -time * 30;
    ctx.strokeRect(zone.x + 1, zone.y + 1, zone.width - 2, zone.height - 2);
    ctx.setLineDash([]);

    // Corner brackets for emphasis
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    const bLen = 15;
    const corners = [
      [zone.x, zone.y], [zone.x + zone.width, zone.y],
      [zone.x, zone.y + zone.height], [zone.x + zone.width, zone.y + zone.height],
    ];
    for (const [cx, cy] of corners) {
      const sx = cx === zone.x ? 1 : -1;
      const sy = cy === zone.y ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + sx * bLen, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * bLen);
      ctx.stroke();
    }

    // Floating particles drifting upward
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 12; i++) {
      const px = zone.x + 15 + (i * 47) % zone.width;
      const py = zone.y + zone.height - ((time * 25 + i * 30) % zone.height);
      const pSize = 1.5 + Math.sin(time + i) * 0.5;
      ctx.fillStyle = i % 2 === 0 ? '#44EEFF' : '#88CCFF';
      ctx.beginPath();
      ctx.arc(px + Math.sin(time * 1.5 + i) * 5, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // "0G" label
    ctx.globalAlpha = 0.2;
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#00DDFF';
    ctx.textAlign = 'center';
    ctx.fillText('0G', zone.x + zone.width / 2, zone.y + zone.height / 2 + 5);

    ctx.restore();
  }

  private drawCurrentZone(ctx: CanvasRenderingContext2D, zone: { x: number; y: number; width: number; height: number; vx?: number; vy?: number }, time: number): void {
    ctx.save();

    // Vertical waterfall current
    if (zone.vy && Math.abs(zone.vy) > Math.abs(zone.vx || 0)) {
      const zx = zone.x, zy = zone.y, zw = zone.width, zh = zone.height;
      const cx = zx + zw / 2;

      // Water body — vertical gradient from blue-white at top to deeper blue at bottom
      const waterGrad = ctx.createLinearGradient(0, zy, 0, zy + zh);
      waterGrad.addColorStop(0, 'rgba(140, 200, 240, 0.45)');
      waterGrad.addColorStop(0.3, 'rgba(100, 180, 230, 0.4)');
      waterGrad.addColorStop(1, 'rgba(70, 150, 210, 0.35)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = waterGrad;
      ctx.fillRect(zx, zy, zw, zh);

      // Wavy edges — clip the sharp rectangle into organic water shape
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      for (let side = 0; side < 2; side++) {
        const ex = side === 0 ? zx : zx + zw;
        const dir = side === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(ex + dir * 12, zy);
        for (let ey = zy; ey <= zy + zh; ey += 8) {
          const wave = Math.sin(ey * 0.03 + time * 2.5) * 5 + Math.sin(ey * 0.07 + time * 1.8) * 3;
          ctx.lineTo(ex + wave * dir * 0.5, ey);
        }
        ctx.lineTo(ex + dir * 12, zy + zh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Flowing water columns — wide semi-transparent bands moving downward
      const speed = Math.abs(zone.vy) * 0.3;
      const colCount = 5;
      for (let i = 0; i < colCount; i++) {
        const colW = 20 + (i % 3) * 12;
        const baseX = zx + 30 + (i * (zw - 60)) / colCount + Math.sin(time * 1.2 + i * 1.7) * 10;
        const colLen = 80 + (i % 3) * 40;
        const colY = zy + ((time * speed + i * 97) % (zh + colLen)) - colLen;
        const y1 = Math.max(colY, zy);
        const y2 = Math.min(colY + colLen, zy + zh);
        if (y1 >= y2) continue;
        ctx.globalAlpha = 0.15 + 0.05 * Math.sin(time * 1.5 + i);
        ctx.fillStyle = '#D0EAFF';
        ctx.beginPath();
        ctx.ellipse(baseX, (y1 + y2) / 2, colW / 2, (y2 - y1) / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // White foam streaks — thin fast lines for motion feel
      const streakCount = Math.max(14, Math.round(zw / 20));
      ctx.lineWidth = 1.5;
      for (let i = 0; i < streakCount; i++) {
        const sx = zx + 8 + ((i * 29 + Math.sin(i * 3.1) * 15) % (zw - 16));
        const streakLen = 40 + (i % 5) * 15;
        const sy = zy + ((time * speed * 1.2 + i * 37) % (zh + streakLen)) - streakLen;
        const y1 = Math.max(sy, zy);
        const y2 = Math.min(sy + streakLen, zy + zh);
        if (y1 >= y2) continue;
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(time * 2 + i * 0.8);
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(sx, y1);
        ctx.lineTo(sx + Math.sin(time * 0.8 + i) * 4, y2);
        ctx.stroke();
      }

      // Splash/foam at the bottom of the waterfall
      const foamY = zy + zh;
      for (let i = 0; i < 18; i++) {
        const fx = zx + 10 + (i / 18) * (zw - 20) + Math.sin(time * 3 + i * 1.3) * 8;
        const fy = foamY - 4 - Math.abs(Math.sin(time * 2.2 + i * 0.7)) * 18;
        const fr = 5 + Math.sin(time * 1.8 + i * 1.1) * 3;
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 1.5 + i);
        ctx.fillStyle = '#E8F4FF';
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright highlight down the center
      ctx.globalAlpha = 0.12;
      const hlGrad = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,1)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.fillRect(cx - 30, zy, 60, zh);

      ctx.restore();
      return;
    }

    // Horizontal current (original logic)
    const dir = (zone.vx || 0) > 0 ? 1 : -1;
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#4488CC';
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    // Flow arrows
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#88CCFF';
    ctx.lineWidth = 2;
    const spacing = 40;
    for (let dx = 0; dx < zone.width; dx += spacing) {
      const ax = zone.x + ((dx + time * Math.abs(zone.vx || 60)) % zone.width);
      const ay = zone.y + zone.height / 2;
      if (ax < zone.x || ax > zone.x + zone.width - 10) continue;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + dir * 12, ay);
      ctx.moveTo(ax + dir * 12, ay);
      ctx.lineTo(ax + dir * 7, ay - 4);
      ctx.moveTo(ax + dir * 12, ay);
      ctx.lineTo(ax + dir * 7, ay + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGeyser(ctx: CanvasRenderingContext2D, zone: { x: number; y: number; width: number; height: number }, gs: { active: boolean; activeTimer: number }, time: number): void {
    ctx.save();
    const cx = zone.x + zone.width / 2;
    if (gs.active) {
      // Active bubble column
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#88CCFF';
      ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      // Rising bubbles — count scales with zone width
      ctx.globalAlpha = 0.4;
      const bubbleCount = Math.max(8, Math.round(zone.width / 8));
      for (let i = 0; i < bubbleCount; i++) {
        const by = zone.y + zone.height - ((time * 80 + i * 20) % zone.height);
        const bx = cx + Math.sin(time * 3 + i * 1.5) * (zone.width * 0.3);
        const bs = 2 + (i % 3);
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, bs, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // Dormant — small bubbles at base
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 3; i++) {
        const bx = cx + Math.sin(time * 2 + i) * 5;
        const by = zone.y + zone.height - 5 - Math.abs(Math.sin(time * 1.5 + i * 2)) * 8;
        ctx.fillStyle = '#88BBDD';
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawBouncyPlatformOverlay(ctx: CanvasRenderingContext2D, bp: { x: number; y: number; width: number; height: number }, wobble: number, time: number): void {
    ctx.save();

    // Wobbly jelly surface — always visible
    const wobbleY = Math.sin(time * 3) * 2;
    ctx.globalAlpha = 0.25;
    const jellyKey = `${bp.x}_${bp.y}_${bp.height}`;
    let jellyGrad = this.cachedJellyGradients.get(jellyKey);
    if (!jellyGrad) {
      jellyGrad = this.fgCtx.createLinearGradient(bp.x, bp.y - 4, bp.x, bp.y + bp.height);
      jellyGrad.addColorStop(0, '#FF69B4');
      jellyGrad.addColorStop(0.5, '#FF99CC');
      jellyGrad.addColorStop(1, '#FF69B4');
      this.cachedJellyGradients.set(jellyKey, jellyGrad);
    }
    ctx.fillStyle = jellyGrad;
    ctx.beginPath();
    ctx.moveTo(bp.x, bp.y + bp.height);
    ctx.lineTo(bp.x, bp.y);
    // Wavy top edge
    for (let wx = bp.x; wx <= bp.x + bp.width; wx += 10) {
      const wy = bp.y - 2 + Math.sin(time * 4 + wx * 0.1) * 2 + wobbleY;
      ctx.lineTo(wx, wy);
    }
    ctx.lineTo(bp.x + bp.width, bp.y + bp.height);
    ctx.closePath();
    ctx.fill();

    // Bounce wobble — big jiggle effect
    if (wobble > 0) {
      const intensity = wobble * 5;
      const squash = Math.sin(wobble * 30) * intensity;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#FFB6C1';
      ctx.fillRect(bp.x - 2, bp.y - Math.abs(squash) - 2, bp.width + 4, bp.height + Math.abs(squash) + 2);
    }

    // Pulsing glow underneath
    ctx.globalAlpha = 0.1 + Math.sin(time * 2) * 0.05;
    ctx.fillStyle = '#FF69B4';
    ctx.fillRect(bp.x, bp.y + bp.height, bp.width, 4);

    // Up-arrow indicators
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFFFFF';
    const arrowCount = Math.max(2, Math.floor(bp.width / 35));
    for (let a = 0; a < arrowCount; a++) {
      const ax = bp.x + bp.width * (a + 0.5) / arrowCount;
      const ay = bp.y + bp.height / 2 + Math.sin(time * 3 + a) * 2;
      ctx.beginPath();
      ctx.moveTo(ax - 4, ay + 3);
      ctx.lineTo(ax, ay - 3);
      ctx.lineTo(ax + 4, ay + 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawPigeonFlock(ctx: CanvasRenderingContext2D, flock: { x: number; y: number; active: boolean; scatterParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number }> }, time: number): void {
    ctx.save();
    if (flock.active) {
      // Draw sitting pigeons (3 birds)
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 3; i++) {
        const px = flock.x - 10 + i * 10;
        const py = flock.y - 4;
        // Body
        ctx.fillStyle = '#7A7A8A';
        ctx.beginPath();
        ctx.ellipse(px, py, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(px + 4, py - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Beak
        ctx.fillStyle = '#CCAA44';
        ctx.beginPath();
        ctx.moveTo(px + 6, py - 3);
        ctx.lineTo(px + 8, py - 2.5);
        ctx.lineTo(px + 6, py - 2);
        ctx.fill();
        // Head bob
        if (Math.sin(time * 4 + i * 2) > 0.7) {
          ctx.fillStyle = '#7A7A8A';
          ctx.beginPath();
          ctx.arc(px + 4, py - 4, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Scatter particles (flying birds)
    for (const sp of flock.scatterParticles) {
      ctx.globalAlpha = Math.min(1, sp.life) * 0.6;
      ctx.fillStyle = '#6A6A7A';
      // Body
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings (flapping)
      const wing = Math.sin(sp.life * 30) * 6;
      ctx.beginPath();
      ctx.moveTo(sp.x - 3, sp.y);
      ctx.lineTo(sp.x - 8, sp.y + wing);
      ctx.lineTo(sp.x - 2, sp.y);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sp.x + 3, sp.y);
      ctx.lineTo(sp.x + 8, sp.y + wing);
      ctx.lineTo(sp.x + 2, sp.y);
      ctx.fill();
    }
    ctx.restore();
  }


  // ---- Foreground nature (drawn over players) ----


  // ---- Particles ----

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    for (const p of particles) {
      // Off-screen culling
      if (p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20) continue;
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- Gibs ----

  private drawGibs(ctx: CanvasRenderingContext2D, gibs: Gib[]): void {
    for (const gib of gibs) {
      // Off-screen culling
      if (gib.x < -40 || gib.x > CANVAS_WIDTH + 40 || gib.y < -40 || gib.y > CANVAS_HEIGHT + 40) continue;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(gib.x, gib.y);
      ctx.rotate(gib.rotation);
      this.drawGibShape(ctx, gib);
      ctx.restore();
    }
  }

  private drawGibShape(ctx: CanvasRenderingContext2D, gib: Gib): void {
    const { characterName, gibType, color, darkColor, lightColor } = gib;

    // Body gib is generic for all characters — colored oval
    if (gibType === 'body') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, gib.width / 2, gib.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Dispatch to character-specific gib renderer from pack registry
    const gibRenderer = getGibRenderer(characterName);
    gibRenderer(ctx, gibType, gib.width, gib.height, { color, darkColor, lightColor });
  }

  // ---- Confetti ----

  private drawConfetti(ctx: CanvasRenderingContext2D, confetti: ConfettiParticle[]): void {
    for (const c of confetti) {
      const alpha = c.life / c.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;

      switch (c.shape) {
        case 'star': {
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const aInner = a + Math.PI / 5;
            ctx.lineTo(Math.cos(a) * c.size, Math.sin(a) * c.size);
            ctx.lineTo(Math.cos(aInner) * c.size * 0.4, Math.sin(aInner) * c.size * 0.4);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'diamond': {
          const s = c.size;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.6, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.6, 0);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'ribbon': {
          const s = c.size;
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.3);
          ctx.quadraticCurveTo(0, -s * 0.8, s, -s * 0.3);
          ctx.lineTo(s, s * 0.3);
          ctx.quadraticCurveTo(0, s * 0.8, -s, s * 0.3);
          ctx.closePath();
          ctx.fill();
          break;
        }
        default: // circle
          ctx.beginPath();
          ctx.arc(0, 0, c.size, 0, Math.PI * 2);
          ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- Player drawing ----

  private drawPlayer(ctx: CanvasRenderingContext2D, player: Player, nearCarrot: boolean = false): void {
    const { x, y, width, height, character, state, facing, invincibleTimer, animFrame, fastFalling, fatTimer, slowTimer } = player;

    const cx = x + width / 2;
    const cy = y + height;

    // Character shadow — projected onto ground/platform below, shrinks with height
    if (state !== 'splat' && state !== 'respawning') {
      // Find the nearest platform surface below the player's feet
      let shadowY = 660; // default: ground
      // Check against a simple ground level — the renderer doesn't have arena access here,
      // so use the player's feet position when grounded, or project to 660 (ground) when airborne
      if (state === 'idle' || state === 'run') {
        shadowY = cy; // on ground — shadow at feet
      } else {
        shadowY = Math.min(cy + 200, 660); // project downward, cap at ground
      }
      const heightAboveShadow = Math.max(0, shadowY - cy);
      const shadowScale = Math.max(0.3, 1 - heightAboveShadow / 200);
      const shadowAlpha = 0.2 * shadowScale;
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, 10 * shadowScale, 2 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Kill streak flame aura (d) — drawn behind character sprite
    if (player.killStreak >= 3) {
      const now = this.frameTime / 1000;
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const angle = now * 3 + i * 1.5;
        const flameX = cx + Math.sin(angle) * 8;
        const flameY = y + height * 0.3 + Math.cos(angle * 1.3) * 4;
        const flameR = 8 + Math.sin(angle * 2) * 3;
        const colors = ['rgba(255, 100, 0, 0.3)', 'rgba(255, 60, 0, 0.25)', 'rgba(255, 200, 0, 0.2)', 'rgba(255, 0, 0, 0.2)'];
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(flameX, flameY, flameR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();

    if (invincibleTimer > 0 && Math.floor(invincibleTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // Thorn slow tint
    if (slowTimer > 0) {
      ctx.globalAlpha = Math.max(ctx.globalAlpha ?? 1, 0) * (0.7 + Math.sin(slowTimer * 8) * 0.15);
    }

    // Red pulse overlay when slowed by thorns
    const drawRedPulse = slowTimer > 0;

    // Squash/stretch from landing/jumping (centered on feet)
    const squashScale = player.squashScale;
    const sideSquash = player.sideSquash;
    const hasSideSquash = sideSquash !== 1;
    if (squashScale !== 1 || hasSideSquash) {
      const ssX = (1 + (1 - squashScale) * 0.5) * (hasSideSquash ? sideSquash : 1);
      const ssY = squashScale * (hasSideSquash ? 1 + (1 - sideSquash) * 0.4 : 1); // taller when side-squashed
      ctx.translate(cx, cy);
      ctx.scale(ssX, ssY);
      ctx.translate(-cx, -cy);
    }

    // Fat scaling
    const isFat = fatTimer > 0;
    if (isFat) {
      ctx.translate(cx, cy);
      ctx.scale(FAT_SCALE, FAT_SCALE);
      ctx.translate(-cx, -cy);
    }

    if (facing === 'left') {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }

    if (state === 'splat') {
      this.drawSplatCharacter(ctx, x, y, width, height, character.color, character.darkColor);
    } else {
      this.drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling, player.idleAnimTimer);
      this.drawExpression(ctx, player);
    }

    // White flash on killed character during hitstop
    if (player.hitstopTimer > 0 && state === 'splat') {
      const flashAlpha = Math.min(0.85, player.hitstopTimer / HITSTOP_DURATION);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + height - 4, width * 0.6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blush near carrot (c)
    if (nearCarrot && state !== 'splat') {
      ctx.fillStyle = 'rgba(255, 150, 180, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx - 8, y + height * 0.52, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 10, y + height * 0.52, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fire glow overlay when burning from lava
    if (player.burnTimer > 0) {
      const fireAlpha = Math.min(0.4, player.burnTimer * 0.5) * (0.6 + Math.sin(player.burnTimer * 12) * 0.4);
      const grad = ctx.createRadialGradient(cx, y + height * 0.4, 0, cx, y + height * 0.4, width * 0.7);
      grad.addColorStop(0, `rgba(255, 200, 0, ${fireAlpha * 0.6})`);
      grad.addColorStop(0.5, `rgba(255, 100, 0, ${fireAlpha * 0.4})`);
      grad.addColorStop(1, `rgba(255, 50, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, y + height * 0.4, width * 0.7, height * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (drawRedPulse) {
      // Red tint pulse overlay when hit by thorns (non-lava)
      const pulseAlpha = Math.abs(Math.sin(slowTimer * 8)) * 0.3;
      ctx.fillStyle = `rgba(255, 0, 0, ${pulseAlpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + height * 0.5, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Damage direction indicator (l)
    if (player.damageFlashTimer > 0 && player.damageFlashSide) {
      const flashAlpha = Math.min(0.5, player.damageFlashTimer * 3);
      const flashX = player.damageFlashSide === 'left' ? x : x + width - 4;
      ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
      ctx.fillRect(flashX, y, 4, height);
    }

    ctx.restore();
  }

  private drawCharacterSprite(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    char: { name: string; color: string; darkColor: string; lightColor: string },
    state: string, animFrame: number, fastFalling: boolean,
    idleAnimTimer?: number,
  ): void {
    const idleKey = (state === 'idle' && idleAnimTimer !== undefined && idleAnimTimer > 0 && idleAnimTimer < 0.5)
      ? Math.floor(idleAnimTimer * 10)
      : -1;
    const cacheKey = `${char.name}_${state}_${animFrame}_${fastFalling ? 1 : 0}_${idleKey}`;

    let cached = this.spriteCache.get(cacheKey);
    if (cached) {
      ctx.drawImage(cached, x - 10, y - 10);
      return;
    }

    // Cache miss: render to offscreen canvas with padding for ears/tails/legs
    const pad = 10;
    const cw = Math.ceil(w) + pad * 2;
    const ch = Math.ceil(h) + pad * 2;
    cached = new OffscreenCanvas(cw, ch);
    const sctx = cached.getContext('2d')! as unknown as CanvasRenderingContext2D;
    // Translate so the existing draw code (which uses absolute x,y) draws into the padded offscreen canvas
    sctx.translate(-x + pad, -y + pad);

    this._drawCharacterSpriteImpl(sctx, x, y, w, h, char, state, animFrame, fastFalling, idleAnimTimer);

    if (this.spriteCache.size > 600) {
      const first = this.spriteCache.keys().next().value;
      if (first !== undefined) this.spriteCache.delete(first);
    }
    this.spriteCache.set(cacheKey, cached);
    ctx.drawImage(cached, x - pad, y - pad);
  }

  private _drawCharacterSpriteImpl(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    char: { name: string; color: string; darkColor: string; lightColor: string },
    state: string, animFrame: number, fastFalling: boolean,
    idleAnimTimer?: number
  ): void {
    const cx = x + w / 2;
    const isAirborne = state === 'airborne';
    const isRunning = state === 'run';
    const bounce = isRunning ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
    const yOff = y - bounce;

    // Squash/stretch for fast fall (part of cache key, so safe to bake in)
    const scaleX = fastFalling ? 0.85 : 1;
    const scaleY = fastFalling ? 1.15 : 1;

    ctx.save();
    if (fastFalling) {
      ctx.translate(cx, yOff + h / 2);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-cx, -(yOff + h / 2));
    }

    // Idle animation — apply transform based on character pack's idleTransform setting
    const idleT = idleAnimTimer ?? -1;
    const isIdleAnim = idleT >= 0 && idleT < 0.5;
    if (isIdleAnim && state !== 'run' && state !== 'airborne') {
      const t = idleT / 0.5;
      const pulse = Math.sin(t * Math.PI);
      const pack = getCharacterPack(char.name);
      const idleType = pack?.idleTransform ?? 'headBob';
      if (idleType === 'headTilt') {
        ctx.translate(cx, yOff + h * 0.5);
        ctx.rotate(pulse * 0.12);
        ctx.translate(-cx, -(yOff + h * 0.5));
      } else if (idleType === 'headFlip') {
        const flipScale = 1 - pulse * 0.15;
        ctx.translate(cx, yOff + h * 0.5);
        ctx.scale(flipScale, 1);
        ctx.translate(-cx, -(yOff + h * 0.5));
      } else if (idleType === 'headBob') {
        ctx.translate(0, -pulse * 2);
      }
      // 'none' — no transform
    }

    // Body — dispatch to character-specific renderer from pack registry
    const spriteRenderer = getSpriteRenderer(char.name);
    const colors = { color: char.color, darkColor: char.darkColor, lightColor: char.lightColor };
    spriteRenderer(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors);

    // 3D shading overlays (highlight spot + fur edge)
    const pack = getCharacterPack(char.name);
    if (pack) {
      const bodyParams: BodyEllipseParams = pack.bodyEllipse(cx, yOff, w, h);
      drawHighlightSpot(ctx, bodyParams);
      drawFurEdge(ctx, bodyParams, char.darkColor, pack.furIntensity ?? 1.0);
    }

    // Eyes (generic — for characters without custom eyes)
    if (!hasCustomEyes(char.name)) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 4, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 6, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(cx - 3, yOff + h * 0.38, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 7, yOff + h * 0.38, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legs
    ctx.fillStyle = char.darkColor;
    const legSpread = isAirborne ? 3 : 0;
    const legAnim = isRunning ? Math.sin(animFrame * Math.PI) * 3 : 0;
    ctx.fillRect(cx - 8 - legSpread, yOff + h * 0.75 - legAnim, 6, 8 + (isAirborne ? 2 : 0));
    ctx.fillRect(cx + 2 + legSpread, yOff + h * 0.75 + legAnim, 6, 8 + (isAirborne ? 2 : 0));

    // Motion lines for airborne
    if (isAirborne && !fastFalling) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 3, yOff + h + 2);
      ctx.lineTo(cx - 3, yOff + h + 8);
      ctx.moveTo(cx + 3, yOff + h + 2);
      ctx.lineTo(cx + 3, yOff + h + 8);
      ctx.stroke();
    }

    // Fast-fall speed lines (g) — enhanced: more lines, longer, brighter
    if (fastFalling) {
      ctx.strokeStyle = 'rgba(255,255,220,0.8)';
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 5, yOff - 2);
        ctx.lineTo(cx + i * 5, yOff - 20);
        ctx.stroke();
      }
    }

    // Bubble helmet for space station and underwater arenas
    if (this.theme.id === 'space_station' || this.theme.id === 'underwater') {
      const hCx = cx + 1;
      const hCy = yOff + h * 0.38;
      const hRx = w * 0.52;
      const hRy = h * 0.42;
      // Glass dome
      ctx.beginPath();
      ctx.ellipse(hCx, hCy, hRx, hRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.id === 'underwater'
        ? 'rgba(180, 220, 255, 0.12)'
        : 'rgba(200, 230, 255, 0.10)';
      ctx.fill();
      ctx.strokeStyle = this.theme.id === 'underwater'
        ? 'rgba(140, 200, 255, 0.50)'
        : 'rgba(180, 210, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Highlight reflection arc (upper-left)
      ctx.beginPath();
      ctx.ellipse(hCx - hRx * 0.25, hCy - hRy * 0.2, hRx * 0.5, hRy * 0.45, -0.4, -Math.PI * 0.6, Math.PI * 0.3);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Small specular dot
      ctx.beginPath();
      ctx.arc(hCx - hRx * 0.3, hCy - hRy * 0.35, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
      // Collar ring at the base of the helmet
      ctx.beginPath();
      ctx.ellipse(hCx, hCy + hRy * 0.85, hRx * 0.7, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180, 190, 200, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140, 150, 160, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawSplatCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, darkColor: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h - 4, w * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 2;
    const eyeY = y + h - 6;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 8, eyeY - 2);
    ctx.lineTo(x + w / 2 - 4, eyeY + 2);
    ctx.moveTo(x + w / 2 - 4, eyeY - 2);
    ctx.lineTo(x + w / 2 - 8, eyeY + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2 + 4, eyeY - 2);
    ctx.lineTo(x + w / 2 + 8, eyeY + 2);
    ctx.moveTo(x + w / 2 + 8, eyeY - 2);
    ctx.lineTo(x + w / 2 + 4, eyeY + 2);
    ctx.stroke();
  }

  // ---- Fireworks ----

  private drawFireworks(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    const now = this.frameTime / 1000;
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

      // Trail lines behind fast-moving particles
      if (speed > 50) {
        const trailLen = Math.min(speed * 0.06, 20);
        const angle = Math.atan2(p.vy, p.vx);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha * 0.4;
        ctx.lineWidth = p.size * alpha * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(angle) * trailLen, p.y - Math.sin(angle) * trailLen);
        ctx.stroke();
      }

      // Main particle with glow
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Sparkle dots near particles
      const sparklePhase = Math.sin(now * 12 + p.x * 0.1 + p.y * 0.1);
      if (sparklePhase > 0.6) {
        ctx.globalAlpha = alpha * (sparklePhase - 0.6) * 2;
        ctx.fillStyle = '#FFF';
        const sparkleOffX = Math.sin(now * 7 + p.x) * 6;
        const sparkleOffY = Math.cos(now * 9 + p.y) * 6;
        ctx.beginPath();
        ctx.arc(p.x + sparkleOffX, p.y + sparkleOffY, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Cross sparkle shape
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x + sparkleOffX - 3, p.y + sparkleOffY);
        ctx.lineTo(p.x + sparkleOffX + 3, p.y + sparkleOffY);
        ctx.moveTo(p.x + sparkleOffX, p.y + sparkleOffY - 3);
        ctx.lineTo(p.x + sparkleOffX, p.y + sparkleOffY + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- Day/Night Cycle ----

  private drawDayNightCycle(ctx: CanvasRenderingContext2D, dayPhase: number, matchState?: MatchState): void {
    // dayPhase: 0 = noon, 0.5 = midnight, 1.0 = noon again
    // Use cosine so darkness peaks smoothly at 0.5
    const nightIntensity = Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);
    // nightIntensity: 0 at noon, 1 at midnight, smooth transition
    const overlayAlpha = nightIntensity * 0.55;

    // Sun: visible when nightIntensity < 0.8, arcs left→right during day half (0.75→0.0→0.25)
    // Remap dayPhase so sun progress 0→1 = sunrise→sunset
    const sunPhase = ((dayPhase + 0.25) % 1); // shift so 0=sunrise(6am), 0.5=sunset(6pm)
    let sunX = CANVAS_WIDTH / 2;
    let sunY = 80;
    if (sunPhase < 0.5) {
      const sunT = sunPhase / 0.5; // 0→1 across the day
      sunX = 60 + sunT * (CANVAS_WIDTH - 120);
      const sunArc = Math.sin(sunT * Math.PI);
      sunY = 130 - sunArc * 90;
      const sunAlpha = Math.min(1, (1 - nightIntensity) * 1.5);

      // Sun redshift: gold → deep orange as sun approaches horizon
      const sunRedshift = Math.max(0, (sunT - 0.55) / 0.45);

      if (sunAlpha > 0.05) {
        ctx.save();
        // Glow (gold → deep red, grows during sunset)
        ctx.globalAlpha = sunAlpha * (0.3 + sunRedshift * 0.2);
        ctx.fillStyle = `rgb(${lerpCh(255,240,sunRedshift)}, ${lerpCh(215,50,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 32 + sunRedshift * 16, 0, Math.PI * 2);
        ctx.fill();
        // Body (orange → crimson)
        ctx.globalAlpha = sunAlpha * 0.9;
        ctx.fillStyle = `rgb(${lerpCh(255,220,sunRedshift)}, ${lerpCh(165,30,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
        ctx.fill();
        // Bright center (gold → deep orange)
        ctx.fillStyle = `rgb(${lerpCh(255,255,sunRedshift)}, ${lerpCh(215,80,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Light rays from sun (m) — during daytime, warmed during sunset
        if (nightIntensity < 0.3) {
          ctx.save();
          const rayAlpha = 0.04 * (1 - nightIntensity / 0.3);
          ctx.fillStyle = `rgba(255, ${lerpCh(215,60,sunRedshift)}, ${lerpCh(100,15,sunRedshift)}, ${rayAlpha})`;
          for (let r = 0; r < 4; r++) {
            const angle = -0.3 + r * 0.2;
            const rayW = 60 + r * 20;
            ctx.beginPath();
            ctx.moveTo(sunX, sunY);
            ctx.lineTo(sunX + Math.cos(angle) * 400 - rayW / 2, CANVAS_HEIGHT);
            ctx.lineTo(sunX + Math.cos(angle) * 400 + rayW / 2, CANVAS_HEIGHT);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // Sunset afterglow: warm redshift overlay during golden hour
    // dayPhase 0.25 = sunset; ramp in 0.16→0.25, linger + fade 0.25→0.38
    let afterglowIntensity = 0;
    if (dayPhase > 0.16 && dayPhase < 0.38) {
      if (dayPhase < 0.25) {
        afterglowIntensity = (dayPhase - 0.16) / 0.09;
      } else {
        afterglowIntensity = 1 - (dayPhase - 0.25) / 0.13;
      }
      // Smoothstep for natural ramp
      afterglowIntensity = afterglowIntensity * afterglowIntensity * (3 - 2 * afterglowIntensity);
    }
    if (afterglowIntensity > 0.01) {
      ctx.save();
      // Gradient overlay: warm orange-red, stronger near horizon
      const agGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      agGrad.addColorStop(0, `rgba(220, 40, 10, ${afterglowIntensity * 0.10})`);
      agGrad.addColorStop(0.35, `rgba(240, 55, 15, ${afterglowIntensity * 0.20})`);
      agGrad.addColorStop(0.65, `rgba(230, 45, 10, ${afterglowIntensity * 0.28})`);
      agGrad.addColorStop(1.0, `rgba(200, 35, 10, ${afterglowIntensity * 0.22})`);
      ctx.fillStyle = agGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Darkness overlay
    if (overlayAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = `rgba(10, 12, 45, ${overlayAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Moon: visible when nightIntensity > 0.2, arcs during night half (0.25→0.5→0.75)
    const moonPhase = ((dayPhase + 0.75) % 1); // shift so 0=moonrise, 0.5=moonset
    if (moonPhase < 0.5) {
      const moonT = moonPhase / 0.5;
      const moonX = 60 + moonT * (CANVAS_WIDTH - 120);
      const moonArc = Math.sin(moonT * Math.PI);
      const moonY = 110 - moonArc * 70;
      const moonAlpha = Math.min(1, nightIntensity * 2);

      if (moonAlpha > 0.05) {
        ctx.save();
        // Glow
        ctx.globalAlpha = moonAlpha * 0.15;
        ctx.fillStyle = '#AABBDD';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
        ctx.fill();
        // Moon body
        ctx.globalAlpha = moonAlpha * 0.9;
        ctx.fillStyle = '#E8E8F0';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
        ctx.fill();
        // Crescent shadow
        ctx.fillStyle = `rgba(10, 12, 45, ${overlayAlpha + 0.3})`;
        ctx.beginPath();
        ctx.arc(moonX + 5, moonY - 2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Stars
    if (nightIntensity > 0.25) {
      const starAlpha = Math.min((nightIntensity - 0.25) / 0.5, 1) * 0.8;
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + 83) % CANVAS_WIDTH);
        const sy = ((i * 97 + 41) % (CANVAS_HEIGHT * 0.35));
        const size = 1 + (i % 3) * 0.5;
        const twinkle = Math.sin(this.frameTime / 500 + i * 1.7) * 0.3 + 0.7;
        const a = starAlpha * twinkle;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fireflies (conditional on theme)
    if (nightIntensity > 0.4 && this.theme.dayNight.showFireflies) {
      const fireflyAlpha = Math.min((nightIntensity - 0.4) / 0.4, 1) * 0.7;
      const now = this.frameTime / 1000;
      for (let i = 0; i < 8; i++) {
        const baseX = ((i * 173 + 57) % CANVAS_WIDTH);
        const baseY = 100 + ((i * 211 + 29) % (CANVAS_HEIGHT * 0.6));
        const fx = baseX + Math.sin(now * 0.5 + i * 2.3) * 30;
        const fy = baseY + Math.cos(now * 0.4 + i * 1.7) * 20;
        const pulse = Math.sin(now * 2 + i * 1.1) * 0.3 + 0.7;
        const a1 = fireflyAlpha * pulse * 0.3;
        ctx.fillStyle = `rgba(170,255,68,${a1})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 6, 0, Math.PI * 2);
        ctx.fill();
        const a2 = fireflyAlpha * pulse;
        ctx.fillStyle = `rgba(204,255,102,${a2})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shooting stars (n)
    if (matchState?.shootingStars) {
      ctx.save();
      for (const star of matchState.shootingStars) {
        const alpha = Math.min(1, star.life * 2);
        // Tail: line from current pos back along velocity
        const tailLen = star.tailLen;
        const angle = Math.atan2(star.vy, star.vx);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x - Math.cos(angle) * tailLen, star.y - Math.sin(angle) * tailLen);
        ctx.stroke();
        // Head: bright dot
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // ---- Countdown Overlay ----

  private drawCountdown(ctx: CanvasRenderingContext2D, countdown: number): void {
    const secs = Math.ceil(countdown);
    const frac = countdown - Math.floor(countdown);
    const text = secs > 0 ? `${secs}` : 'GO!';

    // Scale-up effect when number just ticked (fractional part near 1)
    const tickScale = frac > 0.8 ? 1 + (frac - 0.8) * 2.5 : 1;

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.scale(tickScale, tickScale);

    // Black stroke
    ctx.font = 'bold 80px "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.strokeText(text, 0, 0);

    // White fill
    ctx.fillStyle = '#FFF';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  // ---- Facial Expressions ----

  private drawExpression(ctx: CanvasRenderingContext2D, player: Player): void {
    const expression = player.expression;
    if (!expression || expression === 'normal') return;

    const { x, y, width, height } = player;
    const cx = x + width / 2;
    const isRunning = player.state === 'run';
    const bounce = isRunning ? Math.sin(player.animFrame * Math.PI / 2) * 2 : 0;
    const yOff = y - bounce;

    ctx.save();

    if (expression === 'angry') {
      // Two red-tinted angled lines above eyes (angry eyebrows)
      ctx.strokeStyle = 'rgba(200, 40, 40, 0.8)';
      ctx.lineWidth = 2;
      // Left eyebrow — angling inward-down
      ctx.beginPath();
      ctx.moveTo(cx - 8, yOff + height * 0.3);
      ctx.lineTo(cx - 2, yOff + height * 0.34);
      ctx.stroke();
      // Right eyebrow — angling inward-down
      ctx.beginPath();
      ctx.moveTo(cx + 10, yOff + height * 0.3);
      ctx.lineTo(cx + 4, yOff + height * 0.34);
      ctx.stroke();
    } else if (expression === 'scared') {
      // Sweat drop on the side of the head
      ctx.fillStyle = 'rgba(100, 180, 255, 0.7)';
      ctx.beginPath();
      // Teardrop shape
      ctx.moveTo(cx + width * 0.35, yOff + height * 0.2);
      ctx.quadraticCurveTo(cx + width * 0.42, yOff + height * 0.3, cx + width * 0.35, yOff + height * 0.35);
      ctx.quadraticCurveTo(cx + width * 0.28, yOff + height * 0.3, cx + width * 0.35, yOff + height * 0.2);
      ctx.fill();
    } else if (expression === 'dizzy') {
      // 3 small yellow stars circling above the head
      const now = this.frameTime / 1000;
      ctx.fillStyle = '#FFD700';
      for (let i = 0; i < 3; i++) {
        const angle = now * 3 + (i * Math.PI * 2 / 3);
        const starX = cx + Math.cos(angle) * 12;
        const starY = yOff - 4 + Math.sin(angle) * 5;
        // Draw small 4-point star
        ctx.beginPath();
        for (let p = 0; p < 4; p++) {
          const sa = (p / 4) * Math.PI * 2 - Math.PI / 2;
          const saInner = sa + Math.PI / 4;
          ctx.lineTo(starX + Math.cos(sa) * 3, starY + Math.sin(sa) * 3);
          ctx.lineTo(starX + Math.cos(saInner) * 1.2, starY + Math.sin(saInner) * 1.2);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ---- HUD ----

  private drawHUD(ctx: CanvasRenderingContext2D, state: MatchState): void {
    // Check if HUD needs redraw (no allocations — simple loop comparison)
    const timerSec = Math.floor(state.timeElapsed);
    let needsRedraw = timerSec !== this.hudLastTimer || !this.hudCache;
    if (!needsRedraw) {
      let activeCount = 0;
      for (const p of state.players) {
        if (p.active) activeCount++;
        if (p.score !== (this._hudPlayerScores?.[p.id as string] ?? -1)) { needsRedraw = true; break; }
        if (p.active !== (this._hudPlayerActive?.[p.id as string] ?? false)) { needsRedraw = true; break; }
      }
      if (!needsRedraw && activeCount !== this.hudLastPlayerCount) needsRedraw = true;
    }

    if (needsRedraw) {
      if (!this.hudCache) {
        this.hudCache = new OffscreenCanvas(CANVAS_WIDTH, 90);
        this.hudCacheCtx = this.hudCache.getContext('2d')!;
      }
      const hctx = this.hudCacheCtx!;
      hctx.clearRect(0, 0, CANVAS_WIDTH, 90);

      // Draw HUD content to cache
      this._drawHUDImpl(hctx as unknown as CanvasRenderingContext2D, state);

      this.hudLastTimer = timerSec;
      let ac = 0;
      for (const p of state.players) {
        this._hudPlayerScores[p.id as string] = p.score;
        this._hudPlayerActive[p.id as string] = p.active;
        if (p.active) ac++;
      }
      this.hudLastPlayerCount = ac;
    }

    // Blit cached HUD
    ctx.drawImage(this.hudCache!, 0, 0);

    // Score animations are drawn on main ctx (they're transient)
    if (state.scoreAnimations && state.scoreAnimations.length > 0) {
      this._drawScoreAnimations(ctx, state);
    }
  }

  private _drawHUDImpl(ctx: CanvasRenderingContext2D, state: MatchState): void {
    const activePlayers = state.players.filter(p => p.active);
    const scoreWidth = Math.min(160, Math.floor((CANVAS_WIDTH - 40) / activePlayers.length));
    const compact = scoreWidth < 130;
    const totalWidth = activePlayers.length * scoreWidth;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;

    // Store for _drawScoreAnimations
    this._hudActivePlayers = activePlayers;
    this._hudStartX = startX;
    this._hudScoreWidth = scoreWidth;

    for (let i = 0; i < activePlayers.length; i++) {
      const player = activePlayers[i];
      const px = startX + i * scoreWidth;
      const isBot = isBotSlot(player.id);

      ctx.fillStyle = isBot ? 'rgba(40, 20, 60, 0.55)' : 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.roundRect(px, 10, scoreWidth - 10, 40, 8);
      ctx.fill();

      // Character emoji
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getCharacterEmoji(player.character.name), px + 20, 30);
      ctx.textBaseline = 'alphabetic';

      const translatedName = getCharacterDisplayName(player.character.name, i18n.language);
      const displayName = compact ? translatedName.slice(0, 4) : translatedName;
      ctx.fillStyle = player.character.color;
      ctx.font = `bold ${compact ? 12 : 16}px "Press Start 2P", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(displayName, px + 38, 28);
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${compact ? 14 : 18}px "Press Start 2P", monospace`;
      ctx.fillText(`${player.score}`, px + 38, 45);

      // Small bot indicator
      if (isBot) {
        ctx.fillStyle = 'rgba(180, 140, 255, 0.7)';
        ctx.font = 'bold 7px monospace';
        ctx.fillText('BOT', px + 4, 18);
      }
    }

    if (state.timeElapsed >= 0) {
      const minutes = Math.floor(state.timeElapsed / 60);
      const seconds = Math.floor(state.timeElapsed % 60);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.roundRect(CANVAS_WIDTH / 2 - 40, 55, 80, 30, 6);
      ctx.fill();

      // Timer red pulse when < 30 seconds remaining (k)
      const settings = (state as any).settings as { timeLimit?: number } | undefined;
      const timeLimit = settings?.timeLimit ?? 0;
      const remaining = timeLimit > 0 ? timeLimit - state.timeElapsed : Infinity;
      if (remaining < 30 && remaining > 0) {
        const pulse = 1 + Math.sin(this.frameTime / 200) * 0.1;
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, 75);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, 0, 0);
        ctx.restore();
      } else {
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 75);
      }
    }
  }

  private _drawScoreAnimations(ctx: CanvasRenderingContext2D, state: MatchState): void {
    const activePlayers = this._hudActivePlayers;
    const startX = this._hudStartX;
    const scoreWidth = this._hudScoreWidth;

    for (const anim of state.scoreAnimations!) {
      const progress = 1 - anim.timer / SCORE_ANIM_DURATION;
      const yOffset = -20 * progress;
      const scale = 1.4 - progress * 0.4; // starts large, settles
      const alpha = 1 - progress * progress;

      // Find the player's HUD position
      const pidx = activePlayers.findIndex(p => p.id === anim.playerId);
      if (pidx < 0) continue;
      const px = startX + pidx * scoreWidth;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(px + scoreWidth / 2, 55 + yOffset);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${anim.value}`, 0, 0);
      ctx.restore();
    }
  }

  // ---- Wildlife (q) ----

  private drawWildlife(ctx: CanvasRenderingContext2D, wildlife: WildlifeEntity[]): void {
    for (const w of wildlife) {
      ctx.save();
      ctx.translate(w.x, w.y);

      if (w.type === 'butterfly') {
        // Butterfly: small colored V-shapes that flutter
        const wingAngle = Math.sin(w.wingPhase) * 0.6;
        ctx.fillStyle = w.color;
        // Left wing
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-6 * Math.cos(wingAngle), -4 * Math.abs(Math.sin(wingAngle)) - 3);
        ctx.lineTo(-3, 0);
        ctx.closePath();
        ctx.fill();
        // Right wing
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(6 * Math.cos(wingAngle), -4 * Math.abs(Math.sin(wingAngle)) - 3);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.fill();
        // Body
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.5, -1, 1, 3);
      } else if (w.type === 'fish') {
        // Fish: oval body + wagging tail
        const tailWag = Math.sin(w.wingPhase * 2) * 0.4;
        // Body
        ctx.fillStyle = w.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail fin
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(-12, -4 + tailWag * 4);
        ctx.lineTo(-12, 4 + tailWag * 4);
        ctx.closePath();
        ctx.fill();
        // Dorsal fin
        ctx.fillStyle = w.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(-2, -3);
        ctx.lineTo(1, -7);
        ctx.lineTo(4, -3);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        // Eye
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(4, -1, 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (w.type === 'bat') {
        // Bat: angular pointed wings with fast flap
        ctx.fillStyle = w.color;
        const wingFlap = Math.sin(w.wingPhase) * 5;
        // Left wing
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -2 + wingFlap * 0.3);
        ctx.lineTo(-10, wingFlap);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-4, 1);
        ctx.closePath();
        ctx.fill();
        // Right wing
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(4, -2 + wingFlap * 0.3);
        ctx.lineTo(10, wingFlap);
        ctx.lineTo(7, 0);
        ctx.lineTo(4, 1);
        ctx.closePath();
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Bird: simple M-shape silhouette
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 2;
        const wingFlap = Math.sin(w.wingPhase) * 4;
        ctx.beginPath();
        ctx.moveTo(-8, wingFlap);
        ctx.lineTo(-3, -3);
        ctx.lineTo(0, 0);
        ctx.lineTo(3, -3);
        ctx.lineTo(8, wingFlap);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ---- Spring spiral trail (h) ----

  private drawSpringTrail(ctx: CanvasRenderingContext2D, player: Player): void {
    const cx = player.x + player.width / 2;
    const baseY = player.y + player.height;
    const t = player.springTrailTimer / SPRING_TRAIL_DURATION; // 1 = just started, 0 = fading

    ctx.save();
    const pointCount = 12;
    for (let i = 0; i < pointCount; i++) {
      const progress = i / pointCount;
      const angle = progress * Math.PI * 4 + this.frameTime / 200; // spiral
      const radius = 6 + progress * 10;
      const py = baseY + progress * 30;
      const px = cx + Math.cos(angle) * radius;
      const alpha = t * (1 - progress) * 0.5;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#5DDE70';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 - progress, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
