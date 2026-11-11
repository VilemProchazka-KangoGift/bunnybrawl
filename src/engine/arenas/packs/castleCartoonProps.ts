import type { Arena, Ctx2D } from '../../types';
import { getCastlePropArt } from '../illustratedBackdropAsset';
import { drawCastleGalleryDecoration, drawCastleWallDetails } from './castleRoyalGallery';
import { castleArmorBounds } from './castleWallProps';

type CastleArt = { guard: ImageBitmap; sconce: ImageBitmap; chandelier: ImageBitmap };

export const CASTLE_SCONCE_X = [90, 450, 830, 1190] as const;
export const CASTLE_SCONCE_FLAME_Y = 540;

function loadedArt(): CastleArt | null {
  const art = getCastlePropArt();
  return art.guard && art.sconce && art.chandelier ? art as CastleArt : null;
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
  drawCastleWallDetails(c);
  if (upperGallery) drawCastleGalleryDecoration(c, upperGallery);
  // Grade opaque art into the wall palette; lowering alpha made it translucent.
  c.globalAlpha = 1;
  c.filter = 'saturate(.7) brightness(.86)';
  for (const x of CASTLE_SCONCE_X) c.drawImage(art.sconce, x - 12, groundY - 140, 24, 39);
  c.filter = 'saturate(.55) brightness(.76)';
  if (upperGallery) {
    // Armor stands on the rear plane of the gallery top. Its feet and small
    // shadow end above the player's contact line, so crossing players read in front.
    const [left, right] = castleArmorBounds(upperGallery);
    c.drawImage(art.guard, left.x, left.y, left.width, left.height);
    mirror(c, art.guard, right.x, right.y, right.width, right.height);
    c.filter = 'none';
    c.fillStyle = '#46566a';
    for (const armor of [left, right]) {
      c.beginPath();
      c.ellipse(armor.x + armor.width / 2, upperGallery.y - 5, 17, 2, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  return true;
}

export function drawCastleCartoonForeground(c: Ctx2D, _arena: Arena): boolean {
  const art = loadedArt();
  if (!art) return false;
  // Extend the chain to the middle shelf so the lowered fixture still hangs from it.
  c.save();
  c.strokeStyle = '#354357';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(640, 500);
  c.lineTo(640, 515);
  c.stroke();
  c.restore();
  c.save();
  c.filter = 'saturate(.6) brightness(.78)';
  c.drawImage(art.chandelier, 580, 511, 120, 69);
  c.restore();
  return true;
}
