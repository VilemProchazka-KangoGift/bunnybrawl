import { describe, it, expect } from 'vitest';
import { underwater } from '../underwater';

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

describe('underwater.drawPlatform', () => {
  it('is defined (underwater is migrated to the framework)', () => {
    expect(typeof underwater.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = underwater.platforms.find(p => p.y < 650 && p.width >= 100);
    expect(floating).toBeDefined();
    expect(() => underwater.drawPlatform!(ctx, floating!, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = underwater.platforms[0];
    expect(() => underwater.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders the widest 200x24 floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const wide = underwater.platforms.find(p => p.x === 540 && p.y === 80 && p.width === 200 && p.height === 24);
    expect(wide).toBeDefined();
    expect(() => underwater.drawPlatform!(ctx, wide!, false)).not.toThrow();
  });
});
