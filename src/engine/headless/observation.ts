// src/engine/headless/observation.ts
//
// Observation extractor: converts a MatchState into a flat Float32Array
// suitable for an ML policy. Pure Node — no browser/audio/renderer imports.
//
// The training loop will call this 60 Hz × N players × thousands of episodes,
// so the function is allocation-free in its hot path: the caller provides the
// destination Float32Array.
//
// MatchState does NOT carry the arena reference (the arena lives in the
// owning runner / GameLoop / Simulator). Width/height + hazard zones are
// therefore taken from a separate `arena` parameter. MatchSettings is also
// passed in — needed for the match-context block (mods + scoring values +
// time/kill limits).

import type { Arena, MatchSettings, MatchState, Player, PlayerSlot } from '../types';

/**
 * Observation layout (per slot):
 *
 *   match context     — 10 floats
 *   self block        — 12 floats
 *   per-opponent      — 12 floats × MAX_OPPONENTS (4) = 48
 *   per-carrot        —  3 floats × MAX_CARROTS (4)   = 12
 *   per-hazard-zone   —  4 floats × MAX_HAZARDS (4)   = 16
 *   ----
 *   total                                              98
 *
 * Stable ordering: opponents sorted by slot id (alphabetical). Carrots use
 * insertion order (filtered to active=true). Hazards use arena index order.
 *
 * Coordinate normalization: arena width/height map to [0, 1]. Velocities are
 * divided by VELOCITY_SCALE (a soft cap; values can exceed 1.0 but usually
 * fit in [-2, 2]). Padding for missing entities is zero.
 *
 * Egocentric X distances (opponents / carrots / hazards) use shortest signed
 * distance modulo arena width — see `wrapDx` below — so they live in
 * `[-0.5, +0.5]` rather than `[-1, +1]`. The arena wraps horizontally
 * (`physics.wrapHorizontal`); without this, a 20px-around-the-seam opponent
 * would look like a full screen away.
 *
 * The match-context block lets a single trained policy adapt across regimes
 * (normal vs carrotChase, kill-limit 8 vs 32, etc.) without retraining. All
 * fields are static for the duration of a match (mods + limits) except
 * `timeProgress` which advances with `state.timeElapsed`.
 */
export const MATCH_CONTEXT_FEATURES = 10;
export const SELF_FEATURES = 12;
export const PER_OPPONENT_FEATURES = 12;
export const PER_CARROT_FEATURES = 3;
export const PER_HAZARD_FEATURES = 4;

export const MAX_OPPONENTS = 4;
export const MAX_CARROTS = 4;
export const MAX_HAZARDS = 4;

export const OBS_MATCH_CONTEXT_OFFSET = 0;
export const OBS_SELF_OFFSET = OBS_MATCH_CONTEXT_OFFSET + MATCH_CONTEXT_FEATURES;
export const OBS_OPPONENT_OFFSET = OBS_SELF_OFFSET + SELF_FEATURES;
export const OBS_CARROT_OFFSET = OBS_OPPONENT_OFFSET + MAX_OPPONENTS * PER_OPPONENT_FEATURES;
export const OBS_HAZARD_OFFSET = OBS_CARROT_OFFSET + MAX_CARROTS * PER_CARROT_FEATURES;
export const OBSERVATION_SIZE = OBS_HAZARD_OFFSET + MAX_HAZARDS * PER_HAZARD_FEATURES;
// = 10 + 12 + 48 + 12 + 16 = 98

const VELOCITY_SCALE = 600; // approximate max sustained vx/vy in px/s
const FAT_TIMER_MAX = 6.6;  // matches FAT_DURATION (constants.ts)
const SLOW_TIMER_MAX = 5;   // matches THORN_SLOW_DURATION
const INVINCIBLE_TIMER_MAX = 1.5; // matches INVINCIBLE_DURATION
const BURN_TIMER_MAX = 5;   // matches THORN_SLOW_DURATION (lava sets burnTimer to the same value)
const SCORE_DIFF_SCALE = 16;     // default killLimit
const KILL_LIMIT_NORM = 32;      // upper bound for killLimit normalization (typical 4-32)

export interface ObservationConfig {
  /** Optional override for arena width (defaults to arena.width). */
  arenaWidth?: number;
  /** Optional override for arena height (defaults to arena.height). */
  arenaHeight?: number;
}

/**
 * Write an observation for `slot` into `out`. Throws if `out.length < OBSERVATION_SIZE`.
 *
 * Match context block (10): carrotChase, mirrorArena, superBounce, turbo,
 *   giantPlayers, underwaterGravity, extremeGore (all 0/1), killScoreValue_norm
 *   (0 in carrotChase, 1 otherwise), killLimit_norm (settings.killLimit / 32),
 *   timeProgress (state.timeElapsed / settings.timeLimit, clamped 0..1; 0 if no time limit).
 * Self block (12): x_norm, y_norm, vx_norm, vy_norm, on_ground, fat_timer_norm,
 *                  slow_timer_norm, invincible_timer_norm, burn_timer_norm,
 *                  score_norm, splat (0/1), respawning (0/1).
 * Opponent block (12 × MAX_OPPONENTS): dx_norm, dy_norm, vx_norm, vy_norm,
 *                                      on_ground, score_diff,
 *                                      fat_timer_norm, slow_timer_norm,
 *                                      invincible_timer_norm, burn_timer_norm,
 *                                      alive, present.
 * Carrot block (3 × MAX_CARROTS): dx_norm, dy_norm, present.
 * Hazard block (4 × MAX_HAZARDS): dx_norm_left, dy_norm_top, w_norm, h_norm
 *                                  (rectangle relative to self).
 *
 * Missing entries (fewer than max opponents/carrots/hazards) zero-fill.
 */
export function extractObservation(
  state: Readonly<MatchState>,
  slot: PlayerSlot,
  arena: Readonly<Arena>,
  settings: Readonly<MatchSettings>,
  out: Float32Array,
  config?: ObservationConfig,
): void {
  if (out.length < OBSERVATION_SIZE) {
    throw new Error(`Observation buffer too small: need ${OBSERVATION_SIZE}, got ${out.length}`);
  }
  // Zero the slice we'll write to (don't trust caller's buffer).
  for (let i = 0; i < OBSERVATION_SIZE; i++) out[i] = 0;

  // Match context block — populated even when slot is missing (these are
  // global facts about the match, not slot-specific). Cheap to fill.
  const mods = settings.mods;
  out[OBS_MATCH_CONTEXT_OFFSET + 0] = mods.carrotChase ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 1] = mods.mirrorArena ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 2] = mods.superBounce ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 3] = mods.turbo ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 4] = mods.giantPlayers ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 5] = mods.underwaterGravity ? 1 : 0;
  out[OBS_MATCH_CONTEXT_OFFSET + 6] = mods.extremeGore ? 1 : 0;
  // killScoreValue_norm: kills give 2 points normally (game ratio kill:carrot 2:1),
  // 0 in carrotChase. Normalized by carrot value (1) → (carrotChase ? 0 : 2/2 = 1).
  out[OBS_MATCH_CONTEXT_OFFSET + 7] = mods.carrotChase ? 0 : 1;
  // killLimit_norm: clamped 0..2 (typical 4-32, divided by 32).
  out[OBS_MATCH_CONTEXT_OFFSET + 8] = clamp(settings.killLimit / KILL_LIMIT_NORM, 0, 2);
  // timeProgress: 0 if no time limit; otherwise elapsed / limit, clamped 0..1.
  out[OBS_MATCH_CONTEXT_OFFSET + 9] =
    settings.timeLimit > 0 ? clamp01(state.timeElapsed / settings.timeLimit) : 0;

  const self = findPlayer(state, slot);
  if (!self) return; // slot not in state — match context filled, rest zero

  const W = config?.arenaWidth ?? arena.width;
  const H = config?.arenaHeight ?? arena.height;

  // Self block (offsets relative to OBS_SELF_OFFSET)
  out[OBS_SELF_OFFSET + 0] = self.x / W;
  out[OBS_SELF_OFFSET + 1] = self.y / H;
  out[OBS_SELF_OFFSET + 2] = self.vx / VELOCITY_SCALE;
  out[OBS_SELF_OFFSET + 3] = self.vy / VELOCITY_SCALE;
  out[OBS_SELF_OFFSET + 4] = self.state === 'airborne' ? 0 : 1; // on_ground
  out[OBS_SELF_OFFSET + 5] = clamp01(self.fatTimer / FAT_TIMER_MAX);
  out[OBS_SELF_OFFSET + 6] = clamp01(self.slowTimer / SLOW_TIMER_MAX);
  out[OBS_SELF_OFFSET + 7] = clamp01(self.invincibleTimer / INVINCIBLE_TIMER_MAX);
  out[OBS_SELF_OFFSET + 8] = clamp01(self.burnTimer / BURN_TIMER_MAX);
  // score_norm: scaled by killLimit so a "near-victory" reads as ~1. Guard
  // against killLimit=0 (test scenarios) by flooring the divisor at 1.
  out[OBS_SELF_OFFSET + 9] = self.score / Math.max(1, settings.killLimit);
  out[OBS_SELF_OFFSET + 10] = self.state === 'splat' ? 1 : 0;
  out[OBS_SELF_OFFSET + 11] = self.state === 'respawning' ? 1 : 0;

  // Opponents — sorted by slot id, excluding self. .filter() already returns
  // a fresh array; in-place sort doesn't leak into state.players.
  const opponents = state.players
    .filter(p => p.id !== slot)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < MAX_OPPONENTS && i < opponents.length; i++) {
    const op = opponents[i];
    const base = OBS_OPPONENT_OFFSET + i * PER_OPPONENT_FEATURES;
    out[base + 0] = wrapDx(op.x - self.x, W) / W;
    out[base + 1] = (op.y - self.y) / H;
    out[base + 2] = op.vx / VELOCITY_SCALE;
    out[base + 3] = op.vy / VELOCITY_SCALE;
    out[base + 4] = op.state === 'airborne' ? 0 : 1;
    out[base + 5] = (op.score - self.score) / SCORE_DIFF_SCALE;
    out[base + 6] = clamp01(op.fatTimer / FAT_TIMER_MAX);
    out[base + 7] = clamp01(op.slowTimer / SLOW_TIMER_MAX);
    out[base + 8] = clamp01(op.invincibleTimer / INVINCIBLE_TIMER_MAX);
    out[base + 9] = clamp01(op.burnTimer / BURN_TIMER_MAX);
    out[base + 10] =
      op.active && op.state !== 'splat' && op.state !== 'respawning' ? 1 : 0;
    out[base + 11] = 1; // present
  }

  // Carrots — by spawn order (state.carrots array order), filter active
  const carrots = state.carrots.filter(c => c.active);
  for (let i = 0; i < MAX_CARROTS && i < carrots.length; i++) {
    const c = carrots[i];
    const base = OBS_CARROT_OFFSET + i * PER_CARROT_FEATURES;
    out[base + 0] = wrapDx(c.x - self.x, W) / W;
    out[base + 1] = (c.y - self.y) / H;
    out[base + 2] = 1;
  }

  // Hazard zones — arena.hazardZones (immutable per arena, stable index order).
  // Hazards are rectangles; we wrap the LEFT edge (h.x) relative to self for
  // egocentric encoding. Width is unaffected by the seam — no current arena
  // has a hazard zone that straddles the wrap boundary.
  const hazards = arena.hazardZones ?? [];
  for (let i = 0; i < MAX_HAZARDS && i < hazards.length; i++) {
    const h = hazards[i];
    const base = OBS_HAZARD_OFFSET + i * PER_HAZARD_FEATURES;
    out[base + 0] = wrapDx(h.x - self.x, W) / W;
    out[base + 1] = (h.y - self.y) / H;
    out[base + 2] = h.width / W;
    out[base + 3] = h.height / H;
  }
}

/**
 * Convenience: allocate a Float32Array of the right size and fill it.
 * Prefer the in-place version in tight loops.
 */
export function makeObservation(
  state: Readonly<MatchState>,
  slot: PlayerSlot,
  arena: Readonly<Arena>,
  settings: Readonly<MatchSettings>,
  config?: ObservationConfig,
): Float32Array {
  const out = new Float32Array(OBSERVATION_SIZE);
  extractObservation(state, slot, arena, settings, out, config);
  return out;
}

// Helpers — keep these unexported, simple, and side-effect free.

function findPlayer(state: Readonly<MatchState>, slot: PlayerSlot): Player | undefined {
  return state.players.find(p => p.id === slot);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Shortest signed delta on a horizontally-wrapping axis.
 *
 * The arena wraps via `physics.wrapHorizontal` — a player past the left edge
 * teleports to the right and vice versa. Without this helper, an opponent
 * 20px to the left around the seam would encode as nearly a full screen
 * away, poisoning the policy's egocentric distance signal.
 *
 * Range: [-W/2, W/2]. The asymmetric guards (`>` vs `<`) deliberately keep
 * an exact `W/2` input as `+W/2` (no wrap); both edges are equidistant so
 * the choice is arbitrary. Mirrors `wrapDx` in `ai/awareness.ts`.
 */
function wrapDx(dx: number, W: number): number {
  if (dx > W / 2) return dx - W;
  if (dx < -W / 2) return dx + W;
  return dx;
}
