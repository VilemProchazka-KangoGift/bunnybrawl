import type { Ctx2D, Platform } from '../../../src/engine/types';
import { drawPaintedWinterPlatform } from '../../../src/engine/arenas/packs/winterLakePaintedPlatforms';
import { drawVectorReplicaBack, drawVectorReplicaFront } from './vectorReplica';

let tracedBridge: HTMLImageElement | null = null;

export async function preloadTracedBridge(): Promise<void> {
  const image = new Image();
  image.src = new URL('./user-vector-tool-b.svg', import.meta.url).href;
  await image.decode();
  tracedBridge = image;
}

function draw(ctx: Ctx2D, platform: Platform, isGround: boolean, frontOnly: boolean): void {
  // The trace is a long shelf. Its detailed contours cannot survive shrinking
  // to the arena's 40px steps or fit the cubes' upright silhouette.
  if (platform.style === 'iceCube' || (!isGround && platform.width < 80)) {
    if (frontOnly) drawVectorReplicaFront(ctx, platform, isGround);
    else drawVectorReplicaBack(ctx, platform, isGround);
    return;
  }
  if (!tracedBridge) throw new Error('Traced bridge not preloaded');
  drawPaintedWinterPlatform(ctx, { ...platform, style: 'snowBridge' }, isGround, frontOnly, { bridge: tracedBridge });
}

export function drawTracedSvgBack(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  draw(ctx, platform, isGround, false);
}

export function drawTracedSvgFront(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  draw(ctx, platform, isGround, true);
}
