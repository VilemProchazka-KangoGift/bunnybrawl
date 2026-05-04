import type { Arena, Platform, SurfaceTag } from '../types';

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
 * Find the platform a player is standing on (or last touched on the way down)
 * and return its surface tag. Picks the topmost platform whose horizontal
 * range contains `x` and whose top edge is within `tolerance` px of `y`.
 */
export function surfaceAt(arena: Arena, x: number, y: number, tolerance = 4): SurfaceTag {
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
  return surfaceOf(best, arena);
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
