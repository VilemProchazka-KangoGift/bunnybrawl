import { describe, it, expect } from 'vitest';
import { spaceStation } from '../spaceStation';

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

describe('spaceStation.drawPlatform', () => {
  it('is defined (spaceStation is migrated to the framework)', () => {
    expect(typeof spaceStation.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = spaceStation.platforms[2];
    expect(() => spaceStation.drawPlatform!(ctx, floating, false)).not.toThrow();
  });

  it('renders a ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = spaceStation.platforms[0];
    expect(() => spaceStation.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders the small 50×35 stack platforms without throwing', () => {
    const ctx = mockCanvasContext();
    const small = spaceStation.platforms.find(p => p.height === 35);
    expect(small).toBeDefined();
    expect(() => spaceStation.drawPlatform!(ctx, small!, false)).not.toThrow();
  });
});
