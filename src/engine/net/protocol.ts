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

/**
 * Encode an input message with bundled recent inputs for redundancy.
 * Format: [1B type][1B count][per input: 2B frame + 1B input][2B latest ack]
 */
export function encodeInputMessage(
  inputs: Array<{ frame: number; input: InputState }>,
  latestAck: number,
): ArrayBuffer {
  const count = inputs.length;
  const buf = new ArrayBuffer(1 + 1 + count * 3 + 2);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset++, MsgType.INPUT);
  view.setUint8(offset++, count);

  for (const { frame, input } of inputs) {
    view.setUint16(offset, frame & 0xFFFF, true); // little-endian, wraps at 65535
    offset += 2;
    view.setUint8(offset++, encodeInput(input));
  }

  view.setUint16(offset, latestAck & 0xFFFF, true);

  return buf;
}

/**
 * Decode an input message.
 * Returns array of {frame, input} pairs and the latestAck.
 */
export function decodeInputMessage(buf: ArrayBuffer): {
  inputs: Array<{ frame: number; input: InputState }>;
  latestAck: number;
} | null {
  const view = new DataView(buf);
  if (view.byteLength < 4) return null;

  let offset = 0;
  const type = view.getUint8(offset++);
  if (type !== MsgType.INPUT) return null;

  const count = view.getUint8(offset++);
  const inputs: Array<{ frame: number; input: InputState }> = [];

  for (let i = 0; i < count; i++) {
    const frame = view.getUint16(offset, true);
    offset += 2;
    const input = decodeInput(view.getUint8(offset++));
    inputs.push({ frame, input });
  }

  const latestAck = view.getUint16(offset, true);
  return { inputs, latestAck };
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

export interface RematchRequestMessage {
  type: 0x0A;
}

export type ReliableMessage =
  | HandshakeMessage
  | SettingsSyncMessage
  | CharacterSelectMessage
  | StartMatchMessage
  | DesyncCheckMessage
  | PauseMessage
  | MatchResultMessage
  | RematchRequestMessage;

export const PROTOCOL_VERSION = 1;
