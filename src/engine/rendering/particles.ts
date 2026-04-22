import type { Particle, WeatherParticle, WildlifeEntity, Gib, ConfettiParticle, Player } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SPRING_TRAIL_DURATION } from '../constants';
import { getGibRenderer } from '../characters';

export function drawWeather(ctx: CanvasRenderingContext2D, weather: WeatherParticle[], theme: ThemeConfig): void {
  const customDraw = theme.drawWeatherParticle;
  if (customDraw) {
    for (const w of weather) customDraw(ctx, w);
    return;
  }
  for (const w of weather) {
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

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
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

export function drawGibs(ctx: CanvasRenderingContext2D, gibs: Gib[]): void {
  for (const gib of gibs) {
    // Off-screen culling
    if (gib.x < -40 || gib.x > CANVAS_WIDTH + 40 || gib.y < -40 || gib.y > CANVAS_HEIGHT + 40) continue;
    ctx.save();
    ctx.translate(gib.x, gib.y);
    ctx.rotate(gib.rotation);
    drawGibShape(ctx, gib);
    ctx.restore();
  }
}

export function drawGibShape(ctx: CanvasRenderingContext2D, gib: Gib): void {
  const { characterName, gibType, color, darkColor, lightColor } = gib;

  // Body gib is generic for all characters -- colored oval
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

export function drawConfetti(ctx: CanvasRenderingContext2D, confetti: ConfettiParticle[]): void {
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

export function drawFireworks(ctx: CanvasRenderingContext2D, particles: Particle[], frameTime: number): void {
  const now = frameTime / 1000;
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

export function drawWildlife(ctx: CanvasRenderingContext2D, wildlife: WildlifeEntity[]): void {
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

export function drawSpringTrail(ctx: CanvasRenderingContext2D, player: Player, frameTime: number): void {
  const cx = player.x + player.width / 2;
  const baseY = player.y + player.height;
  const t = player.springTrailTimer / SPRING_TRAIL_DURATION; // 1 = just started, 0 = fading

  ctx.save();
  const pointCount = 12;
  for (let i = 0; i < pointCount; i++) {
    const progress = i / pointCount;
    const angle = progress * Math.PI * 4 + frameTime / 200; // spiral
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
