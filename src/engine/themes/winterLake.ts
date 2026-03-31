import type { ThemeConfig } from './types';
import {
  drawPineTree, drawChristmasTree, drawSnowDrift, drawIcePatch, drawIcicle,
  drawBigSnowman, drawIgloo, drawSnowman,
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

    // Big snowman — background decoration (far left)
    drawBigSnowman(ctx, 80, y, 100);

    // Igloo — background decoration (far right)
    drawIgloo(ctx, 1050, y, 200, 110);

    // Small decorative snowmen scattered on ground
    drawSnowman(ctx, 350, y, 28);
    drawSnowman(ctx, 750, y, 22);
    drawSnowman(ctx, 1000, y, 25);

    // Pine trees — many, various sizes
    drawPineTree(ctx, 20, y, 60, true);
    drawPineTree(ctx, 160, y, 35, true);
    drawPineTree(ctx, 300, y, 48, true);
    drawPineTree(ctx, 500, y, 30, true);
    drawPineTree(ctx, 670, y, 55, true);
    drawPineTree(ctx, 850, y, 32, true);
    drawPineTree(ctx, 1180, y, 45, true);

    // Christmas trees — decorated with ornaments and star
    drawChristmasTree(ctx, 420, y, 52);
    drawChristmasTree(ctx, 790, y, 44);
    drawChristmasTree(ctx, 1240, y, 38);

    // Frozen lake in center
    drawIcePatch(ctx, 480, y, 320);

    // Snow drifts
    drawSnowDrift(ctx, 240, y, 65, 9);
    drawSnowDrift(ctx, 580, y, 55, 7);
    drawSnowDrift(ctx, 900, y, 70, 10);
    drawSnowDrift(ctx, 1120, y, 50, 7);

    // Icicles under the wide center bridge
    const bridge = arena.platforms.find(p => p.width >= 350 && p.y < 550);
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
    drawFgBush(ctx, 130, gy, 32, snowBushColors);
    drawFgBush(ctx, 620, gy, 36, snowBushColors);
    drawFgBush(ctx, 950, gy, 30, snowBushColors);

    // Snow piles at ground edges
    drawSnowDrift(ctx, 15, gy, 45, 6);
    drawSnowDrift(ctx, 1250, gy, 40, 5);
  },

  physics: {
    friction: 0.15,
  },
};
