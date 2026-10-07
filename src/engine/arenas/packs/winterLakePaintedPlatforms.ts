import type { Ctx2D, Platform } from '../../types';
import { CAP_DEPTH, capFrontY, skewPx } from '../../themes/drawPrimitives';

// The artboard is transparent. These bounds describe the painted silhouette.
// Horizontal pieces keep their end profiles at a fixed screen size. The
// interior stretches as one continuous painting; repetition made the snow
// edge and facets visibly mechanical at arena scale.
export const PAINTED_PLATFORM_SOURCES = {
  shelf: { x: 32, y: 154, width: 2112, height: 458, end: 280 },
  bridge: { x: 16, y: 290, width: 2141, height: 199, end: 195 },
  cube: { x: 157, y: 242, width: 1121, height: 660 },
} as const;

export type PaintedPlatformImage = keyof typeof PAINTED_PLATFORM_SOURCES;
type PaintedImages = Partial<Record<PaintedPlatformImage, CanvasImageSource | null>>;

export function paintedPlatformKind(platform: Platform, isGround: boolean): PaintedPlatformImage {
  if (platform.style === 'iceCube') return 'cube';
  return isGround || platform.style === 'snowBridge' ? 'bridge' : 'shelf';
}

function drawShelf(ctx: Ctx2D, image: CanvasImageSource, platform: Platform, isGround: boolean, kind: 'shelf' | 'bridge'): void {
  const source = PAINTED_PLATFORM_SOURCES[kind];
  const x = isGround ? platform.x - 20 : platform.x;
  const width = platform.width + skewPx() + (isGround ? 40 : 0);
  const y = platform.y - CAP_DEPTH / 2;
  const height = platform.height + CAP_DEPTH / 2;
  const end = Math.min(kind === 'bridge' ? 20 : 15, width * .27);
  const middleWidth = width - 2 * end;

  ctx.drawImage(image, source.x, source.y, source.end, source.height, x, y, end, height);
  if (middleWidth > 0) {
    ctx.drawImage(image, source.x + source.end, source.y, source.width - 2 * source.end, source.height,
      x + end, y, middleWidth, height);
  }
  ctx.drawImage(image, source.x + source.width - source.end, source.y, source.end, source.height,
    x + width - end, y, end, height);
}

function drawCube(ctx: Ctx2D, image: CanvasImageSource, platform: Platform): void {
  const source = PAINTED_PLATFORM_SOURCES.cube;
  const depth = platform.width * .3;
  const dx = platform.x;
  const dy = platform.y - depth / 2;
  const dw = platform.width + depth;
  const dh = platform.height + depth / 2;
  const side = Math.min(16, dw * .27);
  const vertical = Math.min(14, dh * .27);
  const sourceX = [source.x, source.x + 245, source.x + source.width - 245, source.x + source.width];
  const sourceY = [source.y, source.y + 170, source.y + source.height - 170, source.y + source.height];
  const destX = [dx, dx + side, dx + dw - side, dx + dw];
  const destY = [dy, dy + vertical, dy + dh - vertical, dy + dh];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      ctx.drawImage(image,
        sourceX[column], sourceY[row], sourceX[column + 1] - sourceX[column], sourceY[row + 1] - sourceY[row],
        destX[column], destY[row], destX[column + 1] - destX[column], destY[row + 1] - destY[row]);
    }
  }
}

export function drawPaintedWinterPlatform(
  ctx: Ctx2D, platform: Platform, isGround: boolean, frontOnly: boolean, images: PaintedImages,
): boolean {
  const kind = paintedPlatformKind(platform, isGround);
  const image = images[kind];
  if (!image) return false;
  if (kind === 'cube') {
    if (!frontOnly) drawCube(ctx, image, platform);
    return true;
  }
  ctx.save();
  if (frontOnly) {
    const y = capFrontY(platform);
    ctx.beginPath();
    ctx.rect(isGround ? platform.x - 20 : platform.x, y,
      platform.width + skewPx() + (isGround ? 40 : 0), platform.y + platform.height - y);
    ctx.clip();
  }
  drawShelf(ctx, image, platform, isGround, kind);
  ctx.restore();
  return true;
}
