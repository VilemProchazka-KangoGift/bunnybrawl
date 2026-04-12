import { describe, it, expect, vi } from 'vitest';
import { fallbackSpriteRenderer, fallbackGibRenderer } from './fallbacks';

function makeMockCtx() {
  return {
    fillStyle: '' as string,
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as any;
}

const testColors = {
  color: '#FF0000',
  darkColor: '#880000',
  lightColor: '#FF8888',
};

describe('fallbackSpriteRenderer', () => {
  it('draws a body ellipse and head circle', () => {
    const ctx = makeMockCtx();
    fallbackSpriteRenderer(ctx, 100, 50, 32, 40, 'idle', 0, false, 0, testColors);
    // Body: ellipse call
    expect(ctx.ellipse).toHaveBeenCalledWith(
      100, 50 + 40 * 0.55, 32 * 0.4, 40 * 0.4, 0, 0, Math.PI * 2,
    );
    // Head: arc call
    expect(ctx.arc).toHaveBeenCalledWith(
      100, 50 + 40 * 0.25, 32 * 0.3, 0, Math.PI * 2,
    );
  });

  it('sets fillStyle to character color', () => {
    const ctx = makeMockCtx();
    fallbackSpriteRenderer(ctx, 100, 50, 32, 40, 'idle', 0, false, 0, testColors);
    expect(ctx.fillStyle).toBe(testColors.color);
  });

  it('calls fill twice (body + head)', () => {
    const ctx = makeMockCtx();
    fallbackSpriteRenderer(ctx, 100, 50, 32, 40, 'idle', 0, false, 0, testColors);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('calls beginPath before each shape', () => {
    const ctx = makeMockCtx();
    fallbackSpriteRenderer(ctx, 100, 50, 32, 40, 'idle', 0, false, 0, testColors);
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
  });

  it('works with different states (airborne)', () => {
    const ctx = makeMockCtx();
    fallbackSpriteRenderer(ctx, 50, 30, 24, 32, 'airborne', 5, false, 0, testColors);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('works with different color schemes', () => {
    const ctx = makeMockCtx();
    const blueColors = { color: '#0000FF', darkColor: '#000088', lightColor: '#8888FF' };
    fallbackSpriteRenderer(ctx, 100, 50, 32, 40, 'idle', 0, false, 0, blueColors);
    expect(ctx.fillStyle).toBe('#0000FF');
  });
});

describe('fallbackGibRenderer', () => {
  it('draws a colored oval', () => {
    const ctx = makeMockCtx();
    fallbackGibRenderer(ctx, 'ear', 10, 8, testColors);
    expect(ctx.ellipse).toHaveBeenCalledWith(0, 0, 5, 4, 0, 0, Math.PI * 2);
  });

  it('sets fillStyle to character color', () => {
    const ctx = makeMockCtx();
    fallbackGibRenderer(ctx, 'ear', 10, 8, testColors);
    expect(ctx.fillStyle).toBe(testColors.color);
  });

  it('calls beginPath and fill', () => {
    const ctx = makeMockCtx();
    fallbackGibRenderer(ctx, 'tail', 12, 6, testColors);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('handles different gib types uniformly', () => {
    const ctx = makeMockCtx();
    for (const type of ['ear', 'tail', 'horn', 'foot']) {
      ctx.fill.mockClear();
      fallbackGibRenderer(ctx, type, 10, 8, testColors);
      expect(ctx.fill).toHaveBeenCalledTimes(1);
    }
  });

  it('uses half dimensions for ellipse radii', () => {
    const ctx = makeMockCtx();
    fallbackGibRenderer(ctx, 'ear', 20, 16, testColors);
    expect(ctx.ellipse).toHaveBeenCalledWith(0, 0, 10, 8, 0, 0, Math.PI * 2);
  });
});
