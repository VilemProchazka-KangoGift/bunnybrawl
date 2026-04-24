import { describe, it, expect } from 'vitest';
import { waterfall } from '../waterfall';

function mockCanvasContext(): any {
  const noop = () => {};
  return new Proxy({
    save: noop, restore: noop,
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop,
    translate: noop, rotate: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    fillStyle: '', strokeStyle: '',
    lineWidth: 1, globalAlpha: 1,
    filter: 'none', shadowColor: '', shadowBlur: 0,
  }, { set(t, k, v) { (t as any)[k] = v; return true; } });
}

describe('waterfall.drawPlatform', () => {
  it('is defined (waterfall is migrated to the framework)', () => {
    expect(typeof waterfall.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = waterfall.platforms.find(p => p.y < 650 && p.width >= 100);
    expect(floating).toBeDefined();
    expect(() => waterfall.drawPlatform!(ctx, floating!, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = waterfall.platforms[0];
    expect(() => waterfall.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders the tiny 40-45×16 floating platforms without throwing', () => {
    const ctx = mockCanvasContext();
    const tiny = waterfall.platforms.find(p => p.width >= 40 && p.width <= 45 && p.height === 16);
    expect(tiny).toBeDefined();
    expect(() => waterfall.drawPlatform!(ctx, tiny!, false)).not.toThrow();
  });

  it('renders the small 48×48 stone-like platform without throwing', () => {
    const ctx = mockCanvasContext();
    const small = waterfall.platforms.find(p => p.width === 48 && p.height === 48);
    expect(small).toBeDefined();
    expect(() => waterfall.drawPlatform!(ctx, small!, false)).not.toThrow();
  });
});
