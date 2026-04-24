import { describe, it, expect } from 'vitest';
import { hauntedGraveyard } from '../hauntedGraveyard';

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
    lineCap: 'butt',
    filter: 'none', shadowColor: '', shadowBlur: 0,
  }, { set(t, k, v) { (t as any)[k] = v; return true; } });
}

describe('hauntedGraveyard.drawPlatform', () => {
  it('is defined (hauntedGraveyard is migrated to the framework)', () => {
    expect(typeof hauntedGraveyard.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = hauntedGraveyard.platforms.find(
      p => p.width >= 100 && p.y < 650,
    );
    expect(floating).toBeDefined();
    expect(() => hauntedGraveyard.drawPlatform!(ctx, floating!, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = hauntedGraveyard.platforms[0];
    expect(() => hauntedGraveyard.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('renders 35x35 tombstone-sized platforms via the framework', () => {
    const ctx = mockCanvasContext();
    const tombstone = hauntedGraveyard.platforms.find(
      p => p.width === 35 && p.height === 35,
    );
    expect(tombstone).toBeDefined();
    expect(() => hauntedGraveyard.drawPlatform!(ctx, tombstone!, false)).not.toThrow();
  });

  it('renders the giant 320x240 mausoleum platform without throwing', () => {
    const ctx = mockCanvasContext();
    const mausoleum = hauntedGraveyard.platforms.find(
      p => p.width === 320 && p.height === 240,
    );
    expect(mausoleum).toBeDefined();
    expect(() => hauntedGraveyard.drawPlatform!(ctx, mausoleum!, false)).not.toThrow();
  });
});
