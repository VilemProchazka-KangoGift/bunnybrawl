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

  it('includes all expected message types', () => {
    expect(MsgType.INPUT).toBeDefined();
    expect(MsgType.PING).toBeDefined();
    expect(MsgType.PONG).toBeDefined();
    expect(MsgType.HANDSHAKE).toBeDefined();
    expect(MsgType.CHARACTER_SELECT).toBeDefined();
    expect(MsgType.START_MATCH).toBeDefined();
    expect(MsgType.DESYNC_CHECK).toBeDefined();
    expect(MsgType.DESYNC_REQUEST).toBeDefined();
    expect(MsgType.DESYNC_CORRECTION).toBeDefined();
  });
});

describe('Input message bundling', () => {
  it('encodes and decodes 1 input', () => {
    const inputs = [{ frame: 0, input: { left: true, right: false, jump: false, down: false } }];
    const buf = encodeInputMessage(inputs, 0, undefined, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded!.inputCount).toBe(1);
    expect(decoded!.inputs[0].input.left).toBe(true);
  });

  it('encodes and decodes 10 inputs (max bundle)', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      frame: i,
      input: { left: i % 2 === 0, right: i % 2 !== 0, jump: false, down: false },
    }));
    const buf = encodeInputMessage(inputs, 9, undefined, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded!.inputCount).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(decoded!.inputs[i].frame).toBe(i);
      expect(decoded!.inputs[i].input.left).toBe(i % 2 === 0);
    }
  });

  it('custom inputCount limits the encoded count', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      frame: i,
      input: { left: false, right: false, jump: false, down: false },
    }));
    const buf = encodeInputMessage(inputs, 0, 3, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded!.inputCount).toBe(3);
  });

  it('latestAck is preserved through encode/decode', () => {
    const inputs = [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }];
    const buf = encodeInputMessage(inputs, 42, undefined, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded!.latestAck).toBe(42);
  });
});

describe('Ping/Pong timestamps', () => {
  it('ping preserves high-precision timestamp', () => {
    const ts = 123456.789;
    const buf = encodePing(ts);
    const decoded = decodePingPong(buf);
    expect(decoded!.type).toBe(MsgType.PING);
    expect(decoded!.timestamp).toBeCloseTo(ts, 2);
  });

  it('pong preserves high-precision timestamp', () => {
    const ts = 987654.321;
    const buf = encodePong(ts);
    const decoded = decodePingPong(buf);
    expect(decoded!.type).toBe(MsgType.PONG);
    expect(decoded!.timestamp).toBeCloseTo(ts, 2);
  });

  it('ping and pong have different type bytes', () => {
    const ping = decodePingPong(encodePing(0));
    const pong = decodePingPong(encodePong(0));
    expect(ping!.type).not.toBe(pong!.type);
  });
});
