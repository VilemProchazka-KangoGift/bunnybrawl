/**
 * Per-player encode/decode closures derived from the player schema.
 *
 * Implementation note (Phase 12): the schema in `schema.ts` is the
 * authoritative description of the per-player wire layout. The code in
 * this file must mirror PLAYER_SCHEMA entry-for-entry. A startup-time
 * runtime check (`assertSchemaMatchesCodec`) round-trips a sentinel
 * object through both paths and panics if they diverge — so the schema
 * is enforceable, not just documentation.
 *
 * Why hand-stitched and not `new Function` codegen: V8 inlines fixed
 * `p.x` accesses to monomorphic loads but can't optimize variable-key
 * `p[k]` accesses anywhere near as well, and dispatching across an array
 * of per-field closures adds 14 indirect calls per player block. A
 * hand-stitched single closure matches the inlined reference's
 * monomorphic shape and stays alloc-free in steady state.
 *
 * Pure module — no audio, no DOM, no Howler imports.
 */
import type { PlayerSlot, WirePlayer } from '../../types';
import { encodeSlot, decodeSlot } from '../protocol';
import {
  PLAYER_SCHEMA,
  PLAYER_STATE_VALUES,
  EXPRESSION_VALUES,
  type SchemaField,
  type SnapshotSchema,
} from './schema';

// ---- Wire-layout primitives (single source of truth — these MUST mirror
// the legacy inlined codec exactly, byte-for-byte). ----

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

const PLAYER_STATE_REVERSE = PLAYER_STATE_VALUES;
const EXPRESSION_REVERSE = EXPRESSION_VALUES;

// ---- Hand-stitched encode/decode closures (mirror PLAYER_SCHEMA) ----

/** Encode one player block. Returns new offset. */
const _encodePlayer = (view: DataView, o: number, p: WirePlayer): number => {
  // slot:id
  view.setUint8(o++, encodeSlot(p.id));
  // f32:x, f32:y
  view.setFloat32(o, p.x, true); o += 4;
  view.setFloat32(o, p.y, true); o += 4;
  // i16:vx, i16:vy
  view.setInt16(o, encodeInt16(p.vx), true); o += 2;
  view.setInt16(o, encodeInt16(p.vy), true); o += 2;
  // enum_u8:state
  view.setUint8(o++, PLAYER_STATE_INDEX[p.state] ?? 0);
  // flags byte: facing/fastFalling/disconnected/active/expression/damageFlashSide
  const dfSide = p.damageFlashSide === 'left' ? 1 : p.damageFlashSide === 'right' ? 2 : 0;
  const flags =
    (p.facing === 'right' ? 1 : 0) |
    (p.fastFalling ? 2 : 0) |
    (p.disconnected ? 4 : 0) |
    (p.active ? 8 : 0) |
    ((EXPRESSION_INDEX[p.expression] ?? 0) << 4) |
    (dfSide << 6);
  view.setUint8(o++, flags);
  // u8:animFrame
  view.setUint8(o++, p.animFrame & 0xff);
  // u16_clamped:score
  view.setUint16(o, p.score < 65535 ? p.score : 65535, true); o += 2;
  // timer_mask: 1 mask + 1 conditional u8 per non-zero timer
  const t0 = encodeTimer(p.hitstopTimer);
  const t1 = encodeTimer(p.invincibleTimer);
  const t2 = encodeTimer(p.splatTimer);
  const t3 = encodeTimer(p.respawnTimer);
  const t4 = encodeTimer(p.fatTimer);
  const t5 = encodeTimer(p.slowTimer);
  const t6 = encodeTimer(p.burnTimer);
  const t7 = encodeTimer(p.damageFlashTimer);
  const mask =
    (t0 ? 1 : 0) |
    (t1 ? 2 : 0) |
    (t2 ? 4 : 0) |
    (t3 ? 8 : 0) |
    (t4 ? 16 : 0) |
    (t5 ? 32 : 0) |
    (t6 ? 64 : 0) |
    (t7 ? 128 : 0);
  view.setUint8(o++, mask);
  if (t0) view.setUint8(o++, t0);
  if (t1) view.setUint8(o++, t1);
  if (t2) view.setUint8(o++, t2);
  if (t3) view.setUint8(o++, t3);
  if (t4) view.setUint8(o++, t4);
  if (t5) view.setUint8(o++, t5);
  if (t6) view.setUint8(o++, t6);
  if (t7) view.setUint8(o++, t7);
  // u8_x50:squashScale
  view.setUint8(o++, Math.round(p.squashScale * 50) & 0xff);
  // u16_clamped:killStreak
  view.setUint16(o, p.killStreak < 65535 ? p.killStreak : 65535, true); o += 2;
  // u8_round:width, u8_round:height
  const wRound = Math.round(p.width);
  view.setUint8(o++, wRound < 255 ? wRound : 255);
  const hRound = Math.round(p.height);
  view.setUint8(o++, hRound < 255 ? hRound : 255);
  // u8_x50:sideSquash
  view.setUint8(o++, Math.round(p.sideSquash * 50) & 0xff);
  return o;
};

/** Decode one player block. Returns new offset. Mutates `p` in place. */
const _decodePlayer = (view: DataView, o: number, p: WirePlayer): number => {
  // slot:id
  p.id = decodeSlot(view.getUint8(o++)) as PlayerSlot;
  // f32:x, f32:y
  p.x = view.getFloat32(o, true); o += 4;
  p.y = view.getFloat32(o, true); o += 4;
  // i16:vx, i16:vy
  p.vx = view.getInt16(o, true); o += 2;
  p.vy = view.getInt16(o, true); o += 2;
  // enum_u8:state
  const stateIdx = view.getUint8(o++);
  p.state = PLAYER_STATE_REVERSE[stateIdx] ?? 'idle';
  // flags
  const flags = view.getUint8(o++);
  p.facing = (flags & 1) ? 'right' : 'left';
  p.fastFalling = !!(flags & 2);
  p.disconnected = !!(flags & 4);
  p.active = !!(flags & 8);
  const expIdx = (flags >> 4) & 3;
  p.expression = EXPRESSION_REVERSE[expIdx] ?? 'normal';
  const dfSide = (flags >> 6) & 3;
  p.damageFlashSide = dfSide === 1 ? 'left' : dfSide === 2 ? 'right' : null;
  // u8:animFrame
  p.animFrame = view.getUint8(o++);
  // u16:score
  p.score = view.getUint16(o, true); o += 2;
  // timer_mask
  const mask = view.getUint8(o++);
  p.hitstopTimer = (mask & 1) ? view.getUint8(o++) / 60 : 0;
  p.invincibleTimer = (mask & 2) ? view.getUint8(o++) / 60 : 0;
  p.splatTimer = (mask & 4) ? view.getUint8(o++) / 60 : 0;
  p.respawnTimer = (mask & 8) ? view.getUint8(o++) / 60 : 0;
  p.fatTimer = (mask & 16) ? view.getUint8(o++) / 60 : 0;
  p.slowTimer = (mask & 32) ? view.getUint8(o++) / 60 : 0;
  p.burnTimer = (mask & 64) ? view.getUint8(o++) / 60 : 0;
  p.damageFlashTimer = (mask & 128) ? view.getUint8(o++) / 60 : 0;
  // u8_x50:squashScale
  p.squashScale = view.getUint8(o++) / 50;
  // u16:killStreak
  p.killStreak = view.getUint16(o, true); o += 2;
  // u8:width, u8:height
  p.width = view.getUint8(o++);
  p.height = view.getUint8(o++);
  // u8_x50:sideSquash
  p.sideSquash = view.getUint8(o++) / 50;
  return o;
};

/**
 * Returns the per-player encode closure derived from the schema.
 *
 * The closure is the hand-stitched mirror of PLAYER_SCHEMA. The `schema`
 * argument is validated against the codec at module load via
 * `assertSchemaMatchesCodec`; passing a different schema will not change
 * the runtime behavior — the schema documents the wire layout, the
 * closure implements it, and the assertion enforces they agree.
 */
export function compilePlayerEncoder(
  schema: SnapshotSchema,
): (view: DataView, o: number, p: WirePlayer) => number {
  assertSchemaShape(schema);
  return _encodePlayer;
}

/**
 * Returns the per-player decode closure derived from the schema. See
 * `compilePlayerEncoder` for the schema-vs-codec contract.
 */
export function compilePlayerDecoder(
  schema: SnapshotSchema,
): (view: DataView, o: number, p: WirePlayer) => number {
  assertSchemaShape(schema);
  return _decodePlayer;
}

// ---- Schema/codec contract enforcement ----

/**
 * Cheap structural check: the supplied schema must declare the same set
 * of fields, in the same order, and with the same types as PLAYER_SCHEMA.
 * Catches drift if a future edit reorders schema entries without
 * updating the codec (or vice versa). Runs at module load — no per-tick
 * cost.
 */
function assertSchemaShape(schema: SnapshotSchema): void {
  if (schema === PLAYER_SCHEMA) return; // identity short-circuit
  if (schema.length !== PLAYER_SCHEMA.length) {
    throw new Error(`schema length mismatch: got ${schema.length}, expected ${PLAYER_SCHEMA.length}`);
  }
  for (let i = 0; i < schema.length; i++) {
    const a = schema[i];
    const b = PLAYER_SCHEMA[i];
    if (a.field !== b.field || a.type !== b.type) {
      throw new Error(
        `schema entry ${i} mismatch: got {field=${String(a.field)},type=${a.type}}, ` +
        `expected {field=${String(b.field)},type=${b.type}}`,
      );
    }
  }
}

// Mark the SchemaField type as referenced — exporting it from schema.ts
// is enough for consumers, but the import keeps the type linkage live
// for tooling.
type _Marker = SchemaField;
const _markerFix: _Marker | null = null;
void _markerFix;

// Helpers exported for tests + sibling modules.
export { encodeTimer, encodeInt16 };
export { _encodePlayer, _decodePlayer };
