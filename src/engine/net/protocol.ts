/**
 * Network protocol: message types and binary encoding for P2P input exchange.
 */
import type { InputState } from '../types';

// ---- Message types ----

export const MsgType = {
  // Reliable channel (JSON)
  HANDSHAKE: 0x01,
  SETTINGS_SYNC: 0x02,
  READY: 0x03,
  DESYNC_CHECK: 0x04,
  PAUSE: 0x05,
  DISCONNECT: 0x06,
  CHARACTER_SELECT: 0x07,
  START_MATCH: 0x08,
  MATCH_RESULT: 0x09,
  REMATCH_REQUEST: 0x0A,
  DESYNC_REQUEST: 0x0B,    // guest -> host: hash mismatch, send correction
  DESYNC_CORRECTION: 0x0C, // host -> guest: full snapshot for correction

  // Unreliable channel (binary)
  INPUT: 0x10,
  PING: 0x12,
  PONG: 0x13,
} as const;

// ---- Input encoding (binary, compact) ----

/** Encode InputState to a single byte bitfield. */
export function encodeInput(input: InputState): number {
  return (
    (input.left ? 1 : 0) |
    (input.right ? 2 : 0) |
    (input.jump ? 4 : 0) |
    (input.down ? 8 : 0)
  );
}

/** Decode a byte bitfield back to InputState. */
export function decodeInput(byte: number): InputState {
  return {
    left: (byte & 1) !== 0,
    right: (byte & 2) !== 0,
    jump: (byte & 4) !== 0,
    down: (byte & 8) !== 0,
  };
}

// ---- Pre-allocated encode/decode buffers (avoid 60fps GC pressure) ----

const MAX_BUNDLE = 16; // max inputs per message (10 typical)
// Max encode size: 1 + 1 + MAX_BUNDLE*5 + 4 = 86 bytes
const ENCODE_BUF = new ArrayBuffer(1 + 1 + MAX_BUNDLE * 5 + 4);
const ENCODE_VIEW = new DataView(ENCODE_BUF);

// Pre-allocated decode result (reused every call — caller must consume before next decode)
const DECODE_INPUTS: Array<{ frame: number; input: InputState }> = Array.from(
  { length: MAX_BUNDLE },
  () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
);
const DECODE_RESULT = { inputs: DECODE_INPUTS, inputCount: 0, latestAck: 0 };

/**
 * Encode an input message with bundled recent inputs for redundancy.
 * Format: [1B type][1B count][per input: 4B frame + 1B input][4B latest ack]
 * Frames use Uint32 (wraps at ~19.8 hours at 60fps, effectively unlimited).
 * Returns a slice of a shared buffer — caller must send before next encode call.
 */
export function encodeInputMessage(
  inputs: Array<{ frame: number; input: InputState }>,
  latestAck: number,
  inputCount?: number,
): ArrayBuffer {
  const count = Math.min(inputCount ?? inputs.length, MAX_BUNDLE);
  let offset = 0;

  ENCODE_VIEW.setUint8(offset++, MsgType.INPUT);
  ENCODE_VIEW.setUint8(offset++, count);

  for (let i = 0; i < count; i++) {
    ENCODE_VIEW.setUint32(offset, inputs[i].frame >>> 0, true);
    offset += 4;
    ENCODE_VIEW.setUint8(offset++, encodeInput(inputs[i].input));
  }

  ENCODE_VIEW.setUint32(offset, latestAck >>> 0, true);
  offset += 4;

  // Return a copy sized to actual content (WebRTC needs ownership)
  return ENCODE_BUF.slice(0, offset);
}

/**
 * Decode an input message into pre-allocated result.
 * Returns shared result object — caller must consume before next decode call.
 * result.inputCount indicates how many entries in result.inputs are valid.
 */
export function decodeInputMessage(buf: ArrayBuffer): {
  inputs: Array<{ frame: number; input: InputState }>;
  inputCount: number;
  latestAck: number;
} | null {
  const view = new DataView(buf);
  if (view.byteLength < 6) return null; // min: 1B type + 1B count + 4B ack

  let offset = 0;
  const type = view.getUint8(offset++);
  if (type !== MsgType.INPUT) return null;

  const count = view.getUint8(offset++);

  // Bounds validation: prevent reading past buffer
  const expectedSize = 2 + count * 5 + 4;
  if (view.byteLength < expectedSize) return null;

  const n = Math.min(count, MAX_BUNDLE);
  for (let i = 0; i < n; i++) {
    DECODE_INPUTS[i].frame = view.getUint32(offset, true);
    offset += 4;
    const byte = view.getUint8(offset++);
    DECODE_INPUTS[i].input.left = (byte & 1) !== 0;
    DECODE_INPUTS[i].input.right = (byte & 2) !== 0;
    DECODE_INPUTS[i].input.jump = (byte & 4) !== 0;
    DECODE_INPUTS[i].input.down = (byte & 8) !== 0;
  }

  DECODE_RESULT.inputCount = n;
  DECODE_RESULT.latestAck = view.getUint32(offset, true);
  return DECODE_RESULT;
}

/** Encode a ping message with timestamp. */
export function encodePing(timestamp: number): ArrayBuffer {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, MsgType.PING);
  view.setFloat64(1, timestamp, true);
  return buf;
}

/** Encode a pong message echoing timestamp. */
export function encodePong(timestamp: number): ArrayBuffer {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, MsgType.PONG);
  view.setFloat64(1, timestamp, true);
  return buf;
}

/** Decode a ping or pong message. Returns timestamp or null. */
export function decodePingPong(buf: ArrayBuffer): { type: 0x12 | 0x13; timestamp: number } | null {
  const view = new DataView(buf);
  if (view.byteLength < 9) return null;
  const type = view.getUint8(0);
  if (type !== MsgType.PING && type !== MsgType.PONG) return null;
  return { type: type as 0x12 | 0x13, timestamp: view.getFloat64(1, true) };
}

// ---- Reliable channel (JSON messages) ----

export interface HandshakeMessage {
  type: 0x01;
  protocolVersion: number;
  playerName: string;
}

export interface SettingsSyncMessage {
  type: 0x02;
  arenaId: string;
  killLimit: number;
  timeLimit: number;
  goreMode: boolean;
  mods: Record<string, boolean>;
  rngSeed: number;
  botCount: number;
  botDifficulty: string;
}

export interface CharacterSelectMessage {
  type: 0x07;
  characterName: string;
}

export interface StartMatchMessage {
  type: 0x08;
}

export interface DesyncCheckMessage {
  type: 0x04;
  frame: number;
  hash: number;
  rngState: number;
}

export interface PauseMessage {
  type: 0x05;
  paused: boolean;
}

export interface MatchResultMessage {
  type: 0x09;
  winner: string | null;
}

export interface ReadyMessage {
  type: 0x03;
}

export interface DisconnectMessage {
  type: 0x06;
}

export interface RematchRequestMessage {
  type: 0x0A;
}

export interface DesyncRequestMessage {
  type: 0x0B;
  frame: number;
}

export interface DesyncCorrectionMessage {
  type: 0x0C;
  frame: number;
  snapshot: unknown; // GameSnapshot — typed loosely to avoid circular dep
}

export type ReliableMessage =
  | HandshakeMessage
  | SettingsSyncMessage
  | ReadyMessage
  | CharacterSelectMessage
  | StartMatchMessage
  | DesyncCheckMessage
  | PauseMessage
  | DisconnectMessage
  | MatchResultMessage
  | RematchRequestMessage
  | DesyncRequestMessage
  | DesyncCorrectionMessage;

export const PROTOCOL_VERSION = 2;
