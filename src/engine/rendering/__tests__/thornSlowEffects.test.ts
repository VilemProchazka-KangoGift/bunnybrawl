import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawThornWash } from '../thornSlowEffects';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';

describe('thorn silhouette wash', () => {
  const masks: CanvasRenderingContext2D[] = [];
  beforeEach(() => {
    masks.length = 0;
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() { const ctx = createMockCanvasCtx(); masks.push(ctx); return ctx; }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reuses a mask for the same sprite but rebuilds for a new pose or scale', () => {
    const ctx = createMockCanvasCtx();
    const sprite = new OffscreenCanvas(48, 60);
    drawThornWash(ctx, sprite, 0, 0, 32, 40, 2, 0);
    drawThornWash(ctx, sprite, 0, 0, 32, 40, 1, 0);
    drawThornWash(ctx, new OffscreenCanvas(96, 120), 0, 0, 32, 40, 1, 0);
    expect(masks).toHaveLength(2);
    expect(masks[0].drawImage).toHaveBeenCalledTimes(1);
    expect(masks[1].fillRect).toHaveBeenCalledWith(0, 0, 96, 120);
    expect(masks[0].globalCompositeOperation).toBe('source-in');
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('retains parent blink and echo attenuation and restores opacity after drawing', () => {
    const ctx = createMockCanvasCtx();
    const sprite = new OffscreenCanvas(48, 60);
    const slow = 2;
    const fade = .7 + Math.sin(slow * 8) * .15;
    const alphas: number[] = [];
    vi.mocked(ctx.drawImage).mockImplementation(() => { alphas.push(ctx.globalAlpha); });
    ctx.globalAlpha = fade;
    drawThornWash(ctx, sprite, 0, 0, 32, 40, slow, 0);
    expect(ctx.globalAlpha).toBe(fade);
    ctx.globalAlpha = fade * .2;
    drawThornWash(ctx, sprite, 0, 0, 32, 40, slow, 0);
    expect(alphas[1] / alphas[0]).toBeCloseTo(.2);
    expect(ctx.globalAlpha).toBe(fade * .2);
  });

  it.each([[0, 0], [-1, 0], [2, 1]])('does not allocate or draw for slow=%s burn=%s', (slow, burn) => {
    const ctx = createMockCanvasCtx();
    drawThornWash(ctx, new OffscreenCanvas(48, 60), 0, 0, 32, 40, slow, burn);
    expect(masks).toHaveLength(0);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
