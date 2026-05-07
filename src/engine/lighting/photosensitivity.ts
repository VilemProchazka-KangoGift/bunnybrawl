// src/engine/lighting/photosensitivity.ts
//
// Photosensitivity accessibility toggle. When ON:
//   - Ambient floor never crosses below rgb(120, 130, 160) (L1)
//   - Sun intensity capped at 70% (L1)
//   - Flicker amplitudes reduced to ~10% (L2+)
//   - Hard flashes capped (L2+)
//
// URL: ?photosensitivity=on|off (overrides storage)
// Storage: carrotroyale_photosensitivity

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_photosensitivity';

const value = createEmitter<boolean>(false);

export const getPhotosensitivity = value.get;
export const subscribePhotosensitivity = value.subscribe;

export function setPhotosensitivity(v: boolean): void {
  value.set(v);
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
}

export function initPhotosensitivity(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('photosensitivity');
  if (urlParam === 'on') { value.set(true); return; }
  if (urlParam === 'off') { value.set(false); return; }
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === '1') { value.set(true); return; }
  value.set(false);
}
