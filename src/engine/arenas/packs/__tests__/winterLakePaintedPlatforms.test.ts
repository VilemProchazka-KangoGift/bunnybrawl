import { describe, expect, it, vi } from 'vitest';
import type { Ctx2D, Platform } from '../../../types';
import { CAP_DEPTH, skewPx } from '../../../themes/drawPrimitives';
import { drawPaintedWinterPlatform, paintedPlatformKind } from '../winterLakePaintedPlatforms';

function recorder() {
  const drawImage = vi.fn();
  const stroke = vi.fn();
  const ctx = {
    drawImage, save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke,
  } as unknown as Ctx2D;
  return { ctx, drawImage, stroke };
}

const images = {
  shelf: {} as ImageBitmap,
  bridge: {} as ImageBitmap,
  cube: {} as ImageBitmap,
};

describe('painted Winter Lake platforms', () => {
  it('keeps an assigned shelf treatment when its width changes', () => {
    expect(paintedPlatformKind({ x: 0, y: 100, width: 145, height: 24 }, false)).toBe('shelf');
    expect(paintedPlatformKind({ x: 0, y: 100, width: 220, height: 24 }, false)).toBe('shelf');
    expect(paintedPlatformKind({ x: 0, y: 100, width: 145, height: 24, style: 'snowBridge' }, false)).toBe('bridge');
  });
  it.each([90, 120, 145, 180, 240, 400, 600])('covers a moved %ipx shelf without moving its landing plane', width => {
    const platform: Platform = { x: 93, y: 371, width, height: width < 80 ? 18 : 24, style: width >= 180 ? 'snowBridge' : undefined };
    const { ctx, drawImage } = recorder();
    expect(drawPaintedWinterPlatform(ctx, platform, false, false, images)).toBe(true);
    const calls = drawImage.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][5]).toBe(platform.x);
    expect(calls[0][6]).toBe(platform.y - CAP_DEPTH / 2);
    expect(calls[2][5] + calls[2][7]).toBeCloseTo(platform.x + width + skewPx());
    expect(calls.reduce((sum, call) => sum + call[7], 0)).toBeCloseTo(width + skewPx());
    expect(calls.every(call => call[7] > 0 && call[8] > 0)).toBe(true);
  });

  it.each([40, 50, 65])('renders a %ipx step with one painted sample and continuous ink paths', width => {
    const platform: Platform = { x: 93, y: 371, width, height: 18 };
    const { ctx, drawImage, stroke } = recorder();
    expect(drawPaintedWinterPlatform(ctx, platform, false, false, images)).toBe(true);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(stroke).toHaveBeenCalledTimes(2);
    const call = drawImage.mock.calls[0];
    expect(call[5]).toBeGreaterThan(platform.x);
    expect(call[5] + call[7]).toBeLessThan(platform.x + width + skewPx());
  });

  it('overscans the ground while keeping the collision geometry untouched', () => {
    const platform: Platform = { x: 0, y: 660, width: 1280, height: 60 };
    const { ctx, drawImage } = recorder();
    drawPaintedWinterPlatform(ctx, platform, true, false, images);
    const calls = drawImage.mock.calls;
    expect(calls[0][5]).toBe(-20);
    expect(calls[2][5] + calls[2][7]).toBeCloseTo(1280 + 20 + skewPx());
  });

  it.each([[40, 35], [65, 50], [90, 70]])('nine-slices an ice block at %i by %i', (width, height) => {
    const platform: Platform = { x: 222, y: 610, width, height, style: 'iceCube' };
    const { ctx, drawImage } = recorder();
    drawPaintedWinterPlatform(ctx, platform, false, false, images);
    expect(drawImage).toHaveBeenCalledTimes(9);
    const left = Math.min(...drawImage.mock.calls.map(call => call[5]));
    const right = Math.max(...drawImage.mock.calls.map(call => call[5] + call[7]));
    expect(left).toBe(222);
    expect(right).toBeCloseTo(222 + width * 1.3);
  });
});
