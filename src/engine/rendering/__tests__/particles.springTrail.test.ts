import { describe, it, expect, vi } from 'vitest';
import { drawSpringTrail } from '../particles';
import type { Player } from '../../types';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';

function makePlayer(): Player {
  return {
    id: 'P1', x: 100, y: 200, width: 28, height: 40,
    springTrailTimer: 0.4,
    springLaunchX: 250,
    springLaunchY: 600,
    character: { name: 'Bunny', color: '#FFFFFF', darkColor: '#000000', lightColor: '#888888', emoji: '🐰' } as never,
  } as unknown as Player;
}

describe('drawSpringTrail', () => {
  it('draws a gradient-filled energy column plus stroked coil rings', () => {
    const ctx = createMockCanvasCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // One fill (column) + one stroke (rings combined into a single path).
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.createLinearGradient).toHaveBeenCalled();
  });

  it('renders the rings with ellipse, not line segments', () => {
    const ctx = createMockCanvasCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // Column ellipse + 2 coil rings = at least 3 ellipse calls.
    expect((ctx.ellipse as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
    // No lineTo segments — this is no longer a polyline curlicue.
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('returns without drawing when the timer is zero', () => {
    const ctx = createMockCanvasCtx();
    const p = makePlayer();
    p.springTrailTimer = 0;
    drawSpringTrail(ctx, p, 0);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
