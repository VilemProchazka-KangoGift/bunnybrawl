/**
 * NetMatchDriver — the public surface NetMatch's collaborators consume.
 *
 * Both `GameLoop` (Phase 1 local-sim) and `EngineWorkerProxy` (Phase 2
 * sim-in-worker) implement this so `HostLoop` / `GuestLoop` / `MessageRouter`
 * / `LoadingHandshake` / `ReconnectController` don't have to branch on which
 * implementation is installed. The `isRemoteSim()` discriminator lets the
 * host loop skip its inline `fixedUpdate` call and route inputs through
 * `postInputBatch` when sim runs in the worker.
 *
 * IMPORTANT: only methods actually called by netMatch/* belong here. Adding
 * a method to this interface ties NetMatch to it; resist exposing internals.
 */
import type { MatchState, MatchPhase, MatchSettings, PlayerSlot, InputState } from '../../types';
import type { NetDebugStats } from '../core/debugOverlay';

export interface NetMatchDriver {
  // ---- Lifecycle ---------------------------------------------------------
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;

  // ---- State access ------------------------------------------------------
  /** Synchronous read. For EngineWorkerProxy, returns the mirrored state
   *  (5Hz refresh) or the boot state before the first mirror arrives. */
  getState(): MatchState;
  /** The local human's input merged across keyboard + touch + (in Phase 2
   *  host mode) the worker's input batch echo. */
  getInputAny(): InputState;

  // ---- Tick + render -----------------------------------------------------
  /** Local-sim mode: drives the sim a fixed step. In remote-sim mode the
   *  worker drives its own tick — implementations should no-op here. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void;
  /** Cosmetic systems (SFX, particles, VFX). Half-rate inside the
   *  implementation. */
  tickCosmetic(dt: number): void;
  /** JIT-warmup the cosmetic hot paths during loading so the first
   *  in-match frame doesn't hitch. Guest-side only — implementations may
   *  no-op when not relevant. */
  warmupCosmeticDuringLoading(dt: number): void;
  /** Paint the current state at the supplied frame delta. */
  renderFrame(dt: number): void;
  /** Re-sample cosmetic baselines so a phase transition doesn't fire
   *  spurious SFX. */
  resetCosmeticBaselines(): void;

  // ---- Sim mutations driven by netcode -----------------------------------
  setPhase(phase: MatchPhase): void;
  onEnterPlayingPhase(): void;
  setOnPhaseChange(cb: (phase: MatchPhase) => void): void;
  skipCountdown(): void;
  switchArena(arenaId: string, overrides?: Partial<MatchSettings>): void;
  disconnectPlayer(slot: PlayerSlot): void;
  setNetworkMode(enabled: boolean): void;

  // ---- Debug overlay forwarding ------------------------------------------
  setConnectionQuality(rtt: number, jitter: number): void;
  setNetDebugStats(stats: NetDebugStats | null): void;

  // ---- Phase 2 discriminator + sim-in-worker hooks -----------------------
  /** True iff the simulation runs in a Web Worker. HostLoop branches on
   *  this to skip its inline fixedUpdate and forward inputs to the worker
   *  instead. GameLoop returns false; EngineWorkerProxy returns true. */
  isRemoteSim(): boolean;

  /** Phase 2: post an input batch into the worker's per-tick input map.
   *  Called by HostLoop in remote-sim mode after the fairness ring is
   *  read. GameLoop's implementation is a no-op (sim runs inline). */
  postInputBatch(inputs: ReadonlyMap<PlayerSlot, InputState>): void;

  /** Phase 2: subscribe to encoded snapshots emitted by the worker after
   *  each fixedUpdate. NetMatch funnels into
   *  HostAuthority.broadcastEncodedSnapshot. GameLoop never emits — its
   *  implementation may no-op. */
  onSnapshotReady(cb: (buffer: ArrayBuffer, frame: number) => void): void;

  /** Phase 2: hand a guest-side encoded snapshot to the worker for
   *  decode + interpolate + apply. GameLoop never receives — no-op. */
  pumpIncomingSnapshot(buffer: ArrayBuffer): void;

  /** Phase 2: tell the worker which net role it's running. */
  setNetMode(mode: 'host' | 'guest' | 'off', delayFrames?: number): void;

  /** Phase 2: defensive slot-set assertion (host → worker). */
  setExpectedSlots(slots: PlayerSlot[]): void;

  /** Phase 2: route a grace-timer-expired disconnect to the worker's sim. */
  disconnectSlot(slot: PlayerSlot): void;

  /** Phase 2: route a RECONNECT_REQUEST acceptance to the worker's sim. */
  reconnectSlot(slot: PlayerSlot): void;
}
