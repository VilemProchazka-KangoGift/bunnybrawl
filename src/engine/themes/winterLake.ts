import type { ThemeConfig } from './types';
import {
  drawPineTree, drawChristmasTree, drawSnowDrift, drawIcePatch, drawIcicle,
  drawBigSnowman, drawIgloo, drawSnowman, drawSnowball, drawSnowballPyramid,
  drawFgBush,
} from './drawPrimitives';

// Platform colors — shared between config fields and customDraw
const FLOAT_BODY = '#5A7A8C';
const FLOAT_TOP = '#D8E8F0';
const GROUND_BODY = '#4A6A7C';
const GROUND_TOP = '#E0EEF5';

export const WINTER_LAKE_THEME: ThemeConfig = {
  id: 'winter_lake',
  nameKey: 'arena_winter_lake',
  previewGradient: 'linear-gradient(to bottom, #2C3E6B 0%, #8FA8C8 60%, #D8E8F0 100%)',

  sky: {
    gradient: [
      { offset: 0, color: '#2C3E6B' },
      { offset: 0.35, color: '#5B7BA5' },
      { offset: 0.7, color: '#8FA8C8' },
      { offset: 1, color: '#B8C8DC' },
    ],
  },

  hills: [
    { x: 0, baseY: 620, width: 350, height: 100, color: '#D8E8F0' },
    { x: 300, baseY: 630, width: 450, height: 80, color: '#C8D8E8' },
    { x: 700, baseY: 615, width: 380, height: 110, color: '#D0E0EA' },
    { x: 1000, baseY: 630, width: 350, height: 90, color: '#C4D4E4' },
  ],

  ground: {
    surfaceColor: '#E8F0F8',
    surfaceThickness: 5,
    // No grass blades in winter
  },

  platform: {
    floatingBodyColor: FLOAT_BODY,
    floatingTopColor: FLOAT_TOP,
    floatingAccentColor: undefined,
    groundBodyColor: GROUND_BODY,
    groundTopColor: GROUND_TOP,
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        ctx.fillStyle = GROUND_BODY;
        ctx.fillRect(x, y + 5, w, h - 5);
        ctx.fillStyle = GROUND_TOP;
        ctx.fillRect(x, y, w, 8);
        ctx.fillStyle = '#8AAABA';
        for (let dx = 15; dx < w; dx += 35 + Math.random() * 25) {
          ctx.fillRect(x + dx, y + 18 + Math.random() * 15, 3, 3);
        }
      } else {
        ctx.fillStyle = FLOAT_BODY;
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = FLOAT_TOP;
        ctx.fillRect(x, y, w, 6);
        ctx.fillStyle = 'rgba(200, 225, 245, 0.4)';
        ctx.fillRect(x, y, w, 2);
        drawIcicle(ctx, x + 4, y + h, 8 + Math.random() * 5);
        drawIcicle(ctx, x + w - 4, y + h, 7 + Math.random() * 6);
        if (w > 160) {
          drawIcicle(ctx, x + w / 2, y + h, 10 + Math.random() * 4);
        }
      }
    },
  },

  clouds: {
    count: 4,
    color: 'rgba(200, 215, 230, 0.5)',
    minSize: 50,
    maxSize: 80,
    minSpeed: 4,
    maxSpeed: 8,
    yRange: [35, 100],
  },

  weather: {
    particleCount: 50,
    types: [
      { type: 'snow', weight: 1, sizeRange: [2, 5], vxRange: [-15, 15], vyRange: [30, 80], rotSpeedRange: [-1, 1] },
    ],
  },

  wildlife: {
    count: 2,
    types: [
      { type: 'bird', weight: 1, colors: ['#4A4A4A', '#5C5C5C', '#6A6A6A'], speedRange: [25, 45], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 25,
    baseY: 655,
    yVariance: 15,
    speedRange: [3, 8],
    alphaRange: [0.15, 0.35],
    color: '#CCE0FF',
    sizeX: 50,
    sizeY: 10,
  },

  ambientParticles: {
    count: 8,
    sizeRange: [1, 2],
    vxRange: [-5, 5],
    vyRange: [5, 15],
    alphaRange: [0.2, 0.5],
    colors: ['#E8F0FF', '#FFFFFF'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: 120,
    maxNightAlpha: 0.6,
    showFireflies: false,
    showShootingStars: true,
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    const floats = arena.platforms.filter(p => p.y < 650);

    // === LANDMARKS (background) ===
    drawBigSnowman(ctx, 55, y, 90);
    drawIgloo(ctx, 1080, y, 180, 100);

    // === GROUND TREES — big to small, mix of pine and christmas ===
    // Large pines (80-90px)
    drawPineTree(ctx, 180, y, 85, true);
    drawPineTree(ctx, 620, y, 80, true);
    drawPineTree(ctx, 1200, y, 82, true);
    // Medium pines (50-65px)
    drawPineTree(ctx, 330, y, 55, true);
    drawPineTree(ctx, 500, y, 50, true);
    drawPineTree(ctx, 770, y, 60, true);
    drawPineTree(ctx, 900, y, 48, true);
    // Small pines (25-38px)
    drawPineTree(ctx, 130, y, 28, true);
    drawPineTree(ctx, 450, y, 32, true);
    drawPineTree(ctx, 710, y, 25, true);
    drawPineTree(ctx, 1040, y, 35, true);
    // Christmas trees — various sizes
    drawChristmasTree(ctx, 260, y, 65);
    drawChristmasTree(ctx, 560, y, 50);
    drawChristmasTree(ctx, 850, y, 55);
    drawChristmasTree(ctx, 1150, y, 42);

    // === PLATFORM TREES — smaller, sitting on floating platforms ===
    for (const plat of floats) {
      const mid = plat.x + plat.width / 2;
      if (plat.width >= 200) {
        // Wide platforms get a tree on each side + decorations
        drawPineTree(ctx, plat.x + 25, plat.y, 30, true);
        drawChristmasTree(ctx, plat.x + plat.width - 25, plat.y, 28);
        drawSnowball(ctx, mid, plat.y, 5);
      } else if (plat.width >= 140) {
        // Medium platforms get one tree
        drawPineTree(ctx, mid + 20, plat.y, 25, true);
        drawSnowDrift(ctx, plat.x + 20, plat.y, 25, 3);
      } else {
        // Small platforms get a snow drift or snowball
        drawSnowball(ctx, mid, plat.y, 4);
      }
    }

    // === SMALL SNOWMEN ===
    drawSnowman(ctx, 380, y, 26);
    drawSnowman(ctx, 680, y, 20);
    drawSnowman(ctx, 960, y, 24);

    // === SNOWBALLS & PYRAMIDS ===
    drawSnowballPyramid(ctx, 430, y, 8);
    drawSnowballPyramid(ctx, 820, y, 7);
    drawSnowball(ctx, 290, y, 10);
    drawSnowball(ctx, 550, y, 7);
    drawSnowball(ctx, 750, y, 12);
    drawSnowball(ctx, 1100, y, 8);

    // === FROZEN LAKE ===
    drawIcePatch(ctx, 480, y, 320);

    // === SNOW DRIFTS ===
    drawSnowDrift(ctx, 200, y, 60, 8);
    drawSnowDrift(ctx, 640, y, 50, 7);
    drawSnowDrift(ctx, 1000, y, 65, 9);

    // === ICICLES under wide bridge ===
    const bridge = floats.find(p => p.width >= 350);
    if (bridge) {
      for (let i = 0; i < 6; i++) {
        drawIcicle(ctx, bridge.x + 30 + i * 60, bridge.y + bridge.height, 8 + Math.random() * 7);
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    const snowBushColors = {
      backLayer: '#2A4A2A',
      mainBody: '#3A5A3A',
      leftLobe: '#345A34',
      rightLobe: '#305830',
      highlight: '#4A6A4A',
      highlight2: '#4A6A4A',
      berries: ['#CC3333', '#DD4444', '#BB2222'],
    };
    drawFgBush(ctx, 120, gy, 34, snowBushColors);
    drawFgBush(ctx, 580, gy, 38, snowBushColors);
    drawFgBush(ctx, 940, gy, 30, snowBushColors);

    drawSnowDrift(ctx, 15, gy, 45, 6);
    drawSnowDrift(ctx, 1250, gy, 40, 5);
  },

  physics: {
    friction: 0.15,
  },
};
