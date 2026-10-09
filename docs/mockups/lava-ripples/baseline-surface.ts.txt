import type { Ctx2D } from '../types';
import type { MatchState, SurfaceDecal } from '../types';
import { SURFACE_RIPPLE_LIFE, SURFACE_RIPPLE_MAX_RADIUS } from '../constants';

// Selected fine branching web; fixed points keep the authored silhouette stable.
const FINE_CRACK_PATHS = [
  [[0, 1], [-8, -2], [-17, -1], [-29, -4]],
  [[-8, -2], [-12, -6], [-21, -8]],
  [[-17, -1], [-22, 3], [-30, 4]],
  [[0, 1], [9, 2], [18, -1], [29, 0]],
  [[9, 2], [13, 6], [23, 8]],
  [[18, -1], [22, -5], [28, -6]],
  [[0, 1], [-2, 5], [-10, 9]],
  [[-2, 5], [5, 8], [12, 9]],
] as const;

export function drawSurfaceDecals(ctx: Ctx2D, state: MatchState): void {
  const decals = state.surfaceDecals;
  if (decals.length === 0) return;

  ctx.save();
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i];
    const t = d.age / d.life;
    if (t >= 1) continue;
    drawFineCrackPattern(ctx, d, 1 - t);
  }
  ctx.restore();
}

/**
 * Apply platform clip to a decal's draw region. Returns false if the decal
 * sits entirely outside the platform extent (caller should skip drawing).
 * No-op (returns true with no clip path) when the decal sits fully inside.
 * Caller is responsible for ctx.save()/restore() — we only set up the clip.
 */
function applyDecalClip(
  ctx: Ctx2D, d: SurfaceDecal, halfW: number, halfH: number,
): boolean {
  const minX = d.clipMinX;
  const maxX = d.clipMaxX;
  if (minX === undefined && maxX === undefined) return true;
  const left = d.x - halfW;
  const right = d.x + halfW;
  if (maxX !== undefined && left >= maxX) return false;
  if (minX !== undefined && right <= minX) return false;
  // Fully inside — no clip path needed.
  if ((minX === undefined || left >= minX) && (maxX === undefined || right <= maxX)) return true;
  const x0 = Math.max(minX ?? -Infinity, left);
  const x1 = Math.min(maxX ?? Infinity, right);
  ctx.beginPath();
  ctx.rect(x0, d.y - halfH, x1 - x0, halfH * 2);
  ctx.clip();
  return true;
}

function drawFineCrackPattern(ctx: Ctx2D, d: SurfaceDecal, fade: number): void {
  ctx.save();
  const radius = d.kind === 'full' ? 32 : 21;
  if (!applyDecalClip(ctx, d, radius, radius)) { ctx.restore(); return; }
  ctx.translate(d.x, d.y);
  const scale = d.kind === 'full' ? 1 : .7;
  ctx.scale(scale, scale);
  ctx.globalAlpha = fade;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const points of FINE_CRACK_PATHS) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = '#574C42';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = .45;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Liquid ripple: 3 expanding rings over the ripple's lifetime. Lava ripples
 * use warm orange, water ripples use cool cyan.
 */
export function drawRipples(ctx: Ctx2D, state: MatchState): void {
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
