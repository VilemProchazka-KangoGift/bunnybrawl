import type { ArenaPack } from '../types';
import type { Arena, Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { getFloatingPlatforms, pushFromPlayers, isLivePlayer } from '../../themes/utils';

const BUTTERFLY_HUES = [320, 60, 200, 290, 30, 160, 180, 40] as const;
const BUTTERFLY_COLORS = BUTTERFLY_HUES.map(h => `hsl(${h},80%,65%)`);
// Even-indexed butterflies render in background, odd-indexed in foreground.
const BEE_CLUSTERS = [
  { homeX: 320, homeY: 420, phase: 0 },
  { homeX: 980, homeY: 380, phase: 2.4 },
] as const;
// Dandelions: x position + ground y (where stem base sits).
const DANDELIONS = [
  { x: 180, gy: 655 },           // ground
  { x: 1180, gy: 655 },          // ground
  { x: 380, gy: 395 },           // atop floating platform y=400
  { x: 880, gy: 410 },           // atop floating platform y=415
] as const;
// Per-dandelion excitement (0..1), decays each frame, rises when a player is near.
const _dandelionExcite = new Float32Array(DANDELIONS.length);
let _lastDandelionTime = 0;
const DANDELION_SEED_COS = new Float32Array(14);
const DANDELION_SEED_SIN = new Float32Array(14);
{
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    DANDELION_SEED_COS[i] = Math.cos(a);
    DANDELION_SEED_SIN[i] = Math.sin(a);
  }
}

function drawButterfly(ctx: CanvasRenderingContext2D, i: number, time: number, players: ReadonlyArray<import('../../types').Player>, isBackground: boolean): void {
  const driftSpeed = 0.04 + (i % 3) * 0.015;
  const homeX = ((i * 200 + time * 60 * driftSpeed) % (CANVAS_WIDTH + 200)) - 100;
  // Background butterflies fly high in the sky (y=80..180) so they never enter
  // the platform region. Foreground butterflies fly low in the play area.
  const homeY = isBackground
    ? 90 + fastSin(time * 0.4 + i * 1.7) * 40 + (i % 3) * 18
    : 380 + fastSin(time * 0.4 + i * 1.7) * 80 + (i % 3) * 30;
  const flutterX = homeX + fastSin(time * 1.2 + i) * 22;
  const flutterY = homeY + fastSin(time * 1.5 + i * 1.7) * 14;
  // Background butterflies don't react to players (they're far away).
  const r = isBackground ? { x: flutterX, y: flutterY } : pushFromPlayers(players, flutterX, flutterY, 70, 14, 4);
  const flap = fastSin(time * 14 + i * 3) * 0.5 + 0.5;
  // Background butterflies are smaller (parallax distance).
  const scale = isBackground ? 0.65 : 1;
  ctx.fillStyle = BUTTERFLY_COLORS[i];
  ctx.beginPath();
  ctx.ellipse(r.x - 4 * scale, r.y, 4 * flap * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(r.x + 4 * scale, r.y, 4 * flap * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x - 0.5, r.y - 3 * scale, 1, 6 * scale);
}

function drawBeeCluster(ctx: CanvasRenderingContext2D, ci: number, time: number, players: ReadonlyArray<import('../../types').Player>, isBackground: boolean): void {
  const c = BEE_CLUSTERS[ci];
  const wanderX = c.homeX + fastSin(time * 0.25 + c.phase) * 200;
  // Background cluster stays in the sky.
  const wanderY = isBackground
    ? 130 + fastSin(time * 0.4 + c.phase + 1) * 30
    : c.homeY + fastSin(time * 0.4 + c.phase + 1) * 60;
  const r = isBackground ? { x: wanderX, y: wanderY } : pushFromPlayers(players, wanderX, wanderY, 110, 28, 8);
  for (let i = 0; i < 6; i++) {
    const ph = ci * 7 + i;
    const bx = r.x + fastSin(time * 4 + ph) * 18 + (i % 3 - 1) * 6;
    const by = r.y + fastCos(time * 3 + ph) * 12 + (Math.floor(i / 3) - 0.5) * 6;
    const wig = fastSin(time * 16 + ph) * 1.5;
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.ellipse(bx, by + wig, 3, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a08';
    ctx.fillRect(bx - 2, by + wig - 0.3, 1, 0.7);
    ctx.fillRect(bx, by + wig - 0.3, 1, 0.7);
  }
}
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft,
  drawFgBush, drawTallGrass, drawFern, drawHangingVine, drawFgLeafCluster, drawFgWildflower,
} from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, SKEW_RATIO, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  drawPlatformRightFace, drawPlatformCap,
  drawStone, wavyDown, backWavyUp, leftWavy,
} from '../../themes/drawPrimitives';

// Shared decoration data — hoisted so we don't realloc per bake.
const FOREST_TREE_POSITIONS = [
  0, 530, 30, 510, 55, 530, 80, 495, 110, 525, 140, 500,
  170, 520, 200, 490, 235, 515, 265, 485, 300, 510, 330, 495,
  365, 520, 395, 480, 430, 505, 460, 490, 500, 515, 535, 485,
  570, 510, 600, 475, 635, 500, 665, 490, 700, 510, 740, 480,
  775, 505, 810, 495, 845, 515, 880, 475, 920, 500, 955, 490,
  990, 510, 1025, 485, 1060, 505, 1095, 480, 1130, 500, 1165, 490,
  1200, 510, 1235, 485, 1270, 505, 1300, 520,
];
const FLOWER_COLORS = ['#FF6B8A', '#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
const STONE_PALETTE = [
  { base: '#8a8278', dark: '#5a5450', light: '#b0a89c' },
  { base: '#706860', dark: '#3a3430', light: '#9a9288' },
  { base: '#9a9080', dark: '#6a6258', light: '#c0b8a8' },
  { base: '#787068', dark: '#484038', light: '#a89888' },
];

function drawMeadowStump(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = platform.y + CAP_DEPTH / 2;
  const cB = platform.y - CAP_DEPTH / 2;
  const bodyTop = cF;
  const bodyH = platform.height;
  const sp = CAP_DEPTH * SKEW_RATIO;

  // Stump body extends past collision bottom to visually meet the host platform's cap front.
  drawPlatformRightFace(ctx, platform, '#2a1608', bodyTop + bodyH);

  // Left-edge profile — 1-2 outward burls (knots/thickenings) so the silhouette
  // doesn't read as a straight saw-cut. Cosine-falloff bulges, max ~5px outward.
  const burlCount = 1 + Math.floor(rng() * 2);
  const burls: Array<{ ty: number; depth: number; spread: number }> = [];
  for (let i = 0; i < burlCount; i++) {
    burls.push({
      ty: 0.15 + (i + rng() * 0.5) / burlCount * 0.75,
      depth: 2.5 + rng() * 3,
      spread: 0.1 + rng() * 0.08,
    });
  }
  const leftSteps = Math.max(8, Math.floor(bodyH / 3));
  const leftPts: Array<{ x: number; y: number }> = [];
  for (let s = 0; s <= leftSteps; s++) {
    const t = s / leftSteps;
    let dx = 0;
    for (const b of burls) {
      const dist = Math.abs(t - b.ty);
      if (dist < b.spread * 2) {
        dx -= b.depth * Math.cos(Math.min(1, dist / b.spread) * Math.PI / 2);
      }
    }
    leftPts.push({ x: platform.x + dx, y: bodyTop + t * bodyH });
  }

  const traceBodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(platform.x + platform.width, bodyTop);
    ctx.lineTo(leftPts[0].x, leftPts[0].y);
    for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
    ctx.lineTo(platform.x + platform.width, bodyTop + bodyH);
    ctx.closePath();
  };

  // Body front — bark: warm brown gradient with vertical ridges
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#6a4a28');
  g.addColorStop(0.5, '#4a3218');
  g.addColorStop(1, '#2a1a0a');
  ctx.fillStyle = g;
  traceBodyPath();
  ctx.fill();

  // Bark ridges + bottom bevel — clip to body silhouette so they don't escape past burls.
  ctx.save();
  traceBodyPath();
  ctx.clip();

  const ridgeN = Math.max(3, Math.floor(platform.width / 7));
  for (let i = 0; i < ridgeN; i++) {
    const bx = platform.x + (i + 0.5) / ridgeN * platform.width + Math.sin(i * 3.7 + rng() * 2) * 1.5;
    const d = (0.6 + rng() * 0.7) * 0.55;
    ctx.strokeStyle = `rgba(25,15,6,${d})`;
    ctx.lineWidth = 1 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, bodyTop);
    for (let py = 0; py <= bodyH; py += 3) {
      ctx.lineTo(bx + Math.sin(py * 0.35 + i * 1.2) * 1.2 + Math.sin(py * 0.12) * 0.6, bodyTop + py);
    }
    ctx.stroke();
  }

  // Body bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(platform.x - 6, bodyTop + bodyH - 4, platform.width + 6, 4);

  ctx.restore();

  // Edge profiles — gentle wavy for natural rough-cut stump top
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 3, ampMin: 1.5, ampMax: 3, valleyBase: 0.3 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 1.5, ampMax: 2.8 });
  // `leftPts` is taken by the body burl path above; this one is the cap edge.
  const capLeftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1, ampMax: 2 });

  // Cap — wood with concentric tree-ring ellipses
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#9a6e3c',
    capLight: 'rgba(255,220,160,0.2)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      // Center of the cap parallelogram (for ring centering)
      const cx = platform.x + platform.width / 2 + skew / 4;
      const cy = (capFront + capBack) / 2;
      // Tree rings — concentric ellipses matching the cap's aspect
      const rxMax = platform.width * 0.4;
      const ryMax = CAP_DEPTH * 0.38;
      const ringCount = 4;
      for (let i = ringCount; i >= 1; i--) {
        const t = i / ringCount;
        ctx2.strokeStyle = `rgba(60,36,14,${0.45 + (1 - t) * 0.25})`;
        ctx2.lineWidth = 0.8;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy, rxMax * t, ryMax * t, 0, 0, Math.PI * 2);
        ctx2.stroke();
      }
      // Small center pith dot
      ctx2.fillStyle = '#3a2410';
      ctx2.beginPath();
      ctx2.ellipse(cx, cy, 1.2, 0.8, 0, 0, Math.PI * 2);
      ctx2.fill();
    },
  }, capLeftPts);
}

export const meadow: ArenaPack = {
  // ---- Identity ----
  id: 'meadow',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #4A90D9 0%, #87CEEB 60%, #4a8c3f 100%)',
  previewIcon: '\u{1F33F}',

  // ---- Translations ----
  translations: { en: 'Meadow', cs: 'Louka', hi: '\u0918\u093E\u0938 \u0915\u093E \u092E\u0948\u0926\u093E\u0928', fil: 'Damuhan' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    { x: 90, y: 520, width: 160, height: 24 },
    { x: 990, y: 535, width: 200, height: 24 },
    { x: 280, y: 400, width: 200, height: 24 },
    { x: 760, y: 415, width: 240, height: 24 },
    { x: 540, y: 480, width: 200, height: 24 },
    { x: 490, y: 290, width: 300, height: 24 },
    { x: 110, y: 330, width: 120, height: 24 },
    { x: 1010, y: 345, width: 160, height: 24 },
    { x: 340, y: 615, width: 55, height: 45, style: 'stump' },
    { x: 860, y: 615, width: 55, height: 45, style: 'stump' },
    { x: 440, y: 360, width: 45, height: 40, style: 'stump' },
    { x: 800, y: 375, width: 45, height: 40, style: 'stump' },
  ] as Platform[], p => p.style !== 'stump'),
  spawnPoints: [
    { x: 170, y: 500 }, { x: 1090, y: 515 },
    { x: 380, y: 380 }, { x: 870, y: 395 },
    { x: 640, y: 270 }, { x: 640, y: 640 },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#4A90D9' },
      { offset: 0.6, color: '#87CEEB' },
      { offset: 1, color: '#B0E0E6' },
    ],
  },

  hills: [
    { x: 0, baseY: 620, width: 300, height: 120, color: '#5C9E4C' },
    { x: 250, baseY: 630, width: 400, height: 100, color: '#5C9E4C' },
    { x: 600, baseY: 620, width: 350, height: 130, color: '#5C9E4C' },
    { x: 900, baseY: 635, width: 400, height: 100, color: '#5C9E4C' },
  ],

  ground: {
    surfaceColor: '#6BBF59',
    surfaceThickness: 4,
    grassBlades: {
      color: '#5DAF4A',
      spacing: 15,
      heightRange: [6, 10],
    },
  },

  platform: {
    floatingBodyColor: '#6B4E1B',
    floatingTopColor: '#8B6914',
    floatingAccentColor: '#6BBF59',
    groundBodyColor: '#5C3A1E',
    groundTopColor: '#4a8c3f',
    drawMoss: true,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 5,
    color: 'rgba(255, 255, 255, 0.7)',
    minSize: 50,
    maxSize: 85,
    minSpeed: 6,
    maxSpeed: 12,
    yRange: [40, 100],
  },

  weather: {
    particleCount: 30,
    types: [
      { type: 'leaf', weight: 0.6, sizeRange: [3, 6], vxRange: [10, 30], vyRange: [15, 35], rotSpeedRange: [1, 3] },
      { type: 'petal', weight: 0.4, sizeRange: [2, 4], vxRange: [-20, 20], vyRange: [10, 25], rotSpeedRange: [2, 5] },
    ],
  },

  wildlife: {
    count: 5,
    types: [
      { type: 'butterfly', weight: 0.7, colors: ['#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'], speedRange: [15, 30], yRange: [0.2, 0.8] },
      { type: 'bird', weight: 0.3, colors: ['#333', '#555', '#4A4A4A'], speedRange: [40, 80], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 20,
    baseY: 660,
    yVariance: 10,
    speedRange: [3, 8],
    alphaRange: [0.1, 0.25],
    color: '#FFFFFF',
    sizeX: 40,
    sizeY: 8,
  },

  ambientParticles: {
    count: 12,
    sizeRange: [1, 2.5],
    vxRange: [-3, 3],
    vyRange: [-8, -20],
    alphaRange: [0.2, 0.5],
    colors: ['#FFF8DC', '#FFFFF0'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: 120,
    maxNightAlpha: 0.6,
    showFireflies: true,
    showShootingStars: true,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx: CanvasRenderingContext2D, _arena: Arena) => {
    // Dark treeline — jagged tops suggesting a dense forest
    ctx.fillStyle = 'rgba(58,106,58,0.25)';
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    for (let i = 0; i < FOREST_TREE_POSITIONS.length; i += 2) {
      ctx.lineTo(FOREST_TREE_POSITIONS[i], FOREST_TREE_POSITIONS[i + 1]);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Lighter layer in front — slightly higher, more detail
    ctx.fillStyle = 'rgba(74,122,74,0.18)';
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    for (let i = 0; i < FOREST_TREE_POSITIONS.length; i += 2) {
      ctx.lineTo(FOREST_TREE_POSITIONS[i] + 15, FOREST_TREE_POSITIONS[i + 1] + 25);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();
  },

  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Trees
    drawTree(ctx, 60, y, 50);
    drawTree(ctx, 620, y, 60);
    drawTree(ctx, 1180, y, 45);

    // Bushes
    drawBush(ctx, 200, y, 30);
    drawBush(ctx, 450, y, 22);
    drawBush(ctx, 700, y, 28);
    drawBush(ctx, 950, y, 25);
    drawBush(ctx, 1100, y, 20);

    // Flowers
    const flowerPositions = [150, 280, 420, 500, 580, 750, 930, 980, 1050, 1200];
    for (const fx of flowerPositions) {
      const color = FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length];
      drawFlower(ctx, fx, y, color);
    }

    // Mushrooms (avoid stump positions at x=340, 440, 800, 860)
    drawMushroom(ctx, 240, y);
    drawMushroom(ctx, 720, y);

    // Nature on floating platforms (exclude small obstacle platforms)
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      const mid = plat.x + plat.width / 2;
      if (plat.width > 180) {
        drawBush(ctx, mid - 30, plat.y, 15);
        drawFlower(ctx, plat.x + 20, plat.y, '#FFD700');
        drawFlower(ctx, plat.x + plat.width - 25, plat.y, '#FF69B4');
        drawGrassTuft(ctx, plat.x + 10, plat.y);
        drawGrassTuft(ctx, plat.x + plat.width - 15, plat.y);
      } else {
        drawFlower(ctx, mid - 10, plat.y, '#DDA0DD');
        drawGrassTuft(ctx, plat.x + 8, plat.y);
      }
    }
  },

  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground bushes (avoid stump positions at x=340, x=860)
    drawFgBush(ctx, 160, gy, 60);
    drawFgBush(ctx, 520, gy, 52);
    drawFgBush(ctx, 1000, gy, 55);
    drawFgBush(ctx, 1120, gy, 48);

    // Tall grass clusters
    drawTallGrass(ctx, 310, gy, 7);
    drawTallGrass(ctx, 680, gy, 9);
    drawTallGrass(ctx, 1020, gy, 6);
    drawTallGrass(ctx, 430, gy, 5);

    // Ferns
    drawFern(ctx, 80, gy);
    drawFern(ctx, 770, gy);
    drawFern(ctx, 1220, gy);

    // Bushes + vines on floating platforms (exclude stumps — width < 70)
    const floats = getFloatingPlatforms(arena.platforms);
    for (let pi = 0; pi < floats.length; pi++) {
      const plat = floats[pi];
      if (plat.width > 180) {
        drawFgBush(ctx, plat.x + plat.width * 0.15, plat.y, pi % 2 === 0 ? 45 : 18);
        drawFgBush(ctx, plat.x + plat.width * 0.85, plat.y, pi % 2 === 0 ? 18 : 42);
        drawHangingVine(ctx, plat.x + 15, plat.y + plat.height, 25);
        drawHangingVine(ctx, plat.x + plat.width - 15, plat.y + plat.height, 20);
        drawFgLeafCluster(ctx, plat.x + plat.width / 2, plat.y);
      } else {
        drawFgBush(ctx, plat.x + plat.width * 0.5, plat.y, pi % 3 === 0 ? 38 : 16);
        drawHangingVine(ctx, plat.x + plat.width / 2, plat.y + plat.height, 18);
      }
    }

    // Foreground wildflowers
    drawFgWildflower(ctx, 240, gy, '#FF6B8A', 18);
    drawFgWildflower(ctx, 580, gy, '#DDA0DD', 20);
    drawFgWildflower(ctx, 930, gy, '#FFD700', 16);
    drawFgWildflower(ctx, 1180, gy, '#FF69B4', 22);
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    if (platform.style === 'stump') {
      drawMeadowStump(ctx, platform);
      return;
    }

    const rng = mulberry32(seedFor(platform.x, platform.y));
    const cF = platform.y + CAP_DEPTH / 2;
    const cB = platform.y - CAP_DEPTH / 2;
    const bodyTop = cF;
    const bodyH = platform.height - CAP_DEPTH / 2;
    const sp = CAP_DEPTH * SKEW_RATIO;

    // Right face — dark dirt tone
    drawPlatformRightFace(ctx, platform, '#1e130a');

    // Left-side decoration: one stone + a few root tendrils (extends LEFT of
    // platform.x, doesn't overlap player when player is inside body region)
    const stoneRx = 3.5 + rng() * 1.8;
    const stoneRy = stoneRx * (0.75 + rng() * 0.15);
    const stoneCy = bodyTop + 5 + rng() * Math.max(4, (bodyH - 14) * 0.4);
    const stoneCx = platform.x - stoneRx * 0.3;
    const stoneAngle = (rng() - 0.5) * 0.6;
    const stonePick = STONE_PALETTE[Math.floor(rng() * STONE_PALETTE.length)];
    drawStone(ctx, stoneCx, stoneCy, stoneRx, stoneRy, stoneAngle, stonePick.base, stonePick.dark, stonePick.light);

    // Root tendrils — thin dark-brown curves extending down/left from below the stone
    const rootN = 2 + Math.floor(rng() * 2);
    ctx.strokeStyle = '#2e1a08';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < rootN; i++) {
      const ry0 = stoneCy + stoneRy + 1 + i * 3 + rng() * 2;
      const rootLen = 5 + rng() * 6;
      const curl = (rng() - 0.5) * 3;
      ctx.beginPath();
      ctx.moveTo(platform.x + 0.5, ry0);
      ctx.quadraticCurveTo(
        platform.x - rootLen * 0.45 + curl, ry0 + rootLen * 0.55,
        platform.x - rootLen * 0.15, ry0 + rootLen
      );
      ctx.stroke();
    }

    // Edge profiles
    const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 5, ampMin: 2, ampMax: 4, valleyBase: 0.3 });
    const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 4, ampMin: 2, ampMax: 3.5 });
    const leftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1.5, ampMax: 3 });

    // Cap — grass with tufted dots
    drawPlatformCap(ctx, platform, frontPts, backPts, {
      capColor: '#5a8f3a',
      capLight: 'rgba(255,255,220,0.15)',
      drawCapTexture: (ctx2, capFront, _capBack, skew) => {
        ctx2.fillStyle = '#4a7a2e';
        const n = Math.floor(platform.width / 7);
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n + Math.sin(i * 2.3 + platform.x * 0.01) * 0.04;
          const v = 0.15 + (Math.sin(i * 7.1 + platform.x * 0.02) + 1) * 0.35;
          ctx2.beginPath();
          ctx2.arc(platform.x + u * platform.width + v * skew, capFront - v * CAP_DEPTH, 0.85, 0, Math.PI * 2);
          ctx2.fill();
        }
      },
    }, leftPts);
  },

  // Body face overlay — drawn AFTER players so a player rising up next to or
  // through a platform's body is occluded ("goes behind the platform").
  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    if (platform.style === 'stump') return;
    const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
    const cF = platform.y + CAP_DEPTH / 2;
    const bodyTop = cF;
    const bodyH = platform.height - CAP_DEPTH / 2;

    // Body front face — soil gradient
    const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
    g.addColorStop(0, '#5a3a20');
    g.addColorStop(0.5, '#4a2e18');
    g.addColorStop(1, '#2e1e10');
    ctx.fillStyle = g;
    ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);
    // Dirt clumps
    ctx.fillStyle = 'rgba(20,10,5,0.45)';
    const clumpCount = Math.floor(platform.width / 12);
    for (let i = 0; i < clumpCount; i++) {
      const px = platform.x + rng() * platform.width;
      const py = bodyTop + 3 + rng() * (bodyH - 5);
      ctx.beginPath();
      ctx.ellipse(px, py, 2 + rng() * 1.5, 1.2 + rng() * 0.8, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pebbles
    ctx.fillStyle = 'rgba(180,160,140,0.6)';
    const pebbleCount = Math.floor(platform.width / 25);
    for (let i = 0; i < pebbleCount; i++) {
      ctx.beginPath();
      ctx.ellipse(platform.x + rng() * platform.width, bodyTop + 4 + rng() * (bodyH - 6), 1.4, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body bottom bevel — dark strip at the bottom of the front face
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);
  },

  drawAnimatedBackground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice() || !matchState) return;
    ctx.save();
    const players = matchState.players;
    // Even-indexed butterflies fly high in the SKY (true background — never
    // enter platform area). Odd-indexed render in foreground.
    for (let i = 0; i < BUTTERFLY_HUES.length; i += 2) drawButterfly(ctx, i, time, players, true);
    drawBeeCluster(ctx, 0, time, players, true);
    // Dandelions: trigger lifecycle. When a player enters the trigger radius
    // and the puff is intact, kick off a burst — seeds fly outward over ~2s,
    // puff regrows over the next ~5s.
    const dt = Math.max(0, Math.min(0.1, time - _lastDandelionTime));
    _lastDandelionTime = time;
    for (let di = 0; di < DANDELIONS.length; di++) {
      const d = DANDELIONS[di];
      let nearest = Infinity;
      for (const p of players) {
        if (!isLivePlayer(p)) continue;
        const dx = (p.x + p.width * 0.5) - d.x;
        const dy = (p.y + p.height) - d.gy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) nearest = d2;
      }
      const playerNear = nearest < 40 * 40;
      // _dandelionExcite[i] holds the burst-elapsed time (-1 = idle/full puff).
      // When idle and player approaches → set to 0 (begin burst).
      // While bursting, accumulates dt up to BURST_TOTAL = 7s, then resets to -1.
      const BURST_TOTAL = 7.0;
      const SEED_FLY_DURATION = 2.0;
      let phase = _dandelionExcite[di];
      if (phase < 0 && playerNear) phase = 0;
      if (phase >= 0) {
        phase += dt;
        if (phase >= BURST_TOTAL) phase = -1;
      }
      _dandelionExcite[di] = phase;
      const puffY = d.gy - 9;
      // Stem (always visible)
      ctx.strokeStyle = '#5fb45a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(d.x, d.gy + 4);
      ctx.lineTo(d.x, d.gy - 8);
      ctx.stroke();
      // Puff sphere: full size when idle, 0 immediately on burst, regrows
      // gradually after seeds fly off.
      let puffR = 6;
      if (phase >= 0) {
        if (phase < SEED_FLY_DURATION) {
          // Burst: shrink quickly to 0 over first 0.3s.
          puffR = 6 * Math.max(0, 1 - phase / 0.3);
        } else {
          // Regrow over remaining (BURST_TOTAL - SEED_FLY_DURATION) seconds.
          const regrow = (phase - SEED_FLY_DURATION) / (BURST_TOTAL - SEED_FLY_DURATION);
          puffR = 6 * Math.min(1, regrow);
        }
      }
      if (puffR > 0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(d.x, puffY, puffR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#dcdcc8';
        ctx.globalAlpha = 0.75;
        for (let i = 0; i < 6; i++) {
          const c = DANDELION_SEED_COS[i * 2];
          const s = DANDELION_SEED_SIN[i * 2];
          ctx.beginPath();
          ctx.arc(d.x + c * puffR * 0.7, puffY + s * puffR * 0.7, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Flying seeds: present only during burst (0..SEED_FLY_DURATION).
      if (phase >= 0 && phase < SEED_FLY_DURATION) {
        const t = phase / SEED_FLY_DURATION;
        const SEEDS = 12;
        ctx.fillStyle = '#f8f8e8';
        for (let i = 0; i < SEEDS; i++) {
          // Each seed has its own emit time so they fan out gradually.
          const emitT = i / SEEDS * 0.3;
          const localT = (t - emitT) / (1 - emitT);
          if (localT <= 0) continue;
          const angle = (i / SEEDS) * Math.PI * 2 + fastSin(time + i) * 0.2;
          const dist = localT * 60;
          const sx = d.x + fastCos(angle) * dist + fastSin(time * 1.5 + i) * 2;
          const sy = puffY - localT * 50 - localT * localT * 12 + fastSin(time + i) * 1.5;
          const alpha = (1 - localT) * 0.95;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
          ctx.fill();
          // Parachute tuft
          ctx.globalAlpha = alpha * 0.6;
          ctx.beginPath();
          ctx.arc(sx, sy - 2.5, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },

  drawAnimatedForeground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice() || !matchState) return;
    ctx.save();
    const players = matchState.players;
    // Odd-indexed butterflies in foreground (low-flying, react to players).
    for (let i = 1; i < BUTTERFLY_HUES.length; i += 2) drawButterfly(ctx, i, time, players, false);
    drawBeeCluster(ctx, 1, time, players, false);
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [5, 15] }],
  },

  scatterFlockConfigs: [
    {
      species: 'bird',
      positions: [
        { x: 380, y: 398 },
        { x: 640, y: 288 },
        { x: 880, y: 413 },
      ],
      radius: 120,
      respawnTime: 8,
    },
  ],

  musicFile: 'meadow.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:154},{t:2,y:'j',x:1074},{t:9,y:'j',x:352},{t:10,y:'j',x:872}],
      [{t:0,y:'d',x:218},{t:3,y:'j',x:218},{t:5,y:'j',x:218},{t:9,y:'d',x:218},{t:11,y:'j',x:218}],
      [{t:0,y:'d',x:990},{t:1,y:'j',x:1158},{t:4,y:'j',x:990},{t:5,y:'j',x:990},{t:10,y:'d',x:990},{t:12,y:'j',x:990}],
      [{t:0,y:'d',x:448},{t:1,y:'d',x:280},{t:5,y:'d',x:448},{t:6,y:'j',x:448},{t:7,y:'j',x:280},{t:9,y:'d',x:280},{t:11,y:'j',x:444}],
      [{t:0,y:'d',x:760},{t:2,y:'d',x:968},{t:3,y:'j',x:760},{t:5,y:'d',x:760},{t:6,y:'j',x:760},{t:8,y:'j',x:968},{t:10,y:'d',x:968},{t:11,y:'j',x:760},{t:12,y:'j',x:807}],
      [{t:0,y:'d',x:708},{t:3,y:'j',x:540},{t:4,y:'j',x:708},{t:9,y:'d',x:540},{t:10,y:'d',x:708},{t:11,y:'j',x:540},{t:12,y:'j',x:708}],
      [{t:0,y:'d',x:758},{t:2,y:'d',x:758},{t:3,y:'d',x:490},{t:4,y:'d',x:758},{t:5,y:'d',x:758},{t:9,y:'d',x:490},{t:10,y:'d',x:758},{t:11,y:'d',x:490},{t:12,y:'d',x:758}],
      [{t:0,y:'d',x:198},{t:1,y:'d',x:198},{t:3,y:'d',x:198},{t:6,y:'j',x:198},{t:9,y:'d',x:198}],
      [{t:0,y:'d',x:1010},{t:2,y:'d',x:1138},{t:4,y:'d',x:1010},{t:6,y:'j',x:1010},{t:7,y:'j',x:1138},{t:10,y:'d',x:1010}],
      [{t:0,y:'d',x:363},{t:1,y:'j',x:340},{t:5,y:'j',x:363}],
      [{t:0,y:'d',x:860},{t:2,y:'j',x:883},{t:5,y:'j',x:860}],
      [{t:0,y:'d',x:453},{t:3,y:'d',x:440},{t:5,y:'d',x:453},{t:6,y:'j',x:453},{t:7,y:'j',x:440},{t:9,y:'d',x:440}],
      [{t:0,y:'d',x:800},{t:2,y:'d',x:813},{t:4,y:'d',x:813},{t:5,y:'d',x:800},{t:6,y:'j',x:800},{t:8,y:'j',x:813},{t:10,y:'d',x:813}],
    ],
    nextHop: [[-1,1,2,1,2,1,1,1,2,9,10,1,2],[0,-1,0,3,5,5,3,3,5,9,0,11,5],[0,1,-1,1,4,5,4,1,4,0,10,1,12],[0,1,0,-1,5,5,6,7,5,9,5,11,5],[0,0,2,3,-1,5,6,3,8,5,10,11,12],[0,0,0,3,4,-1,3,3,4,9,10,11,12],[0,3,2,3,4,5,-1,3,4,9,10,11,12],[0,1,0,3,6,3,6,-1,6,9,0,1,6],[0,0,2,4,4,4,6,7,-1,0,10,4,2],[0,1,0,1,5,5,1,1,5,-1,0,1,5],[0,0,2,5,2,5,2,5,2,0,-1,5,2],[0,3,0,3,5,5,6,7,5,9,5,-1,5],[0,0,2,4,4,5,6,8,8,5,10,4,-1]],
    safeHop: [[-1,1,2,1,2,1,1,1,2,9,10,1,2],[0,-1,0,3,5,5,3,3,5,9,0,11,5],[0,1,-1,1,4,5,4,1,4,0,10,1,12],[0,1,0,-1,5,5,6,7,5,9,5,11,5],[0,0,2,3,-1,5,6,3,8,5,10,11,12],[0,0,0,3,4,-1,3,3,4,9,10,11,12],[0,3,2,3,4,5,-1,3,4,9,10,11,12],[0,1,0,3,6,3,6,-1,6,9,0,1,6],[0,0,2,4,4,4,6,7,-1,0,10,4,2],[0,1,0,1,5,5,1,1,5,-1,0,1,5],[0,0,2,5,2,5,2,5,2,0,-1,5,2],[0,3,0,3,5,5,6,7,5,9,5,-1,5],[0,0,2,4,4,5,6,8,8,5,10,4,-1]],
  },
  // NAV-DATA-END
};
