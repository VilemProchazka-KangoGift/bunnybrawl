// src/engine/lighting/__tests__/pipeline.smoke.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LightingPipeline } from '../pipeline';

// happy-dom does not include OffscreenCanvas. Provide a minimal stub so the
// pipeline constructor and test calls don't throw.
function makeOffscreenCtx() {
  return {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '' as string,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([200, 200, 200, 255]) })),
    save: vi.fn(),
    restore: vi.fn(),
  };
}
class MockOffscreenCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_: string) { return makeOffscreenCtx(); }
}
// @ts-ignore
globalThis.OffscreenCanvas = MockOffscreenCanvas;

describe('LightingPipeline (Part A no-op stub)', () => {
  it('constructs with width and height', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p).toBeDefined();
  });

  it('isEnabled() returns true by default (kill switch off)', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true);
  });

  it('beginFrame and composite are callable with valid args', () => {
    const p = new LightingPipeline(1280, 720);
    const theme = { dayNight: { enabled: true, showStars: true, showFireflies: true } } as any;
    expect(() => p.beginFrame(theme, 0, 0)).not.toThrow();
    const c = new OffscreenCanvas(1280, 720);
    const ctx = c.getContext('2d')!;
    expect(() => p.composite(ctx)).not.toThrow();
  });

  it('resize updates internal dims without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(640, 360, 0.5)).not.toThrow();
  });
});
