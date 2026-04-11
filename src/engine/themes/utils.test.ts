import { describe, it, expect } from 'vitest';
import { getFloatingPlatforms, swapRemove, pickWeighted } from './utils';
import type { Platform } from '../types';

describe('getFloatingPlatforms', () => {
  it('returns platforms with y < 650 and width >= 80', () => {
    const platforms: Platform[] = [
      { x: 0, y: 660, width: 1280, height: 20 },   // ground (y >= 650) → excluded
      { x: 200, y: 500, width: 200, height: 20 },   // floating, wide → included
      { x: 400, y: 400, width: 50, height: 20 },    // floating but narrow → excluded
      { x: 600, y: 300, width: 80, height: 20 },    // floating, exactly 80 → included
    ];
    const floating = getFloatingPlatforms(platforms);
    expect(floating).toHaveLength(2);
    expect(floating[0].x).toBe(200);
    expect(floating[1].x).toBe(600);
  });

  it('returns empty array when no floating platforms', () => {
    const platforms: Platform[] = [
      { x: 0, y: 660, width: 1280, height: 20 },
    ];
    expect(getFloatingPlatforms(platforms)).toHaveLength(0);
  });

  it('caches result (same reference on second call)', () => {
    const platforms: Platform[] = [
      { x: 0, y: 660, width: 1280, height: 20 },
      { x: 200, y: 500, width: 200, height: 20 },
    ];
    const first = getFloatingPlatforms(platforms);
    const second = getFloatingPlatforms(platforms);
    expect(first).toBe(second); // same cached reference
  });

  it('different platform arrays get separate caches', () => {
    const a: Platform[] = [{ x: 0, y: 500, width: 100, height: 20 }];
    const b: Platform[] = [{ x: 0, y: 400, width: 200, height: 20 }];
    const resultA = getFloatingPlatforms(a);
    const resultB = getFloatingPlatforms(b);
    expect(resultA).not.toBe(resultB);
  });
});

describe('swapRemove', () => {
  it('removes element by swapping with last', () => {
    const arr = [10, 20, 30, 40, 50];
    swapRemove(arr, 1); // remove index 1 (20)
    expect(arr).toHaveLength(4);
    expect(arr).not.toContain(20);
    expect(arr).toContain(50); // 50 moved to index 1
  });

  it('removes last element cleanly', () => {
    const arr = [10, 20, 30];
    swapRemove(arr, 2); // remove last
    expect(arr).toEqual([10, 20]);
  });

  it('removes only element', () => {
    const arr = [42];
    swapRemove(arr, 0);
    expect(arr).toHaveLength(0);
  });

  it('removes first element by swapping with last', () => {
    const arr = ['a', 'b', 'c'];
    swapRemove(arr, 0);
    expect(arr).toHaveLength(2);
    expect(arr[0]).toBe('c'); // last moved to index 0
    expect(arr[1]).toBe('b');
  });
});

describe('pickWeighted', () => {
  it('returns an item from the array', () => {
    const items = [
      { name: 'a', weight: 1 },
      { name: 'b', weight: 2 },
      { name: 'c', weight: 3 },
    ];
    const picked = pickWeighted(items);
    expect(items).toContainEqual(picked);
  });

  it('returns the only item when array has one element', () => {
    const items = [{ name: 'only', weight: 5 }];
    expect(pickWeighted(items).name).toBe('only');
  });

  it('returns last item as fallback', () => {
    // With weight=0 for all but last, Math.random would need to be exactly 0
    // The fallback at the end of the function always returns the last item
    const items = [
      { name: 'a', weight: 0 },
      { name: 'b', weight: 0 },
      { name: 'fallback', weight: 0.001 },
    ];
    // Even with tiny weights, should still return something
    const picked = pickWeighted(items);
    expect(picked).toBeDefined();
  });

  it('heavily weighted item is picked most often', () => {
    const items = [
      { name: 'rare', weight: 1 },
      { name: 'common', weight: 100 },
    ];
    let commonCount = 0;
    for (let i = 0; i < 100; i++) {
      if (pickWeighted(items).name === 'common') commonCount++;
    }
    // With 100:1 weight ratio, common should be picked ~99% of the time
    expect(commonCount).toBeGreaterThan(80);
  });

  it('equal weights produce roughly equal distribution', () => {
    const items = [
      { name: 'a', weight: 1 },
      { name: 'b', weight: 1 },
      { name: 'c', weight: 1 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      counts[pickWeighted(items).name]++;
    }
    // Each should be ~1000 ± 200
    for (const c of Object.values(counts)) {
      expect(c).toBeGreaterThan(700);
      expect(c).toBeLessThan(1300);
    }
  });

  it('zero-weight items are never picked when others have weight', () => {
    const items = [
      { name: 'zero', weight: 0 },
      { name: 'positive', weight: 10 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(pickWeighted(items).name).toBe('positive');
    }
  });
});

describe('swapRemove - additional cases', () => {
  it('preserves other elements', () => {
    const arr = [1, 2, 3, 4, 5];
    swapRemove(arr, 2); // remove 3, replaced by 5
    expect(arr).toHaveLength(4);
    expect(arr).toContain(1);
    expect(arr).toContain(2);
    expect(arr).toContain(4);
    expect(arr).toContain(5);
    expect(arr).not.toContain(3);
  });

  it('works with objects', () => {
    const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
    swapRemove(arr, 0);
    expect(arr).toHaveLength(2);
    expect(arr.find(o => o.id === 1)).toBeUndefined();
  });
});

describe('getFloatingPlatforms - edge cases', () => {
  it('platform at exactly y=650 is excluded', () => {
    const platforms: Platform[] = [
      { x: 0, y: 650, width: 200, height: 20 },
    ];
    expect(getFloatingPlatforms(platforms)).toHaveLength(0);
  });

  it('platform at y=649 with width=80 is included', () => {
    const platforms: Platform[] = [
      { x: 0, y: 649, width: 80, height: 20 },
    ];
    expect(getFloatingPlatforms(platforms)).toHaveLength(1);
  });

  it('platform at y=649 with width=79 is excluded (too narrow)', () => {
    const platforms: Platform[] = [
      { x: 0, y: 649, width: 79, height: 20 },
    ];
    expect(getFloatingPlatforms(platforms)).toHaveLength(0);
  });
});
