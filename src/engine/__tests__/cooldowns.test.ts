import { describe, it, expect } from 'vitest';
import { Cooldowns } from '../cooldowns';

describe('Cooldowns', () => {
  describe('set + tick', () => {
    it('returns false until accumulated dt exceeds the set value, then true once', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 0.3);

      // Multiple ticks below threshold — not ready.
      expect(cd.tick('a', 0.1)).toBe(false);
      expect(cd.tick('a', 0.1)).toBe(false);
      // Crossing zero — ready.
      expect(cd.tick('a', 0.2)).toBe(true);
      // After firing, must be re-set; another tick without set returns true once
      // but stays at zero. Pattern in callers: ready=true → caller does work + set(k, T) again.
      // Here we verify the post-fire state stays "ready" until re-set.
      expect(cd.tick('a', 0.05)).toBe(true);
    });

    it('returns true immediately on exact crossing', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 0.3);
      expect(cd.tick('a', 0.3)).toBe(true);
    });

    it('isolates keys', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 0.5);
      cd.set('b', 0.1);
      expect(cd.tick('b', 0.1)).toBe(true);
      expect(cd.tick('a', 0.1)).toBe(false);
    });
  });

  describe('uninitialized keys', () => {
    it('tick on a never-set key returns true (uninitialized = ready)', () => {
      const cd = new Cooldowns<string>();
      expect(cd.tick('never-set', 0.016)).toBe(true);
    });
  });

  describe('clear', () => {
    it('clear() resets all keys to ready', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 1.0);
      cd.set('b', 1.0);
      cd.clear();
      expect(cd.tick('a', 0)).toBe(true);
      expect(cd.tick('b', 0)).toBe(true);
    });

    it('clear(k) resets only one key', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 1.0);
      cd.set('b', 1.0);
      cd.clear('a');
      expect(cd.tick('a', 0)).toBe(true);
      expect(cd.tick('b', 0)).toBe(false);
    });
  });

  describe('defensive', () => {
    it('clamps negative dt to 0 (no time travel)', () => {
      const cd = new Cooldowns<string>();
      cd.set('a', 0.3);
      // Negative dt should not advance the cooldown.
      expect(cd.tick('a', -1)).toBe(false);
      // The remaining time is still ~0.3.
      expect(cd.tick('a', 0.29)).toBe(false);
      expect(cd.tick('a', 0.02)).toBe(true);
    });
  });

  describe('numeric keys', () => {
    it('works with numeric keys', () => {
      const cd = new Cooldowns<number>();
      cd.set(1, 0.2);
      expect(cd.tick(1, 0.1)).toBe(false);
      expect(cd.tick(1, 0.1)).toBe(true);
    });
  });
});
