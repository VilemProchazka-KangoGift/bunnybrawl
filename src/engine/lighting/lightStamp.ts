import type { Ctx2D } from '../types';
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
import type { Light, SpotLight } from './types';

/** Cap intensity for photosensitivity-aware callers. Mirrors L1's sun cap. */
export const PHOTOSENSITIVITY_INTENSITY_CAP = 0.7;

/** Compute effective intensity for this tick — base + flicker delta, clamped
 *  to ≥0. Allocation-free (uses `SeededRNG.floatFromTick`). The delta is
 *  centered ±amp/2 *before* the clamp; in pure-overlay mode (caller passes
 *  base=0 so the underlying static stamp is at full intensity), negative
 *  deltas clamp to 0 since `'lighter'` blend can't subtract — net result is a
 *  small positive bias of ~amp/8 over time, sub-perceptual at amp ≤ 0.15. */
export function effectiveIntensity(light: Light, tick: number): number {
  if (!light.flicker) return light.intensity;
  const { seed, amplitude } = light.flicker;
  if (amplitude === 0) return light.intensity;
  const delta = (SeededRNG.floatFromTick(seed, tick) - 0.5) * amplitude;
  return Math.max(0, light.intensity + delta);
}

/** Stamp one Light onto the ctx with `'lighter'` (additive) blend. Caller is
 *  responsible for the ctx state machine — typically wraps a batch of stamps
 *  in save/restore + sets globalCompositeOperation = 'lighter' once. */
export function lightStamp(
  ctx: Ctx2D | OffscreenCanvasRenderingContext2D,
  light: Light,
  tick: number,
  intensityCap = 1.0,
): void {
  const base = effectiveIntensity(light, tick);
  const intensity = Math.min(base, intensityCap);
  if (intensity <= 0) return;

  if (light.kind === 'point') {
    stampGradient(ctx, light, intensity);
  } else {
    stampSpot(ctx, light, intensity);
  }
}

/** Shared gradient stamp — reads only common fields, so it accepts either
 *  variant. `stampSpot` clips to a cone before calling. */
function stampGradient(
  ctx: Ctx2D | OffscreenCanvasRenderingContext2D,
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
  ctx: Ctx2D | OffscreenCanvasRenderingContext2D,
  light: SpotLight,
  intensity: number,
): void {
  const half = light.cone / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(light.x, light.y);
  ctx.arc(light.x, light.y, light.radius, light.direction - half, light.direction + half);
  ctx.closePath();
  ctx.clip();
  stampGradient(ctx, light, intensity);
  ctx.restore();
}

interface FalloffStop {
  t: number;     // 0..1 along radius
  alpha: number; // multiplier of intensity at this radius
}

// One internal stop per curve — keeps the curve's shape inflection while
// halving addColorStop work in the per-emitter hot path. (Was 3 internal
// stops; perf profile flagged the 5-total-stop chain at 2% of frame time.
// Visual delta vs 3-stop is sub-perceptual at typical light radii 60-150px.)
const INVERSE_SQUARE: ReadonlyArray<FalloffStop> = [
  { t: 0.5, alpha: 0.28 },
];

const LINEAR: ReadonlyArray<FalloffStop> = [
  { t: 0.5, alpha: 0.5 },
];

const SMOOTHSTEP: ReadonlyArray<FalloffStop> = [
  { t: 0.5, alpha: 0.5 },
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
