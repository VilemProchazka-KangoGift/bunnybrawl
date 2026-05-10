/**
 * Worker offload is on by default. The user-toggleable kill switch
 * (`?worker=off` URL param + `carrotroyale_worker` localStorage) was
 * removed on 2026-05-10 after Phase 1 production validation — main-thread
 * fixedUpdate p95 0.20ms with worker on, zero long frames >33ms, 18× CPU
 * drop under 4× throttle vs. the no-worker baseline.
 *
 * The remaining fallback is a browser-capability check. On hosts without
 * `OffscreenCanvas` or module `Worker` support (very old Safari, some
 * embedded webviews), proxy construction throws at `transferControlToOffscreen`
 * and the cascade in `useLocalMatch` / `useOnlineMatch` falls back to the
 * main-thread Renderer via the `canvasesDetached` guard.
 */

export function isWorkerEnabled(): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false;
  if (typeof Worker === 'undefined') return false;
  return true;
}
