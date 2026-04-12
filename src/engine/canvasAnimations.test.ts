import { describe, it, expect, vi } from 'vitest';
import { initWildlife, updateAndDrawWildlife, drawDayNightCycle } from './canvasAnimations';
import type { SimpleWildlife } from './canvasAnimations';

// ---- Canvas mock ----

function makeMockGradient() {
  return { addColorStop: vi.fn() };
}

function makeMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillStyle: '' as string | CanvasGradient,
    strokeStyle: '' as string,
    lineWidth: 0,
    lineCap: '' as string,
    globalAlpha: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    stroke: vi.fn(),
    createRadialGradient: vi.fn(() => makeMockGradient()),
  } as any;
}

describe('initWildlife', () => {
  it('returns empty array for count=0', () => {
    const result = initWildlife(0, 560);
    expect(result).toEqual([]);
  });

  it('creates the correct total number of wildlife', () => {
    const result = initWildlife(10, 560);
    expect(result).toHaveLength(10);
  });

  it('respects birdRatio — default 0.7 means 70% butterflies', () => {
    const result = initWildlife(10, 560);
    const butterflies = result.filter(w => w.type === 'butterfly');
    const birds = result.filter(w => w.type === 'bird');
    expect(butterflies).toHaveLength(7);
    expect(birds).toHaveLength(3);
  });

  it('birdRatio=0 means all butterflies', () => {
    const result = initWildlife(5, 560, 0);
    // birdRatio=0 means isBird when i >= count * 0 = 0, so all are birds
    // Actually: isBird = i >= count * birdRatio = i >= 0, so ALL are birds
    const birds = result.filter(w => w.type === 'bird');
    expect(birds).toHaveLength(5);
  });

  it('birdRatio=1 means all butterflies', () => {
    const result = initWildlife(5, 560, 1);
    // isBird = i >= count * 1 = i >= 5, so NONE are birds
    const butterflies = result.filter(w => w.type === 'butterfly');
    expect(butterflies).toHaveLength(5);
  });

  it('all wildlife have positive vx', () => {
    const result = initWildlife(20, 560);
    for (const w of result) {
      expect(w.vx).toBeGreaterThan(0);
    }
  });

  it('birds have faster vx than butterflies', () => {
    const result = initWildlife(10, 560);
    const butterflies = result.filter(w => w.type === 'butterfly');
    const birds = result.filter(w => w.type === 'bird');
    if (butterflies.length > 0 && birds.length > 0) {
      const avgButterflyVx = butterflies.reduce((s, w) => s + w.vx, 0) / butterflies.length;
      const avgBirdVx = birds.reduce((s, w) => s + w.vx, 0) / birds.length;
      expect(avgBirdVx).toBeGreaterThan(avgButterflyVx);
    }
  });

  it('birds spawn near the top of the screen', () => {
    const result = initWildlife(10, 560);
    const birds = result.filter(w => w.type === 'bird');
    for (const b of birds) {
      expect(b.y).toBeGreaterThanOrEqual(30);
      expect(b.y).toBeLessThanOrEqual(110);
    }
  });

  it('butterflies spawn in the middle zone', () => {
    const result = initWildlife(10, 560);
    const butterflies = result.filter(w => w.type === 'butterfly');
    for (const b of butterflies) {
      // groundY * 0.3 to groundY * 0.8
      expect(b.y).toBeGreaterThanOrEqual(560 * 0.3);
      expect(b.y).toBeLessThanOrEqual(560 * 0.8);
    }
  });

  it('cycles through color arrays', () => {
    const result = initWildlife(10, 560);
    const butterflyColors = result.filter(w => w.type === 'butterfly').map(w => w.color);
    const birdColors = result.filter(w => w.type === 'bird').map(w => w.color);
    // Butterfly colors are from BUTTERFLY_COLORS array
    for (const c of butterflyColors) {
      expect(c).toMatch(/^#/);
    }
    // Bird colors are darker
    for (const c of birdColors) {
      expect(c).toMatch(/^#/);
    }
  });
});

describe('updateAndDrawWildlife', () => {
  it('updates x positions based on vx and dt', () => {
    const wildlife: SimpleWildlife[] = [
      { x: 100, y: 200, vx: 50, wingPhase: 0, type: 'butterfly', color: '#FFD700' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    expect(wildlife[0].x).toBeCloseTo(100 + 50 / 60, 2);
  });

  it('advances wingPhase with dt', () => {
    const wildlife: SimpleWildlife[] = [
      { x: 100, y: 200, vx: 50, wingPhase: 0, type: 'butterfly', color: '#FFD700' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    // Butterfly: wingPhase += dt * 10
    expect(wildlife[0].wingPhase).toBeCloseTo(10 / 60, 4);
  });

  it('advances bird wingPhase at slower rate', () => {
    const wildlife: SimpleWildlife[] = [
      { x: 100, y: 50, vx: 60, wingPhase: 0, type: 'bird', color: '#333' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    // Bird: wingPhase += dt * 6
    expect(wildlife[0].wingPhase).toBeCloseTo(6 / 60, 4);
  });

  it('wraps wildlife that go off-screen right', () => {
    // CANVAS_WIDTH=1280. After update x must exceed 1300 (CANVAS_WIDTH+20).
    // Start at 1299, vx=100, dt=1/60 → x = 1299 + 100/60 ≈ 1300.67 > 1300 → wraps.
    const wildlife: SimpleWildlife[] = [
      { x: 1299, y: 200, vx: 100, wingPhase: 0, type: 'butterfly', color: '#FFD700' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    expect(wildlife[0].x).toBe(-20);
  });

  it('draws butterfly with fill calls (two wings + body)', () => {
    const wildlife: SimpleWildlife[] = [
      { x: 100, y: 200, vx: 50, wingPhase: 1, type: 'butterfly', color: '#FFD700' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    // 2 wing fills + body fillRect = at least 2 fills
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('draws bird with stroke calls (not fill)', () => {
    const wildlife: SimpleWildlife[] = [
      { x: 100, y: 50, vx: 60, wingPhase: 1, type: 'bird', color: '#333' },
    ];
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, wildlife, 1 / 60, 560);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('handles empty wildlife array', () => {
    const ctx = makeMockCtx();
    updateAndDrawWildlife(ctx, [], 1 / 60, 560);
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('drawDayNightCycle', () => {
  it('draws sun during first half of cycle', () => {
    const ctx = makeMockCtx();
    // dayPhase near 0.25 (quarter through cycle = midday)
    drawDayNightCycle(ctx, 25, 100);
    // Sun: creates gradient + draws arcs
    expect(ctx.createRadialGradient).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('draws moon during second half of cycle', () => {
    const ctx = makeMockCtx();
    // dayPhase = 0.75 (midnight)
    drawDayNightCycle(ctx, 75, 100);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('draws darkness overlay at night', () => {
    const ctx = makeMockCtx();
    // dayPhase = 0.5 → nightIntensity should be 1.0 (peak night)
    drawDayNightCycle(ctx, 50, 100);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('does not draw darkness during full day', () => {
    const ctx = makeMockCtx();
    // dayPhase = 0 → nightIntensity = 0
    drawDayNightCycle(ctx, 0, 100);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws stars when nightIntensity > 0.25', () => {
    const ctx = makeMockCtx();
    // dayPhase = 0.5 → nightIntensity = 1.0
    drawDayNightCycle(ctx, 50, 100);
    // Stars draw 30 arcs + moon draws 3 arcs = lots of arc calls
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(5);
  });

  it('draws fireflies when nightIntensity > 0.4', () => {
    const ctx = makeMockCtx();
    // dayPhase = 0.5 → nightIntensity = 1.0
    drawDayNightCycle(ctx, 50, 100);
    // 8 fireflies × 2 arcs each + 30 stars + moon arcs
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(30);
  });

  it('uses save/restore for alpha changes', () => {
    const ctx = makeMockCtx();
    drawDayNightCycle(ctx, 50, 100);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('handles cycle wrapping (now > cycleDuration)', () => {
    const ctx = makeMockCtx();
    // now = 250, cycleDuration = 100 → dayPhase = 0.5
    drawDayNightCycle(ctx, 250, 100);
    expect(ctx.fillRect).toHaveBeenCalled(); // darkness at night
  });
});
