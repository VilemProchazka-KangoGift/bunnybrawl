import { describe, it, expect } from 'vitest';
import {
  encodeInputBits, decodeInputBits, writeSlotInput, readSlotInput,
  setSlotCount, getSlotCount, SAB_INPUT_HEADER, SAB_INPUT_MAX_SLOTS,
} from '../sabInput';
import type { InputState } from '../../types';

const empty = (): InputState => ({ left: false, right: false, jump: false, down: false });

describe('sabInput encode/decode', () => {
  it('round-trips all 16 button combinations', () => {
    for (let bits = 0; bits < 16; bits++) {
      const input: InputState = {
        left: (bits & 1) !== 0,
        right: (bits & 2) !== 0,
        jump: (bits & 4) !== 0,
        down: (bits & 8) !== 0,
      };
      const encoded = encodeInputBits(input);
      const out = empty();
      decodeInputBits(encoded, out);
      expect(out, `bits=${bits}`).toEqual(input);
    }
  });

  it('writes/reads per-slot independently via the typed view', () => {
    // Use a plain ArrayBuffer for the test — Atomics works on both
    // SharedArrayBuffer and ArrayBuffer views in modern V8.
    const view = new Int32Array(new ArrayBuffer((SAB_INPUT_HEADER + SAB_INPUT_MAX_SLOTS) * 4));

    setSlotCount(view, 3);
    expect(getSlotCount(view)).toBe(3);

    writeSlotInput(view, 0, { left: true, right: false, jump: true, down: false });
    writeSlotInput(view, 1, { left: false, right: true, jump: false, down: true });
    writeSlotInput(view, 2, { left: false, right: false, jump: false, down: false });

    const a = empty();
    const b = empty();
    const c = empty();
    readSlotInput(view, 0, a);
    readSlotInput(view, 1, b);
    readSlotInput(view, 2, c);

    expect(a).toEqual({ left: true, right: false, jump: true, down: false });
    expect(b).toEqual({ left: false, right: true, jump: false, down: true });
    expect(c).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('overwrites in place — last write wins', () => {
    const view = new Int32Array(new ArrayBuffer((SAB_INPUT_HEADER + SAB_INPUT_MAX_SLOTS) * 4));
    writeSlotInput(view, 0, { left: true, right: true, jump: true, down: true });
    writeSlotInput(view, 0, { left: false, right: false, jump: false, down: false });
    const out = empty();
    readSlotInput(view, 0, out);
    expect(out).toEqual({ left: false, right: false, jump: false, down: false });
  });
});
