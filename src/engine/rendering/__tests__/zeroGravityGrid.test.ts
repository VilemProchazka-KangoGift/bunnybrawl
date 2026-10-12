import { afterEach, expect, it, vi } from 'vitest';
import { drawZeroGZone } from '../hazards/zones';
import type { Ctx2D } from '../../types';

afterEach(() => vi.unstubAllGlobals());

it('refracts backing pixels at render scale and preserves the exact frame', () => {
  const calls: Record<string, unknown[][]> = {};
  const ctx = new Proxy({}, {
    get: (_target, method) => (...args: unknown[]) => {
      (calls[String(method)] ??= []).push(args);
      return { addColorStop: vi.fn() };
    },
    set: () => true,
  }) as Ctx2D;
  vi.stubGlobal('OffscreenCanvas', class { getContext() { return ctx; } });
  const background = {} as CanvasImageSource;
  const zone = Object.freeze({ x: 250, y: 200, width: 780, height: 480 });
  drawZeroGZone(ctx, zone, 2, background, 2);
  const refraction = calls.drawImage.filter(args => args[0] === background);
  expect(refraction.length).toBeGreaterThan(0);
  expect(refraction[0].slice(1, 5)).toEqual([468, 406, 1624, 12]);
  expect(refraction[0].slice(6)).toEqual([203, 812, 6]);
  for (const args of refraction) expect(Math.abs(Number(args[5]) - 234)).toBeLessThanOrEqual(0.75);
  expect(calls.rect).toContainEqual([253, 203, 774, 474]);
  expect(calls.strokeRect).toContainEqual([251, 201, 778, 478]);
});
