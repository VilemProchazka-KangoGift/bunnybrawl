// src/engine/input/RemoteInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/**
 * PlayerInput backed by the per-tick `ctx.networkInputs` buffer. Used by host
 * netcode (one RemoteInput per active slot in network mode) and ML pipelines
 * that drive inputs externally.
 *
 * Stateless w.r.t. the buffer — the host updates `ctx.networkInputs` between
 * fixedUpdate calls; this adapter just reads the slot's current entry.
 */
export class RemoteInput implements PlayerInput {
  readonly slot: PlayerSlot;

  constructor(slot: PlayerSlot) {
    this.slot = slot;
  }

  getAction(state: Readonly<MatchState>, ctx?: PlayerInputContext): InputState {
    const raw = ctx?.networkInputs?.get(this.slot);
    if (!raw) return { ...NO_INPUT };
    const self = state.players.find(p => p.id === this.slot);
    if (raw.jump && self?.state === 'airborne') {
      return { left: raw.left, right: raw.right, jump: false, down: true };
    }
    return raw;
  }
}
