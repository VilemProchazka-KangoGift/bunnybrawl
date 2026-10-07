import type { Ctx2D, Platform } from '../../../src/engine/types';
import { CAP_DEPTH, capFrontY, mulberry32, seedFor, skewPx, wavyDown } from '../../../src/engine/themes/drawPrimitives';

export const PLATFORM_VARIANTS = ['current', 'ink-rim', 'ice-strata', 'snow-crust'] as const;
export type PlatformVariant = (typeof PLATFORM_VARIANTS)[number];

function capFrontPoints(platform: Platform) {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  return wavyDown(platform.x, platform.width, capFrontY(platform), rng,
    { bumps: 4, ampMin: 2, ampMax: 4, valleyBase: 0.4 });
}

function strokeCapFront(ctx: Ctx2D, platform: Platform, color: string, width: number): void {
  const points = capFrontPoints(platform);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function strokeCube(ctx: Ctx2D, platform: Platform, color: string, width: number): void {
  const x = platform.x;
  const y = platform.y + platform.width * 0.15;
  const depth = platform.width * 0.3;
  const h = platform.height - depth / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + depth, y - depth);
  ctx.lineTo(x + platform.width + depth, y - depth);
  ctx.lineTo(x + platform.width + depth, y + h - depth);
  ctx.lineTo(x + platform.width, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.moveTo(x + platform.width, y);
  ctx.lineTo(x + platform.width + depth, y - depth);
  ctx.moveTo(x + platform.width, y);
  ctx.lineTo(x + platform.width, y + h);
  ctx.stroke();
  ctx.restore();
}

/** Drawn immediately after the production cap, before players. */
export function drawPlatformStudyBack(ctx: Ctx2D, platform: Platform, variant: PlatformVariant): void {
  if (variant === 'current') return;
  if (platform.style === 'iceCube') {
    strokeCube(ctx, platform, variant === 'snow-crust' ? 'rgba(63,83,105,.7)' : 'rgba(71,110,135,.68)', 1.5);
    return;
  }
  if (variant === 'ink-rim') strokeCapFront(ctx, platform, '#54748b', 2);
  if (variant === 'ice-strata') strokeCapFront(ctx, platform, '#507a96', 2.4);
  if (variant === 'snow-crust') strokeCapFront(ctx, platform, '#4c687a', 2.2);

  // The visible top plane stays where the collision plane and old cap sit.
  if (variant === 'ice-strata') {
    const rng = mulberry32(seedFor(platform.x, platform.y) ^ 0x572c);
    ctx.save();
    ctx.strokeStyle = 'rgba(105,150,175,.42)';
    ctx.lineWidth = 1;
    const count = Math.max(2, Math.floor(platform.width / 95));
    for (let i = 0; i < count; i++) {
      const x = platform.x + 14 + rng() * Math.max(8, platform.width - 28);
      const y = platform.y - CAP_DEPTH * (0.15 + rng() * .4);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7 + rng() * 9, y - 2); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Drawn after players with the platform's production front-face overlay. */
export function drawPlatformStudyFront(ctx: Ctx2D, platform: Platform, variant: PlatformVariant): void {
  if (variant === 'current' || platform.style === 'iceCube') return;
  const x = platform.x;
  const y = capFrontY(platform);
  const w = platform.width;
  const h = platform.y + platform.height - y;
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ 0x9b15);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  if (variant === 'ink-rim') {
    ctx.fillStyle = 'rgba(65,89,110,.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(54,77,96,.32)';
    ctx.lineWidth = 1.15;
    for (let i = 0, n = Math.max(2, Math.floor(w / 42)); i < n; i++) {
      const px = x + rng() * w;
      const py = y + 5 + rng() * Math.max(2, h - 9);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4 + rng() * 8, py + rng() * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(53,75,95,.45)';
    ctx.fillRect(x, y + h - 2, w, 2);
  } else if (variant === 'ice-strata') {
    ctx.fillStyle = 'rgba(72,134,164,.25)';
    ctx.fillRect(x, y, w, h);
    for (let layer = 0; layer < 2; layer++) {
      const py = y + h * (0.4 + layer * .31);
      ctx.strokeStyle = layer ? 'rgba(50,96,127,.6)' : 'rgba(235,250,255,.65)';
      ctx.lineWidth = layer ? 1.6 : 2;
      ctx.beginPath(); ctx.moveTo(x, py);
      for (let px = x + 18; px < x + w + 18; px += 18) {
        ctx.lineTo(Math.min(px, x + w), py + (rng() - .5) * 3);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(42,91,120,.38)';
    ctx.fillRect(x, y + h - 3, w, 3);
  } else {
    // A chunkier snow lip over an inkier blue-grey block.
    ctx.fillStyle = 'rgba(65,83,102,.3)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e7eff3';
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let px = x; px < x + w; px += 14) {
      ctx.quadraticCurveTo(px + 6, y + 10 + rng() * 3, Math.min(px + 14, x + w), y + 4 + rng() * 3);
    }
    ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4c687a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y + 7);
    for (let px = x + 14; px < x + w + 14; px += 14) {
      ctx.lineTo(Math.min(px, x + w), y + 6 + (rng() - .5) * 3);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(42,58,78,.46)'; ctx.fillRect(x, y + h - 3, w, 3);
  }
  ctx.restore();

  // The right side retains its fake 3D depth and shares the edge treatment.
  ctx.strokeStyle = variant === 'ice-strata' ? '#537f9a' : '#566f83';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + skewPx(), y - CAP_DEPTH);
  ctx.stroke();
}
