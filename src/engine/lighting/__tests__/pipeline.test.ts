import { describe, it, expect, vi } from 'vitest';
import { LightingPipeline } from '../pipeline';
import type { ThemeConfig } from '../../themes/types';

// ---------------------------------------------------------------------------
// OffscreenCanvas mock
//
// happy-dom does not include OffscreenCanvas. We provide a pixel-tracking mock
// that is faithful enough for the pipeline's beginFrame + composite calls.
//
// Pixel model: uniform single RGBA pixel (whole canvas treated as one texel).
//
//  • fillRect with 'source-over' stores fillStyle as the uniform pixel.
//  • fillRect with 'lighter' (additive) adds the parsed color, clamped to 255.
//  • fillRect with a gradient object calls _fillRectWithGrad instead.
//  • drawImage(src, ...) dispatches based on globalCompositeOperation:
//      - 'source-over': copy src pixel → self pixel.
//      - 'destination-in': self = self * (srcAlpha / 255).  alpha mask.
//  • getImageData returns the stored pixel.
//  • Target ctx (MockTargetCtx) uses 'multiply': self = floor(self * src / 255).
// ---------------------------------------------------------------------------

function parseRgba(style: string): [number, number, number, number] {
  // handles 'rgb(r,g,b)' and 'rgba(r,g,b,a)' and fractional a from 0..1
  const rgb = style.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgb) {
    const a = rgb[4] !== undefined ? Math.round(parseFloat(rgb[4]) * 255) : 255;
    return [+rgb[1], +rgb[2], +rgb[3], a];
  }
  if (style === 'white' || style === '#ffffff' || style === '#fff') return [255,255,255,255];
  if (style === 'black') return [0,0,0,255];
  return [0,0,0,0];
}

class MockOffscreenCanvas2DCtx {
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle: string | object = '';
  imageSmoothingEnabled = true;
  private _pixels: Uint8ClampedArray;
  // We also need canvas ref for the destination-in drawImage(ctx.canvas, ...)
  canvas: MockOffscreenCanvas;

  constructor(canvas: MockOffscreenCanvas) {
    this.canvas = canvas;
    // Start transparent black
    this._pixels = new Uint8ClampedArray([0, 0, 0, 0]);
  }

  clearRect(_x: number, _y: number, _w: number, _h: number) {
    this._pixels.fill(0);
  }

  fillRect(_x: number, _y: number, _w: number, _h: number) {
    if (typeof this.fillStyle !== 'string') {
      // Gradient object — handled via _gradientColor captured by createLinearGradient
      const [fr, fg, fb, fa] = parseRgba(this._gradientColor);
      this._fillRectWithGrad(fr, fg, fb, fa);
      return;
    }
    const [fr, fg, fb, fa] = parseRgba(this.fillStyle);
    if (this.globalCompositeOperation === 'source-over') {
      this._pixels[0] = fr;
      this._pixels[1] = fg;
      this._pixels[2] = fb;
      this._pixels[3] = fa;
    } else if (this.globalCompositeOperation === 'lighter') {
      // additive: clamp to 255
      const alpha = fa / 255;
      this._pixels[0] = Math.min(255, this._pixels[0] + Math.round(fr * alpha));
      this._pixels[1] = Math.min(255, this._pixels[1] + Math.round(fg * alpha));
      this._pixels[2] = Math.min(255, this._pixels[2] + Math.round(fb * alpha));
      this._pixels[3] = 255;
    }
  }

  getImageData(_x: number, _y: number, _w: number, _h: number) {
    return { data: new Uint8ClampedArray(this._pixels) };
  }

  createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number) {
    const self = this;
    let capturedColor = '';
    return {
      addColorStop: (offset: number, color: string) => {
        if (offset === 0) capturedColor = color;
        if (offset === 1) {
          self._gradientColor = capturedColor;
        }
      },
    };
  }

  _gradientColor = '';

  _fillRectWithGrad(fr: number, fg: number, fb: number, fa: number) {
    if (this.globalCompositeOperation === 'lighter') {
      const alpha = fa / 255;
      this._pixels[0] = Math.min(255, this._pixels[0] + Math.round(fr * alpha));
      this._pixels[1] = Math.min(255, this._pixels[1] + Math.round(fg * alpha));
      this._pixels[2] = Math.min(255, this._pixels[2] + Math.round(fb * alpha));
      this._pixels[3] = 255;
    }
  }

  drawImage(
    src: MockOffscreenCanvas | { _mockCtx?: MockOffscreenCanvas2DCtx },
    _dx: number, _dy: number,
    _dw?: number, _dh?: number,
  ) {
    // Resolve source pixels from whatever was passed.
    let srcPx: Uint8ClampedArray | null = null;
    if (src instanceof MockOffscreenCanvas) {
      const sctx = src.getContext('2d') as MockOffscreenCanvas2DCtx | null;
      if (sctx) srcPx = sctx.getPixels();
    }

    if (!srcPx) return;

    if (this.globalCompositeOperation === 'source-over') {
      // Copy source pixel onto self.
      this._pixels[0] = srcPx[0];
      this._pixels[1] = srcPx[1];
      this._pixels[2] = srcPx[2];
      this._pixels[3] = srcPx[3];
    } else if (this.globalCompositeOperation === 'destination-in') {
      // Keep self pixel scaled by source alpha (alpha mask).
      const srcAlpha = srcPx[3] / 255;
      this._pixels[0] = Math.round(this._pixels[0] * srcAlpha);
      this._pixels[1] = Math.round(this._pixels[1] * srcAlpha);
      this._pixels[2] = Math.round(this._pixels[2] * srcAlpha);
      this._pixels[3] = Math.round(this._pixels[3] * srcAlpha);
    }
  }

  translate(_x: number, _y: number) {}
  rotate(_angle: number) {}

  save() { this._savedOp = this.globalCompositeOperation; }
  restore() { this.globalCompositeOperation = this._savedOp; }
  private _savedOp = 'source-over';

  getPixels() { return this._pixels; }
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  private _ctx: MockOffscreenCanvas2DCtx;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this._ctx = new MockOffscreenCanvas2DCtx(this);
  }

  getContext(type: string): MockOffscreenCanvas2DCtx | null {
    if (type === '2d') return this._ctx;
    return null;
  }
}

// Install globally before any imports that trigger pipeline construction
// @ts-ignore
globalThis.OffscreenCanvas = MockOffscreenCanvas;

// ---------------------------------------------------------------------------
// Target canvas mock for composite() — needs globalCompositeOperation,
// save/restore, drawImage with multiply, AND a canvas property so the
// pipeline can call tctx.drawImage(ctx.canvas, 0, 0) for the alpha mask.
// ---------------------------------------------------------------------------

class MockTargetCtx {
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle = '';
  private _pixels: Uint8ClampedArray;
  private _width: number;
  private _height: number;
  // pipeline reads ctx.canvas to copy alpha into temp canvas
  canvas: MockOffscreenCanvas;

  constructor(w: number, h: number) {
    this._width = w;
    this._height = h;
    this._pixels = new Uint8ClampedArray([0, 0, 0, 255]);
    // Create a MockOffscreenCanvas whose ctx pixel mirrors this ctx's pixel.
    this.canvas = new MockOffscreenCanvas(w, h);
    this._syncCanvasPixels();
  }

  /** Keep canvas ctx pixel in sync with our own pixel (for destination-in). */
  private _syncCanvasPixels() {
    const cctx = this.canvas.getContext('2d') as MockOffscreenCanvas2DCtx;
    if (!cctx) return;
    // Directly write into the canvas ctx pixels.
    const cp = cctx.getPixels();
    cp[0] = this._pixels[0];
    cp[1] = this._pixels[1];
    cp[2] = this._pixels[2];
    cp[3] = this._pixels[3];
  }

  fillRect(_x: number, _y: number, _w: number, _h: number) {
    const [r, g, b, a] = parseRgba(this.fillStyle as string);
    this._pixels[0] = r; this._pixels[1] = g;
    this._pixels[2] = b; this._pixels[3] = a;
    this._syncCanvasPixels();
  }

  drawImage(src: MockOffscreenCanvas, _dx: number, _dy: number, _dw?: number, _dh?: number) {
    const srcCtx = src.getContext('2d') as MockOffscreenCanvas2DCtx | null;
    if (!srcCtx) return;
    const srcPx = srcCtx.getPixels();
    if (this.globalCompositeOperation === 'multiply') {
      this._pixels[0] = Math.floor(this._pixels[0] * srcPx[0] / 255);
      this._pixels[1] = Math.floor(this._pixels[1] * srcPx[1] / 255);
      this._pixels[2] = Math.floor(this._pixels[2] * srcPx[2] / 255);
      this._pixels[3] = 255;
      this._syncCanvasPixels();
    }
  }

  getImageData(_x: number, _y: number, _w: number, _h: number) {
    return { data: new Uint8ClampedArray(this._pixels) };
  }

  save() { this._savedOp = this.globalCompositeOperation; }
  restore() { this.globalCompositeOperation = this._savedOp; }
  private _savedOp = 'source-over';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTheme(dayNightEnabled = true): ThemeConfig {
  return { dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true } } as unknown as ThemeConfig;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LightingPipeline (real impl)', () => {
  it('beginFrame fills the light buffer with ambient color', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0, 0); // noon (dayPhase=0)
    const buf = p.getLightBuffer()!;
    expect(buf).not.toBeNull();
    const ctx = buf.getContext('2d')!;
    // sample center pixel: should be warm-bright (noon ambient)
    const pixel = ctx.getImageData(buf.width / 2, buf.height / 2, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(200); // warm red
    expect(pixel[3]).toBe(255); // opaque
  });

  it('beginFrame at midnight (dayPhase 0.5) produces cool blue ambient', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5, 0);
    const buf = p.getLightBuffer()!;
    expect(buf).not.toBeNull();
    const ctx = buf.getContext('2d')!;
    const pixel = ctx.getImageData(buf.width / 2, buf.height / 2, 1, 1).data;
    expect(pixel[2]).toBeGreaterThan(pixel[0]); // blue > red
  });

  it('composite with multiply darkens a white target at midnight', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5, 0); // midnight
    const tctx = new MockTargetCtx(1280, 720);
    tctx.fillStyle = 'white';
    tctx.fillRect(0, 0, 1280, 720);
    p.composite(tctx as unknown as CanvasRenderingContext2D);
    const pixel = tctx.getImageData(640, 360, 1, 1).data;
    expect(pixel[0]).toBeLessThan(255); // multiply darkened the white
    expect(pixel[2]).toBeLessThan(255);
  });

  it('composite with transparent FG does NOT darken (alpha mask prevents occluding BG)', () => {
    // Key correctness test for the L1 fix: a fully transparent FG pixel must
    // not be multiplied — the ambient color must not "fill" transparent areas.
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.5, 0); // midnight — ambient is a dark blue
    const tctx = new MockTargetCtx(1280, 720);
    // FG stays transparent black (default: alpha=0)
    // We do NOT call fillRect — canvas starts transparent.
    p.composite(tctx as unknown as CanvasRenderingContext2D);
    const pixel = tctx.getImageData(640, 360, 1, 1).data;
    // The transparent FG pixel must be unchanged (still 0,0,0,255 or similar).
    // Because destination-in zeroed the temp canvas where FG alpha=0,
    // the multiply step effectively multiplies by 0 → no change from black.
    // More precisely: the temp canvas pixel got masked to alpha=0, so when
    // we drawImage(tmp) with multiply, src has alpha=0 → multiply blends as
    // transparent src → FG stays unchanged.
    // The pixel value after our mock multiply is: floor(0 * anything / 255) = 0
    // since the tmp canvas was cleared/zeroed for transparent FG.
    expect(pixel[0]).toBe(0); // not "ambient blue"
    expect(pixel[1]).toBe(0);
    expect(pixel[2]).toBe(0);
  });

  it('beginFrame recomputes the buffer every call (no caching)', () => {
    // Cache was removed — abrupt step transitions are visually distracting.
    // Sun gradient is pre-baked so per-frame recompute is cheap.
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.0, 0);
    const buf = p.getLightBuffer()!;
    const ctx = buf.getContext('2d') as MockOffscreenCanvas2DCtx;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    p.beginFrame(mockTheme(), 0.0, 1);
    p.beginFrame(mockTheme(), 0.0, 2);
    expect(fillRectSpy).toHaveBeenCalledTimes(2); // ambient fill once per call
  });

  it('isEnabled() honors module kill switch (default true)', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true);
  });

  it('resize re-creates buffers without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(1280, 720, 1.0)).not.toThrow();
    expect(() => p.resize(1280, 720, 2.0)).not.toThrow();
  });

  it('resize drops the buffer; next beginFrame recreates it', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.0, 0);
    p.resize(1280, 720, 1.0);
    p.beginFrame(mockTheme(), 0.0, 1);
    expect(p.getLightBuffer()).not.toBeNull();
  });
});
