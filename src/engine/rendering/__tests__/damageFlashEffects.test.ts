import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawDamageSilhouette, damageFlashAlpha } from '../damageFlashEffects';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';
const player = { damageFlashTimer: .3, damageFlashSide: 'left' as const, burnTimer: 0, slowTimer: 0 };
describe('red damage silhouette', () => {
  let builds = 0;
  beforeEach(() => { builds = 0; vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { builds++; return createMockCanvasCtx(); }
  }); });
  afterEach(() => vi.unstubAllGlobals());
  it('caches per sprite and preserves inherited opacity', () => {
    const sprite = new OffscreenCanvas(96, 96), ctx = createMockCanvasCtx();
    const alphas: number[] = [];
    vi.mocked(ctx.drawImage).mockImplementation(() => { alphas.push(ctx.globalAlpha); });
    ctx.globalAlpha = .2;
    drawDamageSilhouette(ctx, sprite, 0, 0, 32, 32, player);
    drawDamageSilhouette(ctx, sprite, 0, 0, 32, 32, { ...player, damageFlashSide: 'right' });
    expect(builds).toBe(1);
    expect(alphas).toHaveLength(2);
    for (const alpha of alphas) expect(alpha).toBeCloseTo(.156);
    expect(ctx.globalAlpha).toBe(.2);
    drawDamageSilhouette(ctx, new OffscreenCanvas(192, 192), 0, 0, 32, 32, player);
    expect(builds).toBe(2);
  });
  it('suppresses burning, expired timers and absent hit direction before allocating', () => {
    const ctx = createMockCanvasCtx(), sprite = new OffscreenCanvas(96, 96);
    for (const override of [{ burnTimer: 1 }, { damageFlashTimer: 0 }, { damageFlashSide: null }]) {
      drawDamageSilhouette(ctx, sprite, 0, 0, 32, 32, { ...player, ...override });
    }
    expect(builds).toBe(0);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(damageFlashAlpha({ ...player, damageFlashTimer: .05 })).toBe(.2);
  });
});
