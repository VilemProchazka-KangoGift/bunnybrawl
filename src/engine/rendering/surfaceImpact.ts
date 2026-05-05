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
    const t = d.age / d.life;
    if (t >= 1) continue;
    const alpha = 1 - t;
    // 'crack' = full spider on ice/glass; 'scuff' = minicrack on any hard landing.
    const isFull = d.kind === 'crack';
    const len = isFull ? (d.surface === 'glass' ? 22 : 28) : 12;
    drawCrackPattern(ctx, d, alpha, len, isFull);
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

/**
 * Radial crack pattern. `len` controls reach; `isFull` toggles bifurcations
 * (full spider for ice/glass) vs the simpler minicrack used for any hard
 * landing on other surfaces.
 */
function drawCrackPattern(
  ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number,
  len: number, isFull: boolean,
): void {
  const spokes = isFull ? 6 : 5;
  const baseAngle = d.seed * Math.PI * 2;

  ctx.save();
  if (!applyDecalClip(ctx, d, len, len)) { ctx.restore(); return; }
  ctx.globalAlpha = alpha * (isFull ? 0.7 : 0.85);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isFull ? 1.2 : 1.4;
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = baseAngle + (i / spokes) * Math.PI * 2 + (i % 2 ? 0.2 : -0.15);
    const l = len * (0.6 + (((d.seed * 31 + i * 7) % 1) + 0) * 0.4);
    const ex = d.x + fastCos(a) * l;
    const ey = d.y + fastSin(a) * l * 0.35;  // flattened for ground perspective
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(ex, ey);
    if (isFull && i % 2 === 0) {
      const bx = d.x + fastCos(a) * (l * 0.55);
      const by = d.y + fastSin(a) * (l * 0.55) * 0.35;
      const fa = a + 0.5;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + fastCos(fa) * (l * 0.3), by + fastSin(fa) * (l * 0.3) * 0.35);
    }
  }
  ctx.stroke();

  // Center impact dot
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.arc(d.x, d.y, isFull ? 2 : 1.6, 0, Math.PI * 2);
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

