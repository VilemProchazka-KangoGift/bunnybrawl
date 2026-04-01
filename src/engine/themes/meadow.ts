import type { ThemeConfig } from './types';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawTreeStump,
  drawFgBush, drawTallGrass, drawFern, drawHangingVine, drawFgLeafCluster, drawFgWildflower,
} from './drawPrimitives';

export const MEADOW_THEME: ThemeConfig = {
  id: 'meadow',
  nameKey: 'arena_meadow',
  previewGradient: 'linear-gradient(to bottom, #4A90D9 0%, #87CEEB 60%, #4a8c3f 100%)',
  previewIcon: '🌿',

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

  windConfig: {
    interval: [18, 30],
    buildDuration: 3,
    peakDuration: 4,
    fadeDuration: 3,
    maxStrength: 250,
  },

  drawFarBackground: (ctx, _arena) => {
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

  drawBackgroundNature: (ctx, arena) => {
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

    // Tree stumps — solid obstacles matching platforms
    drawTreeStump(ctx, 340, 615, 55, 45);
    drawTreeStump(ctx, 860, 615, 55, 45);
    // Platform stumps (on mid-left and mid-right)
    drawTreeStump(ctx, 440, 370, 45, 40);
    drawTreeStump(ctx, 800, 370, 45, 40);

    // Nature on floating platforms (exclude small obstacle platforms)
    const floats = arena.platforms.filter(p => p.y < 650 && p.width >= 80);
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

  drawForegroundNature: (ctx, arena) => {
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
    const floats = arena.platforms.filter(p => p.y < 650 && p.width >= 70);
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
};
