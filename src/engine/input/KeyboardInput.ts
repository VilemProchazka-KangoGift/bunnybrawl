// src/engine/input/KeyboardInput.ts
import type { InputState, MatchState, PlayerSlot, CharacterSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';
import type { KeyboardManager } from './KeyboardManager';

/** PlayerInput backed by a slot's keyboard bindings. */
export class KeyboardInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly mgr: KeyboardManager;
  private readonly characterSlot: CharacterSlot;

  constructor(slot: CharacterSlot, mgr: KeyboardManager) {
    this.slot = slot;
    this.characterSlot = slot;
    this.mgr = mgr;
  }

  getAction(_state: Readonly<MatchState>, _ctx?: PlayerInputContext): InputState {
    return this.mgr.readSlot(this.characterSlot);
  }
}
