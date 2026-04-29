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
import { debugFlags } from '../debugFlags';
import { sampleFps } from '../fpsCounter';
import { GameLoop } from '../gameLoop';
import type { MatchEndCallback } from '../gameLoop';
import { Transport } from './transport';
import { MsgType } from './protocol';
import type { ReliableMessage } from './protocol';
import { HostAuthority } from './hostAuthority';
import type { HostDebugStats } from './hostAuthority';
import { EntityInterpolation, applySnapshotToState } from './interpolation';
import { InputEcho } from './inputEcho';
import { decodeSnapshot } from './snapshot';
import { encodeInputMessage } from './protocol';

export interface NetMatchConfig {
  bgCanvas: HTMLCanvasElement;
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
  private ownReclaimToken: string | null = null;  // token to authenticate RECONNECT_REQUEST
  private lastSnapshotTime = 0;    // wall-clock time of last received snapshot
  private stallNotified = false;    // whether onStall(true) has been fired

  // Reconnection state (guest only)
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
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
  // Previous phase seen in guest snapshots — drives onPhaseChange on transition.
  private _prevGuestPhase: MatchPhase = 'loading';
  // Latches on the first snapshot where matchOver=true so guest-side match-end
  // fires exactly once, even if MATCH_RESULT reliable message is dropped.
  private _guestMatchOverFired = false;

  // Host-side LOADED handshake state
  private loadedGuests = new Set<PlayerSlot>();
  private hostSelfLoaded = false;
  // One-shot flag: if loading timeout fires while hostSelfLoaded is false,
  // re-arm the timer once instead of force-flipping. Reset on each new
  // loading session via resetLoadingHandshake().
  private _loadingTimeoutExtended = false;
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Maximum time host waits for all guests to signal LOADED before force-
   *  advancing phase to 'playing' (and treating laggards as disconnected). */
  private static readonly LOADING_TIMEOUT_MS = 15000;

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
    );

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
        this.loadedGuests.delete(slot as PlayerSlot);
        config.onPlayerDisconnect?.(slot as PlayerSlot);
        // Re-evaluate the LOADED handshake. If the disconnecting guest was
        // the only slot we were still waiting on, expected→[] now and the
        // phase should advance instead of hanging until the 15-30s
        // LOADING_TIMEOUT_MS forces it.
        if (this.gameLoop.getState().phase === 'loading') {
          this.checkAllLoaded();
        }
      },
    });

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
    this.ownReclaimToken = config.ownReclaimToken ?? null;
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
            this.startReconnection();
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
          this.startReconnection();
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
        if (this.lastSnapshotTime > 0) {
          this.lastSnapshotTime = performance.now();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    if (this._isHost && this.hostAuthority) {
      this.hostAuthority.start();
      this.armLoadingTimeout();
      this.startHostLoop();
    } else {
      this.startGuestLoop();
    }
  }

  /** Host: hard timeout for the LOADED handshake. If any guest fails to
   *  signal within LOADING_TIMEOUT_MS, force the match forward and treat
   *  non-responding slots as disconnected. Called from start() and from
   *  resetLoadingHandshake() on rematch/arena-change. */
  private armLoadingTimeout(): void {
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.gameLoop.getState().phase !== 'loading') return;
      // Defer the force-flip if our own preload is still in flight — flipping
      // before host's assets are warm makes audio + sprites pop in over the
      // first few seconds of play. The check has a single retry budget so a
      // permanently-stuck host preload still progresses.
      if (!this.hostSelfLoaded && !this._loadingTimeoutExtended) {
        console.warn('[NetMatch] loading timeout fired but host not loaded — extending');
        this._loadingTimeoutExtended = true;
        this.armLoadingTimeout();
        return;
      }
      console.warn('[NetMatch] loading timeout — forcing phase=playing');
      const expected = this.hostAuthority!.getExpectedGuestSlots();
      const laggards: PlayerSlot[] = [];
      for (const slot of expected) {
        if (!this.loadedGuests.has(slot)) {
          laggards.push(slot);
          this.gameLoop.disconnectPlayer(slot);
        }
      }
      this.onLoadingTimeout?.(laggards);
      this.gameLoop.setPhase('playing');
    }, NetMatch.LOADING_TIMEOUT_MS);
  }

  /** Host: signal that this side's own loading tasks have completed. When
   *  combined with LOADED messages from all guests, flips phase to 'playing'. */
  markHostLoaded(): void {
    if (!this._isHost) return;
    this.hostSelfLoaded = true;
    this.checkAllLoaded();
  }

  /** Guest: tell host that our local loading is done. Host broadcasts a
   *  new snapshot with phase='playing' once all guests have signalled. */
  signalGuestLoaded(): void {
    if (this._isHost) return;
    this.transport.sendReliable({
      type: MsgType.LOADED,
      slot: this.localSlot,
    } as ReliableMessage);
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
   *  phase (rematch, arena change). Without this, a stale LOADED from the
   *  first match would cause checkAllLoaded to flip phase back to 'playing'
   *  before guests finish warming the new arena. */
  resetLoadingHandshake(): void {
    if (!this._isHost) return;
    this.loadedGuests.clear();
    this.hostSelfLoaded = false;
    this._loadingTimeoutExtended = false;
    this.armLoadingTimeout();
  }

  /** Host: check whether all expected guests + host itself have completed
   *  loading. If so, flip phase to 'playing' — the next broadcast snapshot
   *  carries the new phase, auto-syncing all guests. */
  private checkAllLoaded(): void {
    if (!this._isHost || !this.hostAuthority) return;
    if (!this.hostSelfLoaded) return;
    const expected = this.hostAuthority.getExpectedGuestSlots();
    const allIn = expected.every(s => this.loadedGuests.has(s));
    if (!allIn) return;
    if (this.gameLoop.getState().phase !== 'loading') return;
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    this.gameLoop.setPhase('playing');
  }

  /** Host: simulate + broadcast + render. */
  private startHostLoop(): void {
    let lastTime = performance.now();
    const FIXED_DT = FIXED_TIMESTEP;
    let accumulator = 0;

    // Fairness delay: buffer host inputs to match guest round-trip latency.
    // Without this, host has 0ms input lag while guest has RTT/2 + interpolation delay.
    // Ring buffer stores recent inputs; we read from delayFrames behind.
    const MAX_DELAY = 8; // max frames of delay (~133ms)
    const inputRing: import('../types').InputState[] = Array.from(
      { length: MAX_DELAY },
      () => ({ left: false, right: false, jump: false, down: false }),
    );
    let writeIdx = 0;
    let delayFrames = 2; // initial delay (updated from RTT)
    let rttCheckTimer = 0;
    // Reused scratch buffer: only clear jumps fixedUpdate actually consumed,
    // so a jump latched mid-tick survives to the next tick.
    const consumedJumpSlots: PlayerSlot[] = [];
    // Reused scratch InputState passed to networkInputs.set(localSlot, ...).
    // We copy the delayed ring slot here so consumeGuestJumps' mutation of
    // input.jump doesn't corrupt the ring — otherwise an increase in
    // delayFrames re-reads the same slot whose jump was already cleared.
    const localInputScratch: import('../types').InputState = { left: false, right: false, jump: false, down: false };

    const loop = (now: number) => {
      sampleFps(now);
      // Cap dt to 3 ticks — prevents tick burst after fullscreen/tab-switch pauses
      const dt = Math.min((now - lastTime) / 1000, FIXED_DT * 3);
      lastTime = now;
      accumulator += dt;

      // Periodically adapt delay to match guest RTT (every ~1s)
      rttCheckTimer += dt;
      if (rttCheckTimer > 1) {
        rttCheckTimer = 0;
        const rtt = this.transport.currentRtt;
        // Target: half RTT (one-way) + 2 frames interpolation delay, in frames
        // Guest sees: RTT/2 (input to host) + RTT/2 (snapshot back) + 2 frames interp
        // Host should delay by: RTT/2 + 1 frame (to roughly match guest's total)
        const targetDelay = Math.round((rtt / 2) / (FIXED_DT * 1000)) + 1;
        delayFrames = Math.max(1, Math.min(MAX_DELAY, targetDelay));
      }

      while (accumulator >= FIXED_DT) {
        // Write current input into ring buffer
        const currentInput = this.gameLoop.getInputAny();
        inputRing[writeIdx % MAX_DELAY].left = currentInput.left;
        inputRing[writeIdx % MAX_DELAY].right = currentInput.right;
        inputRing[writeIdx % MAX_DELAY].jump = currentInput.jump;
        inputRing[writeIdx % MAX_DELAY].down = currentInput.down;
        writeIdx++;

        // Read delayed input (or current if buffer not full yet). Copy into
        // a scratch InputState so consumeGuestJumps' jump-clear mutation
        // doesn't corrupt the ring buffer (re-reading the same slot when
        // delayFrames increases would otherwise see an already-cleared jump).
        const readIdx = writeIdx > delayFrames ? writeIdx - delayFrames : writeIdx - 1;
        const delayedInput = inputRing[readIdx % MAX_DELAY];
        localInputScratch.left = delayedInput.left;
        localInputScratch.right = delayedInput.right;
        localInputScratch.jump = delayedInput.jump;
        localInputScratch.down = delayedInput.down;

        const networkInputs = this.hostAuthority!.getNetworkInputs();
        networkInputs.set(this.localSlot, localInputScratch);
        consumedJumpSlots.length = 0;
        for (const [slot, input] of networkInputs) {
          if (input.jump) consumedJumpSlots.push(slot as PlayerSlot);
        }
        this.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        this.hostAuthority!.consumeGuestJumps(consumedJumpSlots);
        // Tick reconnection grace timers
        this.hostAuthority!.tickGraceTimers(FIXED_DT);
        this.gameLoop.tickCosmetic(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      // One snapshot per render frame (not per tick) — multiple snapshots
      // per frame would spam guests with decode/GC pressure on mobile.
      this.hostAuthority!.broadcastSnapshot(this.gameLoop.getState());

      this.gameLoop.setConnectionQuality(this.transport.currentRtt, this.transport.currentJitter);

      if (debugFlags.netDebugEnabled) {
        const s = this.hostAuthority!.getStats();
        this.gameLoop.setNetDebugStats({
          localFrame: s.localFrame,
          rtt: s.rtt,
          jitter: s.jitter,
          stalled: false,
          isRelay: s.isRelay,
          snapshotBytes: s.snapshotBytes,
          snapshotBytesMean: s.snapshotBytesMean,
          snapshotBytesMax: s.snapshotBytesMax,
          guestCount: s.guestCount,
          interpDelayFrames: delayFrames,
          bufferDepth: 0,
        });
      }

      this.gameLoop.renderFrame(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
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
          applySnapshotToState(snap, this.gameLoop.getState());
        }
      }

      // 2b. Detect host-driven phase changes arriving via snapshot. Guest's
      // gameLoop.setPhase is never called (phase is mutated directly by
      // applySnapshotToState), so onPhaseChange must be forwarded here.
      const state = this.gameLoop.getState();
      const curPhase = state.phase;
      if (curPhase !== this._prevGuestPhase) {
        // loading→playing edge: kick off music, ambient, per-arena loops,
        // and re-prime cosmetic prev-state baselines. Mirrors host's
        // setPhase('playing'). Without this, the guest plays the entire
        // match in silence (no music, no per-arena ambient).
        if (this._prevGuestPhase === 'loading' && curPhase === 'playing') {
          this.gameLoop.onEnterPlayingPhase();
        }
        this._prevGuestPhase = curPhase;
        this.onPhaseChange?.(curPhase);
      }
      // 2c. Snapshot-driven match-end fallback. The MATCH_RESULT reliable
      // message is defensive but can be lost if the host's connection closes
      // mid-send. The match-over tail of 20 snapshots (core/hostAuthority.ts)
      // gives us redundant delivery — as soon as any of them lands with
      // matchOver=true, synthesize the onMatchEnd callback locally.
      if (!this._guestMatchOverFired && state.matchOver) {
        this._guestMatchOverFired = true;
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
      if (this.lastSnapshotTime > 0 && !this.reconnecting && !state.matchOver
          && state.phase !== 'loading') {
        const elapsed = now - this.lastSnapshotTime;
        if (elapsed > 500 && !this.stallNotified) {
          this.stallNotified = true;
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
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (this._isHost && this.hostAuthority) {
      this.hostAuthority.handleUnreliableMessage(data, fromPeerId);
    } else if (type === MsgType.SNAPSHOT) {
      this.handleGuestSnapshot(data);
    }
    // Ping/pong handled by Transport — it intercepts before dispatching here.
  }

  private handleGuestSnapshot(data: ArrayBuffer): void {
    if (!this.interpolation) return;

    // Track snapshot arrival for stall detection
    this.lastSnapshotTime = performance.now();
    if (this.stallNotified) {
      this.stallNotified = false;
      this.onStall?.(false);
      // Let host know we're healthy again so it can drop the banner.
      this.transport.sendReliable({
        type: MsgType.CONNECTION_UNSTABLE,
        stalled: false,
      } as ReliableMessage);
    }

    // Strip the 1-byte type prefix (0x20) and decode
    const snapBuf = data.slice(1);
    const snap = decodeSnapshot(snapBuf);
    if (snap) {
      this.interpolation.pushSnapshot(snap);
    }
  }

  handleReliableMessage(msg: ReliableMessage, fromPeerId?: string): void {
    if (this._isHost && this.hostAuthority) {
      this.hostAuthority.handleReliableMessage(msg, fromPeerId);
    }

    if (msg.type === MsgType.PAUSE) {
      if ((msg as { paused: boolean }).paused) {
        this.gameLoop.pause();
      } else {
        this.gameLoop.resume();
      }
    } else if (!this._isHost && msg.type === MsgType.SETTINGS_SYNC) {
      // Host-authoritative — guests apply the host's settings, the host never
      // accepts SETTINGS_SYNC from anyone. Without the !isHost gate, a buggy
      // or hostile guest could swap the host's arena mid-match by sending
      // SETTINGS_SYNC{arenaId:'volcano'} — Match.tsx wires onArenaChange to
      // gameLoop.switchArena which rebuilds the host's match state in place.
      if ('arenaId' in msg) {
        this.onArenaChange?.((msg as { arenaId: string }).arenaId);
      }
    } else if (!this._isHost && msg.type === MsgType.MATCH_RESULT) {
      // Host-broadcast only. A guest sending MATCH_RESULT to the host would
      // otherwise schedule a victory transition with the guest's chosen
      // winner, racing the host's authoritative endMatch.
      this.onMatchEnd?.((msg as { winner: string | null }).winner as PlayerSlot | null, this.gameLoop.getState());
    } else if (!this._isHost && msg.type === MsgType.DISCONNECT) {
      // Host receives a guest's graceful DISCONNECT via hostAuthority
      // (peer removal). The NetMatchConfig.onDisconnect callback is the
      // guest's "reconnect-budget exhausted → flash 'Could not reconnect'"
      // hook — firing it on the host on a guest's polite leave would push
      // the host into the disconnect-victory screen.
      this.onDisconnect?.();
    } else if (!this._isHost && msg.type === MsgType.RECONNECT_SYNC) {
      // Honor host's pause state so the guest's render doesn't diverge from
      // a suspended simulation on the other end. Host gating: a guest sending
      // RECONNECT_SYNC could otherwise pause/unpause the host's sim and reset
      // the host's cosmetic prev-state baselines (silencing legitimate SFX
      // until the next state transition).
      const syncMsg = msg as { paused?: boolean };
      if (syncMsg.paused) this.gameLoop.pause();
      else this.gameLoop.resume();
      this.completeReconnection();
    } else if (this._isHost && msg.type === MsgType.LOADED) {
      // Source-authenticate the slot from peerId. A peer could otherwise send
      // LOADED{slot: anotherPeer} and force-start the match before that peer
      // has actually warmed assets. CONNECTION_UNSTABLE below uses the same
      // pattern.
      if (!fromPeerId || !this.hostAuthority) return;
      const senderSlot = this.hostAuthority.getSlotForPeer(fromPeerId) as PlayerSlot | undefined;
      if (!senderSlot) return;
      this.loadedGuests.add(senderSlot);
      this.checkAllLoaded();
    } else if (this._isHost && msg.type === MsgType.CONNECTION_UNSTABLE) {
      const stalled = (msg as { stalled: boolean }).stalled;
      if (fromPeerId && this.hostAuthority) {
        const slot = this.hostAuthority.getSlotForPeer(fromPeerId);
        if (slot) this.onGuestConnectionUnstable?.(slot, stalled);
      }
    } else if (this._isHost && msg.type === MsgType.RECONNECT_REQUEST) {
      if (!fromPeerId || !this.hostAuthority) return;
      const reqSlot = (msg as { slot: string }).slot as PlayerSlot;
      const presentedToken = (msg as { reclaimToken?: string }).reclaimToken;
      if (!this.hostAuthority.handleReconnectRequest(reqSlot, fromPeerId, presentedToken)) return;
      // Ack with current pause state so the guest's render doesn't diverge
      // from a suspended host sim.
      this.transport.sendReliableTo(fromPeerId, {
        type: MsgType.RECONNECT_SYNC,
        slot: reqSlot,
        snapshotFrame: this.hostAuthority.getLocalFrame(),
        paused: this.gameLoop.isPaused(),
      } as ReliableMessage);
      this.hostAuthority.sendSnapshotTo(fromPeerId, this.gameLoop.getState());
      this.loadedGuests.delete(reqSlot);
      this.onGuestReconnected?.(reqSlot);
    }
  }

  /** Start reconnection attempt after disconnect/hard stall (guest only). */
  private startReconnection(): void {
    if (this.reconnecting || this._isHost) return;
    this.reconnecting = true;
    this.onReconnecting?.(true);

    let attempts = 0;
    // 12 attempts × 1.5s = 18s total. Must stay within host's 20s
    // GRACE_PERIOD so the same slot can be reclaimed — otherwise the user
    // rejoins as a brand-new peer with lost state.
    const MAX_ATTEMPTS = 12;
    this.onReconnectAttempt?.(attempts, MAX_ATTEMPTS);

    const tryAttempt = () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        this.abortReconnection();
        return;
      }
      this.onReconnectAttempt?.(attempts, MAX_ATTEMPTS);
      const code = this.transport.roomCode;
      if (!code) return;
      this.transport.joinRoom(code).then(() => {
        // Re-send on every tick after a successful joinRoom — if
        // RECONNECT_SYNC was lost, the next RECONNECT_REQUEST will produce
        // another response from the host (handler is idempotent).
        this.transport.sendReliable({
          type: MsgType.RECONNECT_REQUEST,
          slot: this.localSlot,
          playerName: '',
          reclaimToken: this.ownReclaimToken ?? '',
        } as import('./protocol').ReliableMessage);
      }).catch(() => { /* retry next tick */ });
    };
    tryAttempt();
    this.reconnectTimer = setInterval(tryAttempt, 1500);
  }

  /** Complete reconnection after host confirms. */
  private completeReconnection(): void {
    this.reconnecting = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Stale snapshots would block fresh ones via the out-of-order guard, or
    // lerp across a huge frame gap and teleport entities. Reset latches too
    // so the first post-reconnect snapshot re-fires any phase/match-end edge.
    this.interpolation?.reset();
    // Cosmetic prev-state baselines also need a reset — without this, the
    // first post-reconnect snapshot triggers transitions against pre-
    // disconnect state (e.g. jump/land sounds for a player who landed
    // during the disconnect, score-anim crunch for delta points scored
    // while we were gone, possibly a duplicate victory sound).
    this.gameLoop.resetCosmeticBaselines();
    this._guestMatchOverFired = false;
    // Sync prev-phase to current state so the next snapshot tick doesn't see
    // a synthetic loading→playing edge and re-fire onEnterPlayingPhase. That
    // would double-start non-idempotent ambient loops (wind/lava/etc.) and
    // append duplicate entries to MatchSystem.activeAmbientLoops.
    this._prevGuestPhase = this.gameLoop.getState().phase;
    this.lastSnapshotTime = performance.now();
    this.stallNotified = false;
    this.onReconnecting?.(false);
    this.onStall?.(false);
  }

  /** Abort reconnection after timeout — disconnect as before. */
  private abortReconnection(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    this.onReconnecting?.(false);
    this.onDisconnect?.();
  }

  removePlayer(slot: PlayerSlot): void {
    this.gameLoop.disconnectPlayer(slot);
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this.hostAuthority?.stop();
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
