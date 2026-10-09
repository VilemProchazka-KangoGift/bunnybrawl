import type { ThemeConfig, GradientStop } from '../../../src/engine/themes/types';

export const ATMOSPHERE_VARIANTS = ['amber-frost', 'glacier-teal', 'violet-dusk'] as const;
export type AtmosphereVariant = typeof ATMOSPHERE_VARIANTS[number];

interface Grade {
  sky: GradientStop[];
  backdropFilter: string;
  sceneryFilter: string;
  wash: string;
  cloud: string;
  fog: string;
}

const GRADES: Record<AtmosphereVariant, Grade> = {
  'amber-frost': {
    sky: [
      { offset: 0, color: '#756779' }, { offset: .43, color: '#b4a0aa' },
      { offset: .78, color: '#e7d1c2' }, { offset: 1, color: '#f1e7d8' },
    ],
    backdropFilter: 'sepia(.3) saturate(1.13) hue-rotate(-12deg)',
    sceneryFilter: 'sepia(.13) hue-rotate(-9deg) saturate(1.02)',
    wash: 'rgba(246,177,111,.14)',
    cloud: 'rgba(250,222,203,.54)',
    fog: '#e4cfbd',
  },
  'glacier-teal': {
    sky: [
      { offset: 0, color: '#245669' }, { offset: .43, color: '#73a9af' },
      { offset: .78, color: '#bbd7d2' }, { offset: 1, color: '#e2efea' },
    ],
    backdropFilter: 'hue-rotate(-28deg) saturate(1.22)',
    sceneryFilter: 'hue-rotate(-14deg) saturate(1.1)',
    wash: 'rgba(53,171,171,.12)',
    cloud: 'rgba(206,244,237,.52)',
    fog: '#addbdb',
  },
  'violet-dusk': {
    sky: [
      { offset: 0, color: '#66577f' }, { offset: .43, color: '#a399bb' },
      { offset: .78, color: '#d5c8dc' }, { offset: 1, color: '#eee4ec' },
    ],
    backdropFilter: 'hue-rotate(23deg) saturate(1.17)',
    sceneryFilter: 'hue-rotate(11deg) saturate(1.07)',
    wash: 'rgba(187,130,204,.14)',
    cloud: 'rgba(235,219,247,.54)',
    fog: '#d5c7e3',
  },
};

const CLOUD_LAYOUT = [
  { x: 90, y: 105, size: 68, speed: 5 },
  { x: 393, y: 135, size: 59, speed: 6 },
  { x: 725, y: 91, size: 74, speed: 4 },
  { x: 1065, y: 124, size: 63, speed: 5 },
];

export function applyAtmosphereVariant(theme: ThemeConfig, variant: AtmosphereVariant): void {
  const grade = GRADES[variant];
  theme.sky = { gradient: grade.sky };
  theme.clouds = {
    ...theme.clouds,
    count: CLOUD_LAYOUT.length,
    initialClouds: CLOUD_LAYOUT,
    color: grade.cloud,
  };
  if (theme.fog) theme.fog = { ...theme.fog, color: grade.fog };

  // Grade cached scenery while preserving the original broad animated aurora.
  // Characters, collectibles, and hazards keep their unfiltered colors and ink.
  const drawFarBackground = theme.drawFarBackground;
  if (drawFarBackground) {
    theme.drawFarBackground = (ctx, arena) => {
      ctx.save();
      ctx.filter = grade.backdropFilter;
      drawFarBackground(ctx, arena);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = grade.wash;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    };
  }

  const drawPlatform = theme.drawPlatform;
  theme.drawPlatform = (ctx, platform, isGround) => {
    ctx.save(); ctx.filter = grade.sceneryFilter;
    drawPlatform(ctx, platform, isGround);
    ctx.restore();
  };
  const drawPlatformOverlay = theme.drawPlatformOverlay;
  if (drawPlatformOverlay) {
    theme.drawPlatformOverlay = (ctx, platform, isGround) => {
      ctx.save(); ctx.filter = grade.sceneryFilter;
      drawPlatformOverlay(ctx, platform, isGround);
      ctx.restore();
    };
  }
  const drawBackgroundNature = theme.drawBackgroundNature;
  theme.drawBackgroundNature = (ctx, arena) => {
    ctx.save(); ctx.filter = grade.sceneryFilter;
    drawBackgroundNature(ctx, arena);
    ctx.restore();
  };
  const drawForegroundNature = theme.drawForegroundNature;
  theme.drawForegroundNature = (ctx, arena) => {
    ctx.save(); ctx.filter = grade.sceneryFilter;
    drawForegroundNature(ctx, arena);
    ctx.restore();
  };
}
