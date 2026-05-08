// src/engine/lighting/pipeline.ts
//
// AmbientPipeline — L1 Foundation ambient darkening.
// (Was `LightingPipeline` pre-L2; renamed when L2 split out EmitterPipeline.)
//
// Per the reference doc §5.1 ("the sun isn't a 'light' in the buffer"), 2D
// lighting cannot do per-pixel directional contribution without normal maps.
// In L1 the pipeline owns the AMBIENT darkening; sun visual stays in
// `rendering/effects.ts > drawDayNightCycle` next to moon/stars/afterglow.
//
// Architecture lesson chain (rim-light → outlines → here): lighting is per-frame,
// screen-space, post-sprite-cache. Never bake into a sprite cache.
//
// Two darkening paths picked by the renderer at construction:
//   - DOM cross-fade (bgNightCanvas + fgNightTint wired): composite() is a
//     no-op; getBgNightOpacity() + getFgTintOpacity() drive stacked DOM
//     layers via style.opacity. Browser compositor blends them for ~free.
//   - Source-over tint fallback (lobby, tests): composite() does one fillRect
//     on the FG ctx. Simpler but pays full-canvas pixel cost per frame.

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

/** Max alpha at full midnight. Matches pre-M1's `drawDayNightCycle` overlay. */
const MAX_TINT_ALPHA = 0.55;

/** Night tint hue. */
const TINT_COLOR: Readonly<RGB> = { r: 20, g: 24, b: 48 };

/** Bake color string for the cross-fade bgNightCanvas. Same hue + max alpha. */
const BG_NIGHT_BAKE_RGBA =
  `rgba(${TINT_COLOR.r},${TINT_COLOR.g},${TINT_COLOR.b},${MAX_TINT_ALPHA})`;

/** Tint gain — `tintAlpha = clamp(deficit * GAIN, MAX)`. Tunable; smaller
 *  values delay the night tint, larger values approach midnight earlier. */
const TINT_GAIN = 0.7;

/** Below this bg-night opacity, the fg multiply layer stays silent. 0.55
 *  corresponds to dayPhase ≈ 0.32 (post-sunset, well past the 0.16–0.30
 *  afterglow window). The threshold protects the warm sunset redshift —
 *  multiply on a cool-blue layer crushes red/orange channels otherwise. */
const FG_TINT_DUSK_THRESHOLD = 0.55;

/** fg-tint peak multiplier — applied after the dusk threshold ramps in. */
const FG_TINT_PEAK_MUL = 0.7;

export class AmbientPipeline {
  private width: number;
  private height: number;

  /** Tint alpha for this frame, set by beginFrame, consumed by composite. */
  private tintAlpha = 0;

  /** Renderer toggles this when DOM darkening layers are wired — flips
   *  composite() to no-op and the CSS path takes over. */
  private hasDomDarkening = false;

  /** Reused scratch buffer for themeToAmbient — avoids per-frame allocation. */
  private readonly _ambientScratch: RGB = { r: 0, g: 0, b: 0 };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setHasDomDarkening(has: boolean): void {
    this.hasDomDarkening = has;
  }

  /** Compute the tint alpha for this frame from ambient(theme, dayPhase). */
  beginFrame(theme: ThemeConfig, dayPhase: number): void {
    if (!this.isEnabled()) {
      this.tintAlpha = 0;
      return;
    }
    const ambient = themeToAmbient(theme, dayPhase, getPhotosensitivity(), this._ambientScratch);
    const avgAmbient = (ambient.r + ambient.g + ambient.b) / 3;
    const deficit = Math.max(0, (255 - avgAmbient) / 255);
    // At noon (deficit ~0.06) → ~0.04. At midnight (deficit ~0.69) → ~0.48.
    const raw = Math.min(MAX_TINT_ALPHA, deficit * TINT_GAIN);
    // Defensive: NaN tintAlpha would emit `rgba(...,NaN)` (invalid color).
    this.tintAlpha = Number.isFinite(raw) ? raw : 0;
  }

  /** Source-over fallback path (no DOM darkening layers wired). */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    if (this.hasDomDarkening) return;
    if (this.tintAlpha < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${TINT_COLOR.r},${TINT_COLOR.g},${TINT_COLOR.b},${this.tintAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /** Map tintAlpha → [0,1]; reaches 1.0 only when tintAlpha hits MAX_TINT_ALPHA.
   *  At vanilla midnight (no photosensitivity) this is ~0.88. */
  getBgNightOpacity(): number {
    if (!this.isEnabled()) return 0;
    return Math.min(1, this.tintAlpha / MAX_TINT_ALPHA);
  }

  /** Map bg-night opacity to fg-tint multiply opacity with a dusk-protect ramp. */
  getFgTintOpacity(bgNightOpacity: number): number {
    const t = (bgNightOpacity - FG_TINT_DUSK_THRESHOLD) / (1 - FG_TINT_DUSK_THRESHOLD);
    return Math.max(0, Math.min(1, t)) * FG_TINT_PEAK_MUL;
  }

  /** Color string the renderer paints over the day-bg snapshot to bake the
   *  night-variant canvas. Encapsulates TINT_COLOR + MAX_TINT_ALPHA. */
  getBgNightBakeColor(): string {
    return BG_NIGHT_BAKE_RGBA;
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Test accessor — not for production use (semantics depend on darkening
   *  path; the cross-fade path drives opacity, not alpha). */
  _getTintAlphaForTest(): number {
    return this.tintAlpha;
  }
}
