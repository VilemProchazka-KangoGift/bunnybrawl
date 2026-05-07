// src/engine/lighting/ambient.ts
//
// Computes the ambient color filling the light buffer at beginFrame().
// Replaces the night-overlay alpha rect logic from drawDayNightCycle.
//
// dayPhase convention (matches existing drawDayNightCycle):
//   0 = noon, 0.25 = sunset, 0.5 = midnight, 0.75 = sunrise.
// Curve: nightIntensity = (1 - cos(dayPhase * 2π)) / 2 — same as drawDayNightCycle.

import type { ThemeConfig } from '../themes/types';
import type { RGB } from './types';

const NOON: RGB = { r: 245, g: 240, b: 225 };
const MIDNIGHT: RGB = { r: 60, g: 70, b: 110 };
const PHOTOSENSITIVITY_FLOOR: RGB = { r: 120, g: 130, b: 160 };
const FIXED_AMBIENT: RGB = { r: 200, g: 200, b: 200 };

function lerpCh(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function nightIntensity(dayPhase: number): number {
  return Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);
}

export function themeToAmbient(
  theme: ThemeConfig,
  dayPhase: number,
  photosensitivity: boolean,
): RGB {
  if (!theme.dayNight.enabled) {
    return { ...FIXED_AMBIENT };
  }

  const t = nightIntensity(dayPhase);
  const r = lerpCh(NOON.r, MIDNIGHT.r, t);
  const g = lerpCh(NOON.g, MIDNIGHT.g, t);
  const b = lerpCh(NOON.b, MIDNIGHT.b, t);

  if (photosensitivity) {
    return {
      r: Math.max(r, PHOTOSENSITIVITY_FLOOR.r),
      g: Math.max(g, PHOTOSENSITIVITY_FLOOR.g),
      b: Math.max(b, PHOTOSENSITIVITY_FLOOR.b),
    };
  }
  return { r, g, b };
}
