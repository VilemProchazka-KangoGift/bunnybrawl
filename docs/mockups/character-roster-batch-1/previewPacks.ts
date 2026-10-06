import type { CharacterPack } from '../../../src/engine/characters/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';
import { selectPocketBunnyPose } from '../../../src/engine/characters/prototypes/pocketBunnyRig';

/** Source-sheet preview for visual review only; these are not packed game atlases. */
export async function registerBatchOnePreviewPacks(): Promise<void> {
  for (const animal of ['Fox', 'Frog'] as const) {
    const original = getCharacterPack(animal);
    if (!original) throw new Error(`Missing ${animal} pack`);
    const image = new Image();
    image.src = new URL(`./${animal.toLowerCase()}-poses-source.png`, import.meta.url).href;
    await image.decode();
    const cellW = image.width / 5;
    const cellH = image.height / 2;
    const size = animal === 'Fox' ? 42 : 38;
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
        ctx.drawImage(image,
          (index % 5) * cellW, Math.floor(index / 5) * cellH, cellW, cellH,
          cx - size / 2, yOff + h - size, size, size);
      },
    };
    registerCharacter(pack);
  }
}
