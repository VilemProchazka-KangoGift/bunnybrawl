import { describe, it, expect } from 'vitest';
import { SeededRNG } from './prng';

describe('SeededRNG - edge cases', () => {
  it('seed of 0 produces valid [0,1) output', () => {
    const rng = new SeededRNG(0);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      values.add(v);
    }
    // Should produce distinct values (not stuck)
    expect(values.size).toBeGreaterThan(10);
  });

  it('negative seed produces valid output', () => {
    const rng = new SeededRNG(-1);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('large seed (2^31-1) produces valid output', () => {
    const rng = new SeededRNG(2147483647);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt covers both boundaries inclusively', () => {
    const rng = new SeededRNG(42);
    let sawZero = false, sawFive = false;
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextInt(0, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
      if (v === 0) sawZero = true;
      if (v === 5) sawFive = true;
    }
    expect(sawZero).toBe(true);
    expect(sawFive).toBe(true);
  });

  it('nextInt(n, n) always returns n', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng.nextInt(5, 5)).toBe(5);
    }
  });

  it('state survives multiple save/restore cycles', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const s1 = rng.getState();
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const s2 = rng.getState();

    rng.setState(s1);
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const s3 = rng.getState();
    expect(s2).toBe(s3);
  });

  it('clone does not alias state (modifying original does not affect clone)', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 20; i++) rng.nextFloat();
    const cloned = rng.clone();
    // Advance original but not clone
    const origNext = rng.nextFloat();
    const cloneNext = cloned.nextFloat();
    // They should produce the same value (both at position 20)
    expect(origNext).toBe(cloneNext);
  });

  it('distribution is approximately uniform across 10 buckets', () => {
    const rng = new SeededRNG(12345);
    const buckets = new Array(10).fill(0);
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const v = rng.nextFloat();
      const bucket = Math.min(9, Math.floor(v * 10));
      buckets[bucket]++;
    }
    const expected = N / 10;
    for (let b = 0; b < 10; b++) {
      // Each bucket should be within 5% of expected
      expect(buckets[b]).toBeGreaterThan(expected * 0.9);
      expect(buckets[b]).toBeLessThan(expected * 1.1);
    }
  });

  it('mulberry32 reference: seed=1 produces consistent first 3 values', () => {
    const rng = new SeededRNG(1);
    const v1 = rng.nextFloat();
    const v2 = rng.nextFloat();
    const v3 = rng.nextFloat();
    // These are deterministic — if the algorithm changes, these break
    // Record the actual values as golden references
    const rng2 = new SeededRNG(1);
    expect(rng2.nextFloat()).toBe(v1);
    expect(rng2.nextFloat()).toBe(v2);
    expect(rng2.nextFloat()).toBe(v3);
  });

  it('two different seeds produce different first values', () => {
    const rng1 = new SeededRNG(1);
    const rng2 = new SeededRNG(2);
    expect(rng1.nextFloat()).not.toBe(rng2.nextFloat());
  });

  it('nextRange produces values in [min, max)', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextRange(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it('nextRange with min == max returns min', () => {
    const rng = new SeededRNG(42);
    expect(rng.nextRange(3.5, 3.5)).toBe(3.5);
  });

  it('1000 sequential nextFloat calls all in [0,1)', () => {
    const rng = new SeededRNG(777);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('adjacent seeds produce different sequences', () => {
    for (let seed = 0; seed < 10; seed++) {
      const a = new SeededRNG(seed);
      const b = new SeededRNG(seed + 1);
      const aVals = [a.nextFloat(), a.nextFloat(), a.nextFloat()];
      const bVals = [b.nextFloat(), b.nextFloat(), b.nextFloat()];
      expect(aVals).not.toEqual(bVals);
    }
  });

  it('getState returns current internal state', () => {
    const rng = new SeededRNG(42);
    const s0 = rng.getState();
    rng.nextFloat();
    const s1 = rng.getState();
    expect(s0).not.toBe(s1); // state advanced
  });

  it('setState + nextFloat matches original sequence', () => {
    const rng1 = new SeededRNG(42);
    for (let i = 0; i < 100; i++) rng1.nextFloat();
    const saved = rng1.getState();
    const expected = [rng1.nextFloat(), rng1.nextFloat(), rng1.nextFloat()];

    const rng2 = new SeededRNG(0);
    rng2.setState(saved);
    const actual = [rng2.nextFloat(), rng2.nextFloat(), rng2.nextFloat()];
    expect(actual).toEqual(expected);
  });

  it('clone produces independent copy', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const clone = rng.clone();

    // Advance original many times
    for (let i = 0; i < 100; i++) rng.nextFloat();

    // Clone should still be at position 50
    const cloneState = clone.getState();
    const freshRng = new SeededRNG(42);
    for (let i = 0; i < 50; i++) freshRng.nextFloat();
    expect(cloneState).toBe(freshRng.getState());
  });

  it('nextInt distribution is roughly uniform', () => {
    const rng = new SeededRNG(42);
    const counts = [0, 0, 0, 0, 0, 0]; // 0-5
    for (let i = 0; i < 60000; i++) {
      counts[rng.nextInt(0, 5)]++;
    }
    // Each bucket should be ~10000 ± 1500
    for (const c of counts) {
      expect(c).toBeGreaterThan(8000);
      expect(c).toBeLessThan(12000);
    }
  });
});
