import { describe, it, expect } from 'vitest';
import { rooftops } from '../rooftops';

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

describe('rooftops.drawPlatform', () => {
  it('is defined (rooftops is migrated to the framework)', () => {
    expect(typeof rooftops.drawPlatform).toBe('function');
  });

  it('every platform has a style tag', () => {
    for (const p of rooftops.platforms) {
      expect(p.style, `platform ${p.x},${p.y}`).toBeDefined();
    }
  });

  it('renders each distinct style without throwing', () => {
    const ctx = mockCanvasContext();
    const styles = ['roof', 'hallway', 'chimney', 'balcony', 'ac', 'hvac'] as const;
    for (const style of styles) {
      const plat = rooftops.platforms.find(p => p.style === style);
      expect(plat, `missing a ${style} platform`).toBeDefined();
      expect(() => rooftops.drawPlatform!(ctx, plat!, false)).not.toThrow();
    }
  });

  it('renders the huge 270×240 building block without throwing', () => {
    const ctx = mockCanvasContext();
    const huge = rooftops.platforms.find(p => p.width === 270 && p.height === 240);
    expect(huge).toBeDefined();
    expect(() => rooftops.drawPlatform!(ctx, huge!, false)).not.toThrow();
  });

  it('renders the tiny 28×36 chimney without throwing', () => {
    const ctx = mockCanvasContext();
    const chimney = rooftops.platforms.find(p => p.width === 28 && p.height === 36);
    expect(chimney).toBeDefined();
    expect(() => rooftops.drawPlatform!(ctx, chimney!, false)).not.toThrow();
  });
});
