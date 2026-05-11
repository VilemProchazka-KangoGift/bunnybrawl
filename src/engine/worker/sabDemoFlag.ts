// src/engine/worker/sabDemoFlag.ts
//
// SharedArrayBuffer demo entry point. Default OFF — when ON, main.tsx
// dynamic-imports `./sabDemo` and runs `startSabDemo()` instead of mounting
// the React app. Dev-only experiment harness.
//
// URL: ?sabDemo=on|off (overrides storage). Legacy ?sabDemo (bare flag) also enables.
// Storage: carrotroyale_sab_demo

import { createUrlStoredEmitter } from '../urlStoredEmitter';

function parse(raw: string): boolean | null {
  if (raw === 'on' || raw === '1' || raw === '') return true;
  if (raw === 'off' || raw === '0') return false;
  return null;
}

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_sab_demo',
  paramName: 'sabDemo',
  defaultValue: false,
  parse,
  serialize: (v) => v ? 'on' : 'off',
});

export const isSabDemoEnabled = emitter.get;
export const subscribeSabDemo = emitter.subscribe;
export const setSabDemoEnabled = emitter.set;
export const initSabDemo = emitter.init;
