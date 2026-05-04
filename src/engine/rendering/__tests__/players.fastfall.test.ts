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
    drawFastFallStreaks(ctx, 100, 50);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('draws three chromatic streak fills when slow-device is off', () => {
    slowSpy.mockReturnValue(false);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50);
    // One fillRect-only path with 3 layers × N segments
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it('does not call stroke when chromatic path is taken', () => {
    slowSpy.mockReturnValue(false);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50);
    expect(ctx.stroke).toHaveBeenCalledTimes(0);
  });
});
