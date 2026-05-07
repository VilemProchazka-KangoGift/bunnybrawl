// src/engine/lighting/index.ts
//
// Lighting kill switch + public surface. `?lighting=off` makes
// LightingPipeline a no-op via isLightingEnabled() — accessibility safety
// valve plus regression-test hook (every L*+ pillar must produce a clean
// downgrade when the toggle is set).

import { createUrlStoredEmitter } from './urlStoredEmitter';

function parse(raw: string): boolean | null {
  if (raw === 'on' || raw === '1') return true;
  if (raw === 'off' || raw === '0') return false;
  return null;
}

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_lighting',
  paramName: 'lighting',
  defaultValue: true,
  parse,
  // Store as 'on'/'off' so URL and storage share the same parse path. The
  // original key was `carrotroyale_lighting_off` with '1' = off / '0' = on,
  // which created a parse-vs-serialize asymmetry. New key + format avoids
  // that; old key just falls through to the default (lighting enabled),
  // which is benign for the kill switch.
  serialize: (enabled) => enabled ? 'on' : 'off',
});

export const isLightingEnabled = emitter.get;
export const subscribeLightingEnabled = emitter.subscribe;
export const setLightingEnabled = emitter.set;
export const initLighting = emitter.init;

export type { PerfTier, RGB, SunContribution } from './types';
export { LightingPipeline } from './pipeline';
