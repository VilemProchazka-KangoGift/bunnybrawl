import type { ArenaPack } from '../types';
import type { Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { getFloatingPlatforms, isLivePlayer, drawDriftBand, type DriftBandConfig } from '../../themes/utils';

const GROUND_MIST_CONFIG: DriftBandConfig = {
  topY: 615,
  bottomY: 660,
  colors: ['#e8f4ff', '#cfe4f5', '#a8c8de'],
  alphas: [0.10, 0.13, 0.18],
  drifts: [3, 6, 9],
};

// Waterfall current is x=440..840. Spray clouds are denser there.
const WATERFALL_SPRAY_BOUNDS = { left: 440, right: 840 };

// Waterfall current is x=440..840 (width 400). Spray spans the full lip.
const WATERFALL_BASE_LX = 440;
const WATERFALL_BASE_RX = 840;
const WATERFALL_BASE_W = WATERFALL_BASE_RX - WATERFALL_BASE_LX;
const WATERFALL_BASE_Y = 660;
// Frogs sit atop platforms; gy is the surface y the frog rests on.
const LILY_PADS = [
  { x: 115,  gy: 565 },     // x=30..200 y=570 platform
  { x: 1170, gy: 545 },     // x=1100..1240 y=550 platform
  { x: 160,  gy: 365 },     // x=20..180 y=370 platform
  { x: 1105, gy: 435 },     // x=1050..1160 y=440 platform
] as const;
const _frogJumpExcite = new Float32Array(LILY_PADS.length);
let _lastFrogTime = 0;
import {
  drawTree, drawBush, drawFlower, drawGrassTuft,
  drawFgBush, drawTallGrass, drawFern, drawHangingVine, drawFgLeafCluster, drawFgWildflower,
} from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  wavyDown, backWavyUp, drawLeftStones, leftWavy,
} from '../../themes/drawPrimitives';

// Wet stone palette — blue-gray tinted for the waterfall biome.
const WATERFALL_STONE_PALETTE = [
  { base: '#5a6a78', dark: '#2a3a48', light: '#8a9aa8' },
  { base: '#4a5a68', dark: '#222e3a', light: '#7a8a98' },
  { base: '#6a7a88', dark: '#34424e', light: '#9aaab8' },
  { base: '#54646e', dark: '#283440', light: '#849aa8' },
];

function drawWaterfallPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — dark wet stone
  drawPlatformRightFace(ctx, platform, '#18241c');

  // Left protrusions — wet blue-gray stones (skip ground; extend left, no
  // body-region overlap)
  if (!isGround) {
    drawLeftStones(ctx, platform, WATERFALL_STONE_PALETTE, rng, { count: 3, rxMin: 2.8, rxMax: 5 });
  }

  // Edge profiles — wavy rounded; capture front pts to find drip peaks
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 4, ampMin: 2, ampMax: 4, valleyBase: 0.3 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 2, ampMax: 3 });
  const leftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1.5, ampMax: 3 });

  // Cap — wet moss blue-green with cycling green dots
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#3a6858',
    capLight: 'rgba(180,230,210,0.18)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      const dotColors = ['#2a5c4c', '#4a7a68', '#5a8878'];
      const n = Math.max(2, Math.floor(platform.width / 8));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + rng() * 0.4) / n;
        const v = 0.15 + rng() * 0.7;
        const dx = platform.x + u * platform.width + v * skew;
        const dy = capFront - v * CAP_DEPTH;
        ctx2.fillStyle = dotColors[i % dotColors.length];
        ctx2.beginPath();
        ctx2.arc(dx, dy, 0.8 + rng() * 0.4, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);

  // Water trickles threading down from front edge peaks
  for (let i = 1; i < frontPts.length - 1; i++) {
    const prev = frontPts[i - 1];
    const cur = frontPts[i];
    const next = frontPts[i + 1];
    if (cur.y > prev.y && cur.y > next.y && rng() < 0.55) {
      const threadLen = 3 + rng() * 4;
      const grad = ctx.createLinearGradient(0, cur.y, 0, cur.y + threadLen);
      grad.addColorStop(0, 'rgba(170,215,235,0.85)');
      grad.addColorStop(1, 'rgba(170,215,235,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cur.x, cur.y);
      ctx.lineTo(cur.x, cur.y + threadLen);
      ctx.stroke();
      ctx.fillStyle = 'rgba(210,235,245,0.75)';
      ctx.beginPath();
      ctx.arc(cur.x, cur.y + threadLen, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWaterfallPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — dark wet-stone gradient
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#3a5848');
  g.addColorStop(1, '#1a2818');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Vertical water streaks
  const streakN = 3 + Math.floor(rng() * 2);
  ctx.strokeStyle = 'rgba(200,230,240,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < streakN; i++) {
    const sx = platform.x + 4 + rng() * (platform.width - 8);
    const sway = (rng() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(sx, bodyTop);
    ctx.quadraticCurveTo(sx + sway, bodyTop + bodyH * 0.5, sx, bodyTop + bodyH);
    ctx.stroke();
  }

  // Algae patches
  ctx.fillStyle = 'rgba(30,60,40,0.55)';
  const algaeN = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < algaeN; i++) {
    const ax = platform.x + 2 + rng() * (platform.width - 4);
    const ay = bodyTop + 2 + rng() * Math.max(1, bodyH - 4);
    const arx = 1.2 + rng() * 0.8;
    const ary = 0.8 + rng() * 0.6;
    ctx.beginPath();
    ctx.ellipse(ax, ay, arx, ary, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);
}

export const waterfall: ArenaPack = {
  // ---- Identity ----
  id: 'waterfall',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #3A80C9 0%, #6ABED8 40%, #3A7A5A 100%)',
  previewIcon: '\u{1F4A7}',

  // ---- Translations ----
  translations: { en: 'Waterfall', cs: 'Vodop\u00E1d', hi: '\u091D\u0930\u0928\u093E', fil: 'Talon' },

  // ---- Layout ----
  defaultSurface: 'stone',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
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
  ]),
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

  fog: { count: 0, baseY: 0, yVariance: 0, speedRange: [0, 0], alphaRange: [0, 0], color: '#000', sizeX: 0, sizeY: 0, opacity: 0 },

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

  drawPlatform: (ctx, platform, isGround) => drawWaterfallPlatformBg(ctx, platform, isGround),

  drawPlatformOverlay: (ctx, platform, _isGround) => drawWaterfallPlatformFg(ctx, platform),

  drawAnimatedBackground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice()) return;
    ctx.save();
    // Spray plume spread across the full waterfall width.
    ctx.fillStyle = '#f0f8ff';
    for (let i = 0; i < 80; i++) {
      const t = ((time * 0.6 + i * 0.013) % 1);
      // Each particle anchored at a different x along the lip.
      const xAnchor = WATERFALL_BASE_LX + ((i * 137) % WATERFALL_BASE_W);
      const xOff = fastSin(time * 1.5 + i * 0.7) * (24 + t * 28);
      const x = xAnchor + xOff;
      const y = WATERFALL_BASE_Y - t * 220;
      const r = 4 + (1 - t) * 8;
      ctx.globalAlpha = (1 - t) * 0.85 * Math.min(1, t * 4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Outer mist veil — also spread across width, drifting outward.
    ctx.fillStyle = '#dcebfa';
    for (let i = 0; i < 18; i++) {
      const t = ((time * 0.3 + i * 0.055) % 1);
      const xAnchor = WATERFALL_BASE_LX - 30 + ((i * 79) % (WATERFALL_BASE_W + 60));
      const x = xAnchor + fastSin(time + i) * 18;
      const y = WATERFALL_BASE_Y - 30 - t * 140;
      const r = 28 + t * 18;
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Splash bursts at multiple points along the lip (5 anchors).
    const splashPhase = time % 0.5;
    if (splashPhase < 0.3) {
      const u = splashPhase / 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1 - u) * 0.85;
      const splashAnchors = 5;
      for (let s = 0; s < splashAnchors; s++) {
        const sx = WATERFALL_BASE_LX + (s + 0.5) * (WATERFALL_BASE_W / splashAnchors);
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + ((i / 5) - 0.5) * 1.4;
          const speed = 40 + (i % 3) * 18;
          const px = sx + fastCos(a) * speed * u;
          const py = WATERFALL_BASE_Y - 4 + fastSin(a) * speed * u + 40 * u * u;
          ctx.beginPath();
          ctx.arc(px, py, 2 + u * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    const dt = Math.max(0, Math.min(0.1, time - _lastFrogTime));
    _lastFrogTime = time;
    for (let i = 0; i < LILY_PADS.length; i++) {
      const lp = LILY_PADS[i];
      // Reactive: frog leaps when a player approaches within 60px.
      let nearest = Infinity;
      for (const p of matchState?.players ?? []) {
        if (!isLivePlayer(p)) continue;
        const dx = (p.x + p.width * 0.5) - lp.x;
        const dy = (p.y + p.height) - lp.gy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) nearest = d2;
      }
      const target = nearest < 60 * 60 ? 1 : 0;
      const e = _frogJumpExcite[i] = Math.max(0, _frogJumpExcite[i] + (target - _frogJumpExcite[i]) * dt * 5);
      // Hop arc: e ramps 0..1; lift = -sin(e*pi)*18 (peak at e=0.5)
      const lift = -fastSin(e * Math.PI) * 18;
      ctx.fillStyle = '#3d8a3a';
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.gy + 2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5fb45a';
      ctx.beginPath();
      ctx.ellipse(lp.x - 2, lp.gy, 20, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(lp.x - 2, lp.gy);
      ctx.lineTo(lp.x + 4, lp.gy);
      ctx.lineTo(lp.x + 1, lp.gy + 3);
      ctx.closePath();
      ctx.fill();
      const breath = fastSin(time * 2 + i) * 0.5;
      const fy = lp.gy + lift;
      ctx.fillStyle = '#4a8a3a';
      ctx.beginPath();
      ctx.ellipse(lp.x, fy - 6 + breath, 9, 7 - breath * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8d088';
      ctx.beginPath();
      ctx.ellipse(lp.x, fy - 4 + breath, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a8a3a';
      ctx.beginPath();
      ctx.arc(lp.x - 3.5, fy - 12, 2.5, 0, Math.PI * 2);
      ctx.arc(lp.x + 3.5, fy - 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(lp.x - 3.5, fy - 12, 1.6, 0, Math.PI * 2);
      ctx.arc(lp.x + 3.5, fy - 12, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(lp.x - 4, fy - 12.5, 1, 1.5);
      ctx.fillRect(lp.x + 3, fy - 12.5, 1, 1.5);
      ctx.strokeStyle = '#2a4a2a';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(lp.x - 4, fy - 4 + breath);
      ctx.lineTo(lp.x + 4, fy - 4 + breath);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawAnimatedForeground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    drawDriftBand(ctx, time, GROUND_MIST_CONFIG);
    // Denser spray plumes around the waterfall splash zone.
    ctx.save();
    const cxBase = (WATERFALL_SPRAY_BOUNDS.left + WATERFALL_SPRAY_BOUNDS.right) / 2;
    const halfW = (WATERFALL_SPRAY_BOUNDS.right - WATERFALL_SPRAY_BOUNDS.left) / 2;
    for (let pi = 0; pi < 4; pi++) {
      const driftPhase = time * 0.55 + pi * Math.PI / 2;
      const px = cxBase + fastSin(driftPhase) * (halfW - 30);
      const py = 640 + fastSin(time * 0.6 + pi) * 6;
      // Alpha peaks mid-zone, fades at edges — and gently breathes via cos.
      const edgeFade = 1 - Math.abs(fastSin(driftPhase));
      const alpha = (0.18 + edgeFade * 0.25) * 0.9;
      ctx.fillStyle = `rgba(220,235,250,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 90, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['waterfall_ambient'],
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [6, 15] }],
  },

  scatterFlockConfigs: [
    {
      species: 'bird',
      positions: [
        { x: 350, y: 188 },
        { x: 940, y: 168 },
        { x: 150, y: 368 },
        { x: 1180, y: 338 },
      ],
      radius: 120,
      respawnTime: 8,
    },
  ],

  musicFile: 'waterfall.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:99},{t:5,y:'j',x:1154},{t:16,y:'j',x:538},{t:17,y:'j',x:715}],
      [{t:0,y:'d',x:168},{t:2,y:'j',x:134},{t:5,y:'j',x:30},{t:6,y:'j',x:30},{t:14,y:'j',x:168}],
      [{t:0,y:'d',x:188},{t:1,y:'d',x:100},{t:3,y:'j',x:124},{t:6,y:'j',x:100},{t:7,y:'j',x:100},{t:14,y:'j',x:188}],
      [{t:0,y:'d',x:148},{t:1,y:'d',x:148},{t:2,y:'d',x:148},{t:4,y:'j',x:129},{t:5,y:'d',x:20},{t:7,y:'j',x:20},{t:8,y:'j',x:20}],
      [{t:0,y:'d',x:208},{t:1,y:'d',x:110},{t:2,y:'d',x:110},{t:3,y:'d',x:110},{t:5,y:'d',x:110},{t:8,y:'j',x:110},{t:9,y:'j',x:208},{t:14,y:'d',x:208}],
      [{t:0,y:'d',x:1100},{t:2,y:'j',x:1208},{t:6,y:'j',x:1114},{t:15,y:'j',x:1100}],
      [{t:0,y:'d',x:1050},{t:1,y:'d',x:1128},{t:3,y:'j',x:1128},{t:5,y:'d',x:1128},{t:7,y:'j',x:1124},{t:15,y:'j',x:1050}],
      [{t:0,y:'d',x:1120},{t:1,y:'d',x:1218},{t:2,y:'d',x:1218},{t:3,y:'d',x:1218},{t:4,y:'j',x:1218},{t:5,y:'d',x:1120},{t:6,y:'d',x:1120},{t:8,y:'j',x:1122},{t:10,y:'j',x:1120}],
      [{t:0,y:'d',x:1040},{t:1,y:'d',x:1123},{t:3,y:'d',x:1123},{t:5,y:'d',x:1123},{t:6,y:'d',x:1123},{t:7,y:'d',x:1123},{t:10,y:'j',x:1040},{t:15,y:'d',x:1040}],
      [{t:0,y:'d',x:408},{t:1,y:'d',x:260},{t:2,y:'d',x:260},{t:3,y:'d',x:260},{t:4,y:'d',x:260},{t:11,y:'j',x:408},{t:12,y:'j',x:408},{t:14,y:'d',x:408},{t:16,y:'d',x:408},{t:17,y:'d',x:408}],
      [{t:0,y:'d',x:860},{t:5,y:'d',x:988},{t:6,y:'d',x:988},{t:7,y:'d',x:988},{t:8,y:'d',x:988},{t:12,y:'j',x:860},{t:13,y:'j',x:860},{t:15,y:'d',x:988},{t:17,y:'d',x:860}],
      [{t:0,y:'d',x:523},{t:9,y:'d',x:510},{t:12,y:'j',x:523},{t:13,y:'j',x:523},{t:14,y:'d',x:510},{t:16,y:'d',x:523},{t:17,y:'d',x:523}],
      [{t:0,y:'d',x:630},{t:14,y:'d',x:630},{t:16,y:'d',x:630},{t:17,y:'d',x:638}],
      [{t:0,y:'d',x:740},{t:10,y:'d',x:750},{t:11,y:'j',x:740},{t:12,y:'j',x:740},{t:15,y:'d',x:750},{t:16,y:'d',x:740},{t:17,y:'d',x:740}],
      [{t:0,y:'d',x:378},{t:1,y:'d',x:300},{t:2,y:'d',x:300},{t:3,y:'j',x:300},{t:4,y:'j',x:300},{t:16,y:'d',x:378}],
      [{t:0,y:'d',x:920},{t:3,y:'j',x:978},{t:5,y:'d',x:978},{t:6,y:'d',x:978},{t:7,y:'j',x:978},{t:8,y:'j',x:978},{t:17,y:'d',x:920}],
      [{t:0,y:'d',x:546},{t:17,y:'j',x:546}],
      [{t:0,y:'d',x:710},{t:16,y:'j',x:710}],
    ],
    nextHop: [[-1,1,1,1,1,5,1,1,5,1,1,1,1,1,1,5,16,17],[0,-1,2,2,14,5,6,2,2,14,2,14,2,2,14,5,0,0],[0,1,-1,3,3,0,6,7,3,3,7,3,7,7,14,6,0,0],[0,1,2,-1,4,5,1,7,8,4,7,4,4,7,1,5,0,0],[0,1,2,3,-1,5,1,2,8,9,8,9,9,8,14,5,14,0],[0,0,2,2,2,-1,6,2,15,2,2,2,2,2,2,15,0,0],[0,1,1,3,3,5,-1,7,3,3,7,3,7,7,1,15,0,0],[0,1,2,3,4,5,6,-1,8,4,10,4,10,10,1,5,0,0],[0,1,3,3,3,5,6,7,-1,3,10,10,10,10,1,15,0,15],[0,1,2,3,4,3,1,2,3,-1,2,11,12,11,14,3,16,17],[0,6,7,7,7,5,6,7,8,7,-1,13,12,13,12,15,0,17],[0,9,9,9,9,0,9,9,9,9,13,-1,12,13,14,13,16,17],[0,14,14,14,14,0,14,14,14,14,14,14,-1,14,14,0,16,17],[0,0,10,15,10,10,10,10,10,11,10,11,12,-1,11,15,16,17],[0,1,2,3,4,0,1,2,3,4,2,4,4,2,-1,0,16,0],[0,6,3,3,3,5,6,7,8,3,7,3,7,7,6,-1,0,17],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,17],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,-1]],
    safeHop: [[-1,1,1,1,1,5,1,1,5,1,1,1,1,1,1,5,16,17],[0,-1,2,2,14,5,6,2,2,14,2,14,2,2,14,5,0,0],[0,1,-1,3,3,0,6,7,3,3,7,3,7,7,14,6,0,0],[0,1,2,-1,4,5,1,7,8,4,7,4,4,7,1,5,0,0],[0,1,2,3,-1,5,1,2,8,9,8,9,9,8,14,5,14,0],[0,0,2,2,2,-1,6,2,15,2,2,2,2,2,2,15,0,0],[0,1,1,3,3,5,-1,7,3,3,7,3,7,7,1,15,0,0],[0,1,2,3,4,5,6,-1,8,4,10,4,10,10,1,5,0,0],[0,1,3,3,3,5,6,7,-1,3,10,10,10,10,1,15,0,15],[0,1,2,3,4,3,1,2,3,-1,2,11,12,11,14,3,16,17],[0,6,7,7,7,5,6,7,8,7,-1,13,12,13,12,15,0,17],[0,9,9,9,9,0,9,9,9,9,13,-1,12,13,14,13,16,17],[0,14,14,14,14,0,14,14,14,14,14,14,-1,14,14,0,16,17],[0,0,10,15,10,10,10,10,10,11,10,11,12,-1,11,15,16,17],[0,1,2,3,4,0,1,2,3,4,2,4,4,2,-1,0,16,0],[0,6,3,3,3,5,6,7,8,3,7,3,7,7,6,-1,0,17],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,17],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,-1]],
  },
  // NAV-DATA-END
};
