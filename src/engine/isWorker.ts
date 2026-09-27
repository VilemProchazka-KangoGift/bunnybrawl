// Dedicated-worker scope detector. `importScripts` only exists on
// `DedicatedWorkerGlobalScope` and survives polyfills of `window` /
// `document` — a prior `howler-worker-compat` plugin set
// `globalThis.window = globalThis` to nurse Howler through worker init,
// which defeated `typeof window` checks. Consumed by `audio/index.ts` to
// route main vs worker implementations without relying on Vite's
// `worker.plugins` aliasing (which doesn't fire for transitively-shared
// transformed sources in dev).
export const isWorkerScope: boolean =
  typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
