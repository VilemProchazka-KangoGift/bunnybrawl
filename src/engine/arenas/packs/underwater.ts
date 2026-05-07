import type { ArenaPack } from '../types';
import type { Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import { pushFromPlayers, makeDtTracker, tickGroundCritter, type GroundCritterState } from '../../themes/utils';
import type { Player } from '../../types';

const CRABS_CFG = [
  { platL: 50,   platR: 380,  platTopY: 660, walkSpeed: 35, fleeSpeed: 130, fleeRadius: 100, yTolerance: 80 },
  { platL: 480,  platR: 800,  platTopY: 660, walkSpeed: 30, fleeSpeed: 120, fleeRadius: 100, yTolerance: 80 },
  { platL: 900,  platR: 1230, platTopY: 660, walkSpeed: 32, fleeSpeed: 140, fleeRadius: 100, yTolerance: 80 },
];
const _crabs: GroundCritterState[] = CRABS_CFG.map((cfg, i) => ({
  x: (cfg.platL + cfg.platR) / 2,
  dir: i % 2 === 0 ? 1 : -1, facingEase: 1, fleeing: false, committedFleeDir: 0,
}));
const _tickCrabDt = makeDtTracker();

function drawOneCrab(ctx: CanvasRenderingContext2D, time: number, crab: GroundCritterState, cfg: typeof CRABS_CFG[number]): void {
  const fleeing = crab.fleeing;
  const motion = Math.abs(crab.facingEase);
  ctx.save();
  ctx.translate(crab.x, cfg.platTopY - 6);
  if (crab.facingEase < 0) ctx.scale(-1, 1);

  // 6 legs (3 on each side, splayed under the body) — alternating step lift.
  ctx.strokeStyle = '#7a1f12';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 3; i++) {
      const lift = fastSin(time * 14 + i * 1.4 + (s > 0 ? Math.PI : 0)) * motion;
      const baseX = s * (4 + i * 2);
      const tipX = s * (10 + i * 2);
      const tipY = 6 - Math.max(0, lift) * 1.2;
      // Knee bend down then out
      const kneeX = (baseX + tipX) * 0.5;
      const kneeY = 3 - Math.max(0, lift) * 0.5;
      ctx.moveTo(baseX, 1);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(tipX, tipY);
    }
  }
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Carapace (rounded shell — wider than tall, slightly raised at the back).
  ctx.fillStyle = '#c8392a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shell detail — a darker rim and lighter highlight.
  ctx.strokeStyle = '#7a1f12';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,170,150,0.55)';
  ctx.beginPath();
  ctx.ellipse(-3, -2.5, 5, 2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // Two spike bumps along the front rim.
  ctx.fillStyle = '#a82e1f';
  ctx.beginPath();
  ctx.moveTo(-3, -6.5);
  ctx.lineTo(-2, -8);
  ctx.lineTo(-1, -6.3);
  ctx.moveTo(2, -6.6);
  ctx.lineTo(3, -8);
  ctx.lineTo(4, -6.3);
  ctx.fill();

  // Eye stalks on top of carapace.
  ctx.strokeStyle = '#7a1f12';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2.5, -5);
  ctx.lineTo(-3, -10);
  ctx.moveTo(2.5, -5);
  ctx.lineTo(3, -10);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-3, -10, 1.6, 0, Math.PI * 2);
  ctx.arc(3, -10, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-3, -10, 0.7, 0, Math.PI * 2);
  ctx.arc(3, -10, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // BIG claw on the right (forward-facing side). Fiddler-style oversized pincer.
  const bigClawWiggle = fastSin(time * (fleeing ? 12 : 5)) * 0.3 * motion;
  ctx.save();
  ctx.translate(10, -1);
  ctx.rotate(bigClawWiggle - 0.15);
  // Upper arm.
  ctx.fillStyle = '#a82e1f';
  ctx.beginPath();
  ctx.ellipse(4, 0, 5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Big pincer claw — two prongs forming a "C".
  ctx.fillStyle = '#c8392a';
  ctx.beginPath();
  ctx.ellipse(11, -2.5, 6, 3.2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a82e1f';
  ctx.beginPath();
  ctx.ellipse(11, 2.5, 6, 3, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Slit between prongs.
  ctx.strokeStyle = '#3a1008';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(15, 0);
  ctx.stroke();
  ctx.restore();

  // Small claw on the left.
  const smallClawWiggle = fastSin(time * (fleeing ? 14 : 6) + 1.5) * 0.4 * motion;
  ctx.save();
  ctx.translate(-10, -1);
  ctx.rotate(-smallClawWiggle + 0.2);
  ctx.fillStyle = '#a82e1f';
  ctx.beginPath();
  ctx.ellipse(-3, 0, 3, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8392a';
  ctx.beginPath();
  ctx.ellipse(-7, -1, 2.5, 1.4, -0.2, 0, Math.PI * 2);
  ctx.ellipse(-7, 1, 2.5, 1.4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a1008';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-5.5, 0);
  ctx.lineTo(-9, 0);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawCrab(ctx: CanvasRenderingContext2D, time: number, players: ReadonlyArray<Player>): void {
  const dt = _tickCrabDt(time);
  for (let i = 0; i < _crabs.length; i++) {
    tickGroundCritter(_crabs[i], players, dt, CRABS_CFG[i]);
    drawOneCrab(ctx, time, _crabs[i], CRABS_CFG[i]);
  }
}

const FISH_SPECIES = [
  { color: '#ffaa3a', size: 0.7 },
  { color: '#5fb4d8', size: 1.0 },
  { color: '#a8d088', size: 0.8 },
  { color: '#d88aa8', size: 0.6 },
  { color: '#ffd56b', size: 0.9 },
] as const;
const BUBBLE_LEAKS = [
  { x: 165, y: 410 }, { x: 1125, y: 390 }, { x: 376, y: 345 },
  { x: 906, y: 330 }, { x: 640, y: 80 },
] as const;
const BUBBLE_COLUMNS = [120, 380, 900, 1180] as const;
const FISH_COUNT = 18;

function drawFish(ctx: CanvasRenderingContext2D, i: number, time: number, cxBase: number, cy: number, facing: 1 | -1, players: ReadonlyArray<Player>): void {
  const sp = FISH_SPECIES[i % FISH_SPECIES.length];
  const ox = (i % 6) * 26 - 65;
  const oy = Math.floor(i / 6) * 22 - 22 + (i % 2) * 6;
  const wob = fastSin(time * 4 + i) * 3;
  const x = cxBase + ox + wob;
  const baseY = cy + oy + fastCos(time * 3 + i) * 3;
  // No wrap: caller's sweep keeps the school inside the canvas. Wrapping
  // per-fish at the edge snapped the school apart (each fish crossed the
  // threshold one tick at a time, looking like 1-frame teleports).
  const r = pushFromPlayers(players, x, baseY, 70, 22);
  const s = sp.size;
  ctx.save();
  ctx.translate(r.x, r.y);
  // Sprite has tail on the left + eye on the right (faces right by default);
  // mirror when the school is swimming left so fish don't float backwards.
  if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = sp.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const tailWag = fastSin(time * 12 + i) * 0.8;
  ctx.beginPath();
  ctx.moveTo(-6 * s, 0);
  ctx.lineTo(-10 * s, -3 * s + tailWag);
  ctx.lineTo(-10 * s, 3 * s + tailWag);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(-1 * s, 1 * s, 4 * s, 1.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(3.5 * s, -0.7 * s, 1, 1);
  ctx.restore();
}
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  drawLeftStones, wavyDown, backWavyUp, leftWavy,
} from '../../themes/drawPrimitives';
import type { StonePaletteRow } from '../../themes/drawPrimitives';
import { getFloatingPlatforms } from '../../themes/utils';

// Algae-tinted cool-gray stone palette for left-side protrusions.
const UNDERWATER_STONE_PALETTE: StonePaletteRow[] = [
  { base: '#6a7a72', dark: '#3a4a42', light: '#8a9a92' },
  { base: '#5a6a62', dark: '#2a3a32', light: '#7a8a82' },
  { base: '#748478', dark: '#3e4e46', light: '#98a89c' },
  { base: '#627268', dark: '#32423a', light: '#82928a' },
];

function drawUnderwaterPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — deep teal shadow.
  drawPlatformRightFace(ctx, platform, '#082028');

  // Left-side stones — only on floating platforms.
  if (!isGround) {
    drawLeftStones(ctx, platform, UNDERWATER_STONE_PALETTE, rng, { count: 3, rxMin: 2.5, rxMax: 4.5 });
  }

  // Edge profiles — gentle wavy.
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 3, ampMin: 2, ampMax: 3.5, valleyBase: 0.4 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 2, ampMax: 3 });
  const leftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1.5, ampMax: 2.5 });

  // Cap — sandy tan with caustic ripples.
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#d4b890',
    capLight: 'rgba(255,245,220,0.2)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      const rippleN = 2 + Math.floor(rng() * 2);
      ctx2.strokeStyle = 'rgba(180,230,255,0.5)';
      ctx2.lineWidth = 0.8;
      for (let i = 0; i < rippleN; i++) {
        const rw = platform.width * 0.4;
        const rx = platform.x + rng() * (platform.width - rw);
        const v = 0.25 + rng() * 0.5;
        const midY = capBack + v * (capFront - capBack);
        const y0 = midY + (rng() - 0.5) * 2;
        const y1 = midY + (rng() - 0.5) * 2;
        const ymid = midY - 1.5 - rng() * 1.5;
        ctx2.beginPath();
        ctx2.moveTo(rx + v * skew, y0);
        ctx2.quadraticCurveTo(rx + rw * 0.5 + v * skew, ymid, rx + rw + v * skew, y1);
        ctx2.stroke();
      }
    },
  }, leftPts);

  // Kelp strands hanging below body bottom (floating only). Stay in bg —
  // they're below the body region, so player rising into body is above them.
  if (!isGround) {
    const bb = platform.y + platform.height;
    const kelpCount = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < kelpCount; k++) {
      const kx = platform.x + (k + 0.5 + (rng() - 0.5) * 0.3) * platform.width / kelpCount;
      const klen = 18 + rng() * 10;
      const phase = rng() * Math.PI * 2;
      const swayAmp = 3 + rng() * 2;
      ctx.strokeStyle = '#2a6838';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(kx, bb);
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const px = kx + Math.sin(phase + t * Math.PI * 1.5) * swayAmp * t;
        const py = bb + t * klen;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      const leafN = 3 + Math.floor(rng() * 2);
      ctx.fillStyle = '#3a7848';
      for (let l = 0; l < leafN; l++) {
        const t = (l + 0.6) / leafN;
        const px = kx + Math.sin(phase + t * Math.PI * 1.5) * swayAmp * t;
        const py = bb + t * klen;
        const side = l % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(px + side * 3, py, 3, 1.4, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawUnderwaterPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — deep teal gradient.
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#1a4450');
  g.addColorStop(0.5, '#123640');
  g.addColorStop(1, '#0a2830');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Coral: seed-picked single type per platform
  const coralRoll = rng();
  const coralType = coralRoll < 0.4 ? 'branching' : (coralRoll < 0.75 ? 'tube' : 'anemone');

  if (coralType === 'branching') {
    const stalkCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < stalkCount; i++) {
      const sx = platform.x + 6 + (i + rng() * 0.5) * (platform.width - 12) / stalkCount;
      const stalkH = bodyH * (0.4 + rng() * 0.3);
      const sy = bodyTop + rng() * (bodyH * 0.2);
      ctx.strokeStyle = '#c94a5a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy + stalkH);
      ctx.quadraticCurveTo(sx + (rng() - 0.5) * 3, sy + stalkH * 0.5, sx + (rng() - 0.5) * 2, sy);
      ctx.stroke();
      const branchN = 1 + Math.floor(rng() * 2);
      for (let b = 0; b < branchN; b++) {
        const bt = 0.3 + rng() * 0.5;
        const side = rng() < 0.5 ? -1 : 1;
        const bx = sx + side * 1;
        const by = sy + stalkH * (1 - bt);
        const blen = 3 + rng() * 3;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + side * blen, by - blen * 0.5);
        ctx.stroke();
        ctx.fillStyle = '#c94a5a';
        ctx.beginPath();
        ctx.arc(bx + side * blen, by - blen * 0.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#c94a5a';
      ctx.beginPath();
      ctx.arc(sx + (rng() - 0.5) * 2, sy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (coralType === 'tube') {
    const tubeCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < tubeCount; i++) {
      const tx = platform.x + 4 + (i + 0.5) * (platform.width - 8) / tubeCount + (rng() - 0.5) * 2;
      const th = 6 + rng() * 6;
      const tyBase = bodyTop + bodyH - 1;
      ctx.fillStyle = '#e07a3a';
      ctx.fillRect(tx - 1.5, tyBase - th, 3, th);
      ctx.fillStyle = '#7a3a14';
      ctx.beginPath();
      ctx.ellipse(tx, tyBase - th, 1.2, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const baseCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < baseCount; i++) {
      const ax = platform.x + (i + 0.5 + rng() * 0.3) * platform.width / baseCount;
      const ay = bodyTop + bodyH * (0.55 + rng() * 0.2);
      ctx.fillStyle = '#e890b0';
      ctx.beginPath();
      ctx.ellipse(ax, ay, 3.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,144,176,0.7)';
      ctx.lineWidth = 1;
      const tentCount = 8;
      for (let t = 0; t < tentCount; t++) {
        const angle = Math.PI + (t / (tentCount - 1)) * Math.PI + (rng() - 0.5) * 0.15;
        const tlen = 4 + rng() * 3;
        const ex = ax + Math.cos(angle) * tlen;
        const ey = ay + Math.sin(angle) * tlen;
        const mx = ax + Math.cos(angle) * tlen * 0.5 + (rng() - 0.5) * 2;
        const my = ay + Math.sin(angle) * tlen * 0.5 + (rng() - 0.5) * 1.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      }
    }
  }

  // Barnacles
  const barnacleCount = 2 + Math.floor(rng() * 4);
  ctx.fillStyle = '#d8d0b8';
  for (let i = 0; i < barnacleCount; i++) {
    const bx = platform.x + 3 + rng() * (platform.width - 6);
    const by = bodyTop + 3 + rng() * Math.max(1, bodyH - 6);
    ctx.beginPath();
    ctx.ellipse(bx, by, 1.4 + rng() * 0.6, 1 + rng() * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const underwater: ArenaPack = {
  // ---- Identity ----
  id: 'underwater',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #0A3A6B 0%, #0E4A8B 40%, #1A6AAA 100%)',
  previewIcon: '\u{1F420}',

  // ---- Translations ----
  translations: { en: 'Underwater', cs: 'Pod vodou', hi: '\u092A\u093E\u0928\u0940 \u0915\u0947 \u0928\u0940\u091A\u0947', fil: 'Ilalim ng Tubig' },

  // ---- Layout ----
  defaultSurface: 'stone',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    { x: 100, y: 410, width: 130, height: 24 },
    { x: 200, y: 275, width: 120, height: 24 },
    { x: 60, y: 150, width: 120, height: 24 },
    { x: 1070, y: 390, width: 110, height: 24 },
    { x: 975, y: 260, width: 100, height: 24 },
    { x: 1100, y: 150, width: 120, height: 24 },
    { x: 330, y: 345, width: 95, height: 24 },
    { x: 865, y: 330, width: 85, height: 24 },
    { x: 290, y: 170, width: 100, height: 24 },
    { x: 890, y: 170, width: 100, height: 24 },
    { x: 540, y: 80, width: 200, height: 24 },
  ]),
  spawnPoints: [
    { x: 200, y: 640 }, { x: 1080, y: 640 },
    { x: 400, y: 640 }, { x: 880, y: 640 },
    { x: 640, y: 640 }, { x: 120, y: 390 },
  ],
  noSpawnZones: [
    { x: 540, y: 56, width: 200, height: 48 },
  ],
  effectZones: [
    { x: 440, y: 0, width: 400, height: 660, type: 'geyser', strength: -500, interval: 0.1, duration: 9999 },
    { x: 200, y: 400, width: 200, height: 260, type: 'current', vx: 70 },
    { x: 880, y: 400, width: 200, height: 260, type: 'current', vx: -70 },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#0A2A4B' },
      { offset: 0.3, color: '#0E3A6B' },
      { offset: 0.6, color: '#1A5A9A' },
      { offset: 1, color: '#2A7ABB' },
    ],
  },

  hills: [
    { x: -20, baseY: 630, width: 380, height: 80, color: '#1A4A6A' },
    { x: 300, baseY: 640, width: 420, height: 60, color: '#164060' },
    { x: 670, baseY: 625, width: 400, height: 90, color: '#1A4A6A' },
    { x: 1000, baseY: 635, width: 350, height: 70, color: '#164060' },
  ],

  ground: {
    surfaceColor: '#C2A868',
    surfaceThickness: 5,
  },

  platform: {
    floatingBodyColor: '#3A7A6A',
    floatingTopColor: '#5AA08A',
    floatingAccentColor: '#FF6B6B',
    groundBodyColor: '#8A7A50',
    groundTopColor: '#C2A868',
    drawMoss: false,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 0,
    color: 'rgba(40, 100, 150, 0.3)',
    minSize: 50,
    maxSize: 80,
    minSpeed: 1,
    maxSpeed: 3,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 30,
    types: [
      { type: 'bubble', weight: 0.8, sizeRange: [2, 6], vxRange: [-5, 5], vyRange: [-20, -50], rotSpeedRange: [0, 0.5] },
      { type: 'petal', weight: 0.2, sizeRange: [2, 4], vxRange: [-8, 8], vyRange: [5, 15], rotSpeedRange: [0.5, 2] },
    ],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'fish', weight: 0.7, colors: ['#FF6B6B', '#FFD700', '#FF8C00', '#7B68EE', '#4A8ABB', '#66CCAA'], speedRange: [20, 45], yRange: [0.15, 0.85] },
      { type: 'fish', weight: 0.3, colors: ['#5AA0CC', '#3A7AAA', '#2288AA'], speedRange: [35, 60], yRange: [0.3, 0.7] },
    ],
  },

  fog: {
    count: 20,
    baseY: 655,
    yVariance: 25,
    speedRange: [1, 4],
    alphaRange: [0.1, 0.25],
    color: '#2A6A9A',
    sizeX: 60,
    sizeY: 12,
  },

  ambientParticles: {
    count: 20,
    sizeRange: [1, 3],
    vxRange: [-2, 2],
    vyRange: [-8, -20],
    alphaRange: [0.15, 0.4],
    colors: ['#88CCFF', '#AADDFF', '#66BBEE'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // Light rays from surface
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#88CCFF';
    for (let r = 0; r < 6; r++) {
      const rx = 100 + r * 200;
      const rw = 40 + r * 10;
      ctx.beginPath();
      ctx.moveTo(rx - rw, 0);
      ctx.lineTo(rx + rw, 0);
      ctx.lineTo(rx + rw * 2, 720);
      ctx.lineTo(rx - rw * 2, 720);
      ctx.closePath();
      ctx.fill();
    }

    // Water surface shimmer at top
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#4A9ACC';
    for (let wx = -20; wx < 1300; wx += 30) {
      const wy = 5 + Math.sin(wx * 0.04) * 8;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant underwater terrain
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#0A3050';
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(80, 500);
    ctx.lineTo(200, 540);
    ctx.lineTo(350, 470);
    ctx.lineTo(500, 520);
    ctx.lineTo(650, 460);
    ctx.lineTo(800, 510);
    ctx.lineTo(950, 450);
    ctx.lineTo(1100, 490);
    ctx.lineTo(1200, 470);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Seaweed — 2-3 stalks from a shared holdfast, each with alternating leaves,
    // a faint outer glow, and tapered thickness so it reads as organic plant life
    // rather than a single painted stroke.
    const drawSeaweed = (sx: number, sy: number, h: number, color: string) => {
      // Darker shade derived from the base color by dimming each channel ~60%.
      const darker = color.replace(/#(..)(..)(..)/, (_m, r, g, b) => {
        const d = (hex: string) => Math.max(0, Math.floor(parseInt(hex, 16) * 0.6)).toString(16).padStart(2, '0');
        return `#${d(r)}${d(g)}${d(b)}`;
      });
      // Small dark holdfast where the seaweed anchors
      ctx.fillStyle = darker;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 0.5, Math.max(3, h * 0.08), Math.max(1.5, h * 0.04), 0, 0, Math.PI * 2);
      ctx.fill();

      const stalkCount = h > 35 ? 3 : 2;
      for (let s = 0; s < stalkCount; s++) {
        const phase = s * 1.7 + (s * s) * 0.4;
        const stalkH = h * (0.7 + (s === 0 ? 0.3 : (s === 1 ? 0.2 : 0.05)));
        const baseOffset = (s - (stalkCount - 1) / 2) * Math.max(1.5, h * 0.05);
        const sway = Math.min(9, h * 0.22);
        const pointAt = (t: number) => {
          const ny = t / stalkH;
          const x = sx + baseOffset + Math.sin(phase + t * 0.18) * sway * (0.3 + ny * 0.9);
          const y = sy - t;
          return { x, y };
        };
        // Outer glow pass — translucent, wider stroke
        ctx.strokeStyle = color + 'cc'; // 80% alpha suffix works for #RGB/#RRGGBB hex
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        ctx.beginPath();
        let p = pointAt(0);
        ctx.moveTo(p.x, p.y);
        for (let t = 2; t <= stalkH; t += 3) {
          p = pointAt(t);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // Inner core — thinner darker stroke for depth
        ctx.strokeStyle = darker;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        p = pointAt(0);
        ctx.moveTo(p.x, p.y);
        for (let t = 2; t <= stalkH; t += 3) {
          p = pointAt(t);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Leaves — alternate sides, taper toward the top
        ctx.fillStyle = color;
        for (let t = Math.max(10, stalkH * 0.2); t < stalkH - 4; t += Math.max(10, stalkH * 0.2)) {
          const anchor = pointAt(t);
          const ny = t / stalkH;
          const side = (Math.floor(t / 8) % 2) === 0 ? 1 : -1;
          const leafLen = 5 + (1 - ny) * 4;
          const leafW = 1.8 + (1 - ny) * 1.2;
          const angle = Math.atan2(anchor.y - pointAt(Math.max(0, t - 2)).y, anchor.x - pointAt(Math.max(0, t - 2)).x) + side * 0.6;
          ctx.beginPath();
          ctx.ellipse(
            anchor.x + Math.cos(angle) * leafLen * 0.55,
            anchor.y + Math.sin(angle) * leafLen * 0.55,
            leafLen * 0.6,
            leafW,
            angle,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          // Leaf highlight
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.ellipse(
            anchor.x + Math.cos(angle) * leafLen * 0.55 - Math.sin(angle) * leafW * 0.4,
            anchor.y + Math.sin(angle) * leafLen * 0.55 + Math.cos(angle) * leafW * 0.4,
            leafLen * 0.35,
            leafW * 0.45,
            angle,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.fillStyle = color;
        }

        // Tiny bright tip — suggests a polyp or bubble
        const tip = pointAt(stalkH);
        ctx.fillStyle = 'rgba(220,255,240,0.7)';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawSeaweed(60, y, 60, '#2A8A4A');
    drawSeaweed(280, y, 50, '#3A9A5A');
    drawSeaweed(480, y, 70, '#2A7A3A');
    drawSeaweed(720, y, 55, '#3A9A5A');
    drawSeaweed(950, y, 65, '#2A8A4A');
    drawSeaweed(1200, y, 45, '#3A9A5A');

    // Coral formations
    const drawCoral = (cx: number, cy: number, size: number, color: string) => {
      ctx.fillStyle = color;
      // Main branches
      for (let b = 0; b < 4; b++) {
        const angle = -Math.PI / 2 + (b - 1.5) * 0.4;
        const bh = size * (0.6 + b * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * bh - 3, cy + Math.sin(angle) * bh);
        ctx.lineTo(cx + Math.cos(angle) * bh + 3, cy + Math.sin(angle) * bh);
        ctx.closePath();
        ctx.fill();
        // Tips
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * bh, cy + Math.sin(angle) * bh, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawCoral(160, y, 35, '#FF6B6B');
    drawCoral(400, y, 28, '#FF8C66');
    drawCoral(800, y, 32, '#FF69B4');
    drawCoral(1060, y, 30, '#FF7B7B');

    // Treasure chest
    const drawTreasureChest = (tx: number, ty: number) => {
      // Body
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(tx - 18, ty - 18, 36, 20);
      // Lid
      ctx.fillStyle = '#9A7A24';
      ctx.beginPath();
      ctx.moveTo(tx - 20, ty - 18);
      ctx.lineTo(tx - 18, ty - 28);
      ctx.lineTo(tx + 18, ty - 28);
      ctx.lineTo(tx + 20, ty - 18);
      ctx.closePath();
      ctx.fill();
      // Lock
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(tx - 4, ty - 22, 8, 8);
      // Keyhole
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(tx, ty - 18, 2, 0, Math.PI * 2);
      ctx.fill();
      // Gold coins spilling
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(tx + 22, ty - 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx + 28, ty - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Gold gleam
      ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
      ctx.beginPath();
      ctx.arc(tx - 8, ty - 24, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    drawTreasureChest(640, y);

    // Starfish
    const drawStarfish = (sx: number, sy: number, size: number, color: string) => {
      ctx.fillStyle = color;
      for (let arm = 0; arm < 5; arm++) {
        const angle = (arm / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(angle - 0.3) * size * 0.3, sy + Math.sin(angle - 0.3) * size * 0.3);
        ctx.lineTo(sx + Math.cos(angle) * size, sy + Math.sin(angle) * size);
        ctx.lineTo(sx + Math.cos(angle + 0.3) * size * 0.3, sy + Math.sin(angle + 0.3) * size * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    };

    drawStarfish(340, y - 3, 10, '#FF6347');
    drawStarfish(880, y - 2, 8, '#FF8C00');

    // Platform decorations
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawSeaweed(mid, plat.y, 30, '#2A8A4A');
      } else if (i % 3 === 1) {
        drawCoral(mid, plat.y, 20, '#FF6B6B');
      } else {
        drawStarfish(mid, plat.y - 2, 6, '#FFD700');
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground coral formation -- left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    // Main coral trunk
    ctx.fillStyle = '#8B2252';
    ctx.beginPath();
    ctx.moveTo(-10, gy + 30);
    ctx.lineTo(-5, gy - 20);
    ctx.lineTo(10, gy - 50);
    ctx.lineTo(25, gy - 65);
    ctx.lineTo(35, gy - 55);
    ctx.lineTo(45, gy - 70);
    ctx.lineTo(55, gy - 50);
    ctx.lineTo(65, gy - 30);
    ctx.lineTo(80, gy - 45);
    ctx.lineTo(95, gy - 25);
    ctx.lineTo(105, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Coral branch tips -- brighter
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#CC4488';
    ctx.beginPath();
    ctx.arc(25, gy - 65, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(45, gy - 70, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(80, gy - 45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Large foreground coral formation -- right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#CC6622';
    ctx.beginPath();
    ctx.moveTo(1175, gy + 30);
    ctx.lineTo(1185, gy - 15);
    ctx.lineTo(1200, gy - 50);
    ctx.lineTo(1215, gy - 60);
    ctx.lineTo(1225, gy - 45);
    ctx.lineTo(1240, gy - 70);
    ctx.lineTo(1255, gy - 55);
    ctx.lineTo(1270, gy - 30);
    ctx.lineTo(1290, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Bright tips
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#FFAA44';
    ctx.beginPath();
    ctx.arc(1215, gy - 60, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1240, gy - 70, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Large foreground kelp strands
    ctx.save();
    ctx.globalAlpha = 0.45;
    const drawFgKelp = (sx: number, h: number, lean: number) => {
      // Thick kelp stalk
      ctx.strokeStyle = '#0D5A2A';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(sx, gy + 10);
      for (let t = 0; t < h; t += 8) {
        ctx.lineTo(sx + Math.sin(t * 0.08) * 18 + lean * (t / h), gy - t);
      }
      ctx.stroke();
      // Large kelp leaves
      ctx.fillStyle = '#1A6A3A';
      for (let t = 15; t < h; t += 20) {
        const lx = sx + Math.sin(t * 0.08) * 18 + lean * (t / h);
        const ly = gy - t;
        const side = (t % 40 < 20) ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(lx + side * 14, ly, 16, 6, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawFgKelp(50, 80, -8);
    drawFgKelp(1230, 75, 8);
    ctx.restore();

    // Foreground seaweed (original, thinner)
    ctx.save();
    ctx.globalAlpha = 0.4;
    const drawFgSeaweed = (sx: number, h: number) => {
      ctx.strokeStyle = '#1A6A3A';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx, gy + 10);
      for (let t = 0; t < h; t += 10) {
        ctx.lineTo(sx + Math.sin(t * 0.12) * 12, gy - t);
      }
      ctx.stroke();
      ctx.fillStyle = '#1A6A3A';
      for (let t = 20; t < h; t += 25) {
        ctx.beginPath();
        ctx.ellipse(sx + Math.sin(t * 0.12) * 12 + 8, gy - t, 10, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawFgSeaweed(150, 70);
    drawFgSeaweed(1130, 60);
    ctx.restore();

    // Caustic light pattern on ground
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#88DDFF';
    for (let cx = 30; cx < 1250; cx += 90) {
      const cy = gy - 15 + Math.sin(cx * 0.05) * 10;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30 + Math.sin(cx * 0.03) * 12, 12, Math.sin(cx * 0.02) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => {
    drawUnderwaterPlatformBg(ctx, platform, isGround);
  },

  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawUnderwaterPlatformFg(ctx, platform);
  },

  drawWeatherParticle: (ctx, w) => {
    // No rotation was applied before — bubble + plankton are circles.
    // Draw at world coords; the bubble highlight's fixed-offset position
    // is identical to the previous translate(w.x,w.y) + arc(-0.3s,-0.3s).
    if (w.type === 'bubble') {
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220, 240, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(w.x - w.size * 0.3, w.y - w.size * 0.3, w.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(100, 180, 140, 0.3)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ---- Gameplay modifiers ----
  physics: {
    gravity: 0.6,
    friction: 1.2,
    walkSpeed: 0.7,
    jumpImpulse: 0.9,
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    // Sea urchin -- dark spiky ball
    const urchinCX = x + width / 2;
    const urchinCY = y + height * 0.5;
    const urchinR = Math.min(width, height) * 0.35;

    // Core body
    ctx.fillStyle = '#1A1A2A';
    ctx.beginPath();
    ctx.arc(urchinCX, urchinCY, urchinR, 0, Math.PI * 2);
    ctx.fill();

    // Dark purple shading
    ctx.fillStyle = '#2A1A3A';
    ctx.beginPath();
    ctx.arc(urchinCX + urchinR * 0.15, urchinCY + urchinR * 0.1, urchinR * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Spines radiating outward
    ctx.strokeStyle = '#1A1028';
    ctx.lineWidth = 1.5;
    const spineCount = 16;
    for (let i = 0; i < spineCount; i++) {
      const angle = (i / spineCount) * Math.PI * 2;
      const spineLen = urchinR * (1.4 + (i % 3) * 0.2);
      ctx.beginPath();
      ctx.moveTo(
        urchinCX + Math.cos(angle) * urchinR * 0.7,
        urchinCY + Math.sin(angle) * urchinR * 0.7,
      );
      ctx.lineTo(
        urchinCX + Math.cos(angle) * spineLen,
        urchinCY + Math.sin(angle) * spineLen,
      );
      ctx.stroke();
    }

    // Purple tip dots
    ctx.fillStyle = '#4A2A5A';
    for (let i = 0; i < spineCount; i += 2) {
      const angle = (i / spineCount) * Math.PI * 2;
      const spineLen = urchinR * (1.4 + (i % 3) * 0.2);
      ctx.beginPath();
      ctx.arc(
        urchinCX + Math.cos(angle) * spineLen,
        urchinCY + Math.sin(angle) * spineLen,
        1.5, 0, Math.PI * 2,
      );
      ctx.fill();
    }

    // Highlight
    ctx.fillStyle = 'rgba(100, 80, 140, 0.3)';
    ctx.beginPath();
    ctx.arc(urchinCX - urchinR * 0.25, urchinCY - urchinR * 0.25, urchinR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.5;
    const openAmount = 0.3 + Math.abs(bounceTimer) * 0.04;

    // Bottom shell half
    ctx.fillStyle = '#8A7A6A';
    ctx.beginPath();
    ctx.ellipse(x, y, halfW, size * 0.18, 0, 0, Math.PI);
    ctx.fill();
    // Shell ridges bottom
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.4)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 5; r++) {
      const angle = (r / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * halfW, y + Math.sin(angle) * size * 0.18);
      ctx.stroke();
    }

    // Top shell half (hinges open based on bounceTimer)
    ctx.save();
    ctx.translate(x - halfW, y);
    ctx.rotate(-openAmount);
    ctx.fillStyle = '#9A8A7A';
    ctx.beginPath();
    ctx.ellipse(halfW, 0, halfW, size * 0.18, 0, Math.PI, 0);
    ctx.fill();
    // Shell ridges top
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.4)';
    for (let r = 0; r < 5; r++) {
      const angle = Math.PI + (r / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW + Math.cos(angle) * halfW, Math.sin(angle) * size * 0.18);
      ctx.stroke();
    }
    ctx.restore();

    // Pearl inside (visible when open)
    if (openAmount > 0.2) {
      ctx.fillStyle = '#F0E8E0';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.06, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Pearl shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(x - size * 0.03, y - size * 0.09, size * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  ghostConfig: {
    count: 2,
    speed: 25,
    size: 36,
    color: 'rgba(220, 120, 255, 0.7)',
    glowColor: '#CC66FF',
  },

  drawCustomGhost: (ctx, x, y, size, alpha, time) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha * (0.6 + Math.sin(time * 1.2) * 0.15);

    // Jellyfish bell -- pulsing dome
    const pulse = 1 + Math.sin(time * 2.5) * 0.08;
    const bellW = size * 0.5 * pulse;
    const bellH = size * 0.35;

    // Glow
    const glow = ctx.createRadialGradient(0, -bellH * 0.3, size * 0.1, 0, 0, size * 1.2);
    glow.addColorStop(0, 'rgba(220, 160, 255, 0.4)');
    glow.addColorStop(1, 'rgba(220, 160, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-size * 1.2, -size * 1.2, size * 2.4, size * 2.4);

    // Bell dome
    const bellGrad = ctx.createRadialGradient(0, -bellH * 0.5, bellW * 0.2, 0, -bellH * 0.3, bellW);
    bellGrad.addColorStop(0, 'rgba(240, 200, 255, 0.85)');
    bellGrad.addColorStop(0.6, 'rgba(200, 140, 240, 0.65)');
    bellGrad.addColorStop(1, 'rgba(160, 100, 220, 0.45)');
    ctx.fillStyle = bellGrad;
    ctx.beginPath();
    ctx.ellipse(0, -bellH * 0.3, bellW, bellH, 0, Math.PI, 0);
    // Scalloped rim
    const scallops = 6;
    for (let i = 0; i < scallops; i++) {
      const sx = bellW - (i + 1) * (bellW * 2 / scallops);
      const sy = -bellH * 0.3 + Math.sin(time * 2 + i) * 2;
      const nx = bellW - (i + 1.5) * (bellW * 2 / scallops);
      ctx.quadraticCurveTo((sx + nx) / 2, sy + 5, nx, sy);
    }
    ctx.closePath();
    ctx.fill();

    // Tentacles -- wavy strands hanging down
    ctx.lineWidth = 1.5;
    const tentCount = 5;
    for (let t = 0; t < tentCount; t++) {
      const tx = -bellW * 0.6 + t * (bellW * 1.2 / (tentCount - 1));
      const tentLen = size * (0.5 + (t % 2) * 0.25);
      ctx.strokeStyle = `rgba(220, 160, 255, ${0.5 + (t % 2) * 0.15})`;
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      for (let s = 1; s <= 4; s++) {
        const sy = s * tentLen / 4;
        const sx = tx + Math.sin(time * 2 + t * 1.2 + s * 0.8) * 6;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Inner highlight on bell
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.2, -bellH * 0.5, bellW * 0.25, bellH * 0.3, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  drawAnimatedBackground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    ctx.save();
    // Bubbles only — fish school renders entirely in foreground so it doesn't
    // get split across z-order layers.
    ctx.strokeStyle = '#dcf0ff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let li = 0; li < BUBBLE_LEAKS.length; li++) {
      const lk = BUBBLE_LEAKS[li];
      for (let i = 0; i < 6; i++) {
        const t = ((time * 0.7 + i * 0.16 + li * 0.21) % 1);
        const bx = lk.x + fastSin(time * 2.5 + i + li) * 5;
        const by = lk.y - t * 80;
        const rad = 1.2 + t * 1.8;
        const a = (1 - t) * 0.85;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath();
        ctx.arc(bx - 0.5, by - 0.5, rad * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let ci = 0; ci < BUBBLE_COLUMNS.length; ci++) {
      for (let i = 0; i < 4; i++) {
        const t = ((time * 0.4 + i * 0.25 + ci * 0.13) % 1);
        const bx = BUBBLE_COLUMNS[ci] + fastSin(time * 1.5 + i + ci) * 12;
        const by = 660 - t * 600;
        const rad = 1.5 + t * 2.5;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  drawGroundCritters: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice() || !matchState) return;
    drawCrab(ctx, time, matchState.players);
  },

  drawAnimatedForeground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice() || !matchState) return;
    ctx.save();
    // Use Math.sin (not fastSin) for the slow school sweep — fastSin's 1°
    // table resolution causes the position to step in 7-12px chunks at the
    // 0.18 rad/s frequency (effective ~10Hz updates), which reads as visible
    // choppiness even though render runs at 60Hz. Per-fish high-frequency
    // wobble below stays on fastSin since it advances multiple degrees per
    // frame and the steps are sub-pixel.
    const cxBase = CANVAS_WIDTH * 0.5 + Math.sin(time * 0.18) * (CANVAS_WIDTH * 0.32);
    const cy = 380 + Math.sin(time * 0.5) * 40;
    // School direction = sign of d/dt sin(time*0.18) = sign of cos(time*0.18).
    const facing: 1 | -1 = Math.cos(time * 0.18) >= 0 ? 1 : -1;
    const players = matchState.players;
    for (let i = 0; i < FISH_COUNT; i++) drawFish(ctx, i, time, cxBase, cy, facing, players);
    ctx.restore();
  },

  bubbleHelmet: true,
  musicFile: 'underwater.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'g',x:440},{t:2,y:'g',x:440},{t:3,y:'g',x:440},{t:4,y:'g',x:808},{t:5,y:'g',x:808},{t:6,y:'g',x:808},{t:7,y:'g',x:440},{t:8,y:'g',x:808},{t:9,y:'g',x:440},{t:10,y:'g',x:808},{t:11,y:'g',x:624}],
      [{t:0,y:'d',x:198},{t:2,y:'j',x:198},{t:4,y:'j',x:100},{t:7,y:'j',x:198}],
      [{t:0,y:'d',x:288},{t:1,y:'d',x:200},{t:3,y:'j',x:200},{t:7,y:'d',x:288},{t:9,y:'j',x:288}],
      [{t:0,y:'d',x:148},{t:1,y:'d',x:148},{t:2,y:'d',x:148},{t:4,y:'d',x:60},{t:6,y:'j',x:60},{t:7,y:'d',x:148}],
      [{t:0,y:'d',x:1070},{t:5,y:'j',x:1070},{t:8,y:'j',x:1070}],
      [{t:0,y:'d',x:975},{t:4,y:'d',x:1043},{t:6,y:'j',x:1043},{t:8,y:'d',x:975},{t:10,y:'j',x:975}],
      [{t:0,y:'d',x:1100},{t:1,y:'d',x:1188},{t:3,y:'j',x:1188},{t:4,y:'d',x:1100},{t:5,y:'d',x:1100},{t:8,y:'d',x:1100}],
      [{t:0,y:'d',x:393},{t:1,y:'d',x:330},{t:2,y:'j',x:330},{t:3,y:'g',x:440},{t:5,y:'g',x:808},{t:6,y:'g',x:808},{t:8,y:'g',x:808},{t:9,y:'g',x:440},{t:10,y:'g',x:808},{t:11,y:'g',x:624}],
      [{t:0,y:'d',x:865},{t:5,y:'j',x:918},{t:10,y:'j',x:904},{t:2,y:'g',x:440},{t:3,y:'g',x:440},{t:6,y:'g',x:808},{t:9,y:'g',x:440},{t:11,y:'g',x:624}],
      [{t:0,y:'d',x:358},{t:1,y:'d',x:290},{t:2,y:'d',x:290},{t:3,y:'j',x:290},{t:7,y:'d',x:358},{t:11,y:'j',x:358},{t:6,y:'g',x:808}],
      [{t:0,y:'d',x:890},{t:4,y:'d',x:958},{t:5,y:'d',x:958},{t:6,y:'j',x:958},{t:8,y:'d',x:890},{t:11,y:'j',x:890},{t:3,y:'g',x:440}],
      [{t:0,y:'d',x:708},{t:7,y:'d',x:540},{t:8,y:'d',x:708}],
    ],
    nextHop: [[-1,1,2,3,4,5,6,7,8,9,10,11],[0,-1,2,0,4,0,0,7,0,0,0,0],[0,1,-1,3,1,0,0,7,0,9,0,0],[0,1,2,-1,4,4,6,7,4,2,0,0],[0,0,0,0,-1,5,0,0,8,0,0,0],[0,6,0,0,4,-1,6,0,8,0,10,0],[0,1,1,3,4,5,-1,1,8,0,5,0],[0,1,2,3,1,5,6,-1,8,9,10,11],[0,0,2,3,5,5,6,0,-1,9,10,11],[0,1,2,3,1,0,6,7,11,-1,0,11],[0,6,0,3,4,5,6,11,8,0,-1,11],[0,7,7,0,0,8,0,7,8,0,8,-1]],
    safeHop: [[-1,1,2,3,4,5,6,7,8,9,10,11],[0,-1,2,0,4,0,0,7,0,0,0,0],[0,1,-1,3,1,0,0,7,0,9,0,0],[0,1,2,-1,4,4,6,7,4,2,0,0],[0,0,0,0,-1,5,0,0,8,0,0,0],[0,6,0,0,4,-1,6,0,8,0,10,0],[0,1,1,3,4,5,-1,1,8,0,5,0],[0,1,2,3,1,5,6,-1,8,9,10,11],[0,0,2,3,5,5,6,0,-1,9,10,11],[0,1,2,3,1,0,6,7,11,-1,0,11],[0,6,0,3,4,5,6,11,8,0,-1,11],[0,7,7,0,0,8,0,7,8,0,8,-1]],
  },
  // NAV-DATA-END
};
