import type { Ctx2D, WeatherParticle } from '../types';

export function drawInkLeaf(ctx: Ctx2D, leaf: WeatherParticle, lead = 0): void {
  ctx.save();
  ctx.translate(leaf.x + leaf.vx * lead, leaf.y + leaf.vy * lead);
  ctx.rotate(leaf.rotation + leaf.rotSpeed * lead);
  ctx.globalAlpha *= 0.55;
  const r = leaf.size;
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#486336';
  ctx.fillStyle = '#89ab58';
  ctx.beginPath(); ctx.moveTo(-r, 0);
  ctx.bezierCurveTo(-r * 0.2, -r * 0.75, r * 0.5, -r * 0.6, r, 0);
  ctx.bezierCurveTo(r * 0.2, r * 0.7, -r * 0.6, r * 0.45, -r, 0);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b9cb79';
  ctx.beginPath(); ctx.moveTo(-r * 0.8, 0);
  ctx.quadraticCurveTo(0, -r * 0.65, r * 0.85, 0);
  ctx.quadraticCurveTo(0, -r * 0.1, -r * 0.8, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r * 1.15, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
  ctx.restore();
}
