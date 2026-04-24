import { describe, it, expect } from 'vitest';
import { castle } from '../castle';

function mockCanvasContext(): any {
  const noop = () => {};
  return new Proxy({
    save: noop, restore: noop,
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop,
    rect: noop,
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

describe('castle.drawPlatform', () => {
  it('is defined (castle is migrated to the framework)', () => {
    expect(typeof castle.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = castle.platforms.find(p => p.y < 650 && p.height === 24);
    expect(floating).toBeDefined();
    expect(() => castle.drawPlatform!(ctx, floating!, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = castle.platforms[0];
    expect(() => castle.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders the narrow 40-wide pillar/crenellation platforms without throwing', () => {
    const ctx = mockCanvasContext();
    const narrow = castle.platforms.find(p => p.width === 40);
    expect(narrow).toBeDefined();
    expect(() => castle.drawPlatform!(ctx, narrow!, false)).not.toThrow();
  });
});
