// Backward-compat shim — new code should import from './input/'.
// InputManager kept as a tiny adapter over KeyboardManager so existing call sites compile.

import type { CharacterSlot, InputState } from './types';
import { KeyboardManager, KEY_BINDINGS } from './input/KeyboardManager';

export { KEY_BINDINGS };

/** @deprecated Use KeyboardManager + KeyboardInput from './input/' instead. */
export class InputManager {
  private mgr = new KeyboardManager();

  attach(): void { this.mgr.attach(); }
  detach(): void { this.mgr.detach(); }

  getInput(slot: CharacterSlot): InputState {
    return this.mgr.readSlot(slot);
  }

  getInputAny(): InputState {
    return this.mgr.readAny();
  }

  isKeyDown(key: string): boolean { return this.mgr.isKeyDown(key); }
  isAnyKeyDown(): boolean { return this.mgr.isAnyKeyDown(); }
}
