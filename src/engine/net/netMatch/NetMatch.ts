/**
 * NetMatch — thin orchestrator for host-authoritative online play.
 *
 * Decomposed in Phase 13 into a context + 5 collaborators:
 *   - NetMatchContext: typed shared-state seam (transport, gameLoop,
 *     hostAuthority, interpolation, callbacks, cross-collaborator runtime
 *     flags).
 *   - LoadingHandshake: host-side LOADED handshake + 15s timeout.
 *   - ReconnectController: guest-side reconnect retry loop + completion.
 *   - MessageRouter: reliable + unreliable transport message switch.
 *   - HostLoop: host-side per-frame simulate + broadcast.
 *   - GuestLoop: guest-side per-frame input-send + snapshot-apply +
 *     snapshot/delta wire handlers.
 *
 * NetMatch itself owns lifecycle (constructor wiring, start/stop, pause/
 * resume, host vs guest branching) and the visibility handler. Public API
 * is preserved verbatim — Match.tsx and the test suite consume it as before.
 */
import type { PlayerSlot, MatchState } from '../../types';
import { isBotSlot } from '../../types';
import { GameLoop } from '../../gameLoop';
import { MsgType } from '../protocol';
import type { ReliableMessage } from '../protocol';
import { HostAuthority } from '../hostAuthority';
import type { HostDebugStats } from '../hostAuthority';
import { EntityInterpolation } from '../interpolation';
import { createNetMatchContext, type NetMatchContext } from './NetMatchContext';
import { LoadingHandshake } from './LoadingHandshake';
import { ReconnectController } from './ReconnectController';
import { MessageRouter } from './MessageRouter';
import { HostLoop } from './HostLoop';
import { GuestLoop } from './GuestLoop';
import type { NetMatchConfig } from './types';
import { isInputEchoEnabled } from '../inputEchoFlag';

export type { NetMatchConfig } from './types';

export class NetMatch {
  private readonly _isHost: boolean;
  private gameLoop: GameLoop;
  private hostAuthority: HostAuthority | null = null;
  private ctx: NetMatchContext;

  private loading: LoadingHandshake;
  private reconnect: ReconnectController;
  private router: MessageRouter;
  private hostLoop: HostLoop | null = null;
  private guestLoop: GuestLoop | null = null;

  private _visibilityHandler: (() => void) | null = null;

  constructor(config: NetMatchConfig) {
    this._isHost = config.transport.isHost;

    // Phase 2: when `injectedDriver` is provided, sim runs in a worker
    // and the driver IS the sim — skip constructing a local GameLoop.
    // The driver implements the NetMatchDriver surface plus everything
    // GameLoop exposed (proxy is API-compatible). Cast covers the
    // GameLoop-typed `this.gameLoop` field; HostLoop / GuestLoop only
    // ever call NetMatchDriver methods.
    if (config.injectedDriver) {
      this.gameLoop = config.injectedDriver as unknown as GameLoop;
    } else {
      // Both host and guest create a GameLoop (needed for canvas rendering).
      // When an injectedRenderer is provided (worker-offload renderer-only
      // path), GameLoop adopts it and ignores the canvas args.
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
        config.lightCanvas,
        config.injectedRenderer,
      );
    }

    // Build shared context + collaborators. Order matters: context first,
    // then host-only / guest-only init populates context's hostAuthority /
    // interpolation, then collaborators reference back through context.
    this.ctx = createNetMatchContext({
      transport: config.transport,
      isHost: this._isHost,
      localSlot: config.localSlot,
      gameLoop: this.gameLoop,
      onMatchEnd: config.onMatchEnd,
      onDisconnect: config.onDisconnect,
      onArenaChange: config.onArenaChange,
      onReconnecting: config.onReconnecting,
      onStall: config.onStall,
      onPhaseChange: config.onPhaseChange,
      onGuestConnectionUnstable: config.onGuestConnectionUnstable,
      onReconnectAttempt: config.onReconnectAttempt,
      onGuestReconnected: config.onGuestReconnected,
      onLoadingTimeout: config.onLoadingTimeout,
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
    this.ctx.interpolation = new EntityInterpolation();
    this.ctx.ownReclaimToken = config.ownReclaimToken ?? null;
    // Input echo: instant visual feedback without position prediction.
    // Disable via DevMenu (or legacy ?noecho).
    this.guestLoop = new GuestLoop(this.ctx, { disableInputEcho: !isInputEchoEnabled() });
  }

  /** Start the network match. */
  start(): void {
    this.ctx.transport.setEvents({
      onStatusChange: (status) => {
        if (status === 'disconnected' || status === 'error') {
          if (this._isHost) {
            this.ctx.onDisconnect?.();
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
    // Guest-driven phase changes (from snapshots) fire from the GuestLoop,
    // since applySnapshotToState bypasses setPhase.
    this.gameLoop.setOnPhaseChange((phase) => this.ctx.onPhaseChange?.(phase));
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
      // Phase 2: when sim runs in the worker, route worker-emitted
      // encoded snapshots into HostAuthority.broadcastEncodedSnapshot
      // (which respects per-peer broadcast tier + delta bypass exactly
      // like the inline broadcast does). Tell the worker its role.
      if (this.ctx.gameLoop.isRemoteSim()) {
        const authority = this.hostAuthority;
        this.ctx.gameLoop.onSnapshotReady((buffer, frame) => {
          authority.broadcastEncodedSnapshot(buffer, frame);
        });
        this.ctx.gameLoop.setNetMode('host', 0);
      }
      this.hostLoop = new HostLoop(this.ctx);
      this.hostLoop.start();
    } else {
      // Phase 2 guest-side: wake the worker into guest mode before the
      // snapshot stream arrives so the interpolation engine is ready.
      if (this.ctx.gameLoop.isRemoteSim()) {
        this.ctx.gameLoop.setNetMode('guest', 2 /* initial delayFrames */);
      }
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
   *  LOADED. Holding LOADED back until the interpolation buffer has filled
   *  + RTT settled lets the loading screen absorb the warm-up window. Host
   *  short-circuits to resolve immediately. */
  async waitForGuestNetworkReady(opts: {
    minSnapshots?: number;
    minMs?: number;
    timeoutMs?: number;
  } = {}): Promise<void> {
    if (this._isHost || !this.guestLoop) return;
    return this.guestLoop.waitForNetworkReady(opts);
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
    this.ctx.transport.sendReliable({ type: MsgType.PAUSE, paused: true });
  }

  resume(): void {
    this.gameLoop.resume();
    this.ctx.transport.sendReliable({ type: MsgType.PAUSE, paused: false });
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
