import type { CharacterPack } from '../../../src/engine/characters/types';
import type { Ctx2D } from '../../../src/engine/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';

// Prototype-only cutout rig from the Pocket Plush concept sheet. All coordinates
// are local to Bunny's source crop; the game renderer caches the four-frame poses.
const SOURCE = { x: 32, y: 20, w: 378, h: 709 };
const SIZE = { w: 23, h: 42 };
const RESOLUTION = 4;
const SHAPES = {
  leftEar: [[0, 43], [24, 37], [60, 43], [105, 75], [149, 123], [180, 187], [187, 228], [151, 245], [117, 217], [67, 188], [25, 137], [0, 98]],
  rightEar: [[190, 233], [187, 156], [206, 86], [247, 32], [291, 0], [322, 0], [349, 33], [355, 91], [346, 160], [321, 221], [289, 248], [240, 253]],
  leftFoot: [[79, 591], [98, 566], [155, 551], [205, 573], [208, 635], [195, 683], [156, 709], [94, 709], [75, 677]],
  rightFoot: [[205, 578], [239, 555], [297, 558], [340, 588], [352, 654], [327, 701], [251, 709], [211, 684]],
} as const;
type Part = keyof typeof SHAPES;

function path(ctx: CanvasRenderingContext2D, part: Part): void {
  const points = SHAPES[part];
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function layer(image: HTMLImageElement, keep: Part | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE.w * RESOLUTION;
  canvas.height = SIZE.h * RESOLUTION;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, SOURCE.x, SOURCE.y, SOURCE.w, SOURCE.h, 0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / SOURCE.w, canvas.height / SOURCE.h);
  if (keep) {
    ctx.globalCompositeOperation = 'destination-in';
    path(ctx, keep);
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    for (const part of Object.keys(SHAPES) as Part[]) {
      path(ctx, part);
      ctx.fill();
    }
  }
  ctx.restore();
  return canvas;
}

function drawPart(ctx: Ctx2D, bitmap: HTMLCanvasElement, dx: number, dy: number,
  pivotX: number, pivotY: number, angle: number): void {
  const x = pivotX * SIZE.w / SOURCE.w;
  const y = pivotY * SIZE.h / SOURCE.h;
  ctx.save();
  ctx.translate(dx + x, dy + y);
  ctx.rotate(angle);
  ctx.drawImage(bitmap, -x, -y, SIZE.w, SIZE.h);
  ctx.restore();
}

export async function registerPocketBunnyRig(): Promise<void> {
  const original = getCharacterPack('Bunny');
  if (!original) throw new Error('Missing Bunny pack');
  const image = new Image();
  image.src = new URL('./v2/pocket-plush-concept.png', import.meta.url).href;
  await image.decode();
  const body = layer(image, null);
  const leftEar = layer(image, 'leftEar');
  const rightEar = layer(image, 'rightEar');
  const leftFoot = layer(image, 'leftFoot');
  const rightFoot = layer(image, 'rightFoot');
  const run = [-1, 0, 1, 0];
  const pack: CharacterPack = {
    ...original,
    customEyes: true,
    noHighlight: true,
    legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
    drawSprite: (ctx, cx, yOff, _w, h, state, animFrame) => {
      const dx = cx - SIZE.w / 2;
      const dy = yOff + h - SIZE.h;
      const step = state === 'run' ? run[animFrame & 3] : 0;
      const airborne = state === 'airborne';
      drawPart(ctx, leftFoot, dx, dy, 147, 580, step * .17 + (airborne ? -.22 : 0));
      drawPart(ctx, rightFoot, dx, dy, 278, 580, -step * .17 + (airborne ? .22 : 0));
      drawPart(ctx, leftEar, dx, dy, 163, 227, step * .14 + (airborne ? -.20 : 0));
      drawPart(ctx, rightEar, dx, dy, 266, 226, -step * .12 + (airborne ? .17 : 0));
      ctx.drawImage(body, dx, dy, SIZE.w, SIZE.h);
    },
  };
  registerCharacter(pack);
}
