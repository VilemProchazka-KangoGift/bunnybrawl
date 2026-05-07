// src/engine/lighting/pipeline.ts
//
// LightingPipeline — Carrot Royale's L1 Foundation lighting.
//
// Per the reference doc §5.1 ("the sun isn't a 'light' in the buffer"), 2D
// lighting cannot do per-pixel directional contribution without normal maps.
// So the sun's job in L1 is just to set the AMBIENT COLOR. We render that as
// a single translucent overlay drawn on the foreground canvas at end of
// renderFrame. Pre-M1 already shipped this exact technique inside
// drawDayNightCycle; we deleted it in B10 and now restore it through a
// clean pipeline that L2-L5 can extend.
//
// Architecture lesson chain (rim-light → outlines → here): lighting is per-frame,
// screen-space, post-sprite-cache. Never bake into a sprite cache.
//
// Two darkening paths picked by the renderer at construction:
//   - CSS-composited (bgNightCanvas + fgNightTint wired): composite() is a
//     no-op; getBgNightOpacity() drives stacked DOM layers via style.opacity.
//   - Source-over tint fallback (lobby, tests): composite() does one fillRect.
//
// L2 (per-arena emitters) will add 'lighter' point-light passes on top.
// L3 (shadows) reads sun direction from buildSunLight() in sun.ts.

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

/** Max alpha at full midnight. Matches pre-M1's `drawDayNightCycle` overlay. */
export const MAX_TINT_ALPHA = 0.55;

/** Night tint hue. */
export const TINT_COLOR: Readonly<RGB> = { r: 20, g: 24, b: 48 };

/** Bake color string for the cross-fade bgNightCanvas. Same hue + max alpha. */
export const BG_NIGHT_BAKE_RGBA =
  `rgba(${TINT_COLOR.r},${TINT_COLOR.g},${TINT_COLOR.b},${MAX_TINT_ALPHA})`;

/** fg-tint dusk threshold — multiply tint stays at 0 until bg-night opacity
 *  passes this value. Preserves the warm sunset afterglow at dayPhase ≈ 0.25
 *  (multiply on a colored layer crushes warm channels otherwise). */
export const FG_TINT_DUSK_THRESHOLD = 0.55;

/** fg-tint peak multiplier — applied after the dusk threshold ramps in. */
export const FG_TINT_PEAK_MUL = 0.7;

/** Maps bg-night opacity to fg-tint multiplier with a ramp that protects dusk. */
export function fgTintIntensity(bgNightOpacity: number): number {
  const t = (bgNightOpacity - FG_TINT_DUSK_THRESHOLD) / (1 - FG_TINT_DUSK_THRESHOLD);
  return Math.max(0, Math.min(1, t)) * FG_TINT_PEAK_MUL;
}

export class LightingPipeline {
  private width: number;
  private height: number;

  /** Tint alpha for this frame, set by beginFrame, consumed by composite. */
  private tintAlpha = 0;

  /** Renderer toggles this when DOM darkening layers are wired — flips
   *  composite() to no-op and the CSS path takes over. */
  private useDomDarkening = false;

  /** Reused scratch buffer for themeToAmbient — avoids per-frame allocation. */
  private readonly _ambientScratch: RGB = { r: 0, g: 0, b: 0 };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setUseDomDarkening(use: boolean): void {
    this.useDomDarkening = use;
  }

  /**
   * Compute the tint alpha for this frame from ambient(theme, dayPhase). Cheap;
   * no allocations, no canvas work — just a few arithmetic ops.
   */
  beginFrame(theme: ThemeConfig, dayPhase: number, _tick: number): void {
    if (!this.isEnabled()) {
      this.tintAlpha = 0;
      return;
    }
    const ambient = themeToAmbient(theme, dayPhase, getPhotosensitivity(), this._ambientScratch);
    const avgAmbient = (ambient.r + ambient.g + ambient.b) / 3;
    const deficit = Math.max(0, (255 - avgAmbient) / 255);
    // At noon (deficit ~0.06) → ~0.04. At midnight (deficit ~0.69) → ~0.48.
    const raw = Math.min(MAX_TINT_ALPHA, deficit * 0.7);
    // Defend against NaN dayPhase upstream: NaN < 0.01 is false, so an
    // unguarded composite would emit a `rgba(...,NaN)` fill. Coerce to 0.
    this.tintAlpha = Number.isFinite(raw) ? raw : 0;
  }

  /** Source-over fallback path (no DOM darkening layers wired). */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    if (this.useDomDarkening) return;
    if (this.tintAlpha < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${TINT_COLOR.r},${TINT_COLOR.g},${TINT_COLOR.b},${this.tintAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /** Map tintAlpha → [0,1] so midnight reaches full opacity; the baked bgNight
   *  canvas then composites at the same effective alpha as the source-over path. */
  getBgNightOpacity(): number {
    if (!this.isEnabled()) return 0;
    return Math.min(1, this.tintAlpha / MAX_TINT_ALPHA);
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Test accessor — exposes the current frame's tint alpha. */
  getTintAlphaForTesting(): number {
    return this.tintAlpha;
  }
}
