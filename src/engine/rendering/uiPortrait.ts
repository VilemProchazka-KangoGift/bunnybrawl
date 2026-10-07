import type { Ctx2D } from '../types';
import { portraitUrl } from '../../uiTheme';
import { getCharacterEmoji } from '../characters';
const portraits = new Map<string, ImageBitmap | null>();
const pending = new Set<string>();
let revision = 0;
export function getPortraitRevision(): number { return revision; }
/** Decoded once per renderer realm. Works in both the renderer worker and lobby. */
export function drawUiPortrait(ctx: Ctx2D, name: string, x: number, y: number, size: number): void {
  const bitmap = portraits.get(name);
  if (bitmap) { ctx.drawImage(bitmap, x, y, size, size); return; }
  if (!portraits.has(name) && !pending.has(name)) {
    pending.add(name);
    fetch(portraitUrl(name)).then(r => { if (!r.ok) throw new Error('portrait unavailable'); return r.blob(); })
      .then(blob => createImageBitmap(blob)).then(image => { portraits.set(name, image); revision++; })
      .catch(() => portraits.set(name, null)).finally(() => pending.delete(name));
  }
  ctx.save(); ctx.font = `${size * .6}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(getCharacterEmoji(name), x + size / 2, y + size / 2); ctx.restore();
}
