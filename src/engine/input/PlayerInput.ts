// src/engine/input/PlayerInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';

/**
 * Unified action source. Implementations: keyboard, rule-based AI, network remote,
 * ML policy, synthetic random. Adapters (BrowserGameLoop, HeadlessRunner, host)
 * own a list of PlayerInput and call getAction() per tick before stepping the simulator.
 *
 * The interface is intentionally synchronous — async (e.g. remote model inference)
 * must be handled inside the impl by buffering predictions; the loop must not block.
 */
export interface PlayerInput {
  /** The player slot this input controls. */
  readonly slot: PlayerSlot;

  /**
   * Produce the input for this tick. Receives a readonly snapshot of state so AI/ML
   * impls can sense the world. Must NOT mutate state.
   */
  getAction(state: Readonly<MatchState>): InputState;

  /**
   * Release any resources (event listeners, timers, network handles).
   * Adapters call this when ending a match.
   */
  dispose?(): void;
}

/** Helper for impls that don't need state — keyboard, random, etc. */
export type StatelessInputFn = () => InputState;
