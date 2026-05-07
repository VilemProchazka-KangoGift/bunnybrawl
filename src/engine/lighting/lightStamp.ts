// src/engine/lighting/lightStamp.ts
//
// Pure light rendering. One emitter → one fillRect/arc with `'lighter'` blend
// on the caller's ctx. Falloff baked into a radial gradient. The DOM sibling
// the caller writes to has `mix-blend-mode: screen`, so additive contributions
// here punch through the L1 fg-night-tint multiply layer at composite time.
//
// Determinism: flickerSeed + tick → deterministic intensity modulation via
// `SeededRNG.fromTick`. Co-located emitters with distinct seeds desync.

import { SeededRNG } from '../seededRng';
import type { Light } from './types';

/** Cap intensity for photosensitivity-aware callers. Mirrors L1's sun cap. */
export const PHOTOSENSITIVITY_INTENSITY_CAP = 0.7;

/** Compute effective intensity for this tick — base × (1 + flicker delta).
 *  Returns 0..(1 + flickerAmplitude) when flicker is present, else base. */
export function effectiveIntensity(light: Light, tick: number): number {
  if (light.flickerSeed === undefined) return light.intensity;
  const amp = light.flickerAmplitude ?? 0;
  if (amp === 0) return light.intensity;
  // Centered ±amp/2 so average intensity over time = base.
  const delta = (SeededRNG.fromTick(light.flickerSeed, tick).nextFloat() - 0.5) * amp;
  return Math.max(0, light.intensity + delta);
}

/** Stamp one Light onto the ctx with `'lighter'` (additive) blend. Caller is
 *  responsible for the ctx state machine — typically wraps a batch of stamps
 *  in save/restore + sets globalCompositeOperation = 'lighter' once. */
export function lightStamp(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  light: Light,
  tick: number,
  intensityCap = 1.0,
): void {
  const base = effectiveIntensity(light, tick);
  const intensity = Math.min(base, intensityCap);
  if (intensity <= 0) return;

  if (light.kind === 'point') {
    stampPoint(ctx, light, intensity);
  } else {
    stampSpot(ctx, light, intensity);
  }
}

function stampPoint(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  light: Light,
  intensity: number,
): void {
  const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
  const { r, g, b } = light.color;
  // Center: full color × intensity. Edge: zero. Falloff curve baked into stops.
  grad.addColorStop(0, `rgba(${r},${g},${b},${intensity})`);
  for (const stop of falloffStops(light.falloff)) {
    grad.addColorStop(stop.t, `rgba(${r},${g},${b},${intensity * stop.alpha})`);
  }
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
}

function stampSpot(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  light: Light,
  intensity: number,
): void {
  const direction = light.direction ?? 0;
  const cone = light.cone ?? Math.PI / 3;
  const half = cone / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(light.x, light.y);
  ctx.arc(light.x, light.y, light.radius, direction - half, direction + half);
  ctx.closePath();
  ctx.clip();
  stampPoint(ctx, light, intensity);
  ctx.restore();
}

interface FalloffStop {
  t: number;     // 0..1 along radius
  alpha: number; // multiplier of intensity at this radius
}

const INVERSE_SQUARE: ReadonlyArray<FalloffStop> = [
  // ~ (1 - t)² with shoulder. Tuned visually for warm-light look.
  { t: 0.25, alpha: 0.6 },
  { t: 0.5,  alpha: 0.28 },
  { t: 0.75, alpha: 0.1 },
];

const LINEAR: ReadonlyArray<FalloffStop> = [
  { t: 0.5, alpha: 0.5 },
];

const SMOOTHSTEP: ReadonlyArray<FalloffStop> = [
  // 3t² - 2t³ from full → 0
  { t: 0.25, alpha: 0.84 },
  { t: 0.5,  alpha: 0.5 },
  { t: 0.75, alpha: 0.16 },
];

function falloffStops(falloff: Light['falloff']): ReadonlyArray<FalloffStop> {
  switch (falloff) {
    case 'linear': return LINEAR;
    case 'smoothstep': return SMOOTHSTEP;
    case 'inverse-square':
    default:
      return INVERSE_SQUARE;
  }
}
