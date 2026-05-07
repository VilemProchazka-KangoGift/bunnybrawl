// Back-compat re-export. The class moved to `engine/seededRng.ts` once
// lighting (L1) became a peer consumer of the cosmetic-determinism path —
// `net/` was a misleading home. Keep this re-export so the ~17 existing
// `import { SeededRNG } from '.../net/prng'` sites don't churn.
export { SeededRNG } from '../seededRng';
