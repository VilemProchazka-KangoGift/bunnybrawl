import type { ArenaPack } from '../types';
import type { Arena, Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { getFloatingPlatforms } from '../../themes/utils';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft,
  drawFgBush, drawTallGrass, drawFern, drawHangingVine, drawFgLeafCluster, drawFgWildflower,
} from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, SKEW_RATIO, mulberry32, seedFor,
  drawPlatformRightFace, drawPlatformCap,
  drawStone, wavyDown, backWavyUp,
} from '../../themes/drawPrimitives';

function drawMeadowStump(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = platform.y + CAP_DEPTH / 2;
  const cB = platform.y - CAP_DEPTH / 2;
  const bodyTop = cF;
  const bodyH = platform.height;  // extends CAP_DEPTH/2 past collision bottom to meet host's cap front
  const sp = CAP_DEPTH * SKEW_RATIO;

  // Right face — inlined so it extends down to match the stump body
  // (which visually sits on the host platform's cap front, not its own collision bottom)
  const stumpSp = CAP_DEPTH * SKEW_RATIO;
  const stumpBodyBottom = bodyTop + bodyH;
  ctx.fillStyle = '#2a1608';
  ctx.beginPath();
  ctx.moveTo(platform.x + platform.width, bodyTop);
  ctx.lineTo(platform.x + platform.width + stumpSp, bodyTop - CAP_DEPTH);
  ctx.lineTo(platform.x + platform.width + stumpSp, stumpBodyBottom - CAP_DEPTH);
  ctx.lineTo(platform.x + platform.width, stumpBodyBottom);
  ctx.closePath();
  ctx.fill();

  // Body front — bark: warm brown gradient with vertical ridges
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#6a4a28');
  g.addColorStop(0.5, '#4a3218');
  g.addColorStop(1, '#2a1a0a');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Vertical bark ridges
  ctx.save();
  ctx.globalAlpha = 0.55;
  const ridgeN = Math.max(3, Math.floor(platform.width / 7));
  for (let i = 0; i < ridgeN; i++) {
    const bx = platform.x + (i + 0.5) / ridgeN * platform.width + Math.sin(i * 3.7 + rng() * 2) * 1.5;
    const d = 0.6 + rng() * 0.7;
    ctx.strokeStyle = `rgba(25,15,6,${d})`;
    ctx.lineWidth = 1 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, bodyTop);
    for (let py = 0; py <= bodyH; py += 3) {
      ctx.lineTo(bx + Math.sin(py * 0.35 + i * 1.2) * 1.2 + Math.sin(py * 0.12) * 0.6, bodyTop + py);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Body bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);

  // Edge profiles — gentle wavy for natural rough-cut stump top
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 3, ampMin: 1.5, ampMax: 3, valleyBase: 0.3 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 1.5, ampMax: 2.8 });

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
  });
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
  platforms: [
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
  ],
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
    // Distant forest treeline behind the hills
    ctx.save();
    ctx.globalAlpha = 0.25;

    // Dark treeline — jagged tops suggesting a dense forest
    ctx.fillStyle = '#3A6A3A';
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    // Generate a forest silhouette with varying tree heights
    const treePositions = [
      0, 530, 30, 510, 55, 530, 80, 495, 110, 525, 140, 500,
      170, 520, 200, 490, 235, 515, 265, 485, 300, 510, 330, 495,
      365, 520, 395, 480, 430, 505, 460, 490, 500, 515, 535, 485,
      570, 510, 600, 475, 635, 500, 665, 490, 700, 510, 740, 480,
      775, 505, 810, 495, 845, 515, 880, 475, 920, 500, 955, 490,
      990, 510, 1025, 485, 1060, 505, 1095, 480, 1130, 500, 1165, 490,
      1200, 510, 1235, 485, 1270, 505, 1300, 520,
    ];
    for (let i = 0; i < treePositions.length; i += 2) {
      ctx.lineTo(treePositions[i], treePositions[i + 1]);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Lighter layer in front — slightly higher, more detail
    ctx.fillStyle = '#4A7A4A';
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    for (let i = 0; i < treePositions.length; i += 2) {
      ctx.lineTo(treePositions[i] + 15, treePositions[i + 1] + 25);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
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
    const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
    const flowerPositions = [150, 280, 420, 500, 580, 750, 930, 980, 1050, 1200];
    for (const fx of flowerPositions) {
      const color = flowerColors[Math.floor(fx * 0.01) % flowerColors.length];
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

    // Left-side decoration: one stone + a few root tendrils
    const stonePalette = [
      { base: '#8a8278', dark: '#5a5450', light: '#b0a89c' },
      { base: '#706860', dark: '#3a3430', light: '#9a9288' },
      { base: '#9a9080', dark: '#6a6258', light: '#c0b8a8' },
      { base: '#787068', dark: '#484038', light: '#a89888' },
    ];
    const stoneRx = 3.5 + rng() * 1.8;
    const stoneRy = stoneRx * (0.75 + rng() * 0.15);
    const stoneCy = bodyTop + 5 + rng() * Math.max(4, (bodyH - 14) * 0.4);
    const stoneCx = platform.x - stoneRx * 0.3;
    const stoneAngle = (rng() - 0.5) * 0.6;
    const stonePick = stonePalette[Math.floor(rng() * stonePalette.length)];
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

    // Body front face — soil gradient with clumps, pebbles, one exposed root
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

    // Edge profiles
    const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 5, ampMin: 2, ampMax: 4, valleyBase: 0.3 });
    const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 4, ampMin: 2, ampMax: 3.5 });

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
    });
  },

  // ---- Audio ----
  ambientSoundConfig: {
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [5, 15] }],
  },
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
