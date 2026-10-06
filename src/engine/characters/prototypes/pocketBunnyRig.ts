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
const EDGE_SCALE = 4;
const EDGE_PADDING = 2;
// Extend the authored edge by less than a game pixel, before downsampling.
const EDGE_RADIUS = .28 * EDGE_SCALE;

function renderPose(atlas: ImageBitmap, pose: Pose): OffscreenCanvas {
  const width = (pose.drawW + EDGE_PADDING * 2) * EDGE_SCALE;
  const height = (pose.drawH + EDGE_PADDING * 2) * EDGE_SCALE;
  const silhouette = new OffscreenCanvas(width, height);
  const mask = silhouette.getContext('2d')!;
  const x = EDGE_PADDING * EDGE_SCALE;
  const y = EDGE_PADDING * EDGE_SCALE;
  const w = pose.drawW * EDGE_SCALE;
  const h = pose.drawH * EDGE_SCALE;
  mask.imageSmoothingQuality = 'high';
  mask.drawImage(atlas, pose.x, pose.y, pose.w, pose.h, x, y, w, h);
  mask.globalCompositeOperation = 'source-in';
  mask.fillStyle = '#261a16';
  mask.fillRect(0, 0, width, height);

  const outlined = new OffscreenCanvas(width, height);
  const ctx = outlined.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    ctx.drawImage(silhouette, Math.cos(angle) * EDGE_RADIUS, Math.sin(angle) * EDGE_RADIUS);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(atlas, pose.x, pose.y, pose.w, pose.h, x, y, w, h);
  return outlined;
}

export async function registerPocketBunnyRig(): Promise<void> {
  const original = getCharacterPack('Bunny');
  if (!original) throw new Error('Missing Bunny pack');
  const source = new URL('../../../../docs/mockups/character-styles/v3/pocket-bunny-poses.png', import.meta.url);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Pocket Plush poses failed to load: HTTP ${response.status}`);
  const atlas = await createImageBitmap(await response.blob());
  const idle = renderPose(atlas, IDLE);
  const walkA = renderPose(atlas, WALK_A);
  const walkPass = renderPose(atlas, WALK_PASS);
  const walkB = renderPose(atlas, WALK_B);
  const jump = renderPose(atlas, JUMP);
  atlas.close();
  const walk = [
    { pose: WALK_A, bitmap: walkA },
    { pose: WALK_PASS, bitmap: walkPass },
    { pose: WALK_B, bitmap: walkB },
    { pose: WALK_PASS, bitmap: walkPass },
  ] as const;
  const pack: CharacterPack = {
    ...original,
    customEyes: true,
    noHighlight: true,
    noOutline: true,
    legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
    drawSprite: (ctx, cx, yOff, _w, h, state, animFrame) => {
      const { pose, bitmap } = state === 'run' ? walk[animFrame & 3]
        : state === 'airborne' ? { pose: JUMP, bitmap: jump }
          : { pose: IDLE, bitmap: idle };
      const dx = cx - pose.drawW / 2 - EDGE_PADDING;
      const dy = yOff + h - pose.drawH - EDGE_PADDING;
      ctx.drawImage(bitmap, dx, dy, pose.drawW + EDGE_PADDING * 2, pose.drawH + EDGE_PADDING * 2);
    },
  };
  registerCharacter(pack);
}
