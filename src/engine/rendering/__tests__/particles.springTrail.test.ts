import { describe, it, expect } from 'vitest';
import { drawSpringTrail } from '../particles';
import { SPRING_TRAIL_DURATION } from '../../constants';
import type { Player } from '../../types';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';

const launch = (overrides: Partial<Player> = {}): Player => ({
  x: 100, y: 200, springTrailTimer: SPRING_TRAIL_DURATION,
  springLaunchX: 250, springLaunchY: 600, ...overrides,
} as Player);

describe('spring boing accents', () => {
  it('appears at full opacity at the mushroom cap, preserving inherited opacity', () => {
    const ctx = createMockCanvasCtx(); ctx.globalAlpha = 0.6;
    drawSpringTrail(ctx, launch(), 0);
    expect(ctx.translate).toHaveBeenCalledWith(250, 564);
    expect(ctx.fill).toHaveBeenCalledTimes(5);
    expect(ctx.stroke).toHaveBeenCalledTimes(5);
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.ellipse).not.toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(0.6);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('stays at the launch point and depends on launch age rather than the wall clock', () => {
    const a = createMockCanvasCtx(), b = createMockCanvasCtx();
    const timer = SPRING_TRAIL_DURATION - 0.07;
    drawSpringTrail(a, launch({ springTrailTimer: timer }), 0);
    drawSpringTrail(b, launch({ x: 900, y: 20, springTrailTimer: timer }), 123456);
    expect(a.moveTo.mock.calls).toEqual(b.moveTo.mock.calls);
    expect(a.translate.mock.calls).toEqual(b.translate.mock.calls);
  });
  it.each([
    { springTrailTimer: 0 }, { springTrailTimer: SPRING_TRAIL_DURATION - 0.19 },
    { springLaunchX: NaN }, { springLaunchY: NaN }, { springTrailTimer: NaN },
  ])('does not draw an expired or invalid launch: %j', overrides => {
    const ctx = createMockCanvasCtx();
    drawSpringTrail(ctx, launch(overrides), 0);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
