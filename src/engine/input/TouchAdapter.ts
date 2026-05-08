// src/engine/input/TouchAdapter.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';
import type { TouchInputProvider } from '../simulator/types';

/**
 * PlayerInput backed by a TouchInputProvider (TouchInputManager on the browser
 * side). Reads `ctx.airborne` per tick to apply the airborne-tap → fast-fall
 * gesture conversion that lives inside `getInputForPlayer`.
 *
 * Installed into the simulator's playerInputs map for the local touch slot in
 * place of a KeyboardInput. State lookup falls back to the player's actual
 * `state` field if ctx.airborne is undefined (e.g. test paths or non-touch
 * adapter configurations).
 */
export class TouchAdapter implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly provider: TouchInputProvider;

  constructor(slot: PlayerSlot, provider: TouchInputProvider) {
    this.slot = slot;
    this.provider = provider;
  }

  getAction(state: Readonly<MatchState>, ctx?: PlayerInputContext): InputState {
    let airborne = ctx?.airborne;
    if (airborne === undefined) {
      const self = state.players.find(p => p.id === this.slot);
      airborne = self?.state === 'airborne';
    }
    return this.provider.getInputForPlayer(airborne);
  }
}
