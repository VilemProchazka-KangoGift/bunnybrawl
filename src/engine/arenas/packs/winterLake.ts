import type { ArenaPack } from '../types';
import type { Arena, Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { computeNightIntensity } from '../../rendering';
import { getFloatingPlatforms, bakeVerticalGradientStrip } from '../../themes/utils';
import {
  drawPineTree, drawChristmasTree, drawSnowDrift, drawIcePatch, drawIcicle, drawIceCube, ICE_CUBE_DEPTH_RATIO,
  drawBigSnowman, drawIgloo, drawSnowman, drawSnowball,
  drawSnowballPyramid, drawLargeSnowballPyramid,
  drawFgBush,
  createThornRenderer, createSpringRenderer,
} from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  wavyDown, backWavyUp, leftWavy,
} from '../../themes/drawPrimitives';

const AURORA_STRIPES = [
  { color: '#7be0a3', y: 56,  h: 64, speed: 0.6,  phase: 0   },
  { color: '#c899ff', y: 120, h: 64, speed: 0.55, phase: 2.4 },
  { color: '#a3e8ff', y: 200, h: 56, speed: 0.5,  phase: 4.0 },
] as const;

// Aurora is GPU-paint-heavy when drawn via fillPath every frame (3 stripes ×
// full-canvas alpha-blended fills). Cached to an offscreen canvas, refreshed
// at ~10Hz (every 100ms), then blit as a single drawImage. Visually
// indistinguishable since aurora animates slowly.
const AURORA_REFRESH_INTERVAL = 0.1;
const AURORA_CACHE_H = 280;
let _auroraCache: OffscreenCanvas | null = null;
let _auroraCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
let _auroraCacheLastRefresh = -1;

function refreshAuroraCache(time: number): void {
  if (!_auroraCache || !_auroraCacheCtx) {
    if (typeof OffscreenCanvas === 'undefined') return;
    _auroraCache = new OffscreenCanvas(CANVAS_WIDTH, AURORA_CACHE_H);
    _auroraCacheCtx = _auroraCache.getContext('2d');
    if (!_auroraCacheCtx) { _auroraCache = null; return; }
  }
  const cctx = _auroraCacheCtx;
  cctx.clearRect(0, 0, CANVAS_WIDTH, AURORA_CACHE_H);
  const OVERHANG = 80;
  const STEP = 40;
  for (const st of AURORA_STRIPES) {
    const breathe = 0.5 + 0.5 * fastSin(time * 0.7 + st.phase);
    cctx.fillStyle = st.color;
    cctx.globalAlpha = 0.15 + breathe * 0.18;
    cctx.beginPath();
    cctx.moveTo(-OVERHANG, st.y);
    for (let x = -OVERHANG; x <= CANVAS_WIDTH + OVERHANG; x += STEP) {
      const y = st.y + fastSin(x * 0.0085 + time * st.speed + st.phase) * 16
                     + fastSin(x * 0.003 + time * st.speed * 0.5) * 22;
      cctx.lineTo(x, y);
    }
    for (let x = CANVAS_WIDTH + OVERHANG; x >= -OVERHANG; x -= STEP) {
      const y = st.y + st.h + fastSin(x * 0.0085 + time * st.speed + st.phase + 0.7) * 16
                            + fastSin(x * 0.003 + time * st.speed * 0.5 + 0.5) * 22;
      cctx.lineTo(x, y);
    }
    cctx.closePath();
    cctx.fill();
  }
  cctx.globalAlpha = 1;
}

const GLINT_ANCHORS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 50,   y: 572 }, { x: 90,   y: 572 }, { x: 130,  y: 573 }, { x: 170,  y: 573 },
  { x: 90,   y: 487 }, { x: 140,  y: 487 }, { x: 190,  y: 488 },
  { x: 40,   y: 412 }, { x: 80,   y: 412 }, { x: 130,  y: 413 },
  { x: 60,   y: 327 }, { x: 110,  y: 327 }, { x: 160,  y: 328 },
  { x: 1110, y: 582 }, { x: 1160, y: 582 }, { x: 1210, y: 583 },
  { x: 1080, y: 502 }, { x: 1130, y: 502 }, { x: 1180, y: 503 },
  { x: 1110, y: 422 }, { x: 1170, y: 422 }, { x: 1230, y: 423 },
  { x: 460,  y: 357 }, { x: 510,  y: 357 }, { x: 560,  y: 357 },
  { x: 610,  y: 357 }, { x: 660,  y: 357 }, { x: 710,  y: 357 },
  { x: 760,  y: 357 }, { x: 810,  y: 357 },
  { x: 540,  y: 497 }, { x: 590,  y: 497 }, { x: 640,  y: 497 },
  { x: 690,  y: 497 }, { x: 740,  y: 497 },
  { x: 280,  y: 437 }, { x: 320,  y: 438 }, { x: 350,  y: 438 },
  { x: 930,  y: 437 }, { x: 970,  y: 438 }, { x: 1000, y: 438 },
  { x: 390,  y: 277 }, { x: 410,  y: 277 },
  { x: 865,  y: 277 }, { x: 885,  y: 277 },
  { x: 610,  y: 227 }, { x: 635,  y: 227 },
  { x: 210,  y: 347 }, { x: 230,  y: 347 },
  { x: 1050, y: 347 }, { x: 1070, y: 347 },
  // Ground line — denser snow surface coverage
  { x: 100,  y: 658 }, { x: 200,  y: 658 }, { x: 300,  y: 658 },
  { x: 460,  y: 658 }, { x: 560,  y: 658 }, { x: 660,  y: 658 },
  { x: 760,  y: 658 }, { x: 940,  y: 658 }, { x: 1040, y: 658 },
  { x: 1140, y: 658 }, { x: 1220, y: 658 },
];

// See docs/perf-patterns.md — full-canvas gradient fillRect costs ~5ms/frame.
let _sceneTintCache: OffscreenCanvas | null = null;
function getSceneTintCache(): OffscreenCanvas | null {
  if (_sceneTintCache) return _sceneTintCache;
  _sceneTintCache = bakeVerticalGradientStrip(CANVAS_HEIGHT, g => {
    // Stop weights: top 1.0, mid 0.643, bottom 0.214 (relative to baseline 1.4
    // applied via globalAlpha at draw time).
    g.addColorStop(0,    'rgba(123, 224, 163, 1.0)');
    g.addColorStop(0.45, 'rgba(163, 232, 255, 0.643)');
    g.addColorStop(1,    'rgba(123, 224, 163, 0.214)');
  });
  return _sceneTintCache;
}

// Platform colors — legacy fields kept for ThemeConfig compat; unused once drawPlatform owns rendering.
const FLOAT_BODY = '#5A7A8C';
const FLOAT_TOP = '#D8E8F0';
const GROUND_BODY = '#4A6A7C';
const GROUND_TOP = '#E0EEF5';

function drawWinterPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — bluish snow shadow (darker than body)
  drawPlatformRightFace(ctx, platform, '#5A7486');

  // Edge profiles — rounded snow domes (down/up)
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 4, ampMin: 2, ampMax: 4, valleyBase: 0.4 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 2, ampMax: 3.5 });
  const leftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1.5, ampMax: 3 });

  // Cap — bright white snow with sparkles and gentle blue-shadow gradient
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#F6FAFF',
    capLight: 'rgba(255,255,255,0.35)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      const shadow = ctx2.createLinearGradient(0, capBack, 0, capFront);
      shadow.addColorStop(0, 'rgba(170,195,220,0.35)');
      shadow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.fillStyle = shadow;
      ctx2.fillRect(platform.x - 2, capBack - 2, platform.width + skew + 4, CAP_DEPTH + 4);

      const n = Math.max(2, Math.floor(platform.width / 22));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + rng() * 0.4) / n;
        const v = 0.2 + rng() * 0.65;
        const sx = platform.x + u * platform.width + v * skew;
        const sy = capFront - v * CAP_DEPTH;
        ctx2.fillStyle = 'rgba(255,255,255,0.9)';
        ctx2.beginPath();
        ctx2.arc(sx, sy, 0.7, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = 'rgba(200,220,240,0.35)';
        ctx2.beginPath();
        ctx2.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);

  // Icicles hanging below body bottom (floating only). Stay in bg — they're
  // below the body region, so player rising into body is above them.
  if (!isGround) {
    const bb = platform.y + platform.height;
    const icicleCount = Math.max(1, Math.floor(platform.width / 38));
    for (let i = 0; i < icicleCount; i++) {
      const t = (i + 0.25 + rng() * 0.5) / icicleCount;
      const ix = platform.x + t * platform.width;
      const len = 5 + rng() * 7;
      drawIcicle(ctx, ix, bb, len);
    }
  }
}

function drawWinterPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — packed snow gradient
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#C8D8E4');
  g.addColorStop(0.5, '#9BB3C5');
  g.addColorStop(1, '#6A8494');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Packed-snow speckles
  ctx.fillStyle = 'rgba(90,115,140,0.35)';
  const speckN = Math.max(2, Math.floor(platform.width / 14));
  for (let i = 0; i < speckN; i++) {
    const px = platform.x + rng() * platform.width;
    const py = bodyTop + 2 + rng() * Math.max(1, bodyH - 4);
    ctx.beginPath();
    ctx.ellipse(px, py, 1.2 + rng() * 0.9, 0.7 + rng() * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Snow-dust specks
  ctx.fillStyle = 'rgba(240,248,255,0.5)';
  const dustN = Math.max(1, Math.floor(platform.width / 22));
  for (let i = 0; i < dustN; i++) {
    const px = platform.x + rng() * platform.width;
    const py = bodyTop + 1 + rng() * Math.max(1, bodyH - 3);
    ctx.beginPath();
    ctx.arc(px, py, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bottom bevel
  ctx.fillStyle = 'rgba(40,55,75,0.28)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 3, platform.width, 3);
}

export const winterLake: ArenaPack = {
  // ---- Identity ----
  id: 'winter_lake',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #2C3E6B 0%, #8FA8C8 60%, #D8E8F0 100%)',
  previewIcon: '\u2744\uFE0F',

  // ---- Translations ----
  translations: { en: 'Winter Lake', cs: 'Zamrzl\u00E9 jezero', hi: '\u0938\u0930\u094D\u0926\u0940 \u0915\u0940 \u091D\u0940\u0932', fil: 'Lawa sa Taglamig' },

  // ---- Layout ----
  defaultSurface: 'snow',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    { x: 35, y: 575, width: 115, height: 24 },
    { x: 95, y: 490, width: 110, height: 24 },
    { x: 30, y: 415, width: 120, height: 24 },
    { x: 1095, y: 585, width: 145, height: 24 },
    { x: 1050, y: 505, width: 140, height: 24 },
    { x: 1100, y: 425, width: 140, height: 24 },
    { x: 440, y: 360, width: 400, height: 24 },
    { x: 45, y: 330, width: 100, height: 24 },
    { x: 520, y: 500, width: 240, height: 24 },
    { x: 370, y: 610, width: 65, height: 50, style: 'iceCube', surface: 'ice' },
    { x: 870, y: 610, width: 65, height: 50, style: 'iceCube', surface: 'ice' },
    { x: 270, y: 440, width: 90, height: 24 },
    { x: 920, y: 440, width: 90, height: 24 },
    { x: 380, y: 280, width: 45, height: 18 },
    { x: 855, y: 280, width: 45, height: 18 },
    { x: 600, y: 230, width: 50, height: 18 },
    { x: 200, y: 350, width: 40, height: 18 },
    { x: 1040, y: 350, width: 40, height: 18 },
  ] as Platform[], p => p.style !== 'iceCube'),
  spawnPoints: [
    { x: 95, y: 555 }, { x: 1170, y: 565 },
    { x: 90, y: 395 }, { x: 1170, y: 405 },
    { x: 640, y: 340 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    { x: 455, y: 384, width: 80, height: 14, type: 'lava' },
    { x: 580, y: 384, width: 80, height: 14, type: 'lava' },
    { x: 705, y: 384, width: 80, height: 14, type: 'lava' },
    { x: 570, y: 524, width: 70, height: 10, type: 'lava' },
  ],

  // ---- Visual config ----
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
  },

  // ---- Ambient systems ----
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

  // ---- Custom draw functions ----
  drawFarBackground: (ctx: CanvasRenderingContext2D, _arena: Arena) => {
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

  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    const floats = getFloatingPlatforms(arena.platforms);

    // === LANDMARKS (background, edges) ===
    drawBigSnowman(ctx, 55, y, 90);
    drawIgloo(ctx, 1080, y, 180, 100);

    // === GROUND — sparse ===
    drawPineTree(ctx, 200, y, 75, true);
    drawChristmasTree(ctx, 640, y, 55);
    drawPineTree(ctx, 1200, y, 60, true);
    drawSnowman(ctx, 530, y, 32);
    drawIcePatch(ctx, 700, y, 220);

    // Ice cube blocks are drawn by drawPlatform (platforms with style:'iceCube').

    // === PLATFORM DECORATIONS — rich variety per platform ===
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (plat.width >= 350) {
        // Very wide — spaced out: tree, christmas, snowman, tree
        drawPineTree(ctx, plat.x + 35, plat.y, 45, true);
        drawChristmasTree(ctx, plat.x + plat.width * 0.35, plat.y, 38);
        drawSnowman(ctx, plat.x + plat.width * 0.58, plat.y, 26);
        drawPineTree(ctx, plat.x + plat.width - 35, plat.y, 42, true);
        drawIcicle(ctx, plat.x + 60, plat.y + plat.height, 10);
        drawIcicle(ctx, plat.x + plat.width - 60, plat.y + plat.height, 11);
      } else if (plat.width >= 200) {
        // Wide — trees + mixed decorations
        drawPineTree(ctx, plat.x + 25, plat.y, 38, true);
        drawChristmasTree(ctx, plat.x + plat.width - 28, plat.y, 32);
        if (i % 2 === 0) {
          drawSnowman(ctx, mid, plat.y, 25);
        } else {
          drawSnowball(ctx, mid - 15, plat.y, 5);
          drawSnowball(ctx, mid + 15, plat.y, 4);
        }
        drawIcicle(ctx, mid, plat.y + plat.height, 9);
      } else if (plat.width >= 140) {
        // Medium — tree + decoration
        if (i % 3 === 0) {
          drawChristmasTree(ctx, mid - 12, plat.y, 30);
          drawSnowball(ctx, mid + 22, plat.y, 4);
        } else if (i % 3 === 1) {
          drawPineTree(ctx, mid - 12, plat.y, 34, true);
          drawSnowman(ctx, mid + 28, plat.y, 24);
        } else {
          drawPineTree(ctx, mid + 10, plat.y, 32, true);
          drawSnowballPyramid(ctx, mid - 20, plat.y, 6);
        }
        drawSnowDrift(ctx, plat.x + 10, plat.y, 18, 2);
      } else {
        // Small — one item + accent
        if (i % 3 === 0) {
          drawPineTree(ctx, mid, plat.y, 20, true);
        } else if (i % 3 === 1) {
          drawSnowman(ctx, mid, plat.y, 24);
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

  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;
    const floats = getFloatingPlatforms(arena.platforms);

    // Foreground trees on ground
    drawPineTree(ctx, 50, gy, 65, true);
    drawPineTree(ctx, 1230, gy, 55, true);

    // Foreground trees on wide platforms
    for (const plat of floats) {
      if (plat.width >= 350) {
        drawPineTree(ctx, plat.x + plat.width * 0.45, plat.y, 28, true);
      }
    }

    // Large snowball pyramid — single foreground accent
    drawLargeSnowballPyramid(ctx, 850, gy, 10);

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
    drawFgBush(ctx, 350, gy, 34, snowBushColors);
    // Snow cap on bush
    ctx.fillStyle = 'rgba(230, 240, 250, 0.75)';
    ctx.beginPath();
    ctx.ellipse(350, gy - 34 * 0.55, 34 * 0.55, 34 * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(355, gy - 34 * 0.65, 34 * 0.25, 34 * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawFgBush(ctx, 960, gy, 30, snowBushColors);
    // Snow cap on bush
    ctx.fillStyle = 'rgba(230, 240, 250, 0.75)';
    ctx.beginPath();
    ctx.ellipse(960, gy - 30 * 0.55, 30 * 0.55, 30 * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(965, gy - 30 * 0.65, 30 * 0.25, 30 * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawSnowDrift(ctx, 15, gy, 45, 6);
    drawSnowDrift(ctx, 1250, gy, 40, 5);
  },

  drawAnimatedBackground: (ctx, _arena, time, dayPhase) => {
    if (getSlowDevice()) return;
    const nightIntensity = computeNightIntensity(dayPhase);
    if (nightIntensity < 0.05) return;
    ctx.save();
    if (_auroraCacheLastRefresh < 0 || time - _auroraCacheLastRefresh >= AURORA_REFRESH_INTERVAL || time < _auroraCacheLastRefresh) {
      refreshAuroraCache(time);
      _auroraCacheLastRefresh = time;
    }
    if (_auroraCache) {
      ctx.globalAlpha = nightIntensity;
      ctx.drawImage(_auroraCache, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#a3e8ff';
    ctx.globalAlpha = 0.14 * nightIntensity;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 187) + fastSin(time * 0.3 + i) * 80 + CANVAS_WIDTH) % CANVAS_WIDTH;
      const phase = fastSin(time * 1.4 + i * 1.7);
      if (phase > 0.2) ctx.fillRect(x, 60, 2, 200 + phase * 30);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 18; i++) {
      const t = ((time * 0.4 + i * 0.045) % 1);
      const baseX = ((i * 173 + 37) % CANVAS_WIDTH);
      const x = baseX + fastSin(time * 0.6 + i) * 30;
      const y = 660 - t * 80;
      const r = 1.2 + (1 - t) * 2.5;
      ctx.globalAlpha = Math.min(t * 4, 1) * (1 - t) * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Glint anchors: ground line (sparser) + platform tops.
    ctx.fillStyle = '#dcf5ff';
    for (let i = 0; i < GLINT_ANCHORS.length; i++) {
      const phase = fastSin(time * 2.2 + i * 0.7);
      if (phase < 0.75) continue;
      const a = GLINT_ANCHORS[i];
      const intensity = (phase - 0.75) * 4;
      const r = 1.2 + intensity * 3;
      ctx.globalAlpha = Math.min(1, intensity) * 0.7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - r);
      ctx.lineTo(a.x + r * 0.3, a.y);
      ctx.lineTo(a.x, a.y + r);
      ctx.lineTo(a.x - r * 0.3, a.y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(a.x - r, a.y);
      ctx.lineTo(a.x, a.y - r * 0.3);
      ctx.lineTo(a.x + r, a.y);
      ctx.lineTo(a.x, a.y + r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  drawSceneTint: (ctx, dayPhase, time) => {
    if (getSlowDevice()) return;
    const nightIntensity = computeNightIntensity(dayPhase);
    if (nightIntensity < 0.05) return;
    const breathe = 0.5 + 0.5 * fastSin(time * 0.5);
    const tintAlpha = nightIntensity * (0.05 + breathe * 0.04);
    const cache = getSceneTintCache();
    if (!cache) return;
    ctx.save();
    ctx.globalAlpha = tintAlpha * 1.4;
    // X-axis stretch from 4-wide cache: smoothing doesn't help (all 4 columns
    // identical anyway) and skipping it saves the bilinear cost.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cache, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => {
    if (platform.style === 'iceCube') {
      const depth = platform.width * ICE_CUBE_DEPTH_RATIO;
      drawIceCube(ctx, platform.x, platform.y + depth / 2, platform.width, platform.height - depth / 2);
      return;
    }
    drawWinterPlatformBg(ctx, platform, isGround);
  },

  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    if (platform.style === 'iceCube') return;
    drawWinterPlatformFg(ctx, platform);
  },

  // ---- Gameplay modifiers ----
  physics: {
    friction: 0.15,
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;

    // Snow base mound
    ctx.fillStyle = 'rgba(220, 235, 250, 0.6)';
    ctx.beginPath();
    ctx.ellipse(x + width / 2, by, width * 0.45, height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ice crystal spikes — translucent blue/white
    const crystals = [
      { sx: 0.18, sh: 0.55, w: 0.1, tilt: -0.15 },
      { sx: 0.32, sh: 0.8, w: 0.09, tilt: -0.05 },
      { sx: 0.5, sh: 1.0, w: 0.11, tilt: 0 },
      { sx: 0.68, sh: 0.75, w: 0.09, tilt: 0.08 },
      { sx: 0.82, sh: 0.5, w: 0.08, tilt: 0.12 },
    ];
    for (const c of crystals) {
      const cxp = x + width * c.sx;
      const ch = height * c.sh;
      const cw = width * c.w;
      ctx.save();
      ctx.translate(cxp, by);
      ctx.rotate(c.tilt);

      // Crystal body — translucent blue
      const crystalGrd = ctx.createLinearGradient(0, 0, 0, -ch);
      crystalGrd.addColorStop(0, 'rgba(160, 200, 240, 0.6)');
      crystalGrd.addColorStop(0.5, 'rgba(180, 220, 255, 0.5)');
      crystalGrd.addColorStop(1, 'rgba(220, 240, 255, 0.3)');
      ctx.fillStyle = crystalGrd;
      ctx.beginPath();
      ctx.moveTo(-cw, 0);
      ctx.lineTo(-cw * 0.3, -ch * 0.6);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw * 0.3, -ch * 0.6);
      ctx.lineTo(cw, 0);
      ctx.closePath();
      ctx.fill();

      // Inner facet highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(-cw * 0.4, -ch * 0.1);
      ctx.lineTo(-cw * 0.1, -ch * 0.7);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw * 0.1, -ch * 0.5);
      ctx.lineTo(-cw * 0.1, -ch * 0.1);
      ctx.closePath();
      ctx.fill();

      // Crystal edge outline
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-cw, 0);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw, 0);
      ctx.stroke();

      ctx.restore();
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.5;
    const squash = 1 + bounceTimer * 0.03;
    const moundH = size * 0.4 / squash;

    // Snow mound body
    ctx.fillStyle = '#E8F0F8';
    ctx.beginPath();
    ctx.moveTo(x - halfW, y);
    ctx.quadraticCurveTo(x - halfW * 0.5, y - moundH * 1.3, x, y - moundH);
    ctx.quadraticCurveTo(x + halfW * 0.5, y - moundH * 1.3, x + halfW, y);
    ctx.closePath();
    ctx.fill();

    // Snow surface highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.6, y - moundH * 0.3);
    ctx.quadraticCurveTo(x, y - moundH * 1.1, x + halfW * 0.5, y - moundH * 0.4);
    ctx.quadraticCurveTo(x + halfW * 0.2, y - moundH * 0.8, x - halfW * 0.3, y - moundH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Shadow at base
    ctx.fillStyle = 'rgba(150, 180, 210, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * 0.9, size * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snow particles kicked up on bounce
    if (Math.abs(bounceTimer) > 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      const particleCount = 5;
      for (let p = 0; p < particleCount; p++) {
        const angle = (p / particleCount) * Math.PI - Math.PI * 0.1;
        const dist = halfW * 0.4 + Math.abs(bounceTimer) * 1.2;
        const px = x + Math.cos(angle) * dist;
        const py = y - moundH * 0.5 - Math.sin(angle) * dist * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + Math.abs(bounceTimer) * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }),

  drawCustomHazardZone: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, _time: number) => {
    ctx.save();
    const icicleCount = Math.floor(width / 12);
    const step = width / icicleCount;
    ctx.fillStyle = 'rgba(180, 210, 240, 0.7)';
    ctx.beginPath();
    for (let i = 0; i < icicleCount; i++) {
      const ix = x + 6 + i * step;
      const ih = height + 15 + (i % 3) * 8;
      ctx.moveTo(ix - 4, y);
      ctx.lineTo(ix, y + ih);
      ctx.lineTo(ix + 4, y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 240, 255, 0.5)';
    ctx.beginPath();
    for (let i = 0; i < icicleCount; i++) {
      const ix = x + 6 + i * step;
      const ih = height + 15 + (i % 3) * 8;
      ctx.moveTo(ix - 1, y + 2);
      ctx.lineTo(ix, y + ih * 0.7);
      ctx.lineTo(ix + 1, y + 2);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(200, 220, 240, 0.3)';
    ctx.fillRect(x - 5, y - 2, width + 10, 4);
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
  },
  musicFile: 'winter_lake.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:77},{t:2,y:'j',x:134,d:15},{t:4,y:'j',x:1152},{t:5,y:'j',x:1104},{t:9,y:'j',x:624,d:70},{t:10,y:'j',x:387,d:36},{t:11,y:'j',x:887}],
      [{t:0,y:'d',x:118},{t:2,y:'j',x:107},{t:3,y:'j',x:77},{t:4,y:'j',x:35,d:89},{t:5,y:'j',x:35,d:41},{t:6,y:'j',x:35,d:76},{t:12,y:'j',x:118}],
      [{t:0,y:'d',x:173},{t:1,y:'d',x:95},{t:3,y:'j',x:107},{t:6,y:'j',x:95,d:76},{t:8,y:'j',x:104},{t:9,y:'j',x:173,d:70},{t:12,y:'j',x:173},{t:17,y:'j',x:173}],
      [{t:0,y:'d',x:118},{t:1,y:'d',x:118},{t:2,y:'d',x:118},{t:4,y:'d',x:30,d:79},{t:5,y:'d',x:30,d:79},{t:6,y:'j',x:30,d:64},{t:8,y:'j',x:79},{t:17,y:'j',x:118},{t:18,y:'j',x:30}],
      [{t:0,y:'d',x:1095},{t:1,y:'j',x:1208,d:89},{t:2,y:'j',x:1208,d:60},{t:3,y:'j',x:1208,d:64},{t:5,y:'j',x:1127},{t:6,y:'j',x:1154},{t:13,y:'j',x:1095}],
      [{t:0,y:'d',x:1050},{t:2,y:'j',x:1158,d:60},{t:3,y:'j',x:1158,d:64},{t:4,y:'d',x:1158},{t:6,y:'j',x:1129},{t:7,y:'j',x:1050,d:70},{t:9,y:'j',x:1050,d:70},{t:11,y:'d',x:1050},{t:13,y:'j',x:1050},{t:18,y:'j',x:1050}],
      [{t:0,y:'d',x:1100},{t:1,y:'d',x:1208,d:66},{t:3,y:'j',x:1208,d:64},{t:4,y:'d',x:1100},{t:5,y:'d',x:1100},{t:7,y:'j',x:1100,d:70},{t:8,y:'j',x:1208},{t:11,y:'d',x:1100},{t:15,y:'j',x:1100},{t:17,y:'j',x:1208},{t:18,y:'j',x:1100}],
      [{t:0,y:'d',x:808,d:70},{t:8,y:'j',x:440},{t:9,y:'d',x:808,d:70},{t:10,y:'d',x:440,d:70},{t:11,y:'d',x:808,d:70},{t:12,y:'d',x:440,d:70},{t:13,y:'d',x:808,d:63},{t:14,y:'j',x:440},{t:15,y:'j',x:808},{t:16,y:'j',x:609},{t:17,y:'j',x:440},{t:18,y:'j',x:808}],
      [{t:0,y:'d',x:113},{t:1,y:'d',x:45},{t:2,y:'d',x:113},{t:3,y:'d',x:45},{t:4,y:'d',x:45,d:32},{t:5,y:'d',x:45,d:32},{t:6,y:'d',x:45,d:32},{t:12,y:'d',x:113},{t:14,y:'j',x:113},{t:17,y:'d',x:113}],
      [{t:0,y:'d',x:728,d:70},{t:5,y:'j',x:728},{t:7,y:'j',x:624,d:70},{t:10,y:'d',x:520,d:32},{t:11,y:'d',x:728},{t:12,y:'j',x:520,d:95},{t:13,y:'j',x:728,d:78}],
      [{t:0,y:'d',x:403},{t:1,y:'j',x:370},{t:2,y:'j',x:370},{t:9,y:'j',x:403,d:70},{t:12,y:'j',x:370}],
      [{t:0,y:'d',x:870},{t:4,y:'j',x:903},{t:5,y:'j',x:903},{t:9,y:'j',x:870,d:70},{t:13,y:'j',x:903}],
      [{t:0,y:'d',x:328,d:48},{t:1,y:'d',x:270},{t:2,y:'d',x:270},{t:3,y:'j',x:270},{t:7,y:'j',x:328,d:70},{t:8,y:'j',x:270},{t:10,y:'d',x:328},{t:14,y:'j',x:328},{t:17,y:'j',x:270}],
      [{t:0,y:'d',x:920,d:43},{t:3,y:'j',x:978,d:64},{t:4,y:'d',x:978},{t:5,y:'d',x:978},{t:6,y:'j',x:978},{t:7,y:'j',x:920,d:70},{t:11,y:'d',x:920},{t:15,y:'j',x:920},{t:18,y:'j',x:978}],
      [{t:0,y:'d',x:393},{t:2,y:'d',x:380},{t:7,y:'d',x:393,d:70},{t:9,y:'d',x:393,d:70},{t:10,y:'d',x:393},{t:12,y:'d',x:380},{t:16,y:'j',x:393}],
      [{t:0,y:'d',x:855},{t:4,y:'d',x:868},{t:5,y:'d',x:868},{t:7,y:'d',x:855,d:70},{t:9,y:'d',x:855,d:70},{t:11,y:'d',x:868},{t:13,y:'d',x:868},{t:16,y:'j',x:855}],
      [{t:0,y:'d',x:618},{t:7,y:'d',x:618,d:70},{t:9,y:'d',x:618,d:70},{t:10,y:'d',x:600},{t:11,y:'d',x:618}],
      [{t:0,y:'d',x:208,d:47},{t:1,y:'d',x:200},{t:2,y:'d',x:200},{t:3,y:'d',x:200},{t:7,y:'j',x:208,d:70},{t:8,y:'j',x:200},{t:10,y:'d',x:208},{t:12,y:'d',x:208},{t:14,y:'j',x:208}],
      [{t:0,y:'d',x:1040,d:8},{t:4,y:'d',x:1048},{t:5,y:'d',x:1048},{t:6,y:'d',x:1048},{t:7,y:'j',x:1040,d:70},{t:8,y:'j',x:1048},{t:11,y:'d',x:1040},{t:13,y:'d',x:1040},{t:15,y:'j',x:1040}],
    ],
    nextHop: [[-1,1,2,1,4,5,1,5,2,9,10,11,1,4,5,1,5,2,5],[0,-1,2,3,4,5,6,5,2,0,0,0,12,4,12,6,5,2,3],[0,1,-1,3,0,0,6,6,8,9,0,0,12,9,8,6,6,17,3],[0,1,2,-1,4,5,6,5,8,0,0,5,1,4,8,6,5,17,18],[0,1,2,3,-1,5,6,5,2,0,0,0,1,13,5,6,5,2,3],[0,0,2,3,4,-1,6,7,2,9,0,11,7,13,7,6,7,2,18],[0,1,0,3,4,5,-1,7,8,0,0,11,1,4,7,15,7,17,18],[0,12,12,8,13,13,8,-1,8,9,10,11,12,13,14,15,16,17,18],[0,1,2,3,4,5,6,5,-1,0,12,5,12,4,14,6,14,17,3],[0,0,0,5,0,5,5,7,7,-1,10,11,12,13,7,7,7,7,5],[0,1,2,1,0,0,1,9,2,9,-1,0,12,9,12,1,9,2,0],[0,0,0,4,4,5,4,5,0,9,0,-1,9,13,5,13,5,0,5],[0,1,2,3,0,0,1,7,8,0,10,0,-1,7,14,7,7,17,3],[0,0,0,3,4,5,6,7,3,0,0,11,7,-1,7,15,7,3,18],[0,2,2,2,0,0,2,7,2,9,10,7,12,7,-1,7,16,2,7],[0,0,0,4,4,5,4,7,7,9,7,11,7,13,7,-1,16,7,5],[0,0,0,7,0,0,7,7,7,9,10,11,7,7,7,7,-1,7,7],[0,1,2,3,3,3,1,7,8,0,10,0,12,7,14,7,7,-1,3],[0,6,0,4,4,5,6,7,8,0,0,11,7,13,7,15,7,6,-1]],
    safeHop: [[-1,1,2,1,4,5,4,5,2,9,10,11,1,4,1,4,1,2,5],[0,-1,2,3,0,0,0,12,2,0,12,0,12,0,12,3,12,2,3],[0,1,-1,3,0,0,0,12,8,9,12,0,12,0,8,3,8,17,3],[0,1,2,-1,0,0,18,17,8,0,17,0,1,18,8,18,8,17,18],[0,0,0,0,-1,5,6,5,6,0,6,0,0,13,6,6,6,6,5],[0,0,0,0,4,-1,6,7,6,9,6,11,0,13,6,6,6,6,18],[0,0,8,8,4,5,-1,7,8,0,17,11,8,4,8,15,15,17,18],[8,8,8,8,15,15,18,-1,8,9,14,15,8,15,14,15,16,17,18],[0,1,2,3,0,0,6,12,-1,0,12,0,12,3,14,3,14,17,3],[11,11,10,11,5,5,5,7,5,-1,10,11,10,11,10,11,11,5,5],[0,1,2,1,0,0,0,12,2,9,-1,0,12,0,12,0,12,2,0],[0,0,0,0,4,5,4,5,4,9,0,-1,0,13,0,13,13,4,5],[1,1,2,3,1,1,3,7,8,2,10,1,-1,3,14,3,14,17,3],[4,4,6,6,4,5,6,7,6,5,15,11,6,-1,6,15,15,6,18],[0,2,2,2,0,0,0,7,2,9,10,0,12,0,-1,0,16,2,2],[0,0,0,0,4,5,4,7,4,9,16,11,0,13,4,-1,16,4,5],[0,0,10,0,0,0,0,7,10,9,10,11,10,11,10,11,-1,10,0],[1,1,2,3,1,1,3,7,8,2,10,1,12,3,14,3,14,-1,3],[0,8,8,8,4,5,6,7,8,5,8,11,8,13,8,15,15,6,-1]],
  },
  // NAV-DATA-END
};
