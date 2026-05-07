// src/engine/lighting/brightness.ts
//
// User brightness slider. Final composite multiplier in renderer.ts.
// Range [0.5, 1.5]. Skipped when value === 1.0.
// URL: ?brightness=0.7 (overrides storage); Storage: carrotroyale_brightness

import { createUrlStoredEmitter } from './urlStoredEmitter';

const MIN = 0.5;
const MAX = 1.5;

function parse(raw: string): number | null {
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  return Math.max(MIN, Math.min(MAX, v));
}

const emitter = createUrlStoredEmitter<number>({
  storageKey: 'carrotroyale_brightness',
  paramName: 'brightness',
  defaultValue: 1.0,
  parse,
});

export const getBrightness = emitter.get;
export const subscribeBrightness = emitter.subscribe;
export const setBrightness = emitter.set;
export const initBrightness = emitter.init;
