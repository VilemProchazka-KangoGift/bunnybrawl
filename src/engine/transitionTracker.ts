/**
 * Generic prev-state tracker for cosmetic transition detection.
 *
 * Replaces the recurring `Map<K, T> prev + snapshot fn + manual prev-update`
 * triplet that previously lived in three cosmetic systems
 * (PlayerTransition, SurfaceImpact, EntityTransition spring bounces).
 *
 * Usage:
 *   const tracker = new TransitionTracker<PlayerSlot, PrevState>(snapshotFn);
 *   tracker.prime(slot, source);                        // init baseline
 *   tracker.detect(slot, source, (prev) => fireFx(...)); // fires only when prev exists
 *
 * Semantics: `detect()` calls `onTransition(prev)` only when a prev exists for
 * the key. After the callback runs (or on first call), the tracker stores a
 * fresh snapshot of `source` as the new prev. This matches the legacy
 * "if (prev) detect(...) else snapshot()" pattern with prev mutated in place
 * at the end of detect.
 */
export class TransitionTracker<K, T, S = unknown> {
  private readonly _snapshot: (source: S) => T;
  private readonly _prev: Map<K, T> = new Map();

  constructor(snapshot: (source: S) => T) {
    this._snapshot = snapshot;
  }

  /** Run transition detection. Fires `onTransition(prev)` only if a prev
   *  baseline exists for this key. After firing (or on first call without
   *  baseline), stores a fresh snapshot as the new prev. */
  detect(k: K, source: S, onTransition: (prev: T) => void): void {
    if (this._prev.has(k)) {
      onTransition(this._prev.get(k) as T);
    }
    this._prev.set(k, this._snapshot(source));
  }

  /** Explicitly seed/replace the baseline for `k` without firing onTransition.
   *  Used by `init()` and reset paths. */
  prime(k: K, source: S): void {
    this._prev.set(k, this._snapshot(source));
  }

  /** Get the current stored prev, if any. */
  get(k: K): T | undefined {
    return this._prev.get(k);
  }

  /** Whether a baseline exists for `k`. */
  has(k: K): boolean {
    return this._prev.has(k);
  }

  /** Drop the baseline for `k`. */
  delete(k: K): void {
    this._prev.delete(k);
  }

  /** Iterate stored keys (for swap-removal cleanup of stale entries). */
  keys(): IterableIterator<K> {
    return this._prev.keys();
  }

  /** Clear all baselines. */
  clear(): void {
    this._prev.clear();
  }
}
