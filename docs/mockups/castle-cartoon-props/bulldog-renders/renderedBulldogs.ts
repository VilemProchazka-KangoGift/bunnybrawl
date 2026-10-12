import type { Ctx2D } from '../../../../src/engine/types';
import { createSpringRenderer } from '../../../../src/engine/themes/drawPrimitives';

export const RENDERED_BULLDOGS = ['rendered-cheeky', 'rendered-unimpressed', 'rendered-guardian', 'traced-guardian-10', 'traced-guardian-16'] as const;
export type RenderedBulldog = typeof RENDERED_BULLDOGS[number];

type Loaded = { image: HTMLImageElement; source: { x: number; y: number; width: number; height: number } };
const art = new Map<RenderedBulldog, Loaded>();
let compressedGuardian: Loaded | null = null;
const filenames: Record<RenderedBulldog, string> = {
  'rendered-cheeky': 'cheeky.png',
  'rendered-unimpressed': 'unimpressed.png',
  'rendered-guardian': 'guardian.png',
  'traced-guardian-10': 'guardian-trace-10.svg',
  'traced-guardian-16': 'guardian-trace-16.svg',
};

async function loadImage(filename: string): Promise<Loaded> {
  const image = new Image();
  image.src = `/bunnybrawl/docs/mockups/castle-cartoon-props/bulldog-renders/${filename}`;
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
  if (right < left) throw new Error(`${filename} has no visible pixels`);
  return { image, source: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}

export async function preloadRenderedBulldogs(): Promise<void> {
  await Promise.all(RENDERED_BULLDOGS.map(async name => art.set(name, await loadImage(filenames[name]))));
  compressedGuardian = await loadImage('guardian-compressed-trace-10.svg');
}

export function renderedBulldogSpring(name: RenderedBulldog) {
  return createSpringRenderer((ctx: Ctx2D, x, y, _size, bounce) => {
    const compression = Math.max(0, Math.min(1, bounce / 5));
    const authoredCompression = name === 'traced-guardian-10' && compression > .5 && compressedGuardian;
    const loaded = authoredCompression || art.get(name);
    if (!loaded) return;
    const height = authoredCompression ? 35 : 39 - compression * 5;
    const width = Math.min(authoredCompression ? 56 : 52, height * loaded.source.width / loaded.source.height) + (authoredCompression ? 0 : compression * 3);
    ctx.drawImage(loaded.image,
      loaded.source.x, loaded.source.y, loaded.source.width, loaded.source.height,
      x - width / 2, y - height, width, height);
  });
}
