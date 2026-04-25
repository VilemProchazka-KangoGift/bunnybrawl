import { useEffect } from 'react';

/** Hold a screen wake lock for the duration that `active` is true. Async
 *  request resolution after cleanup releases the late sentinel via the
 *  `cancelled` flag — without it, a sentinel assigned post-cleanup would
 *  leak until GC. No-op when `wakeLock` is unavailable (desktop browsers,
 *  insecure contexts).
 *
 *  Browsers auto-release wake locks on visibilitychange (e.g. tab hidden,
 *  screen off). We re-request on visibilitychange when the page returns
 *  visible so the lock survives mid-match suspends. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = () => {
      if (cancelled || sentinel) return;
      navigator.wakeLock.request('screen').then((wl) => {
        if (cancelled) { wl.release().catch(() => {}); return; }
        sentinel = wl;
        // Browser may have released between request issue and resolution.
        wl.addEventListener('release', () => { if (sentinel === wl) sentinel = null; });
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (!document.hidden && !sentinel) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
