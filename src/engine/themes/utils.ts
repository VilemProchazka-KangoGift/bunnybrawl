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

/**
 * Subtle drifting low-band atmosphere — two layered wavy ribbons that slowly
 * drift sideways and undulate. Suitable for graveyard fog, waterfall mist,
 * volcano heat shimmer. Renders three thin layers with low alpha so the scene
 * still reads through.
 */
export interface DriftBandConfig {
  /** Top y of the band (where the wavy upper edge oscillates around). */
  topY: number;
  /** Bottom y where the band runs out — usually the ground. */
  bottomY: number;
  /** Hex/rgba color per layer. Three colors blend front-to-back. */
  colors: readonly [string, string, string];
  /** Per-layer alpha (back, mid, front). Keep ≤ ~0.25 for "subtle". */
  alphas: readonly [number, number, number];
  /** Per-layer horizontal drift speed in px/s. */
  drifts?: readonly [number, number, number];
  /** Per-layer wave amplitude (px). */
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
    ctx.fillStyle = cfg.colors[li];
    ctx.globalAlpha = cfg.alphas[li];
    ctx.beginPath();
    ctx.moveTo(-20, cfg.bottomY);
    for (let x = -20; x <= CANVAS_WIDTH + 20; x += 14) {
      const s1 = fastSin((x + tx) * 0.012 + li * 1.3);
      const s2 = fastSin((x + tx) * 0.028 + li * 2.1);
      const wave = s1 * amps[li] + s2 * amps[li] * 0.35;
      ctx.lineTo(x, layerTop + wave);
    }
    ctx.lineTo(CANVAS_WIDTH + 20, cfg.bottomY);
    ctx.closePath();
    ctx.fill();
  }
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
