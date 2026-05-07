// src/engine/lighting/sun.ts
//
// Computes the directional sun light contribution for the current dayPhase.
// Replaces the sun-glow blob from drawDayNightCycle.
//
// dayPhase convention (matches existing drawDayNightCycle):
//   0 = noon, 0.25 = sunset, 0.5 = midnight, 0.75 = sunrise, 1 = noon (wrap).
// Sun is screen-space (Carrot Royale has no camera follow).
// Sun visible when dayPhase < 0.25 || dayPhase > 0.75.
// Below horizon (0.25 <= dayPhase <= 0.75) returns null.

import { wrapToUnit } from '../fastMath';
import type { ThemeConfig } from '../themes/types';
import type { RGB, SunContribution } from './types';

const NOON_COLOR: RGB = { r: 255, g: 250, b: 230 };
const HORIZON_COLOR: RGB = { r: 255, g: 180, b: 110 };
const PHOTOSENSITIVITY_INTENSITY_CAP = 0.7;

function lerpCh(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerpCh(a.r, b.r, t), g: lerpCh(a.g, b.g, t), b: lerpCh(a.b, b.b, t) };
}

/** "Distance from noon" in [0, 0.25] for daytime; > 0.25 means below horizon. */
function distanceFromNoon(dayPhase: number): number {
  const w = wrapToUnit(dayPhase);
  return Math.min(w, 1 - w);
}

export function buildSunLight(
  theme: ThemeConfig,
  dayPhase: number,
  photosensitivity: boolean,
): SunContribution | null {
  if (!theme.dayNight.enabled) return null;

  const fromNoon = distanceFromNoon(dayPhase); // 0 at noon, 0.5 at midnight
  if (fromNoon >= 0.25) return null; // sun below horizon

  // tFromNoon: 0 at noon, 1 at horizon
  const tFromNoon = fromNoon / 0.25;

  // Intensity: cosine fall-off from noon (peak 1.0) to horizon (0)
  let intensity = Math.cos(tFromNoon * Math.PI / 2);
  intensity = Math.max(0, intensity);

  // Color: warm at horizon, neutral at noon
  const color = lerpColor(NOON_COLOR, HORIZON_COLOR, tFromNoon);

  // Angle: simplified screen-space sweep. Morning (dayPhase > 0.75): sun rises
  // from the right horizon (angle 0) up toward noon (angle π/2). Afternoon
  // (dayPhase < 0.25): noon (π/2) toward left horizon (angle π).
  // Build angle from a "morning vs afternoon" sign and the t-from-noon ratio.
  const isAfternoon = dayPhase > 0 && dayPhase < 0.5;
  const angle = isAfternoon
    ? Math.PI / 2 + (tFromNoon * Math.PI / 2) // π/2 → π
    : Math.PI / 2 - (tFromNoon * Math.PI / 2); // π/2 → 0

  if (photosensitivity) {
    intensity = Math.min(intensity, PHOTOSENSITIVITY_INTENSITY_CAP);
  }

  return { angle, color, intensity };
}
