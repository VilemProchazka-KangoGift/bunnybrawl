import type { Ctx2D } from '../types';
import { getIllustratedBackdrop } from './illustratedBackdropAsset';

/** Draw once into the static background; false preserves procedural fallback. */
export function drawPaintedBackdrop(ctx: Ctx2D, arenaId: string): boolean {
  const image = getIllustratedBackdrop(arenaId);
  if (!image) return false;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(image, 0, 0, 1280, 720);
  ctx.restore();
  return true;
}
