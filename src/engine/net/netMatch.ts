/**
 * NetMatch: orchestrates Transport + host-authoritative netcode for online play.
 *
 * Host mode: runs GameLoop simulation, broadcasts state snapshots to guests.
 * Guest mode: creates GameLoop for rendering, applies host snapshots to its state.
 *
 * Both host and guest have a GameLoop — the difference is who drives the simulation:
 * - Host: runs fixedUpdate() with guest inputs injected
 * - Guest: receives host snapshots and overwrites its MatchState before rendering
 */
import type { PlayerSlot, MatchState, MatchPhase } from '../types';
import type { Arena, MatchSettings } from '../types';
import { isBotSlot } from '../types';
import { GameLoop } from '../gameLoop';
import type { MatchEndCallback } from '../gameLoop';
import { Transport } from './transport';
import { MsgType } from './protocol';
import type { ReliableMessage } from './protocol';
import { HostAuthority } from './hostAuthority';
import type { HostDebugStats } from './hostAuthority';
import { EntityInterpolation } from './interpolation';
import { createNetMatchContext, type NetMatchContext } from './netMatch/NetMatchContext';
import { LoadingHandshake } from './netMatch/LoadingHandshake';
import { ReconnectController } from './netMatch/ReconnectController';
import { MessageRouter } from './netMatch/MessageRouter';
import { HostLoop } from './netMatch/HostLoop';
import { GuestLoop } from './netMatch/GuestLoop';

export interface NetMatchConfig {
  bgCanvas: HTMLCanvasElement;
  bgNightCanvas?: HTMLCanvasElement;
  fgNightTint?: HTMLDivElement;
  fgCanvas: HTMLCanvasElement;
  hudCanvas?: HTMLCanvasElement;
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  onMatchEnd: MatchEndCallback;
  transport: Transport;
  localSlot: PlayerSlot;
  remoteSlots: PlayerSlot[];
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

export class NetMatch {
  private transport: Transport;
  private _isHost: boolean;
  private onMatchEnd?: MatchEndCallback;
  private onDisconnect?: () => void;
  private onArenaChange?: (arenaId: string) => void;

  // Both host and guest have a GameLoop (for rendering)
  private gameLoop: GameLoop;

  // Host-specific
  private hostAuthority: HostAuthority | null = null;

  // Guest-specific — interpolation lives on ctx (shared with Reconnect).
  private interpolation: EntityInterpolation | null = null;

  // Reconnection state — owned by ReconnectController; flag lives on context.
  private reconnect!: ReconnectController;
  private onReconnecting?: (reconnecting: boolean) => void;
  private onStall?: (stalled: boolean) => void;

  // Phase callback forwarder (fired from gameLoop.setPhase or, for guests,
  // from snapshot-driven phase transitions detected in the guest loop).
  private onPhaseChange?: (phase: MatchPhase) => void;
  // Host-side only: fires when a guest sends CONNECTION_UNSTABLE.
  private onGuestConnectionUnstable?: (slot: PlayerSlot, stalled: boolean) => void;
  // Guest-side only: fires per reconnect attempt so the UI can show progress.
  private onReconnectAttempt?: (current: number, max: number) => void;
  // Host-side only: fires after a guest reclaims their slot via RECONNECT_REQUEST.
  private onGuestReconnected?: (slot: PlayerSlot) => void;
  // Host-side only: fires when LOADING_TIMEOUT_MS forces the match to start
  // without some guests.
  private onLoadingTimeout?: (slots: PlayerSlot[]) => void;
  // Visibility listener — installed in start(), removed in stop(). Resets
  // stall-detection timestamps when the tab returns so a long backgrounded
  // period doesn't fire a spurious "Connection Unstable" banner.
  private _visibilityHandler: (() => void) | null = null;
  // Cross-collaborator guest-runtime flags live on context:
  //   prevGuestPhase, guestMatchOverFired, autoSlowReported,
  //   lastSnapshotTime, stallNotified, reconnecting, guestBaselines

  // Host-side LOADED handshake — owned by LoadingHandshake collaborator.
  private loading: LoadingHandshake;
  // Reliable + unreliable transport message switch.
  private router!: MessageRouter;
  // Host-only — null on guest. Owns the host's rAF loop + broadcast cadence.
  private hostLoop: HostLoop | null = null;
  // Guest-only — null on host. Owns the guest's rAF loop + snapshot/delta path.
  private guestLoop: GuestLoop | null = null;

  // Shared cross-collaborator state seam.
  private ctx: NetMatchContext;

  // Shared
  private rafId = 0;
  private localSlot: PlayerSlot;

  constructor(config: NetMatchConfig) {
    this.transport = config.transport;
    this._isHost = config.transport.isHost;
    this.onMatchEnd = config.onMatchEnd;
    this.onDisconnect = config.onDisconnect;
    this.onArenaChange = config.onArenaChange;
    this.onReconnecting = config.onReconnecting;
    this.onStall = config.onStall;
    this.onPhaseChange = config.onPhaseChange;
    this.onGuestConnectionUnstable = config.onGuestConnectionUnstable;
    this.onReconnectAttempt = config.onReconnectAttempt;
    this.onGuestReconnected = config.onGuestReconnected;
    this.onLoadingTimeout = config.onLoadingTimeout;
    this.localSlot = config.localSlot;

    // Both host and guest create a GameLoop (needed for canvas rendering)
    this.gameLoop = new GameLoop(
      config.bgCanvas,
      config.fgCanvas,
      config.arena,
      config.settings,
      config.activePlayers,
      config.onMatchEnd,
      config.hudCanvas,
      undefined, // rng
      config.bgNightCanvas,
      config.fgNightTint,
    );

    // Build shared context + collaborators. Order matters: context first,
    // then host-only / guest-only init populates context's hostAuthority /
    // interpolation, then collaborators reference back through context.
    this.ctx = createNetMatchContext({
      transport: this.transport,
      isHost: this._isHost,
      localSlot: this.localSlot,
      gameLoop: this.gameLoop,
      onMatchEnd: this.onMatchEnd,
      onDisconnect: this.onDisconnect,
      onArenaChange: this.onArenaChange,
      onReconnecting: this.onReconnecting,
      onStall: this.onStall,
      onPhaseChange: this.onPhaseChange,
      onGuestConnectionUnstable: this.onGuestConnectionUnstable,
      onReconnectAttempt: this.onReconnectAttempt,
      onGuestReconnected: this.onGuestReconnected,
      onLoadingTimeout: this.onLoadingTimeout,
    });
    this.loading = new LoadingHandshake(this.ctx);
    this.reconnect = new ReconnectController(this.ctx);
    this.router = new MessageRouter(this.ctx, this.loading, this.reconnect, {
      handleGuestSnapshot: (data) => this.guestLoop?.handleGuestSnapshot(data),
      handleGuestDelta: (data) => this.guestLoop?.handleGuestDelta(data),
    });

    if (this._isHost) {
      this.initHost(config);
    } else {
      this.initGuest(config);
    }
  }

  private initHost(config: NetMatchConfig): void {
    this.hostAuthority = new HostAuthority({
      gameLoop: this.gameLoop,
      transport: config.transport,
      localSlot: config.localSlot,
      onMatchEnd: config.onMatchEnd,
      onPlayerDisconnect: (slot) => {
        // Drop any stale LOADED signal for a slot that's disconnecting —
        // otherwise a later reconnect would skip the handshake because its
        // slot is still marked "loaded" from the original session.
        this.loading.forgetSlot(slot as PlayerSlot);
        config.onPlayerDisconnect?.(slot as PlayerSlot);
        // Re-evaluate the LOADED handshake. If the disconnecting guest was
        // the only slot we were still waiting on, expected→[] now and the
        // phase should advance instead of hanging until the 15-30s
        // LOADING_TIMEOUT_MS forces it.
        if (this.gameLoop.getState().phase === 'loading') {
          this.loading.checkAllLoaded();
        }
      },
    });
    this.ctx.hostAuthority = this.hostAuthority;

    // Register remote human players
    for (const slot of config.remoteSlots) {
      if (!isBotSlot(slot)) {
        const peerIds = config.transport.getPeerIds();
        const peerIdx = config.remoteSlots.indexOf(slot);
        if (peerIdx < peerIds.length) {
          // Pass the lobby-issued token through so the same token validates
          // future RECONNECT_REQUEST. If absent (e.g. test path), HostAuthority
          // generates a fresh one at addGuest time.
          const token = config.reclaimTokens?.get(slot);
          this.hostAuthority.addGuest(peerIds[peerIdx], slot, token);
        }
      }
    }
  }

  private initGuest(config: NetMatchConfig): void {
    this.interpolation = new EntityInterpolation();
    this.ctx.interpolation = this.interpolation;
    this.ctx.ownReclaimToken = config.ownReclaimToken ?? null;
    // Input echo: instant visual feedback without position prediction.
    // Disable with ?noecho URL param.
    const noEcho = typeof location !== 'undefined'
      && new URLSearchParams(location.search).has('noecho');
    this.guestLoop = new GuestLoop(this.ctx, { disableInputEcho: noEcho });
  }

  /** Start the network match. */
  start(): void {
    this.transport.setEvents({
      onStatusChange: (status) => {
        if (status === 'disconnected' || status === 'error') {
          if (this._isHost) {
            this.onDisconnect?.();
          } else {
            // Guest: attempt reconnection instead of immediate disconnect
            this.reconnect.startReconnection();
          }
        }
      },
      onReliableMessage: (msg, fromPeerId) => this.handleReliableMessage(msg, fromPeerId),
      onUnreliableMessage: (data, fromPeerId) => this.handleUnreliableMessage(data, fromPeerId),
      onRttUpdate: () => {},
      onPeerDisconnected: (peerId) => {
        if (this._isHost && this.hostAuthority) {
          this.hostAuthority.removeGuest(peerId);
        } else {
          // Guest: attempt reconnection instead of immediate disconnect
          this.reconnect.startReconnection();
        }
      },
    });

    // Both: put GameLoop in network mode (external RAF, no internal loop)
    this.gameLoop.setNetworkMode(true);
    // Forward gameLoop phase changes (host-driven) to the NetMatchConfig caller.
    // Guest-driven phase changes (from snapshots) fire via _fireGuestPhaseChange
    // in startGuestLoop, since applySnapshotToState bypasses setPhase.
    this.gameLoop.setOnPhaseChange((phase) => this.onPhaseChange?.(phase));
    // start() in network mode attaches input handlers + audio but skips internal RAF
    this.gameLoop.start();

    // rAF stops while the tab is hidden; refresh lastSnapshotTime on return
    // so the 500ms stall banner doesn't trip on the first frame back.
    if (typeof document !== 'undefined') {
      this._visibilityHandler = () => {
        if (document.hidden) return;
        if (this.ctx.lastSnapshotTime > 0) {
          this.ctx.lastSnapshotTime = performance.now();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    if (this._isHost && this.hostAuthority) {
      this.hostAuthority.start();
      this.hostAuthority.enableDeltaCompression(true);
      this.loading.armLoadingTimeout();
      this.hostLoop = new HostLoop(this.ctx);
      this.hostLoop.start();
    } else {
      this.guestLoop!.start();
    }
  }

  /** Host: signal that this side's own loading tasks have completed. */
  markHostLoaded(): void {
    this.loading.markHostLoaded();
  }

  /** Guest: tell host that our local loading is done. */
  signalGuestLoaded(): void {
    this.loading.signalGuestLoaded();
  }

  /** Guest-only: returns the latest received snapshot's host-frame number,
   *  or -1 if nothing has arrived yet. Public so e2e perf tests can derive
   *  snapshot arrival timing without monkey-patching private internals. */
  getLatestSnapshotFrame(): number {
    return this.guestLoop?.getLatestSnapshotFrame() ?? -1;
  }

  /** Guest: wait until the snapshot stream has warmed up before signalling
   *  LOADED. The first 10–20s of a match used to be choppy on low-end Android:
   *  interpolation starts at 2-frame delay, only widens after detecting 3+
   *  missed snapshots, while the renderer/AI/sprite caches haven't JITted yet.
   *  Holding LOADED back until the buffer has filled lets the loading screen
   *  absorb that warm-up window instead of the player seeing it as choppy
   *  gameplay. Resolves on success or graceful timeout — never rejects, so a
   *  flaky network can't block match start.
   *
   *  Gates on three signals:
   *    - Interpolation ring depth ≥ minSnapshots (covers the 5-frame max
   *      adaptive delay with margin).
   *    - At least one valid RTT measurement (`transport.currentRtt > 0`).
   *      Without this, host's input-fairness delay spends the first second
   *      computing against a stale RTT.
   *    - At least minMs since the first snapshot arrived (lets jitter
   *      measurements settle before interpolation tightens). */
  async waitForGuestNetworkReady(opts: {
    minSnapshots?: number;
    minMs?: number;
    timeoutMs?: number;
  } = {}): Promise<void> {
    if (this._isHost || !this.interpolation) return;
    const minSnapshots = opts.minSnapshots ?? 12;
    const minMs = opts.minMs ?? 250;
    const timeoutMs = opts.timeoutMs ?? 4000;
    const startTime = performance.now();
    let firstSnapshotTime = 0;
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.interpolation) { resolve(); return; }
        const depth = this.interpolation.getBufferDepth();
        const rtt = this.transport.currentRtt;
        const now = performance.now();
        if (depth > 0 && firstSnapshotTime === 0) firstSnapshotTime = now;
        const elapsed = now - startTime;
        const sinceFirst = firstSnapshotTime > 0 ? now - firstSnapshotTime : 0;
        if (depth >= minSnapshots && rtt > 0 && sinceFirst >= minMs) { resolve(); return; }
        if (elapsed >= timeoutMs) { resolve(); return; }
        setTimeout(check, 50);
      };
      check();
    });
  }

  /** Host: reset loading-handshake state when re-entering the 'loading'
   *  phase (rematch, arena change). */
  resetLoadingHandshake(): void {
    this.loading.resetLoadingHandshake();
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    this.router.handleUnreliableMessage(data, fromPeerId);
  }

  handleReliableMessage(msg: ReliableMessage, fromPeerId?: string): void {
    this.router.handleReliableMessage(msg, fromPeerId);
  }

  removePlayer(slot: PlayerSlot): void {
    this.gameLoop.disconnectPlayer(slot);
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.hostLoop?.stop();
    this.guestLoop?.stop();
    this.reconnect.dispose();
    this.loading.dispose();
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this.hostAuthority?.stop();
    this.ctx.guestBaselines.clear();
    this.gameLoop.stop();
  }

  setMatchOver(): void {
    this.hostAuthority?.setMatchOver();
  }

  getState(): MatchState {
    return this.gameLoop.getState();
  }

  getGameLoop(): GameLoop {
    return this.gameLoop;
  }

  pause(): void {
    this.gameLoop.pause();
    this.transport.sendReliable({ type: MsgType.PAUSE, paused: true });
  }

  resume(): void {
    this.gameLoop.resume();
    this.transport.sendReliable({ type: MsgType.PAUSE, paused: false });
  }

  isPaused(): boolean {
    return this.gameLoop.isPaused();
  }

  skipCountdown(): void {
    this.gameLoop.skipCountdown();
  }

  getDebugStats(): HostDebugStats | null {
    if (this._isHost && this.hostAuthority) {
      return this.hostAuthority.getStats();
    }
    return null;
  }

  get isHost(): boolean {
    return this._isHost;
  }
}
