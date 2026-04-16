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

// ---- Simulation ----
// TODO: Not yet consumed — these interfaces define the target API for Phase 4
// (hostAuthority + orchestrator extraction). No code uses them as type constraints yet.

export interface Simulation<TInput, TState, TPlayerId extends string> {
  fixedUpdate(dt: number, networkInputs: Map<string, TInput>): void;
  getState(): TState;
  getLocalInput(): TInput;
  disconnectPlayer(id: TPlayerId): void;
  /** dt is frame delta — used to decay visual timers between simulation ticks. */
  renderFrame(dt: number): void;
  cosmeticStep?(dt: number): void;
  /** Switch to external RAF control (no internal requestAnimationFrame loop). */
  setNetworkMode(enabled: boolean): void;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
}

// ---- Snapshot Codec ----

/**
 * Handles serialization/deserialization of game state snapshots.
 * The game provides the binary format — the core just transports bytes.
 */
export interface SnapshotCodec<TSnapshot, TState> {
  /** Extract a snapshot from the current game state (host, every tick). */
  takeSnapshot(frame: number, state: TState): TSnapshot;

  /** Encode a snapshot to a compact binary ArrayBuffer. */
  encode(snapshot: TSnapshot): ArrayBuffer;

  /** Decode a binary ArrayBuffer back into a snapshot. */
  decode(buffer: ArrayBuffer): TSnapshot | null;

  /** Apply a snapshot to the mutable game state for rendering (guest-side). */
  applyToState(snapshot: TSnapshot, state: TState): void;
}

// ---- Interpolation Config ----

/**
 * Tells the interpolation engine how to lerp between two snapshots.
 * The game defines which fields lerp (positions) vs snap (state enums).
 */
export interface InterpolationConfig<TSnapshot> {
  getFrame(snapshot: TSnapshot): number;
  /** Optional: used by getInterpolatedState() convenience method. Not needed if using getRawResult(). */
  interpolate?(before: TSnapshot, after: TSnapshot, t: number): TSnapshot;
}

// ---- Input Codec ----

/**
 * Serializes/deserializes game input for network transport.
 * Inputs are sent every frame so encoding must be compact.
 */
export interface InputCodec<TInput> {
  /** Encode input into a single byte (or small number of bytes). */
  encode(input: TInput): number;

  /** Decode a byte back to input. */
  decode(byte: number): TInput;

  /** Return a "no input" / idle input value. */
  noInput(): TInput;

  /** Number of bytes per input (default: 1). */
  bytesPerInput?: number;
}

// ---- Transport Config ----

/** Configuration for the WebRTC transport layer. */
export interface TransportConfig {
  /** Application identifier for room isolation (e.g. 'my-game-v1'). */
  appId: string;

  /** ICE servers for STUN/TURN (WebRTC connectivity). */
  iceServers?: RTCIceServer[];

  /** Ping interval in ms (default: 500). */
  pingInterval?: number;

  /** Pong timeout in ms before marking peer as lost (default: 10000). */
  pongTimeout?: number;

  /** RTT threshold in ms before marking peer as degraded (default: 4000). */
  degradedThreshold?: number;
}

