/**
 * Worker-aware `Howl` export. Character packs `import { Howl } from
 * '../../audio/howlShim'` to declare their `createSound` factory.
 *
 * Why the indirection + conditional: Vite's dev server caches per-URL
 * transforms shared between main and worker bundles. A static
 * `export { Howl } from 'howler'` would have its bare specifier rewritten
 * by optimizeDeps to the prebundled URL — and that transformed shim
 * source then serves identically to main and worker, dragging howler
 * into the worker module graph where its UMD init crashes with
 * `HowlerGlobal is not defined`. The `worker.plugins` `STUB_BY_RESOLVED`
 * alias for this file only fires during production bundling (rollup);
 * dev's shared transform cache bypasses it.
 *
 * Fix: same pattern as `audio/index.ts`. Detect dedicated-worker scope
 * via `importScripts` (no polyfill risk vs `typeof window`) and pick the
 * stub or real howler via conditional dynamic import at module-eval
 * time. The branch not taken is never fetched, so howler never enters
 * the worker module graph in dev. Production rollup still tree-shakes
 * via `worker.plugins`; defense in depth.
 *
 * Trade-off: top-level await here. Character packs only construct Howl
 * inside the `createSound: () => Howl(...)` lambda — lazy evaluation —
 * so the await delay doesn't block any hot path. ESM resolves the named
 * `Howl` export to consumers once the await completes.
 */
import type { Howl as RealHowl } from 'howler';
const _isWorker = typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
// The stub's API is a strict subset of Howler's. Character packs declare
// `createSound: () => Howl` and only ever invoke the constructor; in worker
// context the stub class is never instantiated (audio events route back to
// main). Cast to the real Howl constructor type so the union doesn't widen
// at the call sites.
export const Howl = (_isWorker
  ? (await import('../worker/howlerStub')).Howl
  : (await import('howler')).Howl) as unknown as typeof RealHowl;
