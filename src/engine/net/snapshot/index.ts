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

export { encodeSnapshot, decodeSnapshot } from './binaryCodec';

export { takeAuthSnapshot } from './extract';

// Delta compression APIs are re-exported here so the eventual deletion of
// the legacy net/snapshot.ts shim doesn't break callers that imported
// createDelta/applyDelta from this path.
export { createDelta, applyDelta } from '../core/deltaCompression';
