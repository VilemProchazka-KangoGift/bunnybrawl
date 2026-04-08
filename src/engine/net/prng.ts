/**
 * Deterministic seeded PRNG using mulberry32.
 * Used in network mode to ensure identical simulation across peers.
 * Fast, 32-bit period, produces uniform floats in [0, 1).
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
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
