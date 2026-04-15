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
import type { PlayerSlot, MatchState } from '../types';
import type { Arena, MatchSettings } from '../types';
import { isBotSlot } from '../types';
import { GameLoop } from '../gameLoop';
import type { MatchEndCallback } from '../gameLoop';
import { Transport } from './transport';
import { MsgType } from './protocol';
import type { ReliableMessage } from './protocol';
import { HostAuthority } from './hostAuthority';
import type { HostDebugStats } from './hostAuthority';
import { EntityInterpolation, applySnapshotToState } from './interpolation';
import { ClientPrediction } from './clientPrediction';
import { GuestSFX } from './guestSfx';
import { decodeSnapshot } from './snapshot';
import {
  decodePingPong,
  encodePing, encodePong,
  encodeInputMessage,
  encodeSnapshotAck,
} from './protocol';
import { applyDelta } from './snapshot';

export interface NetMatchConfig {
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
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
  private prediction: ClientPrediction | null = null;
  private guestSfx: GuestSFX | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshotBuf: ArrayBuffer | null = null; // baseline for delta decode

  // Shared
  private rafId = 0;
  private localSlot: PlayerSlot;

  constructor(config: NetMatchConfig) {
    this.transport = config.transport;
    this._isHost = config.transport.isHost;
    this.onMatchEnd = config.onMatchEnd;
    this.onDisconnect = config.onDisconnect;
    this.onArenaChange = config.onArenaChange;
    this.localSlot = config.localSlot;

    // Both host and guest create a GameLoop (needed for canvas rendering)
    this.gameLoop = new GameLoop(
      config.bgCanvas,
      config.fgCanvas,
      config.arena,
      config.settings,
      config.activePlayers,
      config.onMatchEnd,
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
      onPlayerDisconnect: config.onPlayerDisconnect,
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
    this.prediction = new ClientPrediction(config.localSlot, config.arena);
    this.guestSfx = new GuestSFX(this.gameLoop);
  }

  /** Start the network match. */
  start(): void {
    this.transport.setEvents({
      onStatusChange: (status) => {
        if (status === 'disconnected' || status === 'error') {
          this.onDisconnect?.();
        }
      },
      onReliableMessage: (msg, fromPeerId) => this.handleReliableMessage(msg, fromPeerId),
      onUnreliableMessage: (data, fromPeerId) => this.handleUnreliableMessage(data, fromPeerId),
      onRttUpdate: () => {},
      onPeerDisconnected: (peerId) => {
        if (this._isHost && this.hostAuthority) {
          this.hostAuthority.removeGuest(peerId);
        } else {
          this.onDisconnect?.();
        }
      },
    });

    // Both: put GameLoop in network mode (external RAF, no internal loop)
    this.gameLoop.setNetworkMode(true);
    // start() in network mode attaches input handlers + audio but skips internal RAF
    this.gameLoop.start();

    if (this._isHost && this.hostAuthority) {
      this.hostAuthority.start();
      this.startHostLoop();
    } else {
      this.startGuestLoop();
    }
  }

  /** Host: simulate + broadcast + render. */
  private startHostLoop(): void {
    let lastTime = performance.now();
    const FIXED_DT = 1 / 60;
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
        this.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        // Clear latched guest jump flags — jump is edge-triggered, fire once per tap
        this.hostAuthority!.consumeGuestJumps();
        accumulator -= FIXED_DT;
      }

      // Broadcast snapshot once per render frame (not per tick) —
      // multiple ticks in one frame would spam guests with snapshots,
      // causing decode/GC pressure that tanks mobile framerate.
      this.hostAuthority!.broadcastSnapshot(this.gameLoop.getState());

      this.gameLoop.renderFrame(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Guest: send inputs + predict local + receive snapshots → render. */
  private startGuestLoop(): void {
    this.pingTimer = setInterval(() => {
      this.transport.sendUnreliable(encodePing(performance.now()));
    }, 500);

    const FIXED_DT = 1 / 60;
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

      // Build ordered slice (oldest → newest) for encoding
      const sendCount = inputRingCount;
      const orderedInputs: Array<{ frame: number; input: import('../types').InputState }> = [];
      for (let i = sendCount - 1; i >= 0; i--) {
        const idx = ((guestFrame - i) % INPUT_RING_SIZE + INPUT_RING_SIZE) % INPUT_RING_SIZE;
        orderedInputs.push(inputRing[idx]);
      }
      this.transport.sendUnreliable(
        encodeInputMessage(orderedInputs, 0, sendCount, this.localSlot),
      );

      // 2. Apply interpolated host snapshot to state
      if (this.interpolation) {
        const snap = this.interpolation.getInterpolatedState();
        if (snap) {
          applySnapshotToState(snap, this.gameLoop.getState());
        }
      }

      // 3. Detect state transitions → trigger local SFX + particles
      if (this.guestSfx) {
        this.guestSfx.update(this.gameLoop.getState());
      }

      // 4. Decay visual timers locally between snapshots (smooth blinking/effects)
      const state = this.gameLoop.getState();
      for (const p of state.players) {
        if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
        if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
        if (p.splatTimer > 0) p.splatTimer = Math.max(0, p.splatTimer - dt);
        if (p.respawnTimer > 0) p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.burnTimer > 0) p.burnTimer = Math.max(0, p.burnTimer - dt);
      }
      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt);

      // 4. Tick cosmetic systems (weather, particles, gibs, confetti)
      this.gameLoop.tickCosmetics(dt);

      // 5. Render
      this.gameLoop.renderFrame(dt);
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
    } else {
      if (type === MsgType.SNAPSHOT) {
        this.handleGuestSnapshot(data);
      } else if (type === MsgType.PING || type === MsgType.PONG) {
        const pp = decodePingPong(data);
        if (pp?.type === MsgType.PING && fromPeerId) {
          this.transport.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
        }
      }
    }
  }

  private handleGuestSnapshot(data: ArrayBuffer): void {
    if (!this.interpolation) return;

    // Try delta decode first (uses lastSnapshotBuf as baseline), fall back to full decode
    let snapBuf: ArrayBuffer | null = null;
    const deltaResult = applyDelta(data, this.lastSnapshotBuf);
    if (deltaResult) {
      snapBuf = deltaResult;
    } else {
      // Full snapshot — strip the type prefix byte
      snapBuf = data.slice(1);
    }

    const snap = decodeSnapshot(snapBuf);
    if (snap) {
      // Store decoded raw buffer as baseline for future delta decoding
      this.lastSnapshotBuf = snapBuf;

      this.interpolation.pushSnapshot(snap);

      // Send ACK so host can use this frame as delta baseline
      this.transport.sendUnreliable(encodeSnapshotAck(snap.frame));

      if (this.prediction) {
        const localPlayer = snap.players.find(p => p.id === this.localSlot);
        if (localPlayer) {
          this.prediction.reconcile(localPlayer);
        }
      }
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
    }
  }

  removePlayer(slot: PlayerSlot): void {
    this.gameLoop.disconnectPlayer(slot);
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
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
