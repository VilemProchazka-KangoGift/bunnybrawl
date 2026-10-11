import type { Ctx2D } from '../../../../src/engine/types';
import { createSpringRenderer } from '../../../../src/engine/themes/drawPrimitives';

export const RENDERED_BULLDOGS = ['rendered-cheeky', 'rendered-unimpressed', 'rendered-guardian'] as const;
export type RenderedBulldog = typeof RENDERED_BULLDOGS[number];

type Loaded = { image: HTMLImageElement; source: { x: number; y: number; width: number; height: number } };
const art = new Map<RenderedBulldog, Loaded>();
const filenames: Record<RenderedBulldog, string> = {
  'rendered-cheeky': 'cheeky.png',
  'rendered-unimpressed': 'unimpressed.png',
  'rendered-guardian': 'guardian.png',
};

async function load(name: RenderedBulldog): Promise<void> {
  const image = new Image();
  image.src = `/bunnybrawl/docs/mockups/castle-cartoon-props/bulldog-renders/${filenames[name]}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error(`${name} has no visible pixels`);
  art.set(name, { image, source: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } });
}

export async function preloadRenderedBulldogs(): Promise<void> {
  await Promise.all(RENDERED_BULLDOGS.map(load));
}

export function renderedBulldogSpring(name: RenderedBulldog) {
  return createSpringRenderer((ctx: Ctx2D, x, y, _size, bounce) => {
    const loaded = art.get(name);
    if (!loaded) return;
    const compression = Math.max(0, Math.min(1, bounce / 5));
    // This is a size study, not a final animation. The traced version will
    // author a separate compressed pose with a planted foot and opening wings.
    const height = 39 - compression * 5;
    const width = Math.min(52, height * loaded.source.width / loaded.source.height) + compression * 3;
    ctx.drawImage(loaded.image,
      loaded.source.x, loaded.source.y, loaded.source.width, loaded.source.height,
      x - width / 2, y - height, width, height);
  });
}
