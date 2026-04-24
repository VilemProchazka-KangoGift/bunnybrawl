/**
 * Generic interfaces for host-authoritative P2P netcode.
 *
 * Games implement these interfaces to plug into the networking core.
 * The core module has zero game-specific dependencies — all game knowledge
 * is injected via these type parameters:
 *
 *   TInput    — game's input format (e.g. {left, right, jump, down})
 *   TSnapshot — game's authoritative snapshot format
 *   TState    — game's mutable render state
 *   TPlayerId — game's player identifier (e.g. 'P1' | 'P2' | 'B1')
 */

// ---- Snapshot Codec ----

/** Game-specific snapshot serialization. The core just transports bytes. */
export interface SnapshotCodec<TSnapshot, TState> {
  takeSnapshot(frame: number, state: TState): TSnapshot;
  encode(snapshot: TSnapshot): ArrayBuffer;
  decode(buffer: ArrayBuffer): TSnapshot | null;
  applyToState(snapshot: TSnapshot, state: TState): void;
}

// ---- Interpolation Config ----

export interface InterpolationConfig<TSnapshot> {
  getFrame(snapshot: TSnapshot): number;
  /** Optional: used by getInterpolatedState() convenience method. */
  interpolate?(before: TSnapshot, after: TSnapshot, t: number): TSnapshot;
}

// ---- Input Codec ----

/** Compact input serialization for network transport (called every frame). */
export interface InputCodec<TInput> {
  encode(input: TInput): number;
  decode(byte: number): TInput;
  /** Return a neutral / idle input value. */
  noInput(): TInput;
}

// ---- Host Authority Config ----

/** Configuration for the generic host authority engine. */
export interface HostAuthorityConfig<TInput, TState, TSnapshot> {
  simulation: { getState(): TState; disconnectPlayer(id: string): void };
  snapshotCodec: SnapshotCodec<TSnapshot, TState>;
  inputCodec: InputCodec<TInput>;
  localSlot: string;
  /** Called when a guest input arrives — game can latch edge-triggered inputs. */
  onInputReceived?(slot: string, existing: TInput, incoming: TInput): TInput;
  /** Called when a player reconnects in splatted state — game can trigger respawn. */
  onPlayerReconnect?(state: TState, slot: string): void;
  onPlayerDisconnect?(slot: string): void;
}

