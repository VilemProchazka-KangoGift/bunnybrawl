import type { CharacterPack } from '../types';
import { getCharacterPack, registerCharacter } from '../registry';

// Each pose is authored artwork, packed at 4x display resolution. This keeps
// the game renderer to one drawImage per pose, including the ink edge.
const COLS = 4;
const CELL_W = 152;
const CELL_H = 188;
const DRAW_W = CELL_W / 4;
const DRAW_H = CELL_H / 4;
const BLINK = 0;
const SIT = 1;
const noop = () => {};

export async function registerPocketBunnyRig(): Promise<void> {
  const original = getCharacterPack('Bunny');
  if (!original) throw new Error('Missing Bunny pack');
  const source = new URL('../../../../docs/mockups/character-styles/v4/pocket-bunny-game-atlas.png', import.meta.url);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Pocket Plush atlas failed to load: HTTP ${response.status}`);
  const atlas = await createImageBitmap(await response.blob());

  const pack: CharacterPack = {
    ...original,
    customEyes: true,
    noHighlight: true,
    noOutline: true,
    legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
    idleActions: {
      weights: { headBob: 0, headTilt: 0, headShake: 0, littleHop: 0, stretch: 0, lookAround: 0 },
      custom: [
        { id: 'pocketBlink', duration: 0.5, weight: 3, apply: noop },
        { id: 'pocketSit', duration: 2.4, weight: 1, apply: noop },
      ],
    },
    resolvePose: (state, animFrame, fastFalling, idleAction, idleT, squashScale) => {
      if (state === 'airborne') return fastFalling ? 9 : 4;
      // The impact drawing carries the landing compression in the art itself.
      if (squashScale < 0.87) return 10;
      if (state === 'run') return [1, 2, 3, 2][animFrame & 3];
      if (idleAction === SIT) return idleT < 0.16 || idleT > 0.84 ? 7 : 8;
      if (idleAction === BLINK) return idleT > 0.28 && idleT < 0.72 ? 6 : 5;
      return 5;
    },
    drawSprite: (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, _colors, poseIndex = 5) => {
      const pose = Math.max(0, Math.min(10, poseIndex));
      ctx.drawImage(
        atlas,
        (pose % COLS) * CELL_W, Math.floor(pose / COLS) * CELL_H, CELL_W, CELL_H,
        cx - DRAW_W / 2, yOff + h - DRAW_H + 2, DRAW_W, DRAW_H,
      );
    },
  };
  registerCharacter(pack);
}
