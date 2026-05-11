// src/engine/net/turnFlag.ts
//
// TURN relay servers for symmetric-NAT fallback. Default ON.
// Disabling forces direct WebRTC only — useful for testing fallback failure
// modes locally, but breaks mobile-to-mobile across symmetric NATs.
//
// URL: ?turn=on|off (overrides storage). Legacy ?noturn also disables.
// Storage: carrotroyale_turn

import { createUrlStoredEmitter } from '../urlStoredEmitter';

function parse(raw: string): boolean | null {
  if (raw === 'on' || raw === '1') return true;
  if (raw === 'off' || raw === '0') return false;
  return null;
}

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_turn',
  paramName: 'turn',
  defaultValue: true,
  parse,
  serialize: (v) => v ? 'on' : 'off',
});

export const isTurnEnabled = emitter.get;
export const subscribeTurn = emitter.subscribe;
export const setTurnEnabled = emitter.set;

export function initTurn(searchString: string): void {
  emitter.init(searchString);
  // Legacy alias: `?noturn` (bare flag, no value) forces off.
  if (typeof window === 'undefined') return;
  try {
    if (new URLSearchParams(searchString).has('noturn')) emitter.set(false);
  } catch { /* sandbox */ }
}
