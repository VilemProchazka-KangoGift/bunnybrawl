// SharedArrayBuffer demo entry point. Default OFF — when ON, main.tsx
// dynamic-imports `./sabDemo` and runs `startSabDemo()` instead of mounting
// the React app. Dev-only experiment harness.
//
// URL: ?sabDemo=on|off (overrides storage). Legacy `?sabDemo` (bare flag,
// no value) also enables — extends BOOL_ON_OFF with empty-string=true.
// Storage: carrotroyale_sab_demo

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_sab_demo',
  paramName: 'sabDemo',
  defaultValue: false,
  parse: (raw) => raw === '' ? true : BOOL_ON_OFF.parse(raw),
  serialize: BOOL_ON_OFF.serialize,
});

export const isSabDemoEnabled = emitter.get;
export const subscribeSabDemo = emitter.subscribe;
export const setSabDemoEnabled = emitter.set;
export const initSabDemo = emitter.init;
