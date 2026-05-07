// src/engine/lighting/ambient.ts
//
// Computes the ambient color used by the lighting pipeline. Canonical home of
// the dayPhase → nightIntensity curve; rendering/effects.ts re-exports it.
//
// dayPhase convention: 0 = noon, 0.25 = sunset, 0.5 = midnight, 0.75 = sunrise.

import { fastCos } from '../fastMath';
import type { ThemeConfig } from '../themes/types';
import type { RGB } from './types';

const NOON: RGB = { r: 245, g: 240, b: 225 };
const MIDNIGHT: RGB = { r: 60, g: 70, b: 110 };
const PHOTOSENSITIVITY_FLOOR: RGB = { r: 120, g: 130, b: 160 };
const FIXED_AMBIENT: RGB = { r: 200, g: 200, b: 200 };

function lerpCh(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Curve shared with rendering/effects.ts (sun/moon/stars/afterglow). */
export function computeNightIntensity(dayPhase: number): number {
  return Math.max(0, (1 - fastCos(dayPhase * Math.PI * 2)) / 2);
}

/**
 * Compute the ambient RGB at the given dayPhase. Writes into `out` if provided
 * (caller-owned scratch — avoids per-frame allocation in the renderer hot path).
 */
export function themeToAmbient(
  theme: ThemeConfig,
  dayPhase: number,
  photosensitivity: boolean,
  out?: RGB,
): RGB {
  const result = out ?? { r: 0, g: 0, b: 0 };
  if (!theme.dayNight.enabled) {
    result.r = FIXED_AMBIENT.r;
    result.g = FIXED_AMBIENT.g;
    result.b = FIXED_AMBIENT.b;
    return result;
  }

  const t = computeNightIntensity(dayPhase);
  result.r = lerpCh(NOON.r, MIDNIGHT.r, t);
  result.g = lerpCh(NOON.g, MIDNIGHT.g, t);
  result.b = lerpCh(NOON.b, MIDNIGHT.b, t);

  if (photosensitivity) {
    if (result.r < PHOTOSENSITIVITY_FLOOR.r) result.r = PHOTOSENSITIVITY_FLOOR.r;
    if (result.g < PHOTOSENSITIVITY_FLOOR.g) result.g = PHOTOSENSITIVITY_FLOOR.g;
    if (result.b < PHOTOSENSITIVITY_FLOOR.b) result.b = PHOTOSENSITIVITY_FLOOR.b;
  }
  return result;
}
