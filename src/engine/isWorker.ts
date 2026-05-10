/**
 * Detect dedicated-worker scope. `importScripts` exists ONLY in
 * `DedicatedWorkerGlobalScope` and survives polyfills of `window` /
 * `document` — a prior `howler-worker-compat` plugin set
 * `globalThis.window = globalThis` to nurse Howler through worker init,
 * which defeated `typeof window` checks. `importScripts` has no
 * polyfill risk.
 *
 * Used by modules that need to route different implementations to the
 * main bundle vs the worker bundle without relying on Vite's
 * `worker.plugins` aliasing (which doesn't always fire for transitively-
 * shared transformed sources in dev). See `audio/index.ts` +
 * `audio/howlShim.ts` for the canonical consumers.
 */
export const isWorkerScope: boolean =
  typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
