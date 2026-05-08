import type { ArenaPack } from '../types';
import type { Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { drawTree, drawFgLeafCluster } from '../../themes/drawPrimitives';
import { buildHangingVine, buildFern } from '../../gameLoop/cosmetics/sharedDecorationKinds';
import { pushFromPlayers, makeDtTracker, tickGroundCritter, type GroundCritterState } from '../../themes/utils';
import type { Player } from '../../types';
import {
  registerReactiveKind, createReactiveInstance,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics/reactiveDecorations';

const SQUIRRELS_CFG = [
  { platL: 450, platR: 730, platTopY: 256, walkSpeed: 45, fleeSpeed: 140, fleeRadius: 110, yTolerance: 60 },
  { platL: 520, platR: 760, platTopY: 366, walkSpeed: 50, fleeSpeed: 150, fleeRadius: 110, yTolerance: 60 },
  { platL: 140, platR: 310, platTopY: 486, walkSpeed: 45, fleeSpeed: 140, fleeRadius: 100, yTolerance: 60 },
];
const _squirrels: GroundCritterState[] = SQUIRRELS_CFG.map((cfg, i) => ({
  x: (cfg.platL + cfg.platR) / 2,
  dir: i % 2 === 0 ? 1 : -1, facingEase: 1, fleeing: false, committedFleeDir: 0,
}));
const _tickSquirrelDt = makeDtTracker();
const TREETOPS_BUTTERFLY_HUES = [320, 60, 200, 290, 30, 160] as const;
const TREETOPS_BUTTERFLY_COLORS = TREETOPS_BUTTERFLY_HUES.map(h => `hsl(${h},80%,65%)`);
const TREETOPS_FERN_COLOR = '#2A6A2A';
const TREETOPS_BEE_CLUSTERS = [
  { homeX: 280, homeY: 380, phase: 0 },
  { homeX: 940, homeY: 360, phase: 2.4 },
] as const;

function drawTreetopsButterfly(ctx: CanvasRenderingContext2D, i: number, time: number, players: ReadonlyArray<Player>): void {
  const driftSpeed = 0.05 + (i % 3) * 0.015;
  const homeX = ((i * 220 + time * 60 * driftSpeed) % (CANVAS_WIDTH + 200)) - 100;
  const homeY = 320 + fastSin(time * 0.4 + i * 1.7) * 90 + (i % 3) * 30;
  const flutterX = homeX + fastSin(time * 1.2 + i) * 22;
  const flutterY = homeY + fastSin(time * 1.5 + i * 1.7) * 14;
  const r = pushFromPlayers(players, flutterX, flutterY, 70, 14, 4);
  const flap = fastSin(time * 14 + i * 3) * 0.5 + 0.5;
  ctx.fillStyle = TREETOPS_BUTTERFLY_COLORS[i];
  ctx.beginPath();
  ctx.ellipse(r.x - 4, r.y, 4 * flap, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(r.x + 4, r.y, 4 * flap, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x - 0.5, r.y - 3, 1, 6);
}

function drawTreetopsBeeCluster(ctx: CanvasRenderingContext2D, ci: number, time: number, players: ReadonlyArray<Player>): void {
  const c = TREETOPS_BEE_CLUSTERS[ci];
  const wanderX = c.homeX + fastSin(time * 0.25 + c.phase) * 180;
  const wanderY = c.homeY + fastSin(time * 0.4 + c.phase + 1) * 50;
  const r = pushFromPlayers(players, wanderX, wanderY, 110, 28, 8);
  for (let i = 0; i < 5; i++) {
    const ph = ci * 7 + i;
    const bx = r.x + fastSin(time * 4 + ph) * 16 + (i % 3 - 1) * 5;
    const by = r.y + fastCos(time * 3 + ph) * 10 + (Math.floor(i / 3) - 0.5) * 5;
    const wig = fastSin(time * 16 + ph) * 1.4;
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.ellipse(bx, by + wig, 2.6, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a08';
    ctx.fillRect(bx - 1.5, by + wig - 0.3, 0.8, 0.6);
    ctx.fillRect(bx, by + wig - 0.3, 0.8, 0.6);
  }
}
import { getFloatingPlatforms } from '../../themes/utils';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  wavyDown, backWavyUp, drawLeafCluster, leftWavy,
} from '../../themes/drawPrimitives';

const MOSS_TUFT_COLORS = ['#4a7828', '#6a9a3a', '#8fa84f'];

function drawTreetopsPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;
  const sp = skewPx();

  // Right face — darker wood (shadow side)
  drawPlatformRightFace(ctx, platform, '#3a2208');

  // Left-side leaf clusters (extend LEFT of platform.x — don't overlap player
  // when player is inside body region, can stay in bg)
  if (platform.width >= 70) {
    const clusterN = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < clusterN; i++) {
      const t = (i + 0.3 + rng() * 0.4) / clusterN;
      const cy = bodyTop + 4 + t * (bodyH - 8);
      const size = 5 + rng() * 2;
      const cx = platform.x - size * (0.25 + rng() * 0.4);
      drawLeafCluster(ctx, cx, cy, size, rng);
    }
  }

  // Edge profiles — wavy rounded (front + back)
  const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 4, ampMin: 2, ampMax: 4, valleyBase: 0.3 });
  const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 3, ampMin: 2, ampMax: 3.5 });
  const leftPts = leftWavy(cB, cF, platform.x, rng, { bumps: 2, ampMin: 1.5, ampMax: 3 });

  // Cap — mossy green with scattered tufts
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#5a8a3a',
    capLight: 'rgba(240,255,200,0.18)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      const n = Math.max(2, Math.floor(platform.width / 10));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + rng() * 0.4) / n;
        const v = 0.15 + rng() * 0.7;
        const tx = platform.x + u * platform.width + v * skew;
        const ty = capFront - v * CAP_DEPTH;
        ctx2.fillStyle = MOSS_TUFT_COLORS[Math.floor(rng() * MOSS_TUFT_COLORS.length)];
        const r = 0.9 + rng() * 0.6;
        ctx2.beginPath();
        ctx2.arc(tx, ty, r, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);
}

function drawTreetopsPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — warm wood gradient
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#8a5a2a');
  g.addColorStop(0.5, '#6a3e1c');
  g.addColorStop(1, '#4a2810');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Vertical bark ridges
  const ridgeN = 3 + Math.floor(rng() * 3);
  ctx.strokeStyle = 'rgba(40,20,10,0.45)';
  for (let i = 0; i < ridgeN; i++) {
    const baseX = platform.x + (i + 0.5 + (rng() - 0.5) * 0.3) / ridgeN * platform.width;
    const wobblePhase = rng() * Math.PI * 2;
    ctx.lineWidth = 1 + rng() * 0.3;
    ctx.beginPath();
    ctx.moveTo(baseX, bodyTop);
    for (let py = 2; py <= bodyH; py += 3) {
      const wobble = Math.sin(py * 0.28 + wobblePhase) * 1.0 + Math.sin(py * 0.11 + wobblePhase * 1.7) * 0.5;
      ctx.lineTo(baseX + wobble, bodyTop + py);
    }
    ctx.stroke();
  }

  // Knots
  const knotN = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < knotN; i++) {
    const kx = platform.x + 4 + rng() * Math.max(1, platform.width - 8);
    const ky = bodyTop + 3 + rng() * Math.max(1, bodyH - 6);
    const kr = 3 + rng() * 1.5;
    const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    kg.addColorStop(0, '#3a2008');
    kg.addColorStop(1, '#6a4020');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr, kr * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);
}

// ============================================================================
// Reactive decoration factories + draw fns
// ============================================================================

type TreeFoliage = { color: string; yOff: number; rx: number; ry: number };

// ---- treetops.tree ----
interface TreeData { size: number; foliage: TreeFoliage[]; }
function treetopsTree(x: number, y: number, size: number, foliage: TreeFoliage[]): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'treetops.tree',
    seed: Math.floor((x * 73 + y * 31) % 997),
    data: { size, foliage } satisfies TreeData,
    windAmp: 3,
    shakeRadius: 100, // larger than meadow trees (treetops trees are bigger)
    burst: { threshold: 0.95, particleKind: 'leaf', count: 14 },
  });
}
registerReactiveKind('treetops.tree', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { size, foliage } = inst.data as TreeData;
    const lean = swayPhase + (inst.shakeDecay > 0 ? Math.sin(inst.shakeDecay * 40) * inst.shakeDecay * 4 : 0);
    ctx.save();
    ctx.translate(inst.pos.x, inst.pos.y);
    ctx.rotate(lean * 0.015);
    drawTree(ctx, 0, 0, size, { trunk: '#4A3018', bark: '#3A2010', foliage });
    ctx.restore();
  },
});

// ---- treetops.butterfly ----
function treetopsButterfly(idx: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: 0, y: 0 }, kind: 'treetops.butterfly',
    seed: idx,
    proximity: { radius: 70, mode: 'flee', magnitude: 14 },
  });
}
registerReactiveKind('treetops.butterfly', {
  layer: 'postPlayer',
  highFrequency: true, // flock motion needs 60Hz
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    drawTreetopsButterfly(ctx, inst.seed, time, state.players);
  },
});

// ---- treetops.bee ----
function treetopsBeeCluster(idx: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: TREETOPS_BEE_CLUSTERS[idx].homeX, y: TREETOPS_BEE_CLUSTERS[idx].homeY },
    kind: 'treetops.bee',
    seed: idx,
    proximity: { radius: 110, mode: 'flee', magnitude: 28 },
  });
}
registerReactiveKind('treetops.bee', {
  layer: 'postPlayer',
  highFrequency: true,
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    drawTreetopsBeeCluster(ctx, inst.seed, time, state.players);
  },
});

export const treetops: ArenaPack = {
  // ---- Identity ----
  id: 'treetops',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #1A3A1A 0%, #2D5A2D 40%, #4A8A4A 100%)',
  previewIcon: '\u{1F333}',

  // ---- Translations ----
  translations: { en: 'Treetops', cs: 'Koruny strom\u016F', hi: '\u092A\u0947\u0921\u093C\u094B\u0902 \u0915\u0940 \u091A\u094B\u091F\u0940', fil: 'Tuktok ng Puno' },

  // ---- Layout ----
  defaultSurface: 'wood',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 30, y: 600, width: 180, height: 24 },
    { x: 400, y: 590, width: 240, height: 24 },
    { x: 800, y: 600, width: 220, height: 24 },
    { x: 1100, y: 585, width: 160, height: 24 },
    { x: 120, y: 490, width: 200, height: 24 },
    { x: 460, y: 480, width: 180, height: 24 },
    { x: 700, y: 485, width: 160, height: 24 },
    { x: 1000, y: 475, width: 200, height: 24 },
    { x: 310, y: 540, width: 50, height: 20 },
    { x: 680, y: 545, width: 50, height: 20 },
    { x: 950, y: 535, width: 50, height: 20 },
    { x: 50, y: 380, width: 160, height: 24 },
    { x: 500, y: 370, width: 280, height: 24 },
    { x: 1050, y: 375, width: 160, height: 24 },
    { x: 440, y: 260, width: 300, height: 24 },
    { x: 300, y: 430, width: 70, height: 20 },
    { x: 880, y: 425, width: 70, height: 20 },
    { x: 280, y: 320, width: 70, height: 20 },
    { x: 850, y: 315, width: 70, height: 20 },
  ]),
  spawnPoints: [
    { x: 120, y: 580 }, { x: 1180, y: 565 },
    { x: 500, y: 570 }, { x: 900, y: 580 },
    { x: 640, y: 240 }, { x: 220, y: 470 },
  ],
  allowFallOff: true,

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#1A3A1A' },
      { offset: 0.3, color: '#1E4A1E' },
      { offset: 0.6, color: '#2D5A2D' },
      { offset: 1, color: '#3A6A3A' },
    ],
  },

  hills: [
    // Pushed below screen -- treetops has no ground, hills would float in the void
    { x: -20, baseY: 780, width: 400, height: 50, color: '#1A3A1A' },
    { x: 350, baseY: 780, width: 450, height: 40, color: '#153515' },
    { x: 750, baseY: 780, width: 380, height: 55, color: '#1A3A1A' },
    { x: 1050, baseY: 780, width: 350, height: 45, color: '#153515' },
  ],

  ground: {
    surfaceColor: '#2D5A2D',
    surfaceThickness: 3,
  },

  platform: {
    floatingBodyColor: '#5A3A20',
    floatingTopColor: '#7A5A30',
    floatingAccentColor: '#4A8A3A',
    groundBodyColor: '#4A3018',
    groundTopColor: '#6A4A28',
    drawMoss: true,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 0,
    color: 'rgba(100, 150, 100, 0.3)',
    minSize: 40,
    maxSize: 60,
    minSpeed: 1,
    maxSpeed: 3,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 35,
    types: [
      { type: 'leaf', weight: 0.7, sizeRange: [3, 7], vxRange: [-15, 15], vyRange: [15, 40], rotSpeedRange: [1, 4] },
      { type: 'petal', weight: 0.3, sizeRange: [2, 4], vxRange: [-10, 10], vyRange: [10, 25], rotSpeedRange: [2, 5] },
    ],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'bird', weight: 0.4, colors: ['#2A4A2A', '#3A5A3A', '#4A6A4A'], speedRange: [30, 60], yRange: [0.05, 0.3] },
      { type: 'butterfly', weight: 0.6, colors: ['#88CC44', '#AADD66', '#66AA22', '#CCEE88'], speedRange: [10, 25], yRange: [0.15, 0.7] },
    ],
  },

  fog: {
    count: 25,
    baseY: 660,
    yVariance: 30,
    speedRange: [2, 5],
    alphaRange: [0.15, 0.35],
    color: '#2A5A2A',
    sizeX: 55,
    sizeY: 12,
  },

  ambientParticles: {
    count: 18,
    sizeRange: [1, 2.5],
    vxRange: [-3, 3],
    vyRange: [-5, -15],
    alphaRange: [0.2, 0.5],
    colors: ['#FFFFAA', '#AAFFAA', '#CCFFCC'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: true,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // Dense canopy above -- dappled light
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#0A2A0A';
    // Large overlapping leaf clusters forming canopy
    const canopyLeaves = [
      [-20, 20, 120], [80, 10, 100], [170, 30, 110], [270, 5, 130],
      [380, 25, 105], [470, 10, 120], [570, 20, 115], [670, 8, 125],
      [760, 28, 110], [860, 12, 120], [950, 22, 105], [1040, 6, 130],
      [1140, 18, 115], [1230, 10, 100],
    ];
    for (const [lx, ly, ls] of canopyLeaves) {
      ctx.beginPath();
      ctx.ellipse(lx as number, ly as number, (ls as number) * 0.6, (ls as number) * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lighter dappled spots (sunlight through canopy)
    ctx.fillStyle = '#4A8A4A';
    ctx.globalAlpha = 0.08;
    for (let dx = 30; dx < 1260; dx += 70) {
      const dy = 60 + Math.sin(dx * 0.03) * 20;
      ctx.beginPath();
      ctx.ellipse(dx, dy + 200, 25 + Math.sin(dx * 0.05) * 10, 150, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Decorative light beam piercing through canopy
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#FFFFAA';
    ctx.beginPath();
    ctx.moveTo(580, 0);
    ctx.lineTo(520, 720);
    ctx.lineTo(680, 720);
    ctx.lineTo(700, 0);
    ctx.closePath();
    ctx.fill();
    // Brighter core
    ctx.globalAlpha = 0.04;
    ctx.beginPath();
    ctx.moveTo(620, 0);
    ctx.lineTo(580, 720);
    ctx.lineTo(640, 720);
    ctx.lineTo(660, 0);
    ctx.closePath();
    ctx.fill();

    // Massive tree trunks spanning full height (canopy to abyss)
    ctx.fillStyle = '#2A1A0A';
    ctx.globalAlpha = 0.2;
    ctx.fillRect(50, 0, 40, 720);
    ctx.fillRect(380, 0, 50, 720);
    ctx.fillRect(750, 0, 45, 720);
    ctx.fillRect(1100, 0, 40, 720);

    ctx.restore();
  },

  // Trees, hanging vines, ferns, butterflies, bees are reactive
  // (built via buildReactiveDecorations below). drawBackgroundNature only
  // emits static decorations (nests, acorns) so they bake into the
  // OffscreenCanvas cache.
  drawBackgroundNature: (ctx, arena) => {
    // Bird nests on platforms
    const drawNest = (nx: number, ny: number, size: number) => {
      ctx.fillStyle = '#5A3A18';
      ctx.beginPath();
      ctx.ellipse(nx, ny - 2, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Twigs
      ctx.strokeStyle = '#6A4A28';
      ctx.lineWidth = 1;
      for (let t = 0; t < 5; t++) {
        const angle = (t / 5) * Math.PI + 0.3;
        ctx.beginPath();
        ctx.moveTo(nx + Math.cos(angle) * size * 0.3, ny - 3);
        ctx.lineTo(nx + Math.cos(angle) * size * 0.7, ny - 6 - t);
        ctx.stroke();
      }
      // Eggs
      ctx.fillStyle = '#E8E8D8';
      ctx.beginPath();
      ctx.ellipse(nx - 3, ny - 5, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(nx + 3, ny - 5, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // Acorns
    const drawAcorn = (ax: number, ay: number) => {
      ctx.fillStyle = '#8B6914';
      ctx.beginPath();
      ctx.ellipse(ax, ay - 5, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cap
      ctx.fillStyle = '#5A3A18';
      ctx.beginPath();
      ctx.ellipse(ax, ay - 9, 5, 3, 0, Math.PI, 0);
      ctx.fill();
      // Stem
      ctx.strokeStyle = '#5A3A18';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 12);
      ctx.lineTo(ax, ay - 15);
      ctx.stroke();
    };

    // Platform static decorations (nests + acorns only — vines + ferns are reactive)
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (plat.width > 200) {
        drawNest(mid, plat.y, 20);
        drawAcorn(plat.x + 40, plat.y);
        drawAcorn(plat.x + plat.width - 40, plat.y);
      } else if (plat.width > 120) {
        if (i % 2 === 0) drawNest(mid, plat.y, 15);
        else { drawAcorn(mid - 8, plat.y); drawAcorn(mid + 8, plat.y); }
      } else {
        drawAcorn(mid, plat.y);
      }
    }
  },

  buildReactiveDecorations: (arena) => {
    const out: ReactiveInstance[] = [];
    // Three large rooted trees (rooted at y=750, below the visible canvas)
    out.push(treetopsTree(100, 750, 70, [
      { color: '#1A5A1A', yOff: 0.4, rx: 0.6, ry: 0.35 },
      { color: '#2A7A2A', yOff: 0.65, rx: 0.5, ry: 0.3 },
      { color: '#3A8A3A', yOff: 0.85, rx: 0.35, ry: 0.22 },
    ]));
    out.push(treetopsTree(640, 750, 80, [
      { color: '#1A5A1A', yOff: 0.4, rx: 0.55, ry: 0.35 },
      { color: '#2A7A2A', yOff: 0.6, rx: 0.45, ry: 0.3 },
      { color: '#3A8A3A', yOff: 0.8, rx: 0.3, ry: 0.2 },
    ]));
    out.push(treetopsTree(1180, 750, 65, [
      { color: '#1A5A1A', yOff: 0.45, rx: 0.55, ry: 0.3 },
      { color: '#2A7A2A', yOff: 0.65, rx: 0.45, ry: 0.25 },
      { color: '#3A8A3A', yOff: 0.8, rx: 0.3, ry: 0.2 },
    ]));

    // Hanging vines + ferns on floating platforms
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      out.push(buildHangingVine(plat.x + 10, plat.y + plat.height, 20 + i * 3));
      out.push(buildHangingVine(plat.x + plat.width - 10, plat.y + plat.height, 18 + i * 2));
      if (plat.width > 200) {
        out.push(buildFern(plat.x + 15, plat.y, TREETOPS_FERN_COLOR));
        out.push(buildFern(plat.x + plat.width - 15, plat.y, TREETOPS_FERN_COLOR));
      } else if (plat.width > 120) {
        out.push(buildFern(plat.x + 8, plat.y, TREETOPS_FERN_COLOR));
      }
    }

    // Butterflies + bee clusters (60Hz flock motion)
    for (let i = 0; i < TREETOPS_BUTTERFLY_HUES.length; i++) out.push(treetopsButterfly(i));
    for (let ci = 0; ci < TREETOPS_BEE_CLUSTERS.length; ci++) out.push(treetopsBeeCluster(ci));

    return out;
  },

  drawForegroundNature: (ctx, arena) => {
    const floats = getFloatingPlatforms(arena.platforms);

    // Foreground leaves hanging down from top
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1A4A1A';
    for (let lx = -10; lx < 1300; lx += 50 + Math.random() * 40) {
      const ly = -5 + Math.sin(lx * 0.04) * 15;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 20 + Math.random() * 15, 12 + Math.random() * 8, Math.sin(lx * 0.02) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Foreground leaf clusters on platforms
    for (const plat of floats) {
      if (plat.width > 150) {
        drawFgLeafCluster(ctx, plat.x + plat.width * 0.3, plat.y, ['#1A5A1A', TREETOPS_FERN_COLOR, '#3A7A3A']);
        drawFgLeafCluster(ctx, plat.x + plat.width * 0.7, plat.y, ['#1A5A1A', TREETOPS_FERN_COLOR, '#3A7A3A']);
      }
    }

    // Bottom fog (deep forest abyss below -- at visible screen bottom)
    ctx.save();
    ctx.globalAlpha = 0.4;
    const fogGrd = ctx.createLinearGradient(0, 620, 0, 720);
    fogGrd.addColorStop(0, 'rgba(10, 30, 10, 0)');
    fogGrd.addColorStop(1, 'rgba(10, 30, 10, 0.9)');
    ctx.fillStyle = fogGrd;
    ctx.fillRect(0, 620, 1280, 100);
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawTreetopsPlatformBg(ctx, platform);
  },

  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawTreetopsPlatformFg(ctx, platform);
  },

  // ---- Gameplay modifiers ----
  ghostConfig: {
    count: 4,
    speed: 60,
    size: 14,
    color: '#DDAA00',
    glowColor: '#CCAA22',
  },

  drawCustomGhost: (ctx, x, y, size, alpha, time) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha * 0.9;
    const s = size;

    // Wings (flapping fast)
    const wingAngle = Math.sin(time * 25) * 0.5;
    ctx.fillStyle = 'rgba(200, 220, 255, 0.4)';
    // Left wing
    ctx.save();
    ctx.rotate(-0.3 + wingAngle);
    ctx.beginPath();
    ctx.ellipse(-s * 0.5, -s * 0.2, s * 0.6, s * 0.25, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Right wing
    ctx.save();
    ctx.rotate(0.3 - wingAngle);
    ctx.beginPath();
    ctx.ellipse(s * 0.5, -s * 0.2, s * 0.6, s * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body -- yellow and black stripes
    ctx.fillStyle = '#DDAA00';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.35, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Black stripes
    ctx.fillStyle = '#1A1A00';
    ctx.fillRect(-s * 0.35, -s * 0.15, s * 0.7, s * 0.12);
    ctx.fillRect(-s * 0.3, s * 0.12, s * 0.6, s * 0.1);

    // Head
    ctx.fillStyle = '#1A1A00';
    ctx.beginPath();
    ctx.arc(0, -s * 0.55, s * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (angry red)
    ctx.fillStyle = '#FF3300';
    ctx.beginPath();
    ctx.arc(-s * 0.08, -s * 0.6, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.08, -s * 0.6, s * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Stinger
    ctx.fillStyle = '#1A1A00';
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.5);
    ctx.lineTo(0, s * 0.7);
    ctx.lineTo(s * 0.05, s * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawAnimatedBackground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice()) return;
    ctx.save();

    const dt = _tickSquirrelDt(time);
    const players = matchState?.players ?? [];
    for (let si = 0; si < _squirrels.length; si++) {
      const sq = _squirrels[si];
      const cfg = SQUIRRELS_CFG[si];
      tickGroundCritter(sq, players, dt, cfg);
      const fleeing = sq.fleeing;
      const bob = fastSin(time * (fleeing ? 18 : 8) + si) * (fleeing ? 2 : 1) * Math.abs(sq.facingEase);
      ctx.save();
      ctx.translate(sq.x, cfg.platTopY + bob);
      if (sq.facingEase < 0) ctx.scale(-1, 1);
      ctx.fillStyle = '#a5683a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.bezierCurveTo(-18, -3, -22, -14, -10, -14);
      ctx.lineTo(-10, -6);
      ctx.bezierCurveTo(-14, -7, -10, -2, -7, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7, -1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(10, -7);
      ctx.lineTo(11, -4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(8, -2, 1.5, 1.5);
      ctx.fillStyle = '#e8c89a';
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [8, 20] }],
  },

  scatterFlockConfigs: [
    {
      species: 'bird',
      positions: [
        { x: 590, y: 258 },
        { x: 550, y: 478 },
        { x: 1100, y: 473 },
      ],
      radius: 120,
      respawnTime: 8,
    },
  ],

  musicFile: 'treetops.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:178},{t:2,y:'j',x:30},{t:3,y:'j',x:30},{t:4,y:'j',x:149},{t:7,y:'j',x:30},{t:8,y:'j',x:178},{t:15,y:'j',x:178}],
      [{t:0,y:'j',x:400},{t:2,y:'j',x:608},{t:4,y:'j',x:400},{t:5,y:'j',x:534},{t:6,y:'j',x:608},{t:8,y:'j',x:400},{t:9,y:'j',x:608},{t:15,y:'j',x:400}],
      [{t:0,y:'j',x:988},{t:1,y:'j',x:800},{t:3,y:'j',x:988},{t:5,y:'j',x:800},{t:6,y:'j',x:814},{t:7,y:'j',x:988},{t:9,y:'j',x:800},{t:10,y:'j',x:959}],
      [{t:0,y:'d',x:1228},{t:4,y:'j',x:1228},{t:6,y:'j',x:1100},{t:7,y:'j',x:1134},{t:10,y:'j',x:1100},{t:16,y:'j',x:1100}],
      [{t:0,y:'d',x:120},{t:1,y:'d',x:288},{t:5,y:'j',x:288},{t:7,y:'j',x:120},{t:8,y:'d',x:288},{t:11,y:'j',x:149},{t:12,y:'j',x:288},{t:13,y:'j',x:120},{t:15,y:'j',x:288},{t:17,y:'j',x:284}],
      [{t:1,y:'d',x:460},{t:4,y:'j',x:460},{t:6,y:'j',x:608},{t:8,y:'d',x:460},{t:9,y:'d',x:608},{t:11,y:'j',x:460},{t:12,y:'j',x:554},{t:15,y:'j',x:460},{t:16,y:'j',x:608},{t:17,y:'j',x:460}],
      [{t:1,y:'d',x:700},{t:2,y:'d',x:828},{t:5,y:'j',x:700},{t:7,y:'j',x:828},{t:9,y:'d',x:700},{t:10,y:'d',x:828},{t:12,y:'j',x:724},{t:13,y:'j',x:828},{t:16,y:'j',x:828},{t:18,y:'j',x:828}],
      [{t:0,y:'d',x:1168},{t:2,y:'d',x:1000},{t:3,y:'d',x:1168},{t:6,y:'j',x:1000},{t:10,y:'d',x:1000},{t:11,y:'j',x:1168},{t:12,y:'j',x:1000},{t:13,y:'j',x:1109},{t:16,y:'j',x:1000},{t:18,y:'j',x:1000}],
      [{t:0,y:'d',x:310},{t:1,y:'d',x:328},{t:4,y:'j',x:310},{t:5,y:'j',x:328},{t:11,y:'j',x:310},{t:12,y:'j',x:328},{t:15,y:'j',x:319}],
      [{t:1,y:'d',x:680},{t:2,y:'d',x:698},{t:5,y:'j',x:680},{t:6,y:'j',x:698},{t:7,y:'j',x:698},{t:10,y:'j',x:698},{t:16,y:'j',x:698}],
      [{t:2,y:'d',x:950},{t:6,y:'j',x:950},{t:7,y:'j',x:968},{t:9,y:'j',x:950},{t:12,y:'j',x:950},{t:13,y:'j',x:968},{t:16,y:'j',x:950}],
      [{t:0,y:'d',x:50},{t:1,y:'d',x:178},{t:3,y:'d',x:50},{t:4,y:'d',x:178},{t:8,y:'d',x:178},{t:12,y:'j',x:178},{t:13,y:'j',x:50},{t:14,y:'j',x:178},{t:15,y:'d',x:178},{t:17,y:'j',x:178}],
      [{t:1,y:'d',x:500},{t:2,y:'d',x:748},{t:5,y:'d',x:500},{t:6,y:'d',x:748},{t:8,y:'d',x:500},{t:9,y:'d',x:748},{t:11,y:'j',x:500},{t:13,y:'j',x:748},{t:14,y:'j',x:604},{t:17,y:'j',x:500},{t:18,y:'j',x:748}],
      [{t:0,y:'d',x:1178},{t:2,y:'d',x:1050},{t:3,y:'d',x:1178},{t:7,y:'d',x:1050},{t:10,y:'d',x:1050},{t:11,y:'j',x:1178},{t:12,y:'j',x:1050},{t:18,y:'j',x:1050}],
      [{t:0,y:'d',x:440},{t:1,y:'d',x:440},{t:2,y:'d',x:708},{t:4,y:'d',x:440},{t:5,y:'d',x:440},{t:6,y:'d',x:708},{t:8,y:'d',x:440},{t:9,y:'d',x:708},{t:10,y:'d',x:708},{t:12,y:'d',x:708},{t:15,y:'d',x:440},{t:16,y:'d',x:708},{t:17,y:'d',x:440}],
      [{t:0,y:'d',x:300},{t:1,y:'d',x:338},{t:4,y:'d',x:300},{t:5,y:'d',x:338},{t:8,y:'d',x:338},{t:11,y:'j',x:300},{t:12,y:'j',x:338},{t:14,y:'j',x:338},{t:17,y:'j',x:309}],
      [{t:2,y:'d',x:880},{t:3,y:'d',x:918},{t:6,y:'d',x:880},{t:7,y:'d',x:918},{t:10,y:'d',x:918},{t:12,y:'j',x:880},{t:13,y:'j',x:918},{t:14,y:'j',x:880},{t:18,y:'j',x:884}],
      [{t:0,y:'d',x:280},{t:1,y:'d',x:318},{t:4,y:'d',x:280},{t:5,y:'d',x:318},{t:8,y:'d',x:318},{t:11,y:'d',x:280},{t:14,y:'j',x:318},{t:15,y:'d',x:318}],
      [{t:1,y:'d',x:850},{t:2,y:'d',x:888},{t:3,y:'d',x:888},{t:6,y:'d',x:850},{t:7,y:'d',x:888},{t:9,y:'d',x:850},{t:10,y:'d',x:888},{t:12,y:'d',x:850},{t:14,y:'j',x:850},{t:16,y:'d',x:888}],
    ],
    nextHop: [[-1,1,2,3,4,15,1,7,8,1,7,4,4,4,15,15,3,4,7],[0,-1,2,0,4,5,6,0,8,9,6,4,4,4,15,15,5,4,6],[0,1,-1,3,0,5,6,7,5,9,10,5,5,6,5,0,3,5,6],[0,0,0,-1,4,4,6,7,0,6,10,4,4,4,16,0,16,4,6],[0,1,0,0,-1,5,1,7,8,1,7,11,12,13,11,15,5,17,7],[8,1,9,11,4,-1,6,9,8,9,6,11,12,4,11,15,16,17,6],[1,1,2,2,1,5,-1,7,1,9,10,5,12,13,12,1,16,5,18],[0,0,2,3,0,2,6,-1,0,2,10,11,12,13,11,0,16,11,18],[0,1,0,0,4,5,1,0,-1,1,1,11,12,4,11,15,5,4,12],[1,1,2,2,1,5,6,7,1,-1,10,5,5,6,16,1,16,5,6],[2,2,2,2,2,2,6,7,12,9,-1,7,12,13,12,2,16,12,6],[0,1,0,3,4,15,1,0,8,1,3,-1,12,13,14,15,3,17,12],[8,1,2,2,1,5,6,2,8,9,6,11,-1,13,14,1,5,17,18],[0,0,2,3,0,2,2,7,0,2,10,11,12,-1,11,0,3,11,18],[0,1,2,16,4,5,6,16,8,9,10,17,12,4,-1,15,16,17,6],[0,1,0,0,4,5,1,0,8,5,14,11,12,4,14,-1,5,17,12],[3,6,2,3,3,2,6,7,12,6,10,7,12,13,14,14,-1,14,18],[0,1,0,11,4,5,1,0,8,5,14,11,4,4,14,15,5,-1,1],[3,1,2,3,1,12,6,7,12,9,10,7,12,6,14,1,16,12,-1]],
    safeHop: [[-1,1,2,3,4,15,1,7,8,1,7,4,4,4,15,15,3,4,7],[0,-1,2,0,4,5,6,0,8,9,6,4,4,4,15,15,5,4,6],[0,1,-1,3,0,5,6,7,5,9,10,5,5,6,5,0,3,5,6],[0,0,0,-1,4,4,6,7,0,6,10,4,4,4,16,0,16,4,6],[0,1,0,0,-1,5,1,7,8,1,7,11,12,13,11,15,5,17,7],[8,1,9,11,4,-1,6,9,8,9,6,11,12,4,11,15,16,17,6],[1,1,2,2,1,5,-1,7,1,9,10,5,12,13,12,1,16,5,18],[0,0,2,3,0,2,6,-1,0,2,10,11,12,13,11,0,16,11,18],[0,1,0,0,4,5,1,0,-1,1,1,11,12,4,11,15,5,4,12],[1,1,2,2,1,5,6,7,1,-1,10,5,5,6,16,1,16,5,6],[2,2,2,2,2,2,6,7,12,9,-1,7,12,13,12,2,16,12,6],[0,1,0,3,4,15,1,0,8,1,3,-1,12,13,14,15,3,17,12],[8,1,2,2,1,5,6,2,8,9,6,11,-1,13,14,1,5,17,18],[0,0,2,3,0,2,2,7,0,2,10,11,12,-1,11,0,3,11,18],[0,1,2,16,4,5,6,16,8,9,10,17,12,4,-1,15,16,17,6],[0,1,0,0,4,5,1,0,8,5,14,11,12,4,14,-1,5,17,12],[3,6,2,3,3,2,6,7,12,6,10,7,12,13,14,14,-1,14,18],[0,1,0,11,4,5,1,0,8,5,14,11,4,4,14,15,5,-1,1],[3,1,2,3,1,12,6,7,12,9,10,7,12,6,14,1,16,12,-1]],
  },
  // NAV-DATA-END
};
