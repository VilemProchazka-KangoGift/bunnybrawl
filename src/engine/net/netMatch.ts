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
import { decodeSnapshot } from './snapshot';
import {
  decodePingPong,
  encodePing, encodePong,
  encodeInputMessage,
} from './protocol';

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
  private pingTimer: ReturnType<typeof setInterval> | null = null;

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

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      accumulator += dt;

      while (accumulator >= FIXED_DT) {
        // Build inputs: host reads from any key binding, guests from network
        const networkInputs = this.hostAuthority!.getNetworkInputs();
        // Host's own input: merge all key bindings (online = any keys control your character)
        networkInputs.set(this.localSlot, this.gameLoop.getInputAny());
        this.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        this.hostAuthority!.broadcastSnapshot(this.gameLoop.getState());
        accumulator -= FIXED_DT;
      }

      this.gameLoop.renderFrame(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Guest: send inputs + receive snapshots → apply to state → render. */
  private startGuestLoop(): void {
    this.pingTimer = setInterval(() => {
      this.transport.sendUnreliable(encodePing(performance.now()));
    }, 500);

    let lastTime = performance.now();
    let guestFrame = 0;
    // Reusable input bundle for sending (avoids allocation)
    const inputBundle: Array<{ frame: number; input: import('../types').InputState }> = [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }];

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Send local input to host every frame
      const localInput = this.gameLoop.getInputAny();
      guestFrame++;
      inputBundle[0].frame = guestFrame;
      inputBundle[0].input = localInput;
      this.transport.sendUnreliable(
        encodeInputMessage(inputBundle, 0, 1, this.localSlot),
      );

      // Apply the latest interpolated snapshot to the GameLoop's state
      if (this.interpolation) {
        const snap = this.interpolation.getInterpolatedState();
        if (snap) {
          applySnapshotToState(snap, this.gameLoop.getState());
        }
      }

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

    // Strip the snapshot type prefix and decode
    const snapBuf = data.slice(1);
    const snap = decodeSnapshot(snapBuf);
    if (snap) {
      this.interpolation.pushSnapshot(snap);

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
