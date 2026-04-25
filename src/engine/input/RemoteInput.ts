// src/engine/input/RemoteInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput } from './PlayerInput';

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/** PlayerInput backed by an externally-managed buffer (host netcode, ML pipelines). */
export class RemoteInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly inputs: ReadonlyMap<string, InputState>;

  constructor(slot: PlayerSlot, inputs: ReadonlyMap<string, InputState>) {
    this.slot = slot;
    this.inputs = inputs;
  }

  getAction(state: Readonly<MatchState>): InputState {
    const raw = this.inputs.get(this.slot);
    if (!raw) return { ...NO_INPUT };
    const self = state.players.find(p => p.id === this.slot);
    if (raw.jump && self?.state === 'airborne') {
      return { left: raw.left, right: raw.right, jump: false, down: true };
    }
    return raw;
  }
}
