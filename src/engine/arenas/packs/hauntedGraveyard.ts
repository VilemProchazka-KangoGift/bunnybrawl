import type { ArenaPack } from '../types';
import type { Platform, Ctx2D } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin, fastCos } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { computeNightIntensity } from '../../rendering';
import { createThornRenderer } from '../../themes/drawPrimitives';
import { getFloatingPlatforms, drawDriftBand, type DriftBandConfig, type GroundCritterConfig } from '../../themes/utils';
import { buildGroundCritter, type WildlifeInstance } from '../../gameLoop/cosmetics/wildlife';
import { drawRat } from '../../themes/drawPrimitives';
import type { Arena } from '../../types';
import {
  registerReactiveKind, createReactiveInstance, composeBend,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics/reactiveDecorations';

const FOG_CONFIG: DriftBandConfig = {
  topY: 600,
  bottomY: 660,
  colors: ['#dce4ec', '#c8d4e0', '#b1c0d0'],
  alphas: [0.10, 0.14, 0.20],
};

const RATS_CFG: GroundCritterConfig[] = [
  { platL: 30,  platR: 460,  platTopY: 660, walkSpeed: 50, fleeSpeed: 180, fleeRadius: 120, yTolerance: 80 },
  { platL: 820, platR: 1260, platTopY: 660, walkSpeed: 52, fleeSpeed: 180, fleeRadius: 120, yTolerance: 80 },
];

const WISPS = [
  { x: 200, y: 540, phase: 0 },
  { x: 640, y: 480, phase: 1.7 },
  { x: 1080, y: 540, phase: 3.3 },
  { x: 420, y: 420, phase: 0.8 },
  { x: 880, y: 420, phase: 2.4 },
] as const;
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  jaggedDown, backIso, leftIso, drawLeftStones,
  type StonePaletteRow,
} from '../../themes/drawPrimitives';

const HAUNTED_STONE_PALETTE: StonePaletteRow[] = [
  { base: '#5a5060', dark: '#302838', light: '#7a707e' },
  { base: '#4a4250', dark: '#28202e', light: '#6a6072' },
  { base: '#605668', dark: '#352c3e', light: '#867c90' },
  { base: '#534858', dark: '#2c2434', light: '#74687e' },
];

// ============================================================================
// Reactive decoration draw helpers + factories
// ============================================================================

/** Dead-tree silhouette. Origin is the BASE of the trunk (foot at y=0).
 *  Draws upward — caller is responsible for translate+rotate. */
function drawDeadTreeShape(ctx: Ctx2D, size: number): void {
  ctx.fillStyle = '#2A2020';
  const tw = size * 0.12;
  ctx.fillRect(-tw / 2, -size, tw, size);
  ctx.strokeStyle = '#2A2020';
  ctx.lineWidth = 2;
  // Branch L (mid)
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.6);
  ctx.lineTo(-size * 0.3, -size * 0.8);
  ctx.stroke();
  // Branch R (low)
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.4);
  ctx.lineTo(size * 0.25, -size * 0.55);
  ctx.stroke();
  // Top spike
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.1, -size * 1.1);
  ctx.stroke();
}

// ---- haunted_graveyard.deadTree ----
interface DeadTreeData { size: number; }
function hauntedDeadTree(x: number, y: number, size: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'haunted_graveyard.deadTree',
    seed: Math.floor((x * 73 + y * 31) % 997),
    data: { size } satisfies DeadTreeData,
    windAmp: 3,
    shakeRadius: 90,
    burst: { threshold: 0.95, particleKind: 'leaf', count: 10 },
    // No proximity — dead trees are stiff, no lean from passing players.
  });
}
registerReactiveKind('haunted_graveyard.deadTree', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { size } = inst.data as DeadTreeData;
    // Stiff lean: only stomp shudder on top of a faint wind sway.
    const lean = swayPhase + (inst.shakeDecay > 0 ? Math.sin(inst.shakeDecay * 40) * inst.shakeDecay * 4 : 0);
    ctx.save();
    ctx.translate(inst.pos.x, inst.pos.y);
    // Smaller rotation coefficient than treetops.tree — gnarled, not whippy.
    ctx.rotate(lean * 0.012);
    drawDeadTreeShape(ctx, size);
    ctx.restore();
  },
});

// ---- haunted_graveyard.cobweb ----
// Cobweb glued to a platform corner. Subtle proximity-lean; the corner anchor
// stays put while the radial strands lean horizontally with bendX.
interface CobwebData { dirX: number; dirY: number; }
function hauntedCobweb(cornerX: number, cornerY: number, dirX: number, dirY: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: cornerX, y: cornerY },
    kind: 'haunted_graveyard.cobweb',
    seed: Math.floor((cornerX * 97 + cornerY * 47) % 997),
    data: { dirX, dirY } satisfies CobwebData,
    windAmp: 3,
    proximity: { radius: 32, mode: 'lean', magnitude: 14 },
  });
}
registerReactiveKind('haunted_graveyard.cobweb', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { dirX, dirY } = inst.data as CobwebData;
    drawCobweb(ctx, inst.pos.x, inst.pos.y, dirX, dirY, composeBend(inst, swayPhase));
  },
});

/**
 * Cobweb in a body-front-face corner. (cornerX, cornerY) is the corner anchor;
 * (dirX, dirY) (each ±1) is the diagonal direction the web fans into the body.
 * Five radial strands ~14px long + three concentric arc chords between them.
 */
function drawCobweb(
  ctx: Ctx2D,
  cornerX: number,
  cornerY: number,
  dirX: number,
  dirY: number,
  bendX: number = 0,
): void {
  const len = 14;
  // Fan angles span the inward 90° quadrant: from "along the horizontal edge"
  // to "along the vertical edge", offset by the corner's quadrant.
  const baseAngle = Math.atan2(dirY, dirX); // diagonal axis into body
  const halfSpread = Math.PI / 4;            // ±45° around diagonal -> covers full 90° quadrant
  const strands = 5;

  ctx.save();
  ctx.strokeStyle = 'rgba(220,220,230,0.5)';
  ctx.lineWidth = 0.7;

  // Radial strands. The endpoints lean horizontally with bendX; the corner
  // anchor stays put (web is glued to the platform corner).
  const angles: number[] = [];
  for (let i = 0; i < strands; i++) {
    const t = i / (strands - 1);
    const a = baseAngle - halfSpread + t * (halfSpread * 2);
    angles.push(a);
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX + Math.cos(a) * len + bendX, cornerY + Math.sin(a) * len);
    ctx.stroke();
  }

  // Three cross-strand arc chords at increasing radii. Bend scales with radius
  // so inner chords stay tight to the corner.
  for (let r = 1; r <= 3; r++) {
    const radius = (r / 3.5) * len;
    const bendScale = radius / len;
    ctx.beginPath();
    for (let i = 0; i < strands; i++) {
      const px = cornerX + Math.cos(angles[i]) * radius + bendX * bendScale;
      const py = cornerY + Math.sin(angles[i]) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// Bg pass: cap + right face + left-protrusion stones. Sit behind the player.
function drawHauntedPlatformBg(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face
  drawPlatformRightFace(ctx, platform, '#1a1522');

  // Edge profiles + iso cap.
  const frontPts = jaggedDown(platform.x, platform.width, cF, rng, { bumps: 4, ampMin: 3, ampMax: 5 });
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#7a7580',
    capLight: 'rgba(220,215,225,0.18)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      const patchN = 3 + Math.floor(rng() * 2);
      ctx2.fillStyle = 'rgba(50,40,55,0.4)';
      for (let i = 0; i < patchN; i++) {
        const u = (i + 0.3 + rng() * 0.4) / patchN;
        const v = 0.2 + rng() * 0.6;
        const px = platform.x + u * platform.width + v * skew;
        const py = capFront - v * CAP_DEPTH;
        const rx = 3 + rng() * 2;
        const ry = (1.2 + rng() * 0.8);
        ctx2.beginPath();
        ctx2.ellipse(px, py, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);

  // Left protrusion stones (floating only) — bg, behind player
  if (!isGround) {
    drawLeftStones(ctx, platform, HAUNTED_STONE_PALETTE, rng);
  }
}

// Fg pass: body + cracks. Drawn after players for occlusion.
function drawHauntedPlatformFg(ctx: Ctx2D, platform: Platform, _isGround: boolean): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — cold gray-purple gradient
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#4a4050');
  g.addColorStop(1, '#2a2030');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // 1-3 deep cracks with ghostly green seepage.
  const crackCount = 1 + Math.floor(rng() * 3);
  type Seg = { x1: number; y1: number; x2: number; y2: number };
  const segs: Seg[] = [];
  for (let c = 0; c < crackCount; c++) {
    const ax = platform.x + 6 + rng() * Math.max(1, platform.width - 12);
    const ay = bodyTop + 4 + rng() * Math.max(1, bodyH - 8);
    let cx = ax;
    let cy = ay;
    const stemSegs = 2 + Math.floor(rng() * 2);
    let dir = (rng() - 0.5) * 1.6 + Math.PI * 0.5;
    for (let s = 0; s < stemSegs; s++) {
      const len = 8 + rng() * 6;
      const nx = cx + Math.cos(dir) * len;
      const ny = cy + Math.sin(dir) * len;
      segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
      const branchN = Math.floor(rng() * 3);
      for (let b = 0; b < branchN; b++) {
        const t = 0.3 + rng() * 0.5;
        const bx = cx + (nx - cx) * t;
        const by = cy + (ny - cy) * t;
        const bDir = dir + (rng() - 0.5) * 1.8;
        const bLen = 4 + rng() * 4;
        segs.push({
          x1: bx, y1: by,
          x2: bx + Math.cos(bDir) * bLen,
          y2: by + Math.sin(bDir) * bLen,
        });
      }
      cx = nx;
      cy = ny;
      dir += (rng() - 0.5) * 1.0;
    }
  }
  ctx.strokeStyle = 'rgba(100,200,140,0.35)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#15101a';
  ctx.lineWidth = 1.5 + rng() * 0.5;
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // Bottom bevel
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 3, platform.width, 3);
}

export const hauntedGraveyard: ArenaPack = {
  // ---- Identity ----
  id: 'haunted_graveyard',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #0A0015 0%, #1A0A30 40%, #2A1540 100%)',
  previewIcon: '\u{1F47B}',

  // ---- Translations ----
  translations: { en: 'Haunted Graveyard', cs: 'Stra\u0161ideln\u00FD h\u0159bitov', hi: '\u092D\u0942\u0924\u093F\u092F\u093E \u0915\u092C\u094D\u0930\u093F\u0938\u094D\u0924\u093E\u0928', fil: 'Sementeryo' },

  // ---- Layout ----
  defaultSurface: 'stone',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: 480, height: 60 },
    { x: 800, y: 660, width: 480, height: 60 },
    { x: 120, y: 625, width: 35, height: 35 },
    { x: 280, y: 625, width: 35, height: 35 },
    { x: 900, y: 625, width: 35, height: 35 },
    { x: 1080, y: 625, width: 35, height: 35 },
    { x: 480, y: 420, width: 320, height: 240 },
    { x: 30, y: 530, width: 170, height: 24 },
    { x: 20, y: 390, width: 150, height: 24 },
    { x: 1080, y: 530, width: 170, height: 24 },
    { x: 1110, y: 390, width: 150, height: 24 },
    { x: 250, y: 340, width: 140, height: 24 },
    { x: 890, y: 340, width: 140, height: 24 },
    { x: 520, y: 290, width: 240, height: 24 },
    { x: 200, y: 450, width: 100, height: 24 },
    { x: 980, y: 450, width: 100, height: 24 },
  ]),
  spawnPoints: [
    { x: 100, y: 500 }, { x: 1160, y: 500 },
    { x: 600, y: 385 }, { x: 350, y: 628 },
    { x: 320, y: 310 }, { x: 960, y: 310 },
  ],
  noSpawnZones: [
    { x: 480, y: 420, width: 320, height: 240 },
  ],
  navHints: [
    { onPlatform: 0, inZone: { x: 155, width: 325 }, goTo: 3, approachX: 315, type: 'j' },
    { onPlatform: 1, inZone: { x: 800, width: 100 }, goTo: 4, approachX: 868, type: 'j' },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#0A0015' },
      { offset: 0.3, color: '#120820' },
      { offset: 0.6, color: '#1A0A30' },
      { offset: 1, color: '#2A1540' },
    ],
  },

  hills: [
    { x: -20, baseY: 620, width: 380, height: 90, color: '#1A1528' },
    { x: 300, baseY: 630, width: 420, height: 70, color: '#151020' },
    { x: 670, baseY: 615, width: 400, height: 100, color: '#1A1528' },
    { x: 1000, baseY: 625, width: 380, height: 80, color: '#151020' },
  ],

  ground: {
    surfaceColor: '#3A3530',
  },

  // ---- Ambient systems ----
  clouds: {
    count: 4,
    color: 'rgba(40, 30, 60, 0.4)',
    minSize: 60,
    maxSize: 100,
    minSpeed: 2,
    maxSpeed: 5,
    yRange: [30, 90],
  },

  weather: {
    particleCount: 15,
    types: [
      { type: 'ash', weight: 0.6, sizeRange: [2, 4], vxRange: [-8, 8], vyRange: [5, 15], rotSpeedRange: [0.5, 2], color: 'rgba(100, 80, 120, 0.4)' },
      { type: 'leaf', weight: 0.4, sizeRange: [3, 5], vxRange: [-10, 10], vyRange: [10, 25], rotSpeedRange: [1, 3] },
    ],
  },

  wildlife: {
    count: 4,
    types: [
      { type: 'bat', weight: 1, colors: ['#1A1A1A', '#2A2A2A', '#151515', '#252025'], speedRange: [35, 65], yRange: [0.05, 0.3] },
    ],
  },

  fog: {
    count: 35,
    baseY: 650,
    yVariance: 40,
    speedRange: [2, 6],
    alphaRange: [0.15, 0.4],
    color: '#4A3A5A',
    sizeX: 70,
    sizeY: 15,
  },

  ambientParticles: {
    count: 8,
    sizeRange: [1, 2],
    vxRange: [-2, 2],
    vyRange: [-3, -8],
    alphaRange: [0.15, 0.35],
    colors: ['#8A7AAA', '#6A5A8A'],
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

    // Full moon — hangs high in the sky, casts a soft halo.
    const moonX = 950;
    const moonY = 110;
    const moonR = 38;
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.9, moonX, moonY, moonR * 2.2);
    moonHalo.addColorStop(0, 'rgba(220, 215, 235, 0.35)');
    moonHalo.addColorStop(1, 'rgba(220, 215, 235, 0)');
    ctx.fillStyle = moonHalo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e4f0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // Craters — scattered asymmetrically across the disc.
    ctx.fillStyle = 'rgba(170, 165, 195, 0.45)';
    ctx.beginPath();
    ctx.arc(moonX - 18, moonY + 2, 3.5, 0, Math.PI * 2);
    ctx.arc(moonX - 2, moonY - 16, 2.5, 0, Math.PI * 2);
    ctx.arc(moonX + 16, moonY + 8, 4, 0, Math.PI * 2);
    ctx.arc(moonX + 4, moonY + 18, 3, 0, Math.PI * 2);
    ctx.arc(moonX - 12, moonY + 16, 2, 0, Math.PI * 2);
    ctx.arc(moonX + 18, moonY - 10, 2, 0, Math.PI * 2);
    ctx.arc(moonX - 6, moonY + 4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#CCBBDD';
    const stars = [
      [80, 25, 1.2], [200, 55, 0.8], [350, 20, 1.5], [480, 65, 1],
      [600, 30, 0.8], [750, 50, 1.3], [1050, 40, 1], [1150, 25, 1.4],
      [130, 70, 0.7], [420, 85, 1.1], [680, 45, 0.9], [1100, 60, 1.2],
      [250, 40, 0.8], [550, 75, 1], [1200, 50, 0.9],
    ];
    for (const [sx, sy, sr] of stars) {
      ctx.globalAlpha = 0.3 + (sr as number) * 0.15;
      ctx.beginPath();
      ctx.arc(sx as number, sy as number, sr as number, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dead tree silhouettes in background
    ctx.fillStyle = '#0A0515';
    ctx.globalAlpha = 0.35;
    const drawDeadSilhouette = (bx: number, bh: number) => {
      ctx.fillRect(bx - 4, 660 - bh, 8, bh);
      // Branches
      ctx.beginPath();
      ctx.moveTo(bx, 660 - bh * 0.7);
      ctx.lineTo(bx - 25, 660 - bh * 0.9);
      ctx.lineTo(bx - 30, 660 - bh * 1.0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0A0515';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, 660 - bh * 0.5);
      ctx.lineTo(bx + 20, 660 - bh * 0.7);
      ctx.lineTo(bx + 28, 660 - bh * 0.8);
      ctx.stroke();
    };
    drawDeadSilhouette(150, 120);
    drawDeadSilhouette(500, 100);
    drawDeadSilhouette(1100, 130);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Mausoleum wall details (platform is a solid 320x240 block)
    ctx.fillStyle = '#3A3040';
    ctx.fillRect(470, 444, 40, y - 444);   // Left wall accent
    ctx.fillRect(790, 444, 40, y - 444);   // Right wall accent
    ctx.fillStyle = '#2A2530';
    ctx.fillRect(475, 444, 30, y - 444);   // Left wall inner shade
    ctx.fillRect(795, 444, 30, y - 444);   // Right wall inner shade
    // Wall cracks
    ctx.strokeStyle = 'rgba(20, 15, 25, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(490, 480); ctx.lineTo(485, 550); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(810, 500); ctx.lineTo(815, 580); ctx.stroke();

    // Tombstones
    const drawTombstone = (tx: number, ty: number, style: number) => {
      ctx.fillStyle = '#4A4A5A';
      if (style === 0) {
        // Classic rounded top
        ctx.beginPath();
        ctx.moveTo(tx - 12, ty);
        ctx.lineTo(tx - 12, ty - 30);
        ctx.arc(tx, ty - 30, 12, Math.PI, 0);
        ctx.lineTo(tx + 12, ty);
        ctx.closePath();
        ctx.fill();
      } else if (style === 1) {
        // Cross tombstone
        ctx.fillRect(tx - 3, ty - 45, 6, 45);
        ctx.fillRect(tx - 12, ty - 35, 24, 6);
      } else {
        // Simple rectangle
        ctx.fillRect(tx - 10, ty - 28, 20, 28);
        ctx.fillStyle = '#5A5A6A';
        ctx.fillRect(tx - 10, ty - 28, 20, 3);
      }
      // RIP text suggestion
      ctx.fillStyle = 'rgba(80, 80, 100, 0.5)';
      ctx.fillRect(tx - 6, ty - 18, 12, 2);
      ctx.fillRect(tx - 5, ty - 14, 10, 1);
    };

    drawTombstone(100, y, 0);
    drawTombstone(250, y, 1);
    drawTombstone(430, y, 2);
    drawTombstone(600, y, 0);
    drawTombstone(780, y, 1);
    drawTombstone(950, y, 2);
    drawTombstone(1120, y, 0);

    // Jack-o-lanterns
    const drawJackOLantern = (jx: number, jy: number, size: number) => {
      // Pumpkin body
      ctx.fillStyle = '#CC6600';
      ctx.beginPath();
      ctx.ellipse(jx, jy - size * 0.5, size * 0.5, size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ribs
      ctx.strokeStyle = '#AA5500';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(jx, jy - size);
      ctx.lineTo(jx, jy);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(jx, jy - size * 0.5, size * 0.3, size * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Face -- glowing eyes
      ctx.fillStyle = '#FFCC00';
      // Left eye
      ctx.beginPath();
      ctx.moveTo(jx - size * 0.2, jy - size * 0.6);
      ctx.lineTo(jx - size * 0.05, jy - size * 0.6);
      ctx.lineTo(jx - size * 0.12, jy - size * 0.75);
      ctx.closePath();
      ctx.fill();
      // Right eye
      ctx.beginPath();
      ctx.moveTo(jx + size * 0.2, jy - size * 0.6);
      ctx.lineTo(jx + size * 0.05, jy - size * 0.6);
      ctx.lineTo(jx + size * 0.12, jy - size * 0.75);
      ctx.closePath();
      ctx.fill();
      // Mouth
      ctx.beginPath();
      ctx.moveTo(jx - size * 0.2, jy - size * 0.35);
      ctx.lineTo(jx - size * 0.1, jy - size * 0.25);
      ctx.lineTo(jx, jy - size * 0.35);
      ctx.lineTo(jx + size * 0.1, jy - size * 0.25);
      ctx.lineTo(jx + size * 0.2, jy - size * 0.35);
      ctx.fill();
      // Stem
      ctx.fillStyle = '#4A6A2A';
      ctx.fillRect(jx - 2, jy - size * 1.05, 4, size * 0.1);
      // Glow
      const glow = ctx.createRadialGradient(jx, jy - size * 0.5, 2, jx, jy - size * 0.5, size);
      glow.addColorStop(0, 'rgba(255, 180, 0, 0.1)');
      glow.addColorStop(1, 'rgba(255, 120, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(jx - size, jy - size * 1.5, size * 2, size * 2);
    };

    drawJackOLantern(170, y, 20);
    drawJackOLantern(520, y, 18);
    drawJackOLantern(850, y, 22);
    drawJackOLantern(1200, y, 16);

    // Platform decorations (tombstones + jack-o-lanterns)
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawTombstone(mid, plat.y, i % 3);
      } else if (i % 3 === 1) {
        drawJackOLantern(mid, plat.y, 14);
      }
      // i % 3 === 2 → dead tree (reactive)
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Thick ground fog
    ctx.save();
    ctx.globalAlpha = 0.2;
    const fogGrd = ctx.createLinearGradient(0, gy - 40, 0, gy + 30);
    fogGrd.addColorStop(0, 'rgba(60, 40, 80, 0)');
    fogGrd.addColorStop(0.5, 'rgba(60, 40, 80, 0.4)');
    fogGrd.addColorStop(1, 'rgba(40, 25, 60, 0.6)');
    ctx.fillStyle = fogGrd;
    ctx.fillRect(0, gy - 40, 1280, 70);
    ctx.restore();

    // Iron fence sections
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#3A3A4A';
    ctx.lineWidth = 2;
    const drawFenceSection = (fx: number, fw: number) => {
      // Top rail
      ctx.beginPath();
      ctx.moveTo(fx, gy - 30);
      ctx.lineTo(fx + fw, gy - 30);
      ctx.stroke();
      // Bottom rail
      ctx.beginPath();
      ctx.moveTo(fx, gy - 8);
      ctx.lineTo(fx + fw, gy - 8);
      ctx.stroke();
      // Pickets
      for (let px = fx + 5; px < fx + fw; px += 12) {
        ctx.beginPath();
        ctx.moveTo(px, gy - 35);
        ctx.lineTo(px, gy);
        ctx.stroke();
        // Spear tip
        ctx.beginPath();
        ctx.moveTo(px - 2, gy - 35);
        ctx.lineTo(px, gy - 40);
        ctx.lineTo(px + 2, gy - 35);
        ctx.closePath();
        ctx.fillStyle = '#3A3A4A';
        ctx.fill();
      }
    };
    drawFenceSection(30, 100);
    drawFenceSection(1150, 100);
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    if (w.type === 'ash') {
      ctx.fillStyle = w.color || 'rgba(100, 80, 120, 0.4)';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.size, w.size * 0.5, w.rotation, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(80, 60, 40, 0.4)';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.size, w.size * 0.35, w.rotation, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawPlatform: (ctx: Ctx2D, platform: Platform, isGround: boolean) => {
    drawHauntedPlatformBg(ctx, platform, isGround);
  },
  drawPlatformOverlay: (ctx: Ctx2D, platform: Platform, isGround: boolean) => {
    drawHauntedPlatformFg(ctx, platform, isGround);
  },

  buildReactiveDecorations: (arena) => {
    const out: ReactiveInstance[] = [];

    // Ground dead trees (mirror of the original silhouettes in drawBackgroundNature).
    // Foot anchored on the ground platform's top edge (y = arena.platforms[0].y).
    const groundY = arena.platforms[0].y;
    out.push(hauntedDeadTree(50, groundY, 70));
    out.push(hauntedDeadTree(350, groundY, 55));
    out.push(hauntedDeadTree(700, groundY, 65));
    out.push(hauntedDeadTree(1050, groundY, 60));

    // Platform-top dead trees (every 3rd floating platform — i % 3 === 2).
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      if (i % 3 !== 2) continue;
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      out.push(hauntedDeadTree(mid, plat.y, 30));
    }

    // Cobwebs in front-face corners of floating platforms. Mirrors the seeded
    // selection logic from the (now-removed) drawHauntedPlatformFg block.
    for (const plat of floats) {
      const cF = capFrontY(plat);
      const bodyTop = cF;
      const bodyH = plat.height - CAP_DEPTH / 2;
      if (bodyH < 10) continue;
      // Independent seed for cobweb selection — the original draw fn consumed a
      // variable number of rng() calls in the crack-stem block before reaching
      // cobwebs, so we use a separate seed here for stable determinism.
      const cobwebRng = mulberry32(seedFor(plat.x, plat.y) ^ 0xC0BCEB);
      let leftTop = cobwebRng() < 0.7;
      let leftBot = cobwebRng() < 0.7;
      let rightTop = cobwebRng() < 0.7;
      let rightBot = cobwebRng() < 0.7;
      if (leftTop && leftBot) {
        if (cobwebRng() < 0.5) leftBot = false; else leftTop = false;
      }
      if (rightTop && rightBot) {
        if (cobwebRng() < 0.5) rightBot = false; else rightTop = false;
      }
      const bb = bodyTop + bodyH;
      if (leftTop)  out.push(hauntedCobweb(plat.x, bodyTop, +1, +1));
      if (rightTop) out.push(hauntedCobweb(plat.x + plat.width, bodyTop, -1, +1));
      if (leftBot)  out.push(hauntedCobweb(plat.x, bb, +1, -1));
      if (rightBot) out.push(hauntedCobweb(plat.x + plat.width, bb, -1, -1));
    }

    return out;
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, fadeAlpha) => {
    const cx = x + width / 2;
    const baseY = y + height;

    // Dirt mound at base
    ctx.fillStyle = '#3A3020';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, width * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arm coming out of ground
    const armH = height + 8;
    ctx.fillStyle = '#6A8A6A';
    ctx.fillRect(cx - 4, baseY - armH * 0.6, 8, armH * 0.6);
    // Wrist/forearm taper
    ctx.fillRect(cx - 3, baseY - armH * 0.7, 6, armH * 0.15);

    // Hand -- palm
    ctx.fillStyle = '#5A7A5A';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - armH * 0.75, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fingers (3-4 gnarled fingers reaching up)
    ctx.strokeStyle = '#5A7A5A';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // Index finger
    ctx.beginPath();
    ctx.moveTo(cx - 5, baseY - armH * 0.78);
    ctx.quadraticCurveTo(cx - 8, baseY - armH * 0.9, cx - 6, baseY - armH);
    ctx.stroke();
    // Middle finger
    ctx.beginPath();
    ctx.moveTo(cx - 1, baseY - armH * 0.8);
    ctx.quadraticCurveTo(cx, baseY - armH * 0.95, cx + 1, baseY - armH * 1.05);
    ctx.stroke();
    // Ring finger
    ctx.beginPath();
    ctx.moveTo(cx + 4, baseY - armH * 0.78);
    ctx.quadraticCurveTo(cx + 7, baseY - armH * 0.88, cx + 5, baseY - armH * 0.95);
    ctx.stroke();
    // Thumb (curled)
    ctx.beginPath();
    ctx.moveTo(cx - 7, baseY - armH * 0.7);
    ctx.quadraticCurveTo(cx - 12, baseY - armH * 0.75, cx - 10, baseY - armH * 0.82);
    ctx.stroke();

    // Fingernails (dark tips)
    ctx.fillStyle = '#3A4A3A';
    ctx.beginPath();
    ctx.arc(cx - 6, baseY - armH, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 1, baseY - armH * 1.05, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5, baseY - armH * 0.95, 2, 0, Math.PI * 2);
    ctx.fill();

    // Green glow
    ctx.globalAlpha = fadeAlpha * 0.15;
    const glow = ctx.createRadialGradient(cx, baseY - armH * 0.5, 2, cx, baseY - armH * 0.5, 25);
    glow.addColorStop(0, '#44AA44');
    glow.addColorStop(1, 'rgba(40, 100, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 25, baseY - armH - 10, 50, armH + 20);
  }),

  // ---- Gameplay modifiers ----
  ghostConfig: {
    count: 3,
    speed: 40,
    size: 30,
    color: 'rgba(180, 200, 220, 0.6)',
    glowColor: '#6688BB',
  },

  drawAnimatedBackground: (ctx, _arena, time, dayPhase) => {
    if (getSlowDevice()) return;
    const nightIntensity = computeNightIntensity(dayPhase);
    ctx.save();
    const wispBrightness = 0.5 + nightIntensity * 0.5;
    // Two stacked alpha circles approximate the radial halo without per-frame gradient creation.
    ctx.fillStyle = '#a8ffd0';
    for (const w of WISPS) {
      const x = w.x + fastCos(time * 0.6 + w.phase) * 40;
      const y = w.y + fastSin(time * 0.8 + w.phase) * 24;
      const pulse = 0.7 + fastSin(time * 3 + w.phase) * 0.3;
      const a = wispBrightness * pulse;
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath(); ctx.arc(x, y, 32, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#dcffe6';
    for (const w of WISPS) {
      const x = w.x + fastCos(time * 0.6 + w.phase) * 40;
      const y = w.y + fastSin(time * 0.8 + w.phase) * 24;
      const pulse = 0.7 + fastSin(time * 3 + w.phase) * 0.3;
      ctx.globalAlpha = wispBrightness * pulse;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  buildWildlife: (_arena: Arena): WildlifeInstance[] => {
    const out: WildlifeInstance[] = [];
    for (let i = 0; i < RATS_CFG.length; i++) {
      const cfg = RATS_CFG[i];
      out.push(buildGroundCritter({
        seed: i,
        cfg,
        initialDir: i % 2 === 0 ? 1 : -1,
        draw: ({ ctx, state, cfg: c, time }) =>
          drawRat(ctx, state.x, c.platTopY - 4, state.facingEase < 0 ? -1 : 1, time, Math.abs(state.facingEase), state.fleeing),
      }));
    }
    return out;
  },

  drawAnimatedForeground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    drawDriftBand(ctx, time, FOG_CONFIG);
    ctx.save();
    ctx.fillStyle = '#b4c3d2';
    for (let pi = 0; pi < 4; pi++) {
      const cxBase = ((pi * 360 + time * 24) % (CANVAS_WIDTH + 280)) - 140;
      const cy = 625 + fastSin(time * 0.4 + pi) * 6;
      ctx.globalAlpha = 0.28 + pi * 0.04;
      ctx.beginPath();
      ctx.ellipse(cxBase, cy, 80 + pi * 6, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    periodic: [{ sound: 'amb_ghost_hoo', intervalRange: [10, 25] }],
  },

  scatterFlockConfigs: [
    {
      species: 'crow',
      positions: [
        { x: 250, y: 448 },
        { x: 1030, y: 448 },
      ],
      radius: 140,
      respawnTime: 10,
    },
    {
      species: 'bat',
      positions: [
        { x: 580, y: 325 },
        { x: 720, y: 325 },
      ],
      radius: 140,
      respawnTime: 10,
    },
  ],

  musicFile: 'haunted_graveyard.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:0},{t:2,y:'j',x:122},{t:3,y:'j',x:282},{t:5,y:'j',x:0},{t:7,y:'j',x:99},{t:9,y:'j',x:0}],
      [{t:0,y:'j',x:1248},{t:2,y:'j',x:1248},{t:3,y:'j',x:1248},{t:4,y:'j',x:902},{t:5,y:'j',x:1082},{t:7,y:'j',x:1248},{t:9,y:'j',x:1149}],
      [{t:0,y:'d',x:123},{t:3,y:'j',x:123},{t:5,y:'j',x:120},{t:7,y:'j',x:122},{t:9,y:'j',x:120}],
      [{t:0,y:'d',x:280},{t:2,y:'j',x:280},{t:7,y:'j',x:280}],
      [{t:1,y:'d',x:903},{t:5,y:'j',x:903},{t:9,y:'j',x:903}],
      [{t:1,y:'d',x:1080},{t:2,y:'j',x:1083},{t:4,y:'j',x:1080},{t:7,y:'j',x:1083},{t:9,y:'j',x:1082}],
      [{t:0,y:'d',x:480},{t:1,y:'d',x:768},{t:3,y:'d',x:480},{t:4,y:'d',x:768},{t:11,y:'j',x:480},{t:12,y:'j',x:768},{t:13,y:'j',x:624}],
      [{t:0,y:'d',x:168},{t:1,y:'d',x:30},{t:2,y:'d',x:168},{t:3,y:'d',x:168},{t:8,y:'j',x:84},{t:9,y:'j',x:30},{t:10,y:'j',x:30},{t:14,y:'j',x:168},{t:15,y:'j',x:30}],
      [{t:0,y:'d',x:138},{t:1,y:'d',x:20},{t:2,y:'d',x:138},{t:3,y:'d',x:138},{t:5,y:'d',x:20},{t:7,y:'d',x:138},{t:9,y:'d',x:20},{t:10,y:'j',x:20},{t:11,y:'j',x:138},{t:12,y:'j',x:20},{t:14,y:'d',x:138}],
      [{t:0,y:'d',x:1218},{t:1,y:'d',x:1080},{t:5,y:'d',x:1080},{t:7,y:'j',x:1218},{t:8,y:'j',x:1218},{t:10,y:'j',x:1164},{t:14,y:'j',x:1218},{t:15,y:'j',x:1080}],
      [{t:0,y:'d',x:1228},{t:1,y:'d',x:1110},{t:2,y:'d',x:1228},{t:4,y:'d',x:1110},{t:5,y:'d',x:1110},{t:7,y:'d',x:1228},{t:8,y:'j',x:1228},{t:9,y:'d',x:1110},{t:11,y:'j',x:1228},{t:12,y:'j',x:1110},{t:15,y:'d',x:1110}],
      [{t:0,y:'d',x:250},{t:2,y:'d',x:250},{t:3,y:'d',x:250},{t:6,y:'d',x:358},{t:7,y:'d',x:250},{t:8,y:'d',x:250},{t:13,y:'j',x:358},{t:14,y:'d',x:250}],
      [{t:1,y:'d',x:998},{t:4,y:'d',x:890},{t:5,y:'d',x:998},{t:6,y:'d',x:890},{t:9,y:'d',x:998},{t:10,y:'d',x:998},{t:13,y:'j',x:890},{t:15,y:'d',x:998}],
      [{t:0,y:'d',x:520},{t:1,y:'d',x:728},{t:3,y:'d',x:520},{t:4,y:'d',x:728},{t:6,y:'d',x:728}],
      [{t:0,y:'d',x:200},{t:2,y:'d',x:200},{t:3,y:'d',x:268},{t:6,y:'j',x:268},{t:7,y:'d',x:200},{t:8,y:'j',x:200},{t:10,y:'j',x:200},{t:11,y:'j',x:259}],
      [{t:1,y:'d',x:1048},{t:4,y:'d',x:980},{t:5,y:'d',x:1048},{t:6,y:'j',x:980},{t:8,y:'j',x:1048},{t:9,y:'d',x:1048},{t:10,y:'j',x:1048},{t:12,y:'j',x:989}],
    ],
    nextHop: [[-1,1,2,3,1,5,7,7,7,9,7,7,7,7,7,7],[0,-1,2,3,4,5,7,7,7,9,7,7,7,7,7,7],[0,0,-1,3,5,5,7,7,7,9,7,7,7,7,7,7],[0,0,2,-1,0,0,7,7,7,0,7,7,7,7,7,7],[1,1,1,1,-1,5,9,1,9,9,9,9,9,9,9,9],[1,1,2,1,4,-1,7,7,7,9,7,7,7,7,7,7],[0,1,0,3,4,0,-1,0,11,0,12,11,12,13,11,12],[0,1,2,3,1,0,14,-1,8,9,10,8,8,8,14,15],[0,1,2,3,1,5,11,7,-1,9,10,11,12,11,14,7],[0,1,0,0,1,5,14,7,8,-1,10,8,8,8,14,15],[0,1,2,7,4,5,11,7,8,9,-1,11,12,11,7,15],[0,6,2,3,6,8,6,7,8,8,7,-1,6,13,14,7],[6,1,10,6,4,5,6,10,9,9,10,6,-1,13,9,15],[0,1,0,3,4,0,6,0,6,0,6,6,6,-1,6,6],[0,7,2,3,6,0,6,7,8,0,10,11,6,6,-1,7],[9,1,1,1,4,5,6,1,8,9,10,6,12,6,8,-1]],
    safeHop: [[-1,1,2,3,1,5,7,7,7,9,7,7,7,7,7,7],[0,-1,2,3,4,5,7,7,7,9,7,7,7,7,7,7],[0,0,-1,3,5,5,7,7,7,9,7,7,7,7,7,7],[0,0,2,-1,0,0,7,7,7,0,7,7,7,7,7,7],[1,1,1,1,-1,5,9,1,9,9,9,9,9,9,9,9],[1,1,2,1,4,-1,7,7,7,9,7,7,7,7,7,7],[0,1,0,3,4,0,-1,0,11,0,12,11,12,13,11,12],[0,1,2,3,1,0,14,-1,8,9,10,8,8,8,14,15],[0,1,2,3,1,5,11,7,-1,9,10,11,12,11,14,7],[0,1,0,0,1,5,14,7,8,-1,10,8,8,8,14,15],[0,1,2,7,4,5,11,7,8,9,-1,11,12,11,7,15],[0,6,2,3,6,8,6,7,8,8,7,-1,6,13,14,7],[6,1,10,6,4,5,6,10,9,9,10,6,-1,13,9,15],[0,1,0,3,4,0,6,0,6,0,6,6,6,-1,6,6],[0,7,2,3,6,0,6,7,8,0,10,11,6,6,-1,7],[9,1,1,1,4,5,6,1,8,9,10,6,12,6,8,-1]],
  },
  // NAV-DATA-END
};
