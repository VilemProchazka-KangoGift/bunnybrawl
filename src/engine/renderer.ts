import type { Arena, Player, SplatMark, MatchState } from './types';
import { CHARACTERS } from './characters';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
} from './constants';

export class Renderer {
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;

  constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement) {
    this.bgCtx = bgCanvas.getContext('2d')!;
    this.fgCtx = fgCanvas.getContext('2d')!;

    bgCanvas.width = CANVAS_WIDTH;
    bgCanvas.height = CANVAS_HEIGHT;
    fgCanvas.width = CANVAS_WIDTH;
    fgCanvas.height = CANVAS_HEIGHT;
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

    // Clouds
    this.drawCloud(ctx, 100, 80, 60);
    this.drawCloud(ctx, 400, 50, 80);
    this.drawCloud(ctx, 750, 100, 50);
    this.drawCloud(ctx, 1050, 60, 70);

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

    // Ground grass
    const ground = arena.platforms[0];
    ctx.fillStyle = '#6BBF59';
    ctx.fillRect(ground.x, ground.y, ground.width, 4);

    // Grass blades
    ctx.strokeStyle = '#5DAF4A';
    ctx.lineWidth = 2;
    for (let x = 10; x < CANVAS_WIDTH; x += 15 + Math.random() * 10) {
      ctx.beginPath();
      ctx.moveTo(x, ground.y);
      ctx.lineTo(x - 3, ground.y - 6 - Math.random() * 4);
      ctx.stroke();
    }
  }

  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

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
      // Dirt texture
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
      // Grass on top
      ctx.fillStyle = '#6BBF59';
      ctx.fillRect(x, y, w, 3);
    }
  }

  renderSplatMarks(splatMarks: SplatMark[]): void {
    // Draw splat marks on the background layer
    const ctx = this.bgCtx;
    for (const splat of splatMarks) {
      // Main blob
      ctx.fillStyle = splat.color + '88';
      ctx.beginPath();
      ctx.arc(splat.x, splat.y, splat.radius, 0, Math.PI * 2);
      ctx.fill();

      // Particles
      for (const p of splat.particles) {
        ctx.beginPath();
        ctx.arc(splat.x + p.x, splat.y + p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  renderFrame(matchState: MatchState, _arena: Arena): void {
    const ctx = this.fgCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Render players
    for (const player of matchState.players) {
      if (!player.active) continue;
      if (player.state === 'respawning') continue;

      this.drawPlayer(ctx, player);
    }

    // HUD
    this.drawHUD(ctx, matchState);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: Player): void {
    const { x, y, width, height, character, state, facing, invincibleTimer, animFrame } = player;

    ctx.save();

    // Invincibility blink
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
      // Squished flat
      this.drawSplatCharacter(ctx, x, y, width, height, character.color, character.darkColor);
    } else {
      this.drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame);
    }

    ctx.restore();
  }

  private drawCharacterSprite(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    char: { name: string; color: string; darkColor: string; lightColor: string },
    state: string, animFrame: number
  ): void {
    const cx = x + w / 2;
    const isAirborne = state === 'airborne';
    const isRunning = state === 'run';
    const bounce = isRunning ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
    const yOff = y - bounce;

    // Body
    ctx.fillStyle = char.color;
    ctx.beginPath();
    if (char.name === 'Bunny') {
      // Bunny: round body, long ears
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
      // Fox: angular body, pointed ears, fluffy tail
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.38, h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pointed ears
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
      // Tail
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : 0;
      ctx.moveTo(cx - w * 0.3, yOff + h * 0.5);
      ctx.quadraticCurveTo(cx - w * 0.7, yOff + h * 0.2 + tailWag, cx - w * 0.5, yOff + h * 0.1);
      ctx.quadraticCurveTo(cx - w * 0.3, yOff + h * 0.3, cx - w * 0.3, yOff + h * 0.5);
      ctx.fill();
      // White belly
      ctx.fillStyle = '#FFF8DC';
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.6, w * 0.2, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Frog') {
      // Frog: wide body, big eyes
      ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Big eyes on top
      ctx.fillStyle = char.lightColor;
      ctx.beginPath();
      ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2);
      ctx.fill();
      // Lighter belly
      ctx.fillStyle = '#90EE90';
      ctx.beginPath();
      ctx.ellipse(cx, yOff + h * 0.62, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.name === 'Bear') {
      // Bear: bigger, round body, round ears
      ctx.ellipse(cx, yOff + h * 0.5, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // Round ears
      ctx.beginPath();
      ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      // Inner ears
      ctx.fillStyle = char.darkColor;
      ctx.beginPath();
      ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      // Snout
      ctx.fillStyle = '#D2B48C';
      ctx.beginPath();
      ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eyes (for bunny and bear — frog has custom eyes above)
    if (char.name !== 'Frog') {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx - 4, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 6, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Eye highlights
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
    // Left leg
    ctx.fillRect(cx - 8 - legSpread, yOff + h * 0.75 - legAnim, 6, 8 + (isAirborne ? 2 : 0));
    // Right leg
    ctx.fillRect(cx + 2 + legSpread, yOff + h * 0.75 + legAnim, 6, 8 + (isAirborne ? 2 : 0));

    // Jump stretch effect
    if (isAirborne) {
      // Small motion lines
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 3, yOff + h + 2);
      ctx.lineTo(cx - 3, yOff + h + 8);
      ctx.moveTo(cx + 3, yOff + h + 2);
      ctx.lineTo(cx + 3, yOff + h + 8);
      ctx.stroke();
    }
  }

  private drawSplatCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, darkColor: string): void {
    // Squished flat
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h - 4, w * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // X eyes
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 2;
    const eyeY = y + h - 6;
    // Left X
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 8, eyeY - 2);
    ctx.lineTo(x + w / 2 - 4, eyeY + 2);
    ctx.moveTo(x + w / 2 - 4, eyeY - 2);
    ctx.lineTo(x + w / 2 - 8, eyeY + 2);
    ctx.stroke();
    // Right X
    ctx.beginPath();
    ctx.moveTo(x + w / 2 + 4, eyeY - 2);
    ctx.lineTo(x + w / 2 + 8, eyeY + 2);
    ctx.moveTo(x + w / 2 + 8, eyeY - 2);
    ctx.lineTo(x + w / 2 + 4, eyeY + 2);
    ctx.stroke();
  }

  private drawHUD(ctx: CanvasRenderingContext2D, state: MatchState): void {
    // Score display at top
    const activePlayers = state.players.filter(p => p.active);
    const scoreWidth = 160;
    const totalWidth = activePlayers.length * scoreWidth;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;

    for (let i = 0; i < activePlayers.length; i++) {
      const player = activePlayers[i];
      const px = startX + i * scoreWidth;

      // Score background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.roundRect(px, 10, scoreWidth - 10, 40, 8);
      ctx.fill();

      // Player color indicator
      ctx.fillStyle = player.character.color;
      ctx.beginPath();
      ctx.arc(px + 20, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Name and score
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${player.character.name}`, px + 35, 28);
      ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.fillText(`${player.score}`, px + 35, 45);
    }

    // Timer
    if (state.timeElapsed >= 0) {
      const minutes = Math.floor(state.timeElapsed / 60);
      const seconds = Math.floor(state.timeElapsed % 60);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.roundRect(CANVAS_WIDTH / 2 - 40, 55, 80, 30, 6);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 75);
    }

    // Kill feed (last 3)
    const recentKills = state.killFeed.slice(-3).reverse();
    for (let i = 0; i < recentKills.length; i++) {
      const entry = recentKills[i];
      const fy = 100 + i * 25;
      const attacker = CHARACTERS[entry.attacker];
      const victim = CHARACTERS[entry.victim];

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
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
