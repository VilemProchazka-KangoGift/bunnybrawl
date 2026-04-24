import { describe, it, expect } from 'vitest';
import { treetops } from '../treetops';

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

describe('treetops.drawPlatform', () => {
  it('is defined (treetops is migrated to the framework)', () => {
    expect(typeof treetops.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = treetops.platforms.find(p => p.y < 650 && p.width >= 100);
    expect(floating).toBeDefined();
    expect(() => treetops.drawPlatform!(ctx, floating!, false)).not.toThrow();
  });

  it('renders the smallest branch platform', () => {
    const ctx = mockCanvasContext();
    const branch = treetops.platforms.find(p => p.width === 50 && p.height === 20);
    expect(branch).toBeDefined();
    expect(() => treetops.drawPlatform!(ctx, branch!, false)).not.toThrow();
  });
});
