import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../seededRng';

describe('SeededRNG.fromTick', () => {
  it('same seed + same tick produces identical output', () => {
    const a = SeededRNG.fromTick(42, 100);
    const b = SeededRNG.fromTick(42, 100);
    expect(a.nextFloat()).toBe(b.nextFloat());
    expect(a.nextFloat()).toBe(b.nextFloat());
    expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('different ticks with same seed produce different sequences', () => {
    const a = SeededRNG.fromTick(42, 100);
    const b = SeededRNG.fromTick(42, 101);
    expect(a.nextFloat()).not.toBe(b.nextFloat());
  });

  it('different seeds with same tick produce different sequences', () => {
    const a = SeededRNG.fromTick(42, 100);
    const b = SeededRNG.fromTick(43, 100);
    expect(a.nextFloat()).not.toBe(b.nextFloat());
  });

  it('output is in [0, 1)', () => {
    const r = SeededRNG.fromTick(42, 100);
    for (let i = 0; i < 50; i++) {
      const v = r.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
