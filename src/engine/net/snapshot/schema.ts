/**
 * Schema-driven snapshot codec — declarative description of the per-player
 * wire layout. The codec generator in `codecGen.ts` compiles this into a
 * pair of closure-based encode/decode functions at module-load time, so
 * the runtime hot path has no per-field branching.
 *
 * **The order of entries in PLAYER_SCHEMA defines the wire format.** Any
 * change here is a wire-format change and must be paired with a
 * `PROTOCOL_VERSION` bump in `core/protocol.ts` and a regeneration of
 * `__snapshots__/snapshot-wire-format.test.ts.snap`.
 *
 * Pure module — Node-safe, no game-runtime imports outside type-only.
 */
import type { WirePlayer, PlayerState } from '../../types';

// ---- Field types ----
//
// Primitive types map 1:1 to DataView reads/writes. Composite types
// (`slot`, `flags`, `timerMask`) emit a fixed multi-byte block whose
// internal layout is hand-crafted in codecGen — they exist so the schema
// can describe the per-player layout in execution order.

export type SchemaFieldType =
  | 'f32'
  | 'i16'           // velocity-style with ±32767 clamp
  | 'u16_clamped'   // score / killStreak: clamp to 65535
  | 'u8'            // raw uint8
  | 'u8_round'      // round + clamp 0..255 (width/height)
  | 'u8_x50'        // ×50 packing for fractional 0..5.1 ranges (squashScale, sideSquash)
  | 'enum_u8'       // PlayerState — index into a fixed string array
  | 'slot'          // PlayerSlot via encodeSlot/decodeSlot
  | 'flags'         // composite flags byte (facing/fastFalling/disconnected/active/expression/damageFlashSide)
  | 'timer_mask';   // 1 mask byte + conditional u8 timer tail

export interface SchemaField {
  /** Property name on WirePlayer. */
  field: keyof WirePlayer;
  type: SchemaFieldType;
  /** For `enum_u8`: the ordered list of valid string values. */
  enumValues?: readonly string[];
  /** For `flags`: list of contributing field names. Layout is hand-coded. */
  flagFields?: readonly (keyof WirePlayer)[];
  /** For `timer_mask`: ordered list of timer fields (1 bit + 1 conditional u8 each). */
  timerFields?: readonly (keyof WirePlayer)[];
}

export type SnapshotSchema = readonly SchemaField[];

// PlayerState ordering — must match the legacy `PLAYER_STATE_MAP` in
// binaryCodec.ts byte-for-byte.
export const PLAYER_STATE_VALUES = ['idle', 'run', 'airborne', 'splat', 'respawning'] as const;
// Type guard to keep PLAYER_STATE_VALUES locked to PlayerState.
const _checkPlayerStates: readonly PlayerState[] = PLAYER_STATE_VALUES;
void _checkPlayerStates;

/**
 * Per-player wire schema. Order matches the existing inlined codec in
 * `binaryCodec.ts` exactly — verified by the golden-bytes test.
 */
export const PLAYER_SCHEMA: SnapshotSchema = [
  { field: 'id', type: 'slot' },
  { field: 'x', type: 'f32' },
  { field: 'y', type: 'f32' },
  { field: 'vx', type: 'i16' },
  { field: 'vy', type: 'i16' },
  { field: 'state', type: 'enum_u8', enumValues: PLAYER_STATE_VALUES },
  // Composite flags byte. Bits:
  //   0    = facing right
  //   1    = fastFalling
  //   2    = disconnected
  //   3    = active
  //   4-5  = expression (0=normal, 1=scared, 2=angry, 3=dizzy)
  //   6-7  = damageFlashSide (0=null, 1=left, 2=right)
  {
    field: 'facing',
    type: 'flags',
    flagFields: ['facing', 'fastFalling', 'disconnected', 'active', 'expression', 'damageFlashSide'],
  },
  { field: 'animFrame', type: 'u8' },
  { field: 'score', type: 'u16_clamped' },
  // 1 mask byte + 1 u8 per non-zero timer in declaration order:
  //   bit 0 = hitstopTimer
  //   bit 1 = invincibleTimer
  //   bit 2 = splatTimer
  //   bit 3 = respawnTimer
  //   bit 4 = fatTimer
  //   bit 5 = slowTimer
  //   bit 6 = burnTimer
  //   bit 7 = damageFlashTimer
  {
    field: 'hitstopTimer',
    type: 'timer_mask',
    timerFields: [
      'hitstopTimer', 'invincibleTimer', 'splatTimer', 'respawnTimer',
      'fatTimer', 'slowTimer', 'burnTimer', 'damageFlashTimer',
    ],
  },
  { field: 'squashScale', type: 'u8_x50' },
  { field: 'killStreak', type: 'u16_clamped' },
  { field: 'width', type: 'u8_round' },
  { field: 'height', type: 'u8_round' },
  { field: 'sideSquash', type: 'u8_x50' },
];

// Expression value list — same order as the legacy `EXPRESSION_MAP`.
export const EXPRESSION_VALUES = ['normal', 'scared', 'angry', 'dizzy'] as const;
