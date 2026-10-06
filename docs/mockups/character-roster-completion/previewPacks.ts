import type { CharacterPack } from '../../../src/engine/characters/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';
import { selectPocketBunnyPose } from '../../../src/engine/characters/prototypes/pocketBunnyRig';
import { isRemainingAnimal, previewSize } from './roster';

/** Source-sheet preview for visual review only; these are not packed game atlases. */
export async function registerCompletionPreviewPacks(names: readonly string[]): Promise<void> {
  for (const animal of names) {
    if (!isRemainingAnimal(animal)) continue;
    const original = getCharacterPack(animal);
    if (!original) throw new Error(`Missing ${animal} pack`);
    const image = new Image();
    image.src = new URL(`./${animal.toLowerCase()}-poses-atlas.png`, import.meta.url).href;
    await image.decode();
    const cellW = image.width / 5;
    const cellH = image.height / 2;
    const size = previewSize[animal];
    const pack: CharacterPack = {
      ...original,
      customEyes: true,
      noHighlight: true,
      noOutline: true,
      authoredAngryBrows: true,
      legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
      resolvePose: selectPocketBunnyPose,
      drawSprite: (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, _colors, poseIndex = 5) => {
        const index = Math.max(0, Math.min(9, poseIndex));
        const drawW = size;
        ctx.drawImage(image,
          (index % 5) * cellW, Math.floor(index / 5) * cellH, cellW, cellH,
          cx - drawW / 2, yOff + h - size, drawW, size);
      },
    };
    registerCharacter(pack);
  }
}
