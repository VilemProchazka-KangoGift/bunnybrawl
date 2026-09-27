// src/engine/lighting/perfTier.ts
//
// User-selected perf tier for the lighting subsystem.
// URL: ?perfTier=low|med|high (overrides storage)
// Storage: carrotroyale_perf_tier
// In M1 only "med" is implemented; low/high fall through. L2+ adds tier branching.

import type { PerfTier } from './types';
import { createUrlStoredEmitter } from '../urlStoredEmitter';

function parse(raw: string): PerfTier | null {
  return raw === 'low' || raw === 'med' || raw === 'high' ? raw : null;
}

const emitter = createUrlStoredEmitter<PerfTier>({
  storageKey: 'carrotroyale_perf_tier',
  paramName: 'perfTier',
  defaultValue: 'med',
  parse,
  serialize: (v) => v,
});

export const getPerfTier = emitter.get;
export const subscribePerfTier = emitter.subscribe;
export const setPerfTier = emitter.set;
export const initPerfTier = emitter.init;
