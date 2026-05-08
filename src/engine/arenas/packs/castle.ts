import type { ArenaPack } from '../types';
import type { Arena, Platform, WeatherParticle } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { getFloatingPlatforms, makeDtTracker, tickGroundCritter, type GroundCritterState } from '../../themes/utils';
import { drawRat } from '../../themes/drawPrimitives';
import {
  registerReactiveKind,
  createReactiveInstance,
  composeBend,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics/reactiveDecorations';

const RATS_CFG = [
  { platL: 30,   platR: 220,  platTopY: 660, walkSpeed: 50, fleeSpeed: 180, fleeRadius: 120, yTolerance: 80 },
  { platL: 420,  platR: 860,  platTopY: 660, walkSpeed: 50, fleeSpeed: 180, fleeRadius: 120, yTolerance: 80 },
  { platL: 1060, platR: 1260, platTopY: 660, walkSpeed: 50, fleeSpeed: 180, fleeRadius: 120, yTolerance: 80 },
];
const _castleRats: GroundCritterState[] = RATS_CFG.map((cfg, i) => ({
  x: (cfg.platL + cfg.platR) / 2,
  dir: i % 2 === 0 ? 1 : -1, facingEase: 1, fleeing: false, committedFleeDir: 0,
}));
const _tickCastleRatDt = makeDtTracker();

// x=1180 conflicted with the tall floating platform at x=1120 y=580; moved to x=1080 (clear ground space).
const TORCH_X = [100, 400, 640, 880, 1080] as const;
const TORCH_FLAME_Y = 580;
const BANNER_COLORS = ['#8B0000', '#00008B', '#006400', '#4B0082'] as const;
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  subtleDown, backIso, leftIso,
} from '../../themes/drawPrimitives';

/**
 * Cobweb in a body-front-face corner. (cornerX, cornerY) is the corner anchor;
 * (dirX, dirY) (each ±1) is the diagonal direction the web fans into the body.
 * Matches the haunted-graveyard web shape so both packs feel consistent.
 */
function drawCastleCobweb(
  ctx: CanvasRenderingContext2D,
  cornerX: number,
  cornerY: number,
  dirX: number,
  dirY: number,
  bendX = 0,
): void {
  const len = 13;
  const baseAngle = Math.atan2(dirY, dirX);
  const halfSpread = Math.PI / 4;
  const strands = 5;
  ctx.save();
  ctx.strokeStyle = 'rgba(230,230,230,0.55)';
  ctx.lineWidth = 0.7;
  // The web fans into the body — bend tilts the outer rim by `bendX` while
  // the corner anchor stays pinned (cobwebs are attached at the corner).
  const angles: number[] = [];
  for (let i = 0; i < strands; i++) {
    const a = baseAngle - halfSpread + (i / (strands - 1)) * (halfSpread * 2);
    angles.push(a);
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX + Math.cos(a) * len + bendX, cornerY + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let r = 1; r <= 3; r++) {
    const radius = (r / 4) * len;
    // Bend ramps from 0 at the corner up to full bendX at the outer rim.
    const bendT = r / 4;
    const localBend = bendX * bendT;
    ctx.beginPath();
    for (let i = 0; i < strands; i++) {
      const x1 = cornerX + Math.cos(angles[i]) * radius + localBend;
      const y1 = cornerY + Math.sin(angles[i]) * radius;
      if (i === 0) ctx.moveTo(x1, y1);
      else {
        const a0 = angles[i - 1];
        const x0 = cornerX + Math.cos(a0) * radius + localBend;
        const y0 = cornerY + Math.sin(a0) * radius;
        // Slight catenary sag toward the corner
        const mx = (x0 + x1) * 0.5 + (cornerX - (x0 + x1) * 0.5) * 0.15;
        const my = (y0 + y1) * 0.5 + (cornerY - (y0 + y1) * 0.5) * 0.15;
        ctx.quadraticCurveTo(mx, my, x1, y1);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Bg pass: cap + right face. These always sit BEHIND the player.
function drawCastlePlatformBg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();
  const brickW = 40;

  // Right face — dark stone shadow
  drawPlatformRightFace(ctx, platform, '#2a2a2a');

  // Edge profiles — subtle inward chip notches on front; iso parallelogram cap
  // (back shifted right + left edge sloped) for the architectural feel.
  const frontPts = subtleDown(platform.x, platform.width, cF, rng, { count: 2, amp: 1.2 });
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  // Cap — weathered stone with worn speckles + brick-direction mortar
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#8a8a8a',
    capLight: 'rgba(255,255,255,0.12)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      // Worn darker speckles
      ctx2.fillStyle = 'rgba(60,60,60,0.4)';
      const speckleCount = 8 + Math.floor(rng() * 6);
      for (let i = 0; i < speckleCount; i++) {
        const t = rng();
        const sx = platform.x + skew * (1 - t) + t * platform.width + (rng() - 0.5) * 4;
        const sy = capBack + rng() * (capFront - capBack);
        const sr = 0.4 + rng() * 0.7;
        ctx2.beginPath();
        ctx2.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx2.fill();
      }

      // Brick-direction mortar visible on top — two horizontal lines at 30% / 70% of cap depth
      ctx2.fillStyle = 'rgba(42,42,42,0.55)';
      const capDepthY = capFront - capBack;
      for (const frac of [0.3, 0.7]) {
        const ly = capBack + capDepthY * frac;
        const lx0 = platform.x + skew * (1 - frac);
        const lx1 = lx0 + platform.width;
        ctx2.fillRect(lx0, ly, lx1 - lx0, 1);
      }

      // Vertical ticks matching body's pattern — staggered per row
      let r = 0;
      for (const frac of [0.3, 0.7]) {
        const ly = capBack + capDepthY * frac;
        const offset = (r % 2 === 1) ? brickW * 0.5 : 0;
        const lx0 = platform.x + skew * (1 - frac);
        for (let tx = lx0 + offset; tx <= lx0 + platform.width; tx += brickW) {
          ctx2.fillRect(tx, ly - capDepthY * 0.2, 1, capDepthY * 0.4);
        }
        r++;
      }
    },
  }, leftPts);
}

// Fg pass: body face. Drawn AFTER players so the body occludes any player
// whose bbox overlaps the body region — gives the iso phantom strip (between
// plat.x and plat.x + leftCollisionInset) a "going behind" feel.
function drawCastlePlatformFg(ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean): void {
  // Independent seed (offset from bg) so bg and fg rng streams don't interfere.
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — gray stone gradient (light top → dark bottom)
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  bodyGrad.addColorStop(0, '#7a7a7a');
  bodyGrad.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Brick mortar pattern — staggered courses
  ctx.save();
  ctx.beginPath();
  ctx.rect(platform.x, bodyTop, platform.width, bodyH);
  ctx.clip();

  const brickH = 12;
  const brickW = 40;
  ctx.fillStyle = 'rgba(42,42,42,0.5)';

  // Horizontal mortar lines every ~12px
  for (let by = bodyTop + brickH; by < bodyTop + bodyH; by += brickH) {
    ctx.fillRect(platform.x, by, platform.width, 1);
  }

  // Vertical mortar ticks — staggered. Odd rows offset by half-brick.
  let row = 0;
  for (let by = bodyTop; by < bodyTop + bodyH; by += brickH) {
    const offset = (row % 2 === 1) ? brickW * 0.5 : 0;
    for (let bx = platform.x + offset; bx <= platform.x + platform.width; bx += brickW) {
      ctx.fillRect(bx, by, 1, brickH);
    }
    row++;
  }

  // Weathering blotches — 3-4 darker ellipses
  const blotchCount = 3 + Math.floor(rng() * 2);
  ctx.fillStyle = 'rgba(40,40,40,0.3)';
  for (let i = 0; i < blotchCount; i++) {
    const bx = platform.x + rng() * platform.width;
    const by = bodyTop + rng() * bodyH;
    const brx = 4 + rng() * 6;
    const bry = 2 + rng() * 4;
    ctx.beginPath();
    ctx.ellipse(bx, by, brx, bry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Re-runs the same RNG-driven corner-pick logic that used to live in
 * `drawCastlePlatformFg` so the reactive cobweb instance list lines up with
 * the original static placements. Kept in lock-step with the inline
 * pre-migration logic — change both together if the placement rule moves.
 */
function pickCobwebCorners(platform: Platform): Array<{ x: number; y: number; dirX: number; dirY: number }> {
  const isGround = platform.y >= 650;
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;
  if (isGround || bodyH < 10) return [];

  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  // Mirror the body-face RNG stream up to the cobweb decision: replay the
  // body-fill blotches consume so we land on the same RNG state that the
  // original inline draw used for the corner picks.
  const blotchCount = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < blotchCount; i++) {
    rng(); rng(); rng(); rng(); rng(); // bx, by, brx, bry, ellipse-rotation
  }

  const bb = bodyTop + bodyH;
  let leftTop = rng() < 0.45;
  let leftBot = rng() < 0.45;
  let rightTop = rng() < 0.45;
  let rightBot = rng() < 0.45;
  if (leftTop && leftBot) {
    if (rng() < 0.5) leftBot = false; else leftTop = false;
  }
  if (rightTop && rightBot) {
    if (rng() < 0.5) rightBot = false; else rightTop = false;
  }
  const out: Array<{ x: number; y: number; dirX: number; dirY: number }> = [];
  if (leftTop)  out.push({ x: platform.x,                    y: bodyTop, dirX: +1, dirY: +1 });
  if (rightTop) out.push({ x: platform.x + platform.width,   y: bodyTop, dirX: -1, dirY: +1 });
  if (leftBot)  out.push({ x: platform.x,                    y: bb,      dirX: +1, dirY: -1 });
  if (rightBot) out.push({ x: platform.x + platform.width,   y: bb,      dirX: -1, dirY: -1 });
  return out;
}

// ============================================================================
// Reactive decoration kinds
// ============================================================================

// ---- castle.cobweb ----
// Subtle bend toward passing players. The corner stays anchored; the outer
// rim sways. windAmp is small (cobwebs are delicate).
interface CobwebData { dirX: number; dirY: number; }
function castleCobweb(x: number, y: number, dirX: number, dirY: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'castle.cobweb',
    seed: Math.floor((x * 71 + y * 29 + dirX * 11 + dirY * 13) % 997),
    data: { dirX, dirY } satisfies CobwebData,
    windAmp: 3,
    proximity: { radius: 32, mode: 'lean', magnitude: 14 },
  });
}
registerReactiveKind('castle.cobweb', {
  layer: 'postPlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { dirX, dirY } = inst.data as CobwebData;
    drawCastleCobweb(ctx, inst.pos.x, inst.pos.y, dirX, dirY, composeBend(inst, swayPhase));
  },
});

// ---- castle.banner ----
// Floating-platform banners with proximity-driven excitement amplifying sway.
interface BannerData { colorIdx: number; }
function castleBanner(x: number, y: number, colorIdx: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'castle.banner',
    seed: colorIdx * 17 + Math.floor((x * 31 + y * 41) % 997),
    data: { colorIdx } satisfies BannerData,
    windAmp: 6,
    proximity: { radius: 40, mode: 'lean', magnitude: 16 },
  });
}
registerReactiveKind('castle.banner', {
  layer: 'postPlayer',
  draw: (ctx, inst, _swayPhase, time, _dayPhase, _state) => {
    const data = inst.data as BannerData;
    const excite = inst.excitement;

    const bx = inst.pos.x;
    const by = inst.pos.y;
    const i = inst.seed;
    const color = BANNER_COLORS[data.colorIdx % BANNER_COLORS.length];

    const baseSway = fastSin(time * 1.5 + i * 1.8) * 6;
    const reactSway = fastSin(time * (1.5 + excite * 4) + i * 1.8) * excite * 5;
    const sway = baseSway + reactSway;
    const h = 35;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#8A8A6A';
    ctx.fillRect(bx - 14, by - 2, 28, 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(bx - 12, by);
    ctx.lineTo(bx + 12, by);
    ctx.quadraticCurveTo(bx + 10 + sway * 0.5, by + h * 0.5, bx + 8 + sway, by + h);
    ctx.lineTo(bx + sway, by + h + 12);
    ctx.lineTo(bx - 8 + sway, by + h);
    ctx.quadraticCurveTo(bx - 10 + sway * 0.5, by + h * 0.5, bx - 12, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    const ex = bx + sway * 0.3;
    ctx.beginPath();
    ctx.moveTo(ex, by + 8);
    ctx.lineTo(ex + 6, by + 13);
    ctx.lineTo(ex + 6, by + 22);
    ctx.lineTo(ex, by + 27);
    ctx.lineTo(ex - 6, by + 22);
    ctx.lineTo(ex - 6, by + 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
});

export const castle: ArenaPack = {
  // ---- Identity ----
  id: 'castle',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #0A0A2E 0%, #1A1A4E 40%, #3A3A5E 100%)',
  previewIcon: '\u{1F3F0}',

  // ---- Translations ----
  translations: { en: 'Castle', cs: 'Hrad', hi: '\u0915\u093F\u0932\u093E', fil: 'Kastilyo' },

  // ---- Layout ----
  defaultSurface: 'stone',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: 240, height: 60 },
    { x: 380, y: 660, width: 520, height: 60 },
    { x: 1040, y: 660, width: 240, height: 60 },
    { x: 240, y: 700, width: 140, height: 20 },
    { x: 900, y: 700, width: 140, height: 20 },
    { x: 30, y: 580, width: 130, height: 24 },
    { x: 120, y: 500, width: 140, height: 24 },
    { x: 30, y: 420, width: 130, height: 24 },
    { x: 120, y: 340, width: 140, height: 24 },
    { x: 1120, y: 580, width: 130, height: 24 },
    { x: 1040, y: 495, width: 105, height: 24 },
    { x: 1120, y: 420, width: 130, height: 24 },
    { x: 1045, y: 330, width: 105, height: 24 },
    { x: 250, y: 280, width: 780, height: 24 },
    { x: 480, y: 480, width: 180, height: 24 },
    { x: 520, y: 380, width: 240, height: 24 },
    { x: 430, y: 590, width: 40, height: 70 },
    { x: 630, y: 600, width: 40, height: 60 },
    { x: 820, y: 590, width: 40, height: 70 },
    { x: 270, y: 440, width: 115, height: 24 },
    { x: 910, y: 435, width: 85, height: 24 },
  ]),
  spawnPoints: [
    { x: 100, y: 560 }, { x: 1180, y: 560 },
    { x: 90, y: 400 }, { x: 1150, y: 390 },
    { x: 640, y: 260 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    { x: 255, y: 694, width: 110, height: 6, type: 'lava' },
    { x: 915, y: 694, width: 110, height: 6, type: 'lava' },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#0A0A1E' },
      { offset: 0.3, color: '#0E0E2E' },
      { offset: 0.6, color: '#1A1A4E' },
      { offset: 1, color: '#2A2A5E' },
    ],
  },

  hills: [
    { x: -30, baseY: 620, width: 400, height: 80, color: '#1A1A2E' },
    { x: 300, baseY: 625, width: 450, height: 70, color: '#151528' },
    { x: 700, baseY: 615, width: 380, height: 90, color: '#1A1A2E' },
    { x: 1000, baseY: 625, width: 350, height: 75, color: '#151528' },
  ],

  ground: {
    surfaceColor: '#4A4A5E',
    surfaceThickness: 4,
  },

  platform: {
    floatingBodyColor: '#3A3A50',
    floatingTopColor: '#5A5A70',
    floatingAccentColor: undefined,
    groundBodyColor: '#2A2A40',
    groundTopColor: '#4A4A5E',
    drawMoss: false,
  },

  // ---- Ambient systems ----
  clouds: {
    count: 0,
    color: 'rgba(30, 30, 60, 0.3)',
    minSize: 40,
    maxSize: 60,
    minSpeed: 2,
    maxSpeed: 4,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 15,
    types: [
      { type: 'ember', weight: 1, sizeRange: [1, 3], vxRange: [-5, 5], vyRange: [-15, -35], rotSpeedRange: [0, 1], color: '#FF8844' },
    ],
  },

  wildlife: {
    count: 3,
    types: [
      { type: 'bat', weight: 1, colors: ['#2A2A3A', '#1A1A2A', '#3A3A4A'], speedRange: [30, 55], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 12,
    baseY: 660,
    yVariance: 15,
    speedRange: [1, 3],
    alphaRange: [0.05, 0.15],
    color: '#8888AA',
    sizeX: 50,
    sizeY: 10,
  },

  ambientParticles: {
    count: 6,
    sizeRange: [1, 2],
    vxRange: [-2, 2],
    vyRange: [-5, -15],
    alphaRange: [0.15, 0.4],
    colors: ['#FFAA44', '#FF8833'],
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

    // Stone wall background — fill entire background with wall texture
    ctx.fillStyle = '#1E1E30';
    ctx.fillRect(0, 0, 1280, 720);

    // Brick pattern on walls
    ctx.strokeStyle = 'rgba(15, 15, 25, 0.4)';
    ctx.lineWidth = 1;
    const brickW = 40;
    const brickH = 18;
    for (let by = 0; by < 720; by += brickH) {
      const off = (by / brickH) % 2 === 0 ? 0 : brickW / 2;
      for (let bx = -brickW + off; bx < 1300; bx += brickW) {
        ctx.strokeRect(bx, by, brickW, brickH);
      }
    }

    // Stone color variation patches
    ctx.globalAlpha = 0.08;
    const patches = [
      [80, 100, 120, 90], [400, 50, 100, 80], [800, 120, 130, 70],
      [200, 300, 110, 100], [600, 250, 90, 85], [1000, 200, 120, 95],
      [150, 500, 100, 80], [700, 450, 110, 90], [1100, 400, 90, 70],
    ];
    for (const [px, py, pw, ph] of patches) {
      ctx.fillStyle = Math.random() > 0.5 ? '#252538' : '#1A1A28';
      ctx.fillRect(px, py, pw, ph);
    }
    ctx.globalAlpha = 1;

    // Large arched windows showing starry night sky
    const drawArchedWindow = (wx: number, wy: number, ww: number, wh: number, showMoon = false) => {
      // Window recess (darker)
      ctx.fillStyle = '#08081A';
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.closePath();
      ctx.fill();

      // Starry sky visible through window
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + wh - 3);
      ctx.lineTo(wx + 3, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2 - 3, Math.PI, 0);
      ctx.lineTo(wx + ww - 3, wy + wh - 3);
      ctx.closePath();
      ctx.clip();

      // Night sky gradient through window
      const skyGrd = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      skyGrd.addColorStop(0, '#0A0A2A');
      skyGrd.addColorStop(1, '#151540');
      ctx.fillStyle = skyGrd;
      ctx.fillRect(wx, wy, ww, wh);

      // Stars through window
      ctx.fillStyle = '#FFFFFF';
      for (let s = 0; s < 8; s++) {
        const sx = wx + 8 + (s * 17) % (ww - 16);
        const sy = wy + 10 + (s * 23) % (wh * 0.7);
        ctx.globalAlpha = 0.4 + (s % 3) * 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8 + (s % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Giant moon — only in one window
      if (showMoon) {
        const moonR = Math.min(ww, wh) * 0.3;
        const moonX = wx + ww * 0.55;
        const moonY = wy + wh * 0.3;
        // Moon body
        ctx.fillStyle = '#E8E8CC';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();
        // Crescent shadow
        ctx.fillStyle = '#0A0A2A';
        ctx.beginPath();
        ctx.arc(moonX + moonR * 0.3, moonY - moonR * 0.1, moonR * 0.85, 0, Math.PI * 2);
        ctx.fill();
        // Moonlight glow
        ctx.globalAlpha = 0.15;
        const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 3);
        moonGlow.addColorStop(0, 'rgba(200, 200, 180, 0.4)');
        moonGlow.addColorStop(1, 'rgba(200, 200, 180, 0)');
        ctx.fillStyle = moonGlow;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // Stone frame around window
      ctx.strokeStyle = '#2A2A3E';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.stroke();

      // Window divider (cross mullion)
      ctx.strokeStyle = '#2A2A3E';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy + wh * 0.1);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + wh * 0.55);
      ctx.lineTo(wx + ww - 3, wy + wh * 0.55);
      ctx.stroke();

      // Sill
      ctx.fillStyle = '#2A2A3E';
      ctx.fillRect(wx - 5, wy + wh - 2, ww + 10, 6);
    };

    // Three large windows — only the center one has the moon
    drawArchedWindow(100, 100, 120, 200);
    drawArchedWindow(520, 80, 140, 220, true);
    drawArchedWindow(1000, 90, 130, 210);

    // Two smaller high windows
    drawArchedWindow(330, 140, 80, 140);
    drawArchedWindow(800, 130, 85, 150);

    ctx.restore();
  },

  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Wall torches on background
    const drawTorch = (tx: number, ty: number) => {
      // Bracket
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(tx - 2, ty - 15, 4, 15);
      ctx.fillRect(tx - 6, ty - 18, 12, 5);
      // Flame
      ctx.fillStyle = '#FF8800';
      ctx.beginPath();
      ctx.moveTo(tx - 5, ty - 18);
      ctx.quadraticCurveTo(tx, ty - 35, tx + 5, ty - 18);
      ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.moveTo(tx - 3, ty - 19);
      ctx.quadraticCurveTo(tx, ty - 30, tx + 3, ty - 19);
      ctx.fill();
      // Glow
      const glow = ctx.createRadialGradient(tx, ty - 25, 2, tx, ty - 25, 40);
      glow.addColorStop(0, 'rgba(255, 150, 50, 0.15)');
      glow.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(tx - 40, ty - 65, 80, 80);
    };

    drawTorch(100, y - 60);
    drawTorch(400, y - 60);
    drawTorch(640, y - 60);
    drawTorch(880, y - 60);
    drawTorch(1080, y - 60);

    // Suits of armor on ground
    const drawArmor = (ax: number, ay: number, size: number) => {
      // Body
      ctx.fillStyle = '#5A5A6A';
      ctx.fillRect(ax - size * 0.3, ay - size * 0.8, size * 0.6, size * 0.5);
      // Helmet
      ctx.fillStyle = '#6A6A7A';
      ctx.beginPath();
      ctx.arc(ax, ay - size * 0.85, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Visor
      ctx.fillStyle = '#2A2A3A';
      ctx.fillRect(ax - size * 0.12, ay - size * 0.88, size * 0.24, size * 0.08);
      // Legs
      ctx.fillStyle = '#5A5A6A';
      ctx.fillRect(ax - size * 0.2, ay - size * 0.3, size * 0.15, size * 0.3);
      ctx.fillRect(ax + size * 0.05, ay - size * 0.3, size * 0.15, size * 0.3);
      // Sword
      ctx.strokeStyle = '#8A8A9A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax + size * 0.35, ay - size * 0.9);
      ctx.lineTo(ax + size * 0.35, ay - size * 0.2);
      ctx.stroke();
      // Hilt
      ctx.strokeStyle = '#6A5A3A';
      ctx.beginPath();
      ctx.moveTo(ax + size * 0.25, ay - size * 0.6);
      ctx.lineTo(ax + size * 0.45, ay - size * 0.6);
      ctx.stroke();
    };

    drawArmor(250, y, 45);
    drawArmor(1050, y, 42);

    // (Pillars at x=430, 630, 820 are platforms — they're rendered by drawPlatform
    // with the same 3D castle treatment as the rest of the level. No 2D overlay
    // here; that double-paint produced flat caps/bases poking through the 3D body.)
  },

  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground stone pillar — left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1A1A2E';
    // Main pillar body
    ctx.fillRect(-10, gy - 80, 55, 110);
    // Pillar capital (wider top)
    ctx.fillRect(-15, gy - 85, 65, 10);
    // Pillar base (wider bottom)
    ctx.fillRect(-15, gy + 20, 65, 10);
    // Stone texture lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#3A3A5E';
    ctx.lineWidth = 1;
    for (let sy = gy - 75; sy < gy + 20; sy += 18) {
      ctx.beginPath();
      ctx.moveTo(-5, sy);
      ctx.lineTo(40, sy);
      ctx.stroke();
    }
    ctx.restore();

    // Large foreground stone pillar — right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(1240, gy - 75, 50, 105);
    ctx.fillRect(1235, gy - 80, 60, 10);
    ctx.fillRect(1235, gy + 20, 60, 10);
    // Stone texture lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#3A3A5E';
    ctx.lineWidth = 1;
    for (let sy = gy - 70; sy < gy + 20; sy += 18) {
      ctx.beginPath();
      ctx.moveTo(1245, sy);
      ctx.lineTo(1285, sy);
      ctx.stroke();
    }
    ctx.restore();

    // Large iron chandelier silhouette — center
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1A1A2E';
    ctx.strokeStyle = '#2A2A3E';
    ctx.lineWidth = 3;
    const chX = 640;
    const chY = gy - 55;
    // Chain from above
    ctx.beginPath();
    ctx.moveTo(chX, chY - 60);
    ctx.lineTo(chX, chY - 25);
    ctx.stroke();
    // Main ring
    ctx.beginPath();
    ctx.ellipse(chX, chY - 20, 50, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Arms extending down with candle holders
    for (const dx of [-45, -22, 0, 22, 45]) {
      ctx.beginPath();
      ctx.moveTo(chX + dx, chY - 20);
      ctx.lineTo(chX + dx, chY - 10);
      ctx.stroke();
      // Candle holder cup
      ctx.fillRect(chX + dx - 4, chY - 10, 8, 5);
      // Candle flame glow
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#FF8844';
      ctx.beginPath();
      ctx.arc(chX + dx, chY - 15, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#1A1A2E';
    }
    ctx.restore();

    // Chain decorations hanging in foreground
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#5A5A6A';
    ctx.lineWidth = 2;
    const drawChain = (cx: number, cy: number, links: number) => {
      for (let i = 0; i < links; i++) {
        const ly = cy + i * 10;
        ctx.beginPath();
        ctx.ellipse(cx, ly, 3, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    drawChain(200, gy - 40, 4);
    drawChain(1080, gy - 35, 3);
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawCastlePlatformBg(ctx, platform);
  },
  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => {
    drawCastlePlatformFg(ctx, platform, isGround);
  },

  drawWeatherParticle: (ctx: CanvasRenderingContext2D, w: WeatherParticle) => {
    // Torch spark — concentric circles, no rotation. Draw at world coords;
    // reset globalAlpha at end since save/restore is gone.
    ctx.fillStyle = w.color || '#FF8844';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFCC66';
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  // ---- Gameplay modifiers ----
  ghostConfig: {
    count: 2,
    speed: 30,
    size: 28,
    color: 'rgba(160, 180, 220, 0.5)',
    glowColor: '#5566AA',
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;

    // Stone base block
    ctx.fillStyle = '#4A4A55';
    ctx.fillRect(x + width * 0.05, by - height * 0.18, width * 0.9, height * 0.18);
    // Base edge highlight
    ctx.fillStyle = '#5A5A65';
    ctx.fillRect(x + width * 0.05, by - height * 0.18, width * 0.9, 2);

    // Iron spikes
    const spikePositions = [0.15, 0.35, 0.5, 0.65, 0.85];
    for (let i = 0; i < spikePositions.length; i++) {
      const sx = x + width * spikePositions[i];
      const sh = height * (i === 2 ? 0.95 : 0.7);
      const sw = width * 0.06;
      // Spike body
      ctx.fillStyle = '#6A6A78';
      ctx.beginPath();
      ctx.moveTo(sx - sw, by - height * 0.18);
      ctx.lineTo(sx, by - sh);
      ctx.lineTo(sx + sw, by - height * 0.18);
      ctx.closePath();
      ctx.fill();
      // Metal highlight
      ctx.fillStyle = 'rgba(160, 160, 180, 0.35)';
      ctx.beginPath();
      ctx.moveTo(sx - sw * 0.3, by - height * 0.18);
      ctx.lineTo(sx, by - sh);
      ctx.lineTo(sx + sw * 0.2, by - height * 0.18);
      ctx.closePath();
      ctx.fill();
      // Dark tip
      ctx.fillStyle = '#3A3A48';
      ctx.beginPath();
      ctx.arc(sx, by - sh, sw * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, fadeAlpha) => {
    const halfW = size * 0.45;
    const squash = 1 + bounceTimer * 0.03;
    const bodyH = size * 0.8 / squash;

    // Gargoyle stone body
    ctx.fillStyle = '#5A5A68';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.5, y);
    ctx.lineTo(x - halfW * 0.6, y - bodyH * 0.6);
    ctx.lineTo(x - halfW * 0.3, y - bodyH);
    ctx.lineTo(x + halfW * 0.3, y - bodyH);
    ctx.lineTo(x + halfW * 0.6, y - bodyH * 0.6);
    ctx.lineTo(x + halfW * 0.5, y);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = '#6A6A78';
    ctx.beginPath();
    ctx.arc(x, y - bodyH - size * 0.12, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // Horns
    ctx.fillStyle = '#4A4A58';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y - bodyH - size * 0.2);
    ctx.lineTo(x - size * 0.22, y - bodyH - size * 0.38);
    ctx.lineTo(x - size * 0.08, y - bodyH - size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, y - bodyH - size * 0.2);
    ctx.lineTo(x + size * 0.22, y - bodyH - size * 0.38);
    ctx.lineTo(x + size * 0.08, y - bodyH - size * 0.18);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#FFAA00';
    ctx.globalAlpha = fadeAlpha * 0.8;
    ctx.beginPath();
    ctx.arc(x - size * 0.06, y - bodyH - size * 0.14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size * 0.06, y - bodyH - size * 0.14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fadeAlpha;

    // Wings that extend on bounce
    const wingSpread = halfW * (0.6 + Math.abs(bounceTimer) * 0.08);
    ctx.fillStyle = '#5A5A68';
    // Left wing
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.5, y - bodyH * 0.7);
    ctx.lineTo(x - wingSpread, y - bodyH * 0.9);
    ctx.lineTo(x - wingSpread * 0.8, y - bodyH * 0.5);
    ctx.closePath();
    ctx.fill();
    // Right wing
    ctx.beginPath();
    ctx.moveTo(x + halfW * 0.5, y - bodyH * 0.7);
    ctx.lineTo(x + wingSpread, y - bodyH * 0.9);
    ctx.lineTo(x + wingSpread * 0.8, y - bodyH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Pedestal base
    ctx.fillStyle = '#4A4A55';
    ctx.fillRect(x - halfW * 0.7, y - 3, halfW * 1.4, 3);
  }),

  drawAnimatedBackground: (ctx, _arena, time) => {
    if (getSlowDevice()) return;
    ctx.save();
    // Subtle: smaller halo, slow flicker, gentler embers.
    for (let i = 0; i < TORCH_X.length; i++) {
      const tx = TORCH_X[i];
      const flicker = 0.95 + fastSin(time * 6 + i * 1.7) * 0.05;
      ctx.fillStyle = '#ff7828';
      ctx.globalAlpha = 0.10 * flicker;
      ctx.beginPath();
      ctx.arc(tx, TORCH_FLAME_Y, 32 * flicker, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.06 * flicker;
      ctx.beginPath();
      ctx.arc(tx, TORCH_FLAME_Y, 18 * flicker, 0, Math.PI * 2);
      ctx.fill();
      // Single drifting ember per torch (was 2 with snappy motion).
      const u = ((time * 0.3 + i * 0.31) % 1);
      ctx.globalAlpha = (1 - u) * 0.45;
      ctx.fillStyle = '#ff9a3a';
      ctx.beginPath();
      ctx.arc(tx + fastSin(time * 1.5 + i) * 4, TORCH_FLAME_Y - 16 - u * 40, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  drawGroundCritters: (ctx, _arena, time, _dayPhase, matchState) => {
    if (!matchState) return;
    const dt = _tickCastleRatDt(time);
    for (let i = 0; i < _castleRats.length; i++) {
      const r = _castleRats[i];
      tickGroundCritter(r, matchState.players, dt, RATS_CFG[i]);
      drawRat(ctx, r.x, RATS_CFG[i].platTopY - 4, r.facingEase < 0 ? -1 : 1, time, Math.abs(r.facingEase), r.fleeing);
    }
  },

  buildReactiveDecorations: (arena: Arena) => {
    const out: ReactiveInstance[] = [];
    // Cobwebs — replay the per-platform RNG corner picks so positions match
    // the pre-migration static layout exactly.
    for (const plat of arena.platforms) {
      const corners = pickCobwebCorners(plat);
      for (const c of corners) {
        out.push(castleCobweb(c.x, c.y, c.dirX, c.dirY));
      }
    }
    // Banners — one per banner-eligible floating platform (width >= 100).
    const floats = getFloatingPlatforms(arena.platforms).filter(p => p.width >= 100);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const bx = plat.x + plat.width / 2;
      const by = plat.y + plat.height;
      out.push(castleBanner(bx, by, i));
    }
    return out;
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
  },

  scatterFlockConfigs: [
    {
      species: 'bat',
      positions: [
        { x: 400, y: 308 },
        { x: 880, y: 308 },
      ],
      radius: 140,
      respawnTime: 10,
    },
  ],

  musicFile: 'castle.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:208},{t:2,y:'j',x:0},{t:3,y:'d',x:208,d:100},{t:5,y:'j',x:79},{t:6,y:'j',x:164},{t:9,y:'j',x:0},{t:10,y:'j',x:0},{t:16,y:'j',x:208}],
      [{t:0,y:'j',x:380},{t:2,y:'j',x:868},{t:3,y:'d',x:380,d:100},{t:4,y:'d',x:868,d:100},{t:5,y:'j',x:380},{t:6,y:'j',x:380},{t:9,y:'j',x:868},{t:10,y:'j',x:868},{t:16,y:'j',x:434},{t:17,y:'j',x:634},{t:18,y:'j',x:824}],
      [{t:0,y:'j',x:1248},{t:1,y:'j',x:1040},{t:4,y:'d',x:1040,d:100},{t:5,y:'j',x:1248},{t:6,y:'j',x:1248},{t:9,y:'j',x:1169},{t:10,y:'j',x:1077},{t:18,y:'j',x:1040}],
      [{t:0,y:'j',x:240},{t:1,y:'j',x:348},{t:2,y:'j',x:240},{t:5,y:'j',x:240},{t:16,y:'j',x:348},{t:17,y:'j',x:348}],
      [{t:0,y:'j',x:1008},{t:1,y:'j',x:900},{t:2,y:'j',x:1008},{t:9,y:'j',x:1008},{t:17,y:'j',x:900},{t:18,y:'j',x:900}],
      [{t:0,y:'d',x:128},{t:2,y:'d',x:30},{t:3,y:'d',x:128,d:100},{t:6,y:'j',x:124},{t:7,y:'j',x:79},{t:9,y:'j',x:30},{t:10,y:'j',x:30},{t:11,y:'j',x:30},{t:16,y:'j',x:128},{t:19,y:'j',x:128}],
      [{t:0,y:'d',x:120},{t:1,y:'d',x:228},{t:2,y:'d',x:120},{t:3,y:'d',x:228,d:100},{t:5,y:'d',x:120},{t:7,y:'j',x:124},{t:8,y:'j',x:174},{t:10,y:'j',x:120},{t:11,y:'j',x:120},{t:14,y:'j',x:228},{t:19,y:'j',x:228}],
      [{t:0,y:'d',x:128},{t:2,y:'d',x:30},{t:3,y:'d',x:128,d:100},{t:5,y:'d',x:128},{t:6,y:'d',x:128},{t:8,y:'j',x:124},{t:9,y:'d',x:30},{t:11,y:'j',x:30},{t:12,y:'j',x:30},{t:13,y:'j',x:128}],
      [{t:0,y:'d',x:120},{t:1,y:'d',x:228},{t:2,y:'d',x:120},{t:3,y:'d',x:228,d:100},{t:5,y:'d',x:120},{t:6,y:'d',x:228},{t:7,y:'d',x:120},{t:9,y:'d',x:120},{t:12,y:'j',x:120},{t:13,y:'j',x:228},{t:16,y:'d',x:228},{t:19,y:'d',x:228}],
      [{t:0,y:'d',x:1218},{t:2,y:'d',x:1120},{t:4,y:'d',x:1120,d:100},{t:5,y:'j',x:1218},{t:6,y:'j',x:1218},{t:7,y:'j',x:1218},{t:10,y:'j',x:1120},{t:11,y:'j',x:1169},{t:18,y:'j',x:1120},{t:20,y:'j',x:1120}],
      [{t:0,y:'d',x:1113},{t:1,y:'d',x:1040},{t:2,y:'d',x:1113},{t:4,y:'d',x:1040,d:100},{t:6,y:'j',x:1113},{t:7,y:'j',x:1113},{t:9,y:'d',x:1113},{t:11,y:'j',x:1113},{t:12,y:'j',x:1079},{t:20,y:'j',x:1040}],
      [{t:0,y:'d',x:1218},{t:2,y:'d',x:1120},{t:4,y:'d',x:1120,d:100},{t:5,y:'d',x:1218},{t:7,y:'j',x:1218},{t:8,y:'j',x:1218},{t:9,y:'d',x:1218},{t:10,y:'d',x:1120},{t:12,y:'j',x:1120},{t:13,y:'j',x:1120}],
      [{t:0,y:'d',x:1118},{t:1,y:'d',x:1045},{t:2,y:'d',x:1118},{t:4,y:'d',x:1045,d:100},{t:5,y:'d',x:1118},{t:8,y:'j',x:1118},{t:9,y:'d',x:1118},{t:10,y:'d',x:1045},{t:11,y:'d',x:1118},{t:13,y:'j',x:1045},{t:18,y:'d',x:1045},{t:20,y:'d',x:1045}],
      [{t:0,y:'d',x:250},{t:1,y:'d',x:998},{t:2,y:'d',x:998},{t:3,y:'d',x:250,d:100},{t:4,y:'d',x:998,d:100},{t:5,y:'d',x:250},{t:6,y:'d',x:250},{t:7,y:'d',x:250},{t:8,y:'d',x:250},{t:9,y:'d',x:998},{t:10,y:'d',x:998},{t:11,y:'d',x:998},{t:12,y:'d',x:998},{t:16,y:'d',x:250},{t:18,y:'d',x:998},{t:19,y:'d',x:250},{t:20,y:'d',x:998}],
      [{t:1,y:'d',x:628},{t:3,y:'d',x:480,d:100},{t:15,y:'j',x:574},{t:16,y:'d',x:480},{t:17,y:'d',x:628},{t:19,y:'j',x:480},{t:20,y:'j',x:628}],
      [{t:1,y:'d',x:728},{t:3,y:'d',x:520,d:100},{t:4,y:'d',x:728,d:100},{t:8,y:'j',x:520},{t:12,y:'j',x:728},{t:13,y:'j',x:624},{t:14,y:'d',x:520},{t:16,y:'d',x:520},{t:17,y:'d',x:728},{t:18,y:'d',x:728}],
      [{t:1,y:'d',x:438},{t:3,y:'d',x:430,d:100},{t:5,y:'j',x:430},{t:6,y:'j',x:430},{t:14,y:'j',x:438},{t:17,y:'j',x:438},{t:19,y:'j',x:430}],
      [{t:1,y:'d',x:630},{t:14,y:'j',x:630},{t:16,y:'j',x:630},{t:18,y:'j',x:638}],
      [{t:1,y:'d',x:820},{t:4,y:'d',x:828,d:100},{t:9,y:'j',x:828},{t:10,y:'j',x:828},{t:14,y:'j',x:820},{t:17,y:'j',x:820},{t:20,y:'j',x:828}],
      [{t:0,y:'d',x:270},{t:1,y:'d',x:353},{t:3,y:'d',x:270,d:100},{t:5,y:'d',x:270},{t:6,y:'d',x:270},{t:7,y:'j',x:270},{t:8,y:'j',x:270},{t:11,y:'j',x:270},{t:13,y:'j',x:312},{t:15,y:'j',x:353},{t:16,y:'d',x:353}],
      [{t:1,y:'d',x:910},{t:2,y:'d',x:963},{t:4,y:'d',x:963,d:100},{t:9,y:'d',x:963},{t:10,y:'d',x:963},{t:11,y:'j',x:963},{t:12,y:'j',x:963},{t:13,y:'j',x:937},{t:15,y:'j',x:910},{t:18,y:'d',x:910}],
    ],
    nextHop: [[-1,1,2,3,1,5,6,5,6,9,10,5,10,5,6,6,16,3,1,5,9],[0,-1,2,3,4,5,6,5,6,9,10,5,10,5,6,6,16,17,18,5,9],[0,1,-1,0,4,5,6,5,6,9,10,5,10,5,6,6,0,4,18,5,9],[0,1,2,-1,1,5,0,5,0,0,0,5,5,5,16,16,16,17,1,5,0],[0,1,2,0,-1,0,0,9,0,9,0,9,9,9,17,17,0,17,18,0,9],[0,0,2,3,2,-1,6,7,6,9,10,11,7,7,6,19,16,3,2,19,9],[0,1,2,3,1,5,-1,7,8,0,10,11,7,7,14,14,0,1,1,19,10],[0,6,2,3,2,5,6,-1,8,9,0,11,12,13,6,6,0,3,2,5,9],[0,1,2,3,1,5,6,7,-1,9,0,5,12,13,6,19,16,1,1,19,9],[0,0,2,0,4,5,6,7,6,-1,10,11,7,7,6,20,0,4,18,5,20],[0,1,2,0,4,0,6,7,6,9,-1,11,12,7,6,20,0,1,1,6,20],[0,10,2,0,4,5,0,7,8,9,10,-1,12,13,0,5,0,4,2,5,9],[0,1,2,0,4,5,0,5,8,9,10,11,-1,13,18,20,0,1,18,5,20],[0,1,2,3,4,5,6,7,8,9,10,11,12,-1,6,19,16,1,18,19,20],[1,1,1,3,1,1,1,19,15,1,1,19,15,15,-1,15,16,17,1,19,20],[1,1,1,3,4,1,1,8,8,1,1,12,12,13,14,-1,16,17,18,8,12],[1,1,1,3,1,5,6,5,6,1,1,5,1,19,14,14,-1,17,1,19,14],[1,1,1,1,1,1,1,1,1,1,1,1,1,14,14,14,16,-1,18,14,14],[1,1,1,1,4,1,1,9,1,9,10,9,10,20,14,14,1,17,-1,14,20],[0,1,5,3,1,5,6,7,8,0,0,11,13,13,6,15,16,1,1,-1,13],[9,1,2,1,4,1,1,9,13,9,10,11,12,13,15,15,1,1,18,13,-1]],
    safeHop: [[-1,1,2,3,1,5,6,5,6,9,10,5,10,5,6,6,16,1,1,5,9],[0,-1,2,3,4,5,6,5,6,9,10,5,10,5,6,6,16,17,18,5,9],[0,1,-1,0,4,5,6,5,6,9,10,5,10,5,6,6,0,1,18,5,9],[0,1,2,-1,1,5,0,5,0,0,0,5,5,5,16,16,16,17,1,5,0],[0,1,2,0,-1,0,0,9,0,9,0,9,9,9,17,17,0,17,18,0,9],[0,0,2,3,2,-1,6,7,6,9,10,11,7,7,6,19,16,16,2,19,9],[0,1,2,3,1,5,-1,7,8,0,10,11,7,7,14,14,0,1,1,19,10],[0,6,2,3,2,5,6,-1,8,9,0,11,12,13,6,6,0,6,2,5,9],[0,1,2,3,1,5,6,7,-1,9,0,5,12,13,6,19,16,1,1,19,9],[0,0,2,0,4,5,6,7,6,-1,10,11,7,7,6,20,0,18,18,5,20],[0,1,2,0,4,0,6,7,6,9,-1,11,12,7,6,20,0,1,1,6,20],[0,10,2,0,4,5,0,7,8,9,10,-1,12,13,0,5,0,10,2,5,9],[0,1,2,0,4,5,0,5,8,9,10,11,-1,13,18,20,0,1,18,5,20],[0,1,2,3,4,5,6,7,8,9,10,11,12,-1,6,19,16,1,18,19,20],[1,1,1,3,1,1,1,19,15,1,1,19,15,15,-1,15,16,17,1,19,20],[1,1,1,3,4,1,1,8,8,1,1,12,12,13,14,-1,16,17,18,8,12],[1,1,1,3,1,5,6,5,6,1,1,5,1,19,14,14,-1,17,1,19,14],[1,1,1,1,1,1,1,1,1,1,1,1,1,14,14,14,16,-1,18,14,14],[1,1,1,1,4,1,1,9,1,9,10,9,10,20,14,14,1,17,-1,14,20],[0,1,5,3,1,5,6,7,8,0,0,11,13,13,6,15,16,1,1,-1,13],[9,1,2,1,4,1,1,9,13,9,10,11,12,13,15,15,1,1,18,13,-1]],
  },
  // NAV-DATA-END
};
