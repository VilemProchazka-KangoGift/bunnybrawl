import { describe, it, expect, vi } from 'vitest';
import { fillBodyGradient, fillBodyGradientCircle, drawHighlightSpot } from './spriteShading';
import type { BodyEllipseParams } from './spriteShading';

// ---- Canvas mock ----

function makeMockGradient() {
  return {
    addColorStop: vi.fn(),
  };
}

function makeMockCtx() {
  const gradient = makeMockGradient();
  return {
    createRadialGradient: vi.fn(() => gradient),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '' as string | CanvasGradient,
    _gradient: gradient,
  } as any;
}

const testChar = {
  color: '#FF8800',
  darkColor: '#884400',
  lightColor: '#FFCC88',
};

const testParams: BodyEllipseParams = {
  cx: 100, cy: 200, rx: 20, ry: 30,
};

describe('fillBodyGradient', () => {
  it('creates a radial gradient with correct center offsets', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, testParams, testChar);

    expect(ctx.createRadialGradient).toHaveBeenCalledWith(
      testParams.cx - testParams.rx * 0.25,  // highlight offset left
      testParams.cy - testParams.ry * 0.3,    // highlight offset up
      Math.max(testParams.rx, testParams.ry) * 0.05, // inner radius
      testParams.cx,
      testParams.cy,
      Math.max(testParams.rx, testParams.ry), // outer radius
    );
  });

  it('adds 3 color stops to gradient', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, testParams, testChar);
    expect(ctx._gradient.addColorStop).toHaveBeenCalledTimes(3);
    expect(ctx._gradient.addColorStop).toHaveBeenCalledWith(0, testChar.lightColor);
    expect(ctx._gradient.addColorStop).toHaveBeenCalledWith(0.5, testChar.color);
    // Third stop is blended edge color
    expect(ctx._gradient.addColorStop).toHaveBeenCalledWith(1, expect.stringMatching(/^rgb\(/));
  });

  it('draws an ellipse with the correct params', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, testParams, testChar);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.ellipse).toHaveBeenCalledWith(
      testParams.cx, testParams.cy, testParams.rx, testParams.ry,
      0, 0, Math.PI * 2,
    );
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('restores fillStyle to char.color after drawing', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, testParams, testChar);
    expect(ctx.fillStyle).toBe(testChar.color);
  });

  it('blends edge color 30% toward darkColor', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, testParams, testChar);
    const edgeColor = ctx._gradient.addColorStop.mock.calls[2][1];
    // Edge should be between color and darkColor, not equal to either
    expect(edgeColor).not.toBe(testChar.color);
    expect(edgeColor).not.toBe(testChar.darkColor);
    expect(edgeColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it('handles equal rx/ry', () => {
    const ctx = makeMockCtx();
    fillBodyGradient(ctx, { cx: 50, cy: 50, rx: 15, ry: 15 }, testChar);
    expect(ctx.createRadialGradient).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });
});

describe('fillBodyGradientCircle', () => {
  it('creates a radial gradient with correct parameters', () => {
    const ctx = makeMockCtx();
    fillBodyGradientCircle(ctx, 50, 60, 20, testChar);
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(
      50 - 20 * 0.25, 60 - 20 * 0.3, 20 * 0.05,
      50, 60, 20,
    );
  });

  it('adds 3 color stops', () => {
    const ctx = makeMockCtx();
    fillBodyGradientCircle(ctx, 50, 60, 20, testChar);
    expect(ctx._gradient.addColorStop).toHaveBeenCalledTimes(3);
  });

  it('draws an arc (circle) not an ellipse', () => {
    const ctx = makeMockCtx();
    fillBodyGradientCircle(ctx, 50, 60, 20, testChar);
    expect(ctx.arc).toHaveBeenCalledWith(50, 60, 20, 0, Math.PI * 2);
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });

  it('fills the circle', () => {
    const ctx = makeMockCtx();
    fillBodyGradientCircle(ctx, 50, 60, 20, testChar);
    expect(ctx.fill).toHaveBeenCalled();
  });
});

describe('drawHighlightSpot', () => {
  it('creates a radial gradient at the highlight position', () => {
    const ctx = makeMockCtx();
    drawHighlightSpot(ctx, testParams);
    const hx = testParams.cx - testParams.rx * 0.3;
    const hy = testParams.cy - testParams.ry * 0.35;
    const hr = Math.max(testParams.rx, testParams.ry) * 0.25;
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(hx, hy, 0, hx, hy, hr);
  });

  it('adds 3 white alpha stops', () => {
    const ctx = makeMockCtx();
    drawHighlightSpot(ctx, testParams);
    const calls = ctx._gradient.addColorStop.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][1]).toContain('0.18');
    expect(calls[1][1]).toContain('0.05');
    expect(calls[2][1]).toContain(' 0)');
  });

  it('draws a rotated ellipse for the highlight', () => {
    const ctx = makeMockCtx();
    drawHighlightSpot(ctx, testParams);
    expect(ctx.ellipse).toHaveBeenCalled();
    const ellipseCall = ctx.ellipse.mock.calls[0];
    // Rotation should be -0.3
    expect(ellipseCall[4]).toBeCloseTo(-0.3);
  });

  it('fills the highlight', () => {
    const ctx = makeMockCtx();
    drawHighlightSpot(ctx, testParams);
    expect(ctx.fill).toHaveBeenCalled();
  });
});
