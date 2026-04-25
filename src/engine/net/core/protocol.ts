/**
 * Generic network protocol: message type constants and transport-level encoding.
 * No game-specific imports — all game message types live in the game's protocol file.
 */

// ---- Message type constants ----
// These are just numeric IDs — no game-specific types needed.

/** Transport-level message type IDs used by core networking. */
export const CoreMsgType = {
  INPUT: 0x10,
  PING: 0x12,
  PONG: 0x13,
  SNAPSHOT: 0x20,
  SNAPSHOT_ACK: 0x21,
  SNAPSHOT_DELTA: 0x22,
} as const;

// ---- Ping/pong encoding (transport-level) ----

/** Encode a ping message with timestamp. */
export function encodePing(timestamp: number): ArrayBuffer {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, CoreMsgType.PING);
  view.setFloat64(1, timestamp, true);
  return buf;
}

/** Encode a pong message echoing timestamp. */
export function encodePong(timestamp: number): ArrayBuffer {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, CoreMsgType.PONG);
  view.setFloat64(1, timestamp, true);
  return buf;
}

/** Decode a ping or pong message. Returns timestamp or null. */
export function decodePingPong(buf: ArrayBuffer): { type: 0x12 | 0x13; timestamp: number } | null {
  const view = new DataView(buf);
  if (view.byteLength < 9) return null;
  const type = view.getUint8(0);
  if (type !== CoreMsgType.PING && type !== CoreMsgType.PONG) return null;
  return { type: type as 0x12 | 0x13, timestamp: view.getFloat64(1, true) };
}

// ---- Snapshot ACK encoding (transport-level) ----

/** Encode a snapshot acknowledgment (guest → host). */
export function encodeSnapshotAck(frame: number): ArrayBuffer {
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, CoreMsgType.SNAPSHOT_ACK);
  view.setUint32(1, frame, true);
  return buf;
}

/** Decode a snapshot acknowledgment. Returns frame number or null. */
export function decodeSnapshotAck(buf: ArrayBuffer): number | null {
  const view = new DataView(buf);
  if (view.byteLength < 5) return null;
  if (view.getUint8(0) !== CoreMsgType.SNAPSHOT_ACK) return null;
  return view.getUint32(1, true);
}

export const PROTOCOL_VERSION = 9;
