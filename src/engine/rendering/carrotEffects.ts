import type { Ctx2D, Particle } from '../types';

/** Large pickup pieces keep their silhouette until the final fade. */
export function drawCarrotPiece(ctx: Ctx2D, p: Particle, lead = 0): void {
  const age = Math.max(0, p.maxLife - p.life + lead);
  const t = Math.min(1, age / p.maxLife);
  const alpha = t < .38 ? 1 : Math.pow((1 - t) / .62, .75);
  const size = p.size;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(p.x + p.vx * lead, p.y + p.vy * lead);
  ctx.rotate(Math.atan2(p.vy, p.vx) + age * (p.vx < 0 ? -6 : 6));
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.shape === 'carrotLeaf' ? '#526B45' : '#665344';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (p.shape === 'carrotLeaf') {
    ctx.moveTo(-size, 0);
    ctx.bezierCurveTo(-size * .1, -size * .8, size * .65, -size * .65, size, 0);
    ctx.bezierCurveTo(size * .2, size * .7, -size * .6, size * .55, -size, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size * .15, size, 0); ctx.stroke();
  } else {
    ctx.moveTo(-size, -size * .6); ctx.lineTo(size * .6, -size);
    ctx.lineTo(size, size * .45); ctx.lineTo(-size * .35, size * .7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#F9C984';ctx.beginPath();ctx.moveTo(-size * .5, -size * .3);
    ctx.lineTo(size * .25, -size * .5);ctx.stroke();
  }
  ctx.restore();
}
