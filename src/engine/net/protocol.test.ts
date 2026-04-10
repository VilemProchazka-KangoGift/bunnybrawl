import { describe, it, expect } from 'vitest';
import {
  encodeInput, decodeInput,
  encodeInputMessage, decodeInputMessage,
  encodePing, encodePong, decodePingPong,
  decodeSlot,
  MsgType, PROTOCOL_VERSION,
} from './protocol';

describe('decodeSlot', () => {
  it('decodes player slots P1-P5', () => {
    expect(decodeSlot(1)).toBe('P1');
    expect(decodeSlot(2)).toBe('P2');
    expect(decodeSlot(3)).toBe('P3');
    expect(decodeSlot(4)).toBe('P4');
    expect(decodeSlot(5)).toBe('P5');
  });

  it('decodes bot slots B1-B5', () => {
    expect(decodeSlot(6)).toBe('B1');
    expect(decodeSlot(7)).toBe('B2');
    expect(decodeSlot(8)).toBe('B3');
    expect(decodeSlot(9)).toBe('B4');
    expect(decodeSlot(10)).toBe('B5');
  });

  it('returns P1 for unknown byte values', () => {
    expect(decodeSlot(0)).toBe('P1');
    expect(decodeSlot(11)).toBe('P1');
    expect(decodeSlot(255)).toBe('P1');
  });
});

describe('encodeInput / decodeInput round-trip', () => {
  it('round-trips all 16 possible input combinations', () => {
    const booleans = [false, true];
    for (const left of booleans) {
      for (const right of booleans) {
        for (const jump of booleans) {
          for (const down of booleans) {
            const input = { left, right, jump, down };
            const encoded = encodeInput(input);
            const decoded = decodeInput(encoded);
            expect(decoded).toEqual(input);
          }
        }
      }
    }
  });
});

describe('encodePong', () => {
  it('encodes and decodes pong timestamp', () => {
    const ts = 98765.432;
    const buf = encodePong(ts);
    const decoded = decodePingPong(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe(MsgType.PONG);
    expect(decoded!.timestamp).toBeCloseTo(ts);
  });
});

describe('Input message source slot round-trip', () => {
  it('preserves source slot P1-P5', () => {
    for (let i = 1; i <= 5; i++) {
      const slot = `P${i}`;
      const buf = encodeInputMessage(
        [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
        0, undefined, slot,
      );
      const decoded = decodeInputMessage(buf);
      expect(decoded).not.toBeNull();
      expect(decodeSlot(decoded!.source)).toBe(slot);
    }
  });
});

describe('PROTOCOL_VERSION', () => {
  it('is version 4', () => {
    expect(PROTOCOL_VERSION).toBe(4);
  });
});

describe('MsgType values are unique', () => {
  it('all message types have distinct values', () => {
    const values = Object.values(MsgType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
