/**
 * NetMatchContext — typed shared-state record threaded between the NetMatch
 * orchestrator and its collaborators (HostLoop, GuestLoop, ReconnectController,
 * LoadingHandshake, MessageRouter).
 *
 * Plain mutable fields. Constructor takes initial values; collaborators take
 * `ctx: NetMatchContext` as a constructor param and read/write fields directly.
 *
 * ## Field-ownership map (from the original NetMatch class)
 *
 * Cross-collaborator state lives here. Single-owner state stays on the
 * collaborator. The split below is the contract for the rest of the
 * decomposition — moving a field out of context to a single owner (or vice
 * versa) is a deliberate change, not a casual edit.
 *
 *   transport                       — shared (HostLoop, GuestLoop, Router, Reconnect, Loading)
 *   isHost                          — shared (Router branches on it; Reconnect/Loading short-circuit)
 *   gameLoop                        — shared (every collaborator)
 *   hostAuthority                   — shared (HostLoop, Loading, Router)
 *   interpolation                   — shared (GuestLoop reads; Reconnect resets)
 *   localSlot                       — shared (HostLoop, GuestLoop, Reconnect)
 *   ownReclaimToken                 — shared (initGuest sets, Reconnect reads)
 *
 *   reconnecting                    — flag: GuestLoop reads, Reconnect sets
 *   lastSnapshotTime                — GuestLoop r/w, Reconnect resets, visibility handler updates
 *   stallNotified                   — GuestLoop, Reconnect
 *   _autoSlowReported               — GuestLoop, Reconnect resets
 *   _prevGuestPhase                 — GuestLoop r/w, Reconnect resets
 *   _guestMatchOverFired            — GuestLoop r/w, Reconnect resets
 *   guestBaselines                  — GuestLoop r/w, Reconnect clears, NetMatch.stop clears
 *
 *   onMatchEnd / onDisconnect       — Router, GuestLoop, Reconnect (callbacks)
 *   onArenaChange                   — Router
 *   onReconnecting                  — Reconnect
 *   onStall                         — GuestLoop, Reconnect
 *   onPhaseChange                   — NetMatch, GuestLoop
 *   onGuestConnectionUnstable       — Router
 *   onReconnectAttempt              — Reconnect
 *   onGuestReconnected              — Router
 *   onLoadingTimeout                — Loading
 *
 * ## Single-owner fields (NOT here)
 *
 *   _visibilityHandler              — NetMatch orchestrator
 *   inputEcho, snapshotPool*        — GuestLoop only
 *   reconnectTimer                  — ReconnectController only
 *   loadedGuests, hostSelfLoaded,
 *   loadingTimeout,
 *   _loadingTimeoutExtended         — LoadingHandshake only
 */
import type { PlayerSlot, MatchState, MatchPhase } from '../../types';
import type { MatchEndCallback } from '../../gameLoop';
import type { NetMatchDriver } from './NetMatchDriver';
import { Transport } from '../transport';
import { HostAuthority } from '../hostAuthority';
import { EntityInterpolation } from '../interpolation';

/** Pool size for AuthSnapshot recycling (matches interpolation ring depth). */
export const SNAPSHOT_POOL_SIZE = 30;

/** Guest-side delta compression: how many encoded baselines we keep around. */
export const GUEST_BASELINE_RING_SIZE = 120; // ~2s at 60Hz

export interface NetMatchContext {
  // ----- Shared infrastructure -----
  readonly transport: Transport;
  readonly isHost: boolean;
  readonly localSlot: PlayerSlot;
  readonly gameLoop: NetMatchDriver;

  /** Host-only; null on guest. */
  hostAuthority: HostAuthority | null;
  /** Guest-only; null on host. */
  interpolation: EntityInterpolation | null;
  /** Guest-only authentication token for RECONNECT_REQUEST. */
  ownReclaimToken: string | null;

  // ----- Cross-collaborator runtime state (guest) -----
  reconnecting: boolean;
  lastSnapshotTime: number;
  stallNotified: boolean;
  autoSlowReported: boolean;
  prevGuestPhase: MatchPhase;
  guestMatchOverFired: boolean;
  /** Guest-side delta-compression baseline ring. Cleared on reconnect/stop. */
  guestBaselines: Map<number, ArrayBuffer>;

  // ----- Caller-supplied callbacks -----
  readonly onMatchEnd?: MatchEndCallback;
  readonly onDisconnect?: () => void;
  readonly onArenaChange?: (arenaId: string) => void;
  readonly onReconnecting?: (reconnecting: boolean) => void;
  readonly onStall?: (stalled: boolean) => void;
  readonly onPhaseChange?: (phase: MatchPhase) => void;
  readonly onGuestConnectionUnstable?: (slot: PlayerSlot, stalled: boolean) => void;
  readonly onReconnectAttempt?: (current: number, max: number) => void;
  readonly onGuestReconnected?: (slot: PlayerSlot) => void;
  readonly onLoadingTimeout?: (slots: PlayerSlot[]) => void;
}

/** Build an initial NetMatchContext. Mutable fields default to "no activity yet". */
export function createNetMatchContext(init: {
  transport: Transport;
  isHost: boolean;
  localSlot: PlayerSlot;
  gameLoop: NetMatchDriver;
  onMatchEnd?: MatchEndCallback;
  onDisconnect?: () => void;
  onArenaChange?: (arenaId: string) => void;
  onReconnecting?: (reconnecting: boolean) => void;
  onStall?: (stalled: boolean) => void;
  onPhaseChange?: (phase: MatchPhase) => void;
  onGuestConnectionUnstable?: (slot: PlayerSlot, stalled: boolean) => void;
  onReconnectAttempt?: (current: number, max: number) => void;
  onGuestReconnected?: (slot: PlayerSlot) => void;
  onLoadingTimeout?: (slots: PlayerSlot[]) => void;
}): NetMatchContext {
  return {
    transport: init.transport,
    isHost: init.isHost,
    localSlot: init.localSlot,
    gameLoop: init.gameLoop,
    hostAuthority: null,
    interpolation: null,
    ownReclaimToken: null,
    reconnecting: false,
    lastSnapshotTime: 0,
    stallNotified: false,
    autoSlowReported: false,
    prevGuestPhase: 'loading',
    guestMatchOverFired: false,
    guestBaselines: new Map<number, ArrayBuffer>(),
    onMatchEnd: init.onMatchEnd,
    onDisconnect: init.onDisconnect,
    onArenaChange: init.onArenaChange,
    onReconnecting: init.onReconnecting,
    onStall: init.onStall,
    onPhaseChange: init.onPhaseChange,
    onGuestConnectionUnstable: init.onGuestConnectionUnstable,
    onReconnectAttempt: init.onReconnectAttempt,
    onGuestReconnected: init.onGuestReconnected,
    onLoadingTimeout: init.onLoadingTimeout,
  };
}

// Re-export so consumers can use a single import.
export type { MatchState };
