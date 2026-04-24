import { describe, it, expect } from 'vitest';
import { winterLake } from '../winterLake';

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

describe('winterLake.drawPlatform', () => {
  it('is defined (winterLake is migrated to the framework)', () => {
    expect(typeof winterLake.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = winterLake.platforms[1];
    expect(() => winterLake.drawPlatform!(ctx, floating, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = winterLake.platforms[0];
    expect(() => winterLake.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders iceCube platforms via the framework', () => {
    const ctx = mockCanvasContext();
    const iceCube = winterLake.platforms.find(p => p.style === 'iceCube');
    expect(iceCube).toBeDefined();
    expect(() => winterLake.drawPlatform!(ctx, iceCube!, false)).not.toThrow();
  });

  it('renders the narrow 40×18 floating platforms without throwing', () => {
    const ctx = mockCanvasContext();
    const tiny = winterLake.platforms.find(p => p.width === 40 && p.height === 18);
    expect(tiny).toBeDefined();
    expect(() => winterLake.drawPlatform!(ctx, tiny!, false)).not.toThrow();
  });
});
