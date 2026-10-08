import type { Arena, Ctx2D } from '../../../src/engine/types';
import { getFloatingPlatforms } from '../../../src/engine/themes/utils';

export const ILLUSTRATED_PROP_VARIANTS = ['painted-round', 'painted-wind', 'painted-cedar'] as const;
export type IllustratedPropVariant = (typeof ILLUSTRATED_PROP_VARIANTS)[number];

type Kind = 'tree' | 'bush' | 'snowman' | 'igloo' | 'pile';
type Source = readonly [number, number, number, number];
const sources: Record<Kind, readonly [Source, Source, Source]> = {
  tree: [[104, 20, 300, 290], [604, 18, 326, 292], [1119, 17, 306, 296]],
  bush: [[96, 321, 312, 158], [567, 324, 390, 157], [1110, 322, 365, 160]],
  snowman: [[144, 489, 215, 174], [650, 489, 235, 176], [1160, 490, 228, 174]],
  igloo: [[61, 673, 384, 194], [562, 674, 414, 193], [1091, 668, 405, 199]],
  pile: [[160, 865, 205, 134], [620, 867, 298, 132], [1151, 866, 257, 132]],
};

let atlas: HTMLImageElement | null = null;
export async function preloadPropAtlas(): Promise<void> {
  const image = new Image();
  image.src = new URL('./prop-atlas-transparent.png', import.meta.url).href;
  await image.decode();
  atlas = image;
}

function draw(ctx: Ctx2D, kind: Kind, column: number, x: number, baseY: number, width: number, height: number): void {
  if (!atlas) throw new Error('Winter prop atlas not preloaded');
  const [sx, sy, sw, sh] = sources[kind][column];
  ctx.drawImage(atlas, sx, sy, sw, sh, x - width / 2, baseY - height, width, height);
}

function column(variant: IllustratedPropVariant): number {
  return variant === 'painted-round' ? 0 : variant === 'painted-wind' ? 1 : 2;
}

function tree(ctx: Ctx2D, col: number, x: number, y: number, height: number): void {
  draw(ctx, 'tree', col, x, y, height * 1.02, height);
}

function snowman(ctx: Ctx2D, col: number, x: number, y: number, height: number): void {
  draw(ctx, 'snowman', col, x, y, height * 1.18, height);
}

function bush(ctx: Ctx2D, col: number, x: number, y: number, size: number): void {
  // The foreground bush is deliberate hiding cover. A solid leaf mass sits
  // behind the painted cutout so transparent gaps cannot reveal a player.
  const width = size * 2.2;
  ctx.beginPath();
  ctx.moveTo(x - width * .48, y);
  ctx.bezierCurveTo(x - width * .58, y - size * .38, x - width * .29, y - size * .95, x, y - size * .91);
  ctx.bezierCurveTo(x + width * .35, y - size * 1.01, x + width * .6, y - size * .38, x + width * .48, y);
  ctx.closePath(); ctx.fillStyle = col === 2 ? '#2d6568' : '#2d625e'; ctx.fill();
  draw(ctx, 'bush', col, x, y, width * 1.18, size * 1.13);
}

function smallIcicle(ctx: Ctx2D, x: number, y: number, height: number): void {
  ctx.fillStyle = '#a6d6e1';
  ctx.strokeStyle = '#315b6d';
  ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y);
  ctx.quadraticCurveTo(x + 1, y + height * .56, x, y + height);
  ctx.quadraticCurveTo(x - 1, y + height * .56, x - 2, y);
  ctx.fill(); ctx.stroke();
}

export function drawIllustratedPropBack(ctx: Ctx2D, arena: Arena, variant: IllustratedPropVariant): void {
  const col = column(variant);
  const ground = arena.platforms[0]; const y = ground.y;
  const floats = getFloatingPlatforms(arena.platforms);
  snowman(ctx, col, 55, y, 90);
  draw(ctx, 'igloo', col, 1170, y, 180, 100);
  tree(ctx, col, 200, y, 75);
  tree(ctx, col, 640, y, 55);
  tree(ctx, col, 1200, y, 60);
  snowman(ctx, col, 530, y, 32);
  for (let i = 0; i < floats.length; i++) {
    const plat = floats[i]; const mid = plat.x + plat.width / 2;
    if (plat.width >= 350) {
      tree(ctx, col, plat.x + 35, plat.y, 45);
      tree(ctx, col, plat.x + plat.width * .35, plat.y, 38);
      snowman(ctx, col, plat.x + plat.width * .58, plat.y, 26);
      tree(ctx, col, plat.x + plat.width - 35, plat.y, 42);
      smallIcicle(ctx, plat.x + 60, plat.y + plat.height, 10);
      smallIcicle(ctx, plat.x + plat.width - 60, plat.y + plat.height, 11);
    } else if (plat.width >= 200) {
      tree(ctx, col, plat.x + 25, plat.y, 38);
      tree(ctx, col, plat.x + plat.width - 28, plat.y, 32);
      if (i % 2 === 0) snowman(ctx, col, mid, plat.y, 25);
      smallIcicle(ctx, mid, plat.y + plat.height, 9);
    } else if (plat.width >= 140) {
      tree(ctx, col, mid - 12, plat.y, 30);
      if (i % 3 === 1) snowman(ctx, col, mid + 28, plat.y, 24);
    } else if (plat.width >= 80) {
      if (i % 3 === 1) snowman(ctx, col, mid, plat.y, 24);
      else tree(ctx, col, mid, plat.y, 22);
    }
  }
  const bridge = floats.find(platform => platform.width >= 350);
  if (bridge) for (let i = 0; i < 6; i++) smallIcicle(ctx, bridge.x + 30 + i * 60, bridge.y + bridge.height, 8 + i % 3 * 2);
}

export function drawIllustratedPropFront(ctx: Ctx2D, arena: Arena, variant: IllustratedPropVariant): void {
  const col = column(variant); const ground = arena.platforms[0]; const y = ground.y;
  tree(ctx, col, 50, y, 65);
  tree(ctx, col, 1230, y, 55);
  for (const plat of getFloatingPlatforms(arena.platforms)) if (plat.width >= 350) tree(ctx, col, plat.x + plat.width * .45, plat.y, 28);
  draw(ctx, 'pile', col, 850, y, 100, 58);
  bush(ctx, col, 350, y, 34);
  bush(ctx, col, 960, y, 30);
}
