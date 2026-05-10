import type { Ctx2D } from '../types';
// src/engine/lighting/emitter.ts
//
// EmitterPipeline — owns per-frame emitter state for L2.
//
// Inputs each frame: static lights from arena (rarely changes), dynamic lights
// synthesized by the renderer from entity state (per-player aura, carrot glow,
// etc.). Outputs: a sequence of `lightStamp` calls onto a caller-provided ctx
// with `'lighter'` blend.
//
// Bake static once into an internal cache, blit the cache onto the light
// DOM sibling each frame, then stamp dynamic emitters + flicker overlays on
// top. (Bakeoff vs a split static/dynamic layout was a wash — see
// `perf-runs/l2-emitter-comparison/REPORT.md`.) EmitterPipeline owns the
// catalog and exposes `bakeStatic` + `compositeDynamic`; Renderer sequences.

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { isLightingEnabled } from './index';
import { lightStamp, PHOTOSENSITIVITY_INTENSITY_CAP } from './lightStamp';
import { getPhotosensitivity } from './photosensitivity';
import type { Light } from './types';

export class EmitterPipeline {
  private _staticLights: ReadonlyArray<Light> = [];
  /** Pre-computed flicker overlays for the static lights with `flicker` set —
   *  `intensity: 0` so `lightStamp` adds only the per-tick delta on top of
   *  the baked static contribution. Built once per `setStaticLights`. */
  private _staticFlickerOverlays: ReadonlyArray<Light> = [];
  /** Re-used buffer; renderer pushes per-frame entries via beginFrame. */
  private _dynamicLights: Light[] = [];
  private _photosensitivity = false;
  private _tick = 0;

  setStaticLights(lights: ReadonlyArray<Light>): void {
    this._staticLights = lights;
    this._staticFlickerOverlays = lights
      .filter(l => l.flicker !== undefined)
      .map(l => ({ ...l, intensity: 0 }));
  }

  /** Begin a frame. Renderer passes the freshly synthesized dynamic list and
   *  the current sim tick (host snapshot tick on guests; guest sees ~2 tick
   *  flicker lag per L2 spec Q9). */
  beginFrame(dynamicLights: Light[], tick: number): void {
    this._dynamicLights = dynamicLights;
    this._tick = tick;
    this._photosensitivity = getPhotosensitivity();
  }

  /** Bake all static lights at full intensity (no flicker) onto target ctx.
   *  Called once at arena-load (or when static catalog changes). Caller is
   *  responsible for clearing the target first. */
  bakeStatic(ctx: Ctx2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    const cap = this._photosensitivity ? PHOTOSENSITIVITY_INTENSITY_CAP : 1.0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of this._staticLights) {
      // Bake at base intensity ignoring flicker — flicker overlays per-frame.
      const baked: Light = light.flicker
        ? { ...light, flicker: undefined }
        : light;
      lightStamp(ctx, baked, 0, cap);
    }
    ctx.restore();
  }

  /** Stamp the dynamic lights + per-frame static flicker deltas. Used by both
   *  modes per frame. Mode A also calls drawImage(staticCache) BEFORE this. */
  compositeDynamic(ctx: Ctx2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    const cap = this._photosensitivity ? PHOTOSENSITIVITY_INTENSITY_CAP : 1.0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of this._dynamicLights) {
      lightStamp(ctx, light, this._tick, cap);
    }
    // Static flicker overlays — additive pulses at each flickering static
    // emitter's position. Pre-built in setStaticLights to avoid per-frame
    // object spread.
    for (const overlay of this._staticFlickerOverlays) {
      lightStamp(ctx, overlay, this._tick, cap);
    }
    ctx.restore();
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Width/height in logical px for downstream consumers (e.g. allocating
   *  the static cache). Constants today; may become dynamic if logical
   *  resolution ever varies per-arena (it doesn't). */
  getSize(): { width: number; height: number } {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }
}

