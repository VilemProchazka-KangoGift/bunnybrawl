import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawCurrentZone } from '../hazards/zones';
import type { Ctx2D } from '../../types';

afterEach(() => vi.unstubAllGlobals());

describe('waterfall visual source', () => {
  it('joins the rock lip without changing the force zone and resizes its cache when needed', () => {
    const images: unknown[][] = [];
    const gradient = { addColorStop: vi.fn() };
    const ctx = new Proxy({}, {
      get: (_target, method) => (...args: unknown[]) => {
        if (method === 'drawImage') images.push(args);
        return gradient;
      },
      set: () => true,
    }) as Ctx2D;
    class Canvas {
      constructor(public width: number, public height: number) {}
      getContext() { return ctx; }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    const zone = Object.freeze({ x: 440, y: 160, width: 400, height: 500, vy: 900 });
    drawCurrentZone(ctx, zone, 1, 65);
    const body = images.find(args => (args[0] as Canvas).width === 1)!;
    expect(body.slice(1)).toEqual([428, 65, 424, 595]);
    expect((body[0] as Canvas).height).toBe(595);
    expect(zone.y).toBe(160);
    expect(zone.height).toBe(500);

    images.length = 0;
    drawCurrentZone(ctx, zone, 1);
    const original = images.find(args => (args[0] as Canvas).width === 1)!;
    expect(original.slice(1)).toEqual([428, 160, 424, 500]);
    expect((original[0] as Canvas).height).toBe(500);
  });
});
