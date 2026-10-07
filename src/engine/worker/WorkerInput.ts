import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from '../input/PlayerInput';
import { readSlotInput } from './sabInput';

/** Asynchronous browser/worker boundary only. RemoteInput and ML policies keep
 * their verbatim per-tick semantics. Jumps persist until the simulator actually
 * reads this player (including across hitstop), then are consumed once. */
export class WorkerInput implements PlayerInput {
  private readonly out: InputState = { left: false, right: false, jump: false, down: false };
  readonly slot: PlayerSlot;
  private readonly source: Map<PlayerSlot, InputState>;
  private readonly sab: Int32Array | null;
  private readonly sabSlotIndex: number;
  private readonly isLocal: () => boolean;

  constructor(
    slot: PlayerSlot,
    source: Map<PlayerSlot, InputState>,
    sab: Int32Array | null = null,
    sabSlotIndex = -1,
    isLocal: () => boolean = () => true,
  ) {
    this.slot = slot;
    this.source = source;
    this.sab = sab;
    this.sabSlotIndex = sabSlotIndex;
    this.isLocal = isLocal;
  }

  getAction(_state: Readonly<MatchState>, _ctx?: PlayerInputContext): InputState {
    if (this.sab && this.sabSlotIndex >= 0 && this.isLocal()) {
      readSlotInput(this.sab, this.sabSlotIndex, this.out);
      return this.out;
    }
    const input = this.source.get(this.slot);
    this.out.left = input?.left ?? false;
    this.out.right = input?.right ?? false;
    this.out.jump = input?.jump ?? false;
    this.out.down = input?.down ?? false;
    if (input) input.jump = false;
    return this.out;
  }
}
