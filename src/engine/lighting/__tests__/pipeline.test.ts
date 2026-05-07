import { describe, it, expect, vi } from 'vitest';
import { LightingPipeline } from '../pipeline';
import type { ThemeConfig } from '../../themes/types';

// ---------------------------------------------------------------------------
// OffscreenCanvas mock
//
// happy-dom does not include OffscreenCanvas. We provide a pixel-tracking mock
// that is just faithful enough for the pipeline's beginFrame + composite calls:
//
//  • fillRect with 'source-over' stores the current fillStyle as the uniform
//    pixel color (fill is always full-canvas for the pipeline).
//  • fillRect with 'lighter' (additive) adds the parsed color on top, clamped
//    to 255.
//  • fillRect with 'source-over' again resets the buffer (ambient base fill).
//  • getImageData returns that stored color.
//  • drawImage(src, 0,0,w,h) on the TARGET ctx with globalCompositeOperation
//    'multiply' computes newPixel = floor(target * src / 255).
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
  fillStyle: string = '';
  private _pixels: Uint8ClampedArray;
  private _width: number;
  private _height: number;

  constructor(w: number, h: number) {
    this._width = w;
    this._height = h;
    // Start transparent black
    this._pixels = new Uint8ClampedArray(4).fill(0);
  }

  fillRect(_x: number, _y: number, _w: number, _h: number) {
    // If fillStyle is a gradient object, skip — the gradient mock doesn't
    // produce pixel-level data; the ambient source-over fill is already stored.
    if (typeof this.fillStyle !== 'string') return;
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
    // Return a stub gradient whose addColorStop captures the last call's color
    // for 'lighter' fillRect below. We simplify: pipeline draws one gradient
    // fill with stop 0 = color, stop 1 = transparent. We capture stop 0.
    const self = this;
    let capturedColor = '';
    return {
      addColorStop: (offset: number, color: string) => {
        if (offset === 0) capturedColor = color;
        // After both stops are added, patch fillStyle so fillRect sees it
        if (offset === 1) {
          // keep capturedColor available to fillRect via fillStyle setter
          (self as any)._gradientColor = capturedColor;
        }
      },
    };
  }

  // fillStyle setter: when assigned a gradient object, resolve via _gradientColor
  private _gradientColor = '';
  // we use plain JS object so no real setter — pipeline assigns ctx.fillStyle = grad
  // We store it directly; fillRect checks if fillStyle is an object.
  // Instead of a real setter, we override fillRect to handle the object case:
  _fillRectWithGrad(fr: number, fg: number, fb: number, fa: number) {
    if (this.globalCompositeOperation === 'lighter') {
      const alpha = fa / 255;
      this._pixels[0] = Math.min(255, this._pixels[0] + Math.round(fr * alpha));
      this._pixels[1] = Math.min(255, this._pixels[1] + Math.round(fg * alpha));
      this._pixels[2] = Math.min(255, this._pixels[2] + Math.round(fb * alpha));
      this._pixels[3] = 255;
    }
  }

  drawImage(_src: MockOffscreenCanvas, _dx: number, _dy: number, _dw: number, _dh: number) {
    // no-op for the light buffer (pipeline doesn't draw onto itself)
  }

  save() {}
  restore() {}

  getPixels() { return this._pixels; }
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  private _ctx: MockOffscreenCanvas2DCtx;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this._ctx = new MockOffscreenCanvas2DCtx(w, h);
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
// Target canvas mock for composite() — also needs globalCompositeOperation +
// drawImage that performs multiply blend against the source pixels.
// ---------------------------------------------------------------------------

class MockTargetCtx {
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle = '';
  private _pixels: Uint8ClampedArray;
  private _width: number;
  private _height: number;

  constructor(w: number, h: number) {
    this._width = w;
    this._height = h;
    this._pixels = new Uint8ClampedArray([0, 0, 0, 255]);
  }

  fillRect(_x: number, _y: number, _w: number, _h: number) {
    const [r, g, b, a] = parseRgba(this.fillStyle as string);
    this._pixels[0] = r; this._pixels[1] = g;
    this._pixels[2] = b; this._pixels[3] = a;
  }

  drawImage(src: MockOffscreenCanvas, _dx: number, _dy: number, _dw: number, _dh: number) {
    const srcCtx = src.getContext('2d') as MockOffscreenCanvas2DCtx | null;
    if (!srcCtx) return;
    const srcPx = srcCtx.getPixels();
    if (this.globalCompositeOperation === 'multiply') {
      this._pixels[0] = Math.floor(this._pixels[0] * srcPx[0] / 255);
      this._pixels[1] = Math.floor(this._pixels[1] * srcPx[1] / 255);
      this._pixels[2] = Math.floor(this._pixels[2] * srcPx[2] / 255);
      this._pixels[3] = 255;
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

  it('isEnabled() honors module kill switch (default true)', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true);
  });

  it('resize re-creates buffers without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(1280, 720, 1.0)).not.toThrow();
    expect(() => p.resize(1280, 720, 2.0)).not.toThrow();
  });
});
