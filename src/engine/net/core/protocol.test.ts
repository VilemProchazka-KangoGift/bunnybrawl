import { describe, it, expect } from 'vitest';
import {
  CoreMsgType,
  PROTOCOL_VERSION,
  encodePing,
  encodePong,
  decodePingPong,
  encodeSnapshotAck,
  decodeSnapshotAck,
} from './protocol';

describe('protocol', () => {
  // ---- Ping/Pong encoding ----

  describe('encodePing / decodePingPong', () => {
    it('round-trips a timestamp through ping', () => {
      const timestamp = 1713200000123.456;
      const buf = encodePing(timestamp);
      const result = decodePingPong(buf);

      expect(result).not.toBeNull();
      expect(result!.type).toBe(CoreMsgType.PING);
      expect(result!.timestamp).toBe(timestamp);
    });

    it('round-trips zero timestamp', () => {
      const buf = encodePing(0);
      const result = decodePingPong(buf);

      expect(result).not.toBeNull();
      expect(result!.type).toBe(CoreMsgType.PING);
      expect(result!.timestamp).toBe(0);
    });

    it('round-trips negative timestamp', () => {
      const buf = encodePing(-42.5);
      const result = decodePingPong(buf);

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBe(-42.5);
    });
  });

  describe('encodePong / decodePingPong', () => {
    it('round-trips a timestamp through pong', () => {
      const timestamp = 9876543210.999;
      const buf = encodePong(timestamp);
      const result = decodePingPong(buf);

      expect(result).not.toBeNull();
      expect(result!.type).toBe(CoreMsgType.PONG);
      expect(result!.timestamp).toBe(timestamp);
    });

    it('type is PONG, not PING', () => {
      const buf = encodePong(100);
      const result = decodePingPong(buf);

      expect(result).not.toBeNull();
      expect(result!.type).toBe(CoreMsgType.PONG);
      expect(result!.type).not.toBe(CoreMsgType.PING);
    });
  });

  describe('decodePingPong — rejection', () => {
    it('returns null for too-short buffer', () => {
      const buf = new ArrayBuffer(4); // needs 9
      expect(decodePingPong(buf)).toBeNull();
    });

    it('returns null for wrong message type', () => {
      const buf = new ArrayBuffer(9);
      const view = new DataView(buf);
      view.setUint8(0, CoreMsgType.INPUT); // not PING or PONG
      view.setFloat64(1, 12345, true);
      expect(decodePingPong(buf)).toBeNull();
    });

    it('returns null for empty buffer', () => {
      const buf = new ArrayBuffer(0);
      expect(decodePingPong(buf)).toBeNull();
    });
  });

  // ---- Snapshot ACK encoding ----

  describe('encodeSnapshotAck / decodeSnapshotAck', () => {
    it('round-trips a frame number', () => {
      const frame = 42000;
      const buf = encodeSnapshotAck(frame);
      const result = decodeSnapshotAck(buf);

      expect(result).toBe(frame);
    });

    it('round-trips frame 0', () => {
      const buf = encodeSnapshotAck(0);
      expect(decodeSnapshotAck(buf)).toBe(0);
    });

    it('round-trips large frame number (Uint32 max)', () => {
      const maxU32 = 0xFFFFFFFF;
      const buf = encodeSnapshotAck(maxU32);
      expect(decodeSnapshotAck(buf)).toBe(maxU32);
    });
  });

  describe('decodeSnapshotAck — rejection', () => {
    it('returns null for wrong prefix', () => {
      const buf = new ArrayBuffer(5);
      const view = new DataView(buf);
      view.setUint8(0, CoreMsgType.SNAPSHOT); // wrong type
      view.setUint32(1, 100, true);
      expect(decodeSnapshotAck(buf)).toBeNull();
    });

    it('returns null for too-short buffer', () => {
      const buf = new ArrayBuffer(3);
      expect(decodeSnapshotAck(buf)).toBeNull();
    });
  });

  // ---- CoreMsgType uniqueness ----

  describe('CoreMsgType values', () => {
    it('all values are unique (no collisions)', () => {
      const values = Object.values(CoreMsgType);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('all values are numbers', () => {
      for (const value of Object.values(CoreMsgType)) {
        expect(typeof value).toBe('number');
      }
    });
  });

  // ---- PROTOCOL_VERSION ----

  describe('PROTOCOL_VERSION', () => {
    it('is a positive integer', () => {
      expect(PROTOCOL_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    });
  });
});
