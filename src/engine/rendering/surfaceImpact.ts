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

/** Selected wide rolling wave with seven molten droplets. */
function drawLavaEntrySplash(ctx: Ctx2D, age: number): void {
  const t = age / SURFACE_RIPPLE_LIFE;
  if (t < 0 || t >= 1) return;
  const lift = Math.sin(Math.PI * Math.min(1, t * 1.6));
  const spread = 1 + t * .7;
  ctx.save();
  ctx.globalAlpha=Math.min(1,t*22)*(1-t)**.8;
  ctx.fillStyle='#F4AE55';
  ctx.strokeStyle='#74452E';
  ctx.lineWidth=1.2;
  ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(-34*spread,2);
  ctx.bezierCurveTo(-37,-9*lift,-24,-16*lift,-18,-7*lift);
  ctx.bezierCurveTo(-10,-17*lift,-5,-15*lift,0,-5*lift);
  ctx.bezierCurveTo(9,-18*lift,19,-17*lift,23,-7*lift);
  ctx.bezierCurveTo(27,-10*lift,34,-7*lift,35*spread,2);
  ctx.quadraticCurveTo(0,7,-34*spread,2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const count = 7;
  for (let i = 0; i < count; i++) {
    const q = (i - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
    const x = q * (10 + 42 * t);
    const y = -(10 + (1 - Math.abs(q)) * 20) * Math.sin(Math.PI * Math.min(1, t * 1.45));
    const r = 3.4 * (1 - t * .55);
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(q*.6);
    ctx.beginPath();
    ctx.moveTo(0,-r*1.7);
    ctx.bezierCurveTo(r*1.5,-r*.2,r*1.3,r,0,r);
    ctx.bezierCurveTo(-r*1.3,r,-r*1.5,-r*.2,0,-r*1.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle='#FFD589';
    ctx.beginPath();
    ctx.ellipse(-r*.25,-r*.15,r*.22,r*.48,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Lava entry uses a wide molten splash; water retains three expanding rings.
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
    if (r.surface === 'lava') {
      ctx.save();
      ctx.translate(r.x, r.y);
      drawLavaEntrySplash(ctx, r.age);
      ctx.restore();
      continue;
    }
    const fade = 1 - t;
    ctx.strokeStyle = `rgba(180, 220, 255, ${fade})`;
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
