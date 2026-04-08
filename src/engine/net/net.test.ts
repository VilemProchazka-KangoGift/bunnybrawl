import { describe, it, expect } from 'vitest';
import { SeededRNG } from './prng';
import {
  encodeInput, decodeInput,
  encodeInputMessage, decodeInputMessage,
  encodePing, decodePingPong,
  MsgType,
} from './protocol';
import { crc32 } from './serialize';

describe('SeededRNG', () => {
  it('produces deterministic sequences', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);
    const aVals = Array.from({ length: 10 }, () => a.nextFloat());
    const bVals = Array.from({ length: 10 }, () => b.nextFloat());
    expect(aVals).not.toEqual(bVals);
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('saves and restores state', () => {
    const rng = new SeededRNG(99);
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const state = rng.getState();
    const v1 = rng.nextFloat();
    const v2 = rng.nextFloat();

    rng.setState(state);
    expect(rng.nextFloat()).toBe(v1);
    expect(rng.nextFloat()).toBe(v2);
  });

  it('clone produces identical sequence', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 20; i++) rng.nextFloat();
    const clone = rng.clone();
    for (let i = 0; i < 50; i++) {
      expect(rng.nextFloat()).toBe(clone.nextFloat());
    }
  });

  it('nextRange produces values in [min, max)', () => {
    const rng = new SeededRNG(555);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextRange(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('nextInt produces integers in [min, max]', () => {
    const rng = new SeededRNG(777);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(0, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('Protocol encoding', () => {
  it('encodes and decodes input bitfield', () => {
    const cases = [
      { left: false, right: false, jump: false, down: false },
      { left: true, right: false, jump: false, down: false },
      { left: false, right: true, jump: false, down: false },
      { left: false, right: false, jump: true, down: false },
      { left: false, right: false, jump: false, down: true },
      { left: true, right: true, jump: true, down: true },
      { left: true, right: false, jump: true, down: false },
    ];
    for (const input of cases) {
      const encoded = encodeInput(input);
      const decoded = decodeInput(encoded);
      expect(decoded).toEqual(input);
    }
  });

  it('encodes and decodes input messages with bundling', () => {
    const inputs = [
      { frame: 10, input: { left: true, right: false, jump: false, down: false } },
      { frame: 11, input: { left: true, right: false, jump: true, down: false } },
      { frame: 12, input: { left: false, right: true, jump: false, down: true } },
    ];
    const latestAck = 8;

    const buf = encodeInputMessage(inputs, latestAck);
    const decoded = decodeInputMessage(buf);

    expect(decoded).not.toBeNull();
    expect(decoded!.inputs).toHaveLength(3);
    expect(decoded!.latestAck).toBe(latestAck);

    for (let i = 0; i < inputs.length; i++) {
      expect(decoded!.inputs[i].frame).toBe(inputs[i].frame);
      expect(decoded!.inputs[i].input).toEqual(inputs[i].input);
    }
  });

  it('handles frame number wrapping (uint16)', () => {
    const inputs = [
      { frame: 65534, input: { left: true, right: false, jump: false, down: false } },
      { frame: 65535, input: { left: false, right: true, jump: false, down: false } },
      { frame: 0, input: { left: false, right: false, jump: true, down: false } }, // wrapped
    ];

    const buf = encodeInputMessage(inputs, 65533);
    const decoded = decodeInputMessage(buf);

    expect(decoded!.inputs[0].frame).toBe(65534);
    expect(decoded!.inputs[1].frame).toBe(65535);
    expect(decoded!.inputs[2].frame).toBe(0);
  });

  it('encodes and decodes ping/pong', () => {
    const timestamp = 12345.678;
    const pingBuf = encodePing(timestamp);
    const decoded = decodePingPong(pingBuf);

    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe(MsgType.PING);
    expect(decoded!.timestamp).toBeCloseTo(timestamp);
  });

  it('rejects malformed messages', () => {
    const empty = new ArrayBuffer(0);
    expect(decodeInputMessage(empty)).toBeNull();
    expect(decodePingPong(empty)).toBeNull();

    const tooShort = new ArrayBuffer(2);
    expect(decodePingPong(tooShort)).toBeNull();
  });
});

describe('CRC32', () => {
  it('produces consistent hashes', () => {
    expect(crc32('hello')).toBe(crc32('hello'));
    expect(crc32('')).toBe(crc32(''));
  });

  it('produces different hashes for different inputs', () => {
    expect(crc32('hello')).not.toBe(crc32('world'));
    expect(crc32('abc')).not.toBe(crc32('abd'));
  });

  it('returns a positive 32-bit integer', () => {
    const hash = crc32('test string');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
    expect(Number.isInteger(hash)).toBe(true);
  });
});

describe('PeerJS import', () => {
  it('can import peerjs module', async () => {
    // Just verify the module resolves — can't create actual peers without a browser
    const peerjs = await import('peerjs');
    expect(peerjs).toBeDefined();
    expect(peerjs.default).toBeDefined(); // Peer constructor
  });
});
