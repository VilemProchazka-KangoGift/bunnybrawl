// src/engine/lighting/pipeline.ts
//
// LightingPipeline — Carrot Royale's deferred-lite lighting (M1 Foundation).
// Half-res light buffer (0.5×) accumulates ambient + directional sun. Composited
// onto the foreground canvas via multiply blend just before HUD draws.
//
// Architecture lesson chain (rim-light → outlines → here): lighting is per-frame,
// screen-space, post–sprite-cache. Never bake into a sprite cache.
//
// Buffer is lazily created on first beginFrame() to avoid touching OffscreenCanvas
// in environments that lack it (JSDOM unit tests).
//
// Perf:
//  - Sun gradient baked to a 1×64 strip once per unique (color, intensity), then
//    blitted with rotation. Eliminates per-frame full-buffer createLinearGradient
//    evaluation (engine/CLAUDE.md: "catastrophic at 1280×720").
//
// Composite strategy:
//  - composite() does TWO passes onto the FG ctx:
//      1. destination-over with BG canvas — fills FG's transparent regions
//         (sky) with the BG content. After this pass FG is fully opaque.
//      2. multiply with the light buffer — uniform scene-wide lighting.
//  - Result: sky + hills + platforms + characters all multiply correctly. No
//    halos around anti-aliased sprite edges (masking via destination-in
//    produced asymmetric multiply on partial-alpha pixels).
//  - The BG canvas is still rendered separately (splat-on-bg optimization
//    preserved), it's just consumed each frame as a destination-over fill.

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { buildSunLight } from './sun';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

const HALF_RES_SCALE = 0.5;

export class LightingPipeline {
  private width: number;
  private height: number;
  private bufW: number;
  private bufH: number;
  private lightBuffer: OffscreenCanvas | null = null;
  private lightCtx: OffscreenCanvasRenderingContext2D | null = null;

  // ── BG canvas reference, set by Renderer; consumed in composite() to fill
  // FG's transparent regions before multiply. ──
  private bgCanvas: HTMLCanvasElement | null = null;

  // ── Sun gradient strip cache (color/intensity-keyed; see getSunStrip). ──
  private cachedStrip: OffscreenCanvas | null = null;
  private cachedStripKey = '';

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bufW = Math.ceil(width * HALF_RES_SCALE);
    this.bufH = Math.ceil(height * HALF_RES_SCALE);
    // Buffer creation deferred to first beginFrame() — see ensureBuffer().
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Lazy half-res light buffer. Returns false if OffscreenCanvas is unavailable. */
  private ensureBuffer(): boolean {
    if (this.lightBuffer !== null) return true;
    if (typeof OffscreenCanvas === 'undefined') return false;
    this.lightBuffer = new OffscreenCanvas(this.bufW, this.bufH);
    this.lightCtx = this.lightBuffer.getContext('2d');
    return this.lightCtx !== null;
  }

  /**
   * Returns (or bakes) a 1×64 vertical strip encoding the sun gradient:
   * stop 0 → full color at intensity * 0.5 alpha; stop 1 → transparent.
   * Keyed by color + rounded intensity — only rebaked when sun color/intensity
   * changes (negligible frequency).
   */
  private getSunStrip(color: RGB, intensity: number): OffscreenCanvas | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const key = `${color.r},${color.g},${color.b},${Math.round(intensity * 100)}`;
    if (this.cachedStrip !== null && this.cachedStripKey === key) {
      return this.cachedStrip;
    }
    if (this.cachedStrip === null) {
      this.cachedStrip = new OffscreenCanvas(1, 64);
    }
    const sctx = this.cachedStrip.getContext('2d')!;
    const grad = sctx.createLinearGradient(0, 0, 0, 64);
    const a = intensity * 0.5;
    grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${a})`);
    grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 1, 64);
    this.cachedStripKey = key;
    return this.cachedStrip;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Reset the light buffer to ambient and additively accumulate sun. Run at the
   * top of renderFrame so the buffer is ready when composite() is called.
   *
   * Recomputed every frame for smooth dayPhase transitions. The work is cheap:
   * a single fillRect on a 640×360 buffer plus one rotated drawImage of the
   * pre-baked sun strip.
   */
  beginFrame(theme: ThemeConfig, dayPhase: number, _tick: number): void {
    if (!this.isEnabled()) return;
    if (!this.ensureBuffer()) return;

    const photosensitivity = getPhotosensitivity();
    const ctx = this.lightCtx!;

    // 1. Fill with ambient (source-over, fully opaque).
    const ambient = themeToAmbient(theme, dayPhase, photosensitivity);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${ambient.r},${ambient.g},${ambient.b})`;
    ctx.fillRect(0, 0, this.bufW, this.bufH);

    // 2. Add directional sun (lighter / additive).
    const sun = buildSunLight(theme, dayPhase, photosensitivity);
    if (sun !== null && sun.intensity > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      this.drawSunGradient(ctx, sun.angle, sun.color, sun.intensity);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Apply lighting to the FG ctx in two passes:
   *   1. destination-over with BG canvas — fills FG's transparent regions
   *      (sky) so the canvas is fully opaque before multiply.
   *   2. multiply with the light buffer — uniform scene-wide darkening/tinting.
   *
   * The destination-over pass requires `setBgCanvas(...)` to have been called
   * during Renderer construction. Without it, the multiply still runs but the
   * sky region (transparent FG) gets filled with opaque ambient color and
   * occludes the BG canvas behind. setBgCanvas is a one-time wire-up.
   */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    if (this.lightBuffer === null) return; // buffer never created (e.g. JSDOM)

    const w = this.width;
    const h = this.height;

    ctx.save();

    // Pass 1: fill FG's transparent regions with BG content. After this pass
    // FG is fully opaque so the multiply applies uniformly.
    if (this.bgCanvas !== null) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(this.bgCanvas, 0, 0, w, h);
    }

    // Pass 2: multiply the light buffer onto the now-opaque FG.
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightBuffer, 0, 0, w, h);

    ctx.restore();
  }

  /** Wire the BG canvas at Renderer construction; consumed each composite pass. */
  setBgCanvas(bg: HTMLCanvasElement | null): void {
    this.bgCanvas = bg;
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
    this.bufW = Math.ceil(w * HALF_RES_SCALE);
    this.bufH = Math.ceil(h * HALF_RES_SCALE);
    this.lightBuffer = null;
    this.lightCtx = null;
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Public accessor used by tests AND by debug-overlay code in PR 3. */
  getLightBuffer(): OffscreenCanvas | null {
    return this.lightBuffer;
  }

  // ── Private drawing ──────────────────────────────────────────────────────

  /**
   * Draw a directional sun gradient using a pre-baked 1×64 strip rotated to
   * point toward the sun's screen-space direction. This is orders of magnitude
   * cheaper than createLinearGradient on a full 640×360 buffer (engine/CLAUDE.md:
   * "CanvasGradient on large fills is catastrophic … use bakeVerticalGradientStrip
   * pattern instead").
   */
  private drawSunGradient(
    ctx: OffscreenCanvasRenderingContext2D,
    angle: number,
    color: RGB,
    intensity: number,
  ): void {
    const strip = this.getSunStrip(color, intensity);
    if (!strip) {
      // No OffscreenCanvas — fall back to the old per-frame gradient path.
      this._drawSunGradientFallback(ctx, angle, color, intensity);
      return;
    }

    // Rotate so the strip's top (full color) points to the sun-side.
    // Strip top is at y=0 in source; after centered draw at (-len/2, -len/2),
    // the strip's "full-color end" points toward canvas y-negative = (0, -1).
    // Sun direction in our convention (0=right, π/2=up, π=left) is
    // (cos θ, -sin θ) in canvas space (y grows downward). Rotating (0, -1)
    // onto (cos θ, -sin θ) requires α = π/2 - θ.
    const cx = this.bufW / 2;
    const cy = this.bufH / 2;
    // Diagonal of the buffer so the stretched strip covers every corner.
    const len = Math.max(this.bufW, this.bufH) * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2 - angle);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(strip, -len / 2, -len / 2, len, len);
    ctx.restore();
  }

  /** Original gradient path, used when OffscreenCanvas strip can't be created. */
  private _drawSunGradientFallback(
    ctx: OffscreenCanvasRenderingContext2D,
    angle: number,
    color: RGB,
    intensity: number,
  ): void {
    const cx = this.bufW / 2;
    const cy = this.bufH / 2;
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle);
    const r = Math.max(this.bufW, this.bufH);
    const grad = ctx.createLinearGradient(
      cx + dx * r, cy + dy * r,
      cx - dx * r, cy - dy * r,
    );
    const a = Math.round(intensity * 0.5 * 255);
    grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${a / 255})`);
    grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.bufW, this.bufH);
  }
}
