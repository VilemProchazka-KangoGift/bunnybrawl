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
// Perf fixes (L1):
//  - beginFrame output is cached for ~30 frames; dayPhase changes ~1/3600 per
//    frame at default cycle speed — well below visible threshold.
//  - Sun gradient baked to a 1×64 strip once per unique (color, intensity), then
//    blitted with rotation. Eliminates per-frame full-buffer createLinearGradient
//    evaluation (engine/CLAUDE.md: "catastrophic at 1280×720").
//
// Correctness fix (L1):
//  - composite() now masks the light buffer by FG alpha before multiplying. The
//    old direct multiply filled transparent FG pixels (sky region) with opaque
//    ambient color, occluding the BG canvas. The new flow:
//      1. Stamp light buffer onto a full-size temp canvas (source-over).
//      2. destination-in with the FG canvas — keeps temp pixels only where FG
//         has alpha (i.e. where sprites/particles are drawn).
//      3. Multiply the masked result onto FG.

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { buildSunLight } from './sun';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

const HALF_RES_SCALE = 0.5;

/** Recompute the light buffer every N frames at most. */
const CACHE_REFRESH_INTERVAL = 30; // ~0.5 s at 60 fps

/**
 * Also recompute when dayPhase has moved more than this since the last bake.
 * 0.001 ≈ 0.4 s of game-time at default 1-cycle-per-24-min speed — imperceptible.
 */
const CACHE_DAYPHASE_THRESHOLD = 0.001;

export class LightingPipeline {
  private width: number;
  private height: number;
  private bufW: number;
  private bufH: number;
  private lightBuffer: OffscreenCanvas | null = null;
  private lightCtx: OffscreenCanvasRenderingContext2D | null = null;

  // ── Full-size temp canvas for the FG-alpha masking pass in composite() ──
  private tempCanvas: OffscreenCanvas | null = null;
  private tempCtx: OffscreenCanvasRenderingContext2D | null = null;

  // ── beginFrame cache state ──
  private lastDayPhase = -1; // sentinel: forces first-frame bake
  private lastPhotosensitivity = false;
  private cacheValidFor = 0; // frames remaining before next recompute

  // ── Sun gradient strip cache ──
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
   * Lazy full-size temp canvas for the composite masking pass.
   * Returns null if OffscreenCanvas is unavailable (test / JSDOM).
   */
  private ensureTempCanvas(w: number, h: number): OffscreenCanvas | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    if (
      this.tempCanvas !== null &&
      this.tempCanvas.width === w &&
      this.tempCanvas.height === h
    ) {
      return this.tempCanvas;
    }
    this.tempCanvas = new OffscreenCanvas(w, h);
    this.tempCtx = this.tempCanvas.getContext('2d');
    return this.tempCanvas;
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
   * The result is cached for up to CACHE_REFRESH_INTERVAL frames; it is only
   * recomputed when dayPhase moves more than CACHE_DAYPHASE_THRESHOLD or the
   * photosensitivity setting changes.
   */
  beginFrame(theme: ThemeConfig, dayPhase: number, _tick: number): void {
    if (!this.isEnabled()) return;
    if (!this.ensureBuffer()) return;

    const photosensitivity = getPhotosensitivity();

    // Cache check: skip recompute when nothing perceptible changed.
    const phaseDelta = Math.abs(dayPhase - this.lastDayPhase);
    if (
      this.cacheValidFor > 0 &&
      phaseDelta < CACHE_DAYPHASE_THRESHOLD &&
      photosensitivity === this.lastPhotosensitivity
    ) {
      this.cacheValidFor--;
      return; // buffer still valid
    }

    // Recompute and refresh cache counters.
    this.cacheValidFor = CACHE_REFRESH_INTERVAL;
    this.lastDayPhase = dayPhase;
    this.lastPhotosensitivity = photosensitivity;

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
   * Multiply the light buffer onto the target ctx, but ONLY where the FG canvas
   * already has alpha > 0. This prevents the opaque ambient color from occluding
   * the transparent sky region (which shows through to the BG canvas via CSS
   * stacking).
   *
   * Flow:
   *   1. Stamp the light buffer onto a full-size temp canvas (source-over).
   *   2. destination-in with the FG canvas — erases temp pixels where FG is
   *      transparent.
   *   3. Multiply the masked result onto FG.
   *
   * Half-res buffer scales up with bilinear filtering — free blur on gradients.
   */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    if (this.lightBuffer === null) return; // buffer never created (e.g. JSDOM)

    const w = this.width;
    const h = this.height;
    const tmp = this.ensureTempCanvas(w, h);

    if (tmp === null) {
      // Fallback for environments without OffscreenCanvas: direct multiply
      // (original behaviour — correctness issue doesn't matter in test env).
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.lightBuffer, 0, 0, w, h);
      ctx.restore();
      return;
    }

    const tctx = this.tempCtx!;

    // Step 1: stamp light buffer onto temp at full canvas size.
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, w, h);
    tctx.drawImage(this.lightBuffer, 0, 0, w, h);

    // Step 2: mask by FG alpha — destination-in keeps only pixels where FG
    // has alpha (sprites, particles, etc.).
    //
    // 4-arg drawImage with explicit (w, h) is REQUIRED here: ctx.canvas is the
    // backing-store-sized canvas (e.g. 2560×1440 at renderScale=2), while tmp
    // is logical-sized (1280×720). Without the explicit size, drawImage uses the
    // source's intrinsic dimensions and the FG mask gets stamped at 2x scale,
    // so a cloud at logical (200, 100) creates a ghost at logical (400, 200).
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(ctx.canvas, 0, 0, w, h);
    tctx.globalCompositeOperation = 'source-over';

    // Step 3: multiply the masked light onto FG.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
    this.bufW = Math.ceil(w * HALF_RES_SCALE);
    this.bufH = Math.ceil(h * HALF_RES_SCALE);
    // Drop existing buffers; ensureBuffer()/ensureTempCanvas() rebuild on next use.
    this.lightBuffer = null;
    this.lightCtx = null;
    this.tempCanvas = null;
    this.tempCtx = null;
    // Invalidate cache so the new buffer gets filled immediately.
    this.cacheValidFor = 0;
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
