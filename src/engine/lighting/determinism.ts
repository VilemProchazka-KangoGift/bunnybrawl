// src/engine/lighting/determinism.ts
//
// Deterministic RNG keyed by (seed, tick). Every phased lighting effect
// (flicker, twinkle, pulse) MUST use this — never Math.random() or
// performance.now(). Reason: host-authoritative netcode allows cosmetic
// divergence in principle, but consistent appearance across host/guest is a
// quality bar for player-visible lighting. The seed is per-emitter (e.g. one
// torch's pos hash); the tick comes from MatchState.tick.

/** Returns a function producing deterministic floats in [0, 1). */
export function tickRng(seed: number, tick: number): () => number {
  // Mulberry32 with state derived from (seed, tick). Cheap, good distribution.
  let state = (seed * 0x9E3779B1 + tick * 0x85EBCA77) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
