// Generic decay-and-fire cooldown bookkeeping. Promoted from a duplicated
// `Map<K, number>` pattern (see Phase 1 modularization roadmap).
//
// Semantics — the "countdown" cooldown shape:
//   set(k, t)      → schedule readiness in t seconds (overwrites prior).
//   tick(k, dt)    → subtract dt; return true once the timer reaches/crosses 0.
//   clear() / clear(k) → reset all keys / one key (next tick returns true).
//
// Uninitialized keys are treated as ready (tick returns true) — matches the
// "if (cd.get(id) ?? 0) <= 0" pattern in pre-existing call sites.
//
// NOT a fit for accumulator-style timers (footsteps, afterimages) which sum
// dt up to a per-tick variable threshold — those have different semantics
// and stay as raw Map<K, number>.

export class Cooldowns<K> {
  private readonly remaining = new Map<K, number>();

  /** Schedule readiness in `t` seconds. Overwrites any prior value. */
  set(key: K, t: number): void {
    this.remaining.set(key, t);
  }

  /**
   * Decay the cooldown by `dt`. Returns true the tick the timer crosses zero
   * (or if the key was never set / already expired). Negative `dt` is clamped.
   *
   * Once expired, subsequent ticks keep returning true until `set` is called
   * again — call sites are expected to re-`set` immediately after observing
   * `true` to start the next cycle.
   */
  tick(key: K, dt: number): boolean {
    const prev = this.remaining.get(key) ?? 0;
    const step = dt > 0 ? dt : 0;
    const next = prev - step;
    if (next <= 0) {
      this.remaining.set(key, 0);
      return true;
    }
    this.remaining.set(key, next);
    return false;
  }

  /** Reset all keys (or one) to ready. */
  clear(key?: K): void {
    if (key === undefined) this.remaining.clear();
    else this.remaining.delete(key);
  }
}
