import type { Ctx2D, Platform } from '../../../src/engine/types';
import { CAP_DEPTH, backWavyUp, capBackY, capFrontY, drawPlatformCap, drawPlatformRightFace, leftWavy, mulberry32, seedFor, skewPx, wavyDown } from '../../../src/engine/themes/drawPrimitives';

export const PLATFORM_VARIANTS = [
  'current', 'ink-rim', 'ice-strata', 'snow-crust',
  'snow-pillow', 'glacial-ceramic', 'layered-snowbank',
  'inked-glaze', 'bubble-glacier', 'chalk-frost', 'storybook-glaze', 'painted-sprite', 'painted-scalable',
] as const;
export type PlatformVariant = (typeof PLATFORM_VARIANTS)[number];

export function isIllustratedStudy(variant: PlatformVariant): boolean {
  return variant === 'snow-pillow' || variant === 'glacial-ceramic' || variant === 'layered-snowbank'
    || variant === 'inked-glaze' || variant === 'bubble-glacier' || variant === 'chalk-frost'
    || variant === 'storybook-glaze';
}

function isCeramicFollowup(variant: PlatformVariant): variant is CeramicFollowup {
  return variant === 'inked-glaze' || variant === 'bubble-glacier' || variant === 'chalk-frost'
    || variant === 'storybook-glaze';
}

const palettes = {
  'snow-pillow': { ink: '#496578', ice: '#86abbc', shade: '#698fa5', snow: '#f2f0e5', seam: '#aab6cc' },
  'glacial-ceramic': { ink: '#436979', ice: '#74aebc', shade: '#537f99', snow: '#f1f3ed', seam: '#91c4d0' },
  'layered-snowbank': { ink: '#526a7b', ice: '#718fa5', shade: '#58748b', snow: '#f4f1e8', seam: '#a5afc3' },
  'inked-glaze': { ink: '#3f6072', ice: '#77aeb9', shade: '#537e95', snow: '#f3f2e7', seam: '#a7c5c8' },
  'bubble-glacier': { ink: '#426575', ice: '#83b7c5', shade: '#587d9c', snow: '#f3f3e9', seam: '#a9d4d4' },
  'chalk-frost': { ink: '#456678', ice: '#79aeb9', shade: '#567d91', snow: '#f2f3e9', seam: '#c5ddd9' },
  'storybook-glaze': { ink: '#31536b', ice: '#69afc4', shade: '#427f9d', snow: '#f8f7eb', seam: '#a8d8e4' },
} as const;

type IllustratedVariant = keyof typeof palettes;
type CeramicFollowup = 'inked-glaze' | 'bubble-glacier' | 'chalk-frost' | 'storybook-glaze';

function stroke(ctx: Ctx2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawCartoonLip(ctx: Ctx2D, x: number, y: number, w: number, snow: string, ink: string, seam: string, rng: () => number): void {
  const droopX = x + w * (.28 + rng() * .3);
  const secondX = x + w * (.72 + rng() * .13);
  const depth = w < 80 ? 2.2 : 3.5;
  ctx.fillStyle = snow;
  ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + w, y - 1);
  ctx.lineTo(x + w, y + 1.4);
  ctx.bezierCurveTo(secondX + 20, y + 1.5, secondX + 9, y + depth * .7, secondX, y + depth);
  ctx.bezierCurveTo(secondX - 20, y + depth * .83, droopX + 23, y + 1.3, droopX, y + 1.7);
  ctx.bezierCurveTo(droopX - 13, y + 1.3, droopX - 20, y + depth * 1.1, droopX - 31, y + depth * .76);
  ctx.quadraticCurveTo(x + 8, y + 1.1, x, y + 1.8);
  ctx.closePath(); ctx.fill();
  stroke(ctx, ink, 1.9);
  if (w > 105) {
    for (const [u, len] of [[.13, .12], [.66, .16]] as const) {
      ctx.beginPath(); ctx.moveTo(x + w * u, y + 5);
      ctx.quadraticCurveTo(x + w * (u + len * .5), y + 6.5, x + w * (u + len), y + 4.4);
      stroke(ctx, seam, 1.1);
    }
  }
}

function drawCartoonGround(ctx: Ctx2D, x: number, y: number, w: number, bottom: number, variant: CeramicFollowup): void {
  const p = palettes[variant];
  const h = bottom - y;
  if (variant === 'storybook-glaze') {
    ctx.fillStyle = '#89adbd'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#aacdd3';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + 5);
    ctx.bezierCurveTo(x + w * .77, y + 8, x + w * .6, y + 3, x + w * .39, y + 7);
    ctx.quadraticCurveTo(x + w * .15, y + 4, x, y + 6);
    ctx.closePath(); ctx.fill();
    // Three uneven connected lower masses avoid a continuous horizontal band.
    for (const [start, end, rise, color] of [
      [-.03, .23, .29, '#81a6b5'], [.36, .69, .35, '#7fa5b5'], [.81, 1.04, .25, '#83a7b6'],
    ] as const) {
      const a = x + w * start, b = x + w * end, top = bottom - h * rise;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a, bottom);
      ctx.lineTo(a, top + 5);
      ctx.bezierCurveTo(a + (b - a) * .27, top - 2, a + (b - a) * .58, top + 8, b, top + 3);
      ctx.lineTo(b, bottom); ctx.closePath(); ctx.fill();
    }
    for (const [start, span, rise] of [
      [.075, .066, .31], [.3, .102, .53], [.62, .054, .35], [.86, .083, .48],
    ] as const) {
      const px = x + w * start, pw = w * span, py = y + h * rise;
      ctx.fillStyle = 'rgba(206,238,230,.3)';
      ctx.beginPath(); ctx.moveTo(px, py + 4);
      ctx.quadraticCurveTo(px + pw * .19, py - 3, px + pw * .42, py);
      ctx.quadraticCurveTo(px + pw * .71, py - 3, px + pw, py + 2);
      ctx.quadraticCurveTo(px + pw * .67, py + 10, px, py + 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px + pw * .14, py + 1);
      ctx.quadraticCurveTo(px + pw * .44, py - 3, px + pw * .66, py);
      stroke(ctx, 'rgba(235,250,239,.69)', 1.35);
      ctx.beginPath(); ctx.moveTo(px + pw * .36, py + 6);
      ctx.lineTo(px + pw * .54, py + 8);
      stroke(ctx, 'rgba(56,116,148,.39)', 1);
    }
    ctx.beginPath(); ctx.moveTo(x, y + 1);
    ctx.bezierCurveTo(x + w * .28, y + 2.4, x + w * .66, y + .4, x + w, y + 1.8);
    stroke(ctx, p.ink, 1.6);
    return;
  }
  ctx.fillStyle = '#8faebd'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a8c8ce'; ctx.fillRect(x, y, w, Math.min(5, h * .15));
  ctx.fillStyle = '#7195a9';
  ctx.beginPath(); ctx.moveTo(x, bottom - h * .34);
  ctx.bezierCurveTo(x + w * .26, bottom - h * .42, x + w * .43, bottom - h * .25, x + w * .6, bottom - h * .37);
  ctx.quadraticCurveTo(x + w * .8, bottom - h * .49, x + w, bottom - h * .3);
  ctx.lineTo(x + w, bottom); ctx.lineTo(x, bottom); ctx.closePath(); ctx.fill();
  const clusters = [[.07, .045, .38], [.28, .062, .57], [.53, .039, .31], [.71, .054, .64], [.9, .042, .42]] as const;
  for (let i = 0; i < clusters.length; i++) {
    const [u, size, v] = clusters[i];
    const px = x + w * u, pw = w * size, py = y + h * v;
    if (variant === 'bubble-glacier' && i % 2 === 0) {
      ctx.fillStyle = 'rgba(224,247,240,.22)';
      ctx.beginPath(); ctx.ellipse(px + pw * .5, py, pw * .5, 5, -.12, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy, r] of [[.32, -.7, 2.2], [.6, 1.4, 1.3], [.77, -.8, 1.8]] as const) {
        ctx.beginPath(); ctx.arc(px + pw * dx, py + dy, r, 0, Math.PI * 2);
        stroke(ctx, 'rgba(236,255,246,.74)', 1);
      }
    } else {
      ctx.fillStyle = variant === 'chalk-frost' ? 'rgba(210,235,220,.32)' : 'rgba(223,244,235,.26)';
      ctx.beginPath(); ctx.moveTo(px, py + 2);
      ctx.quadraticCurveTo(px + pw * .17, py - 4, px + pw * .39, py - 1);
      ctx.quadraticCurveTo(px + pw * .73, py - 3, px + pw, py + 1);
      ctx.quadraticCurveTo(px + pw * .63, py + 6, px, py + 2); ctx.fill();
      for (let mark = 0; mark < 2; mark++) {
        const mx = px + pw * (.12 + mark * .39);
        ctx.beginPath(); ctx.moveTo(mx, py + (mark ? 3 : -1));
        ctx.quadraticCurveTo(mx + pw * .13, py - 3, mx + pw * .25, py);
        stroke(ctx, 'rgba(235,249,239,.54)', 1.25);
      }
    }
  }
  ctx.beginPath(); ctx.moveTo(x, y + 1);
  ctx.bezierCurveTo(x + w * .3, y + 2.4, x + w * .67, y + .2, x + w, y + 1.7);
  stroke(ctx, p.ink, 1.7);
}

function drawStorybookFront(ctx: Ctx2D, x: number, y: number, w: number, bottom: number, rng: () => number): void {
  const p = palettes['storybook-glaze'];
  const h = bottom - y;
  ctx.fillStyle = p.ice; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#addbe4'; ctx.fillRect(x, y, w, Math.min(3.5, h * .25));
  ctx.fillStyle = p.shade;
  ctx.beginPath(); ctx.moveTo(x, bottom - h * .28);
  ctx.bezierCurveTo(x + w * .21, bottom - h * .45, x + w * .32, bottom - h * .24, x + w * .51, bottom - h * .39);
  ctx.quadraticCurveTo(x + w * .79, bottom - h * .51, x + w, bottom - h * .27);
  ctx.lineTo(x + w, bottom); ctx.lineTo(x, bottom); ctx.closePath(); ctx.fill();

  const count = w < 80 ? 1 : w < 270 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const cx = x + w * ((i + .32 + rng() * .33) / count);
    const width = Math.min(w < 80 ? 22 : 53, w / count * (.36 + rng() * .23));
    const dark = i % 2 === 0 ? '#438ca8' : '#4d9bb2';
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(cx - width * .55, y + 5);
    ctx.quadraticCurveTo(cx - width * .2, y + 2, cx + width * .1, y + 4);
    ctx.lineTo(cx + width * .5, y + 6);
    ctx.quadraticCurveTo(cx + width * .2, bottom - 4, cx + width * .42, bottom);
    ctx.lineTo(cx - width * .45, bottom);
    ctx.quadraticCurveTo(cx - width * .18, y + h * .53, cx - width * .55, y + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(182,229,228,.48)';
    ctx.beginPath(); ctx.moveTo(cx - width * .42, y + 5);
    ctx.lineTo(cx - width * .06, y + 4);
    ctx.lineTo(cx + width * .13, bottom - 3);
    ctx.lineTo(cx - width * .19, bottom - 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - width * .45, y + 5);
    ctx.lineTo(cx - width * .17, y + 3);
    ctx.lineTo(cx + width * .08, bottom - 3);
    stroke(ctx, 'rgba(221,248,241,.68)', 1.25);
    // Fine snowy flecks stay inside a connected facet, never across the whole bar.
    for (let fleck = 0; fleck < Math.min(9, Math.floor(width / 5)); fleck++) {
      const fx = cx - width * .31 + rng() * width * .57;
      const fy = y + 6 + rng() * Math.max(1, h - 10);
      ctx.fillStyle = fleck % 3 ? 'rgba(239,253,243,.45)' : 'rgba(48,103,134,.26)';
      ctx.beginPath(); ctx.arc(fx, fy, .5 + rng() * .45, 0, Math.PI * 2); ctx.fill();
    }
    if (i === count - 1 && w > 110) {
      for (const [dx, dy, radius] of [[-.16, 0, 2], [.03, 2.4, 1.35], [.2, .3, 1.65]] as const) {
        ctx.beginPath(); ctx.arc(cx + width * dx, y + h * .53 + dy, radius, 0, Math.PI * 2);
        stroke(ctx, 'rgba(236,254,248,.85)', .95);
      }
    }
  }

  const n = w < 90 ? 1 : w < 245 ? 2 : 3;
  ctx.fillStyle = 'rgba(54,100,139,.34)';
  ctx.fillRect(x, y + 2, w, Math.min(6, h * .48));
  ctx.fillStyle = p.snow;
  ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + w, y - 1);
  ctx.lineTo(x + w, y + 2);
  for (let i = n - 1; i >= 0; i--) {
    const left = x + i * w / n;
    const right = x + (i + 1) * w / n;
    const depth = Math.min(h * .64, (4.3 + rng() * 3.7) * (w < 80 ? .75 : 1));
    const dipX = left + (right - left) * (.34 + rng() * .28);
    ctx.bezierCurveTo(right - (right - left) * .21, y + 1.4,
      dipX + (right - left) * .18, y + depth, dipX, y + depth);
    ctx.bezierCurveTo(dipX - (right - left) * .21, y + depth,
      left + (right - left) * .2, y + 1.7, left, y + 2);
  }
  ctx.closePath(); ctx.fill(); stroke(ctx, p.ink, 2);
  ctx.beginPath(); ctx.moveTo(x, bottom - .7); ctx.lineTo(x + w, bottom - .7);
  stroke(ctx, p.ink, 1.7);
}

function drawCartoonFront(ctx: Ctx2D, x: number, y: number, w: number, bottom: number, variant: CeramicFollowup, rng: () => number): void {
  if (variant === 'storybook-glaze') {
    drawStorybookFront(ctx, x, y, w, bottom, rng);
    return;
  }
  const p = palettes[variant];
  const h = bottom - y;
  ctx.fillStyle = p.ice; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = variant === 'bubble-glacier' ? '#a9d6d7' : '#a7cdd0';
  ctx.fillRect(x, y, w, Math.min(4, h * .23));
  ctx.fillStyle = p.shade;
  ctx.beginPath(); ctx.moveTo(x, bottom - h * .35);
  ctx.bezierCurveTo(x + w * .2, bottom - h * .55, x + w * .39, bottom - h * .29, x + w * .58, bottom - h * .42);
  ctx.quadraticCurveTo(x + w * .81, bottom - h * .57, x + w, bottom - h * .3);
  ctx.lineTo(x + w, bottom); ctx.lineTo(x, bottom); ctx.closePath(); ctx.fill();

  const count = w < 80 ? 1 : w < 190 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const cx = x + w * ([.19, .55, .83][i] + (rng() - .5) * .07);
    const cw = Math.min(w < 80 ? 17 : 28, w * .2);
    const cy = y + 5 + rng() * Math.max(1, h - 12);
    if (variant === 'inked-glaze') {
      ctx.fillStyle = i % 2 ? 'rgba(213,239,224,.45)' : 'rgba(198,231,227,.42)';
      ctx.beginPath(); ctx.moveTo(cx - cw * .55, cy + 1);
      ctx.quadraticCurveTo(cx - cw * .1, cy - 3.5, cx + cw * .34, cy - 1);
      ctx.quadraticCurveTo(cx + cw * .55, cy + 2.5, cx + cw * .27, cy + 3.3);
      ctx.quadraticCurveTo(cx - cw * .37, cy + 4.2, cx - cw * .55, cy + 1); ctx.fill();
      for (const [dx, dy, len] of [[-.34, 0, .31], [.12, 2, .37]] as const) {
        ctx.beginPath(); ctx.moveTo(cx + cw * dx, cy + dy);
        ctx.quadraticCurveTo(cx + cw * (dx + len * .45), cy + dy - 1.8, cx + cw * (dx + len), cy + dy - .4);
        stroke(ctx, 'rgba(240,250,233,.82)', 1.45);
      }
    } else if (variant === 'bubble-glacier' && (i !== 1 || w > 280)) {
      ctx.fillStyle = 'rgba(205,244,235,.29)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 1, cw * .48, Math.min(6, h * .32), -.12, 0, Math.PI * 2); ctx.fill();
      const rings = w < 80 ? 2 : 4;
      for (let b = 0; b < rings; b++) {
        const bx = cx - cw * .28 + b * cw * .17;
        const by = cy + (b % 2 ? 2.1 : -1.3);
        ctx.beginPath(); ctx.arc(bx, by, b % 3 === 0 ? 2 : 1.35, 0, Math.PI * 2);
        stroke(ctx, 'rgba(245,255,246,.88)', .95);
      }
    } else if (variant === 'chalk-frost') {
      ctx.fillStyle = 'rgba(205,229,216,.73)';
      for (let patch = 0; patch < 3; patch++) {
        ctx.beginPath();
        ctx.ellipse(cx - cw * .35 + patch * cw * .34, cy + (patch % 2) * 2,
          cw * (.21 + patch * .06), 2.5 + patch * .4, .08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(cx - cw * .46, cy + 4);
      ctx.quadraticCurveTo(cx - cw * .09, cy + 2, cx + cw * .22, cy + 4);
      stroke(ctx, 'rgba(236,251,231,.75)', 1.2);
    } else {
      ctx.beginPath(); ctx.moveTo(cx - 8, cy + 2);
      ctx.quadraticCurveTo(cx, cy - 2, cx + 7, cy + 1);
      stroke(ctx, 'rgba(228,249,238,.66)', 1.3);
    }
  }
  drawCartoonLip(ctx, x, y, w, p.snow, p.ink, p.seam, rng);
  ctx.fillStyle = 'rgba(37,71,90,.22)'; ctx.fillRect(x, bottom - 2, w, 2);
  ctx.beginPath(); ctx.moveTo(x, bottom - .7); ctx.lineTo(x + w, bottom - .7);
  stroke(ctx, p.ink, 1.7);
}

function drawIllustratedBack(ctx: Ctx2D, platform: Platform, variant: IllustratedVariant, isGround: boolean): void {
  const p = palettes[variant];
  const x = platform.x, w = platform.width, y = capFrontY(platform);
  const rng = mulberry32(seedFor(x, platform.y) ^ 0x51a7);
  ctx.save();
  if (platform.style === 'iceCube') {
    const top = platform.y + w * .15;
    const depth = w * .3;
    const height = platform.height - depth / 2;
    ctx.fillStyle = 'rgba(185,227,234,.25)';
    ctx.fillRect(x + 1, top + 1, w - 2, height - 2);
    ctx.fillStyle = 'rgba(242,250,245,.47)';
    ctx.beginPath(); ctx.moveTo(x + 1, top); ctx.lineTo(x + depth, top - depth);
    ctx.lineTo(x + w + depth - 1, top - depth); ctx.lineTo(x + w - 1, top);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(78,145,170,.34)';
    ctx.beginPath(); ctx.moveTo(x + w, top); ctx.lineTo(x + w + depth, top - depth);
    ctx.lineTo(x + w + depth, top + height - depth); ctx.lineTo(x + w, top + height);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(244,254,247,.24)';
    ctx.beginPath(); ctx.moveTo(x + 6, top + 8); ctx.lineTo(x + w * .43, top + 2);
    ctx.lineTo(x + w * .31, top + height * .68); ctx.lineTo(x + 9, top + height - 5);
    ctx.closePath(); ctx.fill();
    if (isCeramicFollowup(variant)) {
      ctx.fillStyle = 'rgba(234,253,240,.4)';
      ctx.beginPath(); ctx.ellipse(x + w * .22, top + height * .27, w * .2, 5.5, -.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 5, top + 3);
      ctx.quadraticCurveTo(x + 12, top + 1, x + 19, top + 3);
      stroke(ctx, 'rgba(249,255,248,.92)', 2);
    }
    ctx.beginPath(); ctx.moveTo(x + w * .58, top + height * .8);
    ctx.quadraticCurveTo(x + w * .76, top + height * .46, x + w * .91, top + height * .58);
    stroke(ctx, 'rgba(242,253,250,.8)', 1.9);
    for (const [bx, by, r] of [[.63, .3, 2], [.72, .41, 1.3], [.58, .47, 1.1]] as const) {
      ctx.beginPath(); ctx.ellipse(x + w * bx, top + height * by, r, r * .82, 0, 0, Math.PI * 2);
      stroke(ctx, 'rgba(232,253,248,.65)', .85);
    }
    strokeCube(ctx, platform, p.ink, 1.7);
    ctx.restore();
    return;
  }

  // Keep the 16px cap's center on the unchanged landing plane. The arena's
  // separate decoration layer still supplies its existing icicles.
  drawPlatformRightFace(ctx, platform, p.shade);
  if (isCeramicFollowup(variant) && !isGround) {
    ctx.fillStyle = 'rgba(214,241,229,.46)';
    ctx.beginPath(); ctx.moveTo(x + w + 1, y - 1);
    ctx.lineTo(x + w + skewPx() - 1, y - CAP_DEPTH + 3);
    ctx.quadraticCurveTo(x + w + skewPx() - 2, y - CAP_DEPTH + 8, x + w + 3, y + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(38,73,94,.25)';
    ctx.beginPath(); ctx.moveTo(x + w + 3, platform.y + platform.height - 6);
    ctx.lineTo(x + w + skewPx(), platform.y + platform.height - CAP_DEPTH - 5);
    ctx.lineTo(x + w + skewPx(), platform.y + platform.height - CAP_DEPTH);
    ctx.lineTo(x + w, platform.y + platform.height);
    ctx.closePath(); ctx.fill();
  }
  const front = wavyDown(x, w, y, rng, { bumps: Math.max(2, Math.round(w / 115)), ampMin: 1.5, ampMax: 3.5, valleyBase: .38 });
  const back = backWavyUp(x, w, capBackY(platform), skewPx(), rng, { bumps: Math.max(2, Math.round(w / 170)), ampMin: 1.5, ampMax: 3 });
  const left = leftWavy(capBackY(platform), y, x, rng, { bumps: 2, ampMin: 1.1, ampMax: 2.4 });
  drawPlatformCap(ctx, platform, front, back, {
    capColor: p.snow,
    capLight: 'rgba(255,255,248,.16)',
    drawCapTexture: (c, cF, cB, skew) => {
      const g = c.createLinearGradient(0, cB, 0, cF);
      g.addColorStop(0, 'rgba(105,132,157,.12)');
      g.addColorStop(.5, 'rgba(255,255,255,.02)');
      g.addColorStop(1, 'rgba(242,248,247,.31)');
      c.fillStyle = g; c.fillRect(x - 2, cB - 2, w + skew + 4, CAP_DEPTH + 4);
    },
  }, left);

  // Larger hand-painted masses, not confetti, give each shelf a snow identity.
  const n = isGround ? 3 : Math.max(1, Math.floor(w / 115));
  for (let i = 0; i < n; i++) {
    const cx = x + (i + .25 + rng() * .35) * w / n;
    const rw = Math.min(isGround ? 53 : 42, 13 + w / n * (.18 + rng() * .13));
    ctx.fillStyle = isCeramicFollowup(variant)
      ? (i % 2 ? 'rgba(255,255,252,.25)' : 'rgba(243,247,226,.27)')
      : (i % 2 ? 'rgba(255,255,255,.39)' : 'rgba(255,249,230,.32)');
    ctx.beginPath();
    ctx.ellipse(cx, platform.y - 1.5, rw, 3.3 + rng() * 1.6, -.05, 0, Math.PI * 2);
    ctx.fill();
  }
  if (variant === 'glacial-ceramic') {
    ctx.strokeStyle = 'rgba(96,149,168,.65)'; ctx.lineWidth = 1.1;
    for (let i = 0; i < Math.max(1, Math.floor(w / 160)); i++) {
      const px = x + 10 + (i + .3) * (w - 20) / Math.max(1, Math.floor(w / 160));
      ctx.beginPath(); ctx.moveTo(px, platform.y - 3);
      ctx.quadraticCurveTo(px + 8, platform.y - 5, px + 15, platform.y - 3); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.moveTo(front[0].x, front[0].y);
  for (const point of front.slice(1)) ctx.lineTo(point.x, point.y);
  stroke(ctx, p.ink, isCeramicFollowup(variant) ? 2 : 1.8);
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + skewPx(), y - CAP_DEPTH);
  stroke(ctx, p.ink, isCeramicFollowup(variant) ? 1.9 : 1.6);

  ctx.restore();
}

function drawSnowLip(ctx: Ctx2D, x: number, y: number, w: number, p: typeof palettes[IllustratedVariant], rng: () => number, deep: boolean): void {
  const step = deep ? 42 : 58;
  ctx.fillStyle = p.snow;
  ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + w, y - 1);
  let right = x + w;
  while (right > x) {
    const left = Math.max(x, right - step * (.72 + rng() * .65));
    const droop = (deep ? 5.6 : 2.7) * (.5 + rng() * .75);
    ctx.bezierCurveTo(right - (right - left) * .12, y + droop * .7,
      left + (right - left) * .55, y + droop * 1.25, left, y + droop * .45);
    right = left;
  }
  ctx.closePath(); ctx.fill();
  stroke(ctx, p.ink, 1.45);
  ctx.beginPath(); ctx.moveTo(x + 2, y + 4);
  ctx.bezierCurveTo(x + w * .3, y + 6, x + w * .55, y + 2, x + w - 2, y + 4);
  stroke(ctx, p.seam, 1.2);
}

function drawIllustratedFront(ctx: Ctx2D, platform: Platform, variant: IllustratedVariant, isGround: boolean): void {
  if (platform.style === 'iceCube') return;
  const p = palettes[variant];
  const x = platform.x, y = capFrontY(platform), w = platform.width;
  const bottom = platform.y + platform.height;
  const h = bottom - y;
  const rng = mulberry32(seedFor(x, platform.y) ^ 0x949d);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  if (isGround) {
    if (isCeramicFollowup(variant)) {
      drawCartoonGround(ctx, x, y, w, bottom, variant);
      ctx.restore();
      return;
    }
    const ground = ctx.createLinearGradient(0, y, 0, bottom);
    ground.addColorStop(0, '#9db5c3');
    ground.addColorStop(.5, '#90aabb');
    ground.addColorStop(1, '#708da0');
    ctx.fillStyle = ground; ctx.fillRect(x, y, w, h);
    // Broad blank spans matter more than evenly tiled texture on the 1280px rim.
    for (const [start, span] of [[.06, .052], [.31, .071], [.59, .043], [.83, .064]] as const) {
      const px = x + w * start;
      const pw = w * span;
      const py = y + 10 + rng() * Math.max(3, h * .34);
      ctx.fillStyle = 'rgba(225,239,238,.15)';
      ctx.beginPath(); ctx.moveTo(px, py + 3);
      ctx.quadraticCurveTo(px + pw * .35, py - 2, px + pw, py + 1);
      ctx.quadraticCurveTo(px + pw * .58, py + 8, px, py + 3);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(px + 4, py + 2);
      ctx.quadraticCurveTo(px + pw * .53, py - 2, px + pw - 3, py + 1);
      stroke(ctx, 'rgba(235,245,241,.37)', 1.3);
    }
    ctx.beginPath(); ctx.moveTo(x, y + 1);
    for (let px = x + 72; px < x + w; px += 72) {
      ctx.quadraticCurveTo(px - 24, y + 2.5 + rng() * 2, Math.min(px, x + w), y + 1 + rng() * 2);
    }
    stroke(ctx, p.ink, 1.4);
    ctx.restore();
    return;
  }

  // Paint the full front in the foreground-cover pass so a rising player remains
  // hidden by the same platform body as in production.
  if (isCeramicFollowup(variant)) {
    drawCartoonFront(ctx, x, y, w, bottom, variant, rng);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + skewPx(), y - CAP_DEPTH);
    ctx.lineTo(x + w + skewPx(), bottom - CAP_DEPTH); ctx.lineTo(x + w, bottom);
    stroke(ctx, p.ink, 1.9);
    return;
  }
  const g = ctx.createLinearGradient(0, y, 0, bottom);
  g.addColorStop(0, variant === 'glacial-ceramic' ? '#a3d0d5' : p.ice);
  g.addColorStop(.54, p.ice);
  g.addColorStop(1, p.shade);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);

  if (variant === 'snow-pillow') {
    const n = Math.max(1, Math.floor(w / 95));
    for (let i = 0; i < n; i++) {
      const px = x + (i + .25 + rng() * .18) * w / n;
      const pw = Math.min(57, w / n * .5);
      ctx.fillStyle = i % 2 ? 'rgba(227,242,237,.23)' : 'rgba(51,104,130,.16)';
      ctx.beginPath(); ctx.moveTo(px, y + 8);
      ctx.quadraticCurveTo(px + pw * .4, y + 5, px + pw, y + 9);
      ctx.quadraticCurveTo(px + pw * .65, bottom - 2, px + 3, bottom - 2);
      ctx.closePath(); ctx.fill();
    }
    drawSnowLip(ctx, x, y, w, p, rng, true);
  } else if (variant === 'glacial-ceramic') {
    const n = Math.max(1, Math.floor(w / 94));
    for (let i = 0; i < n; i++) {
      const px = x + (i + .1) * w / n;
      const pw = Math.min(80, w / n * (.62 + rng() * .2));
      ctx.fillStyle = i % 2 ? 'rgba(220,248,244,.21)' : 'rgba(36,95,125,.19)';
      ctx.beginPath(); ctx.moveTo(px + 3, y + 2);
      ctx.lineTo(px + pw, y + 5); ctx.lineTo(px + pw * .75, bottom - 2);
      ctx.quadraticCurveTo(px + pw * .3, bottom - 5, px, bottom - 1);
      ctx.closePath(); ctx.fill();
    }
    // One long polished slash reads as ice at match size.
    if (w > 90) {
      ctx.beginPath(); ctx.moveTo(x + w * .18, bottom - 4);
      ctx.quadraticCurveTo(x + w * .48, y + 6, x + w * .76, y + 7);
      stroke(ctx, 'rgba(229,250,246,.51)', 2.4);
    }
    drawSnowLip(ctx, x, y, w, p, rng, false);
  } else {
    // Compressed snow changes layer across the shelf rather than drawing
    // perfectly parallel stripes from edge to edge.
    ctx.fillStyle = p.seam;
    ctx.beginPath(); ctx.moveTo(x, y + 5);
    ctx.bezierCurveTo(x + w * .25, y + 8, x + w * .51, y + 3, x + w * .7, y + 6);
    ctx.quadraticCurveTo(x + w * .9, y + 8, x + w, y + 5);
    ctx.lineTo(x + w, Math.min(bottom, y + h * .72));
    ctx.quadraticCurveTo(x + w * .66, y + h * .53, x + w * .42, y + h * .68);
    ctx.quadraticCurveTo(x + w * .2, y + h * .76, x, y + h * .6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * .12, y + h * .75);
    ctx.bezierCurveTo(x + w * .3, y + h * .59, x + w * .48, y + h * .78, x + w * .62, y + h * .67);
    stroke(ctx, 'rgba(237,241,239,.57)', 1.5);
    drawSnowLip(ctx, x, y, w, p, rng, true);
  }

  // Soft irregular underside and a few deliberately grouped indentations.
  ctx.fillStyle = 'rgba(36,68,90,.25)'; ctx.fillRect(x, bottom - 2, w, 2);
  ctx.beginPath(); ctx.moveTo(x, bottom - .7); ctx.lineTo(x + w, bottom - .7);
  stroke(ctx, p.ink, 1.3);
  for (let i = 0; i < Math.min(3, Math.floor(w / 105)); i++) {
    const px = x + (i + .35) * w / Math.min(3, Math.floor(w / 105));
    ctx.beginPath(); ctx.moveTo(px, y + Math.min(10, h * .55));
    ctx.quadraticCurveTo(px + 5, y + Math.min(8, h * .45), px + 11, y + Math.min(9, h * .52));
    stroke(ctx, 'rgba(237,245,241,.51)', 1.2);
  }
  ctx.restore();

  ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + skewPx(), y - CAP_DEPTH);
  ctx.lineTo(x + w + skewPx(), bottom - CAP_DEPTH); ctx.lineTo(x + w, bottom);
  stroke(ctx, p.ink, 1.45);
}

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
export function drawPlatformStudyBack(ctx: Ctx2D, platform: Platform, variant: PlatformVariant, isGround = false): void {
  if (isIllustratedStudy(variant)) {
    drawIllustratedBack(ctx, platform, variant as IllustratedVariant, isGround);
    return;
  }
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
export function drawPlatformStudyFront(ctx: Ctx2D, platform: Platform, variant: PlatformVariant, isGround = false): void {
  if (isIllustratedStudy(variant)) {
    drawIllustratedFront(ctx, platform, variant as IllustratedVariant, isGround);
    return;
  }
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
