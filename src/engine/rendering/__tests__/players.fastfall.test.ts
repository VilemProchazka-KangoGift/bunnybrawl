import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drawFastFallStreaks } from '../players';
import * as perfFlags from '../../perfFlags';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';

describe('drawFastFallStreaks', () => {
  let slowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    slowSpy = vi.spyOn(perfFlags, 'getSlowDevice');
  });
  afterEach(() => { slowSpy.mockRestore(); });

  it('draws a single stroke pass when slow-device is on', () => {
    slowSpy.mockReturnValue(true);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50, 0, 0);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('draws multiple stroke passes when slow-device is off', () => {
    slowSpy.mockReturnValue(false);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50, 0, 0);
    // 6 wind-rush lines = 6 stroke calls
    expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('does not call fillRect on the chromatic-removed path', () => {
    slowSpy.mockReturnValue(false);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50, 0, 0);
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('biases line angles based on horizontal velocity', () => {
    slowSpy.mockReturnValue(false);
    const ctxRight = createMockCanvasCtx();
    const ctxLeft = createMockCanvasCtx();
    drawFastFallStreaks(ctxRight, 100, 50,  300, 0);  // moving right
    drawFastFallStreaks(ctxLeft,  100, 50, -300, 0);  // moving left
    // Both should call stroke 6 times — but the moveTo positions should differ
    const rightMoves = (ctxRight.moveTo as ReturnType<typeof vi.fn>).mock.calls;
    const leftMoves = (ctxLeft.moveTo as ReturnType<typeof vi.fn>).mock.calls;
    expect(rightMoves[0]).not.toEqual(leftMoves[0]);
  });
});
