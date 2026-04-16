/**
 * Delta compression for binary snapshots.
 * Uses XOR + simple RLE: unchanged bytes compress to [0x00, count].
 *
 * Protocol:
 * - Full snapshot: [0x20] [raw bytes]
 * - Delta:         [0x22] [curLen:u16] [baseLen:u16] [XOR+RLE encoded bytes]
 */
import { CoreMsgType } from './protocol';

const SNAPSHOT_FULL = CoreMsgType.SNAPSHOT;
const SNAPSHOT_DELTA = CoreMsgType.SNAPSHOT_DELTA;

/**
 * Create a delta between two encoded snapshots.
 * Uses XOR + simple RLE: [0x00 count] for runs of zeros, [byte] for non-zero.
 * Returns a compact delta buffer prefixed with SNAPSHOT_DELTA (0x22).
 * If no baseline, returns full snapshot prefixed with SNAPSHOT_FULL (0x20).
 */
export function createDelta(current: ArrayBuffer, baseline: ArrayBuffer | null): ArrayBuffer {
  if (!baseline) {
    // No baseline — send full snapshot with type prefix
    const result = new Uint8Array(1 + current.byteLength);
    result[0] = SNAPSHOT_FULL;
    result.set(new Uint8Array(current), 1);
    return result.buffer;
  }

  const cur = new Uint8Array(current);
  const base = new Uint8Array(baseline);
  const maxLen = Math.max(cur.length, base.length);

  // XOR the two snapshots
  const xor = new Uint8Array(maxLen);
  for (let i = 0; i < maxLen; i++) {
    xor[i] = (cur[i] ?? 0) ^ (base[i] ?? 0);
  }

  // RLE encode: runs of 0x00 as [0x00, count], non-zero bytes as-is
  const rle = new Uint8Array(1 + 4 + maxLen * 2);
  let ro = 0;
  rle[ro++] = SNAPSHOT_DELTA;
  // Store current length so decoder knows output size
  rle[ro++] = (cur.length >> 8) & 0xFF;
  rle[ro++] = cur.length & 0xFF;
  rle[ro++] = (base.length >> 8) & 0xFF;
  rle[ro++] = base.length & 0xFF;

  let i = 0;
  while (i < maxLen) {
    if (xor[i] === 0) {
      let count = 0;
      while (i < maxLen && xor[i] === 0 && count < 255) {
        count++;
        i++;
      }
      rle[ro++] = 0x00;
      rle[ro++] = count;
    } else {
      rle[ro++] = xor[i++];
    }
  }

  return rle.buffer.slice(0, ro);
}

/**
 * Apply a delta (0x22 prefix) to a baseline to reconstruct the current snapshot.
 * Returns the reconstructed raw snapshot buffer, or null if not a delta message.
 */
export function applyDelta(deltaBuf: ArrayBuffer, baseline: ArrayBuffer): ArrayBuffer | null {
  const delta = new Uint8Array(deltaBuf);
  if (delta.length < 5 || delta[0] !== SNAPSHOT_DELTA) return null;

  const curLen = (delta[1] << 8) | delta[2];
  const baseLen = (delta[3] << 8) | delta[4];
  const base = new Uint8Array(baseline);
  const maxLen = Math.max(curLen, baseLen);
  const xor = new Uint8Array(maxLen);

  let di = 5;
  let xi = 0;
  while (di < delta.length && xi < maxLen) {
    if (delta[di] === 0x00) {
      di++;
      const count = delta[di++] ?? 0;
      xi += count;
    } else {
      xor[xi++] = delta[di++];
    }
  }

  // Reconstruct: current = xor ^ baseline
  const result = new Uint8Array(curLen);
  for (let i = 0; i < curLen; i++) {
    result[i] = (xor[i] ?? 0) ^ (base[i] ?? 0);
  }

  return result.buffer;
}
