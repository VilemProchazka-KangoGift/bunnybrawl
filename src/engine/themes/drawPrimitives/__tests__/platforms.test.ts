import { describe, it, expect } from 'vitest';
import {
  backFlat,
  backWavyUp,
  CAP_DEPTH,
  candyDrips,
  jaggedDown,
  mulberry32,
  seedFor,
  SKEW_RATIO,
  subtleDown,
  wavyDown,
} from '../platforms';

describe('platforms.ts framework — core helpers', () => {
  it('exposes locked constants', () => {
    expect(CAP_DEPTH).toBe(16);
    expect(SKEW_RATIO).toBe(0.5);
  });

  it('mulberry32 produces deterministic sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    const vals = [a(), a(), a()];
    expect(vals.every(v => v >= 0 && v < 1)).toBe(true);
  });

  it('seedFor hashes (x,y) consistently', () => {
    expect(seedFor(100, 200)).toBe(seedFor(100, 200));
    expect(seedFor(100, 200)).not.toBe(seedFor(101, 200));
  });
});

describe('platforms.ts — front-edge profile generators', () => {
  const x = 100, w = 200, cF = 300;

  it('wavyDown starts at (x, cF), ends at (x+w, cF)', () => {
    const pts = wavyDown(x, w, cF, mulberry32(1), {});
    expect(pts[0]).toEqual({ x, y: cF });
    expect(pts[pts.length - 1]).toEqual({ x: x + w, y: cF });
  });

  it('wavyDown only dips down — all interior y >= cF', () => {
    const pts = wavyDown(x, w, cF, mulberry32(1), {});
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
  });

  it('jaggedDown only dips down', () => {
    const pts = jaggedDown(x, w, cF, mulberry32(1), {});
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
    expect(pts[0]).toEqual({ x, y: cF });
    expect(pts[pts.length - 1]).toEqual({ x: x + w, y: cF });
  });

  it('subtleDown produces a mostly-flat profile with small dips', () => {
    const pts = subtleDown(x, w, cF, mulberry32(1), { count: 2, amp: 1 });
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(cF);
      expect(p.y).toBeLessThan(cF + 5);
    }
  });

  it('candyDrips produces points with y >= cF (drips hang down)', () => {
    const pts = candyDrips(x, w, cF, mulberry32(1));
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
  });
});

describe('platforms.ts — back-edge profile generators', () => {
  const x = 100, w = 200, cB = 50, sp = 8;

  it('backWavyUp starts at (x+sp, cB) and only bulges up (y <= cB)', () => {
    const pts = backWavyUp(x, w, cB, sp, mulberry32(1), {});
    expect(pts[0]).toEqual({ x: x + sp, y: cB });
    expect(pts[pts.length - 1]).toEqual({ x: x + w + sp, y: cB });
    for (const p of pts) expect(p.y).toBeLessThanOrEqual(cB);
  });

  it('backFlat returns exactly 2 straight points', () => {
    const pts = backFlat(x, w, cB, sp);
    expect(pts).toEqual([{ x: x + sp, y: cB }, { x: x + w + sp, y: cB }]);
  });
});
