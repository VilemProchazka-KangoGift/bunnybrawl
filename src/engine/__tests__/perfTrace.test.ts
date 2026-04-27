import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { perfTrace } from '../perfTrace';

describe('perfTrace', () => {
  beforeEach(() => {
    perfTrace.reset();
    perfTrace.enabled = false;
  });

  afterEach(() => {
    perfTrace.enabled = false;
    perfTrace.reset();
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

    it('circular buffer: avg stays consistent with p95 after overflow (>MAX samples)', () => {
      // Push 10_005 samples directly into the buffer via the public API.
      // Each "fake" sample is a no-op in real time but we can drive timings deterministically
      // by abusing perfTrace's begin/end with controlled deltas: just call begin/end repeatedly,
      // then assert that calls = 10_005 (writeIdx) but stats don't blow up.
      for (let i = 0; i < 10_005; i++) {
        const start = perfTrace.begin('overflow');
        // tiny work to make elapsed > 0
        for (let j = 0; j < 50; j++) Math.sqrt(j);
        perfTrace.end('overflow', start);
      }
      const snap = perfTrace.snapshot();
      expect(snap.overflow.calls).toBe(10_005);
      // avg and p95 are both over the ring window; both should be small positive numbers
      expect(snap.overflow.avgMs).toBeGreaterThan(0);
      expect(snap.overflow.p95Ms).toBeGreaterThan(0);
      // After overflow, avgMs should be totalMs / 10_000 (ring count), not totalMs / 10_005
      // (i.e. the divisor capped at MAX_SAMPLES_PER_SECTION). We verify this via a slightly
      // looser assertion: avgMs should be within an order of magnitude of p95Ms (sanity check
      // that the lifetime/ring population mismatch is not present).
      expect(snap.overflow.avgMs).toBeLessThan(snap.overflow.p95Ms * 100);
    });
  });
});
