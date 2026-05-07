// src/engine/lighting/pipeline.ts
//
// LightingPipeline — Carrot Royale's deferred-lite lighting (M1 Foundation).
// Half-res light buffer (0.5×) accumulates ambient + directional sun. Composited
// onto the foreground canvas via multiply blend just before HUD draws.
//
// Architecture lesson chain (rim-light → outlines → here): lighting is per-frame,
// screen-space, post–sprite-cache. Never bake into a sprite cache.

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
  private lightBuffer: OffscreenCanvas;
  private lightCtx: OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bufW = Math.ceil(width * HALF_RES_SCALE);
    this.bufH = Math.ceil(height * HALF_RES_SCALE);
    this.lightBuffer = new OffscreenCanvas(this.bufW, this.bufH);
    this.lightCtx = this.lightBuffer.getContext('2d')!;
  }

  /**
   * Reset the light buffer to ambient and additively accumulate sun. Run at the
   * top of renderFrame so the buffer is ready when composite() is called.
   */
  beginFrame(theme: ThemeConfig, dayPhase: number, _tick: number): void {
    if (!this.isEnabled()) return;
    const photosensitivity = getPhotosensitivity();

    // 1. Fill with ambient (source-over, fully opaque).
    const ambient = themeToAmbient(theme, dayPhase, photosensitivity);
    this.lightCtx.globalCompositeOperation = 'source-over';
    this.lightCtx.fillStyle = `rgb(${ambient.r},${ambient.g},${ambient.b})`;
    this.lightCtx.fillRect(0, 0, this.bufW, this.bufH);

    // 2. Add directional sun (lighter / additive).
    const sun = buildSunLight(theme, dayPhase, photosensitivity);
    if (sun !== null && sun.intensity > 0.01) {
      this.lightCtx.globalCompositeOperation = 'lighter';
      this.drawSunGradient(sun.angle, sun.color, sun.intensity);
      this.lightCtx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Multiply the light buffer onto the target ctx. Half-res buffer scales up
   * with bilinear filtering — gives a free blur on lighting gradients.
   */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightBuffer, 0, 0, this.width, this.height);
    ctx.restore();
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
    this.bufW = Math.ceil(w * HALF_RES_SCALE);
    this.bufH = Math.ceil(h * HALF_RES_SCALE);
    this.lightBuffer = new OffscreenCanvas(this.bufW, this.bufH);
    this.lightCtx = this.lightBuffer.getContext('2d')!;
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Public accessor used by tests AND by debug-overlay code in PR 3. */
  getLightBuffer(): OffscreenCanvas {
    return this.lightBuffer;
  }

  /**
   * Paint the directional sun as a screen-space linear gradient on the light
   * buffer. The sun "comes from" `angle` (0 = right, π/2 = up, π = left). The
   * gradient runs along that direction with full color near the sun-side and
   * fades to transparent on the opposite side.
   */
  private drawSunGradient(angle: number, color: RGB, intensity: number): void {
    const cx = this.bufW / 2;
    const cy = this.bufH / 2;
    // Sun direction unit vector (where light comes FROM)
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle); // negative because canvas y grows downward
    const r = Math.max(this.bufW, this.bufH);
    const grad = this.lightCtx.createLinearGradient(
      cx + dx * r, cy + dy * r,   // sun side (full color)
      cx - dx * r, cy - dy * r,   // shadow side (transparent)
    );
    const a = Math.round(intensity * 0.5 * 255); // peak alpha 50% × intensity
    grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${a / 255})`);
    grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    this.lightCtx.fillStyle = grad;
    this.lightCtx.fillRect(0, 0, this.bufW, this.bufH);
  }
}
