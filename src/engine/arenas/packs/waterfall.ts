import type { ArenaPack } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { getFloatingPlatforms } from '../../themes/utils';
import {
  drawTree, drawBush, drawFlower, drawGrassTuft,
  drawFgBush, drawTallGrass, drawFern, drawHangingVine, drawFgLeafCluster, drawFgWildflower,
} from '../../themes/drawPrimitives';

export const waterfall: ArenaPack = {
  // ---- Identity ----
  id: 'waterfall',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #3A80C9 0%, #6ABED8 40%, #3A7A5A 100%)',
  previewIcon: '\u{1F4A7}',

  // ---- Translations ----
  translations: { en: 'Waterfall', cs: 'Vodop\u00E1d', hi: '\u091D\u0930\u0928\u093E', fil: 'Talon' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    { x: 30, y: 570, width: 170, height: 24 },
    { x: 100, y: 470, width: 120, height: 24 },
    { x: 20, y: 370, width: 160, height: 24 },
    { x: 110, y: 280, width: 130, height: 24 },
    { x: 1100, y: 550, width: 140, height: 24 },
    { x: 1050, y: 440, width: 110, height: 24 },
    { x: 1120, y: 340, width: 130, height: 24 },
    { x: 1040, y: 240, width: 115, height: 24 },
    { x: 260, y: 190, width: 180, height: 24 },
    { x: 860, y: 170, width: 160, height: 24 },
    { x: 510, y: 120, width: 45, height: 16 },
    { x: 630, y: 95, width: 40, height: 16 },
    { x: 740, y: 115, width: 42, height: 16 },
    { x: 300, y: 430, width: 110, height: 24 },
    { x: 920, y: 400, width: 90, height: 24 },
    { x: 530, y: 612, width: 48, height: 48 },
    { x: 710, y: 618, width: 42, height: 42 },
  ],
  spawnPoints: [
    { x: 100, y: 550 },
    { x: 1160, y: 530 },
    { x: 80, y: 350 },
    { x: 1140, y: 320 },
    { x: 320, y: 640 },
    { x: 960, y: 640 },
  ],
  effectZones: [
    { x: 440, y: 160, width: 400, height: 500, type: 'current', vy: 900 },
    { x: 220, y: 500, width: 180, height: 160, type: 'current', vx: 50 },
    { x: 880, y: 500, width: 180, height: 160, type: 'current', vx: -50 },
  ],
  carrotZones: [
    { x: 420, y: 60, width: 440, height: 600 },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#3A80C9' },
      { offset: 0.5, color: '#6ABED8' },
      { offset: 1, color: '#A0D8E0' },
    ],
  },

  hills: [
    { x: 0, baseY: 620, width: 280, height: 130, color: '#4A8E42' },
    { x: 220, baseY: 635, width: 200, height: 90, color: '#4A8E42' },
    { x: 850, baseY: 635, width: 200, height: 90, color: '#4A8E42' },
    { x: 1000, baseY: 620, width: 300, height: 130, color: '#4A8E42' },
  ],

  ground: {
    surfaceColor: '#5AAF49',
    surfaceThickness: 4,
    grassBlades: {
      color: '#4D9F3A',
      spacing: 14,
      heightRange: [5, 9],
    },
  },

  platform: {
    floatingBodyColor: '#5A6B5A',
    floatingTopColor: '#6A7B6A',
    floatingAccentColor: '#5AAF49',
    groundBodyColor: '#4A5A3E',
    groundTopColor: '#3A7A3A',
    drawMoss: true,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 3,
    color: 'rgba(255, 255, 255, 0.5)',
    minSize: 40,
    maxSize: 65,
    minSpeed: 3,
    maxSpeed: 8,
    yRange: [10, 50],
  },

  weather: {
    particleCount: 35,
    types: [
      { type: 'sprinkle', weight: 0.6, sizeRange: [1, 3], vxRange: [-5, 5], vyRange: [20, 50], rotSpeedRange: [0, 0] },
      { type: 'leaf', weight: 0.4, sizeRange: [3, 5], vxRange: [8, 25], vyRange: [12, 30], rotSpeedRange: [1, 3] },
    ],
  },

  wildlife: {
    count: 4,
    types: [
      { type: 'butterfly', weight: 0.6, colors: ['#4FC3F7', '#81D4FA', '#B3E5FC', '#DDA0DD', '#80CBC4'], speedRange: [12, 25], yRange: [0.15, 0.7] },
      { type: 'bird', weight: 0.4, colors: ['#37474F', '#455A64', '#546E7A'], speedRange: [35, 70], yRange: [0.05, 0.2] },
    ],
  },

  fog: {
    count: 45,
    baseY: 645,
    yVariance: 30,
    speedRange: [3, 9],
    alphaRange: [0.3, 0.7],
    color: '#D8EEFF',
    sizeX: 70,
    sizeY: 18,
    opacity: 0.7,
  },

  ambientParticles: {
    count: 15,
    sizeRange: [1, 2],
    vxRange: [-2, 2],
    vyRange: [-6, -15],
    alphaRange: [0.15, 0.4],
    colors: ['#D0E8FF', '#E0F4FF'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: 120,
    maxNightAlpha: 0.55,
    showFireflies: true,
    showShootingStars: true,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // -- Left rocky hillside rising toward the waterfall source --
    // Large mossy cliff on left
    ctx.fillStyle = '#5A6A50';
    ctx.beginPath();
    ctx.moveTo(0, 660);
    ctx.lineTo(0, 280);
    ctx.lineTo(30, 240);
    ctx.lineTo(80, 200);
    ctx.lineTo(140, 170);
    ctx.lineTo(200, 150);
    ctx.lineTo(280, 130);
    ctx.lineTo(350, 110);
    ctx.lineTo(400, 95);
    ctx.lineTo(440, 85);
    ctx.lineTo(500, 78);
    ctx.lineTo(560, 72);
    ctx.lineTo(620, 68);
    // Waterfall source ledge
    ctx.lineTo(660, 65);
    ctx.lineTo(660, 660);
    ctx.closePath();
    ctx.fill();

    // Right rocky hillside
    ctx.beginPath();
    ctx.moveTo(1280, 660);
    ctx.lineTo(1280, 290);
    ctx.lineTo(1250, 250);
    ctx.lineTo(1200, 210);
    ctx.lineTo(1140, 175);
    ctx.lineTo(1080, 155);
    ctx.lineTo(1010, 135);
    ctx.lineTo(940, 115);
    ctx.lineTo(880, 100);
    ctx.lineTo(830, 90);
    ctx.lineTo(780, 82);
    ctx.lineTo(730, 76);
    ctx.lineTo(680, 70);
    ctx.lineTo(660, 65);
    ctx.lineTo(660, 660);
    ctx.closePath();
    ctx.fill();

    // Rocky texture layers -- darker stone underneath
    ctx.fillStyle = '#4D5D45';
    ctx.globalAlpha = 0.6;
    // Left inner rock face
    ctx.beginPath();
    ctx.moveTo(0, 660);
    ctx.lineTo(0, 350);
    ctx.lineTo(60, 300);
    ctx.lineTo(130, 260);
    ctx.lineTo(220, 220);
    ctx.lineTo(320, 185);
    ctx.lineTo(400, 160);
    ctx.lineTo(430, 150);
    ctx.lineTo(440, 660);
    ctx.closePath();
    ctx.fill();
    // Right inner rock face
    ctx.beginPath();
    ctx.moveTo(1280, 660);
    ctx.lineTo(1280, 360);
    ctx.lineTo(1220, 310);
    ctx.lineTo(1150, 270);
    ctx.lineTo(1060, 230);
    ctx.lineTo(960, 195);
    ctx.lineTo(880, 170);
    ctx.lineTo(850, 160);
    ctx.lineTo(840, 660);
    ctx.closePath();
    ctx.fill();

    // Craggy rock details -- individual stone ledges and outcroppings
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#6B7B5A';
    // Left outcroppings
    const leftCrags = [
      [40, 320, 70, 15], [100, 400, 55, 12], [60, 480, 80, 14],
      [150, 350, 50, 10], [200, 450, 60, 12], [80, 550, 65, 13],
      [300, 280, 45, 10], [350, 380, 55, 12], [250, 500, 50, 11],
    ];
    for (const [cx, cy, cw, ch] of leftCrags) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + cw * 0.3, cy - ch);
      ctx.lineTo(cx + cw * 0.7, cy - ch * 0.8);
      ctx.lineTo(cx + cw, cy);
      ctx.closePath();
      ctx.fill();
    }
    // Right outcroppings
    const rightCrags = [
      [1200, 330, 60, 14], [1140, 410, 50, 12], [1190, 490, 70, 13],
      [1080, 360, 55, 11], [1020, 460, 60, 12], [1160, 560, 60, 13],
      [950, 290, 50, 10], [900, 400, 50, 11], [980, 510, 55, 12],
    ];
    for (const [cx, cy, cw, ch] of rightCrags) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + cw * 0.3, cy - ch);
      ctx.lineTo(cx + cw * 0.7, cy - ch * 0.8);
      ctx.lineTo(cx + cw, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Moss and vegetation streaks on the cliff face
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#5A9A3A';
    const mossPatches = [
      [50, 310, 40, 6], [120, 250, 35, 5], [200, 200, 30, 5],
      [300, 170, 25, 4], [80, 420, 45, 6], [180, 380, 35, 5],
      [1200, 320, 40, 6], [1130, 260, 35, 5], [1060, 210, 30, 5],
      [970, 180, 25, 4], [1180, 430, 45, 6], [1090, 390, 35, 5],
    ];
    for (const [mx, my, mw, mh] of mossPatches) {
      ctx.beginPath();
      ctx.ellipse(mx + mw / 2, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dark cliff crevice behind waterfall channel
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#2A3A2A';
    ctx.beginPath();
    ctx.moveTo(440, 660);
    ctx.lineTo(440, 120);
    ctx.quadraticCurveTo(500, 80, 560, 72);
    ctx.lineTo(660, 65);
    ctx.lineTo(720, 72);
    ctx.quadraticCurveTo(780, 80, 840, 120);
    ctx.lineTo(840, 660);
    ctx.closePath();
    ctx.fill();

    // Lighter wet-rock sheen on cliff edges near waterfall
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#8AA8B8';
    ctx.fillRect(435, 100, 8, 560);
    ctx.fillRect(837, 100, 8, 560);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Trees on the far sides (away from waterfall)
    drawTree(ctx, 40, y, 55);
    drawTree(ctx, 1200, y, 48);

    // Bushes on sides
    drawBush(ctx, 130, y, 26);
    drawBush(ctx, 300, y, 20);
    drawBush(ctx, 970, y, 24);
    drawBush(ctx, 1120, y, 18);

    // Moss-covered boulders flanking the waterfall base
    const drawBoulder = (bx: number, by: number, bw: number, bh: number, mossColor: string) => {
      ctx.save();
      // Stone body
      ctx.fillStyle = '#6A7B65';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + bw * 0.15, by - bh * 0.9, bx + bw * 0.45, by - bh);
      ctx.quadraticCurveTo(bx + bw * 0.8, by - bh * 0.85, bx + bw, by);
      ctx.closePath();
      ctx.fill();
      // Dark shadow
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#3A4A38';
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.5, by);
      ctx.quadraticCurveTo(bx + bw * 0.85, by - bh * 0.4, bx + bw, by);
      ctx.closePath();
      ctx.fill();
      // Moss cap
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = mossColor;
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.45, by - bh * 0.85, bw * 0.35, bh * 0.2, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Boulders at waterfall base
    drawBoulder(380, y, 55, 35, '#5A9A4A');
    drawBoulder(420, y, 40, 22, '#4A8A3A');
    drawBoulder(830, y, 50, 32, '#5A9A4A');
    drawBoulder(870, y, 45, 28, '#4A8A3A');

    // Scattered boulders along cliff face
    drawBoulder(370, 450, 40, 22, '#5A9A4A');
    drawBoulder(850, 390, 38, 20, '#4A8A3A');
    drawBoulder(390, 300, 35, 18, '#5A9A4A');
    drawBoulder(840, 520, 42, 24, '#4A8A3A');

    // Flowers on the sides
    const flowerColors = ['#FF6B8A', '#FFD700', '#87CEEB', '#DDA0DD', '#80CBC4'];
    const flowerPositions = [100, 180, 260, 950, 1030, 1120, 1200];
    for (const fx of flowerPositions) {
      const color = flowerColors[Math.floor(fx * 0.013) % flowerColors.length];
      drawFlower(ctx, fx, y, color);
    }

    // Grass tufts near water
    drawGrassTuft(ctx, 400, y, '#4D9F3A');
    drawGrassTuft(ctx, 870, y, '#4D9F3A');

    // Nature on floating platforms
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      const mid = plat.x + plat.width / 2;
      if (plat.width > 140) {
        drawBush(ctx, mid - 20, plat.y, 14);
        drawFlower(ctx, plat.x + 15, plat.y, '#80CBC4');
        drawGrassTuft(ctx, plat.x + plat.width - 12, plat.y);
      } else if (plat.width >= 80) {
        drawGrassTuft(ctx, mid - 5, plat.y);
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground bushes on sides
    drawFgBush(ctx, 90, gy, 55);
    drawFgBush(ctx, 260, gy, 42);
    drawFgBush(ctx, 990, gy, 50);
    drawFgBush(ctx, 1170, gy, 46);

    // Tall grass near waterfall edges
    drawTallGrass(ctx, 380, gy, 8);
    drawTallGrass(ctx, 870, gy, 7);
    drawTallGrass(ctx, 140, gy, 6);
    drawTallGrass(ctx, 1100, gy, 5);

    // Ferns
    drawFern(ctx, 50, gy);
    drawFern(ctx, 320, gy);
    drawFern(ctx, 940, gy);
    drawFern(ctx, 1240, gy);

    // Vines + foliage on floating platforms
    const floats = getFloatingPlatforms(arena.platforms);
    for (let pi = 0; pi < floats.length; pi++) {
      const plat = floats[pi];
      if (plat.width > 140) {
        drawFgBush(ctx, plat.x + plat.width * 0.2, plat.y, 16);
        drawFgBush(ctx, plat.x + plat.width * 0.8, plat.y, 14);
        drawHangingVine(ctx, plat.x + 10, plat.y + plat.height, 22);
        drawHangingVine(ctx, plat.x + plat.width - 10, plat.y + plat.height, 18);
        drawFgLeafCluster(ctx, plat.x + plat.width / 2, plat.y);
      } else if (plat.width >= 80) {
        drawHangingVine(ctx, plat.x + plat.width / 2, plat.y + plat.height, 15);
      }
    }

    // Foreground wildflowers on sides
    drawFgWildflower(ctx, 170, gy, '#4FC3F7', 16);
    drawFgWildflower(ctx, 300, gy, '#DDA0DD', 18);
    drawFgWildflower(ctx, 1020, gy, '#80CBC4', 17);
    drawFgWildflower(ctx, 1200, gy, '#FFD700', 20);

    // Dense mist spray at waterfall base
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const mx = 460 + i * 30;
      const my = gy - 8 - (i % 4) * 8;
      const mr = 22 + (i % 5) * 6;
      ctx.globalAlpha = 0.12 + (i % 3) * 0.03;
      ctx.fillStyle = '#D0E8FF';
      ctx.beginPath();
      ctx.ellipse(mx, my, mr, mr * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['waterfall_ambient'],
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [6, 15] }],
  },
  musicFile: 'waterfall.mp3',
};
