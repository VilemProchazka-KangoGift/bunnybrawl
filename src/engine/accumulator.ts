// Generic add-and-fire accumulator. Promoted from a duplicated
// `Map<K, number>` pattern (see Phase 1b modularization roadmap).
//
// Semantics — the "accumulator" timer shape:
//   advance(k, dt, interval) → adds dt; returns true and subtracts `interval`
//                              once the running total reaches it. Otherwise
//                              accumulates and returns false.
//   clear() / clear(k)       → reset all keys / one key to 0.
//
// Drift-free: residual carries over across fires (subtract interval, don't zero).
// Negative dt is clamped to 0.
// Uninitialized keys are NOT ready (acc starts at 0).
//
// NOT a fit for countdown-style cooldowns (set-then-decay) — that's `Cooldowns<K>`.

export class Accumulator<K> {
  private readonly acc = new Map<K, number>();

  /**
   * Add `dt` to the accumulator for `key`. Returns true and subtracts `interval`
   * if the accumulated time reaches the threshold. Otherwise accumulates and
   * returns false. Per-tick variable `interval` is supported.
   */
  advance(key: K, dt: number, interval: number): boolean {
    const step = dt > 0 ? dt : 0;
    const next = (this.acc.get(key) ?? 0) + step;
    if (next >= interval) {
      this.acc.set(key, next - interval);
      return true;
    }
    this.acc.set(key, next);
    return false;
  }

  /** Reset all keys (or one) to 0. */
  clear(key?: K): void {
    if (key === undefined) this.acc.clear();
    else this.acc.delete(key);
  }
}
