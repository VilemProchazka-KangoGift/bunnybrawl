import type { Arena, Player, SplatMark, MatchState, Particle, Platform } from './types';
import { CHARACTERS } from './characters';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
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

  renderSplatMarks(splatMarks: SplatMark[]): void {
    const ctx = this.bgCtx;
    for (const splat of splatMarks) {
      ctx.fillStyle = splat.color + '88';
      ctx.beginPath();
      ctx.arc(splat.x, splat.y, splat.radius, 0, Math.PI * 2);
      ctx.fill();
      for (const p of splat.particles) {
        ctx.beginPath();
        ctx.arc(splat.x + p.x, splat.y + p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Frame rendering ----

  renderFrame(matchState: MatchState, _arena: Arena, particles: Particle[]): void {
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Animated clouds (drawn on fg so they move)
    const now = performance.now() / 1000;
    const dt = now - (this.lastCloudTime || now);
    this.lastCloudTime = now;
    this.updateAndDrawClouds(ctx, dt);

    // Render particles (dust)
    this.drawParticles(ctx, particles);

    // Render players
    for (const player of matchState.players) {
      if (!player.active) continue;
      if (player.state === 'respawning') continue;
      this.drawPlayer(ctx, player);
    }

    // HUD
    this.drawHUD(ctx, matchState);
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
    const { x, y, width, height, character, state, facing, invincibleTimer, animFrame, fastFalling } = player;

    ctx.save();

    if (invincibleTimer > 0 && Math.floor(invincibleTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    const cx = x + width / 2;

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
    }

    // Eyes (for bunny and bear)
    if (char.name !== 'Frog') {
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
