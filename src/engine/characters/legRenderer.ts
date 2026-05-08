import type { Ctx2D } from '../types';
import type { CharacterColors, LegStyle } from './types';

// ---- Defaults ----

const DEF_LEG_WIDTH = 6;
const DEF_LEG_HEIGHT = 4;
const DEF_FOOT_HEIGHT = 2;

// ---- Helpers ----

function drawRoundRect(
  ctx: Ctx2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// ---- Foot renderers ----

function drawFootPaw(
  ctx: Ctx2D,
  fx: number, fy: number, fw: number, fh: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(fx + fw / 2, fy + fh * 0.4, fw / 2, fh * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFootHoof(
  ctx: Ctx2D,
  fx: number, fy: number, fw: number, fh: number, color: string,
): void {
  ctx.fillStyle = color;
  drawRoundRect(ctx, fx, fy, fw, fh, 1);
}

function drawFootWebbed(
  ctx: Ctx2D,
  fx: number, fy: number, fw: number, fh: number, color: string,
): void {
  ctx.fillStyle = color;
  const cx = fx + fw / 2;
  // Three-pronged fan
  ctx.beginPath();
  ctx.moveTo(cx, fy);
  ctx.lineTo(cx - fw * 0.5, fy + fh);
  ctx.lineTo(cx - fw * 0.15, fy + fh * 0.6);
  ctx.lineTo(cx, fy + fh);
  ctx.lineTo(cx + fw * 0.15, fy + fh * 0.6);
  ctx.lineTo(cx + fw * 0.5, fy + fh);
  ctx.closePath();
  ctx.fill();
}

function drawFootClaw(
  ctx: Ctx2D,
  fx: number, fy: number, fw: number, fh: number, color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const cx = fx + fw / 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * (fw * 0.2), fy);
    ctx.lineTo(cx + i * (fw * 0.45), fy + fh);
    ctx.stroke();
  }
}

function drawFootRound(
  ctx: Ctx2D,
  fx: number, fy: number, fw: number, fh: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(fx + fw / 2, fy + fh * 0.3, fw / 2, fh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

type FootDrawer = (ctx: Ctx2D, fx: number, fy: number, fw: number, fh: number, color: string) => void;

const FOOT_DRAWERS: Record<Exclude<LegStyle['footStyle'], 'none'>, FootDrawer> = {
  paw: drawFootPaw,
  hoof: drawFootHoof,
  webbed: drawFootWebbed,
  claw: drawFootClaw,
  round: drawFootRound,
};

// ---- Leg shape renderers ----

function drawLegRounded(
  ctx: Ctx2D,
  lx: number, ly: number, lw: number, lh: number, kneeOff: number,
): void {
  if (lh <= 5) {
    // Nub: simple ellipse for Rayman-style short legs
    ctx.beginPath();
    ctx.ellipse(lx + lw / 2, ly + lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (Math.abs(kneeOff) < 0.5) {
    // Straight — simple rounded rect
    drawRoundRect(ctx, lx, ly, lw, lh, 2);
  } else {
    // Bent — quadratic curve through knee
    ctx.beginPath();
    const mx = lx + lw / 2 + kneeOff;
    const my = ly + lh * 0.5;
    // Left edge
    ctx.moveTo(lx + 1, ly);
    ctx.quadraticCurveTo(mx - lw / 2, my, lx, ly + lh);
    // Bottom
    ctx.lineTo(lx + lw, ly + lh);
    // Right edge
    ctx.quadraticCurveTo(mx + lw / 2, my, lx + lw - 1, ly);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLegTapered(
  ctx: Ctx2D,
  lx: number, ly: number, lw: number, lh: number, kneeOff: number,
): void {
  if (lh <= 5) {
    ctx.beginPath();
    ctx.ellipse(lx + lw / 2, ly + lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const narrowW = lw * 0.65;
  const topCx = lx + lw / 2;
  const botCx = topCx + kneeOff * 0.3;
  ctx.beginPath();
  ctx.moveTo(topCx - lw / 2, ly);
  ctx.quadraticCurveTo(topCx - lw / 2 + kneeOff, ly + lh * 0.5, botCx - narrowW / 2, ly + lh);
  ctx.lineTo(botCx + narrowW / 2, ly + lh);
  ctx.quadraticCurveTo(topCx + lw / 2 + kneeOff, ly + lh * 0.5, topCx + lw / 2, ly);
  ctx.closePath();
  ctx.fill();
}

function drawLegStick(
  ctx: Ctx2D,
  lx: number, ly: number, lw: number, lh: number, kneeOff: number,
): void {
  const cx = lx + lw / 2;
  ctx.save();
  ctx.lineWidth = Math.max(lw * 0.5, 2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.beginPath();
  ctx.moveTo(cx, ly);
  if (Math.abs(kneeOff) > 0.5) {
    ctx.quadraticCurveTo(cx + kneeOff, ly + lh * 0.5, cx, ly + lh);
  } else {
    ctx.lineTo(cx, ly + lh);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLegWide(
  ctx: Ctx2D,
  lx: number, ly: number, lw: number, lh: number, kneeOff: number,
): void {
  if (lh <= 5) {
    ctx.beginPath();
    ctx.ellipse(lx + lw / 2, ly + lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Same as rounded but with less border radius for a chunkier look
  if (Math.abs(kneeOff) < 0.5) {
    drawRoundRect(ctx, lx, ly, lw, lh, 1.5);
  } else {
    drawLegRounded(ctx, lx, ly, lw, lh, kneeOff);
  }
}

type LegDrawer = (ctx: Ctx2D, lx: number, ly: number, lw: number, lh: number, kneeOff: number) => void;

const LEG_DRAWERS: Record<LegStyle['shape'], LegDrawer> = {
  rounded: drawLegRounded,
  tapered: drawLegTapered,
  stick: drawLegStick,
  wide: drawLegWide,
};

// ---- Main drawLegs function ----

/**
 * Draws character legs with shape, feet, walk animation, knee articulation,
 * landing squash, and idle weight-shifting.
 *
 * Called inside the sprite cache render (on cache miss only).
 * Must be a pure function of its inputs.
 */
export function drawLegs(
  ctx: Ctx2D,
  cx: number,
  yOff: number,
  h: number,
  state: string,
  animFrame: number,
  squashScale: number,
  colors: CharacterColors,
  style?: LegStyle,
): void {
  const shape = style?.shape ?? 'rounded';
  const footStyle = style?.footStyle ?? 'round';
  const baseLegW = style?.legWidth ?? DEF_LEG_WIDTH;
  const baseLegH = style?.legHeight ?? DEF_LEG_HEIGHT;
  const footH = style?.footHeight ?? DEF_FOOT_HEIGHT;
  const baseSpread = style?.spreadAngle ?? 0;

  const isAirborne = state === 'airborne';
  const isRunning = state === 'run';
  const isIdle = state === 'idle';

  // --- Squash adjustments ---
  const squashFactor = squashScale < 0.9 ? (1 - squashScale) : 0;
  const legW = baseLegW + squashFactor * 2;
  const legH = baseLegH - squashFactor * 1.5;

  // --- Walk animation ---
  const animSin = Math.sin(animFrame * Math.PI);
  const animCos = Math.cos(animFrame * Math.PI);
  const vertAnim = isRunning ? animSin * 1.5 : 0;
  const horizAnim = isRunning ? animCos * 1 : 0;

  // --- Idle weight shift ---
  const idleShift = isIdle ? Math.sin(animFrame * Math.PI * 0.5) * 0.5 : 0;

  // --- Airborne spread ---
  const airSpread = isAirborne ? 1.5 : 0;
  const airExtend = isAirborne ? 1 : 0;

  // --- Knee bend offset ---
  let baseKneeOff: number;
  if (squashFactor > 0) {
    // Landing/crouch: knees splay outward
    baseKneeOff = squashFactor * 3;
  } else if (isAirborne) {
    // Airborne: knees tuck slightly inward
    baseKneeOff = -0.5;
  } else if (isRunning) {
    // Running: knee swings with step
    baseKneeOff = animCos * 0.7;
  } else {
    // Idle: very subtle outward
    baseKneeOff = 0.5;
  }

  // --- Foot color ---
  const footColor = style?.footColor ?? colors.lightColor;
  const baseFW = style?.footWidth ?? (footStyle === 'hoof' ? baseLegW : baseLegW + 2);
  const footW = baseFW + squashFactor * 1;

  const legDrawer = LEG_DRAWERS[shape] ?? drawLegRounded;
  const footDrawer = footStyle !== 'none' ? FOOT_DRAWERS[footStyle] : null;

  // --- Draw each leg (left = -1, right = +1) ---
  for (let side = -1; side <= 1; side += 2) {
    // Hip position — widen gap for thick legs so they don't blend together
    const halfGap = Math.max(4, legW / 2 + 2);
    const hipX = cx + side * halfGap - legW / 2
      + side * (baseSpread + airSpread)
      + side * horizAnim;

    const hipY = yOff + h * 0.82
      - side * vertAnim
      + side * idleShift;

    const effLegH = legH + airExtend;

    const kneeOff = baseKneeOff * side;

    // Draw the leg
    ctx.fillStyle = colors.darkColor;
    legDrawer(ctx, hipX, hipY, legW, effLegH, kneeOff);

    // Draw the foot
    if (footDrawer) {
      const footX = hipX + legW / 2 - footW / 2 + kneeOff * 0.3;
      const footY = hipY + effLegH - 1;
      footDrawer(ctx, footX, footY, footW, footH, footColor);
    }
  }
}
