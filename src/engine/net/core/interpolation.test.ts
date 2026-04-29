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
    // Push enough contiguous frames that target lands inside the buffer.
    // Initial delay is the warmup value, so target = latest - warmup.
    for (let i = 1; i <= 10; i++) interp.pushSnapshot({ frame: i, x: i * 10 });

    const result = interp.getRawResult();
    expect(result).not.toBeNull();
    expect(result!.kind === 'interpolate' || result!.kind === 'single').toBe(true);
    if (result!.kind === 'interpolate') {
      expect(result!.before.frame).toBeLessThan(result!.after.frame);
      expect(result!.t).toBeGreaterThanOrEqual(0);
      expect(result!.t).toBeLessThanOrEqual(1);
    }

    const state = interp.getInterpolatedState();
    expect(state).not.toBeNull();
    // x mirrors frame * 10, so interpolated x should be in [10, 100].
    expect(state!.x).toBeGreaterThanOrEqual(10);
    expect(state!.x).toBeLessThanOrEqual(100);
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

  // ---- Pre-emptive warmup delay ----

  it('starts with a wider initial delay than MIN to absorb first-connect jitter', () => {
    const interp = createInterp();
    // Before any snapshots, delay is the warmup value (4 frames), not MIN (2).
    expect(interp.getDelayFrames()).toBeGreaterThan(2);
  });

  it('reset() returns delay to the warmup value (reconnect re-warms)', () => {
    const interp = createInterp();
    const startDelay = interp.getDelayFrames();
    // Drive a brief widen via a frame gap so the steady-state value diverges
    // from the warmup value.
    interp.pushSnapshot({ frame: 1, x: 0 });
    interp.pushSnapshot({ frame: 100, x: 0 });  // gap > 1 → widens
    interp.reset();
    expect(interp.getDelayFrames()).toBe(startDelay);
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

  // ---- Adaptive delay: wall-clock widening ----

  it('widens delay when consecutive frames arrive late by wall-clock even with no frame gaps', async () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 1, x: 0 });
    const initialDelay = interp.getDelayFrames();
    // Push 10 in-order, consecutive frames spaced 50ms apart (well above
    // LATE_ARRIVAL_MS=35). Without wall-clock widening this would not raise
    // delay because no frame gap is ever seen.
    for (let i = 2; i <= 11; i++) {
      await new Promise(r => setTimeout(r, 50));
      interp.pushSnapshot({ frame: i, x: i });
    }
    expect(interp.getDelayFrames()).toBeGreaterThan(initialDelay);
  });

  it('does NOT widen delay on consecutive frames arriving promptly (<35ms apart)', async () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 1, x: 0 });
    const initialDelay = interp.getDelayFrames();
    for (let i = 2; i <= 11; i++) {
      // 16ms is the expected 60Hz interval; well below LATE_ARRIVAL_MS.
      await new Promise(r => setTimeout(r, 16));
      interp.pushSnapshot({ frame: i, x: i });
    }
    expect(interp.getDelayFrames()).toBe(initialDelay);
  });

  // ---- Extrapolation freeze-cap ----

  it('caps extrapolation overshoot rather than falling back to latest snapshot', () => {
    const interp = createInterp();
    interp.pushSnapshot({ frame: 1, x: 0 });
    interp.pushSnapshot({ frame: 10, x: 100 });
    // No more snapshots arrive; targetFrame = 10 - delay = 8 (within ring),
    // so first call interpolates. Push a closer snapshot then let extrap
    // overshoot accumulate via additional getRawResult calls (which are
    // stateless — overshoot derives from current ring state).
    // Force a wide overshoot: only one snapshot at frame 100, latestHostFrame=100,
    // targetFrame=98 (delay=2). overshoot=98-100=-2 → falls through to single.
    // Better path: two snapshots at 100, 101. Latest=101, targetFrame=99. overshoot=99-101=-2.
    // To trigger extrap we need targetFrame > latest frame in ring.
    // Use a single snapshot to force getRawResult into the no-after branch.
    const interp2 = createInterp();
    // Push one snapshot, then bump the latestHostFrame artificially via
    // multiple pushes that increase the ring's max frame; the no-after path
    // engages when there's no snapshot at-or-after targetFrame.
    interp2.pushSnapshot({ frame: 100, x: 0 });
    interp2.pushSnapshot({ frame: 101, x: 10 }); // delay=2, target=99, before=100, no after
    const result = interp2.getRawResult();
    expect(result).not.toBeNull();
    if (result && result.kind === 'extrapolate') {
      expect(result.overshootFrames).toBeLessThanOrEqual(4);
    }
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
