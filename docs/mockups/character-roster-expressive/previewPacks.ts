import type { CharacterPack } from '../../../src/engine/characters/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';
import { selectPocketBunnyPose } from '../../../src/engine/characters/prototypes/pocketBunnyRig';
import { expressiveSizes } from './roster';

// Maps the established ten-pose Bunny selector to this eight-beat visual study.
const studyIndex = [0, 1, 2, 2, 3, 0, 7, 4, 5, 6] as const;

/** Review-only source-sheet packs. No live-match character is changed. */
export async function registerExpressivePreviewPacks(names: readonly string[]): Promise<void> {
  for (const animal of names) {
    const original = getCharacterPack(animal);
    if (!original) throw new Error(`Missing ${animal} pack`);
    const image = new Image();
    image.src = new URL(`./${animal.toLowerCase()}-expressive-atlas.png`, import.meta.url).href;
    await image.decode();
    const cellW = image.width / 4;
    const cellH = image.height / 2;
    const size = expressiveSizes[animal];
    const pack: CharacterPack = {
      ...original,
      customEyes: true,
      noHighlight: true,
      noOutline: true,
      authoredAngryBrows: true,
      legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
      resolvePose: selectPocketBunnyPose,
      drawSprite: (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, _colors, poseIndex = 5) => {
        const index = studyIndex[Math.max(0, Math.min(9, poseIndex))];
        ctx.drawImage(image,
          (index % 4) * cellW, Math.floor(index / 4) * cellH, cellW, cellH,
          cx - size / 2, yOff + h - size, size, size);
      },
    };
    registerCharacter(pack);
  }
}
