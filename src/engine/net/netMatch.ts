/**
 * NetMatch: orchestrates Transport + RollbackEngine + GameLoop for online play.
 */
import type { PlayerSlot, MatchState } from '../types';
import type { MatchSettings, Arena } from '../types';
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
  remoteSlot: PlayerSlot;
  rngSeed: number;
  onDesync?: () => void;
  onStall?: (stalled: boolean) => void;
  onDisconnect?: () => void;
}

export class NetMatch {
  private gameLoop: GameLoop;
  private rollback: RollbackEngine;
  private transport: Transport;
  private onDisconnect?: () => void;

  constructor(config: NetMatchConfig) {
    this.transport = config.transport;
    this.onDisconnect = config.onDisconnect;

    // Create game loop with seeded PRNG
    this.gameLoop = new GameLoop(
      config.bgCanvas,
      config.fgCanvas,
      config.arena,
      config.settings,
      config.activePlayers,
      config.onMatchEnd,
    );

    // Inject seeded PRNG
    const rng = new SeededRNG(config.rngSeed);
    this.gameLoop.setRng(rng);

    // Create rollback engine
    this.rollback = new RollbackEngine({
      localSlot: config.localSlot,
      remoteSlot: config.remoteSlot,
      gameLoop: this.gameLoop,
      transport: config.transport,
      onDesync: config.onDesync ? () => config.onDesync!() : undefined,
      onStall: config.onStall,
    });

    // Wire transport events to rollback engine
    this.transport = config.transport;
  }

  /** Start the network match. */
  start(): void {
    // Override transport events to route to rollback
    // The transport was already created by OnlineLobby, so we need to
    // re-wire its message handlers for match-time behavior.
    // Since Transport uses callbacks set at construction time, we need to
    // handle messages at a higher level.

    this.rollback.start();
  }

  /** Wire incoming transport messages to the rollback engine. */
  handleUnreliableMessage(data: ArrayBuffer): void {
    this.rollback.handleInputMessage(data);
  }

  handleReliableMessage(msg: ReliableMessage): void {
    if (msg.type === MsgType.DESYNC_CHECK) {
      this.rollback.handleReliableMessage(msg);
    } else if (msg.type === MsgType.PAUSE) {
      if (msg.paused) {
        this.gameLoop.pause();
      } else {
        this.gameLoop.resume();
      }
    } else if (msg.type === MsgType.DISCONNECT) {
      this.onDisconnect?.();
    }
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
