import type { Ctx2D, Particle } from '../types';

const MOVEMENT_INK = '#665344';

/** A short, expanding cloud silhouette; one path rather than a shower of dots. */
export function drawMovementPuff(ctx: Ctx2D, p: Particle, lead = 0): void {
  const progress = Math.min(1, Math.max(0, (p.maxLife - p.life + lead) / p.maxLife));
  const growth = 1 - (1 - progress) ** 3;
  const r = p.size * (0.5 + growth * 0.5);
  const sx = p.shape === 'jumpCloud' ? 1.45 : 1.5;
  const x = p.x + p.vx * lead;
  const y = p.y + p.vy * lead;
  ctx.globalAlpha = (1 - progress) ** 1.2;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = MOVEMENT_INK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9 * sx, y + r * 0.12);
  ctx.bezierCurveTo(x - r * 1.3 * sx, y - r * 0.2, x - r * 0.8 * sx, y - r * 0.8, x - r * 0.35 * sx, y - r * 0.55);
  ctx.bezierCurveTo(x - r * 0.28 * sx, y - r * 1.05, x + r * 0.36 * sx, y - r * 0.95, x + r * 0.48 * sx, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.98 * sx, y - r * 0.63, x + r * 1.2 * sx, y - r * 0.04, x + r * 0.78 * sx, y + r * 0.22);
  ctx.bezierCurveTo(x + r * 0.48 * sx, y + r * 0.5, x - r * 0.45 * sx, y + r * 0.5, x - r * 0.9 * sx, y + r * 0.12);
  ctx.fill();
  ctx.stroke();
}

/** Irregular inked impact crown with a warm core and detached comic flecks. */
export function drawImpactCrown(ctx: Ctx2D, p: Particle, lead = 0): void {
  const t = Math.min(1, Math.max(0, (p.maxLife - p.life + lead) / p.maxLife));
  const r = p.size * (1.05 + 0.1 * Math.min(1, t * 4));
  const x = p.x, y = p.y;
  ctx.globalAlpha = (1 - t) ** 0.8;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = MOVEMENT_INK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.78, y - r * 0.18);
  ctx.lineTo(x - r * 1.04, y - r * 0.53);
  ctx.lineTo(x - r * 0.54, y - r * 0.32);
  ctx.lineTo(x - r * 0.67, y - r * 0.91);
  ctx.lineTo(x - r * 0.27, y - r * 0.49);
  ctx.lineTo(x - r * 0.08, y - r * 1.13);
  ctx.lineTo(x + r * 0.17, y - r * 0.55);
  ctx.lineTo(x + r * 0.56, y - r * 0.97);
  ctx.lineTo(x + r * 0.48, y - r * 0.34);
  ctx.lineTo(x + r * 1.06, y - r * 0.61);
  ctx.lineTo(x + r * 0.82, y - r * 0.16);
  ctx.lineTo(x + r, y);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.05, x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Uneven warm inset gives the burst volume without a soft glow.
  ctx.fillStyle = '#F2B653';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.69, y - r * 0.04);
  ctx.lineTo(x - r * 0.36, y - r * 0.27);
  ctx.lineTo(x - r * 0.31, y - r * 0.12);
  ctx.lineTo(x - r * 0.03, y - r * 0.61);
  ctx.lineTo(x + r * 0.12, y - r * 0.2);
  ctx.lineTo(x + r * 0.4, y - r * 0.43);
  ctx.lineTo(x + r * 0.34, y - r * 0.12);
  ctx.lineTo(x + r * 0.72, y - r * 0.05);
  ctx.closePath();
  ctx.fill();
  // Small angular chips break up the silhouette; deterministic across workers.
  ctx.fillStyle = p.color;
  const spread = 1 + t * 0.18;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.1 * spread, y - r * 0.75);
  ctx.lineTo(x - r * 1.2 * spread, y - r * 0.98);
  ctx.lineTo(x - r * 0.99 * spread, y - r * 0.85);
  ctx.closePath();
  ctx.moveTo(x + r * 0.85 * spread, y - r * 0.98);
  ctx.lineTo(x + r * 0.94 * spread, y - r * 1.13);
  ctx.lineTo(x + r * 1.04 * spread, y - r * 0.96);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
