import { describe, it, expect } from 'vitest';
import { volcano } from '../volcano';

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

describe('volcano.drawPlatform', () => {
  it('is defined (volcano is migrated to the framework)', () => {
    expect(typeof volcano.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = volcano.platforms.find(p => p.y < 650 && p.y > 100)!;
    expect(floating).toBeDefined();
    expect(() => volcano.drawPlatform!(ctx, floating, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = volcano.platforms[0];
    expect(() => volcano.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders the small 40×60 pillar platforms without throwing', () => {
    const ctx = mockCanvasContext();
    const pillar = volcano.platforms.find(p => p.width === 40 && p.height === 60);
    expect(pillar).toBeDefined();
    expect(() => volcano.drawPlatform!(ctx, pillar!, false)).not.toThrow();
  });
});
