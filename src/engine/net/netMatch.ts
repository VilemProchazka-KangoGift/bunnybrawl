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
import { FIXED_TIMESTEP } from '../constants';
import { sampleFps } from '../fpsCounter';
import * as autoSlowDetect from '../autoSlowDetect';
import { perfTrace } from '../perfTrace';
import { GameLoop } from '../gameLoop';
import type { MatchEndCallback } from '../gameLoop';
import { Transport } from './transport';
import { MsgType } from './protocol';
import type { ReliableMessage } from './protocol';
import { HostAuthority } from './hostAuthority';
import type { HostDebugStats } from './hostAuthority';
import { EntityInterpolation, applySnapshotToState } from './interpolation';
import { InputEcho } from './inputEcho';
import { decodeSnapshot, createEmptySnapshot } from './snapshot';
import type { AuthSnapshot } from './snapshot';
import { encodeInputMessage } from './protocol';
import { encodeSnapshotAck } from './core/protocol';
import { applyDelta, readDeltaBaseFrame } from './core/deltaCompression';
import { createNetMatchContext, type NetMatchContext } from './netMatch/NetMatchContext';
import { LoadingHandshake } from './netMatch/LoadingHandshake';
import { ReconnectController } from './netMatch/ReconnectController';
import { MessageRouter } from './netMatch/MessageRouter';
import { HostLoop } from './netMatch/HostLoop';

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

  // Guest-specific
  private interpolation: EntityInterpolation | null = null;
  private inputEcho: InputEcho | null = null;
  // Pool of pre-allocated AuthSnapshot instances cycled through during decode.
  // Size matches the interpolation ring (30) so by the time we wrap back to
  // slot 0, the ring has already evicted whatever this slot used to hold.
  // Decoder writes into the pooled instance in-place — eliminates ~2400
  // small-object allocations per second on the snapshot decode path.
  private static readonly SNAPSHOT_POOL_SIZE = 30;
  private snapshotPool: AuthSnapshot[] = [];
  private snapshotPoolIdx = 0;

  // Guest-side delta compression: ring of recently-applied raw encoded
  // snapshots, keyed by host frame. Lives on ctx (shared with reconnect).
  private static readonly GUEST_BASELINE_RING_SIZE = 120; // ~2s at 60Hz

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
      handleGuestSnapshot: (data) => this.handleGuestSnapshot(data),
      handleGuestDelta: (data) => this.handleGuestDelta(data),
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
    this.snapshotPool = Array.from(
      { length: NetMatch.SNAPSHOT_POOL_SIZE },
      () => createEmptySnapshot(),
    );
    this.snapshotPoolIdx = 0;
    this.ctx.ownReclaimToken = config.ownReclaimToken ?? null;
    // Input echo: instant visual feedback without position prediction.
    // Disable with ?noecho URL param.
    const noEcho = typeof location !== 'undefined'
      && new URLSearchParams(location.search).has('noecho');
    if (!noEcho) {
      this.inputEcho = new InputEcho(config.localSlot);
    }
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
      this.startGuestLoop();
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
    if (!this.interpolation) return -1;
    const snap = this.interpolation.getLatestSnapshot();
    return snap ? snap.frame : -1;
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

  /** Guest: send inputs + predict local + receive snapshots → render. */
  private startGuestLoop(): void {
    // Transport owns all ping/pong RTT measurement. NetMatch used to start its
    // own 500ms ping interval here — dead code because Transport intercepts
    // ping/pong before they reach NetMatch's handleUnreliableMessage.
    const FIXED_DT = FIXED_TIMESTEP;
    let lastTime = performance.now();
    let guestFrame = 0;

    // Input redundancy: ring buffer of last 8 inputs (~133ms coverage).
    // Each packet bundles all 8 so the host can recover from burst packet loss.
    const INPUT_RING_SIZE = 8;
    const inputRing: Array<{ frame: number; input: import('../types').InputState }> = Array.from(
      { length: INPUT_RING_SIZE },
      () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
    );
    let inputRingCount = 0;
    // Pre-allocated array for ordered input encoding (avoids per-frame allocation)
    const orderedSlice: Array<{ frame: number; input: import('../types').InputState }> = Array.from(
      { length: INPUT_RING_SIZE },
      () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
    );

    const loop = (now: number) => {
      sampleFps(now);
      // Cap dt to 3 ticks — prevents tick burst after fullscreen/tab-switch pauses
      const dt = Math.min((now - lastTime) / 1000, FIXED_DT * 3);
      lastTime = now;
      autoSlowDetect.feedFrame(dt * 1000);

      // 1. Read local input, push to ring buffer, send bundled to host
      const localInput = this.gameLoop.getInputAny();
      guestFrame++;
      const ringIdx = guestFrame % INPUT_RING_SIZE;
      inputRing[ringIdx].frame = guestFrame;
      inputRing[ringIdx].input.left = localInput.left;
      inputRing[ringIdx].input.right = localInput.right;
      inputRing[ringIdx].input.jump = localInput.jump;
      inputRing[ringIdx].input.down = localInput.down;
      if (inputRingCount < INPUT_RING_SIZE) inputRingCount++;

      // Build ordered slice (oldest → newest) for encoding — reuses pre-allocated array
      const sendCount = inputRingCount;
      for (let i = sendCount - 1; i >= 0; i--) {
        const src = inputRing[((guestFrame - i) % INPUT_RING_SIZE + INPUT_RING_SIZE) % INPUT_RING_SIZE];
        const dst = orderedSlice[sendCount - 1 - i];
        dst.frame = src.frame;
        dst.input.left = src.input.left;
        dst.input.right = src.input.right;
        dst.input.jump = src.input.jump;
        dst.input.down = src.input.down;
      }
      this.transport.sendUnreliable(
        encodeInputMessage(orderedSlice, 0, sendCount, this.localSlot),
      );

      // 2. Apply interpolated host snapshot to state
      if (this.interpolation) {
        const snap = this.interpolation.getInterpolatedState();
        if (snap) {
          const applyStart = perfTrace.begin('net.applySnapshot');
          applySnapshotToState(snap, this.gameLoop.getState());
          perfTrace.end('net.applySnapshot', applyStart);
        }
      }

      // 2b. Detect host-driven phase changes arriving via snapshot. Guest's
      // gameLoop.setPhase is never called (phase is mutated directly by
      // applySnapshotToState), so onPhaseChange must be forwarded here.
      const state = this.gameLoop.getState();
      const curPhase = state.phase;
      if (curPhase !== this.ctx.prevGuestPhase) {
        // loading→playing edge: kick off music, ambient, per-arena loops,
        // and re-prime cosmetic prev-state baselines. Mirrors host's
        // setPhase('playing'). Without this, the guest plays the entire
        // match in silence (no music, no per-arena ambient).
        if (this.ctx.prevGuestPhase === 'loading' && curPhase === 'playing') {
          this.gameLoop.onEnterPlayingPhase();
        }
        this.ctx.prevGuestPhase = curPhase;
        this.onPhaseChange?.(curPhase);
      }
      // 2c. Snapshot-driven match-end fallback. The MATCH_RESULT reliable
      // message is defensive but can be lost if the host's connection closes
      // mid-send. The match-over tail of 20 snapshots (core/hostAuthority.ts)
      // gives us redundant delivery — as soon as any of them lands with
      // matchOver=true, synthesize the onMatchEnd callback locally.
      if (!this.ctx.guestMatchOverFired && state.matchOver) {
        this.ctx.guestMatchOverFired = true;
        this.onMatchEnd?.(state.winner as PlayerSlot | null, state);
      }

      // 3. Tick cosmetics (SFX, particles, visual effects via state-transition detection)
      // No matchOver guard — cosmeticStep needs to run the frame matchOver flips
      // to detect the transition and play the victory sound.
      // During loading, `cosmeticStep` would early-return — instead, run the
      // systems with prev-state pinned to current so JIT compiles the hot paths
      // before phase flips to 'playing'.
      if (state.phase === 'loading') {
        this.gameLoop.warmupCosmeticDuringLoading(dt);
      } else {
        this.gameLoop.tickCosmetic(dt);
      }

      // 4. Apply input echo for local player visual responsiveness
      if (this.inputEcho) {
        this.inputEcho.apply(localInput, state, this.transport.currentRtt, dt);
      }

      // 5. Decay gameplay timers for smooth visual interpolation between snapshots.
      // Only timers NOT handled by cosmeticStep — these affect gameplay (stomp immunity,
      // respawn timing) and are driven by fixedUpdate on the host / snapshots on the guest.
      for (const p of state.players) {
        if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
        if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
        if (p.splatTimer > 0) p.splatTimer = Math.max(0, p.splatTimer - dt);
        if (p.respawnTimer > 0) p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.burnTimer > 0) p.burnTimer = Math.max(0, p.burnTimer - dt);
        if (p.hitstopTimer > 0) p.hitstopTimer = Math.max(0, p.hitstopTimer - dt);
      }
      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt);

      // 5b. Signal slow CPU to host once our local autoSlow flips — host
      // halves broadcast rate and skips delta encoding to this peer.
      if (!this.ctx.autoSlowReported && state.phase !== 'loading'
          && autoSlowDetect.isFlipped()) {
        this.ctx.autoSlowReported = true;
        this.transport.sendReliable({
          type: MsgType.CONNECTION_UNSTABLE,
          stalled: true,
        } as ReliableMessage);
      }

      // 6. Stall detection (soft banner only). A snapshot-stream gap no longer
      // triggers reconnection — the transport's pong timeout is the single
      // source of truth for peer liveness. Forcing reconnection on brief
      // Wi-Fi blips while the WebRTC channel is still alive caused all
      // reconnect attempts to be rejected by the host (hasActivePeer=true)
      // until the pong timeout caught up ~7s later. Now we just flash a
      // "Connection Unstable" banner; actual reconnect fires from
      // onPeerDisconnected in setEvents.
      // Skip during loading: a >500ms gap is normal as JIT compiles the
      // snapshot decode path on a cold guest, and the ensuing
      // CONNECTION_UNSTABLE message would tell the host "guest has a slow
      // connection" before the match has even started.
      if (this.ctx.lastSnapshotTime > 0 && !this.ctx.reconnecting && !state.matchOver
          && state.phase !== 'loading') {
        const elapsed = now - this.ctx.lastSnapshotTime;
        if (elapsed > 500 && !this.ctx.stallNotified) {
          this.ctx.stallNotified = true;
          this.onStall?.(true);
          // Reliable hint to host: "my snapshot stream is lagging." Host will
          // show a banner so the human running the host knows why the guest
          // is misbehaving, without waiting for the pong timeout.
          this.transport.sendReliable({
            type: MsgType.CONNECTION_UNSTABLE,
            stalled: true,
          } as ReliableMessage);
        }
      }

      // 7. Render
      this.gameLoop.renderFrame(dt);

      // 8. Update connection quality indicator for HUD
      this.gameLoop.setConnectionQuality(this.transport.currentRtt, this.transport.currentJitter);

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    this.router.handleUnreliableMessage(data, fromPeerId);
  }

  /** Update stall-detection bookkeeping after any successful snapshot
   *  arrival (full or delta). Called by both handleGuestSnapshot and
   *  handleGuestDelta. */
  private noteSnapshotArrival(): void {
    this.ctx.lastSnapshotTime = performance.now();
    if (this.ctx.stallNotified) {
      this.ctx.stallNotified = false;
      this.onStall?.(false);
      this.transport.sendReliable({
        type: MsgType.CONNECTION_UNSTABLE,
        stalled: false,
      } as ReliableMessage);
    }
  }

  /** Push raw encoded bytes (no type prefix) into the guest baseline ring
   *  and trim oldest entries to bound memory. */
  private storeGuestBaseline(frame: number, encoded: ArrayBuffer): void {
    this.ctx.guestBaselines.set(frame, encoded);
    if (this.ctx.guestBaselines.size > NetMatch.GUEST_BASELINE_RING_SIZE) {
      // Drop the oldest (smallest frame number)
      const oldest = this.ctx.guestBaselines.keys().next().value;
      if (oldest !== undefined) this.ctx.guestBaselines.delete(oldest);
    }
  }

  /** ACK the host: "I have applied frame N, you may delta against it." */
  private sendAck(frame: number): void {
    this.transport.sendUnreliable(encodeSnapshotAck(frame));
  }

  private handleGuestSnapshot(data: ArrayBuffer): void {
    if (!this.interpolation) return;
    this.noteSnapshotArrival();

    const handleStart = perfTrace.begin('net.handleSnapshot');
    // Skip the 1-byte type prefix and decode into a pooled instance —
    // pool size matches the interpolation ring so the slot we're about to
    // overwrite has already been evicted from the ring.
    const out = this.snapshotPool[this.snapshotPoolIdx];
    this.snapshotPoolIdx = (this.snapshotPoolIdx + 1) % NetMatch.SNAPSHOT_POOL_SIZE;
    const decodeStart = perfTrace.begin('net.decodeSnapshot');
    const snap = decodeSnapshot(data, 1, out);
    perfTrace.end('net.decodeSnapshot', decodeStart);
    if (snap) {
      this.interpolation.pushSnapshot(snap);
      // Skip baseline-store + ACK after we've signalled slow CPU — the host
      // bypasses delta encoding to unstable peers so this work is unused.
      if (!this.ctx.autoSlowReported) {
        this.storeGuestBaseline(snap.frame, data.slice(1));
        this.sendAck(snap.frame);
      }
    }
    perfTrace.end('net.handleSnapshot', handleStart);
  }

  private handleGuestDelta(data: ArrayBuffer): void {
    if (!this.interpolation) return;

    const handleStart = perfTrace.begin('net.handleDelta');
    const baseFrame = readDeltaBaseFrame(data);
    if (baseFrame === null) {
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }
    const baseline = this.ctx.guestBaselines.get(baseFrame);
    if (!baseline) {
      // Baseline not in our ring — host will keyframe within
      // STALE_ACK_THRESHOLD frames, so just drop. No sense ACKing nothing.
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }
    const reconstructed = applyDelta(data, baseline);
    if (!reconstructed) {
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }

    // Counts as snapshot arrival once we've actually got bytes we can use.
    this.noteSnapshotArrival();

    const out = this.snapshotPool[this.snapshotPoolIdx];
    this.snapshotPoolIdx = (this.snapshotPoolIdx + 1) % NetMatch.SNAPSHOT_POOL_SIZE;
    const decodeStart = perfTrace.begin('net.decodeSnapshot');
    const snap = decodeSnapshot(reconstructed, 0, out);
    perfTrace.end('net.decodeSnapshot', decodeStart);
    if (snap) {
      this.interpolation.pushSnapshot(snap);
      this.storeGuestBaseline(snap.frame, reconstructed);
      this.sendAck(snap.frame);
    }
    perfTrace.end('net.handleDelta', handleStart);
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
