// src/engine/lighting/emitter.ts
//
// EmitterPipeline — owns per-frame emitter state for L2.
//
// Inputs each frame: static lights from arena (rarely changes), dynamic lights
// synthesized by the renderer from entity state (per-player aura, carrot glow,
// etc.). Outputs: a sequence of `lightStamp` calls onto a caller-provided ctx
// with `'lighter'` blend.
//
// Two compositing strategies, picked by Renderer based on `getLightMode()`:
//   - combined: bake static once into an internal cache; per-frame draw is
//     drawImage(cache) + dynamic stamps + flicker overlay on the static
//     positions. ONE light DOM sibling.
//   - split: bake static directly onto the static DOM canvas (one-time);
//     per-frame draw is dynamic stamps + flicker overlay only. TWO light
//     DOM siblings.
//
// EmitterPipeline itself is mode-agnostic — it owns the light catalog and
// exposes `bakeStatic` + `compositeDynamic`. Renderer sequences them.

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { isLightingEnabled } from './index';
import { lightStamp, PHOTOSENSITIVITY_INTENSITY_CAP } from './lightStamp';
import { getPhotosensitivity } from './photosensitivity';
import type { Light } from './types';

export class EmitterPipeline {
  private _staticLights: ReadonlyArray<Light> = [];
  /** Re-used buffer; renderer pushes per-frame entries via beginFrame. */
  private _dynamicLights: Light[] = [];
  private _photosensitivity = false;
  private _tick = 0;

  setStaticLights(lights: ReadonlyArray<Light>): void {
    this._staticLights = lights;
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
  bakeStatic(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    const cap = this._photosensitivity ? PHOTOSENSITIVITY_INTENSITY_CAP : 1.0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of this._staticLights) {
      // Bake at base intensity ignoring flicker — flicker overlays per-frame.
      const baked: Light = light.flickerSeed !== undefined
        ? { ...light, flickerSeed: undefined, flickerAmplitude: 0 }
        : light;
      lightStamp(ctx, baked, 0, cap);
    }
    ctx.restore();
  }

  /** Stamp the dynamic lights + per-frame static flicker deltas. Used by both
   *  modes per frame. Mode A also calls drawImage(staticCache) BEFORE this. */
  compositeDynamic(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    const cap = this._photosensitivity ? PHOTOSENSITIVITY_INTENSITY_CAP : 1.0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of this._dynamicLights) {
      lightStamp(ctx, light, this._tick, cap);
    }
    // Static flicker deltas: a small additive pulse at each flickering static
    // emitter's position. The static base was baked at full intensity; this
    // adds a centered ±amplitude/2 modulation per tick.
    for (const light of this._staticLights) {
      if (light.flickerSeed === undefined) continue;
      lightStamp(ctx, deltaOnly(light), this._tick, cap);
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

/** Build a flicker-only Light: zero base intensity, full flicker amplitude.
 *  Stamped per-frame on top of the baked static contribution. Net effect:
 *  baseline = full intensity, occasional pulse adds up to amplitude on top. */
function deltaOnly(light: Light): Light {
  return { ...light, intensity: 0 };
}
