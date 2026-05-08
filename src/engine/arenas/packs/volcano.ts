import type { ArenaPack } from '../types';
import type { Arena, Platform, WeatherParticle } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { getFloatingPlatforms, drawDriftBand, type DriftBandConfig } from '../../themes/utils';

const HEAT_SHIMMER_CONFIG: DriftBandConfig = {
  topY: 615,
  bottomY: 660,
  colors: ['#ffb88a', '#ff8a5a', '#c95a3a'],
  alphas: [0.08, 0.10, 0.14],
  drifts: [6, 10, 14],
  amps: [6, 9, 12],
};
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  jaggedDown, backWavyUp, drawLeftStones, leftJagged,
} from '../../themes/drawPrimitives';

interface LavaZone { cx: number; cy: number; w: number }
const LAVA_ZONES: ReadonlyArray<LavaZone> = [
  { cx: 340, cy: 694, w: 130 },
  { cx: 900, cy: 694, w: 130 },
  { cx: 610, cy: 654, w: 60 },
];
const LAVA_VENTS = [220, 640, 1060] as const;
const HAZE_COL_H = 80;
const _hazeGradients = new WeakMap<LavaZone, CanvasGradient>();
function getHazeGradient(ctx: CanvasRenderingContext2D, lz: LavaZone): CanvasGradient {
  let g = _hazeGradients.get(lz);
  if (!g) {
    g = ctx.createLinearGradient(0, lz.cy - HAZE_COL_H, 0, lz.cy);
    g.addColorStop(0, 'rgba(255, 120, 60, 0)');
    g.addColorStop(0.5, 'rgba(255, 140, 80, 0.18)');
    g.addColorStop(1, 'rgba(255, 100, 50, 0.32)');
    _hazeGradients.set(lz, g);
  }
  return g;
}

// Near-black volcanic stone palette for left protrusions.
const VOLCANO_STONE_PALETTE = [
  { base: '#1c1414', dark: '#080404', light: '#3a2e2a' },
  { base: '#231818', dark: '#0a0606', light: '#42342e' },
  { base: '#181010', dark: '#050202', light: '#33282a' },
  { base: '#221a1a', dark: '#0c0606', light: '#3e3030' },
];

function drawVolcanoPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — very dark rock shadow.
  drawPlatformRightFace(ctx, platform, '#0a0606');

  // Left-side decoration: column of dark volcanic stones (left of body).
  drawLeftStones(ctx, platform, VOLCANO_STONE_PALETTE, rng, {
    count: 3,
    rxMin: 2.8,
    rxMax: 5,
    elongateChance: 0.35,
  });

  // Edge profiles — sharp jagged peaks on front, small back wave.
  const frontPts = jaggedDown(platform.x, platform.width, cF, rng, {
    bumps: 4,
    ampMin: 3,
    ampMax: 5,
  });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, {
    bumps: 3,
    ampMin: 2,
    ampMax: 3,
  });
  const leftPts = leftJagged(cB, cF, platform.x, rng, { bumps: 2, ampMin: 2, ampMax: 3.5 });

  // Cap — near-black with ember flecks scattered across.
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#1a1410',
    capLight: 'rgba(255,180,100,0.15)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      const flecks = Math.max(4, Math.floor(platform.width / 6));
      for (let i = 0; i < flecks; i++) {
        const u = (i + 0.3 + rng() * 0.4) / flecks;
        const v = 0.15 + rng() * 0.7;
        const fx = platform.x + u * platform.width + v * skew;
        const fy = capFront - v * CAP_DEPTH;
        ctx2.fillStyle = 'rgba(255,100,20,0.7)';
        ctx2.beginPath();
        ctx2.arc(fx, fy, 0.7, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);
}

function drawVolcanoPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front — charred black rock gradient.
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#1a0f0a');
  g.addColorStop(0.6, '#0d0706');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Clip body texture so glows don't leak past the front face rectangle.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(platform.x, bodyTop);
  ctx.lineTo(platform.x + platform.width, bodyTop);
  ctx.lineTo(platform.x + platform.width, bodyTop + bodyH);
  ctx.lineTo(platform.x, bodyTop + bodyH);
  ctx.closePath();
  ctx.clip();

  // Hot pools
  const poolCount = 2 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < poolCount; i++) {
    const px = platform.x + (0.15 + (i + rng() * 0.5) / poolCount * 0.7) * platform.width;
    const py = bodyTop + 3 + rng() * Math.max(2, bodyH - 6);
    const pr = 6 + rng() * Math.min(10, platform.width * 0.15);
    const pool = ctx.createRadialGradient(px, py, 0.5, px, py, pr);
    pool.addColorStop(0, 'rgba(255,120,20,0.7)');
    pool.addColorStop(0.55, 'rgba(220,60,10,0.35)');
    pool.addColorStop(1, 'rgba(180,30,0,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  // Branching glowing cracks
  const crackAnchors = 1 + (rng() < 0.6 ? 1 : 0);
  for (let a = 0; a < crackAnchors; a++) {
    const ax = platform.x + (0.2 + rng() * 0.6) * platform.width;
    const ay = bodyTop + 2 + rng() * Math.max(2, bodyH - 4);
    const segments = 2 + Math.floor(rng() * 2);
    const points: Array<{ x: number; y: number }> = [{ x: ax, y: ay }];
    let cx = ax;
    let cy = ay;
    let dir = (rng() - 0.5) * Math.PI;
    for (let s = 0; s < segments; s++) {
      const len = 4 + rng() * 7;
      dir += (rng() - 0.5) * 1.4;
      cx += Math.cos(dir) * len;
      cy += Math.sin(dir) * len * 0.6;
      points.push({ x: cx, y: cy });
    }
    ctx.strokeStyle = 'rgba(255,90,26,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,228,170,0.7)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
    ctx.stroke();

    if (segments >= 2 && rng() < 0.6) {
      const mid = points[1];
      const branchLen = 3 + rng() * 5;
      const branchDir = dir + (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.6);
      const bx = mid.x + Math.cos(branchDir) * branchLen;
      const by = mid.y + Math.sin(branchDir) * branchLen * 0.6;
      ctx.strokeStyle = 'rgba(255,90,26,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,228,170,0.6)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  // Bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);
  ctx.restore();
}

/** Bright orange-red lava — shared by L2 emitters and (potentially) future
 *  arena-side draws so the color stays in lockstep. */
const LAVA_GLOW_RGB = { r: 255, g: 80, b: 30 } as const;

/** L2 emitter centers + radii (one per hazard zone). Sorted by x. */
const LAVA_EMITTERS = [
  { x: 340, y: 696, radius: 150 },
  { x: 610, y: 656, radius: 130 },
  { x: 900, y: 696, radius: 150 },
] as const;

export const volcano: ArenaPack = {
  // ---- Identity ----
  id: 'volcano',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #1A0505 0%, #8B2500 50%, #FF4500 100%)',
  previewIcon: '\u{1F30B}',

  // ---- Translations ----
  translations: { en: 'Volcano', cs: 'Sopka', hi: '\u091C\u094D\u0935\u093E\u0932\u093E\u092E\u0941\u0916\u0940', fil: 'Bulkan' },

  // ---- Layout ----
  defaultSurface: 'stone',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: 260, height: 60 },
    { x: 420, y: 660, width: 400, height: 60 },
    { x: 980, y: 660, width: 300, height: 60 },
    { x: 260, y: 700, width: 160, height: 20 },
    { x: 820, y: 700, width: 160, height: 20 },
    { x: 200, y: 600, width: 40, height: 60 },
    { x: 600, y: 605, width: 35, height: 55 },
    { x: 900, y: 595, width: 40, height: 65 },
    { x: 60, y: 580, width: 80, height: 24 },
    { x: 320, y: 570, width: 70, height: 24 },
    { x: 540, y: 575, width: 80, height: 24 },
    { x: 750, y: 570, width: 70, height: 24 },
    { x: 1050, y: 580, width: 80, height: 24 },
    { x: 30, y: 480, width: 90, height: 24 },
    { x: 200, y: 470, width: 80, height: 24 },
    { x: 440, y: 480, width: 90, height: 24 },
    { x: 700, y: 475, width: 80, height: 24 },
    { x: 1000, y: 485, width: 90, height: 24 },
    { x: 1160, y: 470, width: 80, height: 24 },
    { x: 100, y: 370, width: 90, height: 24 },
    { x: 350, y: 380, width: 80, height: 24 },
    { x: 830, y: 375, width: 80, height: 24 },
    { x: 1060, y: 370, width: 90, height: 24 },
    { x: 530, y: 300, width: 220, height: 24 },
    { x: 530, y: 390, width: 80, height: 24 },
    { x: 680, y: 385, width: 80, height: 24 },
  ]),
  spawnPoints: [
    { x: 130, y: 560 }, { x: 1110, y: 560 },
    { x: 320, y: 460 }, { x: 1060, y: 460 },
    { x: 640, y: 280 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    { x: 275, y: 694, width: 130, height: 6, type: 'lava' },
    { x: 835, y: 694, width: 130, height: 6, type: 'lava' },
    { x: 580, y: 654, width: 60, height: 6, type: 'lava' },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#1A0505' },
      { offset: 0.3, color: '#3D0C0C' },
      { offset: 0.6, color: '#8B2500' },
      { offset: 1, color: '#CC4400' },
    ],
  },

  hills: [
    { x: -20, baseY: 600, width: 400, height: 180, color: '#2A1A1A' },
    { x: 350, baseY: 610, width: 350, height: 150, color: '#231515' },
    { x: 650, baseY: 595, width: 420, height: 200, color: '#2A1A1A' },
    { x: 1000, baseY: 605, width: 350, height: 170, color: '#231515' },
  ],

  ground: {
    surfaceColor: '#3A2A2A',
    surfaceThickness: 5,
  },

  platform: {
    floatingBodyColor: '#2A2020',
    floatingTopColor: '#4A3535',
    floatingAccentColor: '#FF6600',
    groundBodyColor: '#1A1010',
    groundTopColor: '#3A2A2A',
    drawMoss: false,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 3,
    color: 'rgba(80, 40, 20, 0.4)',
    minSize: 60,
    maxSize: 100,
    minSpeed: 3,
    maxSpeed: 7,
    yRange: [30, 90],
  },

  weather: {
    particleCount: 40,
    types: [
      { type: 'ember', weight: 0.6, sizeRange: [2, 5], vxRange: [-10, 10], vyRange: [-40, -80], rotSpeedRange: [0, 1], color: '#FF6B00' },
      { type: 'ash', weight: 0.3, sizeRange: [2, 4], vxRange: [-15, 15], vyRange: [10, 30], rotSpeedRange: [1, 3], color: 'rgba(120, 100, 90, 0.5)' },
      { type: 'ember', weight: 0.1, sizeRange: [3, 6], vxRange: [-5, 5], vyRange: [-60, -100], rotSpeedRange: [0, 0.5], color: '#FFAA00' },
    ],
  },

  wildlife: {
    count: 0,
    types: [],
  },

  fog: {
    count: 15,
    baseY: 660,
    yVariance: 20,
    speedRange: [2, 5],
    alphaRange: [0.1, 0.25],
    color: '#FF4400',
    sizeX: 60,
    sizeY: 12,
  },

  ambientParticles: {
    count: 20,
    sizeRange: [1, 3],
    vxRange: [-3, 3],
    vyRange: [-15, -40],
    alphaRange: [0.3, 0.7],
    colors: ['#FF6600', '#FF4400', '#FFAA00', '#FF2200'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx: CanvasRenderingContext2D, _arena: Arena) => {
    ctx.save();
    // Distant volcano silhouette
    ctx.fillStyle = '#1A0808';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(100, 400);
    ctx.lineTo(200, 320);
    ctx.lineTo(280, 280);  // volcano peak
    ctx.lineTo(300, 300);
    ctx.lineTo(310, 280);  // crater rim
    ctx.lineTo(340, 310);
    ctx.lineTo(400, 380);
    ctx.lineTo(500, 450);
    ctx.lineTo(600, 500);
    ctx.lineTo(750, 530);
    ctx.lineTo(900, 480);
    ctx.lineTo(1000, 420);
    ctx.lineTo(1080, 380);
    ctx.lineTo(1130, 350);  // second peak
    ctx.lineTo(1170, 370);
    ctx.lineTo(1220, 430);
    ctx.lineTo(1300, 500);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Lava glow from crater
    const grd = ctx.createRadialGradient(295, 280, 5, 295, 280, 120);
    grd.addColorStop(0, 'rgba(255, 100, 0, 0.5)');
    grd.addColorStop(0.5, 'rgba(255, 60, 0, 0.2)');
    grd.addColorStop(1, 'rgba(255, 30, 0, 0)');
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = grd;
    ctx.fillRect(175, 160, 240, 180);

    ctx.restore();
  },

  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Lava pools on ground (glowing animated-looking patches)
    const drawLavaPool = (px: number, pw: number) => {
      ctx.save();
      // Lava body
      const grd = ctx.createLinearGradient(px, y - 2, px, y + 8);
      grd.addColorStop(0, '#FF6600');
      grd.addColorStop(0.5, '#FF4400');
      grd.addColorStop(1, '#CC2200');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(px + pw / 2, y, pw / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bright center
      ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
      ctx.beginPath();
      ctx.ellipse(px + pw / 2, y - 1, pw * 0.3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glow halo
      const halo = ctx.createRadialGradient(px + pw / 2, y, 2, px + pw / 2, y, pw * 0.8);
      halo.addColorStop(0, 'rgba(255, 100, 0, 0.15)');
      halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(px - pw * 0.3, y - pw * 0.5, pw * 1.6, pw);
      ctx.restore();
    };

    drawLavaPool(180, 100);
    drawLavaPool(550, 80);
    drawLavaPool(900, 120);

    // Dead trees (charred, no leaves)
    const drawDeadTree = (dx: number, dy: number, size: number) => {
      ctx.save();
      const trunkW = size * 0.15;
      const trunkH = size;
      ctx.fillStyle = '#1A1010';
      ctx.fillRect(dx - trunkW / 2, dy - trunkH, trunkW, trunkH);
      // Branches
      ctx.strokeStyle = '#2A1818';
      ctx.lineWidth = 2;
      // Left branch
      ctx.beginPath();
      ctx.moveTo(dx - 2, dy - trunkH * 0.7);
      ctx.lineTo(dx - size * 0.4, dy - trunkH * 0.9);
      ctx.lineTo(dx - size * 0.5, dy - trunkH * 1.05);
      ctx.stroke();
      // Right branch
      ctx.beginPath();
      ctx.moveTo(dx + 2, dy - trunkH * 0.5);
      ctx.lineTo(dx + size * 0.35, dy - trunkH * 0.7);
      ctx.lineTo(dx + size * 0.3, dy - trunkH * 0.85);
      ctx.stroke();
      // Top
      ctx.beginPath();
      ctx.moveTo(dx, dy - trunkH);
      ctx.lineTo(dx - size * 0.1, dy - trunkH * 1.15);
      ctx.stroke();
      ctx.restore();
    };

    drawDeadTree(80, y, 55);
    drawDeadTree(450, y, 45);
    drawDeadTree(750, y, 50);
    drawDeadTree(1100, y, 40);
    drawDeadTree(1220, y, 55);

    // Volcanic rocks
    const drawRock = (rx: number, ry: number, rw: number, rh: number) => {
      ctx.fillStyle = '#2A1818';
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + rw * 0.2, ry - rh);
      ctx.lineTo(rx + rw * 0.5, ry - rh * 0.8);
      ctx.lineTo(rx + rw * 0.8, ry - rh * 1.1);
      ctx.lineTo(rx + rw, ry);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#352020';
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, ry - rh * 0.5);
      ctx.lineTo(rx + rw * 0.5, ry - rh * 0.7);
      ctx.lineTo(rx + rw * 0.7, ry - rh * 0.4);
      ctx.closePath();
      ctx.fill();
    };

    drawRock(300, y, 30, 18);
    drawRock(650, y, 25, 15);
    drawRock(1000, y, 35, 20);

    // Platform decorations — small rocks and lava drips
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      drawRock(plat.x + 10, plat.y, 15, 8);
      if (plat.width > 150) {
        drawRock(plat.x + plat.width - 25, plat.y, 18, 10);
        drawLavaPool(plat.x + plat.width * 0.4, 30);
      }
    }
  },

  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground obsidian rock cluster — left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0E0505';
    ctx.beginPath();
    ctx.moveTo(-20, gy + 30);
    ctx.lineTo(-5, gy - 30);
    ctx.lineTo(20, gy - 55);
    ctx.lineTo(40, gy - 70);
    ctx.lineTo(55, gy - 50);
    ctx.lineTo(75, gy - 65);
    ctx.lineTo(95, gy - 40);
    ctx.lineTo(110, gy - 20);
    ctx.lineTo(120, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Obsidian sheen highlights
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#442233';
    ctx.beginPath();
    ctx.moveTo(20, gy - 55);
    ctx.lineTo(35, gy - 45);
    ctx.lineTo(40, gy - 70);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(75, gy - 65);
    ctx.lineTo(85, gy - 50);
    ctx.lineTo(95, gy - 40);
    ctx.lineTo(80, gy - 55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Large foreground obsidian rock cluster — right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0E0505';
    ctx.beginPath();
    ctx.moveTo(1160, gy + 30);
    ctx.lineTo(1175, gy - 15);
    ctx.lineTo(1195, gy - 45);
    ctx.lineTo(1210, gy - 60);
    ctx.lineTo(1230, gy - 75);
    ctx.lineTo(1250, gy - 55);
    ctx.lineTo(1265, gy - 35);
    ctx.lineTo(1280, gy - 50);
    ctx.lineTo(1300, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Obsidian sheen highlights
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#442233';
    ctx.beginPath();
    ctx.moveTo(1210, gy - 60);
    ctx.lineTo(1225, gy - 50);
    ctx.lineTo(1230, gy - 75);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Large foreground lava rock formation — center-left
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#120606';
    ctx.beginPath();
    ctx.moveTo(350, gy + 30);
    ctx.lineTo(360, gy - 10);
    ctx.lineTo(375, gy - 45);
    ctx.lineTo(395, gy - 30);
    ctx.lineTo(415, gy - 15);
    ctx.lineTo(430, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Glowing cracks in rock
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#FF4400';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(370, gy - 30);
    ctx.lineTo(380, gy - 15);
    ctx.lineTo(390, gy - 5);
    ctx.stroke();
    ctx.restore();

    // Ground-level heat shimmer effect (wavy semi-transparent overlay)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FF6600';
    for (let sx = 0; sx < 1280; sx += 80) {
      const sh = 15 + Math.sin(sx * 0.05) * 8;
      ctx.beginPath();
      ctx.ellipse(sx, gy - 5, 40, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawVolcanoPlatformBg(ctx, platform);
  },

  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawVolcanoPlatformFg(ctx, platform);
  },

  drawWeatherParticle: (ctx: CanvasRenderingContext2D, w: WeatherParticle) => {
    if (w.type === 'ember') {
      // Embers are circles — rotation has no visual effect, so skip the
      // save/translate/rotate/restore canvas-state dance and draw directly
      // at world coords. The arc primitive accepts a center, so this is
      // exactly equivalent visually.
      const x = w.x, y = w.y, s = w.size;
      const color = w.color || '#FF6B00';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Ash is an asymmetric ellipse — rotation matters.
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);
      ctx.fillStyle = w.color || 'rgba(120, 100, 90, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w.size, w.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  // ---- Gameplay modifiers ----
  lavaRockConfig: {
    spawnInterval: [2, 5],
    fallSpeed: [150, 300],
    sizeRange: [8, 16],
    color: '#4A2010',
    glowColor: '#FF6600',
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;

    // Obsidian spike base
    ctx.fillStyle = '#1A1010';
    ctx.fillRect(x + width * 0.1, by - height * 0.15, width * 0.8, height * 0.15);

    // Jagged obsidian spikes
    const spikes = [
      { sx: 0.2, sw: 0.15, sh: 0.7 },
      { sx: 0.42, sw: 0.16, sh: 1.0 },
      { sx: 0.65, sw: 0.14, sh: 0.6 },
    ];
    for (const s of spikes) {
      const sx = x + width * s.sx;
      const sw = width * s.sw;
      const sh = height * s.sh;
      // Dark obsidian body
      ctx.fillStyle = '#1A0E0E';
      ctx.beginPath();
      ctx.moveTo(sx, by - height * 0.15);
      ctx.lineTo(sx + sw * 0.5, by - sh);
      ctx.lineTo(sx + sw, by - height * 0.15);
      ctx.closePath();
      ctx.fill();
      // Glassy highlight
      ctx.fillStyle = 'rgba(60, 40, 40, 0.5)';
      ctx.beginPath();
      ctx.moveTo(sx + sw * 0.3, by - height * 0.15);
      ctx.lineTo(sx + sw * 0.45, by - sh * 0.8);
      ctx.lineTo(sx + sw * 0.6, by - height * 0.15);
      ctx.closePath();
      ctx.fill();
      // Lava glow at tip
      const glow = ctx.createRadialGradient(sx + sw * 0.5, by - sh, 1, sx + sw * 0.5, by - sh, sw * 1.5);
      glow.addColorStop(0, 'rgba(255, 120, 0, 0.7)');
      glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sw, by - sh - sw, sw * 3, sw * 2);
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.5;
    const squash = 1 + bounceTimer * 0.03;

    // Dark stone vent base
    ctx.fillStyle = '#2A1A1A';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.9, y);
    ctx.lineTo(x - halfW * 0.6, y - size * 0.35 / squash);
    ctx.lineTo(x + halfW * 0.6, y - size * 0.35 / squash);
    ctx.lineTo(x + halfW * 0.9, y);
    ctx.closePath();
    ctx.fill();
    // Stone rim
    ctx.fillStyle = '#3A2820';
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.35 / squash, halfW * 0.65, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fire column
    const flameH = size * 0.7 * squash;
    const flameTop = y - size * 0.35 / squash - flameH;
    const grd = ctx.createLinearGradient(x, y - size * 0.35 / squash, x, flameTop);
    grd.addColorStop(0, 'rgba(255, 200, 50, 0.9)');
    grd.addColorStop(0.4, 'rgba(255, 100, 0, 0.7)');
    grd.addColorStop(1, 'rgba(255, 40, 0, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.35, y - size * 0.35 / squash);
    ctx.quadraticCurveTo(x - halfW * 0.15, flameTop + flameH * 0.3, x, flameTop);
    ctx.quadraticCurveTo(x + halfW * 0.15, flameTop + flameH * 0.3, x + halfW * 0.35, y - size * 0.35 / squash);
    ctx.closePath();
    ctx.fill();

    // Bright core
    ctx.fillStyle = 'rgba(255, 255, 150, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.5 / squash, halfW * 0.15, flameH * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }),

  drawAnimatedBackground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    ctx.save();
    // Diffuse smoky fog above each lava zone — stacked drifting ellipses
    // create the soft "haze" feel without a Canvas blur filter (which is
    // expensive in Canvas2D).
    ctx.fillStyle = '#3a1a1a';
    for (const lz of LAVA_ZONES) {
      const halfW = lz.w * 0.7;
      for (let i = 0; i < 6; i++) {
        const drift = fastSin(time * 0.3 + i * 1.3) * halfW * 0.4;
        const py = lz.cy - 30 - i * 12;
        const sx = halfW + 16 + fastSin(time * 0.4 + i * 0.7) * 8;
        const sy = 16 + i * 1.5;
        ctx.globalAlpha = 0.10 + (1 - i / 6) * 0.10;
        ctx.beginPath();
        ctx.ellipse(lz.cx + drift, py, sx, sy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const lz of LAVA_ZONES) {
      ctx.fillStyle = getHazeGradient(ctx, lz);
      ctx.beginPath();
      const halfW = lz.w * 0.55;
      const wob = fastSin(time * 2.5) * 6;
      ctx.moveTo(lz.cx - halfW + wob, lz.cy);
      for (let y = lz.cy - 4; y >= lz.cy - HAZE_COL_H; y -= 6) {
        const t = (lz.cy - y) / HAZE_COL_H;
        const w = halfW * (1 - t * 0.5);
        const w2 = fastSin(y * 0.06 + time * 3) * 8 * (1 - t);
        ctx.lineTo(lz.cx + w + w2, y);
      }
      ctx.lineTo(lz.cx + halfW + wob, lz.cy - HAZE_COL_H);
      ctx.lineTo(lz.cx - halfW + wob, lz.cy - HAZE_COL_H);
      for (let y = lz.cy - HAZE_COL_H; y <= lz.cy - 4; y += 6) {
        const t = (lz.cy - y) / HAZE_COL_H;
        const w = halfW * (1 - t * 0.5);
        const w2 = fastSin(y * 0.06 + time * 3 + 1.7) * 8 * (1 - t);
        ctx.lineTo(lz.cx - w + w2, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 200, 130, 0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const phase = i * 1.3;
        const xOff = fastSin(time * 1.5 + phase) * (halfW * 0.6);
        const yStart = lz.cy - 6;
        const yEnd = yStart - 50 - fastSin(time * 2 + phase) * 16;
        ctx.beginPath();
        ctx.moveTo(lz.cx + xOff, yStart);
        for (let y = yStart; y >= yEnd; y -= 4) {
          const w = fastSin(y * 0.1 + time * 4 + phase) * 4;
          ctx.lineTo(lz.cx + xOff + w, y);
        }
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#3a201a';
    for (const vx of LAVA_VENTS) {
      for (let i = 0; i < 14; i++) {
        const t = ((time * 0.4 + i * 0.07) % 1);
        const px = vx + fastSin(time * 1.3 + i * 1.7) * 28 * t;
        const py = 660 - t * 240;
        const sz = 2 + t * 6;
        const a = (1 - t) * 0.7;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff8a3a';
      for (let i = 0; i < 4; i++) {
        const t = ((time * 0.7 + i * 0.21) % 1);
        const px = vx + fastSin(time * 2 + i) * 14 * t;
        const py = 660 - t * 200;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3a201a';
    }
    ctx.globalAlpha = 1;
    for (let zi = 0; zi < LAVA_ZONES.length; zi++) {
      const lz = LAVA_ZONES[zi];
      const period = 4 + zi * 0.7;
      const phase = (time + zi * 1.3) % period;
      if (phase < 1.4) {
        const u = phase / 1.4;
        const r = 4 + u * 7;
        ctx.globalAlpha = 0.55 * (1 - u * 0.4);
        ctx.fillStyle = '#ffd56b';
        ctx.beginPath();
        ctx.arc(lz.cx, lz.cy - 6 - u * 5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  drawAnimatedForeground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    drawDriftBand(ctx, time, HEAT_SHIMMER_CONFIG);
    ctx.save();
    ctx.fillStyle = '#ff8c5a';
    for (let zi = 0; zi < LAVA_ZONES.length; zi++) {
      const lz = LAVA_ZONES[zi];
      const halfW = lz.w * 0.9;
      for (let pi = 0; pi < 3; pi++) {
        const wob = fastSin(time * 0.8 + pi + zi) * 12;
        ctx.globalAlpha = 0.18 - pi * 0.04;
        ctx.beginPath();
        ctx.ellipse(lz.cx + wob, lz.cy - 18 - pi * 8, halfW, 14 + pi * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_lava'],
    periodic: [{ sound: 'amb_volcano_burst', intervalRange: [8, 20] }],
  },
  // Lava emissives at hazard zones — read as hot points with bleed onto nearby platforms.
  lights: LAVA_EMITTERS.map((e, i) => ({
    kind: 'point' as const,
    x: e.x, y: e.y, radius: e.radius,
    color: LAVA_GLOW_RGB,
    intensity: 0.9,
    falloff: 'inverse-square' as const,
    flicker: { seed: 11 + i, amplitude: 0.08 },
  })),

  musicFile: 'volcano.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:228,d:100},{t:2,y:'j',x:0,d:32},{t:3,y:'d',x:228,d:100},{t:5,y:'j',x:204},{t:8,y:'j',x:84},{t:9,y:'j',x:228},{t:12,y:'j',x:0}],
      [{t:0,y:'j',x:420},{t:2,y:'j',x:788},{t:3,y:'d',x:420,d:100},{t:4,y:'d',x:788,d:100},{t:5,y:'j',x:420},{t:6,y:'j',x:602,d:39},{t:7,y:'j',x:788},{t:9,y:'j',x:420},{t:10,y:'j',x:564,d:1},{t:11,y:'j',x:769},{t:12,y:'j',x:788}],
      [{t:0,y:'j',x:1248,d:32},{t:1,y:'j',x:980,d:100},{t:4,y:'d',x:980,d:100},{t:5,y:'j',x:1248},{t:7,y:'j',x:980},{t:8,y:'j',x:1248},{t:11,y:'j',x:980},{t:12,y:'j',x:1074}],
      [{t:0,y:'j',x:260},{t:1,y:'j',x:388,d:100},{t:2,y:'j',x:260},{t:5,y:'j',x:260},{t:6,y:'j',x:388,d:39},{t:8,y:'j',x:260},{t:9,y:'j',x:339},{t:10,y:'j',x:388,d:1}],
      [{t:1,y:'j',x:820,d:100},{t:2,y:'j',x:948},{t:6,y:'j',x:820,d:39},{t:7,y:'j',x:904},{t:10,y:'j',x:820,d:1},{t:11,y:'j',x:820},{t:12,y:'j',x:948}],
      [{t:0,y:'d',x:200},{t:3,y:'d',x:208,d:100},{t:8,y:'j',x:200},{t:9,y:'j',x:208},{t:10,y:'j',x:208,d:1},{t:13,y:'j',x:200},{t:14,y:'j',x:204},{t:15,y:'j',x:208}],
      [{t:1,y:'d',x:603,d:100},{t:7,y:'j',x:603},{t:9,y:'j',x:600},{t:10,y:'j',x:600,d:1},{t:11,y:'j',x:603},{t:15,y:'j',x:600},{t:16,y:'j',x:603}],
      [{t:1,y:'d',x:900,d:100},{t:2,y:'d',x:908},{t:4,y:'d',x:900,d:100},{t:6,y:'j',x:900,d:39},{t:10,y:'j',x:900,d:1},{t:11,y:'j',x:900},{t:12,y:'j',x:908},{t:16,y:'j',x:900},{t:17,y:'j',x:908},{t:18,y:'j',x:908}],
      [{t:0,y:'d',x:108},{t:2,y:'d',x:60,d:7},{t:3,y:'d',x:108,d:100},{t:9,y:'j',x:108},{t:12,y:'j',x:60},{t:13,y:'j',x:74},{t:14,y:'j',x:108},{t:17,y:'j',x:60},{t:18,y:'j',x:60}],
      [{t:0,y:'d',x:320},{t:1,y:'d',x:358,d:100},{t:3,y:'d',x:320,d:100},{t:8,y:'j',x:320},{t:10,y:'j',x:358,d:1},{t:13,y:'j',x:320},{t:14,y:'j',x:320},{t:15,y:'j',x:358}],
      [{t:1,y:'d',x:588,d:100},{t:3,y:'d',x:540,d:100},{t:6,y:'d',x:588,d:39},{t:9,y:'j',x:540},{t:11,y:'j',x:588},{t:15,y:'j',x:540},{t:16,y:'j',x:588}],
      [{t:1,y:'d',x:750,d:100},{t:4,y:'d',x:788,d:100},{t:10,y:'j',x:750,d:1},{t:12,y:'j',x:788},{t:15,y:'j',x:750},{t:16,y:'j',x:750},{t:17,y:'j',x:788}],
      [{t:2,y:'d',x:1098},{t:4,y:'d',x:1050,d:100},{t:8,y:'j',x:1098},{t:11,y:'j',x:1050},{t:13,y:'j',x:1098},{t:17,y:'j',x:1054},{t:18,y:'j',x:1098}],
      [{t:0,y:'d',x:88},{t:2,y:'d',x:30},{t:3,y:'d',x:88,d:100},{t:5,y:'d',x:88},{t:8,y:'d',x:88},{t:14,y:'j',x:88},{t:17,y:'j',x:30},{t:18,y:'j',x:30},{t:19,y:'j',x:88},{t:20,y:'j',x:88},{t:22,y:'j',x:30}],
      [{t:0,y:'d',x:200},{t:1,y:'d',x:248,d:100},{t:3,y:'d',x:248,d:100},{t:5,y:'d',x:200},{t:8,y:'d',x:200},{t:9,y:'d',x:248},{t:13,y:'j',x:200},{t:15,y:'j',x:248},{t:18,y:'j',x:200},{t:19,y:'j',x:200},{t:20,y:'j',x:248},{t:24,y:'j',x:248}],
      [{t:1,y:'d',x:498,d:100},{t:3,y:'d',x:440,d:100},{t:6,y:'d',x:498,d:39},{t:9,y:'d',x:440},{t:10,y:'d',x:498,d:1},{t:14,y:'j',x:440},{t:16,y:'j',x:498},{t:20,y:'j',x:440},{t:24,y:'j',x:498},{t:25,y:'j',x:498}],
      [{t:1,y:'d',x:700,d:100},{t:4,y:'d',x:748,d:100},{t:6,y:'d',x:700,d:39},{t:7,y:'d',x:748},{t:10,y:'d',x:700,d:1},{t:11,y:'d',x:748},{t:15,y:'j',x:700},{t:17,y:'j',x:748},{t:21,y:'j',x:748},{t:24,y:'j',x:700},{t:25,y:'j',x:714}],
      [{t:2,y:'d',x:1058},{t:4,y:'d',x:1000,d:100},{t:7,y:'d',x:1000},{t:12,y:'d',x:1058},{t:13,y:'j',x:1058},{t:16,y:'j',x:1000},{t:18,y:'j',x:1058},{t:21,y:'j',x:1000},{t:22,y:'j',x:1058},{t:25,y:'j',x:1000}],
      [{t:0,y:'d',x:1208},{t:2,y:'d',x:1160},{t:4,y:'d',x:1160,d:100},{t:8,y:'d',x:1208},{t:12,y:'d',x:1160},{t:13,y:'j',x:1208},{t:14,y:'j',x:1208},{t:19,y:'j',x:1208},{t:21,y:'j',x:1160},{t:22,y:'j',x:1160}],
      [{t:0,y:'d',x:100},{t:2,y:'d',x:100},{t:3,y:'d',x:158,d:100},{t:5,y:'d',x:158},{t:8,y:'d',x:100},{t:9,y:'d',x:158},{t:13,y:'d',x:100},{t:14,y:'d',x:158},{t:20,y:'j',x:158},{t:22,y:'j',x:100}],
      [{t:0,y:'d',x:350},{t:1,y:'d',x:398,d:100},{t:3,y:'d',x:350,d:100},{t:5,y:'d',x:350},{t:6,y:'d',x:398,d:39},{t:9,y:'d',x:350},{t:10,y:'d',x:398,d:1},{t:14,y:'d',x:350},{t:15,y:'d',x:398},{t:19,y:'j',x:350},{t:23,y:'j',x:398},{t:24,y:'j',x:398},{t:25,y:'j',x:398}],
      [{t:1,y:'d',x:830,d:100},{t:2,y:'d',x:878},{t:4,y:'d',x:878,d:100},{t:6,y:'d',x:830,d:39},{t:7,y:'d',x:878},{t:11,y:'d',x:830},{t:12,y:'d',x:878},{t:16,y:'d',x:830},{t:17,y:'d',x:878},{t:22,y:'j',x:878},{t:23,y:'j',x:830},{t:25,y:'j',x:830}],
      [{t:0,y:'d',x:1118},{t:2,y:'d',x:1118},{t:4,y:'d',x:1060,d:100},{t:7,y:'d',x:1060},{t:8,y:'d',x:1118},{t:12,y:'d',x:1060},{t:17,y:'d',x:1060},{t:18,y:'d',x:1118},{t:19,y:'j',x:1118},{t:21,y:'j',x:1060}],
      [{t:1,y:'d',x:530,d:100},{t:2,y:'d',x:718},{t:3,y:'d',x:530,d:100},{t:4,y:'d',x:718,d:100},{t:6,y:'d',x:530,d:39},{t:7,y:'d',x:718},{t:9,y:'d',x:530},{t:10,y:'d',x:530,d:1},{t:11,y:'d',x:718},{t:15,y:'d',x:530},{t:16,y:'d',x:718},{t:20,y:'d',x:530},{t:21,y:'d',x:718},{t:24,y:'d',x:530},{t:25,y:'d',x:718}],
      [{t:1,y:'d',x:578,d:100},{t:3,y:'d',x:530,d:100},{t:4,y:'d',x:578,d:100},{t:6,y:'d',x:578,d:39},{t:9,y:'d',x:530},{t:10,y:'d',x:578,d:1},{t:11,y:'d',x:578},{t:15,y:'d',x:530},{t:16,y:'d',x:578},{t:20,y:'j',x:530},{t:21,y:'j',x:578},{t:23,y:'j',x:554},{t:25,y:'j',x:578}],
      [{t:1,y:'d',x:680,d:100},{t:4,y:'d',x:728,d:100},{t:6,y:'d',x:680,d:39},{t:7,y:'d',x:728},{t:10,y:'d',x:680,d:1},{t:11,y:'d',x:728},{t:16,y:'d',x:728},{t:20,y:'j',x:680},{t:21,y:'j',x:728},{t:22,y:'j',x:728},{t:23,y:'j',x:699},{t:24,y:'j',x:680}],
    ],
    nextHop: [[-1,1,2,3,1,5,3,1,8,9,3,1,12,5,5,5,3,8,8,5,5,8,5,5,5,5],[0,-1,2,3,4,5,6,7,3,9,10,11,12,5,5,5,6,7,7,5,5,6,5,5,5,5],[0,1,-1,0,4,5,4,7,8,0,4,11,12,5,5,5,7,7,7,5,5,7,5,5,5,5],[0,1,2,-1,1,5,6,1,8,9,10,1,0,5,5,5,6,8,8,5,5,6,5,5,5,5],[1,1,2,1,-1,1,6,7,2,1,10,11,12,12,1,6,6,7,7,12,12,6,12,12,6,6],[0,0,0,3,0,-1,3,0,8,9,10,10,0,13,14,15,10,8,8,13,13,10,13,13,14,15],[1,1,1,1,1,1,-1,7,9,9,10,11,1,9,9,15,16,7,7,9,15,16,9,15,15,15],[1,1,2,1,4,1,6,-1,2,1,10,11,12,12,18,6,16,17,18,18,12,16,17,16,16,16],[0,0,2,3,2,0,3,2,-1,9,3,2,12,13,14,9,17,17,18,13,13,17,13,13,14,17],[0,1,0,3,1,0,1,1,8,-1,10,1,0,13,14,15,10,8,8,13,13,10,13,13,14,15],[1,1,1,3,1,1,6,1,3,9,-1,11,1,9,9,15,16,11,1,9,15,16,9,15,15,15],[1,1,1,1,4,1,1,1,12,1,10,-1,12,12,15,15,16,17,12,12,15,16,17,15,15,15],[2,2,2,8,4,2,4,2,8,8,4,11,-1,13,8,11,11,17,18,13,13,17,13,13,8,17],[0,0,2,3,2,5,3,2,8,0,3,2,0,-1,14,5,17,17,18,19,20,17,22,20,14,17],[0,1,8,3,1,5,1,1,8,9,1,1,0,13,-1,15,24,8,18,19,20,18,13,20,24,15],[9,1,1,3,1,1,6,1,3,9,10,1,1,9,14,-1,16,16,14,14,20,16,25,20,24,25],[1,1,7,1,4,1,6,7,1,1,10,11,1,17,15,15,-1,17,7,7,15,21,17,21,24,25],[2,7,2,13,4,2,4,7,2,7,4,2,12,13,13,16,16,-1,18,13,13,21,22,21,16,25],[0,0,2,0,4,0,4,2,8,0,4,2,12,13,14,14,21,8,-1,19,13,21,22,21,14,21],[0,9,2,3,2,5,3,2,8,9,3,2,0,13,14,5,14,8,8,-1,20,22,22,20,14,20],[0,1,0,3,1,5,6,1,14,9,10,1,0,5,14,15,6,14,14,19,-1,23,19,23,24,25],[1,1,2,1,4,1,6,7,2,1,16,11,12,12,23,6,16,17,7,22,23,-1,22,23,16,25],[0,7,2,0,4,0,4,7,8,0,4,2,12,8,8,0,7,17,18,19,19,21,-1,21,8,17],[9,1,2,3,4,20,6,7,2,9,10,11,21,9,20,15,16,21,7,20,20,21,21,-1,24,25],[9,1,1,3,4,1,6,16,3,9,10,11,1,9,9,15,16,11,16,20,20,21,21,23,-1,25],[1,1,7,1,4,1,6,7,22,1,10,11,1,1,20,6,16,7,7,20,20,21,22,23,24,-1]],
    safeHop: [[-1,1,12,3,12,5,5,12,8,9,5,12,12,5,5,5,12,8,8,5,5,8,5,5,5,5],[0,-1,2,3,4,5,6,7,0,9,10,11,12,5,5,5,7,7,7,5,5,7,5,5,5,5],[5,1,-1,5,4,5,7,7,8,5,5,11,12,5,5,5,7,7,7,5,5,7,5,5,5,5],[0,1,2,-1,2,5,6,2,8,9,10,2,0,5,5,5,10,8,8,5,5,8,5,5,5,5],[2,1,2,10,-1,2,6,7,2,10,10,11,12,12,2,11,7,7,7,12,12,7,12,12,11,11],[0,0,13,3,0,-1,15,13,8,9,10,10,0,13,14,15,15,8,8,13,13,15,13,13,14,15],[9,1,7,9,7,7,-1,7,9,9,10,11,7,9,9,15,16,7,7,9,15,16,9,15,15,15],[18,1,2,10,4,2,6,-1,2,10,10,11,12,12,18,11,16,17,18,18,12,16,17,16,16,16],[0,0,2,3,2,0,9,17,-1,9,9,2,12,13,14,9,17,17,18,13,13,17,13,13,14,17],[0,1,13,3,0,0,15,13,8,-1,10,10,0,13,14,15,15,8,8,13,13,15,13,13,14,15],[9,1,16,3,11,9,6,16,9,9,-1,11,11,9,9,15,16,11,16,9,15,16,9,15,15,15],[15,1,12,15,4,12,15,16,12,15,10,-1,12,12,15,15,16,17,12,12,15,16,17,15,15,15],[8,2,2,8,4,2,2,2,8,8,11,11,-1,13,8,11,11,17,18,13,13,17,13,13,8,17],[0,0,2,3,2,5,20,2,8,0,5,2,0,-1,14,5,17,17,18,19,20,17,22,20,14,17],[0,1,8,3,18,5,15,8,8,9,5,24,0,13,-1,15,24,8,18,19,20,18,13,20,24,15],[9,1,9,3,16,14,6,16,9,9,10,16,9,9,14,-1,16,16,14,14,20,16,25,20,24,25],[15,1,7,10,4,7,6,7,7,15,10,11,7,17,15,15,-1,17,7,7,15,21,17,21,24,25],[13,7,2,13,4,2,7,7,2,2,7,2,12,13,13,16,16,-1,18,13,13,21,22,21,16,25],[0,0,2,0,4,0,21,2,8,0,21,2,12,13,14,14,21,8,-1,19,13,21,22,21,14,21],[0,9,2,3,2,5,20,2,8,9,5,2,0,13,14,5,14,8,8,-1,20,22,22,20,14,20],[0,1,19,3,23,5,6,23,14,9,10,23,0,5,14,15,15,14,14,19,-1,23,19,23,24,25],[22,1,2,23,4,2,6,7,2,23,16,11,12,12,23,11,16,17,7,22,23,-1,22,23,16,25],[0,7,2,0,4,0,7,7,8,0,7,2,12,8,8,0,7,17,18,19,19,21,-1,21,8,17],[9,1,2,3,4,20,6,7,2,9,10,11,21,9,20,15,16,21,7,20,20,21,21,-1,24,25],[9,1,21,3,4,20,6,16,9,9,10,11,11,9,9,15,16,11,16,20,20,21,21,23,-1,25],[20,1,7,10,4,20,6,7,22,20,10,11,7,7,20,11,16,7,7,20,20,21,22,23,24,-1]],
  },
  // NAV-DATA-END
};
