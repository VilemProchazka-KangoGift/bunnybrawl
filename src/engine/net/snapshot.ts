/**
 * Transitional re-export shim for the snapshot module.
 *
 * The snapshot implementation now lives in `snapshot/` as four focused
 * files (`types.ts`, `binaryCodec.ts`, `extract.ts`, `index.ts`). This
 * file stays around for one more commit so the file split lands as a
 * clean series of refactors — the next commit deletes this shim and
 * lets `from './snapshot'` resolve to `./snapshot/index.ts` directly.
 */
export type { AuthSnapshot, SnapshotPlayer } from './snapshot/index';
export {
  createEmptySnapshot,
  encodeSnapshot,
  decodeSnapshot,
  takeAuthSnapshot,
  createDelta,
  applyDelta,
} from './snapshot/index';
