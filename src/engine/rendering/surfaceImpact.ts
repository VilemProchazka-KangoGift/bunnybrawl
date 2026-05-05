import type { MatchState, SurfaceDecal } from '../types';
import { SURFACE_RIPPLE_LIFE, SURFACE_RIPPLE_MAX_RADIUS } from '../constants';
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
 * Apply platform clip to a decal's draw region. Returns false if the decal
 * sits entirely outside the platform extent (caller should skip drawing).
 * Caller is responsible for ctx.save()/restore() — we only set up the clip.
 */
function applyDecalClip(
  ctx: CanvasRenderingContext2D, d: SurfaceDecal, halfW: number, halfH: number,
): boolean {
  const left = d.x - halfW;
  const right = d.x + halfW;
  if (d.clipMaxX !== undefined && left >= d.clipMaxX) return false;
  if (d.clipMinX !== undefined && right <= d.clipMinX) return false;
  if (d.clipMinX === undefined && d.clipMaxX === undefined) return true;
  const x0 = Math.max(d.clipMinX ?? -Infinity, left);
  const x1 = Math.min(d.clipMaxX ?? Infinity, right);
  ctx.beginPath();
  ctx.rect(x0, d.y - halfH, x1 - x0, halfH * 2);
  ctx.clip();
  return true;
}

/** Spider-crack pattern for ice/glass with deterministic jitter from `seed`. */
function drawCrack(ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number): void {
  const spokes = 6;
  const baseAngle = d.seed * Math.PI * 2;
  const len = d.surface === 'glass' ? 22 : 28;

  ctx.save();
  if (!applyDecalClip(ctx, d, len, len)) { ctx.restore(); return; }
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

  // Center impact dot
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hard-landing scuff: footprint-width oval clipped to the platform extent. */
function drawScuff(ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number): void {
  const halfW = 14;
  const halfH = 3;
  ctx.save();
  if (!applyDecalClip(ctx, d, halfW, halfH + 2)) { ctx.restore(); return; }
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
    const t = r.age / SURFACE_RIPPLE_LIFE;
    if (t >= 1) continue;
    const fade = 1 - t;
    ctx.strokeStyle = r.surface === 'lava' ? `rgba(255, 180, 60, ${fade})` : `rgba(180, 220, 255, ${fade})`;
    for (let k = 0; k < 3; k++) {
      const kt = t - k * 0.18;
      if (kt <= 0 || kt >= 1) continue;
      const radius = SURFACE_RIPPLE_MAX_RADIUS * kt;
      const ringAlpha = (1 - kt) * fade;
      ctx.globalAlpha = ringAlpha;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

