import type { Ctx2D } from '../../types';
import { getCastleGuardianArt } from '../illustratedBackdropAsset';

/** Draw the selected Guardian poses without changing the spring's collision box. */
export function drawCastleGuardianSpring(ctx: Ctx2D, x: number, y: number, contactTimer: number): boolean {
  const art = getCastleGuardianArt();
  if (!art.rest || !art.compressed) return false;

  // The contact cooldown begins at 0.3 s. Hold the planted crouch for the
  // first ~0.14 s, then let the original pose spring back up.
  const crouched = contactTimer > 0.16;
  const image = crouched ? art.compressed : art.rest;
  const height = crouched ? 35 : 39;
  const width = Math.min(crouched ? 56 : 53, height * image.width / image.height);
  ctx.drawImage(image, x - width / 2, y - height, width, height);
  return true;
}
