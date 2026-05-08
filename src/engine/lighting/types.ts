// src/engine/lighting/types.ts
//
// Lighting subsystem types.

export type PerfTier = 'low' | 'med' | 'high';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Light catalog (L2). Discriminated by `kind` so spot-only fields never
 *  appear on point lights, and so flicker config is atomic (you can't have
 *  a seed without an amplitude or vice versa). */
export type LightKind = 'point' | 'spot';
export type Falloff = 'inverse-square' | 'linear' | 'smoothstep';

/** Optional per-tick intensity modulation, deterministic via
 *  `SeededRNG.floatFromTick(seed, tick)`. Both fields are required when
 *  flicker is set — half-config is a compile error. */
export interface Flicker {
  seed: number;
  /** Peak deviation from base intensity, 0..1. */
  amplitude: number;
}

interface CommonLight {
  /** Logical 1280×720 coordinates. */
  x: number;
  y: number;
  color: RGB;
  /** 0..1 — global photosensitivity cap (0.7) applied at composite time. */
  intensity: number;
  /** Falloff radius in logical px. */
  radius: number;
  falloff: Falloff;
  flicker?: Flicker;
}

export interface PointLight extends CommonLight {
  kind: 'point';
}

export interface SpotLight extends CommonLight {
  kind: 'spot';
  /** Cone center direction, radians. 0 = right, π/2 = down. */
  direction: number;
  /** Full cone angular width in radians. */
  cone: number;
}

export type Light = PointLight | SpotLight;

