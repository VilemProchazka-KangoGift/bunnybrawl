import type { MatchState, MatchPhase, MatchSettings, Arena, PlayerSlot } from '../types';
import type { SeededRNG } from '../net/prng';

/**
 * Side-effect requests emitted by the Simulator. Adapters subscribe and decide
 * what to do — browser adapter plays sound, headless runner records or ignores.
 *
 * The Simulator MUST NOT import audio, renderer, or any browser API directly.
 * Anything observable from the outside flows through this bag.
 */
export interface SimulatorEvents {
  /** A sound effect should play. Browser adapter calls audio.play(name). */
  onSfxRequest?: (name: string) => void;

  /** A character-bound sound (e.g. animal noise) should play. */
  onAnimalSfxRequest?: (name: string) => void;

  /** Arena music should start. Browser adapter calls audio.playMusic(themeId). */
  onMusicStartRequest?: (themeId: string) => void;

  /** Arena music should stop. */
  onMusicStopRequest?: () => void;

  /** All game sounds should stop (match end, arena swap). */
  onAllGameSoundsStopRequest?: () => void;

  /** Match phase changed. */
  onPhaseChange?: (phase: MatchPhase) => void;

  /** Match has ended — winner slot or null for draw / all-disconnected. */
  onMatchEnd?: (winner: PlayerSlot | null, state: MatchState) => void;
}

export interface SimulatorOptions {
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  /** Optional seeded PRNG. Without it, simulator falls back to Math.random (non-deterministic). */
  rng?: SeededRNG;
  /** Side-effect subscriptions. All callbacks are optional. */
  events?: SimulatorEvents;
}
