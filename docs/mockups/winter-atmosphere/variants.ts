import type { Ctx2D } from '../../../src/engine/types';
import type { ThemeConfig } from '../../../src/engine/themes/types';
import { computeNightIntensity } from '../../../src/engine/rendering';

export const ATMOSPHERE_VARIANTS = ['clear-ice', 'silver-drift', 'polar-veil'] as const;
export type AtmosphereVariant = typeof ATMOSPHERE_VARIANTS[number];

const TAU = Math.PI * 2;

const CLOUDS = {
  'clear-ice': [
    { x: 165, y: 105, size: 93, height: 23, speed: 4 },
    { x: 930, y: 118, size: 112, height: 25, speed: 5 },
  ],
  'silver-drift': [
    { x: 95, y: 96, size: 194, height: 33, speed: 6 },
    { x: 410, y: 135, size: 136, height: 26, speed: 5 },
    { x: 863, y: 93, size: 216, height: 35, speed: 6 },
    { x: 1120, y: 151, size: 121, height: 23, speed: 4 },
  ],
  'polar-veil': [
    { x: 218, y: 115, size: 142, height: 23, speed: 5 },
    { x: 750, y: 96, size: 178, height: 26, speed: 4 },
    { x: 1105, y: 137, size: 128, height: 20, speed: 6 },
  ],
} as const;

function cloud(ctx: Ctx2D, x: number, y: number, width: number, height: number,
  variant: AtmosphereVariant): void {
  ctx.save();
  const thin = variant === 'polar-veil';
  const broad = variant === 'silver-drift';
  ctx.globalAlpha = thin ? .28 : broad ? .37 : .31;
  ctx.fillStyle = '#7e9fb2';
  ctx.beginPath();
  ctx.ellipse(x + width * .52, y + height * .69, width * .49, height * .32, -.025, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = thin ? .46 : broad ? .62 : .57;
  ctx.fillStyle = '#f0f5f2';
  ctx.beginPath();
  ctx.moveTo(x, y + height * .66);
  ctx.bezierCurveTo(x + width * .12, y + height * .5, x + width * .2, y + height * .58, x + width * .27, y + height * .4);
  ctx.bezierCurveTo(x + width * .33, y - height * .08, x + width * .46, y + height * .18, x + width * .5, y + height * .32);
  ctx.bezierCurveTo(x + width * .6, y - height * .06, x + width * .73, y + height * .19, x + width * .78, y + height * .5);
  ctx.bezierCurveTo(x + width * .93, y + height * .43, x + width, y + height * .6, x + width, y + height * .7);
  ctx.bezierCurveTo(x + width * .79, y + height * .83, x + width * .25, y + height * .85, x, y + height * .66);
  ctx.fill();
  if (broad) {
    ctx.globalAlpha = .18;
    ctx.strokeStyle = '#e7f4f4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + width * .13, y + height * 1.04);
    ctx.quadraticCurveTo(x + width * .55, y + height * .93, x + width * .85, y + height * .99);
    ctx.stroke();
  }
  ctx.restore();
}

function ribbon(ctx: Ctx2D, y: number, depth: number, color: string, alpha: number,
  time: number, drift: number): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(-40, y);
  for (let x = -40; x <= 1320; x += 80) {
    const bend = Math.sin(x * .006 + time * drift) * 11 + Math.sin(x * .0026 - time * .12) * 16;
    ctx.lineTo(x, y + bend);
  }
  for (let x = 1320; x >= -40; x -= 80) {
    const bend = Math.sin(x * .006 + time * drift + .3) * 11 + Math.sin(x * .0026 - time * .12) * 16;
    ctx.lineTo(x, y + depth + bend);
  }
  ctx.closePath();
  ctx.fill();
}

function glints(ctx: Ctx2D, count: number, alpha: number, time: number): void {
  ctx.strokeStyle = '#e4f6f7';
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = 118 + (i * 173) % 1070;
    const y = [356, 437, 498, 657][i % 4];
    if (Math.sin(time * 1.5 + i * 1.8) < .38) continue;
    const r = 1.4 + i % 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r * .7); ctx.lineTo(x, y + r * .7);
    ctx.stroke();
  }
}

export function applyAtmosphereVariant(theme: ThemeConfig, variant: AtmosphereVariant): void {
  theme.clouds = {
    ...theme.clouds,
    count: CLOUDS[variant].length,
    initialClouds: CLOUDS[variant],
    draw: (ctx, x, y, width, height) => cloud(ctx, x, y, width, height, variant),
  };

  theme.fog = variant === 'silver-drift'
    ? { ...theme.fog!, count: 20, color: '#cddce1', opacity: .29, sizeX: 77, sizeY: 11 }
    : variant === 'polar-veil'
      ? { ...theme.fog!, count: 13, color: '#c7dae1', opacity: .21, sizeX: 68, sizeY: 8 }
      : { ...theme.fog!, count: 8, color: '#d9e9ef', opacity: .17, sizeX: 51, sizeY: 7 };

  // All night treatment stays behind the playfield. Foreground characters and
  // hazards retain their normal night tint and outline contrast.
  theme.drawAnimatedBackground = (ctx, _arena, time, dayPhase) => {
    const night = computeNightIntensity(dayPhase);
    if (night < .05) return;
    ctx.save();
    if (variant === 'silver-drift') {
      ribbon(ctx, 92, 30, '#d6e6e9', .16 * night, time, .23);
      ribbon(ctx, 153, 24, '#b3d1da', .11 * night, time, .19);
      glints(ctx, 7, .28 * night, time);
    } else if (variant === 'polar-veil') {
      ribbon(ctx, 71, 19, '#90d7c4', .31 * night, time, .28);
      ribbon(ctx, 129, 15, '#b9b3d9', .2 * night, time, .21);
      glints(ctx, 10, .38 * night, time);
    } else {
      glints(ctx, 5, .46 * night, time);
    }
    ctx.restore();
  };
  // The existing green wash was tuned for the earlier broad aurora. Study a
  // neutral foreground under the lighter candidate sky effects.
  theme.drawSceneTint = undefined;
}
