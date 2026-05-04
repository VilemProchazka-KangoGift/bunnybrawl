import { describe, it, expect, vi } from 'vitest';
import { drawSpringTrail } from '../particles';
import type { Player } from '../../types';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';

function makePlayer(): Player {
  return {
    id: 'P1', x: 100, y: 200, width: 28, height: 40,
    springTrailTimer: 0.4,
    character: { name: 'Bunny', color: '#FFFFFF', darkColor: '#000000', lightColor: '#888888', emoji: '🐰' } as never,
  } as unknown as Player;
}

describe('drawSpringTrail', () => {
  it('uses a yellow rgba strokeStyle', () => {
    const ctx = createMockCanvasCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    expect((ctx as unknown as Record<string, unknown>).strokeStyle).toMatch(/^rgba\(255,212,90,/);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('uses lineTo for an arc path, not arc primitives', () => {
    const ctx = createMockCanvasCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // Curlicue is a poly-line, not a series of `arc` calls.
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
