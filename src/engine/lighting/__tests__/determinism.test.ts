import { describe, it, expect } from 'vitest';
import { tickRng } from '../determinism';

describe('tickRng', () => {
  it('same seed + same tick produces identical output', () => {
    const a = tickRng(42, 100);
    const b = tickRng(42, 100);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('different ticks with same seed produce different sequences', () => {
    const a = tickRng(42, 100);
    const b = tickRng(42, 101);
    expect(a()).not.toBe(b());
  });

  it('different seeds with same tick produce different sequences', () => {
    const a = tickRng(42, 100);
    const b = tickRng(43, 100);
    expect(a()).not.toBe(b());
  });

  it('output is in [0, 1)', () => {
    const r = tickRng(42, 100);
    for (let i = 0; i < 50; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
