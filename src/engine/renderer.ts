import type { Arena, Player, SplatMark, MatchState, Particle, Platform, Carrot, SpringMushroom, Thorn, WeatherParticle } from './types';
import { CHARACTERS } from './characters';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CARROT_SIZE, SPRING_SIZE, FAT_SCALE,
  SCREEN_SHAKE_INTENSITY, HAZARD_GROW_TIME,
} from './constants';

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

export class Renderer {
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
  private clouds: Cloud[] = [];
  private lastCloudTime = 0;

  constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement) {
    this.bgCtx = bgCanvas.getContext('2d')!;
    this.fgCtx = fgCanvas.getContext('2d')!;

    bgCanvas.width = CANVAS_WIDTH;
    bgCanvas.height = CANVAS_HEIGHT;
    fgCanvas.width = CANVAS_WIDTH;
    fgCanvas.height = CANVAS_HEIGHT;

    // Init clouds
    this.clouds = [
      { x: 100, y: 70, size: 60, speed: 8 },
      { x: 350, y: 45, size: 85, speed: 12 },
      { x: 650, y: 90, size: 50, speed: 6 },
      { x: 900, y: 55, size: 75, speed: 10 },
      { x: 1150, y: 80, size: 55, speed: 7 },
    ];
  }

  renderBackground(arena: Arena): void {
    const ctx = this.bgCtx;

    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#4A90D9');
    gradient.addColorStop(0.6, '#87CEEB');
    gradient.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Hills in background
    ctx.fillStyle = '#5C9E4C';
    this.drawHill(ctx, 0, 620, 300, 120);
    this.drawHill(ctx, 250, 630, 400, 100);
    this.drawHill(ctx, 600, 620, 350, 130);
    this.drawHill(ctx, 900, 635, 400, 100);

    // Platforms
    for (const plat of arena.platforms) {
      this.drawPlatform(ctx, plat.x, plat.y, plat.width, plat.height,
        plat.y >= 650 ? arena.groundColor : arena.platformColor);
    }

    // Ground grass line
    const ground = arena.platforms[0];
    ctx.fillStyle = '#6BBF59';
    ctx.fillRect(ground.x, ground.y, ground.width, 4);

    // Grass blades on ground
    ctx.strokeStyle = '#5DAF4A';
    ctx.lineWidth = 2;
    for (let x = 10; x < CANVAS_WIDTH; x += 15 + Math.random() * 10) {
      ctx.beginPath();
      ctx.moveTo(x, ground.y);
      ctx.lineTo(x - 3, ground.y - 6 - Math.random() * 4);
      ctx.stroke();
    }

    // Nature on ground
    this.drawNatureOnGround(ctx, ground);

    // Nature on floating platforms
    const floats = arena.platforms.filter(p => p.y < 650);
    for (const plat of floats) {
      this.drawNatureOnPlatform(ctx, plat);
    }
  }

  // ---- Nature drawing ----

  private drawNatureOnGround(ctx: CanvasRenderingContext2D, ground: Platform): void {
    const y = ground.y;

    // Trees
    this.drawTree(ctx, 60, y, 50);
    this.drawTree(ctx, 620, y, 60);
    this.drawTree(ctx, 1180, y, 45);

    // Bushes
    this.drawBush(ctx, 200, y, 30);
    this.drawBush(ctx, 450, y, 22);
    this.drawBush(ctx, 700, y, 28);
    this.drawBush(ctx, 950, y, 25);
    this.drawBush(ctx, 1100, y, 20);

    // Flowers
    const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
    const flowerPositions = [150, 280, 380, 500, 580, 750, 830, 980, 1050, 1200];
    for (const fx of flowerPositions) {
      const color = flowerColors[Math.floor(fx * 0.01) % flowerColors.length];
      this.drawFlower(ctx, fx, y, color);
    }

    // Small mushrooms
    this.drawMushroom(ctx, 340, y);
    this.drawMushroom(ctx, 890, y);
  }

  private drawNatureOnPlatform(ctx: CanvasRenderingContext2D, plat: Platform): void {
    const y = plat.y;
    const mid = plat.x + plat.width / 2;

    // Small bush or flowers depending on platform size
    if (plat.width > 180) {
      this.drawBush(ctx, mid - 30, y, 15);
      this.drawFlower(ctx, plat.x + 20, y, '#FFD700');
      this.drawFlower(ctx, plat.x + plat.width - 25, y, '#FF69B4');
      // Small grass tufts
      this.drawGrassTuft(ctx, plat.x + 10, y);
      this.drawGrassTuft(ctx, plat.x + plat.width - 15, y);
    } else {
      this.drawFlower(ctx, mid - 10, y, '#DDA0DD');
      this.drawGrassTuft(ctx, plat.x + 8, y);
    }
  }

  private drawTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
    const trunkW = size * 0.2;
    const trunkH = size * 0.8;

    // Trunk
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(x - trunkW / 2, groundY - trunkH, trunkW, trunkH);
    // Bark lines
    ctx.strokeStyle = '#553318';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, groundY - trunkH * 0.3);
    ctx.lineTo(x - 1, groundY - trunkH * 0.6);
    ctx.stroke();

    // Foliage layers (bottom to top)
    const layers = [
      { yOff: 0.4, rx: size * 0.55, ry: size * 0.3, color: '#2D8B2D' },
      { yOff: 0.6, rx: size * 0.45, ry: size * 0.28, color: '#3AA03A' },
      { yOff: 0.8, rx: size * 0.32, ry: size * 0.22, color: '#4AB84A' },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.ellipse(x, groundY - trunkH * l.yOff - size * 0.2, l.rx, l.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBush(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
    // Main body
    ctx.fillStyle = '#3A8C3A';
    ctx.beginPath();
    ctx.ellipse(x, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lighter highlight
    ctx.fillStyle = '#4CA64C';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.15, groundY - size * 0.55, size * 0.35, size * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Dark underside
    ctx.fillStyle = '#2D6B2D';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.1, groundY - size * 0.2, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFlower(ctx: CanvasRenderingContext2D, x: number, groundY: number, color: string): void {
    // Stem
    ctx.strokeStyle = '#3A7A3A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, groundY - 12);
    ctx.stroke();

    // Petals
    ctx.fillStyle = color;
    const petalR = 3;
    for (let a = 0; a < 5; a++) {
      const angle = (a / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 3, groundY - 14 + Math.sin(angle) * 3, petalR, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = '#FFE04A';
    ctx.beginPath();
    ctx.arc(x, groundY - 14, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMushroom(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    // Stem
    ctx.fillStyle = '#F5F0E0';
    ctx.fillRect(x - 3, groundY - 10, 6, 10);
    // Cap
    ctx.fillStyle = '#D32F2F';
    ctx.beginPath();
    ctx.ellipse(x, groundY - 10, 8, 6, 0, Math.PI, 0);
    ctx.fill();
    // Spots
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(x - 3, groundY - 13, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 3, groundY - 12, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGrassTuft(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    ctx.strokeStyle = '#5DAF4A';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 3, groundY);
      ctx.lineTo(x + i * 5, groundY - 6 - Math.random() * 3);
      ctx.stroke();
    }
  }

  // ---- Clouds ----

  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  private updateAndDrawClouds(ctx: CanvasRenderingContext2D, dt: number): void {
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      // Wrap around
      if (cloud.x - cloud.size > CANVAS_WIDTH) {
        cloud.x = -cloud.size * 2;
      }
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.size);
    }
  }

  // ---- Other static helpers ----

  private drawHill(ctx: CanvasRenderingContext2D, x: number, baseY: number, width: number, height: number): void {
    ctx.beginPath();
    ctx.moveTo(x, baseY + 60);
    ctx.quadraticCurveTo(x + width / 2, baseY - height, x + width, baseY + 60);
    ctx.fill();
  }

  private drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    if (h > 30) {
      // Ground platform
      ctx.fillStyle = '#5C3A1E';
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = '#7B5B3A';
      for (let dx = 10; dx < w; dx += 30 + Math.random() * 20) {
        ctx.fillRect(x + dx, y + 15 + Math.random() * 20, 4, 3);
      }
    } else {
      // Floating platform
      ctx.fillStyle = '#6B4E1B';
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = '#6BBF59';
      ctx.fillRect(x, y, w, 3);
    }
  }

  // ---- Splat marks ----

  renderSplatMarks(splatMarks: SplatMark[], goreMode: boolean): void {
    const ctx = this.bgCtx;
    for (const splat of splatMarks) {
      const color = goreMode ? '#CC222288' : splat.color + '88';
      ctx.fillStyle = color;

      // Shape-specific main mark
      ctx.beginPath();
      switch (splat.shape) {
        case 'star': {
          const r = splat.radius;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const aInner = a + Math.PI / 5;
            ctx.lineTo(splat.x + Math.cos(a) * r, splat.y + Math.sin(a) * r);
            ctx.lineTo(splat.x + Math.cos(aInner) * r * 0.4, splat.y + Math.sin(aInner) * r * 0.4);
          }
          ctx.closePath();
          break;
        }
        case 'ring':
          ctx.arc(splat.x, splat.y, splat.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(splat.x, splat.y, splat.radius * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = color;
          ctx.beginPath(); // dummy to skip main fill below
          break;
        case 'paw': {
          // Main pad
          ctx.ellipse(splat.x, splat.y, splat.radius * 0.6, splat.radius * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Toe beans
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.arc(splat.x + i * splat.radius * 0.4, splat.y - splat.radius * 0.5, splat.radius * 0.25, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          break;
        }
        case 'splat': {
          // Irregular blob
          const points = 8;
          for (let i = 0; i < points; i++) {
            const a = (i / points) * Math.PI * 2;
            const r = splat.radius * (0.6 + Math.random() * 0.8);
            if (i === 0) ctx.moveTo(splat.x + Math.cos(a) * r, splat.y + Math.sin(a) * r);
            else ctx.lineTo(splat.x + Math.cos(a) * r, splat.y + Math.sin(a) * r);
          }
          ctx.closePath();
          break;
        }
        default:
          ctx.arc(splat.x, splat.y, splat.radius, 0, Math.PI * 2);
      }
      ctx.fill();

      // Droplet particles
      for (const p of splat.particles) {
        ctx.beginPath();
        ctx.arc(splat.x + p.x, splat.y + p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Frame rendering ----

  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[], _goreMode: boolean): void {
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();

    // Screen shake offset
    if (matchState.screenShake > 0) {
      const intensity = SCREEN_SHAKE_INTENSITY * (matchState.screenShake / 0.3);
      ctx.translate(
        (Math.random() - 0.5) * intensity * 2,
        (Math.random() - 0.5) * intensity * 2,
      );
    }

    // Animated clouds
    const now = performance.now() / 1000;
    const dt = now - (this.lastCloudTime || now);
    this.lastCloudTime = now;
    this.updateAndDrawClouds(ctx, dt);

    // Weather (leaves, petals)
    this.drawWeather(ctx, matchState.weather);

    // Springs and thorns (behind players)
    for (const spring of matchState.springs) this.drawSpringMushroom(ctx, spring);
    for (const thorn of matchState.thorns) this.drawThorn(ctx, thorn);

    // Carrots
    for (const carrot of matchState.carrots) {
      if (carrot.active) this.drawCarrot(ctx, carrot, matchState.timeElapsed);
    }

    // Particles
    this.drawParticles(ctx, particles);

    // Players
    for (const player of matchState.players) {
      if (!player.active) continue;
      if (player.state === 'respawning') continue;
      this.drawPlayer(ctx, player);
    }

    // Foreground nature
    this.drawForegroundNature(ctx, arena);

    // Fireworks when match is over
    if (matchState.matchOver) {
      this.drawFireworks(ctx, particles);
    }

    ctx.restore();

    // HUD (not affected by shake)
    this.drawHUD(ctx, matchState);
  }

  // ---- Weather ----

  private drawWeather(ctx: CanvasRenderingContext2D, weather: WeatherParticle[]): void {
    for (const w of weather) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);
      if (w.type === 'leaf') {
        ctx.fillStyle = 'rgba(90, 160, 60, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Vein
        ctx.strokeStyle = 'rgba(60, 120, 40, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-w.size * 0.7, 0);
        ctx.lineTo(w.size * 0.7, 0);
        ctx.stroke();
      } else {
        // Petal
        ctx.fillStyle = 'rgba(255, 180, 200, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- Game objects ----

  private drawCarrot(ctx: CanvasRenderingContext2D, carrot: Carrot, timeElapsed: number): void {
    const x = carrot.x;
    const y = carrot.y;
    const bob = Math.sin(performance.now() / 300) * 3;
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
    const sparkle = Math.sin(performance.now() / 200) * 0.5 + 0.5;
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

    // Grow animation
    const growScale = spring.growTimer > 0 ? 1 - (spring.growTimer / HAZARD_GROW_TIME) : 1;
    // Fade out when about to die
    const fadeAlpha = spring.life < 2 ? spring.life / 2 : 1;

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

    // Grow animation
    const growScale = thorn.growTimer > 0 ? 1 - (thorn.growTimer / HAZARD_GROW_TIME) : 1;
    const fadeAlpha = thorn.life < 2 ? thorn.life / 2 : 1;

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

  // ---- Foreground nature (drawn over players) ----

  private drawForegroundNature(ctx: CanvasRenderingContext2D, arena: Arena): void {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground bushes on ground — rabbits hide behind these
    this.drawFgBush(ctx, 160, gy, 60);
    this.drawFgBush(ctx, 520, gy, 52);
    this.drawFgBush(ctx, 850, gy, 58);
    this.drawFgBush(ctx, 1120, gy, 48);

    // Tall grass clusters
    this.drawTallGrass(ctx, 310, gy, 7);
    this.drawTallGrass(ctx, 680, gy, 9);
    this.drawTallGrass(ctx, 1020, gy, 6);
    this.drawTallGrass(ctx, 430, gy, 5);

    // Foreground ferns
    this.drawFern(ctx, 80, gy);
    this.drawFern(ctx, 770, gy);
    this.drawFern(ctx, 1220, gy);

    // Hanging leaves / vines on floating platforms
    const floats = arena.platforms.filter(p => p.y < 650);
    for (const plat of floats) {
      if (plat.width > 180) {
        this.drawHangingVine(ctx, plat.x + 15, plat.y + plat.height, 25);
        this.drawHangingVine(ctx, plat.x + plat.width - 15, plat.y + plat.height, 20);
        // Foreground leaf cluster on top
        this.drawFgLeafCluster(ctx, plat.x + plat.width / 2, plat.y);
      } else {
        this.drawHangingVine(ctx, plat.x + plat.width / 2, plat.y + plat.height, 18);
      }
    }

    // Foreground wildflowers (taller than background ones)
    this.drawFgWildflower(ctx, 240, gy, '#FF6B8A', 18);
    this.drawFgWildflower(ctx, 580, gy, '#DDA0DD', 20);
    this.drawFgWildflower(ctx, 930, gy, '#FFD700', 16);
    this.drawFgWildflower(ctx, 1180, gy, '#FF69B4', 22);
  }

  private drawFgBush(ctx: CanvasRenderingContext2D, x: number, groundY: number, size: number): void {
    // Dark back layer
    ctx.fillStyle = '#1E5C1E';
    ctx.beginPath();
    ctx.ellipse(x, groundY - size * 0.35, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body
    ctx.fillStyle = '#2B7A2B';
    ctx.beginPath();
    ctx.ellipse(x + 2, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left lobe
    ctx.fillStyle = '#338A33';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.3, groundY - size * 0.3, size * 0.35, size * 0.32, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Right lobe
    ctx.fillStyle = '#2E8030';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.3, groundY - size * 0.35, size * 0.33, size * 0.3, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Highlight spots
    ctx.fillStyle = '#3DA63D';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.1, groundY - size * 0.55, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + size * 0.2, groundY - size * 0.5, size * 0.12, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small berries
    const berryColors = ['#CC3333', '#DD4444', '#BB2222'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = berryColors[i];
      ctx.beginPath();
      ctx.arc(
        x + (i - 1) * size * 0.2 + (i * 3 % 5),
        groundY - size * 0.25 - (i * 7 % 6),
        2.5, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }

  private drawTallGrass(ctx: CanvasRenderingContext2D, x: number, groundY: number, bladeCount: number): void {
    for (let i = 0; i < bladeCount; i++) {
      const bx = x + (i - bladeCount / 2) * 6;
      const height = 14 + (i * 7 % 10);
      const lean = (i % 3 - 1) * 4;

      // Dark blade
      ctx.strokeStyle = i % 2 === 0 ? '#2D7A2D' : '#3A8A3A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, groundY);
      ctx.quadraticCurveTo(bx + lean * 0.5, groundY - height * 0.6, bx + lean, groundY - height);
      ctx.stroke();

      // Lighter overlay on some
      if (i % 3 === 0) {
        ctx.strokeStyle = '#4CA64C';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 1, groundY);
        ctx.quadraticCurveTo(bx + lean * 0.5 + 1, groundY - height * 0.6, bx + lean + 1, groundY - height);
        ctx.stroke();
      }
    }
  }

  private drawFern(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    // Central stem
    const height = 22;
    ctx.strokeStyle = '#2D6B2D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.quadraticCurveTo(x + 2, groundY - height * 0.5, x + 4, groundY - height);
    ctx.stroke();

    // Fronds on each side
    const frondCount = 4;
    for (let i = 0; i < frondCount; i++) {
      const fy = groundY - 5 - i * 4;
      const fLen = 10 - i * 1.5;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = i < 2 ? '#2B7A2B' : '#3A9A3A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 1, fy);
        ctx.quadraticCurveTo(x + side * fLen * 0.7, fy - 3, x + side * fLen, fy - 1);
        ctx.stroke();
      }
    }
  }

  private drawHangingVine(ctx: CanvasRenderingContext2D, x: number, topY: number, length: number): void {
    // Vine stem
    ctx.strokeStyle = '#3A7A3A';
    ctx.lineWidth = 1.5;
    const sway = Math.sin(x * 0.1) * 4;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.quadraticCurveTo(x + sway, topY + length * 0.6, x + sway * 0.5, topY + length);
    ctx.stroke();

    // Small leaves along vine
    ctx.fillStyle = '#3D8B3D';
    for (let i = 0; i < 3; i++) {
      const ly = topY + (i + 1) * length * 0.25;
      const lx = x + sway * (i + 1) / 4;
      const side = i % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(lx + side * 4, ly, 4, 2.5, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFgLeafCluster(ctx: CanvasRenderingContext2D, x: number, platY: number): void {
    // Small cluster of leaves sitting on top of platform, drawn in foreground
    ctx.fillStyle = '#2E7A2E';
    ctx.beginPath();
    ctx.ellipse(x - 6, platY - 4, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3A8C3A';
    ctx.beginPath();
    ctx.ellipse(x + 6, platY - 5, 7, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4A9C4A';
    ctx.beginPath();
    ctx.ellipse(x, platY - 7, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFgWildflower(ctx: CanvasRenderingContext2D, x: number, groundY: number, color: string, height: number): void {
    // Tall stem
    ctx.strokeStyle = '#2D6B2D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + 1, groundY - height);
    ctx.stroke();

    // Small leaf on stem
    ctx.fillStyle = '#3A8A3A';
    ctx.beginPath();
    ctx.ellipse(x + 5, groundY - height * 0.5, 5, 2.5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Flower head (larger than bg flowers)
    ctx.fillStyle = color;
    const petalR = 4;
    for (let a = 0; a < 6; a++) {
      const angle = (a / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + 1 + Math.cos(angle) * 4, groundY - height - 1 + Math.sin(angle) * 4, petalR, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = '#FFE04A';
    ctx.beginPath();
    ctx.arc(x + 1, groundY - height - 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Particles ----

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- Player drawing ----

  private drawPlayer(ctx: CanvasRenderingContext2D, player: Player): void {
    const { x, y, width, height, character, state, facing, invincibleTimer, animFrame, fastFalling, fatTimer, slowTimer } = player;

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

    const cx = x + width / 2;
    const cy = y + height;

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
      this.drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling);
    }

    // Red tint pulse overlay when hit by thorns
    if (drawRedPulse) {
      const pulseAlpha = Math.abs(Math.sin(slowTimer * 8)) * 0.3;
      ctx.fillStyle = `rgba(255, 0, 0, ${pulseAlpha})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + height * 0.5, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCharacterSprite(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    char: { name: string; color: string; darkColor: string; lightColor: string },
    state: string, animFrame: number, fastFalling: boolean
  ): void {
    const cx = x + w / 2;
    const isAirborne = state === 'airborne';
    const isRunning = state === 'run';
    const bounce = isRunning ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
    const yOff = y - bounce;

    // Squash/stretch for fast fall
    let scaleX = 1;
    let scaleY = 1;
    if (fastFalling) {
      scaleX = 0.85;
      scaleY = 1.15;
    }

    ctx.save();
    if (fastFalling) {
      ctx.translate(cx, yOff + h / 2);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-cx, -(yOff + h / 2));
    }

    // Body
    ctx.fillStyle = char.color;
    ctx.beginPath();
    if (char.name === 'Bunny') {
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ears
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Inner ears
      ctx.fillStyle = '#FFB6C1';
      ctx.beginPath();
      ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Tail
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.arc(cx - w * 0.35, yOff + h * 0.5, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Fox') {
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.38, h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.moveTo(cx - 8, yOff + 8);
      ctx.lineTo(cx - 12, yOff - 6);
      ctx.lineTo(cx - 2, yOff + 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 8, yOff + 8);
      ctx.lineTo(cx + 12, yOff - 6);
      ctx.lineTo(cx + 2, yOff + 6);
      ctx.fill();
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : 0;
      ctx.moveTo(cx - w * 0.3, yOff + h * 0.5);
      ctx.quadraticCurveTo(cx - w * 0.7, yOff + h * 0.2 + tailWag, cx - w * 0.5, yOff + h * 0.1);
      ctx.quadraticCurveTo(cx - w * 0.3, yOff + h * 0.3, cx - w * 0.3, yOff + h * 0.5);
      ctx.fill();
      ctx.fillStyle = '#FFF8DC';
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.6, w * 0.2, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Frog') {
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#90EE90';
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.62, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Bear') {
      ctx.ellipse(cx, yOff + h * 0.5, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#D2B48C';
      ctx.beginPath();
      ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Owl') {
      // Owl: round body, tufts, big round eyes
      ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ear tufts
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.moveTo(cx - 8, yOff + 6);
      ctx.lineTo(cx - 12, yOff - 6);
      ctx.lineTo(cx - 4, yOff + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 8, yOff + 6);
      ctx.lineTo(cx + 12, yOff - 6);
      ctx.lineTo(cx + 4, yOff + 4);
      ctx.fill();
      // White face disk
      ctx.fillStyle = '#E8E0F0';
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.38, w * 0.28, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Big round eyes
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(cx - 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
      ctx.fill();
      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 4.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#D4A030';
      ctx.beginPath();
      ctx.moveTo(cx - 2, yOff + h * 0.45);
      ctx.lineTo(cx, yOff + h * 0.52);
      ctx.lineTo(cx + 2, yOff + h * 0.45);
      ctx.fill();
      // Belly
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.62, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      const wingFlap = isAirborne ? Math.sin(animFrame * Math.PI) * 5 : 0;
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.3, yOff + h * 0.45 - wingFlap, 6, 10, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Cat') {
      // Cat: rounder wider body, tall upright triangular ears, whiskers, upright tail
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tall upright triangular ears (much taller/narrower than fox)
      ctx.beginPath();
      ctx.moveTo(cx - 9, yOff + 10);
      ctx.lineTo(cx - 7, yOff - 8);
      ctx.lineTo(cx - 2, yOff + 8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 9, yOff + 10);
      ctx.lineTo(cx + 7, yOff - 8);
      ctx.lineTo(cx + 2, yOff + 8);
      ctx.closePath();
      ctx.fill();
      // Pink inner ears
      ctx.fillStyle = '#FF9AAA';
      ctx.beginPath();
      ctx.moveTo(cx - 8, yOff + 8);
      ctx.lineTo(cx - 7, yOff - 4);
      ctx.lineTo(cx - 3, yOff + 7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 8, yOff + 8);
      ctx.lineTo(cx + 7, yOff - 4);
      ctx.lineTo(cx + 3, yOff + 7);
      ctx.closePath();
      ctx.fill();
      // Small pink nose
      ctx.fillStyle = '#FF8090';
      ctx.beginPath();
      ctx.arc(cx + 1, yOff + h * 0.48, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Mouth lines from nose
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 1, yOff + h * 0.5);
      ctx.lineTo(cx - 3, yOff + h * 0.55);
      ctx.moveTo(cx + 1, yOff + h * 0.5);
      ctx.lineTo(cx + 5, yOff + h * 0.55);
      ctx.stroke();
      // Whiskers (long, distinctive)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        for (let wi = -1; wi <= 1; wi++) {
          ctx.beginPath();
          ctx.moveTo(cx + side * 7, yOff + h * 0.47 + wi * 2.5);
          ctx.lineTo(cx + side * 20, yOff + h * 0.44 + wi * 4);
          ctx.stroke();
        }
      }
      // Upright curved tail (very different from fox's bushy tail)
      ctx.strokeStyle = char.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      const tailCurve = Math.sin((animFrame + 1) * Math.PI * 0.5) * 3;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, yOff + h * 0.55);
      ctx.quadraticCurveTo(cx - w * 0.45, yOff + h * 0.1, cx - w * 0.25 + tailCurve, yOff - h * 0.1);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Cat eyes (distinctive: almond-shaped, green)
      ctx.fillStyle = '#90EE60';
      ctx.beginPath();
      ctx.ellipse(cx - 5, yOff + h * 0.38, 3.5, 2.5, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + h * 0.38, 3.5, 2.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Vertical slit pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx - 4.5, yOff + h * 0.38, 1, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5.5, yOff + h * 0.38, 1, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Wolf') {
      // Wolf: angular body, pointy snout
      ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pointed ears
      ctx.beginPath();
      ctx.moveTo(cx - 9, yOff + 6);
      ctx.lineTo(cx - 11, yOff - 6);
      ctx.lineTo(cx - 3, yOff + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 9, yOff + 6);
      ctx.lineTo(cx + 11, yOff - 6);
      ctx.lineTo(cx + 3, yOff + 4);
      ctx.fill();
      // Snout
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx + 3, yOff + h * 0.5, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nose
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(cx + 6, yOff + h * 0.48, 2, 0, Math.PI * 2);
      ctx.fill();
      // Belly
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.62, w * 0.2, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Panda') {
      // Panda: round, black & white
      ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // Black ears
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      // Black eye patches
      ctx.beginPath();
      ctx.ellipse(cx - 5, yOff + h * 0.38, 5, 4, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + h * 0.38, 5, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // White eyes in patches
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 4.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Nose
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Pig') {
      // Pig: round pink body, snout, curly tail, small ears
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      // Small upright ears
      ctx.beginPath();
      ctx.moveTo(cx - 8, yOff + 10);
      ctx.lineTo(cx - 10, yOff + 0);
      ctx.lineTo(cx - 4, yOff + 8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 8, yOff + 10);
      ctx.lineTo(cx + 10, yOff + 0);
      ctx.lineTo(cx + 4, yOff + 8);
      ctx.fill();
      // Snout circle
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx + 3, yOff + h * 0.52, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nostrils
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.arc(cx + 1, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Curly tail
      ctx.strokeStyle = char.darkColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx - w * 0.35, yOff + h * 0.45, 5, 0, Math.PI * 1.5);
      ctx.stroke();
    } else if (char.name === 'Cow') {
      // Cow: round cream body, black patches, horns, pink nose
      ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // Black patches
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.ellipse(cx - 6, yOff + h * 0.4, 5, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 4, yOff + h * 0.58, 4, 3.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 8, yOff + h * 0.35, 3, 2.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Small horns
      ctx.fillStyle = '#E8D8A0';
      ctx.beginPath();
      ctx.moveTo(cx - 7, yOff + 6);
      ctx.lineTo(cx - 10, yOff - 4);
      ctx.lineTo(cx - 5, yOff + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 7, yOff + 6);
      ctx.lineTo(cx + 10, yOff - 4);
      ctx.lineTo(cx + 5, yOff + 4);
      ctx.fill();
      // Pink nose/muzzle
      ctx.fillStyle = '#FFB0B0';
      ctx.beginPath();
      ctx.ellipse(cx + 2, yOff + h * 0.52, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nostrils
      ctx.fillStyle = '#D08080';
      ctx.beginPath();
      ctx.arc(cx + 0.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 3.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Custom eyes for Cow
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
    } else if (char.name === 'Horse') {
      // Horse: tall-ish oval body, long face, pointed ears, short mane
      ctx.ellipse(cx, yOff + h * 0.5, w * 0.36, h * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      // Long face/snout
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + h * 0.52, 5, 6, 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Pointed ears
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.moveTo(cx - 6, yOff + 6);
      ctx.lineTo(cx - 8, yOff - 6);
      ctx.lineTo(cx - 2, yOff + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 6, yOff + 6);
      ctx.lineTo(cx + 8, yOff - 6);
      ctx.lineTo(cx + 2, yOff + 4);
      ctx.fill();
      // Short mane
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.moveTo(cx - 2, yOff + 2);
      ctx.lineTo(cx + 0, yOff - 4);
      ctx.lineTo(cx + 3, yOff + 2);
      ctx.lineTo(cx + 5, yOff - 2);
      ctx.lineTo(cx + 7, yOff + 4);
      ctx.stroke();
      ctx.fillRect(cx - 2, yOff + 0, 8, 5);
      // Nostril
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(cx + 8, yOff + h * 0.54, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Goat') {
      // Goat: round body, small curved horns, beard, horizontal pupils
      ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Small curved horns
      ctx.strokeStyle = '#A09070';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx - 8, yOff + 2, 6, -Math.PI * 0.8, -Math.PI * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 8, yOff + 2, 6, -Math.PI * 0.9, -Math.PI * 0.2);
      ctx.stroke();
      // Beard (small triangle below face)
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.moveTo(cx - 2, yOff + h * 0.58);
      ctx.lineTo(cx + 2, yOff + h * 0.58);
      ctx.lineTo(cx, yOff + h * 0.7);
      ctx.fill();
      // Snout
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.ellipse(cx + 2, yOff + h * 0.5, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Horizontal pupils (goat eyes)
      ctx.fillStyle = '#E8D060';
      ctx.beginPath();
      ctx.arc(cx - 5, yOff + h * 0.38, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, yOff + h * 0.38, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx - 5, yOff + h * 0.38, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 5, yOff + h * 0.38, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Sheep') {
      // Sheep: fluffy cloud-like body (overlapping circles), small dark face
      // Fluffy body — multiple overlapping circles
      ctx.fillStyle = char.color;
      ctx.beginPath(); ctx.arc(cx - 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, yOff + h * 0.42, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.56, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, yOff + h * 0.56, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, yOff + h * 0.35, 7, 0, Math.PI * 2); ctx.fill();
      // Small dark face
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.ellipse(cx + 2, yOff + h * 0.44, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes on dark face
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
      // Small ears peeking from wool
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.ellipse(cx - 10, yOff + h * 0.38, 3, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 12, yOff + h * 0.38, 3, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Monkey') {
      // Monkey: round body, large round ears, lighter face, curling tail
      ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Large round ears
      ctx.beginPath();
      ctx.arc(cx - 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
      ctx.fill();
      // Inner ears
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.arc(cx - 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Lighter face circle
      ctx.beginPath();
      ctx.ellipse(cx + 1, yOff + h * 0.46, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
      // Nose/mouth
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.ellipse(cx + 1, yOff + h * 0.5, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Curling tail
      ctx.strokeStyle = char.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx - w * 0.35, yOff + h * 0.4, 7, -Math.PI * 0.3, Math.PI * 1.3);
      ctx.stroke();
    }

    // Eyes (generic — for characters without custom eyes)
    if (!['Frog', 'Owl', 'Cat', 'Wolf', 'Panda', 'Cow', 'Goat', 'Sheep', 'Monkey'].includes(char.name)) {
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

    // Fast-fall speed lines
    if (fastFalling) {
      ctx.strokeStyle = 'rgba(255,255,200,0.6)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 6, yOff - 4);
        ctx.lineTo(cx + i * 6, yOff - 14);
        ctx.stroke();
      }
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
    const now = performance.now() / 1000;
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

  // ---- HUD ----

  private drawHUD(ctx: CanvasRenderingContext2D, state: MatchState): void {
    const activePlayers = state.players.filter(p => p.active);
    const scoreWidth = 160;
    const totalWidth = activePlayers.length * scoreWidth;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;

    for (let i = 0; i < activePlayers.length; i++) {
      const player = activePlayers[i];
      const px = startX + i * scoreWidth;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.roundRect(px, 10, scoreWidth - 10, 40, 8);
      ctx.fill();

      ctx.fillStyle = player.character.color;
      ctx.beginPath();
      ctx.arc(px + 20, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${player.character.name}`, px + 35, 28);
      ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.fillText(`${player.score}`, px + 35, 45);
    }

    if (state.timeElapsed >= 0) {
      const minutes = Math.floor(state.timeElapsed / 60);
      const seconds = Math.floor(state.timeElapsed % 60);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.roundRect(CANVAS_WIDTH / 2 - 40, 55, 80, 30, 6);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 75);
    }

    const recentKills = state.killFeed.slice(-3).reverse();
    for (let i = 0; i < recentKills.length; i++) {
      const entry = recentKills[i];
      const fy = 100 + i * 25;
      const attacker = CHARACTERS[entry.attacker];
      const victim = CHARACTERS[entry.victim];

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(CANVAS_WIDTH - 250, fy, 240, 22, 4);
      ctx.fill();

      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = attacker.color;
      ctx.fillText(attacker.name, CANVAS_WIDTH - 140, fy + 15);
      ctx.fillStyle = '#FFF';
      ctx.fillText(' splatted ', CANVAS_WIDTH - 80, fy + 15);
      ctx.fillStyle = victim.color;
      ctx.fillText(victim.name, CANVAS_WIDTH - 20, fy + 15);
    }
  }
}
