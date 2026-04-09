import type { Arena, MatchState, Particle, PlayerSlot, Gib } from './types';
import type { ThemeConfig } from './themes/types';
import { aabbOverlap } from './physics';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SCREEN_SHAKE_INTENSITY,
  SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  HITSTOP_DURATION, HITSTOP_ZOOM,
} from './constants';
import { drawCloud as drawCloudPrimitive, drawHill, drawPlatformMoss } from './themes/drawPrimitives';
import { hexToRGB } from './fastMath';
import { debugFlags } from './debugFlags';
import { drawNavDebugOverlay } from './navDebugOverlay';
import type { BotNavDebugState } from './navDebugOverlay';
import { drawNetDebugOverlay } from './net/debugOverlay';
import type { NetDebugStats } from './net/rollback';

// Extracted rendering modules
import {
  drawCarrot, drawSpringMushroom, drawThorn,
  drawWeather, drawParticles, drawGibs, drawGibShape, drawConfetti, drawFireworks, drawWildlife, drawSpringTrail,
  drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock,
  drawDayNightCycle,
  drawHUD, drawCountdown, invalidateHudCache,
  drawPlayer,
} from './rendering';

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

const _nearCarrotSet = new Set<PlayerSlot>();

export class Renderer {
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
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

  setNetDebugStats(stats: NetDebugStats | null): void {
    this._netDebugStats = stats;
  }

  setPlayerNames(names: Record<string, string>): void {
    this._playerNames = names;
    invalidateHudCache();
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

  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[]): void {
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cache time once per frame
    this.frameTime = performance.now();

    ctx.save();

    // Hitstop zoom punch -- subtle scale centered on screen
    if (matchState.hitstopZoom > 0) {
      const t = matchState.hitstopZoom / HITSTOP_DURATION; // 1 -> 0
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
    drawWeather(ctx, matchState.weather, this.theme);

    // Wildlife: butterflies + birds (q) -- drawn after clouds/weather, before springs
    if (matchState.wildlife) {
      drawWildlife(ctx, matchState.wildlife);
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
        drawHazardZone(ctx, hz, matchState.timeElapsed, this.theme);
      }
    }

    // Effect zones (zero-G, currents, geysers)
    if (arena.effectZones) {
      let geyserIdx = 0;
      for (let zi = 0; zi < arena.effectZones.length; zi++) {
        const zone = arena.effectZones[zi];
        if (zone.type === 'zero_g') {
          drawZeroGZone(ctx, zone, matchState.timeElapsed, this.fgCtx);
        } else if (zone.type === 'current') {
          drawCurrentZone(ctx, zone, matchState.timeElapsed);
        } else if (zone.type === 'geyser') {
          const gs = matchState.geyserStates[geyserIdx];
          if (gs) drawGeyser(ctx, zone, gs, matchState.timeElapsed);
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
        drawBouncyPlatformOverlay(ctx, bp, wobble, matchState.timeElapsed, this.fgCtx);
      }
    }

    // Pigeon flocks
    for (const flock of matchState.pigeonFlocks) {
      drawPigeonFlock(ctx, flock, matchState.timeElapsed);
    }


    // Lava rocks (falling hazards)
    for (const rock of matchState.lavaRocks) {
      if (!rock.active) continue;
      drawLavaRock(ctx, rock, this.theme);
    }

    // Springs and thorns (behind players)
    for (const spring of matchState.springs) drawSpringMushroom(ctx, spring, this.theme);
    for (const thorn of matchState.thorns) drawThorn(ctx, thorn, this.theme);

    // Carrots
    for (const carrot of matchState.carrots) {
      if (carrot.active) drawCarrot(ctx, carrot, matchState.timeElapsed, this.frameTime);
    }

    // Particles
    drawParticles(ctx, particles);

    // Gibs and confetti
    if (matchState.gibs.length > 0) drawGibs(ctx, matchState.gibs);
    if (matchState.confetti.length > 0) drawConfetti(ctx, matchState.confetti);

    // Stomp shockwaves (e) -- after particles, before players
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
      drawPlayer(ctx, player, nearCarrotSet.has(player.id), this.frameTime, this.theme);
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
            break;
          }
        }
      }
    }

    // Ground fog (o) -- after players, before foreground nature
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

    // Foreground nature -- delegated to theme (pass original arena, canvas transform handles mirroring)
    const themeArena = this.originalArena ?? arena;
    if (this.mirrored) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-CANVAS_WIDTH, 0); }
    this.theme.drawForegroundNature(ctx, themeArena);
    if (this.mirrored) { ctx.restore(); }

    // Ghosts (drawn over foreground, semi-transparent)
    for (const ghost of matchState.ghosts) {
      drawGhost(ctx, ghost, matchState.timeElapsed, this.theme);
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
      drawFireworks(ctx, particles, this.frameTime);
    }

    // Day/night cycle overlay (only if theme has it enabled)
    if (this.theme.dayNight.enabled && matchState.dayPhase !== undefined) {
      drawDayNightCycle(ctx, matchState.dayPhase, matchState, this.frameTime, this.theme);
    }

    ctx.restore();

    // Countdown overlay
    if (matchState.countdown !== undefined && matchState.countdown > 0) {
      drawCountdown(ctx, matchState.countdown);
    }

    // HUD (not affected by shake)
    drawHUD(ctx, matchState, this.frameTime, this._playerNames);

    // Nav debug overlay (dev only -- ?debug=nav)
    if (debugFlags.navDebugEnabled) {
      drawNavDebugOverlay(ctx, arena, this.mirrored, this._botNavDebugStates);
    }

    // Net debug overlay (dev only -- ?debug=net)
    if (debugFlags.netDebugEnabled && this._netDebugStats) {
      drawNetDebugOverlay(ctx, this._netDebugStats, CANVAS_WIDTH);
    }

    // Screen flash (f) -- drawn after everything
    if (matchState.screenFlash > 0) {
      const flashAlpha = Math.min(1, matchState.screenFlash / SCREEN_FLASH_DURATION);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
  }
}
