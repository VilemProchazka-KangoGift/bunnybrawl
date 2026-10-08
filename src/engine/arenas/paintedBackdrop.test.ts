import { describe, expect, it, vi } from 'vitest';
import { spaceStation } from './packs/spaceStation';
import { toArena } from './registry';
import { getIllustratedBackdrop } from './illustratedBackdropAsset';
import type { Ctx2D } from '../types';

vi.mock('./illustratedBackdropAsset', () => ({ getIllustratedBackdrop: vi.fn() }));

describe('Space Station painted view', () => {
  it.each([true, false])('draws the complete station plate or its clipped procedural fallback (painted=%s)', (painted) => {
    vi.mocked(getIllustratedBackdrop).mockReturnValue(painted ? { width: 1280, height: 720 } as ImageBitmap : null);
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const gradient = { addColorStop: vi.fn() };
    const ctx = new Proxy({}, {
      get: (_target, method) => (...args: unknown[]) => {
        calls.push({ method: String(method), args });
        return gradient;
      },
      set: () => true,
    }) as Ctx2D;
    spaceStation.drawFarBackground!(ctx, toArena(spaceStation));
    if (painted) {
      expect(calls.some(call => call.method === 'clip')).toBe(false);
      expect(calls.filter(call => call.method === 'drawImage')).toHaveLength(1);
      expect(calls.find(call => call.method === 'drawImage')?.args.slice(1)).toEqual([0, 0, 1280, 720]);
      expect(calls.some(call => call.method === 'fillRect')).toBe(false);
    } else {
      const clip = calls.findIndex(call => call.method === 'clip');
      expect(clip).toBeGreaterThan(0);
      expect(calls[clip - 1]).toEqual({ method: 'rect', args: [280, 25, 720, 635] });
      expect(calls.some(call => call.method === 'drawImage')).toBe(false);
    }
    let depth = 0;
    for (const call of calls) {
      if (call.method === 'save') depth++;
      if (call.method === 'restore') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
