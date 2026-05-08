// src/engine/input/PlayerInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';

/**
 * Per-tick context passed to every PlayerInput.getAction. Built once per
 * fixedUpdate, shared across all slots — implementations must NOT mutate it.
 *
 * - `networkInputs`: the host-authoritative input buffer (one entry per slot
 *   driven by the network in this tick). Consumed by RemoteInput. Absent in
 *   local-only matches and headless runs.
 * - `airborne`: the local touch player's airborne state for this tick.
 *   Consumed by TouchAdapter to convert swipe-down into fast-fall while
 *   airborne. Other PlayerInput impls ignore it.
 *
 * The shape is intentionally narrow — anything here must be cheap to populate
 * and shared by every slot. Per-slot data still lives inside the impl.
 */
export interface PlayerInputContext {
  readonly networkInputs?: ReadonlyMap<PlayerSlot, InputState>;
  readonly airborne?: boolean;
}

/**
 * Unified action source. Implementations: keyboard, rule-based AI, network remote,
 * ML policy, synthetic random, touch. Adapters (BrowserGameLoop, HeadlessRunner,
 * host) own a list of PlayerInput and call getAction() per tick before stepping
 * the simulator.
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
   *
   * `ctx` carries per-tick environment data (network inputs, local airborne).
   * It is shared across slots and MUST NOT be mutated by implementations.
   */
  getAction(state: Readonly<MatchState>, ctx?: PlayerInputContext): InputState;

  /**
   * Release any resources (event listeners, timers, network handles).
   * Adapters call this when ending a match.
   */
  dispose?(): void;
}

/** Helper for impls that don't need state — keyboard, random, etc. */
export type StatelessInputFn = () => InputState;
