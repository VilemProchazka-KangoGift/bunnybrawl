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
      ctx.fillStyle = w.color || 'rgba(255, 120, 30, 0.6)';
      ctx.beginPath();
      ctx.arc(px, py, w.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
      ctx.beginPath();
      ctx.arc(px, py, w.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (w.type === 'leaf') {
      const rot = w.rotation + w.rotSpeed * lead;
      ctx.fillStyle = 'rgba(90, 160, 60, 0.4)';
      ctx.beginPath();
      ctx.ellipse(px, py, w.size, w.size * 0.4, rot, 0, Math.PI * 2);
      ctx.fill();
      // Vein line: from (-size*0.7, 0) to (size*0.7, 0) in the rotated frame.
      const dx = w.size * 0.7 * Math.cos(rot);
      const dy = w.size * 0.7 * Math.sin(rot);
      ctx.strokeStyle = 'rgba(60, 120, 40, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    } else if (w.type === 'petal') {
      ctx.fillStyle = 'rgba(255, 180, 200, 0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py, w.size, w.size * 0.6, w.rotation + w.rotSpeed * lead, 0, Math.PI * 2);
      ctx.fill();
    } else if (w.type === 'ash') {
      ctx.fillStyle = w.color || 'rgba(150, 150, 150, 0.4)';
      ctx.beginPath();
      ctx.ellipse(px, py, w.size, w.size * 0.5, w.rotation + w.rotSpeed * lead, 0, Math.PI * 2);
      ctx.fill();
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

// Star vertices on a unit circle (5 outer + 5 inner alternating). Constant
// across all particles — only multiplied by per-particle size + rotation.
const _STAR_UNIT = (() => {
  const out = new Float32Array(20);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const aIn = a + Math.PI / 5;
    out[i * 4 + 0] = Math.cos(a);
    out[i * 4 + 1] = Math.sin(a);
    out[i * 4 + 2] = Math.cos(aIn) * 0.4;
    out[i * 4 + 3] = Math.sin(aIn) * 0.4;
  }
  return out;
})();

export function drawConfetti(ctx: CanvasRenderingContext2D, confetti: ConfettiParticle[], lead = 0): void {
  // Hot path: rotation inlined per shape. See docs/perf-patterns.md.
  for (const c of confetti) {
    const cx = c.x + c.vx * lead;
    const cy = c.y + c.vy * lead;
    ctx.fillStyle = rgbString(c.color);
    ctx.globalAlpha = (c.life / c.maxLife) * 0.9;

    switch (c.shape) {
      case 'star': {
        const rot = c.rotation + c.rotationSpeed * lead;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const sz = c.size;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const ox = _STAR_UNIT[i * 4 + 0] * sz;
          const oy = _STAR_UNIT[i * 4 + 1] * sz;
          const ix = _STAR_UNIT[i * 4 + 2] * sz;
          const iy = _STAR_UNIT[i * 4 + 3] * sz;
          ctx.lineTo(cx + ox * cs - oy * sn, cy + ox * sn + oy * cs);
          ctx.lineTo(cx + ix * cs - iy * sn, cy + ix * sn + iy * cs);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'diamond': {
        const rot = c.rotation + c.rotationSpeed * lead;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const s = c.size;
        // Local verts: (0,-s), (0.6s,0), (0,s), (-0.6s,0)
        ctx.beginPath();
        ctx.moveTo(cx + s * sn, cy - s * cs);
        ctx.lineTo(cx + 0.6 * s * cs, cy + 0.6 * s * sn);
        ctx.lineTo(cx - s * sn, cy + s * cs);
        ctx.lineTo(cx - 0.6 * s * cs, cy - 0.6 * s * sn);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'ribbon': {
        const rot = c.rotation + c.rotationSpeed * lead;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const s = c.size, s3 = s * 0.3, s8 = s * 0.8;
        // Local verts: (-s,-s3), Q(0,-s8) → (s,-s3), L(s,s3), Q(0,s8) → (-s,s3)
        ctx.beginPath();
        ctx.moveTo(cx - s * cs + s3 * sn, cy - s * sn - s3 * cs);
        ctx.quadraticCurveTo(cx + s8 * sn, cy - s8 * cs, cx + s * cs + s3 * sn, cy + s * sn - s3 * cs);
        ctx.lineTo(cx + s * cs - s3 * sn, cy + s * sn + s3 * cs);
        ctx.quadraticCurveTo(cx - s8 * sn, cy + s8 * cs, cx - s * cs - s3 * sn, cy - s * sn + s3 * cs);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: // circle — rotation invisible
        ctx.beginPath();
        ctx.arc(cx, cy, c.size, 0, Math.PI * 2);
        ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
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
    const cx = w.x;
    const cy = w.y;

    if (w.type === 'butterfly') {
      const wingAngle = Math.sin(w.wingPhase) * 0.6;
      const wcos = Math.cos(wingAngle);
      const wsin = Math.abs(Math.sin(wingAngle));
      const wingX = 6 * wcos;
      const wingY = -4 * wsin - 3;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - wingX, cy + wingY);
      ctx.lineTo(cx - 3, cy);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + wingX, cy + wingY);
      ctx.lineTo(cx + 3, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillRect(cx - 0.5, cy - 1, 1, 3);
    } else if (w.type === 'fish') {
      const tailWag = Math.sin(w.wingPhase * 2) * 0.4;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy);
      ctx.lineTo(cx - 12, cy - 4 + tailWag * 4);
      ctx.lineTo(cx - 12, cy + 4 + tailWag * 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = w.color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - 3);
      ctx.lineTo(cx + 1, cy - 7);
      ctx.lineTo(cx + 4, cy - 3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(cx + 4, cy - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (w.type === 'bat') {
      ctx.fillStyle = w.color;
      const wingFlap = Math.sin(w.wingPhase) * 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 4, cy - 2 + wingFlap * 0.3);
      ctx.lineTo(cx - 10, cy + wingFlap);
      ctx.lineTo(cx - 7, cy);
      ctx.lineTo(cx - 4, cy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 4, cy - 2 + wingFlap * 0.3);
      ctx.lineTo(cx + 10, cy + wingFlap);
      ctx.lineTo(cx + 7, cy);
      ctx.lineTo(cx + 4, cy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Bird: simple M-shape silhouette
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      const wingFlap = Math.sin(w.wingPhase) * 4;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + wingFlap);
      ctx.lineTo(cx - 3, cy - 3);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 8, cy + wingFlap);
      ctx.stroke();
    }
  }
}

export function drawSpringTrail(ctx: CanvasRenderingContext2D, player: Player, frameTime: number): void {
  // Anchored at the spring (where the player launched from), not the moving player.
  // Two layers: a yellow energy column rising out of the spring + animated coil
  // rings racing up the column, both fading with springTrailTimer.
  const t = player.springTrailTimer / SPRING_TRAIL_DURATION;
  if (t <= 0 || !Number.isFinite(player.springLaunchX)) return;
  const launchX = player.springLaunchX;
  const launchY = player.springLaunchY;

  const COL_H = 70;
  const COL_HALF_W = 7;

  // Per-frame linear gradient over a small ellipse (~770 px). Below the
  // ~10k-pixel threshold for the bake-strip swap (see docs/perf-patterns.md);
  // direct gradient fill is cheaper here.
  const grad = ctx.createLinearGradient(launchX, launchY, launchX, launchY - COL_H);
  grad.addColorStop(0, `rgba(255,212,90,${0.4 * t})`);
  grad.addColorStop(0.55, `rgba(255,180,40,${0.16 * t})`);
  grad.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(launchX, launchY - COL_H / 2, COL_HALF_W, COL_H / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Coil rings racing upward — phase advances with timer + frameTime so rings
  // appear to rise out of the spring, evoking spring coils releasing.
  const RING_COUNT = 2;
  const animPhase = (1 - t) * 1.6 + frameTime * 0.002;
  ctx.strokeStyle = `rgba(255,235,120,${0.55 * t})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < RING_COUNT; i++) {
    const phase = (animPhase + i / RING_COUNT) % 1;
    const ry = launchY - phase * COL_H;
    const rw = 5 + phase * 7;
    // moveTo before each ellipse so sub-paths don't connect with a stroke line.
    ctx.moveTo(launchX + rw, ry);
    ctx.ellipse(launchX, ry, rw, 2, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
}
