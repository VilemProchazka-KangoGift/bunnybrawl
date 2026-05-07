// src/engine/lighting/brightness.ts
//
// User brightness slider. Final composite multiplier in renderer.ts.
// Range [0.5, 1.5]. Skipped when value === 1.0.
// URL: ?brightness=0.7 (overrides storage); Storage: carrotroyale_brightness

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_brightness';
const MIN = 0.5;
const MAX = 1.5;
const DEFAULT = 1.0;

const value = createEmitter<number>(DEFAULT);

function clamp(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT;
  return Math.max(MIN, Math.min(MAX, v));
}

export const getBrightness = value.get;
export const subscribeBrightness = value.subscribe;

export function setBrightness(v: number): void {
  const clamped = clamp(v);
  value.set(clamped);
  safeStorage.set(STORAGE_KEY, String(clamped));
}

export function initBrightness(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('brightness');
  if (urlParam !== null) {
    const parsed = Number.parseFloat(urlParam);
    value.set(clamp(parsed));
    return;
  }
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored !== null) {
    const parsed = Number.parseFloat(stored);
    value.set(clamp(parsed));
    return;
  }
  value.set(DEFAULT);
}
