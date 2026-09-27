// Guest-side input echo: instant visual feedback (facing, squashScale,
// expression) without position prediction. Default ON.
//
// URL: ?inputEcho=on|off (overrides storage). Legacy `?noecho` also disables.
// Storage: carrotroyale_input_echo

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_input_echo',
  paramName: 'inputEcho',
  defaultValue: true,
  ...BOOL_ON_OFF,
  legacyDisableParam: 'noecho',
});

export const isInputEchoEnabled = emitter.get;
export const subscribeInputEcho = emitter.subscribe;
export const setInputEchoEnabled = emitter.set;
export const initInputEcho = emitter.init;
