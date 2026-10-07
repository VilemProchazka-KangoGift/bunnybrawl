import type { Ctx2D } from '../types';

export const SPRING_BOING_DURATION = 0.18;

/** Brief ink accents anchored to the mushroom cap, never following the player. */
export function drawSpringBoing(ctx: Ctx2D, x: number, y: number, age: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(age)
    || age < 0 || age >= SPRING_BOING_DURATION) return;
  const t = age / SPRING_BOING_DURATION;
  const spread = 1 + t * 0.35;
  const entryAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.translate(x, y - 36);
  ctx.globalAlpha = entryAlpha * (1 - t) ** 0.8;
  ctx.strokeStyle = '#665344';
  ctx.fillStyle = '#FFF3D5';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const sx = side * 15 * spread;
    ctx.beginPath();
    ctx.moveTo(sx, -5);
    ctx.lineTo(sx + side * 6, -19);
    ctx.lineTo(sx + side * 10, -21);
    ctx.lineTo(sx + side * 5, -5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + side * 5, 3);
    ctx.lineTo(sx + side * 17, -3);
    ctx.lineTo(sx + side * 18, 0);
    ctx.lineTo(sx + side * 8, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#F2B653';
  ctx.beginPath();
  ctx.moveTo(-4, -7); ctx.lineTo(0, -26);
  ctx.lineTo(3, -24); ctx.lineTo(4, -7);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = entryAlpha;
}
