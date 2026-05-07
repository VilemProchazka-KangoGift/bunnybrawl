/**
 * Deterministic seeded PRNG using mulberry32. Two distinct usage patterns:
 *
 *   1. Single-stream simulation determinism (netcode): construct once with
 *      a known seed, advance via `nextFloat()`, snapshot via `getState()`.
 *      Both peers run the same sequence — see `Simulator` and `physics.ts`.
 *
 *   2. Per-tick keyed cosmetics (lighting flicker, future L2 effects):
 *      `SeededRNG.fromTick(emitterSeed, state.tick)` returns an independent
 *      stream keyed by (emitter, tick). Host-authoritative netcode allows
 *      cosmetic divergence in principle, but consistent appearance across
 *      host/guest is a quality bar — and `state.tick` is in snapshots.
 *
 * Fast, 32-bit period, produces uniform floats in [0, 1).
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Construct an RNG keyed by (seed, tick). Used by lighting flicker and
   *  any other per-tick deterministic effect that needs cross-peer visual
   *  parity (the host-authoritative model lets cosmetics diverge in principle,
   *  but consistent appearance is a quality bar). Pass a per-emitter seed
   *  (e.g. a hash of the entity's position or id) so co-located effects don't
   *  end up perfectly correlated. */
  static fromTick(seed: number, tick: number): SeededRNG {
    return new SeededRNG((seed * 0x9E3779B1 + tick * 0x85EBCA77) | 0);
  }

  /** Advance state and return next float in [0, 1). */
  nextFloat(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  /** Uniform integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  /** Get current internal state for snapshot. */
  getState(): number {
    return this.state;
  }

  /** Restore internal state from snapshot. */
  setState(s: number): void {
    this.state = s;
  }

  /** Create a copy with the same state. */
  clone(): SeededRNG {
    const copy = new SeededRNG(0);
    copy.state = this.state;
    return copy;
  }
}
