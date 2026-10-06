import type { CharacterPack } from '../../../src/engine/characters/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';
import { STUDY_CHARACTERS } from './prototypePacks';

export type RasterStyle = 'pocket-plush' | 'floppy-beanbags' | 'layered-felt';
type Crop = readonly [x: number, y: number, width: number, height: number];
type Size = readonly [width: number, height: number];

const SHEETS: Record<RasterStyle, { url: string; crops: readonly Crop[]; sizes: readonly Size[] }> = {
  'pocket-plush': {
    url: new URL('./v2/pocket-plush-concept.png', import.meta.url).href,
    crops: [[32, 20, 378, 709], [417, 89, 469, 641], [902, 206, 341, 526], [1255, 104, 406, 626], [1680, 170, 408, 560]],
    sizes: [[23, 42], [32, 35], [30, 28], [30, 34], [31, 34]],
  },
  'floppy-beanbags': {
    url: new URL('./v2/floppy-beanbags-concept.png', import.meta.url).href,
    crops: [[21, 48, 357, 633], [407, 144, 422, 536], [830, 340, 420, 340], [1250, 112, 449, 569], [1722, 193, 332, 487]],
    sizes: [[24, 42], [33, 33], [36, 26], [33, 36], [30, 35]],
  },
  'layered-felt': {
    url: new URL('./v2/layered-felt-concept.png', import.meta.url).href,
    crops: [[51, 33, 258, 644], [332, 128, 509, 550], [852, 269, 465, 419], [1343, 91, 373, 587], [1748, 224, 371, 454]],
    sizes: [[21, 42], [35, 35], [37, 28], [30, 35], [32, 33]],
  },
};

/** Mockup-only raster rendering. It tests match-scale legibility, not animation. */
export async function registerRasterConceptPacks(style: RasterStyle): Promise<void> {
  const sheet = SHEETS[style];
  const image = new Image();
  image.src = sheet.url;
  await image.decode();
  STUDY_CHARACTERS.forEach((animal, index) => {
    const original = getCharacterPack(animal);
    if (!original) throw new Error(`Missing character pack: ${animal}`);
    const [sx, sy, sw, sh] = sheet.crops[index];
    const [dw, dh] = sheet.sizes[index];
    const pack: CharacterPack = {
      ...original,
      customEyes: true,
      noHighlight: true,
      // The concept already contains full feet; make the shared leg pass visually negligible.
      legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
      drawSprite: (ctx, cx, yOff, _w, h) => {
        const dx = cx - dw / 2;
        const dy = yOff + h - dh;
        if (style === 'floppy-beanbags' && animal === 'Fox') {
          // The source sheet's frog touches the fox's crop near the lower-right corner.
          ctx.save(); ctx.beginPath();
          ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy);
          ctx.lineTo(dx + dw, dy + dh * .85);
          ctx.lineTo(dx + dw * .93, dy + dh * .85);
          ctx.lineTo(dx + dw * .93, dy + dh);
          ctx.lineTo(dx, dy + dh); ctx.closePath(); ctx.clip();
        }
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        if (style === 'floppy-beanbags' && animal === 'Fox') ctx.restore();
      },
    };
    registerCharacter(pack);
  });
}
