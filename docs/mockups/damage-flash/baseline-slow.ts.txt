import type { Ctx2D } from '../types';

// The mask shares the lifetime and dimensions of its sprite-cache entry.
const washCache = new WeakMap<OffscreenCanvas, OffscreenCanvas>();
const burstPoints = Array.from({ length: 20 }, (_, i) => {
  const angle = i * Math.PI / 10 - .17;
  const radius = i % 2 ? 12.5 : 19.5 + Math.sin(i * 2.4) * 1.3;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
});

/** Silhouette wash follows the same facing, lean and idle transforms as the sprite. */
export function drawThornWash(ctx: Ctx2D, sprite: OffscreenCanvas,
  x: number, y: number, width: number, height: number, slowTimer: number, burnTimer: number): void {
  if (!(slowTimer > 0) || burnTimer > 0) return;
  let wash = washCache.get(sprite);
  if (!wash) {
    wash = new OffscreenCanvas(sprite.width, sprite.height);
    const mask = wash.getContext('2d')!;
    mask.drawImage(sprite, 0, 0);
    mask.globalCompositeOperation = 'source-in';
    mask.fillStyle = '#B7775D';
    mask.fillRect(0, 0, wash.width, wash.height);
    washCache.set(sprite, wash);
  }
  const alpha = ctx.globalAlpha;
  // Cancel only the shared slow fade. Retain protection blink and echo opacity.
  const slowOpacity = .7 + Math.sin(slowTimer * 8) * .15;
  ctx.globalAlpha = alpha / slowOpacity * (.26 + Math.sin(slowTimer * 3) * .03) * Math.min(1, slowTimer / .3);
  ctx.drawImage(wash, x, y, width, height);
  ctx.globalAlpha = alpha;
}

/** Selected comic burst: original pulse phase and peak fill opacity, irregular inked shape. */
export function drawThornPulse(ctx: Ctx2D, x: number, y: number, width: number, height: number, slowTimer: number): void {
  if (!(slowTimer > 0)) return;
  const pulse = Math.abs(Math.sin(slowTimer * 8));
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(width / 32, height / 32);
  ctx.fillStyle = `rgba(235,65,43,${pulse * .3})`;
  ctx.strokeStyle = `rgba(139,54,42,${pulse * .46})`;
  ctx.lineWidth = .95;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(burstPoints[0][0], burstPoints[0][1]);
  for (let i = 1; i < burstPoints.length; i++) ctx.lineTo(burstPoints[i][0], burstPoints[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,186,135,${pulse * .55})`;
  ctx.lineWidth = .8;
  ctx.beginPath();
  ctx.moveTo(-14, -6); ctx.lineTo(-16, -9);
  ctx.moveTo(13, 8); ctx.lineTo(16, 9);
  ctx.stroke();
  ctx.restore();
}
