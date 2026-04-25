import { describe, it, expect, beforeEach } from 'vitest';
import { perfTrace } from '../perfTrace';

describe('perfTrace', () => {
  beforeEach(() => {
    perfTrace.reset();
    perfTrace.enabled = false;
  });

  describe('disabled (zero-overhead path)', () => {
    it('begin returns 0', () => {
      expect(perfTrace.begin('foo')).toBe(0);
    });

    it('end is a no-op when start is 0', () => {
      perfTrace.end('foo', 0);
      expect(perfTrace.snapshot()).toEqual({});
    });

    it('end is a no-op even when start is non-zero (defense in depth)', () => {
      perfTrace.end('foo', performance.now());
      expect(perfTrace.snapshot()).toEqual({});
    });
  });

  describe('enabled', () => {
    beforeEach(() => {
      perfTrace.enabled = true;
    });

    it('records a single timing', () => {
      const start = perfTrace.begin('foo');
      expect(start).toBeGreaterThan(0);
      perfTrace.end('foo', start);
      const snap = perfTrace.snapshot();
      expect(snap.foo).toBeDefined();
      expect(snap.foo.calls).toBe(1);
      expect(snap.foo.totalMs).toBeGreaterThanOrEqual(0);
      expect(snap.foo.avgMs).toBeGreaterThanOrEqual(0);
      expect(snap.foo.p95Ms).toBeGreaterThanOrEqual(0);
    });

    it('aggregates multiple sections independently', () => {
      const a = perfTrace.begin('a');
      perfTrace.end('a', a);
      const b1 = perfTrace.begin('b');
      perfTrace.end('b', b1);
      const b2 = perfTrace.begin('b');
      perfTrace.end('b', b2);
      const snap = perfTrace.snapshot();
      expect(snap.a.calls).toBe(1);
      expect(snap.b.calls).toBe(2);
    });

    it('reset clears all sections', () => {
      const start = perfTrace.begin('foo');
      perfTrace.end('foo', start);
      perfTrace.reset();
      expect(perfTrace.snapshot()).toEqual({});
    });

    it('snapshot returns avg = total / calls', () => {
      for (let i = 0; i < 5; i++) {
        const start = perfTrace.begin('x');
        for (let j = 0; j < 1000; j++) Math.sqrt(j);
        perfTrace.end('x', start);
      }
      const snap = perfTrace.snapshot();
      expect(snap.x.calls).toBe(5);
      expect(snap.x.avgMs).toBeCloseTo(snap.x.totalMs / 5, 5);
    });
  });
});
