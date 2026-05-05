import type { ArenaPack } from '../types';
import type { Arena, Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft,
} from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, SKEW_RATIO, applyIsoInsets, mulberry32, seedFor,
  drawPlatformRightFace, drawPlatformCap,
  subtleDown, backIso, leftIso,
} from '../../themes/drawPrimitives';
import {
  GROUND_Y, WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT, LOBBY_DAY_CYCLE,
  FLOWER_COLORS, FLOWER_POSITIONS,
} from '../../lobbyConstants';

const LOBBY_TREELINE = [
  0, -70, 40, -50, 80, -75, 120, -45, 160, -65, 200, -55,
  250, -80, 300, -50, 350, -70, 400, -45, 450, -60, 500, -75,
  550, -50, 600, -80, 650, -55, 700, -65, 750, -50, 800, -70,
  850, -55, 900, -75, 950, -45, 1000, -65, 1050, -55, 1100, -80,
  1150, -50, 1200, -70, 1250, -55, 1300, -65,
];

function drawLobbyGround(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = platform.y + CAP_DEPTH / 2;
  const cB = platform.y - CAP_DEPTH / 2;
  const sp = CAP_DEPTH * SKEW_RATIO;
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Visual extension: the ground reaches the left canvas edge (platform.x = 0),
  // so the cap's left iso diagonal (front-left → back-left, slope sp px wide)
  // would be visible at x=0. Shift the visual by `sp` so the diagonal sits in
  // negative-x space. Collision still uses platform.x; only the cap polygon
  // and body fill extend leftward.
  const visX = platform.x - sp;
  const visW = platform.width + sp;
  const visPlatform: Platform = { ...platform, x: visX, width: visW };

  // Body — green earth gradient, fading darker toward the bottom of the canvas.
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  bodyGrad.addColorStop(0, '#4A7C3F');
  bodyGrad.addColorStop(0.3, '#3D6B35');
  bodyGrad.addColorStop(1, '#2D5025');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(visX, bodyTop, visW, bodyH);

  // Subtle dark dirt clumps so the body isn't flat
  ctx.fillStyle = 'rgba(20,40,20,0.25)';
  const clumpN = Math.floor(platform.width / 35);
  for (let i = 0; i < clumpN; i++) {
    const px = platform.x + rng() * platform.width;
    const py = bodyTop + 4 + rng() * (bodyH - 8);
    ctx.beginPath();
    ctx.ellipse(px, py, 3 + rng() * 2, 1 + rng() * 0.8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Iso cap (grass top) — wavy edges, sprinkled tufts. Drawn on the extended
  // visual platform so the front-left corner sits at x = -sp, putting the iso
  // diagonal off-canvas.
  const frontPts = subtleDown(visX, visW, cF, rng, { count: 4, amp: 1.5 });
  const backPts = backIso(visX, visW, cB, sp);
  const leftPts = leftIso(cB, cF, visX, sp);

  drawPlatformCap(ctx, visPlatform, frontPts, backPts, {
    capColor: '#5DAF4A',
    capLight: 'rgba(255,255,220,0.18)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      ctx2.fillStyle = '#4A9A3A';
      const n = Math.floor(platform.width / 12);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n + (rng() - 0.5) * 0.04;
        const v = 0.2 + rng() * 0.6;
        ctx2.beginPath();
        ctx2.arc(platform.x + u * platform.width + v * skew, capFront - v * CAP_DEPTH, 0.9, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);

  // Grass blades poking up from the cap front
  ctx.strokeStyle = '#4A9A3A';
  ctx.lineWidth = 1.5;
  for (let x = 5; x < platform.width; x += 14 + (x * 7 % 6)) {
    const h = 5 + (x * 11 % 5);
    ctx.beginPath();
    ctx.moveTo(platform.x + x, cF - 1);
    ctx.lineTo(platform.x + x - 2, cF - 1 - h);
    ctx.stroke();
  }
}

function drawLobbyWall(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = platform.y + CAP_DEPTH / 2;
  const cB = platform.y - CAP_DEPTH / 2;
  const sp = CAP_DEPTH * SKEW_RATIO;
  const bodyTop = cF;
  // Visual extension: the wall sits ON another iso platform (the ground), so
  // its visible bottom must reach that platform's iso cap front edge — not
  // its logical y. The ground's front cap sits CAP_DEPTH/2 below GROUND_Y
  // (= the wall's collision bottom), so extend the body and right face down
  // by that amount. Collision still uses platform.height.
  const visualBottom = platform.y + platform.height + CAP_DEPTH / 2;
  const bodyH = visualBottom - bodyTop;

  // Right face — tan stone shadow side. `bottomY` extends past the collision
  // rect to meet the ground cap's front edge.
  drawPlatformRightFace(ctx, platform, '#7A6548', visualBottom);

  // Body — sandstone gradient with mortar courses
  const bodyGrad = ctx.createLinearGradient(platform.x, bodyTop, platform.x + platform.width, bodyTop + bodyH);
  bodyGrad.addColorStop(0, '#8B7355');
  bodyGrad.addColorStop(0.5, '#A0896B');
  bodyGrad.addColorStop(1, '#7A6548');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Mortar courses
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (let row = 0; row < bodyH; row += 14) {
    ctx.beginPath();
    ctx.moveTo(platform.x, bodyTop + row);
    ctx.lineTo(platform.x + platform.width, bodyTop + row);
    ctx.stroke();
    if ((row / 14) % 2 === 0) {
      const mx = platform.x + platform.width * 0.5;
      ctx.beginPath();
      ctx.moveTo(mx, bodyTop + row);
      ctx.lineTo(mx, bodyTop + row + 14);
      ctx.stroke();
    }
  }

  // Iso cap — flat sandstone top with a few worn flecks
  const frontPts = subtleDown(platform.x, platform.width, cF, rng, { count: 1, amp: 0.4 });
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#B59A78',
    capLight: 'rgba(255,255,255,0.22)',
    drawCapTexture: (ctx2, _capFront, capBack, skew) => {
      ctx2.fillStyle = 'rgba(80,60,40,0.45)';
      const fleckN = 4;
      for (let i = 0; i < fleckN; i++) {
        const u = (i + 0.5) / fleckN;
        const v = 0.3 + rng() * 0.5;
        ctx2.beginPath();
        ctx2.arc(platform.x + u * platform.width + v * skew, capBack + v * CAP_DEPTH, 0.6, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);

  // Tiny grass tuft centered on the iso cap parallelogram (the "moss /
  // grass-in-cracks" detail from the old hand-drawn wall). Cap center is at
  // x = platform.x + (width + sp) / 2 (front-left + back-right midpoint),
  // y = platform.y (between cF front and cB back).
  const tuftCx = platform.x + (platform.width + sp) / 2;
  const tuftCy = platform.y;
  ctx.fillStyle = '#5DAF4A';
  ctx.beginPath();
  ctx.ellipse(tuftCx, tuftCy, platform.width / 2 + 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4A9A3A';
  ctx.lineWidth = 1.2;
  const bladeStep = 3;
  const bladeHalfRange = platform.width / 2;
  for (let off = -bladeHalfRange; off <= bladeHalfRange; off += bladeStep) {
    const gx = tuftCx + off;
    const h = 5 + ((Math.abs(off) * 7) % 4);
    ctx.beginPath();
    ctx.moveTo(gx, tuftCy + 1);
    ctx.lineTo(gx - 1, tuftCy + 1 - h);
    ctx.stroke();
  }
}

export const lobby: ArenaPack = {
  // ---- Identity ----
  id: 'lobby',
  playable: false,

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #4A90D9 0%, #87CEEB 60%, #4a8c3f 100%)',
  previewIcon: '\u{1F3E1}',

  // ---- Translations ----
  translations: { en: 'Lobby', cs: 'Lobby', hi: 'Lobby', fil: 'Lobby' },

  // ---- Layout ----
  defaultSurface: 'grass',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets(
    [
      { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y },
      { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT, style: 'wall' },
    ] as Platform[],
    p => p.style !== 'wall',
  ),
  spawnPoints: [],
  allowFallOff: false,

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
    surfaceColor: '#5DAF4A',
    surfaceThickness: 4,
  },

  platform: {
    floatingBodyColor: '#8B7355',
    floatingTopColor: '#B59A78',
    groundBodyColor: '#3D6B35',
    groundTopColor: '#5DAF4A',
    drawMoss: false,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 4,
    color: 'rgba(255, 255, 255, 0.7)',
    minSize: 55,
    maxSize: 85,
    minSpeed: 5,
    maxSpeed: 11,
    yRange: [35, 110],
  },

  weather: {
    particleCount: 0,
    types: [],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'butterfly', weight: 0.7, colors: ['#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'], speedRange: [15, 30], yRange: [0.2, 0.8] },
      { type: 'bird', weight: 0.3, colors: ['#333', '#555'], speedRange: [40, 80], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 0,
    baseY: GROUND_Y,
    yVariance: 0,
    speedRange: [0, 0],
    alphaRange: [0, 0],
    color: '#FFFFFF',
    sizeX: 0,
    sizeY: 0,
  },

  ambientParticles: {
    count: 0,
    sizeRange: [1, 1],
    vxRange: [0, 0],
    vyRange: [0, 0],
    alphaRange: [0, 0],
    colors: ['#FFFFFF'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: LOBBY_DAY_CYCLE,
    maxNightAlpha: 0.55,
    showFireflies: true,
    showShootingStars: true,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx: CanvasRenderingContext2D, _arena: Arena) => {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#3A6A3A';
    ctx.beginPath();
    ctx.moveTo(-10, GROUND_Y + 10);
    for (let i = 0; i < LOBBY_TREELINE.length; i += 2) {
      ctx.lineTo(LOBBY_TREELINE[i], GROUND_Y + LOBBY_TREELINE[i + 1]);
    }
    ctx.lineTo(1300, GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  drawBackgroundNature: (ctx: CanvasRenderingContext2D, _arena: Arena) => {
    drawTree(ctx, 50, GROUND_Y, 55);
    drawTree(ctx, 380, GROUND_Y, 45);
    drawTree(ctx, 650, GROUND_Y, 50);

    drawBush(ctx, 150, GROUND_Y, 28);
    drawBush(ctx, 300, GROUND_Y, 22);
    drawBush(ctx, 500, GROUND_Y, 25);

    for (const fx of FLOWER_POSITIONS) {
      drawFlower(ctx, fx, GROUND_Y, FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length]);
    }

    drawMushroom(ctx, 220, GROUND_Y);
    drawMushroom(ctx, 560, GROUND_Y);

    for (let gx = 30; gx < WALL_X; gx += 90 + (gx * 3 % 30)) {
      drawGrassTuft(ctx, gx, GROUND_Y);
    }
  },

  drawForegroundNature: () => {},

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    if (platform.style === 'wall') {
      drawLobbyWall(ctx, platform);
    } else {
      drawLobbyGround(ctx, platform);
    }
  },
};
