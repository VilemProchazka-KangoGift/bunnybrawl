import { describe, it, expect } from 'vitest';
import { Accumulator } from '../accumulator';

describe('Accumulator', () => {
  describe('advance', () => {
    it('returns false until accumulated dt reaches interval', () => {
      const acc = new Accumulator<string>();
      // First sub-threshold tick: not ready, but value accumulates.
      expect(acc.advance('a', 0.1, 0.3)).toBe(false);
      expect(acc.advance('a', 0.1, 0.3)).toBe(false);
      // Crossing the threshold — ready.
      expect(acc.advance('a', 0.1, 0.3)).toBe(true);
      // After fire, residual is ~0; further sub-threshold ticks return false again.
      expect(acc.advance('a', 0.1, 0.3)).toBe(false);
    });

    it('subtracts interval (preserves residual) on fire', () => {
      const acc = new Accumulator<string>();
      // Single big tick crossing 2× threshold: fires once, leaves residual ~ interval.
      expect(acc.advance('a', 0.5, 0.3)).toBe(true);
      // Another small tick brings residual (0.2) + 0.1 = 0.3 → fires again.
      expect(acc.advance('a', 0.1, 0.3)).toBe(true);
    });

    it('uninitialized = NOT ready', () => {
      const acc = new Accumulator<string>();
      // Even with dt = interval-epsilon, no prior accumulation → false.
      expect(acc.advance('a', 0.299, 0.3)).toBe(false);
    });

    it('exact threshold crossing fires', () => {
      const acc = new Accumulator<string>();
      expect(acc.advance('a', 0.3, 0.3)).toBe(true);
    });

    it('clamps negative dt to 0', () => {
      const acc = new Accumulator<string>();
      expect(acc.advance('a', -1.0, 0.3)).toBe(false);
      // Subsequent normal advance should still need to reach interval from 0.
      expect(acc.advance('a', 0.299, 0.3)).toBe(false);
      expect(acc.advance('a', 0.001, 0.3)).toBe(true);
    });

    it('supports per-tick variable interval', () => {
      const acc = new Accumulator<string>();
      // First tick: dt=0.4 vs interval=0.5 → false, residual 0.4.
      expect(acc.advance('a', 0.4, 0.5)).toBe(false);
      // Next tick: smaller interval (0.3). Residual 0.4 + 0.0 dt? Use small dt.
      // residual 0.4 + 0.0 dt would already exceed 0.3 — but advance always adds dt first.
      // So with dt=0, 0.4 >= 0.3 → fires, residual = 0.1.
      expect(acc.advance('a', 0, 0.3)).toBe(true);
      // Next tick: interval back to 0.5. Residual 0.1 + 0.0 dt < 0.5 → false.
      expect(acc.advance('a', 0, 0.5)).toBe(false);
    });

    it('isolates keys', () => {
      const acc = new Accumulator<string>();
      expect(acc.advance('a', 0.3, 0.3)).toBe(true);
      expect(acc.advance('b', 0.1, 0.3)).toBe(false);
    });
  });

  describe('clear', () => {
    it('clear(k) zeros one key', () => {
      const acc = new Accumulator<string>();
      acc.advance('a', 0.2, 0.3);
      acc.clear('a');
      // After clear, needs full interval to fire again.
      expect(acc.advance('a', 0.2, 0.3)).toBe(false);
    });

    it('clear() zeros all keys', () => {
      const acc = new Accumulator<string>();
      acc.advance('a', 0.2, 0.3);
      acc.advance('b', 0.2, 0.3);
      acc.clear();
      expect(acc.advance('a', 0.2, 0.3)).toBe(false);
      expect(acc.advance('b', 0.2, 0.3)).toBe(false);
    });
  });

  describe('object keys', () => {
    it('works with object keys (Map-backed)', () => {
      const acc = new Accumulator<object>();
      const k1 = {};
      const k2 = {};
      expect(acc.advance(k1, 0.3, 0.3)).toBe(true);
      expect(acc.advance(k2, 0.1, 0.3)).toBe(false);
    });
  });
});
