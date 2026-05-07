// src/engine/lighting/types.ts
//
// Lighting subsystem types. M1 has minimal types; L2+ adds Light/LightKind etc.

export type PerfTier = 'low' | 'med' | 'high';

export interface RGB {
  r: number;
  g: number;
  b: number;
}
