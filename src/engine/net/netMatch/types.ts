/**
 * Public NetMatch types — kept separate from the orchestrator class so the
 * configuration surface area is browseable on its own.
 */
import type { PlayerSlot, MatchPhase } from '../../types';
import type { Arena, MatchSettings } from '../../types';
import type { MatchEndCallback } from '../../gameLoop';
import type { IRenderer } from '../../renderer';
import type { Transport } from '../transport';
import type { NetMatchDriver } from './NetMatchDriver';

export interface NetMatchConfig {
  bgCanvas: HTMLCanvasElement;
  bgNightCanvas?: HTMLCanvasElement;
  fgNightTint?: HTMLDivElement;
  lightCanvas?: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
  hudCanvas?: HTMLCanvasElement;
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  onMatchEnd: MatchEndCallback;
  transport: Transport;
  localSlot: PlayerSlot;
  remoteSlots: PlayerSlot[];
  /** When provided, NetMatch's GameLoop adopts this Renderer (a worker-
   *  hosted RendererProxy in practice) instead of constructing a fresh
   *  main-thread Renderer from the canvas args. Mirrors the local-mode
   *  worker-offload path; the canvas args are ignored in that case. */
  injectedRenderer?: IRenderer;
  /** Phase 2: when provided, NetMatch skips constructing its own GameLoop
   *  and uses the supplied driver instead. The caller (useOnlineMatch in
   *  ?simWorker=on mode) hands in an EngineWorkerProxy that hosts the
   *  full simulation in a Web Worker. Mutually exclusive with
   *  injectedRenderer — the proxy already owns its hosted Renderer. */
  injectedDriver?: NetMatchDriver;
  onStall?: (stalled: boolean) => void;
  onDisconnect?: () => void;
  onPlayerDisconnect?: (slot: PlayerSlot) => void;
  onArenaChange?: (arenaId: string) => void;
  onReconnecting?: (reconnecting: boolean) => void;
  /** Fired when the match phase transitions. On host, driven by the LOADED
   *  handshake; on guest, driven by the applied snapshot's phase field. */
  onPhaseChange?: (phase: MatchPhase) => void;
  /** Host-side hook: fires when a guest sends CONNECTION_UNSTABLE. The UI
   *  layer uses this to show a banner "X has a slow connection" — no game
   *  behavior changes. */
  onGuestConnectionUnstable?: (slot: PlayerSlot, stalled: boolean) => void;
  /** Guest-side hook: fires every reconnection attempt with (current, max).
   *  UI layer uses it to show an attempt counter and enable a Give Up button. */
  onReconnectAttempt?: (current: number, max: number) => void;
  /** Host-side hook: fires when a guest successfully reclaims their slot via
   *  RECONNECT_REQUEST. The UI layer uses it to send a fresh SETTINGS_SYNC so
   *  a guest that missed an arena change during the disconnect still ends up
   *  on the right arena. */
  onGuestReconnected?: (slot: PlayerSlot) => void;
  /** Fires with the slot list that never sent LOADED within LOADING_TIMEOUT_MS. */
  onLoadingTimeout?: (slots: PlayerSlot[]) => void;
  /** HOST: per-slot reclaim tokens issued in lobby SLOT_ASSIGNMENT. Passed
   *  to HostAuthority.addGuest so the same token validates a future
   *  RECONNECT_REQUEST. Slots not in the map get a fresh token at addGuest. */
  reclaimTokens?: Map<PlayerSlot, string>;
  /** GUEST: this peer's own reclaim token, received from host in
   *  SLOT_ASSIGNMENT. Sent in RECONNECT_REQUEST to authenticate the reclaim
   *  attempt. Without this, any peer in the room could claim a disconnected
   *  slot and steal the original player's score. */
  ownReclaimToken?: string;
}
