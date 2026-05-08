/**
 * Public surface of the snapshot module — barrel re-export.
 *
 * Imports of `from './snapshot'` and `from '../snapshot'` ultimately resolve
 * here (via the file-based shim during the split, then directly via
 * directory-index lookup once `net/snapshot.ts` is removed). Public API
 * kept byte-identical with the pre-split `snapshot.ts`.
 */
export type { AuthSnapshot, SnapshotPlayer } from './types';
export { createEmptySnapshot } from './types';
