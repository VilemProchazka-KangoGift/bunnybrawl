import { describe, it, expect } from 'vitest';
import {
  CAP_DEPTH,
  SKEW_RATIO,
  mulberry32,
  seedFor,
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
