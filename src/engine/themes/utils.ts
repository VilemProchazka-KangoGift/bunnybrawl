import type { Platform, Player } from '../types';
import { fastSin } from '../fastMath';
import { CANVAS_WIDTH } from '../constants';

// Cached floating platform lists to avoid per-frame .filter() in theme draw functions.
// WeakMap keyed by the arena's platforms array — auto-invalidates when arena changes.
const _floatsCache = new WeakMap<Platform[], Platform[]>();

/** Get platforms with y < 650 and width >= 80 (floating platforms suitable for decorations). Cached. */
export function getFloatingPlatforms(platforms: Platform[]): Platform[] {
  let cached = _floatsCache.get(platforms);
  if (!cached) {
    cached = platforms.filter(p => p.y < 650 && p.width >= 80);
    _floatsCache.set(platforms, cached);
  }
  return cached;
}

/** Remove element at index i by swapping with last element and popping. O(1) but unstable order. */
export function swapRemove<T>(arr: T[], i: number): void {
  arr[i] = arr[arr.length - 1];
  arr.pop();
}

/** Random number in [min, max] from a tuple range. */
export function randRange(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

/** Pick a random item using weighted selection. Items must have a `weight` field. */
export function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/** Fisher-Yates shuffle in place. Always consumes `arr.length - 1` calls to `rnd` for net determinism. */
export function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function isLivePlayer(p: Player): boolean {
  return p.active && p.state !== 'splat' && p.state !== 'respawning';
}

export interface DriftBandConfig {
  topY: number;
  bottomY: number;
  colors: readonly [string, string, string];
  alphas: readonly [number, number, number];
  drifts?: readonly [number, number, number];
  amps?: readonly [number, number, number];
}

export function drawDriftBand(
  ctx: CanvasRenderingContext2D,
  time: number,
  cfg: DriftBandConfig,
): void {
  const drifts = cfg.drifts ?? [4, 7, 11];
  const amps = cfg.amps ?? [10, 14, 18];
  ctx.save();
  for (let li = 0; li < 3; li++) {
    const layerTop = cfg.topY + li * 6;
    const tx = time * drifts[li];
    const amp = amps[li];
    const ampSecondary = amp * 0.35;
    const phase1 = li * 1.3;
    const phase2 = li * 2.1;
    ctx.fillStyle = cfg.colors[li];
    ctx.globalAlpha = cfg.alphas[li];
    ctx.beginPath();
    ctx.moveTo(-20, cfg.bottomY);
    for (let x = -20; x <= CANVAS_WIDTH + 20; x += 14) {
      const s1 = fastSin((x + tx) * 0.012 + phase1);
      const s2 = fastSin((x + tx) * 0.028 + phase2);
      ctx.lineTo(x, layerTop + s1 * amp + s2 * ampSecondary);
    }
    ctx.lineTo(CANVAS_WIDTH + 20, cfg.bottomY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export interface GroundCritterConfig {
  platL: number;
  platR: number;
  platTopY: number;
  yTolerance?: number;
  walkSpeed: number;
  fleeSpeed: number;
  fleeRadius: number;
  cornerMargin?: number;
  turnEaseRate?: number;
}

export interface GroundCritterState {
  x: number;
  dir: 1 | -1;
  facingEase: number;
  fleeing: boolean;
}

/**
 * Update an ambient ground critter: paces between [platL, platR], flees when a
 * live player gets within fleeRadius (and is on roughly the same y level), runs
 * past the player rather than getting trapped at an edge. facingEase lerps so
 * direction changes have a brief slowdown-and-turn rather than instant reverse.
 */
export function tickGroundCritter(
  state: GroundCritterState,
  players: ReadonlyArray<Player>,
  dt: number,
  cfg: GroundCritterConfig,
): void {
  const yTol = cfg.yTolerance ?? 60;
  const cornerMargin = cfg.cornerMargin ?? 25;
  const turnEase = cfg.turnEaseRate ?? 4;
  let nearestPx = Infinity;
  let nearestDx = 0;
  for (const p of players) {
    if (!isLivePlayer(p)) continue;
    const pcx = p.x + p.width * 0.5;
    const pcy = p.y + p.height;
    if (Math.abs(pcy - cfg.platTopY) > yTol) continue;
    const dx = pcx - state.x;
    const adx = Math.abs(dx);
    if (adx < nearestPx) { nearestPx = adx; nearestDx = dx; }
  }
  state.fleeing = nearestPx < cfg.fleeRadius;
  let targetDir: 1 | -1 = state.dir;
  if (state.fleeing) {
    targetDir = nearestDx > 0 ? -1 : 1;
    // If cornered against the wall behind us, run past the player instead.
    if (state.x <= cfg.platL + cornerMargin && targetDir === -1) targetDir = 1;
    if (state.x >= cfg.platR - cornerMargin && targetDir === 1) targetDir = -1;
  } else {
    if (state.x <= cfg.platL) targetDir = 1;
    else if (state.x >= cfg.platR) targetDir = -1;
  }
  state.dir = targetDir;
  const blend = Math.min(1, turnEase * dt);
  state.facingEase += (targetDir - state.facingEase) * blend;
  const speed = state.fleeing ? cfg.fleeSpeed : cfg.walkSpeed;
  state.x += state.facingEase * speed * dt;
  if (state.x < cfg.platL) state.x = cfg.platL;
  else if (state.x > cfg.platR) state.x = cfg.platR;
}

export function makeDtTracker(maxDt = 0.1): (time: number) => number {
  let last = 0;
  return (time: number) => {
    const dt = Math.max(0, Math.min(maxDt, time - last));
    last = time;
    return dt;
  };
}

/**
 * Pure rat sprite — caller owns position + facing. Drawn at (x, y) with the
 * given horizontal facing (1 = right, -1 = left). `motion` ∈ [0,1] scales the
 * scurry/leg animation amplitude (use facingEase magnitude or fleeing flag).
 */
export function drawRat(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  facing: 1 | -1,
  time: number,
  motion: number,
  fleeing: boolean,
): void {
  const scurry = fastSin(time * (fleeing ? 22 : 10)) * motion;
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.bezierCurveTo(-12, -2 + scurry, -16, 1, -18, -1 + scurry * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#5a4a3a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(11, -1);
  ctx.lineTo(11, 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -0.5, 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5a4a';
  ctx.beginPath();
  ctx.arc(5, -3, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(8, -1, 0.8, 0.8);
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const lx = -4 + i * 2.5;
    const lift = fastSin(time * 22 + i * 1.5) * motion * 0.8;
    ctx.moveTo(lx, 2);
    ctx.lineTo(lx, 4 - Math.max(0, lift));
  }
  ctx.stroke();
  ctx.restore();
}

const _pushOut = { x: 0, y: 0 };
/** Push (x, y) outward from any live player within `radius`. Lift adds extra upward push.
 *  Mutates and returns a shared scratch object — do not retain. */
export function pushFromPlayers(
  players: ReadonlyArray<Player>,
  x: number, y: number,
  radius: number, push: number, lift = 0,
): { x: number; y: number } {
  _pushOut.x = x;
  _pushOut.y = y;
  const r2 = radius * radius;
  for (const p of players) {
    if (!isLivePlayer(p)) continue;
    const dx = _pushOut.x - (p.x + p.width * 0.5);
    const dy = _pushOut.y - (p.y + p.height * 0.4);
    const d2 = dx * dx + dy * dy;
    if (d2 < r2) {
      const d = Math.sqrt(d2) + 0.001;
      const f = (radius - d) / radius;
      _pushOut.x += (dx / d) * f * push;
      _pushOut.y += (dy / d) * f * push - f * lift;
    }
  }
  return _pushOut;
}
