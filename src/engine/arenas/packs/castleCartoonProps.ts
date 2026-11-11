import type { Arena, Ctx2D } from '../../types';
import { getCastlePropArt } from '../illustratedBackdropAsset';
import { drawCastleGalleryDecoration, drawCastleWallDetails } from './castleRoyalGallery';
import { drawCastleArmorMounts } from './castleWallProps';

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
  // Passive wall fixtures sit below the contrast of players and playable stone.
  c.globalAlpha = .65;
  for (const x of CASTLE_SCONCE_X) c.drawImage(art.sconce, x - 12, groundY - 140, 24, 39);
  c.globalAlpha = .62;
  if (upperGallery) {
    // Shallow mounts make the suits read as wall displays, never footholds.
    const [left, right] = drawCastleArmorMounts(c, upperGallery);
    c.drawImage(art.guard, left.x + 7, left.y + 16, 46, 62);
    mirror(c, art.guard, right.x + 7, right.y + 16, 46, 62);
  }
  c.restore();
  return true;
}

export function drawCastleCartoonForeground(c: Ctx2D, _arena: Arena): boolean {
  const art = loadedArt();
  if (!art) return false;
  // Extend the chain to the middle shelf so the lowered fixture still hangs from it.
  c.save();
  c.globalAlpha = .58;
  c.strokeStyle = '#293446';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(640, 500);
  c.lineTo(640, 515);
  c.stroke();
  c.restore();
  c.save();
  c.globalAlpha = .58;
  c.drawImage(art.chandelier, 580, 511, 120, 69);
  c.restore();
  return true;
}
