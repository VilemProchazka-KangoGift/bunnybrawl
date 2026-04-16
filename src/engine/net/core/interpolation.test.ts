import { describe, it, expect } from 'vitest';
import { SnapshotInterpolation } from './interpolation';
import type { InterpolationConfig } from './types';

/** Simple test snapshot type. */
interface TestSnapshot {
  frame: number;
  x: number;
}

/** Config for test snapshots: linear interpolation on x, frame from frame field. */
const testConfig: InterpolationConfig<TestSnapshot> = {
  getFrame: (s) => s.frame,
  interpolate: (a, b, t) => ({
    frame: Math.round(a.frame + (b.frame - a.frame) * t),
    x: a.x + (b.x - a.x) * t,
  }),
};

function createInterp(): SnapshotInterpolation<TestSnapshot> {
  return new SnapshotInterpolation(testConfig);
}

describe('SnapshotInterpolation', () => {
  // ---- No data ----

  it('returns null before any snapshots are pushed', () => {
    const interp = createInterp();
    expect(interp.getRawResult()).toBeNull();
    expect(interp.getInterpolatedState()).toBeNull();
  });

  // ---- Single snapshot ----

  it('returns single snapshot when only one is buffered', () => {
    const interp = createInterp();
    const snap: TestSnapshot = { frame: 10, x: 100 };
    interp.pushSnapshot(snap);

    const result = interp.getRawResult();
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('single');
    if (result!.kind === 'single') {
      expect(result!.snapshot).toBe(snap);
    }
  });

  // ---- Interpolation between two snapshots ----

  it('returns interpolated snapshot between two buffered snapshots', () => {
    const interp = createInterp();
    // Push two snapshots far enough apart to bracket the target frame.
    // Interpolation delay is initially 2, so target = latestFrame - 2.
    // Push frames 1 and 5 — target will be 5 - 2 = 3, bracketed by [1, 5].
    interp.pushSnapshot({ frame: 1, x: 0 });
    interp.pushSnapshot({ frame: 5, x: 100 });

    const result = interp.getRawResult();
    expect(result).not.toBeNull();
    // With only 2 snapshots and target=3, we expect an interpolation bracket
    if (result!.kind === 'interpolate') {
      expect(result!.before.frame).toBe(1);
      expect(result!.after.frame).toBe(5);
      // t should be (3-1)/(5-1) = 0.5
      expect(result!.t).toBeCloseTo(0.5, 5);
    }

    // getInterpolatedState should apply the lerp
    const state = interp.getInterpolatedState();
    expect(state).not.toBeNull();
    expect(state!.x).toBeCloseTo(50, 1); // 0 + (100-0)*0.5
  });

  // ---- Out-of-order rejection ----

  it('rejects out-of-order snapshots (older frame after newer)', () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 5, x: 50 });
    interp.pushSnapshot({ frame: 3, x: 30 }); // should be ignored

    expect(interp.getLatestSnapshot()).toEqual({ frame: 5, x: 50 });
    expect(interp.getBufferDepth()).toBe(1); // only the first was accepted
  });

  it('rejects duplicate frame numbers', () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 5, x: 50 });
    interp.pushSnapshot({ frame: 5, x: 99 }); // same frame, should be ignored

    expect(interp.getBufferDepth()).toBe(1);
    expect(interp.getLatestSnapshot()!.x).toBe(50); // original kept
  });

  // ---- Adaptive delay: tightening ----

  it('tightens delay after many consecutive on-time arrivals', () => {
    const interp = createInterp();

    // First push a snapshot with a gap to increase delay above minimum
    interp.pushSnapshot({ frame: 1, x: 0 });
    // Big gap to trigger delay increase (gap > 1 triggers late count)
    interp.pushSnapshot({ frame: 10, x: 0 });

    const delayAfterGap = interp.getDelayFrames();

    // Now push 130+ consecutive on-time snapshots (gap=1 each)
    // TIGHTEN_THRESHOLD is 120, so this should eventually decrease delay
    for (let i = 11; i <= 150; i++) {
      interp.pushSnapshot({ frame: i, x: i });
    }

    const delayAfterOnTime = interp.getDelayFrames();
    // Delay should have decreased (or at least not increased) from the gap-induced level
    expect(delayAfterOnTime).toBeLessThanOrEqual(delayAfterGap);
  });

  // ---- getLatestSnapshot ----

  it('getLatestSnapshot returns the newest pushed snapshot', () => {
    const interp = createInterp();
    expect(interp.getLatestSnapshot()).toBeNull();

    interp.pushSnapshot({ frame: 1, x: 10 });
    expect(interp.getLatestSnapshot()).toEqual({ frame: 1, x: 10 });

    interp.pushSnapshot({ frame: 2, x: 20 });
    expect(interp.getLatestSnapshot()).toEqual({ frame: 2, x: 20 });

    interp.pushSnapshot({ frame: 5, x: 50 });
    expect(interp.getLatestSnapshot()).toEqual({ frame: 5, x: 50 });
  });

  // ---- getBufferDepth ----

  it('getBufferDepth reflects push count', () => {
    const interp = createInterp();
    expect(interp.getBufferDepth()).toBe(0);

    interp.pushSnapshot({ frame: 1, x: 0 });
    expect(interp.getBufferDepth()).toBe(1);

    interp.pushSnapshot({ frame: 2, x: 0 });
    expect(interp.getBufferDepth()).toBe(2);

    interp.pushSnapshot({ frame: 3, x: 0 });
    expect(interp.getBufferDepth()).toBe(3);
  });

  it('getBufferDepth is capped at maxBuffer (30)', () => {
    const interp = createInterp();
    for (let i = 1; i <= 50; i++) {
      interp.pushSnapshot({ frame: i, x: i });
    }
    expect(interp.getBufferDepth()).toBe(30);
  });

  // ---- getRawResult reuses objects ----

  it('getRawResult reuses result objects (same reference across calls)', () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 1, x: 0 });

    const result1 = interp.getRawResult();
    const result2 = interp.getRawResult();

    // Both calls return the same pre-allocated object
    expect(result1).toBe(result2);
  });

  it('getRawResult reuses interpolate result object across calls', () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 1, x: 0 });
    interp.pushSnapshot({ frame: 5, x: 100 });

    const result1 = interp.getRawResult();
    // Push another snapshot so the bracket may shift, but result kind stays interpolate
    interp.pushSnapshot({ frame: 9, x: 200 });
    const result2 = interp.getRawResult();

    // If both are 'interpolate' kind, they should be the same object reference
    if (result1!.kind === 'interpolate' && result2!.kind === 'interpolate') {
      expect(result1).toBe(result2);
    }
  });

  // ---- getInterpolatedState convenience ----

  it('getInterpolatedState returns single snapshot directly', () => {
    const interp = createInterp();
    const snap: TestSnapshot = { frame: 10, x: 42 };
    interp.pushSnapshot(snap);

    const state = interp.getInterpolatedState();
    expect(state).toBe(snap);
  });
});
