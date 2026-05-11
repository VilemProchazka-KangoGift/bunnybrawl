// src/engine/net/inputEchoFlag.ts
//
// Guest-side input echo: instant visual feedback (facing, squashScale,
// expression) without position prediction. Default ON.
//
// URL: ?inputEcho=on|off (overrides storage). Legacy ?noecho also disables.
// Storage: carrotroyale_input_echo

import { createUrlStoredEmitter } from '../urlStoredEmitter';

function parse(raw: string): boolean | null {
  if (raw === 'on' || raw === '1') return true;
  if (raw === 'off' || raw === '0') return false;
  return null;
}

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_input_echo',
  paramName: 'inputEcho',
  defaultValue: true,
  parse,
  serialize: (v) => v ? 'on' : 'off',
});

export const isInputEchoEnabled = emitter.get;
export const subscribeInputEcho = emitter.subscribe;
export const setInputEchoEnabled = emitter.set;

export function initInputEcho(searchString: string): void {
  emitter.init(searchString);
  // Legacy alias: `?noecho` (bare flag, no value) forces off.
  if (typeof window === 'undefined') return;
  try {
    if (new URLSearchParams(searchString).has('noecho')) emitter.set(false);
  } catch { /* sandbox */ }
}
