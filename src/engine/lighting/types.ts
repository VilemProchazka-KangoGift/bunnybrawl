// src/engine/lighting/types.ts
//
// Lighting subsystem types.

export type PerfTier = 'low' | 'med' | 'high';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Light catalog (L2). */
export type LightKind = 'point' | 'spot';
export type Falloff = 'inverse-square' | 'linear' | 'smoothstep';

export interface Light {
  kind: LightKind;
  /** Logical 1280×720 coordinates. */
  x: number;
  y: number;
  color: RGB;
  /** 0..1 — global photosensitivity cap (0.7) applied at composite time. */
  intensity: number;
  /** Falloff radius in logical px. */
  radius: number;
  falloff: Falloff;
  /** Spot-only: cone center direction, radians. 0 = right, π/2 = down. */
  direction?: number;
  /** Spot-only: full cone angular width in radians. */
  cone?: number;
  /** Present → `SeededRNG.fromTick(seed, tick)` modulates intensity per-tick. */
  flickerSeed?: number;
  /** Peak deviation from base intensity, 0..1. */
  flickerAmplitude?: number;
}

/** Pick: combined = single light canvas; split = static + dynamic siblings.
 *  Switched at boot via `?lmode=combined|split` for the L2 perf bakeoff. */
export type LightMode = 'combined' | 'split';
