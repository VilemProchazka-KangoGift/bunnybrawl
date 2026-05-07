// src/engine/lighting/perfTier.ts
//
// User-selected perf tier for the lighting subsystem.
// URL: ?perfTier=low|med|high (overrides storage)
// Storage: carrotroyale_perf_tier
// In M1 only "med" is implemented; low/high fall through. L2+ adds tier branching.

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';
import type { PerfTier } from './types';

const STORAGE_KEY = 'carrotroyale_perf_tier';

const tier = createEmitter<PerfTier>('med');

export const getPerfTier = tier.get;
export const subscribePerfTier = tier.subscribe;

function isValid(v: string | null): v is PerfTier {
  return v === 'low' || v === 'med' || v === 'high';
}

export function setPerfTier(v: PerfTier): void {
  tier.set(v);
  safeStorage.set(STORAGE_KEY, v);
}

/** Parse ?perfTier=... and persisted localStorage. URL wins; default = 'med'. */
export function initPerfTier(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('perfTier');
  if (isValid(urlParam)) {
    tier.set(urlParam);
    return;
  }
  const stored = safeStorage.get(STORAGE_KEY);
  if (isValid(stored)) {
    tier.set(stored);
    return;
  }
  tier.set('med');
}
