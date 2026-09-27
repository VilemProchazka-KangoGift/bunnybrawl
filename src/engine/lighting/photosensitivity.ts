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

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_photosensitivity',
  paramName: 'photosensitivity',
  defaultValue: false,
  ...BOOL_ON_OFF,
});

export const getPhotosensitivity = emitter.get;
export const subscribePhotosensitivity = emitter.subscribe;
export const setPhotosensitivity = emitter.set;
export const initPhotosensitivity = emitter.init;
