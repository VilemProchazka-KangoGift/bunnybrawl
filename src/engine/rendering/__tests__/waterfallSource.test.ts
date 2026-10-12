import { describe, expect, it, vi } from 'vitest';
import { drawCurrentZone } from '../hazards/zones';
import type { Ctx2D } from '../../types';

describe('waterfall visual source', () => {
  it('starts below upper platforms, preserves force bounds and reuses shading', () => {
    const calls: Record<string, unknown[][]> = {};
    const gradient = { addColorStop: vi.fn() };
    const ctx = new Proxy({}, {
      get: (_target, method) => (...args: unknown[]) => {
        const key = String(method);
        (calls[key] ??= []).push(args);
        return gradient;
      },
      set: () => true,
    }) as Ctx2D;
    const zone = Object.freeze({ x: 440, y: 160, width: 400, height: 500, vy: 900 });
    drawCurrentZone(ctx, zone, 1);
    expect(calls.translate).toEqual([[440, 160]]);
    expect(calls.fillRect).toContainEqual([-8, 0, 416, 500]);
    expect(calls.createLinearGradient).toHaveLength(1);
    expect(zone.y).toBe(160);
    expect(zone.height).toBe(500);
    drawCurrentZone(ctx, zone, 2);
    expect(calls.createLinearGradient).toHaveLength(1);
    expect(calls.fill.length).toBeGreaterThan(10);
  });
});
