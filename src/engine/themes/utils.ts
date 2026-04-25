import type { Platform } from '../types';

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
