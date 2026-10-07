/** SAB-backed input wire for sim-in-worker mode — Step 2 of the SAB
 *  exploration roadmap.
 *
 *  Replaces the `host:engineInputBatch` postMessage hop for active human
 *  slots with a tiny SharedArrayBuffer. Each slot gets one Int32 holding
 *  held levels plus a pending jump bit. Main publishes changes atomically;
 *  WorkerInput clears only the jump bit when the simulator reads that slot.
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
 *  NOT the raw player slot. Uses atomic compare-and-exchange for visibility. */
export function writeSlotInput(view: Int32Array, slotIdx: number, input: InputState): void {
  const index = SAB_INPUT_HEADER + slotIdx;
  const levels = encodeInputBits(input);
  let previous = Atomics.load(view, index);
  for (;;) {
    // Preserve a pending jump while replacing held levels. CAS prevents a
    // concurrent consume from being resurrected by a stale producer read.
    const next = levels | (previous & BIT_JUMP);
    const actual = Atomics.compareExchange(view, index, previous, next);
    if (actual === previous) break;
    previous = actual;
  }
}

/** Read held levels and atomically consume a pending jump into a reused scratch. */
export function readSlotInput(view: Int32Array, slotIdx: number, out: InputState): void {
  // Consume only the jump bit; held movement/Down remain visible next tick.
  decodeInputBits(Atomics.and(view, SAB_INPUT_HEADER + slotIdx, ~BIT_JUMP), out);
}

export function setSlotCount(view: Int32Array, count: number): void {
  Atomics.store(view, 1, count);
}

export function getSlotCount(view: Int32Array): number {
  return Atomics.load(view, 1);
}

/** Discard pulses at pause boundaries while preserving held levels. */
export function clearPendingSabJumps(view: Int32Array): void {
  for (let i = 0; i < getSlotCount(view); i++) Atomics.and(view, SAB_INPUT_HEADER + i, ~BIT_JUMP);
}

/** Reset inputs on an ownership transition; retain wire headers. */
export function resetSlotInputs(view: Int32Array): void {
  for (let i = 0; i < SAB_INPUT_MAX_SLOTS; i++) Atomics.store(view, SAB_INPUT_HEADER + i, 0);
}
