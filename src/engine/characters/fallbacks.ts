import type { CharacterRenderer, GibRenderer } from './types';

/** Fallback renderer: colored pill shape. Eyes are NOT drawn here — unknown
 *  characters have customEyes=false, so the renderer draws generic eyes after. */
export const fallbackSpriteRenderer: CharacterRenderer = (
  ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors,
) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, yOff + h * 0.25, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
};

/** Fallback gib renderer: colored oval. */
export const fallbackGibRenderer: GibRenderer = (
  ctx, _gibType, width, height, colors,
) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
};
