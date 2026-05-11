/**
 * Delta compression for binary snapshots. XOR + simple RLE: unchanged bytes
 * compress to [0x00, count]. The receiver validates baseFrame against its own
 * baseline ring before applying, so a lost ACK can't produce a corrupted decode.
 *
 * Protocol:
 * - Full snapshot: [0x20] [raw bytes]
 * - Delta:         [0x22] [baseFrame:u32] [curLen:u16] [baseLen:u16] [XOR+RLE bytes]
 */
import { CoreMsgType } from './protocol';

const SNAPSHOT_FULL = CoreMsgType.SNAPSHOT;
const SNAPSHOT_DELTA = CoreMsgType.SNAPSHOT_DELTA;

const DELTA_HEADER_BYTES = 1 + 4 + 2 + 2; // type + baseFrame + curLen + baseLen

/**
 * Pooled scratch buffers. createDelta and applyDelta both allocate transient
 * XOR/RLE buffers per call; at host 60Hz × N peers that's ~1.5KB/peer/tick of
 * GC pressure. Pooled at module scope, sized to comfortably hold typical
 * snapshots (200-500 bytes); grown on demand if a future schema pushes
 * snapshots larger. Single-threaded — callers consume the returned output
 * buffer before the next call.
 */
let _xorScratch = new Uint8Array(4096);
let _rleScratch = new Uint8Array(DELTA_HEADER_BYTES + 4096 * 2);
let _rleView = new DataView(_rleScratch.buffer);

function ensureXorCap(n: number): void {
  if (_xorScratch.length < n) _xorScratch = new Uint8Array(n);
}

function ensureRleCap(n: number): void {
  if (_rleScratch.length < n) {
    _rleScratch = new Uint8Array(n);
    _rleView = new DataView(_rleScratch.buffer);
  }
}

/**
 * Build a delta from `current` against `baseline`. `baseFrame` is recorded
 * in the header so the receiver can detect baseline mismatch and discard
 * the delta instead of producing corrupt output.
 *
 * If baseline is null, returns a full snapshot (SNAPSHOT_FULL prefix) and
 * baseFrame is ignored.
 */
export function createDelta(current: ArrayBuffer, baseline: ArrayBuffer | null, baseFrame = 0): ArrayBuffer {
  if (!baseline) {
    const result = new Uint8Array(1 + current.byteLength);
    result[0] = SNAPSHOT_FULL;
    result.set(new Uint8Array(current), 1);
    return result.buffer;
  }

  const cur = new Uint8Array(current);
  const base = new Uint8Array(baseline);
  const maxLen = Math.max(cur.length, base.length);

  ensureXorCap(maxLen);
  ensureRleCap(DELTA_HEADER_BYTES + maxLen * 2);
  const xor = _xorScratch;
  const rle = _rleScratch;
  const view = _rleView;

  for (let i = 0; i < maxLen; i++) {
    xor[i] = (cur[i] ?? 0) ^ (base[i] ?? 0);
  }

  let ro = 0;
  rle[ro++] = SNAPSHOT_DELTA;
  view.setUint32(ro, baseFrame, true); ro += 4;
  view.setUint16(ro, cur.length, true); ro += 2;
  view.setUint16(ro, base.length, true); ro += 2;

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

/** Parse and validate the delta header. Returns null if the buffer isn't a
 *  SNAPSHOT_DELTA or is too short to hold the header. */
function parseDeltaHeader(buf: ArrayBuffer): { baseFrame: number; curLen: number; baseLen: number } | null {
  const bytes = new Uint8Array(buf);
  if (bytes.length < DELTA_HEADER_BYTES || bytes[0] !== SNAPSHOT_DELTA) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return {
    baseFrame: view.getUint32(1, true),
    curLen: view.getUint16(5, true),
    baseLen: view.getUint16(7, true),
  };
}

/** Peek the baseFrame field of a delta packet without applying it.
 *  Returns null if the buffer is not a SNAPSHOT_DELTA or is too short. */
export function readDeltaBaseFrame(deltaBuf: ArrayBuffer): number | null {
  return parseDeltaHeader(deltaBuf)?.baseFrame ?? null;
}

/**
 * Apply a delta to `baseline` to reconstruct the current snapshot.
 *
 * Returns null when the header is invalid, or when the supplied baseline's
 * length doesn't match the baseLen field — XOR'ing against a different-sized
 * buffer would corrupt silently.
 *
 * The caller must already have validated the baseFrame matches its history —
 * use readDeltaBaseFrame() to peek before lookup.
 */
export function applyDelta(deltaBuf: ArrayBuffer, baseline: ArrayBuffer): ArrayBuffer | null {
  const header = parseDeltaHeader(deltaBuf);
  if (!header) return null;
  const { curLen, baseLen } = header;
  if (baseline.byteLength !== baseLen) return null;

  const delta = new Uint8Array(deltaBuf);
  const base = new Uint8Array(baseline);
  const maxLen = Math.max(curLen, baseLen);

  ensureXorCap(maxLen);
  const xor = _xorScratch;
  // Clear used portion — pool may carry leftovers from a prior larger call,
  // and the RLE loop below only writes non-zero bytes (zero runs are implied
  // by skipping `count` indices).
  for (let i = 0; i < maxLen; i++) xor[i] = 0;

  let di = DELTA_HEADER_BYTES;
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

  const result = new Uint8Array(curLen);
  for (let i = 0; i < curLen; i++) {
    result[i] = (xor[i] ?? 0) ^ (base[i] ?? 0);
  }

  return result.buffer;
}
