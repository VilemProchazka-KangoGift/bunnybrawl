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

/** Game simulation loop — the core orchestrator calls these to drive host and guest. */
export interface Simulation<TInput, TState> {
  fixedUpdate(dt: number, networkInputs: Map<string, TInput>): void;
  getState(): TState;
  /** Read merged local input (keyboard + touch + gamepad). */
  getInputAny(): TInput;
  disconnectPlayer(id: string): void;
  /** dt is frame delta — used to decay visual timers between simulation ticks. */
  renderFrame(dt: number): void;
  cosmeticStep(dt: number): void;
  /** Switch to external RAF control (no internal requestAnimationFrame loop). */
  setNetworkMode(enabled: boolean): void;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  skipCountdown(): void;
  /** Optional: update HUD with connection quality. */
  setConnectionQuality?(rtt: number, jitter: number): void;
}

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
  bytesPerInput?: number;
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

// ---- Orchestrator Config ----

/** Configuration for the generic host/guest loop orchestrator. */
export interface OrchestratorConfig<TInput, TState, TSnapshot> {
  simulation: Simulation<TInput, TState>;
  snapshotCodec: SnapshotCodec<TSnapshot, TState>;
  inputCodec: InputCodec<TInput>;
  interpolationConfig: InterpolationConfig<TSnapshot>;
  localSlot: string;
  remoteSlots: string[];
  isHost: boolean;
  fixedTimestep: number;
  /** Called every guest frame after snapshot apply — game decays visual timers. */
  onGuestTick?(dt: number, state: TState): void;
  /** Called every guest frame with local input — game applies cosmetic echo. */
  onGuestInput?(input: TInput, state: TState, rtt: number, dt: number): void;
  /** Extrapolate a snapshot forward by dt (for late arrivals). */
  extrapolateSnapshot?(snapshot: TSnapshot, dt: number): TSnapshot;
  onMatchEnd?(winner: string | null, state: TState): void;
  onStall?(stalled: boolean): void;
  onStallTimeout?(): void;
  onDisconnect?(): void;
  onPlayerDisconnect?(slot: string): void;
  onReconnecting?(reconnecting: boolean): void;
  /** Check if a slot is a bot (bots don't get network treatment). */
  isBotSlot?(slot: string): boolean;
}

// ---- Transport Config ----

export interface TransportConfig {
  appId: string;
  iceServers?: RTCIceServer[];
  pingInterval?: number;
  pongTimeout?: number;
  degradedThreshold?: number;
}
