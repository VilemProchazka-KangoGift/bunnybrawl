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
}

/**
 * Surface debris palette for scuff decals. Two colors per surface — a
 * darker base for chips/leaves and a lighter for highlights/grains.
 */
const DEBRIS: Record<string, [string, string]> = {
  grass: ['#4A7A30', '#8AB860'],
  stone: ['#7A7066', '#C0B898'],
  wood:  ['#7A4F28', '#C8A278'],
  snow:  ['#E8F0FF', '#FFFFFF'],
  sand:  ['#A88858', '#E8D8A0'],
  metal: ['#FFE8B0', '#FFFFFF'],
  ice:   ['#A8C8E0', '#E8F8FF'],
  glass: ['#C0D8E0', '#FFFFFF'],
};

/**
 * Hard-landing scuff: a graphic impact pattern — small character-tinted
 * center + 6–10 surface-typed debris flecks radiating outward. Differs
 * per surface so wood splinters don't read like grass clumps.
 */
function drawScuff(ctx: CanvasRenderingContext2D, d: SurfaceDecal, alpha: number): void {
  const [debrisDark, debrisLight] = DEBRIS[d.surface] ?? DEBRIS.stone;
  const baseAngle = d.seed * Math.PI * 2;

  // Center impact — small character-tinted oval (id cue, not the whole effect).
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - 1, 6, 2.2, (d.seed - 0.5) * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Radial debris flecks — shape varies by surface.
  const fleckCount = 8;
  const spread = 18;
  for (let i = 0; i < fleckCount; i++) {
    const rand = ((d.seed * 23.7 + i * 5.13) % 1 + 1) % 1;
    const a = baseAngle + (i / fleckCount) * Math.PI * 2 + rand * 0.3;
    const r = spread * (0.5 + rand * 0.5);
    const fx = d.x + fastCos(a) * r;
    // Foreshorten Y for ground-perspective feel
    const fy = d.y + fastSin(a) * r * 0.4 - 0.5;

    const isLight = i % 2 === 0;
    ctx.fillStyle = isLight ? debrisLight : debrisDark;
    ctx.globalAlpha = alpha * (isLight ? 0.65 : 0.85);

    // Surface-specific fleck shape:
    if (d.surface === 'metal') {
      // Sparks: small bright lines radiating outward
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(d.x + fastCos(a) * 4, d.y + fastSin(a) * 4 * 0.4);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    } else if (d.surface === 'wood') {
      // Splinters: tiny rotated rectangles
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a);
      ctx.fillRect(-2, -0.6, 4, 1.2);
      ctx.restore();
    } else if (d.surface === 'grass') {
      // Leaf flecks: small triangles
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a + 0.3);
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(2, 1);
      ctx.lineTo(-2, 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (d.surface === 'snow') {
      // Powder puffs: soft circles
      ctx.beginPath();
      ctx.arc(fx, fy, 1.4 + rand * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.surface === 'ice') {
      // Skid hatch: thin streak
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a);
      ctx.fillRect(-3, -0.5, 6, 1);
      ctx.restore();
    } else {
      // stone / sand / glass / fallback: chip dots
      ctx.beginPath();
      ctx.arc(fx, fy, 1.2 + rand * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

