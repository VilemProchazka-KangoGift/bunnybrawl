import type { MatchState, MatchSettings, PlayerSlot } from '../types';
import type { SeededRNG } from '../net/prng';
import type { PlayerInput } from '../input/PlayerInput';
import type { ParticleEmitter } from '../simulator/types';

/**
 * Result returned by HeadlessRunner.runMatch().
 */
export interface MatchResult {
  /** Winner slot, or null if the match ended without a winner (draw, all disconnected, max ticks). */
  winner: PlayerSlot | null;
  /** Number of fixedUpdate ticks executed. */
  ticks: number;
  /** Why the loop terminated: 'match_over' (state.matchOver flipped), 'max_ticks' (budget exhausted). */
  reason: 'match_over' | 'max_ticks';
  /** Final match state at termination. Read-only — DO NOT mutate. */
  finalState: Readonly<MatchState>;
}

/**
 * Configuration for HeadlessRunner.
 */
export interface HeadlessRunnerConfig {
  /** Arena id — looked up via getArena(arenaId). */
  arenaId: string;
  /** Active player slots in seat order. */
  activePlayers: PlayerSlot[];
  /** Match settings (kill limit, time limit, gore mode, mods). */
  settings: MatchSettings;
  /** Optional seeded PRNG for deterministic runs. Without it, Math.random is used. */
  rng?: SeededRNG;
  /** Maximum number of fixedUpdate ticks. Default 18000 (5 minutes at 60Hz). */
  maxTicks?: number;
  /**
   * Custom particle emitter. Default: a no-op (ML doesn't care about particles).
   * Override if you want to capture particle events for visualization or debugging.
   */
  particleEmitter?: ParticleEmitter;
  /**
   * Map slot -> PlayerInput. The runner registers these before starting.
   * Slots present in `activePlayers` but not in `inputs` get a defensive
   * all-false stub at the Simulator level (see `_getPlayerInput`).
   *
   * Bots that need RuleBasedBot wrapping the simulator's AIController must be
   * registered post-construction via
   * `runner.getSimulator().setPlayerInput(slot, new RuleBasedBot(...))` —
   * the AIController is created inside the Simulator constructor, so the bot
   * input cannot be built before the runner exists. Synthetic inputs like
   * RandomInput don't need the controller and can be passed via this map.
   */
  inputs: Map<PlayerSlot, PlayerInput>;
}
