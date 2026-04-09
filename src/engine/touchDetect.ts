/**
 * Detects if the primary input device is touch (phone/tablet).
 * Returns false on touchscreen laptops where keyboard is primary.
 * Result is cached — device capabilities don't change mid-session.
 */
let _cached: boolean | null = null;
export function isTouchPrimary(): boolean {
  if (_cached !== null) return _cached;
  // ?mobile URL param forces mobile mode for Chrome DevTools testing
  _cached = new URLSearchParams(location.search).has('mobile')
    || (('ontouchstart' in window || navigator.maxTouchPoints > 0)
      && window.matchMedia('(pointer: coarse)').matches);
  return _cached;
}
