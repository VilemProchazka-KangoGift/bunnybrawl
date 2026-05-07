// src/engine/lighting/lightMode.ts
//
// Compositing mode for L2 emitters. `?lmode=combined` = single light canvas
// (drawImage cache + dynamic stamps + flicker on one DOM sibling). `?lmode=split`
// = two siblings (static rasterized once, dynamic redrawn per frame). Default
// `combined`. Toggle persists in localStorage so a chosen mode survives reload.
//
// L1 used the same URL+storage pattern for `?lighting=off` / `?brightness=` /
// etc. — see urlStoredEmitter.ts for the factory.

import { createUrlStoredEmitter } from './urlStoredEmitter';
import type { LightMode } from './types';

function parse(raw: string): LightMode | null {
  if (raw === 'combined' || raw === 'split') return raw;
  return null;
}

const emitter = createUrlStoredEmitter<LightMode>({
  storageKey: 'carrotroyale_lmode',
  paramName: 'lmode',
  defaultValue: 'combined',
  parse,
  serialize: (m) => m,
});

export const getLightMode = emitter.get;
export const subscribeLightMode = emitter.subscribe;
export const setLightMode = emitter.set;
export const initLightMode = emitter.init;
