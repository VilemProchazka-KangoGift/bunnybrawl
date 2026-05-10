/**
 * Worker-only stub for KeyboardManager. The real one attaches `window`
 * listeners and tracks pressed keys; in worker, there's no window and no
 * keyboard input — keyboard state is forwarded from main via
 * `host:engineInputBatch` and consumed by RemoteInput-style adapters.
 *
 * GameLoop's constructor instantiates KeyboardManager and start() calls
 * .attach() on it. Both are no-ops here.
 */

import type { CharacterSlot } from '../../types';
import type { InputState } from '../../types';

const EMPTY: InputState = { left: false, right: false, jump: false, down: false };

export class KeyboardManager {
  attach(): void { /* no window in worker */ }
  detach(): void { /* nothing to detach */ }
  readSlot(_slot: CharacterSlot): InputState { return EMPTY; }
  readAny(): InputState { return EMPTY; }
  isAnyKeyHeld(): boolean { return false; }
  reset(): void { /* nothing */ }
  /** GameLoop's start() / stop() call onKeyDown / onKeyUp via this. Worker
   *  doesn't process keys — main does. */
  onKeyDown(_e: KeyboardEvent): void { /* unreachable in worker */ }
  onKeyUp(_e: KeyboardEvent): void { /* unreachable in worker */ }
}
