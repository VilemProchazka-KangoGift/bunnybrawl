import type { ArenaPack } from '../types';
import type { Platform, Ctx2D } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { fastSin } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import { isLivePlayer } from '../../themes/utils';

const CHIMNEYS = [
  { x: 144, y: 440 },
  { x: 264, y: 444 },
] as const;

// Room interior matches `openH = 88` in drawFarBackground (floor at y, ceiling
// at y - 88). The dark/light wash extends down through the platform body too,
// so the apartment reads continuously from ceiling to floor edge.
const HALLWAY_ROOM_H = 88;
const HALLWAY_FLOOR_BODY_H = 24;
interface Hallway { x: number; y: number; w: number }
const HALLWAYS: ReadonlyArray<Hallway> = [
  { x: 510, y: 550, w: 300 },
  { x: 970, y: 480, w: 230 },
];
const _hallwayGlowGrads = new WeakMap<Hallway, CanvasGradient>();
function getHallwayGlow(ctx: Ctx2D, h: Hallway): CanvasGradient {
  let g = _hallwayGlowGrads.get(h);
  if (!g) {
    const cx = h.x + h.w / 2;
    // Center between ceiling and floor-body bottom.
    const totalH = HALLWAY_ROOM_H + HALLWAY_FLOOR_BODY_H;
    const cy = h.y - HALLWAY_ROOM_H + totalH * 0.5;
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h.w * 0.9);
    g.addColorStop(0, 'rgba(255, 213, 107, 0.7)');
    g.addColorStop(1, 'rgba(255, 180, 60, 0.2)');
    _hallwayGlowGrads.set(h, g);
  }
  return g;
}
import {
  CAP_DEPTH, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  subtleDown, backIso, leftIso,
} from '../../themes/drawPrimitives';
import {
  registerReactiveKind, createReactiveInstance, composeBend,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics/reactiveDecorations';

// --- 3D rooftop cap: gravel + tar texture, with a raised parapet along the back.
// No body is drawn; drawFarBackground owns the building facades below.
function drawRoofPlatform(ctx: Ctx2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  const frontPts = subtleDown(platform.x, platform.width, cF, rng, { count: 2, amp: 0.8 });
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#3E3648',
    capLight: 'rgba(110,95,120,0.25)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      // Dense gravel specks across the cap
      ctx2.fillStyle = 'rgba(90,78,100,0.55)';
      const n = Math.max(6, Math.floor(platform.width / 7));
      for (let i = 0; i < n; i++) {
        const u = rng();
        const v = rng();
        const gx = platform.x + u * platform.width + v * skew;
        const gy = capBack + v * CAP_DEPTH + (rng() - 0.5) * 1.5;
        ctx2.beginPath();
        ctx2.arc(gx, gy, 0.7 + rng() * 0.6, 0, Math.PI * 2);
        ctx2.fill();
      }
      // A few darker tar blotches
      ctx2.fillStyle = 'rgba(22,18,30,0.45)';
      const blotchN = Math.max(1, Math.floor(platform.width / 80));
      for (let i = 0; i < blotchN; i++) {
        const u = 0.15 + rng() * 0.7;
        const v = 0.35 + rng() * 0.5;
        const bx = platform.x + u * platform.width + v * skew;
        const by = capBack + v * CAP_DEPTH;
        ctx2.beginPath();
        ctx2.ellipse(bx, by, 2.5 + rng() * 1.5, 1.3 + rng() * 0.7, rng() * Math.PI, 0, Math.PI * 2);
        ctx2.fill();
      }
      // Light sheen at the front edge (parapet lip)
      const sheen = ctx2.createLinearGradient(0, capFront - 2, 0, capFront + 1);
      sheen.addColorStop(0, 'rgba(160,150,170,0)');
      sheen.addColorStop(1, 'rgba(160,150,170,0.3)');
      ctx2.fillStyle = sheen;
      ctx2.fillRect(platform.x, capFront - 2, platform.width + skew, 3);
    },
  }, leftPts);

  // Parapet shadow — thin dark strip just below the cap's front edge, anchoring
  // the rooftop against the facade that drawFarBackground paints beneath.
  ctx.fillStyle = 'rgba(12,10,18,0.45)';
  ctx.fillRect(platform.x, cF, platform.width, 2);
}

// --- Hallway floor: wood planks + crimson carpet runner, with a short wood body
// representing the floor's edge thickness.
function drawHallwayPlatformBg(ctx: Ctx2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — dark wood edge
  drawPlatformRightFace(ctx, platform, '#2A1C14');

  // Edges — subtle wear scrapes on front, iso cap.
  const frontPts = subtleDown(platform.x, platform.width, cF, rng, { count: 2, amp: 0.8 });
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  // Cap — wood plank surface with crimson carpet runner down the middle
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#6A4A30',
    capLight: 'rgba(150,110,70,0.25)',
    drawCapTexture: (ctx2, _capFront, capBack, skew) => {
      // Plank seams — vertical ticks spaced ~45px apart, slightly staggered per row
      ctx2.fillStyle = 'rgba(30,18,10,0.55)';
      const plankW = 45;
      for (let i = 0; i < 2; i++) {
        const rowY = capBack + (i === 0 ? CAP_DEPTH * 0.25 : CAP_DEPTH * 0.65);
        const rowShift = i === 0 ? 0 : plankW * 0.5;
        for (let px = platform.x + rowShift; px < platform.x + platform.width; px += plankW) {
          const gx = px + (rowY - capBack) / CAP_DEPTH * skew;
          ctx2.fillRect(gx, rowY - CAP_DEPTH * 0.15, 1, CAP_DEPTH * 0.3);
        }
      }
      // Crimson carpet runner — tapered inward from both ends, gold fringe edges
      const runnerTopV = 0.15;  // fraction of CAP_DEPTH from cB
      const runnerBotV = 0.95;
      const runnerPad = 30;
      const runnerX0 = platform.x + runnerPad;
      const runnerX1 = platform.x + platform.width - runnerPad;
      if (runnerX1 > runnerX0 + 20) {
        ctx2.fillStyle = '#8B2A2A';
        ctx2.beginPath();
        ctx2.moveTo(runnerX0 + runnerTopV * skew, capBack + runnerTopV * CAP_DEPTH);
        ctx2.lineTo(runnerX1 + runnerTopV * skew, capBack + runnerTopV * CAP_DEPTH);
        ctx2.lineTo(runnerX1 + runnerBotV * skew, capBack + runnerBotV * CAP_DEPTH);
        ctx2.lineTo(runnerX0 + runnerBotV * skew, capBack + runnerBotV * CAP_DEPTH);
        ctx2.closePath();
        ctx2.fill();
        // Gold fringe along front edge
        ctx2.fillStyle = '#C79A3A';
        ctx2.fillRect(runnerX0 + runnerBotV * skew, capBack + runnerBotV * CAP_DEPTH - 1.5, runnerX1 - runnerX0, 1);
        // Darker stripe down the runner center for depth
        ctx2.fillStyle = 'rgba(40,10,10,0.35)';
        const midV = (runnerTopV + runnerBotV) * 0.5;
        ctx2.fillRect(runnerX0 + midV * skew, capBack + midV * CAP_DEPTH - 0.5, runnerX1 - runnerX0, 1);
      }
      // Scuff marks on the wood — a couple of subtle darker smears outside the runner
      ctx2.fillStyle = 'rgba(30,20,12,0.25)';
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 0 : 1;
        const v = 0.3 + rng() * 0.5;
        const sxBase = platform.x + (side === 0 ? rng() * runnerPad : platform.width - rng() * runnerPad);
        ctx2.beginPath();
        ctx2.ellipse(sxBase + v * skew, capBack + v * CAP_DEPTH, 3 + rng() * 2, 0.7, 0, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
  }, leftPts);
}

// Hallway body fg pass — wood planks with grain. Drawn after players for occlusion.
function drawHallwayPlatformFg(ctx: Ctx2D, platform: Platform): void {
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  bodyGrad.addColorStop(0, '#4A3020');
  bodyGrad.addColorStop(1, '#2A1C14');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);
  ctx.strokeStyle = 'rgba(20,12,6,0.45)';
  ctx.lineWidth = 1;
  for (let gy = bodyTop + 3; gy < bodyTop + bodyH - 1; gy += 4) {
    ctx.beginPath();
    ctx.moveTo(platform.x, gy);
    ctx.lineTo(platform.x + platform.width, gy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 2, platform.width, 2);
}

// --- Prop renderers (chimney / AC / HVAC / balcony). Each renders the full
// prop body; no 3D cap framework because the props have their own silhouette
// (brick stack, AC fan grill, vent slats, awning).
function drawChimneyBg(ctx: Ctx2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const bodyTop = cF;
  const bodyExt = CAP_DEPTH / 2;
  const bodyH = platform.height - CAP_DEPTH / 2 + bodyExt;
  const sp = skewPx();

  // Right face — darker brick (extended bottom matches body)
  drawPlatformRightFace(ctx, platform, '#2E2024', bodyTop + bodyH);

  // Cap iso parallelogram + lid texture.
  const x = platform.x;
  const w = platform.width;
  const frontPts = subtleDown(x, w, cF, rng, { count: 1, amp: 0.5 });
  const backPts = backIso(x, w, cB, sp);
  const leftPts = leftIso(cB, cF, x, sp);
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#5A4A50',
    capLight: 'rgba(120,100,110,0.35)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      const flueW = w * 0.45;
      const flueX = x + (w - flueW) * 0.5;
      const flueV = 0.4;
      ctx2.fillStyle = '#15101A';
      ctx2.fillRect(flueX + flueV * skew, capBack + flueV * CAP_DEPTH, flueW, CAP_DEPTH * 0.35);
      ctx2.fillStyle = 'rgba(20,15,18,0.6)';
      ctx2.fillRect(flueX + flueV * skew - 1, capBack + flueV * CAP_DEPTH - 0.5, flueW + 2, 1);
      ctx2.fillStyle = 'rgba(180,160,170,0.25)';
      ctx2.fillRect(x + 1, capFront - 1.5, w + skew * 0.5, 1);
    },
  }, leftPts);

  // Smoke wisp rising from the flue
  ctx.strokeStyle = 'rgba(150, 140, 160, 0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + sp * 0.4, cB - 1);
  ctx.quadraticCurveTo(x + w / 2 + 9, cB - 12, x + w / 2 + 4, cB - 22);
  ctx.stroke();
}

// Chimney body fg pass — brick column. Drawn after players for occlusion.
function drawChimneyFg(ctx: Ctx2D, platform: Platform): void {
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyExt = CAP_DEPTH / 2;
  const bodyH = platform.height - CAP_DEPTH / 2 + bodyExt;
  const x = platform.x;
  const w = platform.width;

  ctx.fillStyle = '#4A3A40';
  ctx.fillRect(x, bodyTop, w, bodyH);
  ctx.strokeStyle = 'rgba(28, 18, 22, 0.55)';
  ctx.lineWidth = 1;
  for (let by = bodyTop + 4; by < bodyTop + bodyH; by += 7) {
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x + w, by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(28, 18, 22, 0.4)';
  for (let i = 0, by = bodyTop + 4; by < bodyTop + bodyH; by += 7, i++) {
    const off = i % 2 === 0 ? w * 0.5 : 0;
    ctx.beginPath();
    ctx.moveTo(x + off, by);
    ctx.lineTo(x + off, by + 7);
    ctx.stroke();
  }
}

function drawBalcony(ctx: Ctx2D, platform: Platform): void {
  const { x, y, width: w, height: h } = platform;
  ctx.fillStyle = '#6A6A78';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#7A7A88';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = '#5A5A68';
  ctx.fillRect(x - 2, y + 2, 3, h - 4);
  ctx.fillRect(x + w - 1, y + 2, 3, h - 4);
  const awH = 13;
  ctx.fillStyle = '#8B3030';
  ctx.beginPath();
  ctx.moveTo(x, y - 1);
  ctx.lineTo(x + 4, y - awH);
  ctx.lineTo(x + w - 4, y - awH);
  ctx.lineTo(x + w, y - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#C04040';
  for (let sx = x + 8; sx < x + w - 8; sx += 13) {
    const t0 = (sx - x) / w;
    const t1 = (sx + 5 - x) / w;
    const sy0 = y - 1 - (awH - 2) * Math.min(t0 * 3, (1 - t0) * 3, 1);
    const sy1 = y - 1 - (awH - 2) * Math.min(t1 * 3, (1 - t1) * 3, 1);
    ctx.beginPath();
    ctx.moveTo(sx, sy0);
    ctx.lineTo(sx + 5, sy1);
    ctx.lineTo(sx + 5, y - 1);
    ctx.lineTo(sx, y - 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#5A5A68';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + w, y - 10);
  ctx.stroke();
  for (let rx = x + 5; rx < x + w; rx += 12) {
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(rx, y - 10);
    ctx.stroke();
  }
}

function drawAcUnitBg(ctx: Ctx2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const bodyTop = cF;
  const bodyExt = 14;
  const bodyH = platform.height - CAP_DEPTH / 2 + bodyExt;
  const sp = skewPx();
  const x = platform.x;
  const w = platform.width;

  // Right face — dark metal shadow (extended bottom matches body)
  drawPlatformRightFace(ctx, platform, '#7C7C84', bodyTop + bodyH);

  // Cap — iso parallelogram + compressor grill ridges + front sheen.
  const frontPts = subtleDown(x, w, cF, rng, { count: 1, amp: 0.5 });
  const backPts = backIso(x, w, cB, sp);
  const leftPts = leftIso(cB, cF, x, sp);
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#B6B6C0',
    capLight: 'rgba(230,230,238,0.4)',
    drawCapTexture: (ctx2, capFront, capBack, skew) => {
      ctx2.fillStyle = 'rgba(110,110,124,0.65)';
      const ridges = 5;
      const ridgeV = 0.35;
      for (let i = 0; i < ridges; i++) {
        const u = (i + 0.5) / ridges;
        const rx = x + 3 + u * (w - 6) + ridgeV * skew;
        ctx2.fillRect(rx, capBack + ridgeV * CAP_DEPTH, 1, CAP_DEPTH * 0.45);
      }
      const sheen = ctx2.createLinearGradient(0, capFront - 2, 0, capFront);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(255,255,255,0.4)');
      ctx2.fillStyle = sheen;
      ctx2.fillRect(x, capFront - 2, w + skew * 0.5, 2);
    },
  }, leftPts);
}

// AC body fg pass — housing + fan + vent slats + rubber feet. Drawn after
// players for occlusion (so the player's right edge "goes behind" the AC).
function drawAcUnitFg(ctx: Ctx2D, platform: Platform): void {
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyExt = 14;
  const bodyH = platform.height - CAP_DEPTH / 2 + bodyExt;
  const x = platform.x;
  const w = platform.width;

  // Body front face — main housing
  ctx.fillStyle = '#D8D8E0';
  ctx.fillRect(x, bodyTop, w, bodyH);
  // Bottom shadow band
  ctx.fillStyle = '#A0A0A8';
  ctx.fillRect(x, bodyTop + bodyH - 2, w, 2);
  // Frame border
  ctx.strokeStyle = '#808088';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, bodyTop + 0.5, w - 1, bodyH - 1);

  // Big fan grill
  const fanCx = x + w * 0.6;
  const fanCy = bodyTop + bodyH / 2;
  const fanR = bodyH * 0.42;
  ctx.fillStyle = '#2C2C34';
  ctx.beginPath();
  ctx.arc(fanCx, fanCy, fanR + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9CA0AC';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(fanCx, fanCy, fanR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(140,144,156,0.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(fanCx, fanCy, fanR * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,154,168,0.85)';
  ctx.lineWidth = 0.9;
  const spokeCount = 8;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(fanCx + Math.cos(a) * fanR * 0.18, fanCy + Math.sin(a) * fanR * 0.18);
    ctx.lineTo(fanCx + Math.cos(a) * fanR * 0.92, fanCy + Math.sin(a) * fanR * 0.92);
    ctx.stroke();
  }
  ctx.fillStyle = '#646874';
  ctx.beginPath();
  ctx.arc(fanCx, fanCy, fanR * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(220,224,232,0.7)';
  ctx.beginPath();
  ctx.arc(fanCx - fanR * 0.05, fanCy - fanR * 0.06, fanR * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Vent slats on the left portion
  ctx.fillStyle = '#B0B0B8';
  for (let vy = bodyTop + 2; vy < bodyTop + bodyH - 2; vy += 2.5) {
    ctx.fillRect(x + 2, vy, w * 0.28, 1.2);
  }
  // Rubber feet — at the bottom of the body, hanging just below
  ctx.fillStyle = '#404048';
  ctx.fillRect(x + 4, bodyTop + bodyH, 4, 2);
  ctx.fillRect(x + w - 8, bodyTop + bodyH, 4, 2);
}

function drawHvacBlock(ctx: Ctx2D, platform: Platform): void {
  const { x, y, width: w, height: h } = platform;
  ctx.fillStyle = '#5A5A68';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(70, 70, 80, 0.5)';
  ctx.lineWidth = 1;
  for (let vy = y + 4; vy < y + h - 2; vy += 4) {
    ctx.beginPath();
    ctx.moveTo(x + 2, vy);
    ctx.lineTo(x + w - 2, vy);
    ctx.stroke();
  }
  ctx.fillStyle = '#6A6A78';
  ctx.fillRect(x - 1, y - 2, w + 2, 3);
  ctx.fillStyle = '#5A5A64';
  ctx.fillRect(x + w / 2 - 3, y - 8, 6, 8);
  ctx.fillRect(x + w / 2 - 5, y - 10, 10, 3);
}

// Bg pass dispatch — cap + right face for iso styles, full draw for bespoke styles.
function drawRooftopsPlatformBg(ctx: Ctx2D, platform: Platform): void {
  switch (platform.style) {
    case 'roof':     return drawRoofPlatform(ctx, platform);
    case 'hallway':  return drawHallwayPlatformBg(ctx, platform);
    case 'chimney':  return drawChimneyBg(ctx, platform);
    case 'balcony':  return drawBalcony(ctx, platform);  // bespoke 2D, all in bg
    case 'ac':       return drawAcUnitBg(ctx, platform);
    case 'hvac':     return drawHvacBlock(ctx, platform);  // bespoke 2D, all in bg
    default: {
      ctx.fillStyle = '#4A4050';
      ctx.fillRect(platform.x, platform.y + 3, platform.width, platform.height - 3);
      ctx.fillStyle = '#6A5A6A';
      ctx.fillRect(platform.x, platform.y, platform.width, 4);
    }
  }
}

// Fg pass dispatch — body face for iso styles only. Bespoke styles render fully in bg.
function drawRooftopsPlatformFg(ctx: Ctx2D, platform: Platform): void {
  switch (platform.style) {
    case 'hallway':  return drawHallwayPlatformFg(ctx, platform);
    case 'chimney':  return drawChimneyFg(ctx, platform);
    case 'ac':       return drawAcUnitFg(ctx, platform);
    // 'roof' has no body. 'balcony' and 'hvac' rendered fully in bg pass.
  }
}

// ============================================================================
// Reactive decoration factories + draw fns
// ============================================================================

// ---- rooftops.clothesline ----
const CLOTHESLINE_COLORS = ['#CC4444', '#4444CC', '#44CC44', '#CCCC44', '#CC44CC', '#CC8844'];
interface ClotheslineData { x1: number; y1: number; x2: number; y2: number; }
function rooftopsClothesline(x1: number, y1: number, x2: number, y2: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x: (x1 + x2) / 2, y: Math.max(y1, y2) + 15 },
    kind: 'rooftops.clothesline',
    seed: Math.floor((x1 * 91 + y1 * 41 + x2 * 53) % 997),
    data: { x1, y1, x2, y2 } satisfies ClotheslineData,
    windAmp: 8,
    proximity: { radius: 40, mode: 'lean', magnitude: 22 },
  });
}
registerReactiveKind('rooftops.clothesline', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { x1, y1, x2, y2 } = inst.data as ClotheslineData;
    const bend = composeBend(inst, swayPhase);
    ctx.save();
    ctx.globalAlpha = 1;
    // Wall attachment hooks (fixed — anchored to building walls)
    ctx.fillStyle = '#5A5A68';
    ctx.fillRect(x1 - 2, y1 - 3, 5, 6);
    ctx.fillRect(x2 - 2, y2 - 3, 5, 6);
    // Rope with sag — midpoint bends with wind/proximity
    ctx.strokeStyle = '#6A6A7A';
    ctx.lineWidth = 1;
    const midY = Math.max(y1, y2) + 15;
    const midX = (x1 + x2) / 2 + bend;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();
    // Hanging clothes — bend amount tapers from 0 at hooks to full at midpoint
    const n = Math.floor((x2 - x1) / 28);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = x1 + (x2 - x1) * t;
      const sagY = Math.min(y1, y2) + (midY - Math.min(y1, y2)) * 4 * t * (1 - t);
      // Taper bend along rope (max at midpoint t=0.5)
      const taper = 4 * t * (1 - t);
      const itemBend = bend * taper;
      ctx.fillStyle = CLOTHESLINE_COLORS[i % CLOTHESLINE_COLORS.length];
      ctx.globalAlpha = 0.65;
      ctx.save();
      ctx.translate(cx + itemBend, sagY + 2);
      // Wind-flap rotation responds to bend velocity for liveliness
      const flap = 0.12 + Math.sin(i * 1.7) * 0.08 + (bend * 0.01);
      ctx.rotate(flap);
      if (i % 4 === 0) {
        // Shirt -- T shape
        ctx.fillRect(-4, 0, 8, 11);
        ctx.fillRect(-7, 0, 3, 5);
        ctx.fillRect(4, 0, 3, 5);
      } else if (i % 4 === 1) {
        // Pants
        ctx.fillRect(-3, 0, 6, 5);
        ctx.fillRect(-3, 5, 2, 7);
        ctx.fillRect(1, 5, 2, 7);
      } else if (i % 4 === 2) {
        // Towel / sheet -- flapping
        ctx.fillRect(-3, 0, 6, 14);
        ctx.fillStyle = CLOTHESLINE_COLORS[(i + 2) % CLOTHESLINE_COLORS.length];
        ctx.globalAlpha = 0.25;
        ctx.fillRect(-3, 4, 6, 2);
      } else {
        // Sock pair
        ctx.fillRect(-4, 0, 3, 8);
        ctx.fillRect(1, 0, 3, 8);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
});

// ---- rooftops.antenna ----
interface AntennaData { h: number; }
function rooftopsAntenna(x: number, y: number, h: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y },
    kind: 'rooftops.antenna',
    seed: Math.floor((x * 67 + y * 23 + h) % 997),
    data: { h } satisfies AntennaData,
    windAmp: 1,        // rigid metal — minimal sway
    shakeRadius: 60,   // small wobble on rooftop stomp
  });
}
registerReactiveKind('rooftops.antenna', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase, _time, _dayPhase, _state) => {
    const { h } = inst.data as AntennaData;
    // Rigid metal: tiny wind sway + brief shake on stomp.
    const lean = swayPhase + (inst.shakeDecay > 0 ? Math.sin(inst.shakeDecay * 40) * inst.shakeDecay * 4 : 0);
    ctx.save();
    ctx.translate(inst.pos.x, inst.pos.y);
    // Rotate around the base so the tip sways further than the base.
    ctx.rotate(lean * 0.012);
    ctx.strokeStyle = '#5A5A6A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -h * 0.7);
    ctx.lineTo(10, -h * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7, -h * 0.85);
    ctx.lineTo(7, -h * 0.85);
    ctx.stroke();
    ctx.fillStyle = '#FF0000';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, -h, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  },
});

export const rooftops: ArenaPack = {
  // ---- Identity ----
  id: 'rooftops',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #FF6B35 0%, #FF8C5A 40%, #3A2A4A 100%)',
  previewIcon: '\u{1F3D9}\u{FE0F}',

  // ---- Translations ----
  translations: { en: 'Rooftops', cs: 'St\u0159echy', hi: '\u091B\u0924\u0947\u0902', fil: 'Bubungan' },

  // ---- Layout ----
  defaultSurface: 'wood',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 80, y: 480, width: 270, height: 240, style: 'roof' },
    { x: 130, y: 440, width: 28, height: 40, style: 'chimney' },
    { x: 250, y: 444, width: 28, height: 36, style: 'chimney' },
    { x: 350, y: 505, width: 52, height: 20, style: 'ac' },
    { x: 458, y: 430, width: 52, height: 20, style: 'ac' },
    { x: 445, y: 550, width: 65, height: 14, style: 'balcony' },
    { x: 510, y: 370, width: 300, height: 80, style: 'roof' },
    { x: 510, y: 550, width: 300, height: 24, style: 'hallway' },
    { x: 510, y: 580, width: 300, height: 140, style: 'roof' },
    { x: 555, y: 335, width: 40, height: 35, style: 'hvac' },
    { x: 650, y: 330, width: 45, height: 40, style: 'hvac' },
    { x: 760, y: 338, width: 38, height: 32, style: 'hvac' },
    { x: 810, y: 550, width: 65, height: 14, style: 'balcony' },
    { x: 810, y: 430, width: 52, height: 20, style: 'ac' },
    { x: 918, y: 360, width: 52, height: 20, style: 'ac' },
    { x: 905, y: 480, width: 65, height: 14, style: 'balcony' },
    { x: 970, y: 300, width: 230, height: 80, style: 'roof' },
    { x: 970, y: 480, width: 230, height: 24, style: 'hallway' },
    { x: 970, y: 510, width: 230, height: 210, style: 'roof' },
    { x: 1200, y: 480, width: 65, height: 14, style: 'balcony' },
  ], p => p.style === 'roof' || p.style === 'hallway' || p.style === 'chimney' || p.style === 'ac'),
  spawnPoints: [
    { x: 200, y: 460 }, { x: 620, y: 350 }, { x: 1080, y: 280 },
    { x: 280, y: 460 }, { x: 660, y: 530 }, { x: 1080, y: 460 },
  ],
  allowFallOff: true,
  noSpawnZones: [
    { x: 510, y: 450, width: 300, height: 130 },
    { x: 510, y: 575, width: 300, height: 145 },
    { x: 970, y: 380, width: 230, height: 100 },
    { x: 970, y: 505, width: 230, height: 215 },
  ],

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#FF6B35' },
      { offset: 0.25, color: '#FF8C5A' },
      { offset: 0.5, color: '#CC6A70' },
      { offset: 0.75, color: '#6A4A6A' },
      { offset: 1, color: '#2A1A3A' },
    ],
  },

  hills: [],

  ground: {
    surfaceColor: '#5A5060',  },

  // ---- Ambient systems ----
  clouds: {
    count: 4,
    color: 'rgba(255, 150, 100, 0.35)',
    minSize: 55,
    maxSize: 90,
    minSpeed: 3,
    maxSpeed: 7,
    yRange: [20, 70],
  },

  weather: {
    particleCount: 12,
    types: [
      { type: 'leaf', weight: 0.6, sizeRange: [3, 5], vxRange: [5, 20], vyRange: [5, 15], rotSpeedRange: [1, 4] },
      { type: 'ash', weight: 0.4, sizeRange: [2, 4], vxRange: [3, 15], vyRange: [3, 10], rotSpeedRange: [0.5, 2], color: 'rgba(200, 190, 180, 0.4)' },
    ],
  },

  wildlife: {
    count: 5,
    types: [
      { type: 'bird', weight: 1, colors: ['#2A2A3A', '#3A3A4A', '#5A5A6A'], speedRange: [30, 60], yRange: [0.05, 0.3] },
    ],
  },

  fog: {
    count: 6,
    baseY: 680,
    yVariance: 10,
    speedRange: [2, 4],
    alphaRange: [0.05, 0.1],
    color: '#6A5A7A',
    sizeX: 40,
    sizeY: 8,
  },

  ambientParticles: {
    count: 6,
    sizeRange: [1, 2],
    vxRange: [1, 5],
    vyRange: [-2, -8],
    alphaRange: [0.15, 0.35],
    colors: ['#FFCC88', '#FFD4AA'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, arena) => {
    ctx.save();

    // Sunset glow
    const sunGrd = ctx.createRadialGradient(250, 170, 10, 250, 170, 200);
    sunGrd.addColorStop(0, 'rgba(255, 200, 80, 0.25)');
    sunGrd.addColorStop(1, 'rgba(255, 150, 50, 0)');
    ctx.fillStyle = sunGrd;
    ctx.fillRect(50, 0, 400, 400);

    // === Background buildings -- distant city skyline ===
    ctx.globalAlpha = 0.35;
    const bgBuildings = [
      // Left gap (0-80)
      { x: -10, w: 45, top: 380, color: '#14101C' },
      { x: 30, w: 55, top: 340, color: '#18121E' },
      // Gap 1 (350-510)
      { x: 355, w: 45, top: 360, color: '#14101C' },
      { x: 390, w: 60, top: 310, color: '#100C18' },
      { x: 440, w: 50, top: 380, color: '#18121E' },
      // Gap 2 (810-970)
      { x: 820, w: 50, top: 330, color: '#14101C' },
      { x: 860, w: 65, top: 290, color: '#100C18' },
      { x: 920, w: 45, top: 350, color: '#18121E' },
      // Right gap (1200-1280)
      { x: 1210, w: 50, top: 320, color: '#14101C' },
      { x: 1250, w: 40, top: 370, color: '#18121E' },
    ];
    for (const bg of bgBuildings) {
      ctx.fillStyle = bg.color;
      ctx.fillRect(bg.x, bg.top, bg.w, 720 - bg.top);
      // Tiny windows
      ctx.fillStyle = '#FFCC55';
      ctx.globalAlpha = 0.12;
      for (let wy = bg.top + 15; wy < 700; wy += 18) {
        for (let wx = bg.x + 5; wx < bg.x + bg.w - 5; wx += 12) {
          if (Math.sin(wx * 1.3 + wy * 0.7) > 0) {
            ctx.fillRect(wx, wy, 4, 5);
          }
        }
      }
      ctx.globalAlpha = 0.35;
      // Varied rooftops -- some with antenna, some with water tank
      ctx.fillStyle = bg.color;
      if (Math.sin(bg.x * 0.1) > 0.3) {
        // Antenna
        ctx.fillRect(bg.x + bg.w / 2 - 1, bg.top - 20, 2, 20);
        ctx.fillStyle = '#FF3333';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(bg.x + bg.w / 2, bg.top - 20, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35;
      } else if (Math.sin(bg.x * 0.2) > 0) {
        // Water tank silhouette
        ctx.fillRect(bg.x + bg.w * 0.3, bg.top - 12, bg.w * 0.4, 12);
      }
    }

    // === Main building facades ===
    const buildings = [
      { x: 80, w: 270, roofY: 480, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
      { x: 510, w: 300, roofY: 370, color: '#222030', dark: '#1A1828', accent: '#282535' },
      { x: 970, w: 230, roofY: 300, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
    ];

    for (const b of buildings) {
      ctx.globalAlpha = 0.95;
      // Main wall -- facade starts at rooftop level
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.roofY, b.w, 720 - b.roofY);
      // Thick side edges
      ctx.fillStyle = b.dark;
      ctx.fillRect(b.x, b.roofY, 10, 720 - b.roofY);
      ctx.fillRect(b.x + b.w - 10, b.roofY, 10, 720 - b.roofY);
      // Extended right-side wall — sits behind the 3D rooftop cap's 8px rightward
      // skew so the cap's overhang has a solid wall beneath it instead of sky.
      // Starts 8px above the original roofline to also back the cap's raised back edge.
      ctx.fillRect(b.x + b.w, b.roofY - 8, 8, 728 - b.roofY);
      // Top-left infill — fills the 8x8 wedge above the facade's top-left where
      // the iso cap's back-left has shifted INWARD (back-left at x+sp, not x).
      // Without this, that corner shows sky behind the cap's left slope.
      ctx.fillRect(b.x, b.roofY - 8, 8, 8);
      // Parapet rim at rooftop edge -- sits exactly at building top
      ctx.fillStyle = b.accent;
      ctx.fillRect(b.x, b.roofY - 3, b.w, 5);
      ctx.fillStyle = b.dark;
      ctx.fillRect(b.x, b.roofY - 4, b.w, 2);

      // Concrete floor bands
      ctx.strokeStyle = 'rgba(15, 12, 20, 0.3)';
      ctx.lineWidth = 2;
      for (let fy = b.roofY + 45; fy < 720; fy += 45) {
        ctx.beginPath();
        ctx.moveTo(b.x, fy);
        ctx.lineTo(b.x + b.w, fy);
        ctx.stroke();
      }

      // Dense windows
      ctx.globalAlpha = 1;
      for (let wy = b.roofY + 15; wy < 720; wy += 26) {
        // Skip window rows in the hallway opening zone (upper block bottom to hallway floor)
        let inHallwayZone = false;
        for (const plat of arena.platforms) {
          if (plat.width >= 200 && plat.height >= 20 && plat.height < 30 &&
              plat.x >= b.x - 5 && plat.x + plat.width <= b.x + b.w + 5) {
            // The hallway opening spans from ~90px above the floor to the floor
            if (wy >= plat.y - 95 && wy <= plat.y + 5) {
              inHallwayZone = true;
              break;
            }
          }
        }
        if (inHallwayZone || (wy >= b.roofY - 8 && wy <= b.roofY + 8)) continue;

        for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 24) {
          ctx.fillStyle = '#1A1520';
          ctx.fillRect(wx - 1, wy - 1, 13, 17);
          const lit = Math.sin(wx * 0.7 + wy * 0.3) > -0.2;
          ctx.fillStyle = lit ? 'rgba(255, 200, 100, 0.18)' : 'rgba(80, 100, 140, 0.08)';
          ctx.fillRect(wx, wy, 11, 15);
          ctx.strokeStyle = 'rgba(25, 20, 30, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(wx + 5.5, wy);
          ctx.lineTo(wx + 5.5, wy + 15);
          ctx.stroke();
        }
      }

      // Hallway interiors -- rich indoor environment (90px tall opening)
      for (const plat of arena.platforms) {
        if (plat.width >= 200 && plat.height >= 20 && plat.height < 30 &&
            plat.x >= b.x - 5 && plat.x + plat.width <= b.x + b.w + 5) {
          const openH = 88;
          const openY = plat.y - openH;
          const floorY = plat.y;
          const ceilY = openY;
          const inset = 8;

          // === Wallpaper background ===
          ctx.fillStyle = '#3A2520';
          ctx.fillRect(b.x + inset, ceilY, b.w - inset * 2, openH);

          // Wainscoting -- darker lower wall panel
          const wainH = openH * 0.4;
          ctx.fillStyle = '#2E1C18';
          ctx.fillRect(b.x + inset, floorY - wainH, b.w - inset * 2, wainH);
          // Wainscoting trim rail
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, floorY - wainH - 2, b.w - inset * 2, 3);
          // Wainscoting panels
          ctx.strokeStyle = 'rgba(60, 35, 25, 0.25)';
          ctx.lineWidth = 1;
          for (let px = b.x + inset + 20; px < b.x + b.w - inset; px += 35) {
            ctx.strokeRect(px, floorY - wainH + 4, 28, wainH - 8);
          }

          // Upper wallpaper pattern stripes
          ctx.strokeStyle = 'rgba(80, 45, 30, 0.12)';
          for (let sy = ceilY + 4; sy < floorY - wainH; sy += 8) {
            ctx.beginPath();
            ctx.moveTo(b.x + inset + 2, sy);
            ctx.lineTo(b.x + b.w - inset - 2, sy);
            ctx.stroke();
          }

          // Baseboard
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, floorY - 4, b.w - inset * 2, 4);
          // Crown molding at ceiling
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, ceilY - 1, b.w - inset * 2, 3);

          // Ceiling light fixture
          ctx.fillStyle = 'rgba(200, 160, 80, 0.3)';
          ctx.fillRect(b.x + b.w * 0.45, ceilY + 1, 24, 4);
          ctx.fillStyle = 'rgba(255, 220, 140, 0.15)';
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.45, ceilY + 5);
          ctx.lineTo(b.x + b.w * 0.45 + 12, ceilY + 25);
          ctx.lineTo(b.x + b.w * 0.45 + 24, ceilY + 5);
          ctx.closePath();
          ctx.fill();

          // Warm light glow from lamp
          const glowGrd = ctx.createRadialGradient(
            b.x + b.w * 0.32, floorY - 30, 5,
            b.x + b.w * 0.32, floorY - 30, 65
          );
          glowGrd.addColorStop(0, 'rgba(255, 180, 80, 0.12)');
          glowGrd.addColorStop(1, 'rgba(255, 180, 80, 0)');
          ctx.fillStyle = glowGrd;
          ctx.fillRect(b.x + inset, ceilY, b.w - inset * 2, openH);

          // === Furniture ===
          // Tall bookshelf (left side)
          ctx.fillStyle = 'rgba(50, 30, 20, 0.7)';
          ctx.fillRect(b.x + 18, ceilY + 8, 22, openH - 14);
          ctx.fillStyle = 'rgba(60, 40, 25, 0.4)';
          for (let sy = ceilY + 14; sy < floorY - 6; sy += 10) {
            ctx.fillRect(b.x + 20, sy, 18, 2);
          }
          // Books on shelves (colored spines)
          const bookColors = ['#7A3030', '#304070', '#307040', '#705030'];
          for (let sy = ceilY + 16; sy < floorY - 10; sy += 10) {
            for (let bx = 0; bx < 3; bx++) {
              ctx.fillStyle = bookColors[(sy + bx) % bookColors.length];
              ctx.globalAlpha = 0.3;
              ctx.fillRect(b.x + 21 + bx * 5, sy, 4, 8);
            }
          }
          ctx.globalAlpha = 1;

          // Table with lamp
          ctx.fillStyle = 'rgba(50, 30, 20, 0.6)';
          const tblX = b.x + b.w * 0.3;
          ctx.fillRect(tblX, floorY - 18, 34, 16);
          ctx.fillRect(tblX + 3, floorY - 2, 3, 2);
          ctx.fillRect(tblX + 28, floorY - 2, 3, 2);
          // Lamp on table
          ctx.fillStyle = 'rgba(255, 200, 100, 0.22)';
          ctx.beginPath();
          ctx.arc(tblX + 17, floorY - 25, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(200, 160, 80, 0.3)';
          ctx.beginPath();
          ctx.moveTo(tblX + 10, floorY - 25);
          ctx.lineTo(tblX + 14, floorY - 40);
          ctx.lineTo(tblX + 20, floorY - 40);
          ctx.lineTo(tblX + 24, floorY - 25);
          ctx.closePath();
          ctx.fill();

          // Armchair (right side)
          ctx.fillStyle = 'rgba(70, 35, 25, 0.55)';
          const chX = b.x + b.w * 0.62;
          ctx.fillRect(chX, floorY - 22, 20, 20);
          ctx.fillRect(chX - 3, floorY - 30, 4, 28);
          ctx.fillRect(chX + 19, floorY - 28, 4, 26);
          // Seat cushion
          ctx.fillStyle = 'rgba(120, 50, 35, 0.3)';
          ctx.fillRect(chX + 2, floorY - 18, 16, 8);

          // Potted plant
          ctx.fillStyle = 'rgba(50, 30, 20, 0.5)';
          ctx.fillRect(b.x + b.w * 0.82, floorY - 10, 12, 10);
          ctx.fillStyle = 'rgba(40, 100, 40, 0.4)';
          ctx.beginPath();
          ctx.arc(b.x + b.w * 0.82 + 6, floorY - 16, 10, 0, Math.PI * 2);
          ctx.fill();

          // Picture frames on wall
          ctx.strokeStyle = 'rgba(80, 55, 35, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x + b.w * 0.48, ceilY + 10, 16, 12);
          ctx.strokeRect(b.x + b.w * 0.56, ceilY + 8, 12, 16);
          // Picture contents
          ctx.fillStyle = 'rgba(100, 80, 60, 0.12)';
          ctx.fillRect(b.x + b.w * 0.48 + 2, ceilY + 12, 12, 8);
          ctx.fillRect(b.x + b.w * 0.56 + 2, ceilY + 10, 8, 12);

          // Coat rack near door
          ctx.fillStyle = 'rgba(50, 30, 20, 0.45)';
          ctx.fillRect(b.x + b.w - 28, floorY - 2, 3, -40);
          ctx.fillRect(b.x + b.w - 34, floorY - 40, 15, 2);
          // Hanging coat
          ctx.fillStyle = 'rgba(60, 40, 70, 0.3)';
          ctx.fillRect(b.x + b.w - 33, floorY - 38, 6, 18);
        }
      }

      // Ground-level band
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#1A1525';
      ctx.fillRect(b.x, 705, b.w, 15);
    }

    // === Wall brackets for ACs and balconies ===
    ctx.globalAlpha = 0.8;
    for (const plat of arena.platforms) {
      const isAC = plat.width <= 55 && plat.height <= 20 && plat.height >= 10;
      const isBal = plat.width >= 60 && plat.width <= 90 && plat.height <= 18;
      if (!isAC && !isBal) continue;

      for (const b of buildings) {
        const pr = plat.x + plat.width;
        const br = b.x + b.w;
        let wallX = -1;
        // Attached to building's left wall (platform is left of building)
        if (pr >= b.x - 5 && pr <= b.x + 20 && plat.x < b.x) wallX = b.x;
        // Attached to building's right wall (platform is right of building)
        if (plat.x >= br - 20 && plat.x <= br + 5 && pr > br) wallX = br;
        if (wallX < 0) continue;

        const beamY = plat.y + plat.height - 2;
        const px = wallX < plat.x ? plat.x : pr;
        const startX = Math.min(px, wallX);
        const beamW = Math.abs(px - wallX);
        // Horizontal bracket beam
        ctx.fillStyle = '#5A5A68';
        ctx.fillRect(startX, beamY, beamW + 2, 4);
        // Wall anchor
        ctx.fillRect(wallX - 2, beamY - 8, 5, 12);
        // Diagonal brace
        ctx.strokeStyle = '#4A4A58';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wallX, beamY - 6);
        ctx.lineTo(px, beamY + 1);
        ctx.stroke();
      }
    }

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    // Tiny decorative chimneys on the middle building's upper roof (B2 at y=370).
    // Purely visual — no collision. Match the iso treatment of real chimneys
    // (right face + top cap parallelogram) so they don't read as 2D stickers.
    const drawTinyChimney = (tcx: number, baseY: number, tcw: number, tch: number) => {
      const tdepth = 5; // mini iso skew
      ctx.save();
      // Right face — sloped parallelogram (front-bottom-right to back-top-right)
      ctx.fillStyle = '#221418';
      ctx.beginPath();
      ctx.moveTo(tcx + tcw, baseY - tch);
      ctx.lineTo(tcx + tcw + tdepth, baseY - tch - tdepth);
      ctx.lineTo(tcx + tcw + tdepth, baseY - tdepth);
      ctx.lineTo(tcx + tcw, baseY);
      ctx.closePath();
      ctx.fill();
      // Body front face — brick column
      ctx.fillStyle = '#3E2A2A';
      ctx.fillRect(tcx, baseY - tch, tcw, tch);
      // Mortar courses
      ctx.fillStyle = 'rgba(20, 12, 14, 0.55)';
      for (let by = baseY - tch + 4; by < baseY; by += 5) {
        ctx.fillRect(tcx, by, tcw, 0.8);
      }
      // Brick edge highlight (front-left)
      ctx.fillStyle = 'rgba(170, 110, 90, 0.25)';
      ctx.fillRect(tcx, baseY - tch, 1, tch);
      // Iso cap parallelogram on top — front-bottom at baseY-tch, back-top
      // shifted right by tdepth and up by tdepth.
      ctx.fillStyle = '#5A4040';
      ctx.beginPath();
      ctx.moveTo(tcx, baseY - tch);
      ctx.lineTo(tcx + tdepth, baseY - tch - tdepth);
      ctx.lineTo(tcx + tcw + tdepth, baseY - tch - tdepth);
      ctx.lineTo(tcx + tcw, baseY - tch);
      ctx.closePath();
      ctx.fill();
      // Cap front lip (slightly darker bottom edge)
      ctx.fillStyle = 'rgba(40, 24, 28, 0.55)';
      ctx.fillRect(tcx, baseY - tch - 0.5, tcw, 1);
      // Dark flue opening — sits inside the cap parallelogram
      ctx.fillStyle = '#0E0810';
      ctx.fillRect(tcx + tcw * 0.25 + tdepth * 0.5, baseY - tch - tdepth * 0.6, tcw * 0.5, 1);
      // Faint smoke wisp from the flue
      ctx.strokeStyle = 'rgba(160, 150, 165, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tcx + tcw / 2 + tdepth * 0.5, baseY - tch - tdepth);
      ctx.quadraticCurveTo(tcx + tcw / 2 + 4, baseY - tch - tdepth - 8, tcx + tcw / 2 + 1, baseY - tch - tdepth - 16);
      ctx.stroke();
      ctx.restore();
    };
    // B2 upper roof platform is index 6 (y=370). Place small stacks across
    // its top in the gaps between/behind the HVAC blocks.
    const b2RoofY = arena.platforms[6].y;
    drawTinyChimney(525, b2RoofY, 7, 14);
    drawTinyChimney(605, b2RoofY, 8, 18);
    drawTinyChimney(720, b2RoofY, 7, 12);
    drawTinyChimney(795, b2RoofY, 6, 10);

    // Vent pipes
    ctx.fillStyle = '#5A5060';
    ctx.fillRect(180, arena.platforms[0].y - 14, 12, 14);
    ctx.fillRect(180, arena.platforms[0].y - 17, 16, 4);
    // B2 upper (P6 = index 6, y=370)
    ctx.fillRect(620, arena.platforms[6].y - 12, 10, 12);
    ctx.fillRect(620, arena.platforms[6].y - 15, 14, 4);
    // B3 upper (P16 = index 16, y=300)
    ctx.fillRect(1140, arena.platforms[16].y - 12, 10, 12);
  },

  drawForegroundNature: (ctx, arena) => {
    ctx.save();
    // Water tank on B1
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#2A2030';
    const wtY = arena.platforms[0].y;
    ctx.fillRect(170, wtY - 8, 4, 28);
    ctx.fillRect(195, wtY - 8, 4, 28);
    ctx.beginPath();
    ctx.moveTo(164, wtY - 8);
    ctx.lineTo(167, wtY - 38);
    ctx.lineTo(202, wtY - 38);
    ctx.lineTo(205, wtY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(173, wtY - 38);
    ctx.lineTo(184, wtY - 48);
    ctx.lineTo(196, wtY - 38);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  buildReactiveDecorations: (arena) => {
    const out: ReactiveInstance[] = [];

    // Clotheslines spanning between buildings — rope sag + clothes flap.
    // Gap 1: B1 right wall (x=350) to B2 left wall (x=510)
    out.push(rooftopsClothesline(350, 480 + 12, 510, 370 + 12));
    // Gap 2: B2 right wall (x=810) to B3 left wall (x=970)
    out.push(rooftopsClothesline(810, 370 + 12, 970, 300 + 12));

    // Antennas on B1 roof (P0). Stomp-shake on rooftop landings.
    const b1RoofY = arena.platforms[0].y;
    out.push(rooftopsAntenna(330, b1RoofY, 45));
    out.push(rooftopsAntenna(345, b1RoofY, 58));

    return out;
  },

  drawPlatform: (ctx: Ctx2D, platform: Platform, _isGround: boolean) => {
    drawRooftopsPlatformBg(ctx, platform);
  },

  drawPlatformOverlay: (ctx: Ctx2D, platform: Platform, _isGround: boolean) => {
    drawRooftopsPlatformFg(ctx, platform);
  },

  drawWeatherParticle: (ctx, w) => {
    if (w.type === 'leaf') {
      // Leaves are rectangles — rotation visible.
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);
      ctx.fillStyle = 'rgba(200, 190, 170, 0.35)';
      ctx.fillRect(-w.size, -w.size * 0.4, w.size * 2, w.size * 0.8);
      ctx.restore();
    } else {
      // Ash is a circle — rotation invisible, so draw at world coords
      // and skip the canvas-state save/translate/rotate/restore.
      ctx.fillStyle = w.color || 'rgba(200, 190, 180, 0.4)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;
    ctx.fillStyle = '#5A5050';
    ctx.fillRect(x + width * 0.05, by - height * 0.12, width * 0.9, height * 0.12);
    const nails = [
      { sx: 0.15, sh: 0.6, tilt: -0.08 }, { sx: 0.3, sh: 0.85, tilt: 0.03 },
      { sx: 0.5, sh: 1.0, tilt: 0 }, { sx: 0.7, sh: 0.8, tilt: -0.05 },
      { sx: 0.85, sh: 0.55, tilt: 0.06 },
    ];
    const maxNh = height * 1.0;
    const rustGrd = ctx.createLinearGradient(0, 0, 0, -maxNh);
    rustGrd.addColorStop(0, '#7A5030');
    rustGrd.addColorStop(1, '#C07040');
    for (const n of nails) {
      const nx = x + width * n.sx;
      const nh = height * n.sh;
      const nw = width * 0.04;
      ctx.save();
      ctx.translate(nx, by - height * 0.12);
      ctx.rotate(n.tilt);
      ctx.fillStyle = rustGrd;
      ctx.beginPath();
      ctx.moveTo(-nw, 0); ctx.lineTo(-nw * 0.3, -nh);
      ctx.lineTo(nw * 0.3, -nh); ctx.lineTo(nw, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.45;
    const squash = 1 + bounceTimer * 0.03;
    ctx.fillStyle = '#6A6A72';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.7, y);
    ctx.lineTo(x - halfW * 0.6, y - size * 0.45 / squash);
    ctx.lineTo(x + halfW * 0.6, y - size * 0.45 / squash);
    ctx.lineTo(x + halfW * 0.7, y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7A7A82';
    ctx.fillRect(x - halfW * 0.65, y - size * 0.48 / squash, halfW * 1.3, 3);
    const lidLift = Math.abs(bounceTimer) * 0.6;
    const lidY = y - size * 0.48 / squash - lidLift;
    ctx.fillStyle = '#7A7A85';
    ctx.beginPath();
    ctx.ellipse(x, lidY, halfW * 0.7, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }),

  drawAnimatedBackground: (ctx, _arena, time, _dayPhase, matchState) => {
    if (getSlowDevice() || !matchState) return;
    ctx.save();
    ctx.fillStyle = '#b4b9c3';
    for (let si = 0; si < CHIMNEYS.length; si++) {
      const c = CHIMNEYS[si];
      for (let i = 0; i < 7; i++) {
        // Slow, subtle smoke. Lower drift speed (0.18 vs 0.35), tighter wobble,
        // smaller particles, lower peak alpha.
        const t = ((time * 0.18 + i * 0.14 + si * 0.13) % 1);
        const px = c.x + fastSin(time * 0.4 + i + si) * (10 + t * 18);
        const py = c.y - 4 - t * 220;
        const sz = 3 + t * 8;
        ctx.globalAlpha = (1 - t) * 0.4;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const h of HALLWAYS) {
      let lit = false;
      for (const p of matchState.players) {
        if (!isLivePlayer(p)) continue;
        const px = p.x + p.width * 0.5;
        const py = p.y + p.height * 0.5;
        if (px >= h.x - 20 && px <= h.x + h.w + 20 && py >= h.y - HALLWAY_ROOM_H && py <= h.y + 30) {
          lit = true;
          break;
        }
      }
      const interiorTop = h.y - HALLWAY_ROOM_H;
      const totalH = HALLWAY_ROOM_H + HALLWAY_FLOOR_BODY_H;
      if (!lit) {
        ctx.fillStyle = 'rgba(8, 10, 18, 0.55)';
        ctx.fillRect(h.x + 4, interiorTop, h.w - 8, totalH);
        continue;
      }
      ctx.fillStyle = getHallwayGlow(ctx, h);
      ctx.fillRect(h.x, interiorTop, h.w, totalH);
      const flicker = 0.92 + fastSin(time * 9) * 0.08;
      const bulbX = h.x + h.w / 2;
      const bulbY = interiorTop + 12;
      ctx.strokeStyle = '#3a3a4a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bulbX, interiorTop);
      ctx.lineTo(bulbX, bulbY - 2);
      ctx.stroke();
      ctx.globalAlpha = flicker;
      ctx.fillStyle = '#ffe696';
      ctx.beginPath();
      ctx.arc(bulbX, bulbY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff5c8';
      ctx.beginPath();
      ctx.arc(bulbX - 0.5, bulbY - 0.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
  },

  scatterFlockConfigs: [
    {
      species: 'bird',
      positions: [
        { x: 180, y: 478 },
        { x: 620, y: 368 },
        { x: 1080, y: 298 },
      ],
      radius: 120,
      respawnTime: 8,
    },
  ],

  musicFile: 'rooftops.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:128},{t:2,y:'j',x:248},{t:3,y:'d',x:318},{t:4,y:'j',x:318},{t:5,y:'d',x:318},{t:6,y:'j',x:318},{t:9,y:'j',x:318},{t:17,y:'j',x:80},{t:19,y:'j',x:80}],
      [{t:0,y:'d',x:130},{t:2,y:'j',x:130},{t:4,y:'j',x:130},{t:16,y:'j',x:130}],
      [{t:0,y:'d',x:250},{t:1,y:'j',x:250},{t:3,y:'d',x:250},{t:4,y:'j',x:250},{t:6,y:'j',x:250}],
      [{t:0,y:'j',x:350},{t:1,y:'j',x:350},{t:2,y:'j',x:350},{t:4,y:'j',x:370},{t:5,y:'d',x:370},{t:6,y:'j',x:370},{t:8,y:'d',x:370},{t:9,y:'j',x:370}],
      [{t:1,y:'j',x:458},{t:3,y:'d',x:458},{t:5,y:'d',x:458},{t:6,y:'j',x:478},{t:7,y:'d',x:478},{t:8,y:'d',x:478},{t:9,y:'j',x:478},{t:10,y:'j',x:478},{t:11,y:'j',x:478},{t:13,y:'j',x:478}],
      [{t:0,y:'j',x:445},{t:2,y:'j',x:445},{t:3,y:'j',x:445},{t:4,y:'j',x:468},{t:7,y:'w',x:478},{t:8,y:'d',x:478},{t:12,y:'j',x:478}],
      [{t:3,y:'d',x:510},{t:4,y:'d',x:510},{t:5,y:'d',x:510},{t:7,y:'d',x:778},{t:8,y:'d',x:778},{t:9,y:'j',x:559},{t:10,y:'j',x:657},{t:11,y:'j',x:763},{t:12,y:'d',x:778},{t:13,y:'d',x:778},{t:14,y:'j',x:778},{t:15,y:'d',x:778},{t:16,y:'j',x:778}],
      [{t:0,y:'j',x:510},{t:2,y:'j',x:510},{t:3,y:'j',x:510},{t:4,y:'j',x:510},{t:5,y:'w',x:660},{t:8,y:'d',x:778},{t:12,y:'w',x:660},{t:13,y:'j',x:778},{t:15,y:'j',x:778},{t:17,y:'j',x:778},{t:18,y:'j',x:778}],
      [{t:0,y:'j',x:510},{t:3,y:'j',x:510},{t:4,y:'j',x:510},{t:5,y:'j',x:510},{t:7,y:'j',x:644},{t:12,y:'j',x:778},{t:13,y:'j',x:778},{t:15,y:'j',x:778},{t:17,y:'j',x:778},{t:18,y:'j',x:778}],
      [{t:3,y:'d',x:555},{t:4,y:'d',x:555},{t:5,y:'d',x:555},{t:6,y:'d',x:563},{t:7,y:'d',x:563},{t:8,y:'d',x:563},{t:10,y:'j',x:563},{t:11,y:'j',x:563}],
      [{t:5,y:'d',x:650},{t:6,y:'d',x:650},{t:7,y:'d',x:650},{t:8,y:'d',x:650},{t:9,y:'j',x:650},{t:11,y:'j',x:663},{t:12,y:'d',x:663},{t:13,y:'d',x:663},{t:16,y:'j',x:663}],
      [{t:6,y:'d',x:760},{t:7,y:'d',x:760},{t:8,y:'d',x:760},{t:9,y:'j',x:760},{t:10,y:'j',x:760},{t:12,y:'d',x:766},{t:13,y:'d',x:766},{t:15,y:'d',x:766},{t:16,y:'j',x:766},{t:18,y:'d',x:766}],
      [{t:5,y:'j',x:810},{t:7,y:'w',x:843},{t:8,y:'d',x:810},{t:13,y:'j',x:820},{t:15,y:'j',x:843},{t:17,y:'j',x:843},{t:18,y:'j',x:843}],
      [{t:4,y:'j',x:810},{t:6,y:'j',x:810},{t:7,y:'d',x:810},{t:8,y:'d',x:810},{t:9,y:'j',x:810},{t:10,y:'j',x:810},{t:11,y:'j',x:810},{t:12,y:'d',x:830},{t:14,y:'j',x:830},{t:15,y:'d',x:830},{t:16,y:'j',x:830},{t:18,y:'d',x:830}],
      [{t:6,y:'j',x:918},{t:7,y:'d',x:918},{t:8,y:'d',x:918},{t:10,y:'j',x:918},{t:11,y:'j',x:918},{t:12,y:'d',x:918},{t:13,y:'d',x:918},{t:15,y:'d',x:918},{t:16,y:'j',x:938},{t:17,y:'d',x:938},{t:18,y:'d',x:938}],
      [{t:6,y:'j',x:905},{t:7,y:'d',x:905},{t:8,y:'d',x:905},{t:11,y:'j',x:905},{t:12,y:'d',x:905},{t:13,y:'j',x:905},{t:14,y:'j',x:928},{t:17,y:'w',x:938},{t:18,y:'d',x:938},{t:19,y:'j',x:938}],
      [{t:0,y:'d',x:1168},{t:7,y:'d',x:970},{t:8,y:'d',x:970},{t:12,y:'d',x:970},{t:13,y:'d',x:970},{t:14,y:'d',x:970},{t:15,y:'d',x:970},{t:17,y:'d',x:1168},{t:18,y:'d',x:1168},{t:19,y:'d',x:1168}],
      [{t:0,y:'j',x:1168},{t:1,y:'j',x:1168},{t:6,y:'j',x:970},{t:11,y:'j',x:970},{t:12,y:'d',x:970},{t:13,y:'j',x:970},{t:14,y:'j',x:970},{t:15,y:'w',x:1085},{t:18,y:'d',x:1168},{t:19,y:'w',x:1085}],
      [{t:0,y:'j',x:1168},{t:1,y:'j',x:1168},{t:6,y:'j',x:970},{t:13,y:'j',x:970},{t:14,y:'j',x:970},{t:15,y:'j',x:970},{t:17,y:'j',x:1069},{t:19,y:'j',x:1168}],
      [{t:0,y:'j',x:1233},{t:1,y:'j',x:1233},{t:2,y:'j',x:1233},{t:14,y:'j',x:1200},{t:15,y:'j',x:1200},{t:17,y:'w',x:1233},{t:18,y:'d',x:1200}],
    ],
    nextHop: [[-1,1,2,3,4,5,6,5,3,9,4,4,5,6,6,17,1,17,17,19],[0,-1,2,0,4,0,0,4,4,0,4,4,16,16,16,16,16,0,16,0],[0,1,-1,3,4,0,6,4,3,0,4,4,6,6,6,6,1,0,3,0],[0,1,2,-1,4,5,6,5,8,9,4,4,5,6,6,6,1,8,8,0],[1,1,3,3,-1,5,6,7,8,9,10,11,7,13,6,6,1,7,7,7],[0,0,2,3,4,-1,0,7,8,0,4,4,7,7,7,7,7,7,7,7],[3,3,3,3,4,5,-1,7,8,9,10,11,12,13,14,15,16,15,13,15],[0,0,2,3,4,5,0,-1,8,0,4,4,12,13,13,15,13,17,18,17],[0,0,0,3,4,5,0,7,-1,0,4,4,12,13,13,15,13,17,18,17],[3,3,3,3,4,5,6,7,8,-1,10,11,7,6,6,6,6,7,7,7],[5,6,5,6,6,5,6,7,8,9,-1,11,12,13,6,6,16,7,13,16],[7,18,7,6,6,7,6,7,8,9,10,-1,12,13,6,15,16,15,18,15],[7,17,7,7,7,7,13,7,8,13,13,13,-1,13,13,15,13,17,18,17],[7,18,7,4,4,7,6,7,8,9,10,11,12,-1,14,15,16,15,18,15],[7,17,7,6,6,7,6,7,8,13,10,11,12,13,-1,15,16,17,18,17],[17,17,7,6,6,7,6,7,8,6,6,11,12,13,14,-1,6,17,18,17],[0,0,0,0,0,7,0,7,8,0,13,13,12,13,14,15,-1,17,18,19],[0,1,19,0,6,12,6,12,15,0,6,11,12,13,14,15,1,-1,18,19],[0,1,0,0,6,0,6,6,6,0,6,6,6,13,14,15,1,17,-1,19],[0,1,2,0,0,0,17,17,17,0,14,17,17,17,14,17,1,17,18,-1]],
    safeHop: [[-1,1,2,3,4,5,6,5,3,9,4,4,5,6,6,17,1,17,17,19],[0,-1,2,0,4,0,0,4,4,0,4,4,16,16,16,16,16,0,16,0],[0,1,-1,3,4,0,6,4,3,0,4,4,6,6,6,6,1,0,3,0],[0,1,2,-1,4,5,6,5,8,9,4,4,5,6,6,6,1,8,8,0],[1,1,3,3,-1,5,6,7,8,9,10,11,7,13,6,6,1,7,7,7],[0,0,2,3,4,-1,0,7,8,0,4,4,7,7,7,7,7,7,7,7],[3,3,3,3,4,5,-1,7,8,9,10,11,12,13,14,15,16,15,13,15],[0,0,2,3,4,5,0,-1,8,0,4,4,12,13,13,15,13,17,18,17],[0,0,0,3,4,5,0,7,-1,0,4,4,12,13,13,15,13,17,18,17],[3,3,3,3,4,5,6,7,8,-1,10,11,7,6,6,6,6,7,7,7],[5,6,5,6,6,5,6,7,8,9,-1,11,12,13,6,6,16,7,13,16],[7,18,7,6,6,7,6,7,8,9,10,-1,12,13,6,15,16,15,18,15],[7,17,7,7,7,7,13,7,8,13,13,13,-1,13,13,15,13,17,18,17],[7,18,7,4,4,7,6,7,8,9,10,11,12,-1,14,15,16,15,18,15],[7,17,7,6,6,7,6,7,8,13,10,11,12,13,-1,15,16,17,18,17],[17,17,7,6,6,7,6,7,8,6,6,11,12,13,14,-1,6,17,18,17],[0,0,0,0,0,7,0,7,8,0,13,13,12,13,14,15,-1,17,18,19],[0,1,19,0,6,12,6,12,15,0,6,11,12,13,14,15,1,-1,18,19],[0,1,0,0,6,0,6,6,6,0,6,6,6,13,14,15,1,17,-1,19],[0,1,2,0,0,0,17,17,17,0,14,17,17,17,14,17,1,17,18,-1]],
  },
  // NAV-DATA-END
};
