import type { Ctx2D } from '../types';

/** Warm ink glimmer, centered at the current origin. Shared by stamp and fallback. */
export function drawWarmFirefly(ctx: Ctx2D): void {
  ctx.save();
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = '#ffdc80';
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#463e34';
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-1, -3); ctx.lineTo(3, -2);
  ctx.lineTo(4, 1); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe5a0';
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(0, -2); ctx.lineTo(2, 0);
  ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}
