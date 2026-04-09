/**
 * NetMatch: orchestrates Transport + RollbackEngine + GameLoop for online play.
 * Supports multi-guest: host relays inputs, each guest connects only to host.
 */
import type { PlayerSlot, MatchState } from '../types';
import type { MatchSettings, Arena } from '../types';
import { isBotSlot } from '../types';
import { GameLoop } from '../gameLoop';
import type { MatchEndCallback } from '../gameLoop';
import { SeededRNG } from './prng';
import { RollbackEngine } from './rollback';
import { Transport } from './transport';
import { MsgType } from './protocol';
import type { ReliableMessage } from './protocol';

export interface NetMatchConfig {
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  onMatchEnd: MatchEndCallback;
  transport: Transport;
  localSlot: PlayerSlot;
  remoteSlots: PlayerSlot[];   // all remote human player slots
  rngSeed: number;
  onDesync?: () => void;
  onStall?: (stalled: boolean) => void;
  onStallTimeout?: () => void;
  onDisconnect?: () => void;
  onPlayerDisconnect?: (slot: PlayerSlot) => void;
  onArenaChange?: (arenaId: string) => void;
}

export class NetMatch {
  private gameLoop: GameLoop;
  private rollback: RollbackEngine;
  private transport: Transport;
  private isHost: boolean;
  private onMatchEnd?: MatchEndCallback;
  private onDisconnect?: () => void;
  private onArenaChange?: (arenaId: string) => void;

  constructor(config: NetMatchConfig) {
    this.transport = config.transport;
    this.isHost = !isBotSlot(config.localSlot) && config.localSlot === 'P1';
    this.onMatchEnd = config.onMatchEnd;
    this.onDisconnect = config.onDisconnect;
    this.onArenaChange = config.onArenaChange;

    // Create game loop with seeded PRNG
    this.gameLoop = new GameLoop(
      config.bgCanvas,
      config.fgCanvas,
      config.arena,
      config.settings,
      config.activePlayers,
      config.onMatchEnd,
    );

    const rng = new SeededRNG(config.rngSeed);
    this.gameLoop.setRng(rng);

    // Create rollback engine with all remote human slots
    this.rollback = new RollbackEngine({
      localSlot: config.localSlot,
      remoteSlots: config.remoteSlots,
      isHost: this.isHost,
      gameLoop: this.gameLoop,
      transport: config.transport,
      onDesync: config.onDesync ? () => config.onDesync!() : undefined,
      onStall: config.onStall,
      onStallTimeout: config.onStallTimeout,
      onPlayerDisconnect: config.onPlayerDisconnect,
    });
  }

  /** Start the network match. */
  start(): void {
    this.transport.setEvents({
      onStatusChange: (_status, _error) => {
        if (_status === 'disconnected' || _status === 'error') {
          this.onDisconnect?.();
        }
      },
      onReliableMessage: (msg) => this.handleReliableMessage(msg),
      onUnreliableMessage: (data, fromPeerId) => this.handleUnreliableMessage(data, fromPeerId),
      onRttUpdate: () => {},
      onPeerDisconnected: (_peerId) => {
        // Individual peer disconnect — handled per-slot via rollback.removeRemoteSlot
        // The overall disconnect (all peers gone) is handled by onStatusChange
      },
    });

    this.rollback.start();
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    // Host relays input to all other guests (exclude sender to prevent echo)
    if (this.isHost && this.transport.peerCount > 1 && fromPeerId) {
      for (const peerId of this.transport.getPeerIds()) {
        if (peerId !== fromPeerId) {
          this.transport.sendUnreliableTo(peerId, data);
        }
      }
    }
    this.rollback.handleInputMessage(data);
  }

  handleReliableMessage(msg: ReliableMessage): void {
    if (msg.type === MsgType.DESYNC_CHECK || msg.type === MsgType.DESYNC_REQUEST || msg.type === MsgType.DESYNC_CORRECTION) {
      this.rollback.handleReliableMessage(msg);
    } else if (msg.type === MsgType.PAUSE) {
      if (msg.paused) {
        this.gameLoop.pause();
      } else {
        this.gameLoop.resume();
      }
    } else if (msg.type === MsgType.SETTINGS_SYNC) {
      if ('arenaId' in msg) {
        this.onArenaChange?.((msg as { arenaId: string }).arenaId);
      }
    } else if (msg.type === MsgType.MATCH_RESULT) {
      this.onMatchEnd?.((msg as { winner: string | null }).winner as any, this.gameLoop.getState());
    } else if (msg.type === MsgType.DISCONNECT) {
      this.onDisconnect?.();
    }
  }

  /** Remove a remote player mid-match (disconnect handling). */
  removePlayer(slot: PlayerSlot): void {
    this.rollback.removeRemoteSlot(slot);
    this.gameLoop.disconnectPlayer(slot);
  }

  stop(): void {
    this.rollback.stop();
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

  getRollbackStats() {
    return this.rollback.getStats();
  }
}
