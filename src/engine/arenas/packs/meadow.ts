import { BUILTIN_ARENA_PREVIEWS } from '../previewCatalog';
import type { ArenaPack } from '../types';
import type { Arena, Platform, Ctx2D } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getFloatingPlatforms, pushFromPlayers, type GroundCritterState, type GroundCritterConfig } from '../../themes/utils';
import { buildGroundCritter, type WildlifeInstance } from '../../gameLoop/cosmetics/wildlife';
import {
  drawMeadowBush, drawMeadowFlower, drawMeadowMushroom,
  drawMeadowPlatform, drawMeadowPlatformOverlay,
} from './meadowSelectedArt';

const SNAILS_CFG: GroundCritterConfig[] = [
  { platL: 900, platR: 1080, platTopY: 660, walkSpeed: 8, fleeSpeed: 22, fleeRadius: 70, yTolerance: 80, turnEaseRate: 2 },
  { platL: 200, platR: 380,  platTopY: 660, walkSpeed: 7, fleeSpeed: 20, fleeRadius: 70, yTolerance: 80, turnEaseRate: 2 },
];

const BUTTERFLY_HUES = [320, 60, 200, 290, 30, 160, 180, 40] as const;
const BUTTERFLY_COLORS = BUTTERFLY_HUES.map(h => `hsl(${h},80%,65%)`);
const BEE_CLUSTERS = [
  { homeX: 320, homeY: 420, phase: 0 },
  { homeX: 980, homeY: 380, phase: 2.4 },
] as const;
// Placed in gaps between FG bushes / stumps / wildflowers / tall grass, all of
// which sit on the ground line or at platform 15%/85%. Center of platform is
// clear of FG decoration.
const DANDELIONS = [
  // Ground line — between bushes (160, 520, 1000, 1120) and stumps (340, 860).
  { x: 100,  gy: 655 },
  { x: 380,  gy: 655 },
  { x: 720,  gy: 655 },
  { x: 1080, gy: 655 },
  // Floating-platform centers (FG bushes sit at 15%/85%, centers are clear).
  { x: 380,  gy: 395 },
  { x: 880,  gy: 410 },
  { x: 640,  gy: 475 },
  { x: 640,  gy: 285 },
  { x: 1090, gy: 530 },
] as const;
const DANDELION_SEED_COS = new Float32Array(14);
const DANDELION_SEED_SIN = new Float32Array(14);
{
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    DANDELION_SEED_COS[i] = Math.cos(a);
    DANDELION_SEED_SIN[i] = Math.sin(a);
  }
}

function drawButterfly(ctx: Ctx2D, i: number, time: number, players: ReadonlyArray<import('../../types').Player>): void {
  const driftSpeed = 0.04 + (i % 3) * 0.015;
  const homeX = ((i * 200 + time * 60 * driftSpeed) % (CANVAS_WIDTH + 200)) - 100;
  const homeY = 380 + fastSin(time * 0.4 + i * 1.7) * 80 + (i % 3) * 30;
  const flutterX = homeX + fastSin(time * 1.2 + i) * 22;
  const flutterY = homeY + fastSin(time * 1.5 + i * 1.7) * 14;
  const r = pushFromPlayers(players, flutterX, flutterY, 70, 14, 4);
  const flap = fastSin(time * 14 + i * 3) * 0.5 + 0.5;
  ctx.fillStyle = BUTTERFLY_COLORS[i];
  ctx.beginPath();
  ctx.ellipse(r.x - 4, r.y, 4 * flap, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(r.x + 4, r.y, 4 * flap, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x - 0.5, r.y - 3, 1, 6);
}

function drawOneSnail(
  ctx: Ctx2D,
  state: GroundCritterState,
  cfg: GroundCritterConfig,
  time: number,
): void {
  ctx.save();
  ctx.translate(state.x, cfg.platTopY - 4);
  if (state.facingEase < 0) ctx.scale(-1, 1);
  ctx.fillStyle = '#b89878';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,100,80,0.5)';
  ctx.fillRect(-9, 2.5, 18, 1.5);
  ctx.fillStyle = '#8a5a3a';
  ctx.beginPath();
  ctx.arc(-1, -3, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a3a20';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let r = 4.5; r >= 1; r -= 1.6) {
    ctx.moveTo(-1 + r, -3);
    ctx.arc(-1, -3, r, 0, Math.PI * 1.8);
  }
  ctx.stroke();
  const wig = fastSin(time * 6) * 0.5;
  ctx.strokeStyle = '#8a6a4a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(7, -1);
  ctx.lineTo(10 + wig, -5);
  ctx.moveTo(8, -1);
  ctx.lineTo(11 - wig, -4);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(10 + wig, -5, 0.6, 0, Math.PI * 2);
  ctx.arc(11 - wig, -4, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBeeCluster(ctx: Ctx2D, ci: number, time: number, players: ReadonlyArray<import('../../types').Player>): void {
  const c = BEE_CLUSTERS[ci];
  const wanderX = c.homeX + fastSin(time * 0.25 + c.phase) * 200;
  const wanderY = c.homeY + fastSin(time * 0.4 + c.phase + 1) * 60;
  const r = pushFromPlayers(players, wanderX, wanderY, 110, 28, 8);
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
  drawTree, drawGrassTuft, drawFgLeafCluster,
} from '../../themes/drawPrimitives';
import {
  buildHangingVine, buildFern, buildTallGrass,
} from '../../gameLoop/cosmetics/sharedDecorationKinds';
import { applyIsoInsets } from '../../themes/drawPrimitives';

// ============================================================================
// Reactive decoration factories + draw fns
// ============================================================================

import {
  registerReactiveKind,
  createReactiveInstance,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics/reactiveDecorations';

// ---- meadow.tree ----
interface TreeData { size: number; }
function meadowTree(x: number, y: number, size: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'meadow.tree',
    seed: Math.floor((x * 73 + y * 31) % 997),
    data: { size } satisfies TreeData,
    windAmp: 3,
    shakeRadius: 80,
    burst: { threshold: 0.95, particleKind: 'leaf', count: 12 },
  });
}
registerReactiveKind('meadow.tree', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { size } = inst.data as TreeData;
    // Tree leans with swayPhase + shakeDecay shudder. windAmp 3 × 0.015 ≈ 2.6°
    // peak wind tilt; stomp shudder adds ~4× transient on top.
    const lean = swayPhase + (inst.shakeDecay > 0 ? Math.sin(inst.shakeDecay * 40) * inst.shakeDecay * 4 : 0);
    ctx.save();
    ctx.translate(inst.pos.x, inst.pos.y);
    ctx.rotate(lean * 0.015);
    drawTree(ctx, 0, 0, size);
    ctx.restore();
  },
});

// ---- meadow.dandelion ----
// Mutable runtime burst phase lives directly on inst.data. -1 = idle (full
// puff), >= 0 = burst-elapsed seconds. Excitement rising past 0.5 starts a
// burst; the draw fn advances the phase ~1/60s per call.
interface DandelionData { phase: number; }
function meadowDandelion(x: number, y: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y }, kind: 'meadow.dandelion',
    seed: Math.floor((x * 113 + y * 61) % 997),
    data: { phase: -1 } satisfies DandelionData,
    proximity: { radius: 40, mode: 'excite', magnitude: 1 },
  });
}

const DANDELION_BURST_TOTAL = 7.0;
const DANDELION_SEED_FLY_DURATION = 2.0;

registerReactiveKind('meadow.dandelion', {
  layer: 'prePlayer',
  resetData: (d) => { (d as DandelionData).phase = -1; },
  draw: (ctx, inst, _swayPhase, time, _dayPhase, _state) => {
    const data = inst.data as DandelionData;
    let phase = data.phase;
    if (phase < 0 && inst.excitement > 0.5) phase = 0;
    if (phase >= 0) {
      phase += 1 / 60;
      if (phase >= DANDELION_BURST_TOTAL) phase = -1;
    }
    data.phase = phase;

    const x = inst.pos.x;
    const gy = inst.pos.y;
    const puffY = gy - 9;

    // Stem.
    ctx.strokeStyle = '#5fb45a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, gy + 4);
    ctx.lineTo(x, gy - 8);
    ctx.stroke();

    // Puff (shrinks during seed-fly, regrows after).
    let puffR = 6;
    if (phase >= 0) {
      if (phase < DANDELION_SEED_FLY_DURATION) {
        puffR = 6 * Math.max(0, 1 - phase / 0.3);
      } else {
        const regrow = (phase - DANDELION_SEED_FLY_DURATION) / (DANDELION_BURST_TOTAL - DANDELION_SEED_FLY_DURATION);
        puffR = 6 * Math.min(1, regrow);
      }
    }
    if (puffR > 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, puffY, puffR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcdcc8';
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 6; i++) {
        const c = DANDELION_SEED_COS[i * 2];
        const s = DANDELION_SEED_SIN[i * 2];
        ctx.beginPath();
        ctx.arc(x + c * puffR * 0.7, puffY + s * puffR * 0.7, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Seed-fly particles.
    if (phase >= 0 && phase < DANDELION_SEED_FLY_DURATION) {
      const t = phase / DANDELION_SEED_FLY_DURATION;
      const SEEDS = 12;
      ctx.fillStyle = '#f8f8e8';
      for (let i = 0; i < SEEDS; i++) {
        const emitT = i / SEEDS * 0.3;
        const localT = (t - emitT) / (1 - emitT);
        if (localT <= 0) continue;
        const angle = (i / SEEDS) * Math.PI * 2 + fastSin(time + i) * 0.2;
        const dist = localT * 60;
        const sx = x + fastCos(angle) * dist + fastSin(time * 1.5 + i) * 2;
        const sy = puffY - localT * 50 - localT * localT * 12 + fastSin(time + i) * 1.5;
        const alpha = (1 - localT) * 0.95;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(sx, sy - 2.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
});

// ---- meadow.butterfly ----
// Position is dynamic (computed in draw via time), pos here is a dummy anchor;
// proximity radius is large since flock motion shifts pos. The flock index
// rides on `seed` — no separate data field needed.
function meadowButterfly(idx: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: 0, y: 0 }, kind: 'meadow.butterfly',
    seed: idx,
    proximity: { radius: 70, mode: 'flee', magnitude: 14 },
  });
}
registerReactiveKind('meadow.butterfly', {
  layer: 'postPlayer',
  highFrequency: true, // flock motion needs 60Hz
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    drawButterfly(ctx, inst.seed, time, state.players);
  },
});

// ---- meadow.bee ----
function meadowBeeCluster(idx: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: BEE_CLUSTERS[idx].homeX, y: BEE_CLUSTERS[idx].homeY }, kind: 'meadow.bee',
    seed: idx,
    proximity: { radius: 110, mode: 'flee', magnitude: 28 },
  });
}
registerReactiveKind('meadow.bee', {
  layer: 'postPlayer',
  highFrequency: true,
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    drawBeeCluster(ctx, inst.seed, time, state.players);
  },
});

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
export const meadow: ArenaPack = {
  // ---- Identity, preview, and translations ----
  ...BUILTIN_ARENA_PREVIEWS.meadow,

  // ---- Layout ----
  defaultSurface: 'grass',
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
  // Morning blue softens the distant scenery without changing foreground cover.
  sky: {
    gradient: [
      { offset: 0, color: '#316DAA' },
      { offset: 0.6, color: '#92C6E0' },
      { offset: 1, color: '#E5EBD5' },
    ],
  },

  hills: [
    { x: 0, baseY: 620, width: 300, height: 120, color: '#719981' },
    { x: 250, baseY: 630, width: 400, height: 100, color: '#719981' },
    { x: 600, baseY: 620, width: 350, height: 130, color: '#719981' },
    { x: 900, baseY: 635, width: 400, height: 100, color: '#719981' },
  ],

  ground: {
    surfaceColor: '#6BBF59',
  },

  // ---- Ambient systems ----
  clouds: {
    count: 5,
    color: 'rgba(255, 255, 248, 0.78)',
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
  drawFarBackground: (ctx: Ctx2D, _arena: Arena) => {
    // Distant treeline — jagged tops suggesting a dense forest
    ctx.fillStyle = 'rgba(86, 116, 147, 0.32)';
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    for (let i = 0; i < FOREST_TREE_POSITIONS.length; i += 2) {
      ctx.lineTo(FOREST_TREE_POSITIONS[i], FOREST_TREE_POSITIONS[i + 1]);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Lighter layer in front — slightly higher, more detail
    ctx.fillStyle = 'rgba(116, 148, 150, 0.23)';
    ctx.beginPath();
    ctx.moveTo(-10, 660);
    for (let i = 0; i < FOREST_TREE_POSITIONS.length; i += 2) {
      ctx.lineTo(FOREST_TREE_POSITIONS[i] + 15, FOREST_TREE_POSITIONS[i + 1] + 25);
    }
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();
  },

  // Static-shape decorations route through the cached fg/bg-nature layers
  // (one-time bake). Only kinds that genuinely need per-frame reactivity —
  // trees (stomp shake + leaf burst), tallGrass/fern (parting), hangingVine
  // (lean), dandelion (excite-burst), butterflies + bees (flock motion) —
  // live in `buildReactiveDecorations`. Trade: bushes/flowers/mushrooms/
  // grass-tufts/fgBush/fgLeafCluster/fgWildflower lose their wind sway, but
  // skip 50+ per-frame draw calls.
  drawBackgroundNature: (ctx: Ctx2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    drawMeadowBush(ctx, 200, y, 30, false);
    drawMeadowBush(ctx, 450, y, 22, false);
    drawMeadowBush(ctx, 700, y, 28, false);
    drawMeadowBush(ctx, 950, y, 25, false);
    drawMeadowBush(ctx, 1100, y, 20, false);
    const flowerPositions = [150, 280, 420, 500, 580, 750, 930, 980, 1050, 1200];
    for (const fx of flowerPositions) {
      drawMeadowFlower(ctx, fx, y, FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length]);
    }
    drawMeadowMushroom(ctx, 240, y);
    drawMeadowMushroom(ctx, 720, y);
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      const mid = plat.x + plat.width / 2;
      if (plat.width > 180) {
        drawMeadowBush(ctx, mid - 30, plat.y, 15, false);
        drawMeadowFlower(ctx, plat.x + 20, plat.y, '#FFD700');
        drawMeadowFlower(ctx, plat.x + plat.width - 25, plat.y, '#FF69B4');
        drawGrassTuft(ctx, plat.x + 10, plat.y);
        drawGrassTuft(ctx, plat.x + plat.width - 15, plat.y);
      } else {
        drawMeadowFlower(ctx, mid - 10, plat.y, '#DDA0DD');
        drawGrassTuft(ctx, plat.x + 8, plat.y);
      }
    }
  },

  buildReactiveDecorations: (arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    const out: ReactiveInstance[] = [];

    // Trees (stomp shake + leaf burst)
    out.push(meadowTree(60, y, 50));
    out.push(meadowTree(620, y, 60));
    out.push(meadowTree(1180, y, 45));

    // Tall grass clusters (player parting)
    out.push(buildTallGrass(310, y, 7));
    out.push(buildTallGrass(680, y, 9));
    out.push(buildTallGrass(1020, y, 6));
    out.push(buildTallGrass(430, y, 5));

    // Ferns (player parting)
    out.push(buildFern(80, y));
    out.push(buildFern(770, y));
    out.push(buildFern(1220, y));

    // Floating-platform reactive decorations: hanging vines (lean)
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      if (plat.width > 180) {
        out.push(buildHangingVine(plat.x + 15, plat.y + plat.height, 25));
        out.push(buildHangingVine(plat.x + plat.width - 15, plat.y + plat.height, 20));
      } else {
        out.push(buildHangingVine(plat.x + plat.width / 2, plat.y + plat.height, 18));
      }
    }

    // Dandelions (proximity-excite seed burst)
    for (const d of DANDELIONS) {
      out.push(meadowDandelion(d.x, d.gy));
    }

    // Butterflies + bee clusters (flock motion)
    for (let i = 0; i < BUTTERFLY_HUES.length; i++) out.push(meadowButterfly(i));
    for (let ci = 0; ci < BEE_CLUSTERS.length; ci++) out.push(meadowBeeCluster(ci));

    return out;
  },

  drawForegroundNature: (ctx: Ctx2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;
    drawMeadowBush(ctx, 160, gy, 60, true);
    drawMeadowBush(ctx, 520, gy, 52, true);
    drawMeadowBush(ctx, 1000, gy, 55, true);
    drawMeadowBush(ctx, 1120, gy, 48, true);
    const floats = getFloatingPlatforms(arena.platforms);
    for (let pi = 0; pi < floats.length; pi++) {
      const plat = floats[pi];
      if (plat.width > 180) {
        drawMeadowBush(ctx, plat.x + plat.width * 0.15, plat.y, pi % 2 === 0 ? 45 : 18, true);
        drawMeadowBush(ctx, plat.x + plat.width * 0.85, plat.y, pi % 2 === 0 ? 18 : 42, true);
        drawFgLeafCluster(ctx, plat.x + plat.width / 2, plat.y);
      } else {
        drawMeadowBush(ctx, plat.x + plat.width * 0.5, plat.y, pi % 3 === 0 ? 38 : 16, true);
      }
    }
    drawMeadowFlower(ctx, 240, gy, '#FF6B8A', 18);
    drawMeadowFlower(ctx, 580, gy, '#DDA0DD', 20);
    drawMeadowFlower(ctx, 930, gy, '#FFD700', 16);
    drawMeadowFlower(ctx, 1180, gy, '#FF69B4', 22);
  },

  drawPlatform: drawMeadowPlatform,
  // Body cover remains after players, preserving platform occlusion.
  drawPlatformOverlay: drawMeadowPlatformOverlay,

  buildWildlife: (_arena: Arena): WildlifeInstance[] => {
    const out: WildlifeInstance[] = [];
    for (let i = 0; i < SNAILS_CFG.length; i++) {
      const cfg = SNAILS_CFG[i];
      out.push(buildGroundCritter({
        seed: i,
        cfg,
        // Original snail positions: midpoint + i * 7 (small offset).
        initialX: (cfg.platL + cfg.platR) / 2 + i * 7,
        initialDir: i % 2 === 0 ? 1 : -1,
        draw: ({ ctx, state, cfg: c, time }) => drawOneSnail(ctx, state, c, time),
      }));
    }
    return out;
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
