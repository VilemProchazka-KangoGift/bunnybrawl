import type { Ctx2D, Platform } from '../../../src/engine/types';
import { CAP_DEPTH, capFrontY, skewPx } from '../../../src/engine/themes/drawPrimitives';

// These source bounds exclude the transparent artboard, not hand-painted edges.
// The wide source suits 90–145px shelves; the thinner source suits the bridge
// and ground. Tiny steps sample an end segment with the fake 3D right face.
const sources = {
  short: { path: './glacial-ceramic-art-direction.png', x: 32, y: 154, width: 2112, height: 458 },
  long: { path: './painted-shelf-long.png', x: 16, y: 290, width: 2141, height: 199 },
  cube: { path: './painted-ice-block.png', x: 157, y: 242, width: 1121, height: 660 },
} as const;

const sprites = new Map<keyof typeof sources, HTMLImageElement>();

export async function preloadPaintedPlatforms(): Promise<void> {
  await Promise.all((Object.keys(sources) as (keyof typeof sources)[]).map(async key => {
    const image = new Image();
    image.src = new URL(sources[key].path, import.meta.url).href;
    await image.decode();
    sprites.set(key, image);
  }));
}

function mappedSource(platform: Platform) {
  if (platform.width >= 180) return { key: 'long' as const, ...sources.long };
  if (platform.width >= 80) return { key: 'short' as const, ...sources.short };
  return { key: 'short' as const, ...sources.short, x: 1330, width: 814 };
}

function drawPart(ctx: Ctx2D, platform: Platform, isGround: boolean, frontOnly: boolean): void {
  if (platform.style === 'iceCube') {
    if (frontOnly) return;
    const source = sources.cube;
    const sprite = sprites.get('cube');
    if (!sprite) throw new Error('Painted ice block was not decoded');
    const depth = platform.width * .3;
    ctx.drawImage(sprite, source.x, source.y, source.width, source.height,
      platform.x, platform.y - depth / 2, platform.width + depth, platform.height + depth / 2);
    return;
  }
  const source = mappedSource(platform);
  const sprite = sprites.get(source.key);
  if (!sprite) throw new Error(`Painted platform sprite ${source.key} was not decoded`);
  const dx = isGround ? platform.x - 20 : platform.x;
  const dw = (isGround ? platform.width + 40 : platform.width) + skewPx();
  const dy = platform.y - CAP_DEPTH / 2;
  const dh = platform.height + CAP_DEPTH / 2;
  const frontStart = capFrontY(platform);

  ctx.save();
  // The full painted sprite is cached behind characters. The portion starting
  // at the original cap-front line is repeated in the overlay pass so the
  // gameplay platform continues hiding a jumping player at the same boundary.
  if (frontOnly) {
    ctx.beginPath();
    ctx.rect(dx, frontStart, dw, platform.y + platform.height - frontStart);
    ctx.clip();
  }
  ctx.drawImage(sprite, source.x, source.y, source.width, source.height, dx, dy, dw, dh);
  ctx.restore();
}

export function drawPaintedPlatformBack(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  drawPart(ctx, platform, isGround, false);
}

export function drawPaintedPlatformFront(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  drawPart(ctx, platform, isGround, true);
}
