// TURN relay servers for symmetric-NAT fallback. Default ON.
// Disabling forces direct WebRTC only — useful for testing fallback failure
// modes locally, but breaks mobile-to-mobile across symmetric NATs.
//
// URL: ?turn=on|off (overrides storage). Legacy `?noturn` also disables.
// Storage: carrotroyale_turn

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_turn',
  paramName: 'turn',
  defaultValue: true,
  ...BOOL_ON_OFF,
  legacyDisableParam: 'noturn',
});

export const isTurnEnabled = emitter.get;
export const subscribeTurn = emitter.subscribe;
export const setTurnEnabled = emitter.set;
export const initTurn = emitter.init;
