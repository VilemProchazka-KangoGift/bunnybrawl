/**
 * NetMatch: orchestrates Transport + host-authoritative netcode for online play.
 *
 * Host mode: runs GameLoop locally, broadcasts state snapshots to guests.
 * Guest mode: receives snapshots, applies interpolation, predicts local player.
 *
 * Replaces the old rollback-based orchestrator with a simpler host-authoritative model.
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

  // Host-specific
  private hostAuthority: HostAuthority | null = null;
  private gameLoop: GameLoop | null = null;

  // Guest-specific
  private interpolation: EntityInterpolation | null = null;
  private prediction: ClientPrediction | null = null;
  private guestRafId = 0;
  private guestState: MatchState | null = null;
  private localSlot: PlayerSlot;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: NetMatchConfig) {
    this.transport = config.transport;
    this._isHost = config.transport.isHost;
    this.onMatchEnd = config.onMatchEnd;
    this.onDisconnect = config.onDisconnect;
    this.onArenaChange = config.onArenaChange;
    this.localSlot = config.localSlot;

    if (this._isHost) {
      this.initHost(config);
    } else {
      this.initGuest(config);
    }
  }

  private initHost(config: NetMatchConfig): void {
    // Host runs GameLoop in normal local mode — no seeded RNG, no Math.fround
    this.gameLoop = new GameLoop(
      config.bgCanvas,
      config.fgCanvas,
      config.arena,
      config.settings,
      config.activePlayers,
      config.onMatchEnd,
    );

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
        // Map each remote slot to a peer — for now, first guest is first peer
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
          // Guest lost connection to host
          this.onDisconnect?.();
        }
      },
    });

    if (this._isHost && this.hostAuthority && this.gameLoop) {
      // Host: set up network input injection, then start game loop + authority
      this.gameLoop.setNetworkMode(true);
      this.hostAuthority.start();

      // Drive the host game loop with guest input injection
      this.startHostLoop();
    } else {
      // Guest: start render loop driven by incoming snapshots
      this.startGuestLoop();
    }
  }

  /** Host: run the game loop with guest inputs injected each tick. */
  private startHostLoop(): void {
    if (!this.gameLoop || !this.hostAuthority) return;

    let lastTime = performance.now();
    const FIXED_DT = 1 / 60;
    let accumulator = 0;

    const loop = (now: number) => {
      if (!this.gameLoop || !this.hostAuthority) return;

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      accumulator += dt;

      while (accumulator >= FIXED_DT) {
        // Inject guest inputs into game loop
        const networkInputs = this.hostAuthority.getNetworkInputs();
        this.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        accumulator -= FIXED_DT;
      }

      this.gameLoop.renderFrame(dt);
      this.guestRafId = requestAnimationFrame(loop);
    };
    this.guestRafId = requestAnimationFrame(loop);
  }

  /** Guest: render loop driven by host snapshots. */
  private startGuestLoop(): void {
    // Start ping loop for RTT measurement
    this.pingTimer = setInterval(() => {
      this.transport.sendUnreliable(encodePing(performance.now()));
    }, 500);

    const loop = () => {
      if (!this.interpolation) return;

      // Get interpolated state
      const snap = this.interpolation.getInterpolatedState();
      if (snap && this.guestState) {
        applySnapshotToState(snap, this.guestState);
      }

      // TODO: Apply client prediction for local player override
      // TODO: Render the state using the guest's canvas

      this.guestRafId = requestAnimationFrame(loop);
    };
    this.guestRafId = requestAnimationFrame(loop);
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (this._isHost && this.hostAuthority) {
      // Host: forward to HostAuthority (handles inputs, ping/pong)
      this.hostAuthority.handleUnreliableMessage(data, fromPeerId);
    } else {
      // Guest: handle snapshots and ping/pong
      if (type === MsgType.SNAPSHOT) {
        this.handleGuestSnapshot(data);
      } else if (type === MsgType.PING || type === MsgType.PONG) {
        const pp = decodePingPong(data);
        if (pp?.type === MsgType.PING && fromPeerId) {
          this.transport.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
        }
        // Pong handling is in transport layer
      }
    }
  }

  private handleGuestSnapshot(data: ArrayBuffer): void {
    if (!this.interpolation) return;

    // Strip the snapshot type prefix and decode
    // For full snapshots: [0x20][snapshot data]
    // For delta snapshots: [0x20][lengths][rle data] — need baseline
    // For now, handle full snapshots (delta requires baseline tracking)
    const snapBuf = data.slice(1); // strip type byte
    const snap = decodeSnapshot(snapBuf);
    if (snap) {
      this.interpolation.pushSnapshot(snap);

      // Initialize prediction from first snapshot
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

    // Both host and guest handle these:
    if (msg.type === MsgType.PAUSE) {
      if ((msg as { paused: boolean }).paused) {
        this.gameLoop?.pause();
      } else {
        this.gameLoop?.resume();
      }
    } else if (msg.type === MsgType.SETTINGS_SYNC) {
      if ('arenaId' in msg) {
        this.onArenaChange?.((msg as { arenaId: string }).arenaId);
      }
    } else if (msg.type === MsgType.MATCH_RESULT) {
      const state = this.gameLoop?.getState() ?? this.guestState;
      if (state) {
        this.onMatchEnd?.((msg as { winner: string | null }).winner as PlayerSlot | null, state);
      }
    } else if (msg.type === MsgType.DISCONNECT) {
      this.onDisconnect?.();
    }
  }

  removePlayer(slot: PlayerSlot): void {
    if (this._isHost) {
      this.gameLoop?.disconnectPlayer(slot);
    }
  }

  stop(): void {
    if (this.guestRafId) {
      cancelAnimationFrame(this.guestRafId);
      this.guestRafId = 0;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.hostAuthority?.stop();
    this.gameLoop?.stop();
  }

  setMatchOver(): void {
    this.hostAuthority?.setMatchOver();
  }

  getState(): MatchState {
    return this.gameLoop?.getState() ?? this.guestState!;
  }

  getGameLoop(): GameLoop | null {
    return this.gameLoop;
  }

  pause(): void {
    this.gameLoop?.pause();
    this.transport.sendReliable({ type: MsgType.PAUSE, paused: true });
  }

  resume(): void {
    this.gameLoop?.resume();
    this.transport.sendReliable({ type: MsgType.PAUSE, paused: false });
  }

  isPaused(): boolean {
    return this.gameLoop?.isPaused() ?? false;
  }

  skipCountdown(): void {
    this.gameLoop?.skipCountdown();
  }

  /** Debug stats — host gets authority stats, guest gets transport stats. */
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
