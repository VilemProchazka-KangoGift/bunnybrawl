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
  it('is version 12', () => {
    expect(PROTOCOL_VERSION).toBe(12);
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

// ===================================================================
// Additional gap-coverage tests
// ===================================================================

describe('encodeInput edge cases', () => {
  it('all-true produces non-zero byte', () => {
    const byte = encodeInput({ left: true, right: true, jump: true, down: true });
    expect(byte).not.toBe(0);
    expect(byte).toBe(0b1111); // 15
  });

  it('all-false produces zero byte', () => {
    const byte = encodeInput({ left: false, right: false, jump: false, down: false });
    expect(byte).toBe(0);
  });
});

describe('decodeSlot round-trip for all P1-P5 and B1-B5', () => {
  it('round-trips P1 through P5', () => {
    for (let i = 1; i <= 5; i++) {
      expect(decodeSlot(i)).toBe(`P${i}`);
    }
  });

  it('round-trips B1 through B5', () => {
    for (let i = 1; i <= 5; i++) {
      expect(decodeSlot(5 + i)).toBe(`B${i}`);
    }
  });

  it('covers all 10 valid slot bytes without overlap', () => {
    const results = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      results.add(decodeSlot(i));
    }
    expect(results.size).toBe(10);
  });
});

describe('encodePing buffer size', () => {
  it('is exactly 9 bytes', () => {
    const buf = encodePing(12345.678);
    expect(buf.byteLength).toBe(9);
  });

  it('encodePong is also exactly 9 bytes', () => {
    const buf = encodePong(12345.678);
    expect(buf.byteLength).toBe(9);
  });
});

describe('decodeInputMessage returns null for wrong message type', () => {
  it('returns null when first byte is PING type', () => {
    const buf = encodePing(100);
    const result = decodeInputMessage(buf);
    expect(result).toBeNull();
  });

  it('returns null when first byte is PONG type', () => {
    const buf = encodePong(100);
    const result = decodeInputMessage(buf);
    expect(result).toBeNull();
  });

  it('returns null for a buffer with HANDSHAKE type byte', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint8(0, MsgType.HANDSHAKE);
    const result = decodeInputMessage(buf);
    expect(result).toBeNull();
  });
});

describe('encodeInputMessage with 0 inputs', () => {
  it('encodes and decodes with zero input count', () => {
    const buf = encodeInputMessage([], 0, 0, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.inputCount).toBe(0);
    expect(decoded!.latestAck).toBe(0);
  });
});

describe('Large frame numbers round-trip', () => {
  it('near uint32 max round-trips correctly', () => {
    const maxFrame = 0xFFFFFFFE; // 4294967294
    const inputs = [{ frame: maxFrame, input: { left: true, right: false, jump: true, down: false } }];
    const buf = encodeInputMessage(inputs, maxFrame, undefined, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.inputs[0].frame).toBe(maxFrame);
    expect(decoded!.latestAck).toBe(maxFrame);
    expect(decoded!.inputs[0].input.left).toBe(true);
    expect(decoded!.inputs[0].input.jump).toBe(true);
  });

  it('uint32 max (0xFFFFFFFF) round-trips correctly', () => {
    const maxFrame = 0xFFFFFFFF; // 4294967295
    const inputs = [{ frame: maxFrame, input: { left: false, right: true, jump: false, down: true } }];
    const buf = encodeInputMessage(inputs, maxFrame, undefined, 'P2');
    const decoded = decodeInputMessage(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.inputs[0].frame).toBe(maxFrame);
    expect(decoded!.latestAck).toBe(maxFrame);
  });

  it('frame 0 and large frame in same bundle', () => {
    const inputs = [
      { frame: 0, input: { left: true, right: false, jump: false, down: false } },
      { frame: 0xFFFFFFFF, input: { left: false, right: true, jump: false, down: false } },
    ];
    const buf = encodeInputMessage(inputs, 0xFFFFFFFF, undefined, 'P1');
    const decoded = decodeInputMessage(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.inputCount).toBe(2);
    expect(decoded!.inputs[0].frame).toBe(0);
    expect(decoded!.inputs[0].input.left).toBe(true);
    expect(decoded!.inputs[1].frame).toBe(0xFFFFFFFF);
    expect(decoded!.inputs[1].input.right).toBe(true);
  });
});
