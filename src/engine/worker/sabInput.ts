/** SAB-backed input wire for sim-in-worker mode — Step 2 of the SAB
 *  exploration roadmap.
 *
 *  Replaces the `host:engineInputBatch` postMessage hop for active human
 *  slots with a tiny SharedArrayBuffer. Each slot gets one Int32 holding
 *  a bitfield of the four `InputState` booleans. Main `Atomics.store`s
 *  on change; the worker `Atomics.load`s every tick into its `inputMap`.
 *
 *  Wire layout (all Int32):
 *    [0]            = generation — bumped from main if the slot mapping
 *                     ever changes (currently never; activePlayers is
 *                     fixed for a match). Reserved for future-proofing.
 *    [1]            = slotCount — number of human slots encoded below.
 *    [2 .. 2+N-1]   = per-slot bitfield (bit 0=left, 1=right, 2=jump, 3=down).
 *
 *  Slot ordering: matches the `humanSlots` array sent in `host:initEngine`.
 *  Both sides know it up front; we never have to ship slot IDs in the SAB.
 *
 *  Fallback: this whole path is gated on `crossOriginIsolated`. On
 *  GitHub Pages (no COOP/COEP), main keeps shipping `host:engineInputBatch`
 *  messages and the worker keeps its existing handler. */

import type { InputState } from '../types';

export const SAB_INPUT_HEADER = 2;
export const SAB_INPUT_MAX_SLOTS = 10; // P1-P5 + B1-B5 upper bound, even though bots stay local
export const SAB_INPUT_BYTES = (SAB_INPUT_HEADER + SAB_INPUT_MAX_SLOTS) * 4;

const BIT_LEFT = 1 << 0;
const BIT_RIGHT = 1 << 1;
const BIT_JUMP = 1 << 2;
const BIT_DOWN = 1 << 3;

export function isSabSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
    && typeof crossOriginIsolated !== 'undefined'
    && crossOriginIsolated === true;
}

export function createInputSab(): SharedArrayBuffer | null {
  if (!isSabSupported()) return null;
  return new SharedArrayBuffer(SAB_INPUT_BYTES);
}

export function encodeInputBits(input: InputState): number {
  let v = 0;
  if (input.left) v |= BIT_LEFT;
  if (input.right) v |= BIT_RIGHT;
  if (input.jump) v |= BIT_JUMP;
  if (input.down) v |= BIT_DOWN;
  return v;
}

export function decodeInputBits(v: number, out: InputState): void {
  out.left = (v & BIT_LEFT) !== 0;
  out.right = (v & BIT_RIGHT) !== 0;
  out.jump = (v & BIT_JUMP) !== 0;
  out.down = (v & BIT_DOWN) !== 0;
}

/** Write a slot's input. `slotIdx` is the human-slot index (0..N-1),
 *  NOT the raw player slot. Uses Atomics.store for cross-thread visibility. */
export function writeSlotInput(view: Int32Array, slotIdx: number, input: InputState): void {
  Atomics.store(view, SAB_INPUT_HEADER + slotIdx, encodeInputBits(input));
}

/** Read a slot's input into `out`. Returns true if the field decoded
 *  cleanly. The worker pre-allocates one `InputState` per slot and
 *  reuses it across ticks; this function mutates `out` in place. */
export function readSlotInput(view: Int32Array, slotIdx: number, out: InputState): void {
  decodeInputBits(Atomics.load(view, SAB_INPUT_HEADER + slotIdx), out);
}

export function setSlotCount(view: Int32Array, count: number): void {
  Atomics.store(view, 1, count);
}

export function getSlotCount(view: Int32Array): number {
  return Atomics.load(view, 1);
}
