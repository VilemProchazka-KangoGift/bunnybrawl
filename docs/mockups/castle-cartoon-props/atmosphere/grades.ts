import type { Ctx2D } from '../../../../src/engine/types';

export const CASTLE_GRADES = ['atmo-silver', 'atmo-violet', 'atmo-ember', 'atmo-silver-balanced', 'atmo-silver-deep', 'atmo-silver-pewter'] as const;
export type CastleGrade = typeof CASTLE_GRADES[number];

export function castlePropFilter(variant: CastleGrade): string | null {
  if (variant === 'atmo-silver-balanced') return 'saturate(.45) brightness(1.12) contrast(1.03)';
  if (variant === 'atmo-silver-deep') return 'saturate(.56) brightness(1.06) contrast(1.07)';
  if (variant === 'atmo-silver-pewter') return 'grayscale(.78) brightness(1.12) contrast(1.05)';
  return null;
}

function pool(ctx: Ctx2D, x: number, y: number, radius: number, inner: string) {
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 1;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function palette(ctx: Ctx2D, variant: CastleGrade) {
  const image = ctx.getImageData(0, 0, 1280, 720);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (variant === 'atmo-silver') {
      pixels[i] = r * .79 + 39;
      pixels[i + 1] = g * .87 + 47;
      pixels[i + 2] = b * .86 + 52;
    } else if (variant === 'atmo-silver-balanced') {
      pixels[i] = r * .9 + 16;
      pixels[i + 1] = g * .94 + 20;
      pixels[i + 2] = b * .93 + 23;
    } else if (variant === 'atmo-silver-deep') {
      pixels[i] = r * .82 + 16;
      pixels[i + 1] = g * .88 + 20;
      pixels[i + 2] = b * .94 + 28;
    } else if (variant === 'atmo-silver-pewter') {
      const luminance = r * .27 + g * .62 + b * .11;
      pixels[i] = luminance * .86 + 18;
      pixels[i + 1] = luminance * .89 + 23;
      pixels[i + 2] = luminance * .95 + 30;
    } else if (variant === 'atmo-violet') {
      pixels[i] = r * .86 + 22;
      pixels[i + 1] = g * .68 + 5;
      pixels[i + 2] = b * .95 + 33;
    } else {
      pixels[i] = r * 1.02 + 24;
      pixels[i + 1] = g * .84 + 12;
      pixels[i + 2] = b * .62 + 5;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Mockup-only static backdrop palette. Foreground props are graded at their draw calls. */
export function applyCastleGrade(ctx: Ctx2D, variant: CastleGrade) {
  ctx.save();
  palette(ctx, variant);
  if (variant === 'atmo-silver') {
    // High-key frost silver: pale walls and broad, diffuse moon reflection.
    pool(ctx, 638, 174, 390, 'rgba(188,214,231,.32)');
    pool(ctx, 630, 590, 360, 'rgba(136,171,202,.18)');
  } else if (variant === 'atmo-silver-balanced') {
    pool(ctx, 638, 174, 330, 'rgba(173,202,224,.16)');
    pool(ctx, 630, 590, 290, 'rgba(135,170,199,.1)');
  } else if (variant === 'atmo-silver-deep') {
    pool(ctx, 638, 174, 300, 'rgba(164,198,229,.22)');
    pool(ctx, 630, 590, 240, 'rgba(116,155,196,.09)');
  } else if (variant === 'atmo-silver-pewter') {
    pool(ctx, 638, 174, 335, 'rgba(192,212,221,.22)');
    pool(ctx, 630, 590, 265, 'rgba(145,174,192,.1)');
  } else if (variant === 'atmo-violet') {
    // Lavender wall shadows, with the moon retaining a cool blue centre.
    pool(ctx, 634, 218, 380, 'rgba(177,122,225,.32)');
    pool(ctx, 629, 114, 240, 'rgba(187,204,239,.26)');
  } else {
    // Warm candle-lit stone contrasted with the original blue props.
    for (const x of [98, 400, 880, 1080]) {
      pool(ctx, x, 570, 230, 'rgba(255,158,65,.45)');
    }
    pool(ctx, 636, 181, 330, 'rgba(118,159,213,.22)');
  }
  ctx.restore();
}
