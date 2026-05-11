// src/engine/input/RemoteInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/**
 * PlayerInput backed by the per-tick `ctx.networkInputs` buffer. Used by host
 * netcode (one RemoteInput per active slot in network mode), sim-in-worker
 * for the local human's keyboard/touch input, and ML pipelines that drive
 * inputs externally.
 *
 * Stateless w.r.t. the buffer — the source (main thread / network peer)
 * updates `ctx.networkInputs` between fixedUpdate calls; this adapter just
 * reads the slot's current entry.
 *
 * Important: the airborne-tap→fast-fall conversion lives in the touch input
 * source (`TouchInputManager.getInputForPlayer(airborne)` via
 * `mergeKeyboardTouchInput`). Doing it here too would also fire on a raw
 * keyboard jump press, which is a regression: a player tapping their jump
 * key mid-air should be a no-op (physics gates jump on grounded), not a
 * fast-fall.
 */
export class RemoteInput implements PlayerInput {
  readonly slot: PlayerSlot;
  /** Per-instance fallback scratch returned when ctx.networkInputs has no entry
   *  for this slot. Caller consumes synchronously — same contract as KeyboardInput. */
  private readonly _fallback: InputState = { left: false, right: false, jump: false, down: false };

  constructor(slot: PlayerSlot) {
    this.slot = slot;
  }

  getAction(_state: Readonly<MatchState>, ctx?: PlayerInputContext): InputState {
    const entry = ctx?.networkInputs?.get(this.slot);
    if (entry) return entry;
    // Ensure stale fallback contents from a prior tick can't leak through if
    // anyone mutated it — re-zero on every miss.
    const f_ = this._fallback;
    f_.left = NO_INPUT.left; f_.right = NO_INPUT.right;
    f_.jump = NO_INPUT.jump; f_.down = NO_INPUT.down;
    return f_;
  }
}
