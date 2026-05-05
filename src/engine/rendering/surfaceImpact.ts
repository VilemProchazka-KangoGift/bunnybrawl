import type { MatchState, SurfaceDecal } from '../types';
import { fastSin, fastCos } from '../fastMath';

/**
 * Draw all active surface decals (cracks + scuffs). Each decal fades over
 * its lifetime. Drawn behind players/particles, on top of platform caps.
 */
export function drawSurfaceDecals(ctx: CanvasRenderingContext2D, state: MatchState): void {
  const decals = state.surfaceDecals;
  if (decals.length === 0) return;

  ctx.save();
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i];
    const t = d.age / d.life;       // 0 → 1 over lifetime
    if (t >= 1) continue;
    const alpha = 1 - t;             // linear fade
    if (d.kind === 'crack') {
      drawCrack(ctx, d, alpha);
    } else {
      drawScuff(ctx, d, alpha);
    }
  }
  ctx.restore();
}

/**
 * Spider-crack pattern for ice/glass. Draws 5-7 radial cracks emanating
 * from the impact point with deterministic jitter from `seed`.
 */
function drawCrack(ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number): void {
  const spokes = 6;
  const baseAngle = d.seed * Math.PI * 2;
  const len = d.surface === 'glass' ? 22 : 28;

  // Clip whole crack if center sits past the platform edge.
  if (d.clipMaxX !== undefined && d.x >= d.clipMaxX) return;
  if (d.clipMinX !== undefined && d.x <= d.clipMinX) return;

  ctx.save();
  if (d.clipMinX !== undefined || d.clipMaxX !== undefined) {
    const x0 = d.clipMinX ?? d.x - len;
    const x1 = d.clipMaxX ?? d.x + len;
    ctx.beginPath();
    ctx.rect(x0, d.y - len, x1 - x0, len * 2);
    ctx.clip();
  }
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = baseAngle + (i / spokes) * Math.PI * 2 + (i % 2 ? 0.2 : -0.15);
    const l = len * (0.6 + (((d.seed * 31 + i * 7) % 1) + 0) * 0.4);
    const ex = d.x + fastCos(a) * l;
    const ey = d.y + fastSin(a) * l * 0.35;  // flattened for ground perspective
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(ex, ey);
    // small bifurcation
    if (i % 2 === 0) {
      const bx = d.x + fastCos(a) * (l * 0.55);
      const by = d.y + fastSin(a) * (l * 0.55) * 0.35;
      const fa = a + 0.5;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + fastCos(fa) * (l * 0.3), by + fastSin(fa) * (l * 0.3) * 0.35);
    }
  }
  ctx.stroke();

  // Small impact dot at center
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Hard-landing scuff: a small character-tinted oval centered on the impact
 * point. Debris flecks are emitted as airborne particles at spawn time
 * (see surfaceImpact.ts:emitScuffDebris) so they're not part of this draw.
 *
 * Clipped horizontally to the platform extent so edge landings don't paint
 * the oval into empty space. No clip = global decal (e.g. ground floor).
 */
function drawScuff(ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number): void {
  // Footprint-width oval (~player foot wide) so edge landings visibly clip.
  const halfW = 14;
  const halfH = 3;
  const left = d.x - halfW;
  const right = d.x + halfW;
  // Drop entirely if the oval sits past the platform edge.
  if (d.clipMaxX !== undefined && left >= d.clipMaxX) return;
  if (d.clipMinX !== undefined && right <= d.clipMinX) return;

  const needsClip = (d.clipMinX !== undefined && left < d.clipMinX)
    || (d.clipMaxX !== undefined && right > d.clipMaxX);

  ctx.save();
  if (needsClip) {
    const x0 = Math.max(d.clipMinX ?? -Infinity, left);
    const x1 = Math.min(d.clipMaxX ?? Infinity, right);
    ctx.beginPath();
    ctx.rect(x0, d.y - halfH - 2, x1 - x0, halfH * 2 + 4);
    ctx.clip();
  }
  // Outer footprint (char-tinted, soft).
  ctx.globalAlpha = alpha * 0.65;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - 1, halfW, halfH, (d.seed - 0.5) * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Darker inner core for a stronger impact mark.
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.ellipse(d.x + (d.seed - 0.5) * 4, d.y - 1, halfW * 0.55, halfH * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Liquid ripple: 3 expanding rings over the ripple's lifetime. Lava ripples
 * use warm orange, water ripples use cool cyan.
 */
export function drawRipples(ctx: CanvasRenderingContext2D, state: MatchState): void {
  const ripples = state.ripples;
  if (ripples.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const t = r.age / r.life;
    if (t >= 1) continue;
    const fade = 1 - t;
    ctx.strokeStyle = r.surface === 'lava' ? `rgba(255, 180, 60, ${fade})` : `rgba(180, 220, 255, ${fade})`;
    // 3 rings staggered at t = 0, 0.2, 0.4
    for (let k = 0; k < 3; k++) {
      const kt = t - k * 0.18;
      if (kt <= 0 || kt >= 1) continue;
      const radius = r.maxRadius * kt;
      const ringAlpha = (1 - kt) * fade;
      ctx.globalAlpha = ringAlpha;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

