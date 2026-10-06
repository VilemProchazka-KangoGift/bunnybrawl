import type { CharacterPack } from '../types';
import { getCharacterPack, registerCharacter } from '../registry';

// Authored poses from the same Pocket Plush Bunny art direction. The atlas is
// prototype-only; the renderer still caches these at the game's display scale.
type Pose = { x: number; y: number; w: number; h: number; drawW: number; drawH: number };
const IDLE: Pose = { x: 34, y: 56, w: 337, h: 643, drawW: 27, drawH: 42 };
const WALK_A: Pose = { x: 451, y: 56, w: 362, h: 643, drawW: 29, drawH: 42 };
const WALK_PASS: Pose = { x: 878, y: 65, w: 316, h: 631, drawW: 27, drawH: 41 };
const WALK_B: Pose = { x: 1295, y: 67, w: 348, h: 633, drawW: 29, drawH: 42 };
const JUMP: Pose = { x: 1668, y: 32, w: 418, h: 610, drawW: 32, drawH: 40 };
const WALK = [WALK_A, WALK_PASS, WALK_B, WALK_PASS] as const;

export async function registerPocketBunnyRig(): Promise<void> {
  const original = getCharacterPack('Bunny');
  if (!original) throw new Error('Missing Bunny pack');
  const source = new URL('../../../../docs/mockups/character-styles/v3/pocket-bunny-poses.png', import.meta.url);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Pocket Plush poses failed to load: HTTP ${response.status}`);
  const atlas = await createImageBitmap(await response.blob());
  const pack: CharacterPack = {
    ...original,
    customEyes: true,
    noHighlight: true,
    outlineColor: '#241917',
    outlineWidth: .8,
    legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
    drawSprite: (ctx, cx, yOff, _w, h, state, animFrame) => {
      const pose = state === 'run' ? WALK[animFrame & 3] : state === 'airborne' ? JUMP : IDLE;
      const dx = cx - pose.drawW / 2;
      const dy = yOff + h - pose.drawH;
      ctx.drawImage(atlas, pose.x, pose.y, pose.w, pose.h, dx, dy, pose.drawW, pose.drawH);
    },
  };
  registerCharacter(pack);
}
