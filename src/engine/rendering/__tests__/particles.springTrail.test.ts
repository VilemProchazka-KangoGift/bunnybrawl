import { describe, it, expect, vi } from 'vitest';
import { drawSpringTrail } from '../particles';
import type { Player } from '../../types';

function makeMockCtx() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
    stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function makePlayer(): Player {
  return {
    id: 'P1', x: 100, y: 200, width: 28, height: 40,
    springTrailTimer: 0.4,
    character: { name: 'Bunny', color: '#FFFFFF', darkColor: '#000000', lightColor: '#888888', emoji: '🐰' } as never,
  } as unknown as Player;
}

describe('drawSpringTrail', () => {
  it('uses a yellow rgba strokeStyle', () => {
    const ctx = makeMockCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    expect((ctx as unknown as Record<string, unknown>).strokeStyle).toMatch(/^rgba\(255,212,90,/);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('uses lineTo for an arc path, not arc primitives', () => {
    const ctx = makeMockCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // Curlicue is a poly-line, not a series of `arc` calls.
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
