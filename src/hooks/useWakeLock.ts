import { useEffect } from 'react';

/** Hold a screen wake lock for the duration that `active` is true. Async
 *  request resolution after cleanup releases the late sentinel via the
 *  `cancelled` flag — without it, a sentinel assigned post-cleanup would
 *  leak until GC. No-op when `wakeLock` is unavailable (desktop browsers,
 *  insecure contexts). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((wl) => {
      if (cancelled) { wl.release().catch(() => {}); return; }
      sentinel = wl;
    }).catch(() => {});
    return () => { cancelled = true; sentinel?.release().catch(() => {}); };
  }, [active]);
}
