import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LightingPipeline } from '../pipeline';
import { initLighting } from '../index';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled = true): ThemeConfig {
  return {
    dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true },
  } as unknown as ThemeConfig;
}

/** Minimal ctx stub matching the surface composite() touches. */
function makeCtx(): {
  ctx: CanvasRenderingContext2D;
  fills: Array<{ style: string; gco: string; w: number; h: number }>;
} {
  const fills: Array<{ style: string; gco: string; w: number; h: number }> = [];
  const ctx = {
    save: () => {},
    restore: () => {},
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fillRect(_x: number, _y: number, w: number, h: number) {
      fills.push({
        style: this.fillStyle as string,
        gco: this.globalCompositeOperation,
        w,
        h,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}

describe('LightingPipeline (L1 minimal source-over tint)', () => {
  beforeEach(() => {
    // Force-enable. Empty searchString won't reset a previously-set emitter
    // because initLighting only reads URL/storage; '?lighting=on' explicitly sets.
    initLighting('?lighting=on');
  });

  it('constructs without touching OffscreenCanvas', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p).toBeDefined();
    expect(p.isEnabled()).toBe(true);
  });

  it('beginFrame at noon produces near-zero tint alpha', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0);
    // At noon ambient is rgb(245,240,225); avg ~237; deficit ~0.07; alpha ~0.05.
    expect(p._getTintAlphaForTest()).toBeLessThan(0.1);
  });

  it('beginFrame at midnight produces visible tint alpha', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5);
    // At midnight ambient is rgb(60,70,110); avg 80; deficit ~0.69; alpha ~0.48.
    expect(p._getTintAlphaForTest()).toBeGreaterThan(0.3);
  });

  it('beginFrame at sunset produces intermediate tint alpha', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0); // noon
    const noon = p._getTintAlphaForTest();
    p.beginFrame(mockTheme(), 0.25); // sunset
    const sunset = p._getTintAlphaForTest();
    p.beginFrame(mockTheme(), 0.5); // midnight
    const midnight = p._getTintAlphaForTest();
    expect(sunset).toBeGreaterThan(noon);
    expect(sunset).toBeLessThan(midnight);
  });

  it('composite at noon emits one fillRect with small noon-shaded alpha', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    expect(fills).toHaveLength(1);
    expect(fills[0].gco).toBe('source-over');
    expect(fills[0].w).toBe(1280);
    expect(fills[0].h).toBe(720);
    expect(fills[0].style).toContain('rgba(20,24,48,');
    expect(p._getTintAlphaForTest()).toBeGreaterThan(0.01);
    expect(p._getTintAlphaForTest()).toBeLessThan(0.1);
  });

  it('composite at midnight applies one source-over fillRect', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    expect(fills).toHaveLength(1);
    expect(fills[0].gco).toBe('source-over');
    expect(fills[0].w).toBe(1280);
    expect(fills[0].h).toBe(720);
    expect(fills[0].style).toContain('rgba(20,24,48,');
  });

  it('composite is no-op when lighting kill switch is set', () => {
    initLighting('?lighting=off');
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    expect(fills).toHaveLength(0);
  });

  it('dayNight.enabled === false returns fixed mid-bright ambient → consistent tint', () => {
    const fixed = mockTheme(false);
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(fixed, 0);
    const a = p._getTintAlphaForTest();
    p.beginFrame(fixed, 0.5);
    const b = p._getTintAlphaForTest();
    expect(a).toBe(b); // no day-phase variation
  });

  it('resize updates dimensions used in fillRect', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5);
    p.resize(800, 600, 1.0);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    expect(fills[0].w).toBe(800);
    expect(fills[0].h).toBe(600);
  });

  it('setHasDomDarkening(true) makes composite a no-op even at midnight', () => {
    const p = new LightingPipeline(1280, 720);
    p.setHasDomDarkening(true);
    p.beginFrame(mockTheme(), 0.5);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    expect(fills).toHaveLength(0);
  });

  it('getBgNightOpacity is 0 when lighting is off, regardless of dayPhase', () => {
    initLighting('?lighting=off');
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0);
    expect(p.getBgNightOpacity()).toBe(0);
    p.beginFrame(mockTheme(), 0.5);
    expect(p.getBgNightOpacity()).toBe(0);
  });

  it('getBgNightOpacity ramps from near-zero at noon to ~1 at midnight', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0);
    const noon = p.getBgNightOpacity();
    p.beginFrame(mockTheme(), 0.5);
    const midnight = p.getBgNightOpacity();
    expect(noon).toBeLessThan(0.2);
    expect(midnight).toBeGreaterThan(0.8);
    expect(midnight).toBeLessThanOrEqual(1);
  });

  it('NaN dayPhase falls through gracefully (no NaN cascade in fillStyle)', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), Number.NaN);
    // Whatever tintAlpha the pipeline picks, it MUST be finite — otherwise
    // composite emits `rgba(...,NaN)` which is an invalid color string.
    expect(Number.isFinite(p._getTintAlphaForTest())).toBe(true);
    expect(Number.isFinite(p.getBgNightOpacity())).toBe(true);
    const { ctx, fills } = makeCtx();
    p.composite(ctx);
    for (const f of fills) {
      expect(f.style).not.toContain('NaN');
    }
  });

  it('beginFrame is cheap — no allocations for the buffer or temp canvases', () => {
    // Spy on OffscreenCanvas constructor; should NEVER be called by the pipeline.
    if (typeof globalThis.OffscreenCanvas === 'undefined') {
      // Test env without OffscreenCanvas — trivially passes.
      return;
    }
    const Original = globalThis.OffscreenCanvas;
    const spy = vi.fn((w: number, h: number) => new Original(w, h));
    globalThis.OffscreenCanvas = spy as unknown as typeof OffscreenCanvas;
    try {
      const p = new LightingPipeline(1280, 720);
      p.beginFrame(mockTheme(), 0.0);
      p.beginFrame(mockTheme(), 0.5);
      const { ctx } = makeCtx();
      p.composite(ctx);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      globalThis.OffscreenCanvas = Original;
    }
  });
});
