// Hazard renderer factories — wrap theme-specific thorn/spring drawing with shared
// grow/fade/transform boilerplate so each arena's custom draw fn stays concise.

import type { Ctx2D } from '../../types';

export function createThornRenderer(
  draw: (ctx: Ctx2D, x: number, y: number, width: number, height: number, fadeAlpha: number) => void
): (ctx: Ctx2D, x: number, y: number, width: number, height: number, growScale: number, fadeAlpha: number) => void {
  return (ctx, x, y, width, height, growScale, fadeAlpha) => {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    const cx = x + width / 2;
    const by = y + height;
    ctx.translate(cx, by);
    ctx.scale(growScale, growScale);
    ctx.translate(-cx, -by);
    draw(ctx, x, y, width, height, fadeAlpha);
    ctx.restore();
  };
}

export function createSpringRenderer(
  draw: (ctx: Ctx2D, x: number, y: number, size: number, bounceTimer: number, fadeAlpha: number) => void
): (ctx: Ctx2D, x: number, y: number, size: number, bounceTimer: number, growScale: number, fadeAlpha: number) => void {
  return (ctx, x, y, size, bounceTimer, growScale, fadeAlpha) => {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(x, y);
    ctx.scale(growScale, growScale);
    ctx.translate(-x, -y);
    draw(ctx, x, y, size, bounceTimer, fadeAlpha);
    ctx.restore();
  };
}
