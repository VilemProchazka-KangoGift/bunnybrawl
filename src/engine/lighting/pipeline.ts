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
// Mechanism (two modes, picked at construction by the renderer):
//
//   1. CSS-composited cross-fade (Match.tsx wires bgNightCanvas):
//      - beginFrame() computes a tint alpha from ambient(theme, dayPhase).
//      - getBgNightOpacity() maps that to [0,1] and the renderer drives
//        `bgNightCanvas.style.opacity` per frame. The browser compositor
//        cross-fades between the day and night BG variants for ~free.
//      - composite() is a no-op. Sprites stay bright at night per the
//        party-game readability rule.
//
//   2. Source-over tint fallback (lobby, tests, anywhere bgNight isn't wired):
//      - composite() does ONE fillRect with source-over on the FG ctx.
//        Sky shows through partial alpha via CSS stacking (bg behind fg).
//
// Cost (mode 1): two extra ops per arena-load (drawImage + fillRect on the
// night canvas inside renderBackground), CSS opacity assignment per frame.
// The opacity write is GPU compositor work, not painting — effectively zero.
//
// Cost (mode 2): one fillRect at backing res per frame — cheapest full-canvas
// canvas op there is.
//
// L2 (per-arena emitters) will add point-light passes via 'lighter' (additive)
// blend on top of this tint. L3 (shadows) will read sun direction from
// buildSunLight() in sun.ts (still exported for that consumer).

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

/**
 * Max alpha of the tint overlay at full midnight. 0.55 matches pre-M1's
 * `drawDayNightCycle` darkness-overlay (which we deleted in B10 and now restore
 * through a clean pipeline that L2-L5 can extend).
 */
const MAX_TINT_ALPHA = 0.55;

/** The tint hue — pre-M1 used rgba(20, 24, 48); we match. */
const TINT_COLOR: RGB = { r: 20, g: 24, b: 48 };

export class LightingPipeline {
  private width: number;
  private height: number;

  /** Tint alpha for this frame, set by beginFrame, consumed by composite. */
  private tintAlpha = 0;

  /** When true, the renderer wired a bgNightCanvas — composite() goes silent
   *  (CSS-driven cross-fade does the darkening) and getBgNightOpacity() drives
   *  that canvas's style.opacity per frame. When false (lobby, tests), the
   *  legacy source-over tint pass on the FG ctx is the only darkening path. */
  private bgNightWired = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Renderer hook: declare whether a bgNightCanvas is wired. Toggles which
   *  darkening mechanism is active. Called once at construction. */
  setBgNightWired(wired: boolean): void {
    this.bgNightWired = wired;
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
    const photosensitivity = getPhotosensitivity();
    const ambient = themeToAmbient(theme, dayPhase, photosensitivity);
    // Brightness deficit: 0 when ambient is full white, 1 when ambient is black.
    const avgAmbient = (ambient.r + ambient.g + ambient.b) / 3;
    const deficit = Math.max(0, (255 - avgAmbient) / 255);
    // Linear ramp scaled by a tunable max. At noon (deficit ~0.06) → ~0.04.
    // At midnight (deficit ~0.69) → ~0.48 — moderate blue cast.
    this.tintAlpha = Math.min(MAX_TINT_ALPHA, deficit * 0.7);
  }

  /**
   * Apply the precomputed tint as a single source-over fillRect on the FG ctx.
   * Skipped entirely when the tint is below visibility threshold OR when a
   * bgNightCanvas is wired (in that mode, CSS opacity on the stacked night-bg
   * canvas does the darkening — sprites stay bright, BG cross-fades).
   */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    if (this.bgNightWired) return;
    if (this.tintAlpha < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${TINT_COLOR.r},${TINT_COLOR.g},${TINT_COLOR.b},${this.tintAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /** Renderer hook: compute the opacity for the cross-fade bgNightCanvas this
   *  frame. Returns 0 when lighting is off. Mapped from tintAlpha → [0,1] so
   *  midnight (tintAlpha ≈ MAX_TINT_ALPHA) reaches full opacity and the visible
   *  effective alpha matches the legacy source-over path. */
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

  /** Test/debug accessor — M1 has no buffer; PR 3 debug overlay handles null gracefully. */
  getLightBuffer(): OffscreenCanvas | null {
    return null;
  }

  /** Compatibility shim — kept so renderer.ts wire-up doesn't need to change. */
  setBgCanvas(_bg: HTMLCanvasElement | null): void {
    // no-op in this implementation; sky tint is handled by the same overlay
    // because fg's transparent regions become semi-opaque after the fillRect.
  }

  /** Test accessor — exposes the current frame's tint alpha. */
  getTintAlphaForTesting(): number {
    return this.tintAlpha;
  }
}
