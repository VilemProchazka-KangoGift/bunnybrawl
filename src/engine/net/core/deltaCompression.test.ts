import { describe, it, expect } from 'vitest';
import { createDelta, applyDelta, readDeltaBaseFrame } from './deltaCompression';
import { CoreMsgType } from './protocol';

/** Helper: build an ArrayBuffer from a plain number array. */
function bufFrom(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('deltaCompression', () => {
  // ---- createDelta (full snapshot, no baseline) ----

  describe('createDelta — full snapshot (no baseline)', () => {
    it('prefixes result with SNAPSHOT (0x20)', () => {
      const current = bufFrom([10, 20, 30]);
      const result = new Uint8Array(createDelta(current, null));
      expect(result[0]).toBe(CoreMsgType.SNAPSHOT);
    });

    it('contains original bytes after the prefix', () => {
      const current = bufFrom([10, 20, 30]);
      const result = new Uint8Array(createDelta(current, null));
      expect(result.length).toBe(4); // 1 prefix + 3 data
      expect(Array.from(result.slice(1))).toEqual([10, 20, 30]);
    });

    it('works with empty current buffer', () => {
      const current = bufFrom([]);
      const result = new Uint8Array(createDelta(current, null));
      expect(result.length).toBe(1);
      expect(result[0]).toBe(CoreMsgType.SNAPSHOT);
    });
  });

  // ---- createDelta — delta with identical snapshots ----

  describe('createDelta — identical snapshots', () => {
    it('produces a very small delta (all zeros compress via RLE)', () => {
      const data = bufFrom([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const delta = createDelta(data, data);
      const deltaBytes = new Uint8Array(delta);
      // Header: 1 (type) + 4 (baseFrame) + 2 (curLen) + 2 (baseLen) = 9
      // XOR is all zeros → RLE: [0x00, count] = 2 bytes (for <=255 byte run)
      expect(deltaBytes.length).toBeLessThanOrEqual(11);
      expect(deltaBytes[0]).toBe(CoreMsgType.SNAPSHOT_DELTA);
    });
  });

  // ---- baseFrame header field ----

  describe('baseFrame header', () => {
    it('round-trips baseFrame through createDelta + readDeltaBaseFrame', () => {
      const data = bufFrom([1, 2, 3]);
      const delta = createDelta(data, data, 12345);
      expect(readDeltaBaseFrame(delta)).toBe(12345);
    });

    it('readDeltaBaseFrame returns null for full snapshot', () => {
      const full = createDelta(bufFrom([1, 2]), null);
      expect(readDeltaBaseFrame(full)).toBeNull();
    });

    it('readDeltaBaseFrame returns null for too-short buffer', () => {
      expect(readDeltaBaseFrame(bufFrom([CoreMsgType.SNAPSHOT_DELTA, 0, 0]))).toBeNull();
    });

    it('readDeltaBaseFrame returns null for non-delta type', () => {
      expect(readDeltaBaseFrame(bufFrom([0xFF, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    });

    it('handles baseFrame at u32 max', () => {
      const data = bufFrom([1, 2, 3]);
      const delta = createDelta(data, data, 0xFFFFFFFF);
      expect(readDeltaBaseFrame(delta)).toBe(0xFFFFFFFF);
    });

    it('handles baseFrame zero (default)', () => {
      const data = bufFrom([1, 2, 3]);
      const delta = createDelta(data, data);
      expect(readDeltaBaseFrame(delta)).toBe(0);
    });
  });

  // ---- Baseline-length mismatch protection ----

  describe('applyDelta — baseline length mismatch', () => {
    it('returns null when baseline length does not match header baseLen', () => {
      const baseline = bufFrom([10, 20, 30, 40]);
      const current = bufFrom([10, 25, 30, 45]);
      const delta = createDelta(current, baseline);

      // Try applying against a different-sized baseline.
      const wrongSize = bufFrom([10, 20, 30, 40, 50, 60]);
      expect(applyDelta(delta, wrongSize)).toBeNull();
    });

    it('returns null when baseline is too short', () => {
      const baseline = bufFrom([10, 20, 30, 40]);
      const current = bufFrom([10, 25, 30, 45]);
      const delta = createDelta(current, baseline);

      const tooShort = bufFrom([10, 20]);
      expect(applyDelta(delta, tooShort)).toBeNull();
    });

    it('accepts baseline of exact baseLen', () => {
      const baseline = bufFrom([10, 20, 30, 40]);
      const current = bufFrom([10, 25, 30, 45]);
      const delta = createDelta(current, baseline);
      expect(applyDelta(delta, baseline)).not.toBeNull();
    });
  });

  // ---- Round-trip: createDelta + applyDelta ----

  describe('round-trip (createDelta + applyDelta)', () => {
    it('reconstructs original from different snapshots', () => {
      const baseline = bufFrom([10, 20, 30, 40, 50]);
      const current = bufFrom([10, 25, 30, 45, 55]);

      const delta = createDelta(current, baseline);
      const reconstructed = applyDelta(delta, baseline);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual([10, 25, 30, 45, 55]);
    });

    it('reconstructs when current is longer than baseline', () => {
      const baseline = bufFrom([1, 2, 3]);
      const current = bufFrom([1, 2, 3, 4, 5]);

      const delta = createDelta(current, baseline);
      const reconstructed = applyDelta(delta, baseline);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual([1, 2, 3, 4, 5]);
    });

    it('reconstructs when baseline is longer than current', () => {
      const baseline = bufFrom([1, 2, 3, 4, 5]);
      const current = bufFrom([1, 2, 3]);

      const delta = createDelta(current, baseline);
      const reconstructed = applyDelta(delta, baseline);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual([1, 2, 3]);
    });

    it('round-trips identical snapshots', () => {
      const data = bufFrom([100, 200, 50, 75]);
      const delta = createDelta(data, data);
      const reconstructed = applyDelta(delta, data);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual([100, 200, 50, 75]);
    });

    it('round-trips completely different snapshots', () => {
      const baseline = bufFrom([0, 0, 0, 0]);
      const current = bufFrom([255, 128, 64, 32]);

      const delta = createDelta(current, baseline);
      const reconstructed = applyDelta(delta, baseline);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual([255, 128, 64, 32]);
    });

    it('round-trips a larger buffer', () => {
      const baseline = new Uint8Array(500);
      const current = new Uint8Array(500);
      for (let i = 0; i < 500; i++) {
        baseline[i] = i % 256;
        current[i] = (i * 3 + 7) % 256;
      }

      const delta = createDelta(current.buffer, baseline.buffer);
      const reconstructed = applyDelta(delta, baseline.buffer);

      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual(Array.from(current));
    });
  });

  // ---- applyDelta — rejection cases ----

  describe('applyDelta — non-delta messages', () => {
    it('returns null for a full snapshot (SNAPSHOT prefix)', () => {
      const fullSnapshot = bufFrom([CoreMsgType.SNAPSHOT, 1, 2, 3]);
      const baseline = bufFrom([0, 0, 0]);
      expect(applyDelta(fullSnapshot, baseline)).toBeNull();
    });

    it('returns null for a buffer with wrong prefix byte', () => {
      const garbage = bufFrom([0xFF, 1, 2, 3, 4, 5]);
      const baseline = bufFrom([0, 0, 0]);
      expect(applyDelta(garbage, baseline)).toBeNull();
    });

    it('returns null for too-short buffer', () => {
      const tooShort = bufFrom([CoreMsgType.SNAPSHOT_DELTA, 0, 5]);
      const baseline = bufFrom([0, 0, 0, 0, 0]);
      expect(applyDelta(tooShort, baseline)).toBeNull();
    });

    it('returns null for empty buffer', () => {
      const empty = bufFrom([]);
      const baseline = bufFrom([0]);
      expect(applyDelta(empty, baseline)).toBeNull();
    });
  });
});
