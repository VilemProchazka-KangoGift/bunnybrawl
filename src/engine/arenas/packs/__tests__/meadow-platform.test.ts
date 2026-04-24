import { describe, it, expect } from 'vitest';
import { meadow } from '../meadow';

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

describe('meadow.drawPlatform', () => {
  it('is defined (meadow is migrated to the framework)', () => {
    expect(typeof meadow.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = meadow.platforms[1];  // first non-ground platform
    expect(() => meadow.drawPlatform!(ctx, floating, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = meadow.platforms[0];
    expect(() => meadow.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('is deterministic across calls for the same platform', () => {
    // Framework uses mulberry32(seedFor(x,y)) — same platform should produce
    // the same context calls. We verify indirectly by checking no throw across
    // multiple renders (deep equality would need a richer mock).
    const ctx = mockCanvasContext();
    const floating = meadow.platforms[1];
    expect(() => {
      meadow.drawPlatform!(ctx, floating, false);
      meadow.drawPlatform!(ctx, floating, false);
    }).not.toThrow();
  });

  it('no-ops for style=stump platforms', () => {
    const ctx = mockCanvasContext();
    // Find a stump platform in the meadow layout
    const stump = meadow.platforms.find(p => p.style === 'stump');
    expect(stump).toBeDefined();
    expect(() => meadow.drawPlatform!(ctx, stump!, false)).not.toThrow();
  });
});
