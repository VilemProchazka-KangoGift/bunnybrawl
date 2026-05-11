/**
 * Detects if the primary input device is touch (phone/tablet).
 * Returns false on touchscreen laptops where keyboard is primary.
 * Result is cached — device capabilities don't change mid-session.
 *
 * Worker-safe: returns false when called outside a DOM context (no
 * `window`). The sim-in-worker bundle imports GameLoop which calls this
 * at construction; we want the import to be harmless even though Vite
 * dev's shared transform cache defeats the `vite.config > worker.plugins`
 * alias that should redirect this file to its worker stub.
 */
let _cached: boolean | null = null;
export function isTouchPrimary(): boolean {
  if (_cached !== null) return _cached;
  if (typeof window === 'undefined') return (_cached = false);
  // ?mobile URL param forces mobile mode for Chrome DevTools testing
  _cached = new URLSearchParams(location.search).has('mobile')
    || (('ontouchstart' in window || navigator.maxTouchPoints > 0)
      && window.matchMedia('(pointer: coarse)').matches);
  return _cached;
}
