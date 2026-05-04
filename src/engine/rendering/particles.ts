import type { Particle, WeatherParticle, WildlifeEntity, Gib, ConfettiParticle, Player } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SPRING_TRAIL_DURATION } from '../constants';
import { getGibRenderer } from '../characters';
import { hexToRGB } from '../fastMath';

const _rgbStringCache = new Map<string, string>();
function rgbString(hex: string): string {
  let s = _rgbStringCache.get(hex);
  if (s) return s;
  const { r, g, b } = hexToRGB(hex);
  s = `rgb(${r},${g},${b})`;
  _rgbStringCache.set(hex, s);
  return s;
}

export function drawWeather(ctx: CanvasRenderingContext2D, weather: WeatherParticle[], theme: ThemeConfig, lead = 0): void {
  const customDraw = theme.drawWeatherParticle;
  if (customDraw) {
    for (const w of weather) customDraw(ctx, w);
    return;
  }
  for (const w of weather) {
    const px = w.x + w.vx * lead;
    const py = w.y + w.vy * lead;
    if (w.type === 'snow') {
      // Symmetric — rotation invisible, draw at world coords.
      ctx.fillStyle = w.color || 'rgba(230, 240, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(px, py, w.size, 0, Math.PI * 2);
      ctx.fill();
      if (w.size > 3.5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(px, py - w.size * 0.3, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (w.type === 'ember') {
      // Symmetric concentric circles — rotation invisible.
      ctx.fillStyle = w.color || 'rgba(255, 120, 30, 0.6)';
      ctx.beginPath();
      ctx.arc(px, py, w.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
      ctx.beginPath();
      ctx.arc(px, py, w.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Asymmetric shapes (leaf, petal, ash) — keep the transform.
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(w.rotation + w.rotSpeed * lead);
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
      } else if (w.type === 'ash') {
        ctx.fillStyle = w.color || 'rgba(150, 150, 150, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w.size, w.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], lead = 0): void {
  let lastColor = '';
  for (const p of particles) {
    const dx = p.x + p.vx * lead;
    const dy = p.y + p.vy * lead;
    if (dx < -20 || dx > CANVAS_WIDTH + 20 || dy < -20 || dy > CANVAS_HEIGHT + 20) continue;
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha * 0.7;
    if (p.color !== lastColor) {
      ctx.fillStyle = p.color;
      lastColor = p.color;
    }
    if (p.shape === 'spike') {
      // Oriented narrow triangle pointing along velocity. Length 3.5x size, base 0.7x size.
      const ang = Math.atan2(p.vy, p.vx);
      const r = p.size * alpha;
      const len = r * 3.5;
      const halfBase = r * 0.7;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(len, 0);
      ctx.lineTo(-len * 0.4, -halfBase);
      ctx.lineTo(-len * 0.4, halfBase);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(dx, dy, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawGibs(ctx: CanvasRenderingContext2D, gibs: Gib[], lead = 0): void {
  for (const gib of gibs) {
    const dx = gib.x + gib.vx * lead;
    const dy = gib.y + gib.vy * lead;
    // Off-screen culling
    if (dx < -40 || dx > CANVAS_WIDTH + 40 || dy < -40 || dy > CANVAS_HEIGHT + 40) continue;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(gib.rotation + gib.rotationSpeed * lead);
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

export function drawConfetti(ctx: CanvasRenderingContext2D, confetti: ConfettiParticle[], lead = 0): void {
  for (const c of confetti) {
    const alpha = (c.life / c.maxLife) * 0.9;
    ctx.save();
    ctx.translate(c.x + c.vx * lead, c.y + c.vy * lead);
    ctx.rotate(c.rotation + c.rotationSpeed * lead);
    ctx.fillStyle = rgbString(c.color);
    ctx.globalAlpha = alpha;

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

export function drawFireworks(ctx: CanvasRenderingContext2D, particles: Particle[], frameTime: number, lead = 0): void {
  const now = frameTime / 1000;
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const dx = p.x + p.vx * lead;
    const dy = p.y + p.vy * lead;

    // Trail lines behind fast-moving particles
    if (speed > 50) {
      const trailLen = Math.min(speed * 0.06, 20);
      const angle = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = alpha * 0.4;
      ctx.lineWidth = p.size * alpha * 0.6;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx - Math.cos(angle) * trailLen, dy - Math.sin(angle) * trailLen);
      ctx.stroke();
    }

    // Main particle with glow
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(dx, dy, p.size * alpha * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle dots near particles — keyed off stable position to avoid jitter
    const sparklePhase = Math.sin(now * 12 + p.x * 0.1 + p.y * 0.1);
    if (sparklePhase > 0.6) {
      ctx.globalAlpha = alpha * (sparklePhase - 0.6) * 2;
      ctx.fillStyle = '#FFF';
      const sparkleOffX = Math.sin(now * 7 + p.x) * 6;
      const sparkleOffY = Math.cos(now * 9 + p.y) * 6;
      ctx.beginPath();
      ctx.arc(dx + sparkleOffX, dy + sparkleOffY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Cross sparkle shape
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(dx + sparkleOffX - 3, dy + sparkleOffY);
      ctx.lineTo(dx + sparkleOffX + 3, dy + sparkleOffY);
      ctx.moveTo(dx + sparkleOffX, dy + sparkleOffY - 3);
      ctx.lineTo(dx + sparkleOffX, dy + sparkleOffY + 3);
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
      const wcos = Math.cos(wingAngle);
      const wsin = Math.abs(Math.sin(wingAngle));
      const wingX = 6 * wcos;
      const wingY = -4 * wsin - 3;
      ctx.fillStyle = w.color;
      // Left wing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-wingX, wingY);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wingX, wingY);
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
  const launchY = player.springLaunchY > 0 ? player.springLaunchY : (player.y + player.height);
  const playerFeetY = player.y + player.height;
  const t = player.springTrailTimer / SPRING_TRAIL_DURATION; // 1 = just started, 0 = fading

  // Curlicue arc from launch point up to current player position.
  // Anchored at launchY (where the spring fired) so the trail visibly stretches
  // as the player rises, instead of attaching to the moving player feet.
  ctx.save();
  ctx.strokeStyle = `rgba(255,212,90,${(0.55 * t).toFixed(3)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const STEPS = 14;
  const WOBBLE_FREQ = 20;
  const WOBBLE_AMP = 4;
  const phaseOffset = frameTime * 0.005;
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS;
    // ay interpolates from launchY (s=0) up to playerFeetY (s=1)
    const ay = launchY + (playerFeetY - launchY) * u;
    const ax = cx + Math.sin(u * WOBBLE_FREQ + phaseOffset) * WOBBLE_AMP;
    if (s === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
  }
  ctx.stroke();
  ctx.restore();
}
