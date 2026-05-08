import type { Arena, Ctx2D, Platform, Player, SurfaceTag } from '../types';
import { fastSin } from '../fastMath';
import { CANVAS_WIDTH } from '../constants';

// Cached floating platform lists to avoid per-frame .filter() in theme draw functions.
// WeakMap keyed by the arena's platforms array — auto-invalidates when arena changes.
const _floatsCache = new WeakMap<Platform[], Platform[]>();

/**
 * Resolve the surface tag for a platform: per-platform `surface` field
 * takes precedence, then arena's `defaultSurface`, then `'grass'`.
 */
export function surfaceOf(platform: Platform | undefined, arena?: { defaultSurface?: SurfaceTag }): SurfaceTag {
  return platform?.surface ?? arena?.defaultSurface ?? 'grass';
}

/**
 * Find the topmost platform whose horizontal range contains `x` and whose
 * top edge is within `tolerance` px of `y`. Returns undefined if none.
 */
export function platformAt(arena: Arena, x: number, y: number, tolerance = 4): Platform | undefined {
  const plats = arena.platforms;
  let best: Platform | undefined;
  let bestDy = Infinity;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (x < p.x || x > p.x + p.width) continue;
    const dy = y - p.y;
    if (dy < -tolerance || dy > p.height + tolerance) continue;
    const adjDy = Math.abs(dy);
    if (adjDy < bestDy) { bestDy = adjDy; best = p; }
  }
  return best;
}

/**
 * Find the platform a player AABB is standing on. Unlike `platformAt`,
 * this matches platforms whose horizontal range OVERLAPS the player's
 * foot extent — handles the case where the player is half-off an edge
 * (player center past `plat.x + plat.width`, but the bbox still overlaps).
 * Picks the platform with the largest horizontal overlap.
 */
export function platformUnderFoot(
  arena: Arena, footX: number, footRight: number, footY: number, tolerance = 4,
): Platform | undefined {
  const plats = arena.platforms;
  let best: Platform | undefined;
  let bestOverlap = 0;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    const ox0 = Math.max(footX, p.x);
    const ox1 = Math.min(footRight, p.x + p.width);
    const overlap = ox1 - ox0;
    if (overlap <= 0) continue;
    const dy = footY - p.y;
    if (dy < -tolerance || dy > p.height + tolerance) continue;
    if (overlap > bestOverlap) { bestOverlap = overlap; best = p; }
  }
  return best;
}

/**
 * Find the platform a player is standing on (or last touched on the way down)
 * and return its surface tag.
 */
export function surfaceAt(arena: Arena, x: number, y: number, tolerance = 4): SurfaceTag {
  return surfaceOf(platformAt(arena, x, y, tolerance), arena);
}

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

/** Clamp `v` to `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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

/**
 * Bake a vertical CanvasGradient into a 1-pixel-wide OffscreenCanvas. Use with
 * `drawImage(cache, x, y, w, h)` + `imageSmoothingEnabled = false` instead of
 * a full-area `fillRect` with `fillStyle = gradient` — the latter does a
 * per-pixel gradient evaluation, the former is a memcpy + alpha blend.
 *
 * Saves ~5ms/frame on a full-canvas (1280×720) overlay. See
 * docs/perf-patterns.md.
 *
 * The `build` callback receives a context to call `addColorStop` on; the
 * gradient itself spans 0..height. Returns null if OffscreenCanvas is
 * unavailable (test envs).
 */
export function bakeVerticalGradientStrip(
  height: number,
  build: (g: CanvasGradient) => void,
): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const c = new OffscreenCanvas(1, height);
  const cctx = c.getContext('2d');
  if (!cctx) return null;
  const g = cctx.createLinearGradient(0, 0, 0, height);
  build(g);
  cctx.fillStyle = g;
  cctx.fillRect(0, 0, 1, height);
  return c;
}

/**
 * Bake a centered radial CanvasGradient into a square OffscreenCanvas. Use
 * with `drawImage(cache, x, y, size, size)` + `imageSmoothingEnabled = false`
 * instead of `fillRect`/`fill()` with `fillStyle = gradient` — same per-pixel
 * eval avoidance as `bakeVerticalGradientStrip`. Best for radial glows/halos
 * where the gradient covers a fixed-size circle (player burn fire, ghost glow).
 *
 * The `build` callback receives a gradient that spans `(size/2, size/2, 0)` to
 * `(size/2, size/2, size/2)` — a circle inscribed in the square. Pixels outside
 * the inscribed circle are extrapolated from the last color stop, so end with
 * a fully-transparent stop unless you want the corners to bleed.
 */
export function bakeRadialGradientSquare(
  size: number,
  build: (g: CanvasGradient) => void,
): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const c = new OffscreenCanvas(size, size);
  const cctx = c.getContext('2d');
  if (!cctx) return null;
  const half = size / 2;
  const g = cctx.createRadialGradient(half, half, 0, half, half, half);
  build(g);
  cctx.fillStyle = g;
  cctx.fillRect(0, 0, size, size);
  return c;
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
  ctx: Ctx2D,
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
    for (let x = -20; x <= CANVAS_WIDTH + 20; x += 22) {
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
  // Once cornered and flipped to "run past", commit to that direction until the
  // critter clears the opposite edge — prevents oscillation as the player
  // tracks them across the corner threshold.
  committedFleeDir: 0 | 1 | -1;
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
  // Track threats on each side independently — a player within fleeRadius on
  // BOTH sides is a sandwich, where flee-from-nearest oscillates as the
  // critter shifts between them.
  let leftThreat = false;
  let rightThreat = false;
  for (const p of players) {
    if (!isLivePlayer(p)) continue;
    const pcx = p.x + p.width * 0.5;
    const pcy = p.y + p.height;
    if (Math.abs(pcy - cfg.platTopY) > yTol) continue;
    const dx = pcx - state.x;
    const adx = Math.abs(dx);
    if (adx < cfg.fleeRadius) {
      if (dx < 0) leftThreat = true;
      else rightThreat = true;
    }
    if (adx < nearestPx) { nearestPx = adx; nearestDx = dx; }
  }
  state.fleeing = nearestPx < cfg.fleeRadius;
  const sandwiched = leftThreat && rightThreat;
  let targetDir: 1 | -1 = state.dir;
  if (sandwiched) {
    // Freeze in place: nowhere safe to run. Keep last direction so facingEase
    // doesn't slam to 0 and snap-flip; the speed multiplier below handles stop.
    state.committedFleeDir = 0;
  } else if (state.fleeing) {
    const want: 1 | -1 = nearestDx > 0 ? -1 : 1;
    // Honor a prior "run past" commitment until we reach the opposite edge.
    if (state.committedFleeDir !== 0) {
      targetDir = state.committedFleeDir;
      const reachedFar =
        (state.committedFleeDir === 1 && state.x >= cfg.platR - 5) ||
        (state.committedFleeDir === -1 && state.x <= cfg.platL + 5);
      if (reachedFar) state.committedFleeDir = 0;
    } else if (state.x <= cfg.platL + cornerMargin && want === -1) {
      state.committedFleeDir = 1;
      targetDir = 1;
    } else if (state.x >= cfg.platR - cornerMargin && want === 1) {
      state.committedFleeDir = -1;
      targetDir = -1;
    } else {
      targetDir = want;
    }
  } else {
    state.committedFleeDir = 0;
    if (state.x <= cfg.platL) targetDir = 1;
    else if (state.x >= cfg.platR) targetDir = -1;
  }
  state.dir = targetDir;
  const blend = Math.min(1, turnEase * dt);
  state.facingEase += (targetDir - state.facingEase) * blend;
  const speed = sandwiched ? 0 : (state.fleeing ? cfg.fleeSpeed : cfg.walkSpeed);
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
