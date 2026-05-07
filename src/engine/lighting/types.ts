// src/engine/lighting/types.ts
//
// Lighting subsystem types. M1 has minimal types; L2+ adds Light/LightKind etc.

export type PerfTier = 'low' | 'med' | 'high';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SunContribution {
  /** Screen-space angle in radians; 0 = right, π/2 = up, π = left */
  angle: number;
  /** Sun light color */
  color: RGB;
  /** 0..1 intensity at this dayPhase */
  intensity: number;
}
