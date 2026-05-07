// src/engine/lighting/photosensitivity.ts
//
// Photosensitivity accessibility toggle. When ON:
//   - Ambient floor never crosses below rgb(120, 130, 160) (L1)
//   - Sun intensity capped at 70% (L1)
//   - Flicker amplitudes reduced to ~10% (L2+)
//   - Hard flashes capped (L2+)
//
// URL: ?photosensitivity=on|off (overrides storage)
// Storage: carrotroyale_photosensitivity ('on'/'off' — matches lighting kill-switch convention)

import { createUrlStoredEmitter } from './urlStoredEmitter';

function parse(raw: string): boolean | null {
  if (raw === 'on' || raw === '1') return true;
  if (raw === 'off' || raw === '0') return false;
  return null;
}

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_photosensitivity',
  paramName: 'photosensitivity',
  defaultValue: false,
  parse,
  serialize: (v) => v ? 'on' : 'off',
});

export const getPhotosensitivity = emitter.get;
export const subscribePhotosensitivity = emitter.subscribe;
export const setPhotosensitivity = emitter.set;
export const initPhotosensitivity = emitter.init;
