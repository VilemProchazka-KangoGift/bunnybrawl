/**
 * Code generators for the schema-driven per-player snapshot codec.
 *
 * `compilePlayerEncoder(schema)` and `compilePlayerDecoder(schema)` build
 * an array of closures at module-load time — one per schema entry. The
 * runtime path is a simple for-loop over those closures, so there's no
 * per-field branching after the first call.
 *
 * Wire-format invariants the generated codec MUST preserve byte-for-byte
 * vs. the original inlined codec:
 *
 *  - Timer encoding: `t <= 0 → 0`, else `min(round(t * 60), 255)`
 *  - Velocity int16 clamp at ±32767
 *  - Score/killStreak Uint16 clamp at 65535
 *  - PlayerState fallback to index 0 ('idle') on unknown
 *  - Expression fallback to index 0 ('normal') on unknown
 *
 * Pure module — no audio, no DOM, no Howler imports.
 */
import type { PlayerState, PlayerSlot, WirePlayer } from '../../types';
import { encodeSlot, decodeSlot } from '../protocol';
import {
  PLAYER_STATE_VALUES,
  EXPRESSION_VALUES,
  type SchemaField,
  type SnapshotSchema,
} from './schema';

// ---- Mirror of the legacy primitives so codecGen is the single source ----

/** Encode a timer (seconds) as a uint8 frame count (0-255). */
function encodeTimer(timer: number): number {
  if (timer <= 0) return 0;
  return Math.min(Math.round(timer * 60), 255);
}

/** Clamp a number to int16 range with rounding. */
function encodeInt16(v: number): number {
  const r = Math.round(v);
  return r < -32767 ? -32767 : r > 32767 ? 32767 : r;
}

const PLAYER_STATE_INDEX: Record<string, number> = {};
for (let i = 0; i < PLAYER_STATE_VALUES.length; i++) {
  PLAYER_STATE_INDEX[PLAYER_STATE_VALUES[i]] = i;
}

const EXPRESSION_INDEX: Record<string, number> = {};
for (let i = 0; i < EXPRESSION_VALUES.length; i++) {
  EXPRESSION_INDEX[EXPRESSION_VALUES[i]] = i;
}

// ---- Op closure types ----

type EncodeOp = (view: DataView, o: number, p: WirePlayer) => number;
type DecodeOp = (view: DataView, o: number, p: WirePlayer) => number;

// ---- Encode-op factory ----

function makeEncodeOp(field: SchemaField): EncodeOp {
  const key = field.field;
  switch (field.type) {
    case 'f32':
      return (view, o, p) => {
        view.setFloat32(o, p[key] as number, true);
        return o + 4;
      };
    case 'i16':
      return (view, o, p) => {
        view.setInt16(o, encodeInt16(p[key] as number), true);
        return o + 2;
      };
    case 'u16_clamped':
      return (view, o, p) => {
        view.setUint16(o, Math.min(p[key] as number, 65535), true);
        return o + 2;
      };
    case 'u8':
      return (view, o, p) => {
        view.setUint8(o, (p[key] as number) & 0xff);
        return o + 1;
      };
    case 'u8_round':
      return (view, o, p) => {
        view.setUint8(o, Math.min(Math.round(p[key] as number), 255));
        return o + 1;
      };
    case 'u8_x50':
      return (view, o, p) => {
        view.setUint8(o, Math.round((p[key] as number) * 50) & 0xff);
        return o + 1;
      };
    case 'enum_u8': {
      // Cache the index map; default to 0 on unknown (matches legacy '?? 0' fallback).
      const enumValues = field.enumValues ?? [];
      const idx: Record<string, number> = {};
      for (let i = 0; i < enumValues.length; i++) idx[enumValues[i]] = i;
      return (view, o, p) => {
        view.setUint8(o, idx[p[key] as string] ?? 0);
        return o + 1;
      };
    }
    case 'slot':
      return (view, o, p) => {
        view.setUint8(o, encodeSlot(p[key] as PlayerSlot));
        return o + 1;
      };
    case 'flags':
      // Hand-crafted layout — matches the legacy bit packing:
      //   bit 0    facing == 'right'
      //   bit 1    fastFalling
      //   bit 2    disconnected
      //   bit 3    active
      //   bits 4-5 expression index
      //   bits 6-7 damageFlashSide (0=null, 1=left, 2=right)
      return (view, o, p) => {
        const dfSide =
          p.damageFlashSide === 'left' ? 1 :
            p.damageFlashSide === 'right' ? 2 : 0;
        const flags =
          (p.facing === 'right' ? 1 : 0) |
          (p.fastFalling ? 2 : 0) |
          (p.disconnected ? 4 : 0) |
          (p.active ? 8 : 0) |
          ((EXPRESSION_INDEX[p.expression] ?? 0) << 4) |
          (dfSide << 6);
        view.setUint8(o, flags);
        return o + 1;
      };
    case 'timer_mask': {
      // 1 mask byte + 1 conditional u8 per non-zero timer in field order.
      const timers = field.timerFields ?? [];
      // Pre-bind bit values so the runtime path is a tight unrolled loop.
      const fields = timers as readonly (keyof WirePlayer)[];
      return (view, o, p) => {
        // Encode timers eagerly; we need the values both for the mask
        // bit and (if non-zero) the conditional payload. Avoid a second
        // pass by reusing the encoded values.
        const v0 = encodeTimer(p[fields[0]] as number);
        const v1 = encodeTimer(p[fields[1]] as number);
        const v2 = encodeTimer(p[fields[2]] as number);
        const v3 = encodeTimer(p[fields[3]] as number);
        const v4 = encodeTimer(p[fields[4]] as number);
        const v5 = encodeTimer(p[fields[5]] as number);
        const v6 = encodeTimer(p[fields[6]] as number);
        const v7 = encodeTimer(p[fields[7]] as number);
        const mask =
          (v0 ? 1 : 0) |
          (v1 ? 2 : 0) |
          (v2 ? 4 : 0) |
          (v3 ? 8 : 0) |
          (v4 ? 16 : 0) |
          (v5 ? 32 : 0) |
          (v6 ? 64 : 0) |
          (v7 ? 128 : 0);
        view.setUint8(o++, mask);
        if (v0) { view.setUint8(o++, v0); }
        if (v1) { view.setUint8(o++, v1); }
        if (v2) { view.setUint8(o++, v2); }
        if (v3) { view.setUint8(o++, v3); }
        if (v4) { view.setUint8(o++, v4); }
        if (v5) { view.setUint8(o++, v5); }
        if (v6) { view.setUint8(o++, v6); }
        if (v7) { view.setUint8(o++, v7); }
        return o;
      };
    }
  }
}

// ---- Decode-op factory ----

function makeDecodeOp(field: SchemaField): DecodeOp {
  const key = field.field;
  switch (field.type) {
    case 'f32':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getFloat32(o, true);
        return o + 4;
      };
    case 'i16':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getInt16(o, true);
        return o + 2;
      };
    case 'u16_clamped':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getUint16(o, true);
        return o + 2;
      };
    case 'u8':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getUint8(o);
        return o + 1;
      };
    case 'u8_round':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getUint8(o);
        return o + 1;
      };
    case 'u8_x50':
      return (view, o, p) => {
        (p as unknown as Record<string, number>)[key as string] = view.getUint8(o) / 50;
        return o + 1;
      };
    case 'enum_u8': {
      const enumValues = field.enumValues ?? [];
      // Captured as `string[]` (mutable copy) to satisfy index-typed assigns.
      const values = enumValues.slice();
      const fallback = values[0];
      return (view, o, p) => {
        const idx = view.getUint8(o);
        (p as unknown as Record<string, string>)[key as string] = values[idx] ?? fallback;
        return o + 1;
      };
    }
    case 'slot':
      return (view, o, p) => {
        (p as unknown as Record<string, PlayerSlot>)[key as string] = decodeSlot(view.getUint8(o)) as PlayerSlot;
        return o + 1;
      };
    case 'flags':
      // Mirror the encode flag-byte layout exactly.
      return (view, o, p) => {
        const flags = view.getUint8(o);
        p.facing = (flags & 1) ? 'right' : 'left';
        p.fastFalling = !!(flags & 2);
        p.disconnected = !!(flags & 4);
        p.active = !!(flags & 8);
        const expIdx = (flags >> 4) & 3;
        p.expression = (EXPRESSION_VALUES[expIdx] ?? EXPRESSION_VALUES[0]) as WirePlayer['expression'];
        const dfSide = (flags >> 6) & 3;
        p.damageFlashSide = dfSide === 1 ? 'left' : dfSide === 2 ? 'right' : null;
        return o + 1;
      };
    case 'timer_mask': {
      const timers = (field.timerFields ?? []) as readonly (keyof WirePlayer)[];
      return (view, o, p) => {
        const mask = view.getUint8(o++);
        const target = p as unknown as Record<string, number>;
        for (let i = 0; i < timers.length; i++) {
          if (mask & (1 << i)) {
            target[timers[i] as string] = view.getUint8(o++) / 60;
          } else {
            target[timers[i] as string] = 0;
          }
        }
        return o;
      };
    }
  }
}

// ---- Public compile entry points ----

/**
 * Compile a schema into a single encode closure that writes one player's
 * fields to a DataView and returns the new offset.
 */
export function compilePlayerEncoder(
  schema: SnapshotSchema,
): (view: DataView, o: number, p: WirePlayer) => number {
  const ops: EncodeOp[] = schema.map(makeEncodeOp);
  const n = ops.length;
  return (view, o, p) => {
    for (let i = 0; i < n; i++) o = ops[i](view, o, p);
    return o;
  };
}

/**
 * Compile a schema into a single decode closure that reads one player's
 * fields from a DataView into a target object and returns the new offset.
 */
export function compilePlayerDecoder(
  schema: SnapshotSchema,
): (view: DataView, o: number, p: WirePlayer) => number {
  const ops: DecodeOp[] = schema.map(makeDecodeOp);
  const n = ops.length;
  return (view, o, p) => {
    for (let i = 0; i < n; i++) o = ops[i](view, o, p);
    return o;
  };
}

// Helper exported for tests + binaryCodec hot path.
export { encodeTimer, encodeInt16 };

// `PlayerState` referenced via the schema's enumValues — re-export for
// any consumer that needs the canonical ordered list.
export type { PlayerState };
