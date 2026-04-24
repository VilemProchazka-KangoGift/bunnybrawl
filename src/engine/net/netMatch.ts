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
import {
  encodeInputMessage,
  encodeSnapshotAck,
} from './protocol';

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
  rngSeed: number;
  onDesync?: () => void;
  onStall?: (stalled: boolean) => void;
  onStallTimeout?: () => void;
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
  /** Host-side hook: fires when the LOADING_TIMEOUT_MS hard cap is reached
   *  and one or more guest slots never sent LOADED. The UI layer uses this
   *  to flash a "Starting without X" banner. Fires with the laggard slot
   *  list (may be empty if all guests loaded but host self-load was slow). */
  onLoadingTimeout?: (slots: PlayerSlot[]) => void;
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
      },
    });

    // Register remote human players
    for (const slot of config.remoteSlots) {
      if (!isBotSlot(slot)) {
        const peerIds = config.transport.getPeerIds();
        const peerIdx = config.remoteSlots.indexOf(slot);
        if (peerIdx < peerIds.length) {
          this.hostAuthority.addGuest(peerIds[peerIdx], slot);
        }
      }
    }
  }

  private initGuest(config: NetMatchConfig): void {
    this.interpolation = new EntityInterpolation();
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

    // Refresh stall-detection timestamps when the tab returns — rAF stops
    // while hidden, so `now - lastSnapshotTime` would be in the thousands
    // of ms and trip the 500ms stall banner on the first frame back even
    // though the WebRTC connection is healthy. Transport already primes its
    // own ping/pong on visibility; mirror that here for the snapshot path.
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
      // Host: start a hard timeout for LOADED handshake. If any guest fails to
      // signal within LOADING_TIMEOUT_MS, force the match forward and treat
      // non-responding slots as disconnected.
      this.loadingTimeout = setTimeout(() => {
        if (this.gameLoop.getState().phase === 'loading') {
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
        }
      }, NetMatch.LOADING_TIMEOUT_MS);
      this.startHostLoop();
    } else {
      this.startGuestLoop();
    }
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

  /** Host: reset loading-handshake state when re-entering the 'loading'
   *  phase (rematch, arena change). Without this, a stale LOADED from the
   *  first match would cause checkAllLoaded to flip phase back to 'playing'
   *  before guests finish warming the new arena. */
  resetLoadingHandshake(): void {
    if (!this._isHost) return;
    this.loadedGuests.clear();
    this.hostSelfLoaded = false;
    // Also re-arm the loading timeout since we're back in loading.
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.gameLoop.getState().phase !== 'loading') return;
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
    // Reused per-tick scratch buffer for the set of slots whose jump flag was
    // read by this tick's fixedUpdate. We only clear those via
    // consumeGuestJumps — a jump latched by an INPUT message that arrived
    // *after* fixedUpdate stays in the ring for the next tick to consume.
    const consumedJumpSlots: PlayerSlot[] = [];

    const loop = (now: number) => {
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

        // Read delayed input (or current if buffer not full yet)
        const readIdx = writeIdx > delayFrames ? writeIdx - delayFrames : writeIdx - 1;
        const delayedInput = inputRing[readIdx % MAX_DELAY];

        const networkInputs = this.hostAuthority!.getNetworkInputs();
        networkInputs.set(this.localSlot, delayedInput);
        // Snapshot which slots have jump=true right now — these are the jumps
        // fixedUpdate is about to see. Any jump latched by a new INPUT message
        // that arrives mid-tick won't be in this set and survives to next tick.
        consumedJumpSlots.length = 0;
        for (const [slot, input] of networkInputs) {
          if (input.jump) consumedJumpSlots.push(slot as PlayerSlot);
        }
        this.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        // Clear only the jumps we just consumed — jump is edge-triggered, fire once per tap
        this.hostAuthority!.consumeGuestJumps(consumedJumpSlots);
        // Tick reconnection grace timers
        this.hostAuthority!.tickGraceTimers(FIXED_DT);
        this.gameLoop.tickCosmetic(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      // Broadcast snapshot once per render frame (not per tick) —
      // multiple ticks in one frame would spam guests with snapshots,
      // causing decode/GC pressure that tanks mobile framerate.
      this.hostAuthority!.broadcastSnapshot(this.gameLoop.getState());

      // Keep the 3-bar signal HUD accurate on the host too — the host sees
      // RTT from pong replies just like the guest, and a degraded link should
      // be visible to both sides.
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
      this.gameLoop.tickCosmetic(dt);

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
      if (this.lastSnapshotTime > 0 && !this.reconnecting && !state.matchOver) {
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
      this.transport.sendUnreliable(encodeSnapshotAck(snap.frame));
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
    } else if (msg.type === MsgType.SETTINGS_SYNC) {
      if ('arenaId' in msg) {
        this.onArenaChange?.((msg as { arenaId: string }).arenaId);
      }
    } else if (msg.type === MsgType.MATCH_RESULT) {
      this.onMatchEnd?.((msg as { winner: string | null }).winner as PlayerSlot | null, this.gameLoop.getState());
    } else if (msg.type === MsgType.DISCONNECT) {
      this.onDisconnect?.();
    } else if (msg.type === MsgType.RECONNECT_SYNC) {
      // Host confirmed our reconnection — resume match (and honor host's
      // pause state: if it was paused when we reclaimed, stay paused until
      // the host broadcasts MsgType.PAUSE{paused:false}).
      const syncMsg = msg as { paused?: boolean };
      if (syncMsg.paused) {
        this.gameLoop.pause();
      } else {
        this.gameLoop.resume();
      }
      this.completeReconnection();
    } else if (this._isHost && msg.type === MsgType.LOADED) {
      const slot = (msg as { slot: string }).slot as PlayerSlot;
      this.loadedGuests.add(slot);
      this.checkAllLoaded();
    } else if (this._isHost && msg.type === MsgType.CONNECTION_UNSTABLE) {
      const stalled = (msg as { stalled: boolean }).stalled;
      if (fromPeerId && this.hostAuthority) {
        const slot = this.hostAuthority.getSlotForPeer(fromPeerId);
        if (slot) this.onGuestConnectionUnstable?.(slot, stalled);
      }
    } else if (this._isHost && msg.type === MsgType.RECONNECT_REQUEST) {
      // hostAuthority already ran its half of the protocol (delegated at the
      // top of this method). If the reclaim succeeded, the peer is now back
      // in peerSlotMap. Purge any stale LOADED and notify Match.tsx so it
      // can resend SETTINGS_SYNC for the current arena.
      if (fromPeerId && this.hostAuthority) {
        const slot = this.hostAuthority.getSlotForPeer(fromPeerId);
        if (slot) {
          this.loadedGuests.delete(slot);
          this.onGuestReconnected?.(slot);
        }
      }
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
        } as import('./protocol').ReliableMessage);
      }).catch(() => { /* retry next tick */ });
    };
    this.reconnectTimer = setInterval(tryAttempt, 1500);
  }

  /** Complete reconnection after host confirms. */
  private completeReconnection(): void {
    this.reconnecting = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Flush the pre-disconnect snapshot ring. Old snapshots would otherwise
    // either win the out-of-order guard (blocking fresh ones) or get lerped
    // against new post-reconnect snapshots with a giant frame gap, producing
    // position teleports for every entity.
    this.interpolation?.reset();
    // Reset match-over latch too — if the host reclaimed us during the
    // match-over tail, the next snapshot's matchOver=true should fire
    // onMatchEnd exactly once more (the latch is a per-run guard).
    this._guestMatchOverFired = false;
    // Also clear the prev-phase tracker so the first post-reconnect snapshot
    // fires onPhaseChange even if the match is still in the same phase.
    this._prevGuestPhase = 'loading';
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
    if (this._visibilityHandler && typeof document !== 'undefined') {
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
