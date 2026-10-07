import type { InputState, PlayerSlot } from '../types';

/** Latest held levels plus a pending jump until WorkerInput consumes it. */
export function applyInputBatchTo(
  target: Map<PlayerSlot, InputState>,
  inputs: ReadonlyArray<readonly [PlayerSlot, InputState]>,
): void {
  // Copy into worker-owned scratches; retain jumps across newer neutral samples.
  // Evict absent slots without allocating a per-batch Set.
  for (const slot of target.keys()) {
    let present = false;
    for (const [incomingSlot] of inputs) {
      if (incomingSlot === slot) { present = true; break; }
    }
    if (!present) target.delete(slot);
  }
  for (const [slot, input] of inputs) {
    let buffered = target.get(slot);
    if (!buffered) {
      buffered = { left: false, right: false, jump: false, down: false };
      target.set(slot, buffered);
    }
    buffered.left = input.left;
    buffered.right = input.right;
    buffered.jump ||= input.jump;
    buffered.down = input.down;
  }
}

