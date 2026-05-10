export type { SoundName } from './types';
export type { ToneSegment } from './types';
export { floatBufferToWavDataUri } from './synthesis/wav';

/**
 * Worker-aware `audio` export.
 *
 * In dev mode, Vite caches per-URL transforms shared between main and
 * worker contexts. Our `worker.plugins`/top-level-stub aliases don't
 * always fire for transitively-loaded modules (the `?worker_file` query
 * suffix is stripped at re-export boundaries like `gameLoop/index.ts`),
 * so the worker can end up loading the real `AudioManager` even when
 * upstream code intended the stub. That cascade pulls in `howler.js`,
 * which crashes the worker with bare `window.location` /
 * `document.addEventListener` / `HowlerGlobal` references inside the
 * Howler module.
 *
 * Fix at the source: conditionally pick the audio implementation at
 * module-eval time based on whether `window` exists. Main thread loads
 * `AudioManager`; worker loads the no-op stub. The dynamic-import branch
 * not taken is never fetched, so howler never enters the worker module
 * graph regardless of Vite's caching.
 *
 * Trade-off: this module now has a top-level await. ESM handles that
 * fine — consumers of `import { audio } from '../audio'` resolve the
 * named export once the await completes. The static type/value exports
 * above are unaffected by the await.
 */
// Detect worker via `importScripts` — defined ONLY in dedicated-worker
// global scope, regardless of any `window` polyfill. (An earlier howler-
// compat plugin polyfilled `globalThis.window = globalThis` in worker
// context, which defeated a `typeof window` check.)
const _isWorker = typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
export const audio = _isWorker
  ? (await import('../worker/stubs/audio-worker-stub')).audio
  : (await import('./AudioManager')).audio;
