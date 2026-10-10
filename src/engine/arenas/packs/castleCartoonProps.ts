import type { Arena, Ctx2D } from '../../types';
import { getCastlePropArt } from '../illustratedBackdropAsset';

type CastleArt = { guard: ImageBitmap; sconce: ImageBitmap; chandelier: ImageBitmap; column: ImageBitmap };

function loadedArt(): CastleArt | null {
  const art = getCastlePropArt();
  return art.guard && art.sconce && art.chandelier && art.column ? art as CastleArt : null;
}

function mirror(c: Ctx2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  c.save();
  c.translate(x + w, y);
  c.scale(-1, 1);
  c.drawImage(image, 0, 0, w, h);
  c.restore();
}

export function drawCastleCartoonBackground(c: Ctx2D, arena: Arena): boolean {
  const art = loadedArt();
  if (!art) return false;
  const groundY = arena.platforms[0].y;
  c.save();
  c.globalAlpha = .8;
  for (const x of [100, 400, 880, 1080]) c.drawImage(art.sconce, x - 12, groundY - 99, 24, 39);
  c.globalAlpha = .87;
  c.drawImage(art.guard, 181, groundY - 72, 52, 72);
  mirror(c, art.guard, 1047, groundY - 72, 52, 72);
  c.restore();
  return true;
}

export function drawCastleCartoonForeground(c: Ctx2D, arena: Arena): boolean {
  const art = loadedArt();
  if (!art) return false;
  const groundY = arena.platforms[0].y;
  c.drawImage(art.column, -15, groundY - 86, 67, 116);
  mirror(c, art.column, 1228, groundY - 86, 67, 116);
  c.drawImage(art.chandelier, 580, 486, 120, 69);
  return true;
}
