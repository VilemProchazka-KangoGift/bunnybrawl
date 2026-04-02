import type { CharacterRenderer, GibRenderer } from './types';

/** Fallback renderer: colored pill shape with generic eyes.
 *  Used when a character pack doesn't provide a custom renderer. */
export const fallbackSpriteRenderer: CharacterRenderer = (
  ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors,
) => {
  // Body — rounded pill
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(cx, yOff + h * 0.25, w * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 4, yOff + h * 0.22, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4, yOff + h * 0.22, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 3, yOff + h * 0.20, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.20, 1, 0, Math.PI * 2);
  ctx.fill();
};

/** Fallback gib renderer: colored oval (same as existing default in drawGibShape). */
export const fallbackGibRenderer: GibRenderer = (
  ctx, _gibType, width, height, colors,
) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
};
