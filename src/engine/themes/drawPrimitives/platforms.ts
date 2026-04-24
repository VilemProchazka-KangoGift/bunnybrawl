/**
 * Shared framework for 3D platform rendering.
 *
 * Arena packs compose these helpers in their `drawPlatform` functions.
 * See docs/superpowers/specs/2026-04-24-arena-platforms-design.md for
 * the full design rationale.
 */

// ---- Locked parameters ----
/** Vertical extent of the 3D top cap (px). Straddles the collision line. */
export const CAP_DEPTH = 16;
/** Horizontal skew ratio. Back edge is offset right by CAP_DEPTH * SKEW_RATIO. */
export const SKEW_RATIO = 0.5;

// ---- Deterministic PRNG ----
// Standard mulberry32. Same implementation as the v9 mockup so per-platform
// variation matches the visual target exactly.
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a platform's (x, y) to a PRNG seed. Stable across runs. */
export function seedFor(x: number, y: number): number {
  return (x * 73856093) ^ (y * 19349663);
}
