import type { ThemeConfig } from './types';
import {
  drawPineTree, drawChristmasTree, drawSnowDrift, drawIcePatch, drawIcicle,
  drawBigSnowman, drawIgloo, drawSnowman, drawSnowball,
  drawSnowballPyramid, drawLargeSnowballPyramid,
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

    // === LANDMARKS (background, edges) ===
    drawBigSnowman(ctx, 55, y, 90);
    drawIgloo(ctx, 1080, y, 180, 100);

    // === GROUND TREES — fewer, spaced out ===
    drawPineTree(ctx, 180, y, 80, true);
    drawChristmasTree(ctx, 400, y, 58);
    drawPineTree(ctx, 640, y, 75, true);
    drawPineTree(ctx, 900, y, 50, true);
    drawChristmasTree(ctx, 1200, y, 45);

    // === GROUND ACCENTS — just a few ===
    drawSnowman(ctx, 320, y, 22);
    drawSnowman(ctx, 780, y, 18);
    drawIcePatch(ctx, 480, y, 280);
    drawSnowDrift(ctx, 550, y, 55, 7);
    drawSnowDrift(ctx, 1000, y, 50, 6);

    // === PLATFORM DECORATIONS — rich variety per platform ===
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (plat.width >= 350) {
        // Very wide — full scene with trees, snowman, snowballs, pyramid
        drawPineTree(ctx, plat.x + 30, plat.y, 48, true);
        drawChristmasTree(ctx, plat.x + plat.width * 0.35, plat.y, 40);
        drawPineTree(ctx, plat.x + plat.width - 30, plat.y, 44, true);
        drawSnowman(ctx, plat.x + plat.width * 0.6, plat.y, 15);
        drawSnowballPyramid(ctx, plat.x + plat.width * 0.8, plat.y, 5);
        drawSnowball(ctx, plat.x + 70, plat.y, 4);
        drawSnowDrift(ctx, plat.x + plat.width * 0.45, plat.y, 25, 3);
        drawIcicle(ctx, plat.x + 50, plat.y + plat.height, 10);
        drawIcicle(ctx, plat.x + plat.width - 50, plat.y + plat.height, 12);
      } else if (plat.width >= 200) {
        // Wide — trees + mixed decorations
        drawPineTree(ctx, plat.x + 22, plat.y, 40, true);
        drawChristmasTree(ctx, plat.x + plat.width - 25, plat.y, 34);
        if (i % 2 === 0) {
          drawSnowman(ctx, mid, plat.y, 13);
          drawSnowball(ctx, mid + 30, plat.y, 4);
        } else {
          drawSnowballPyramid(ctx, mid + 10, plat.y, 4);
          drawSnowball(ctx, mid - 25, plat.y, 5);
        }
        drawSnowDrift(ctx, plat.x + 12, plat.y, 20, 3);
        drawIcicle(ctx, mid, plat.y + plat.height, 9);
      } else if (plat.width >= 140) {
        // Medium — tree + decoration
        if (i % 3 === 0) {
          drawChristmasTree(ctx, mid - 12, plat.y, 30);
          drawSnowball(ctx, mid + 22, plat.y, 4);
        } else if (i % 3 === 1) {
          drawPineTree(ctx, mid - 12, plat.y, 34, true);
          drawSnowman(ctx, mid + 28, plat.y, 11);
        } else {
          drawPineTree(ctx, mid + 10, plat.y, 32, true);
          drawSnowballPyramid(ctx, mid - 20, plat.y, 3);
        }
        drawSnowDrift(ctx, plat.x + 10, plat.y, 18, 2);
      } else {
        // Small — one item + accent
        if (i % 3 === 0) {
          drawPineTree(ctx, mid, plat.y, 20, true);
        } else if (i % 3 === 1) {
          drawSnowman(ctx, mid, plat.y, 12);
        } else {
          drawChristmasTree(ctx, mid, plat.y, 18);
        }
        drawSnowball(ctx, plat.x + 10, plat.y, 3);
      }
    }

    // === ICICLES under wide bridge ===
    const bridge = floats.find(p => p.width >= 350);
    if (bridge) {
      for (let i = 0; i < 6; i++) {
        drawIcicle(ctx, bridge.x + 30 + i * 60, bridge.y + bridge.height, 8 + Math.random() * 7);
      }
    }
  },

  drawFarBackground: (ctx, _arena) => {
    // Distant snowy mountain range
    ctx.save();
    ctx.globalAlpha = 0.35;

    // Far mountains — tall, faded
    ctx.fillStyle = '#9AB0C8';
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(80, 380);
    ctx.lineTo(200, 480);
    ctx.lineTo(320, 350);
    ctx.lineTo(440, 460);
    ctx.lineTo(520, 370);
    ctx.lineTo(640, 420);
    ctx.lineTo(780, 340);
    ctx.lineTo(900, 440);
    ctx.lineTo(1000, 360);
    ctx.lineTo(1120, 450);
    ctx.lineTo(1220, 380);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Snow caps on peaks
    ctx.fillStyle = '#D0E0F0';
    ctx.globalAlpha = 0.3;
    const peaks = [
      { x: 80, y: 380, w: 60 }, { x: 320, y: 350, w: 55 },
      { x: 520, y: 370, w: 50 }, { x: 780, y: 340, w: 60 },
      { x: 1000, y: 360, w: 55 }, { x: 1220, y: 380, w: 45 },
    ];
    for (const p of peaks) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.w * 0.4, p.y + 35);
      ctx.lineTo(p.x + p.w * 0.4, p.y + 35);
      ctx.closePath();
      ctx.fill();
    }

    // Nearer foothills
    ctx.fillStyle = '#8AA0B8';
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(100, 500);
    ctx.lineTo(250, 540);
    ctx.lineTo(400, 490);
    ctx.lineTo(550, 530);
    ctx.lineTo(700, 480);
    ctx.lineTo(850, 520);
    ctx.lineTo(1000, 490);
    ctx.lineTo(1150, 530);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;
    const floats = arena.platforms.filter(p => p.y < 650);

    // Foreground trees on ground — drawn OVER players
    drawPineTree(ctx, 40, gy, 70, true);
    drawChristmasTree(ctx, 400, gy, 55);
    drawPineTree(ctx, 750, gy, 65, true);
    drawPineTree(ctx, 1220, gy, 60, true);

    // Foreground trees on platforms
    for (const plat of floats) {
      if (plat.width >= 350) {
        drawPineTree(ctx, plat.x + plat.width * 0.45, plat.y, 32, true);
      } else if (plat.width >= 200) {
        drawPineTree(ctx, plat.x + plat.width * 0.5, plat.y, 24, true);
      }
    }

    // Large snowball pyramids — foreground, prominent (4-3-2-1 model)
    drawLargeSnowballPyramid(ctx, 300, gy, 10);
    drawLargeSnowballPyramid(ctx, 1050, gy, 9);

    // Snow bushes
    const snowBushColors = {
      backLayer: '#2A4A2A',
      mainBody: '#3A5A3A',
      leftLobe: '#345A34',
      rightLobe: '#305830',
      highlight: '#4A6A4A',
      highlight2: '#4A6A4A',
      berries: ['#CC3333', '#DD4444', '#BB2222'],
    };
    drawFgBush(ctx, 150, gy, 34, snowBushColors);
    drawFgBush(ctx, 580, gy, 38, snowBushColors);
    drawFgBush(ctx, 940, gy, 30, snowBushColors);

    drawSnowDrift(ctx, 15, gy, 45, 6);
    drawSnowDrift(ctx, 1250, gy, 40, 5);
  },

  physics: {
    friction: 0.15,
  },
};
