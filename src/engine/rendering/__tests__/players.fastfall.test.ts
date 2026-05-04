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

  it('draws the legacy line stroke when slow-device is on', () => {
    slowSpy.mockReturnValue(true);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50, '#ff0000', 0);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('draws a gradient-filled smear plus motion strands when slow-device is off', () => {
    slowSpy.mockReturnValue(false);
    const ctx = createMockCanvasCtx();
    drawFastFallStreaks(ctx, 100, 50, '#ff0000', 0);
    // One filled trapezoid for the smear + one stroke for the motion strands.
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    // Linear gradient created for the smear.
    expect(ctx.createLinearGradient).toHaveBeenCalled();
  });

  it('biases the smear top opposite of horizontal velocity', () => {
    slowSpy.mockReturnValue(false);
    const ctxRight = createMockCanvasCtx();
    const ctxLeft = createMockCanvasCtx();
    drawFastFallStreaks(ctxRight, 100, 50, '#ff0000',  300);
    drawFastFallStreaks(ctxLeft,  100, 50, '#ff0000', -300);
    // Top-edge moveTo (first moveTo of the trapezoid path) differs by direction.
    const rightFirst = (ctxRight.moveTo as ReturnType<typeof vi.fn>).mock.calls[0];
    const leftFirst = (ctxLeft.moveTo as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(rightFirst[0]).toBeLessThan(leftFirst[0]);  // moving right → top of smear shifts left
  });
});
