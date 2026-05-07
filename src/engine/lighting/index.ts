// src/engine/lighting/index.ts
//
// Public surface for the lighting subsystem.
// initLighting(searchString) parses ?lighting=off and seeds the emitter.
// Module-scope state matches perfFlags.ts pattern.

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_lighting_off';

const enabled = createEmitter<boolean>(true);

export const isLightingEnabled = enabled.get;
export const subscribeLightingEnabled = enabled.subscribe;

export function setLightingEnabled(v: boolean): void {
  enabled.set(v);
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
}

/**
 * Parse `?lighting=off` URL param and persisted localStorage. URL wins over storage.
 * Default: enabled.
 */
export function initLighting(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('lighting');
  if (urlParam === 'off') {
    enabled.set(false);
    return;
  }
  if (urlParam === 'on') {
    enabled.set(true);
    return;
  }
  // No URL override: read storage. '1' means kill switch active (lighting OFF).
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === '1') enabled.set(false);
}

export type { PerfTier, RGB, SunContribution } from './types';
export { LightingPipeline } from './pipeline';
