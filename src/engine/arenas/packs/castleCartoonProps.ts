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
  const upperGallery = arena.platforms.find(platform => platform.y < 300 && platform.width > 700);
  c.save();
  c.globalAlpha = .8;
  for (const x of [100, 400, 880, 1080]) c.drawImage(art.sconce, x - 12, groundY - 99, 24, 39);
  c.globalAlpha = .87;
  if (upperGallery) {
    // Gallery sentries mark the long upper landing without crowding its center spawn.
    c.drawImage(art.guard, upperGallery.x + 62, upperGallery.y - 72, 52, 72);
    mirror(c, art.guard, upperGallery.x + upperGallery.width - 114, upperGallery.y - 72, 52, 72);
  }
  // The former clipped edge pillars now read as supports beneath the side ledges.
  c.drawImage(art.column, 80, groundY - 80, 50, 80);
  mirror(c, art.column, 1150, groundY - 80, 50, 80);
  c.restore();
  return true;
}

export function drawCastleCartoonForeground(c: Ctx2D, _arena: Arena): boolean {
  const art = loadedArt();
  if (!art) return false;
  c.drawImage(art.chandelier, 580, 486, 120, 69);
  return true;
}
