import type { Platform } from '../../../src/engine/types';
import { preloadIllustratedBackdrop, getWinterPlatformArt } from '../../../src/engine/arenas/illustratedBackdropAsset';
import { drawPaintedWinterPlatform } from '../../../src/engine/arenas/packs/winterLakePaintedPlatforms';
import { drawVectorReplicaBack } from './vectorReplica';
import { drawTracedSvgBack, preloadTracedBridge } from './tracedSvg';

const renderer = new URLSearchParams(location.search).get('renderer');
if (renderer === 'trace') await preloadTracedBridge();
else if (renderer !== 'vector') await preloadIllustratedBackdrop('winter_lake');
const images = renderer === 'vector' || renderer === 'trace' ? null : getWinterPlatformArt();
if (!renderer && (!images?.shelf || !images.bridge || !images.cube)) throw new Error('Winter platform art unavailable');
const canvas = document.querySelector<HTMLCanvasElement>('#study')!;
const ctx = canvas.getContext('2d')!;
function drawStudyPlatform(platform: Platform): void {
  if (renderer === 'vector') drawVectorReplicaBack(ctx, platform, false);
  else if (renderer === 'trace') drawTracedSvgBack(ctx, platform, false);
  else drawPaintedWinterPlatform(ctx, platform, false, false, images!);
}
ctx.fillStyle = '#b9cbdc';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#183d58';
ctx.font = 'bold 24px sans-serif';
ctx.fillText(`${renderer === 'vector' ? 'Vector replica' : renderer === 'trace' ? 'SVG trace hybrid' : 'Painted platforms'}: width and placement study`, 40, 38);
ctx.font = '15px sans-serif';
ctx.fillText('Orange line = collision top. Artwork does not change collision or landing height.', 40, 65);

const widths = [40, 45, 50, 65, 90, 120, 145, 180, 240, 400, 600];
for (let i = 0; i < widths.length; i++) {
  const width = widths[i];
  const platform: Platform = {
    x: 225 + (i % 3) * 56,
    y: 128 + i * 68,
    width,
    height: width < 80 ? 18 : 24,
    style: width >= 180 ? 'snowBridge' : undefined,
  };
  ctx.fillStyle = '#173a54';
  ctx.fillText(`${width} × ${platform.height}, x=${platform.x}`, 38, platform.y + 5);
  drawStudyPlatform(platform);
  ctx.strokeStyle = '#e57825';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(platform.x, platform.y);
  ctx.lineTo(platform.x + width, platform.y);
  ctx.stroke();
  ctx.fillStyle = '#e57825';
  ctx.fillRect(platform.x - 2, platform.y - 2, 4, 4);
  ctx.fillRect(platform.x + width - 2, platform.y - 2, 4, 4);
}

for (const [i, width] of [40, 65, 90].entries()) {
  const platform: Platform = { x: 260 + i * 190, y: 917, width, height: Math.round(width * .77), style: 'iceCube' };
  drawStudyPlatform(platform);
  ctx.fillStyle = '#173a54';
  ctx.fillText(`cube ${width} × ${platform.height}`, platform.x - 5, 1015);
  ctx.strokeStyle = '#e57825';
  ctx.beginPath();
  ctx.moveTo(platform.x, platform.y);
  ctx.lineTo(platform.x + width, platform.y);
  ctx.stroke();
}

document.documentElement.dataset.ready = 'true';
