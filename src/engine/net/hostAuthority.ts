/**
 * Carrot Royale host authority — thin adapter over the generic core.
 *
 * Adds game-specific behavior:
 * - Jump latching (edge-triggered jump preserved across rapid input messages)
 * - consumeGuestJumps() to clear latched jumps after each tick
 * - Reconnect respawn (dead players respawn when reconnecting)
 * - Pause/disconnect reliable message handling
 */
import type { InputState, PlayerSlot, MatchState } from '../types';
import type { GameLoop } from '../gameLoop';
import type { Transport } from './transport';
import { MsgType, decodeInputMessage, decodeSlot } from './protocol';
import type { ReliableMessage } from './protocol';
import { takeAuthSnapshot, encodeSnapshot } from './snapshot';
import { GenericHostAuthority } from './core/hostAuthority';
import type { HostDebugStats } from './core/hostAuthority';

export type { HostDebugStats };

export interface HostAuthorityConfig {
  gameLoop: GameLoop;
  transport: Transport;
  localSlot: PlayerSlot;
  onMatchEnd?: (winner: PlayerSlot | null, state: MatchState) => void;
  onPlayerDisconnect?: (slot: PlayerSlot) => void;
}

// Snapshot encoder adapter for the generic core (host-only path).
const crSnapshotEncoder = {
  takeSnapshot: (frame: number, state: MatchState) => takeAuthSnapshot(frame, state),
  encode: (snap: ReturnType<typeof takeAuthSnapshot>) => {
    const { buffer, length } = encodeSnapshot(snap);
    return buffer.slice(0, length);
  },
};

// Input codec adapter
const crInputCodec = {
  encode: () => 0, // Host doesn't encode inputs for wire
  decode: () => ({ left: false, right: false, jump: false, down: false }),
  noInput: (): InputState => ({ left: false, right: false, jump: false, down: false }),
};

export class HostAuthority {
  private core: GenericHostAuthority<InputState, MatchState, ReturnType<typeof takeAuthSnapshot>>;
  private gameLoop: GameLoop;
  private transport: Transport;
  readonly localSlot: PlayerSlot;

  constructor(config: HostAuthorityConfig) {
    this.gameLoop = config.gameLoop;
    this.transport = config.transport;
    this.localSlot = config.localSlot;

    this.core = new GenericHostAuthority(
      {
        simulation: config.gameLoop,
        snapshotEncoder: crSnapshotEncoder,
        inputCodec: crInputCodec,
        localSlot: config.localSlot,
        onInputReceived: (_slot, existing, incoming) => {
          // Jump latching: preserve edge-triggered jump across rapid input messages
          return {
            left: incoming.left,
            right: incoming.right,
            jump: incoming.jump || existing.jump,
            down: incoming.down,
          };
        },
        onPlayerReconnect: (state, slot) => {
          const player = state.players.find(p => p.id === slot);
          if (player) {
            player.disconnected = false;
            player.active = true;
            if (player.state === 'splat') {
              player.state = 'respawning';
              player.respawnTimer = 1.5;
              player.splatTimer = 0;
            }
          }
        },
        onPlayerDisconnect: config.onPlayerDisconnect,
      },
      config.transport,
      decodeInputMessage,
      decodeSlot,
    );
  }

  addGuest(peerId: string, slot: PlayerSlot, reclaimToken?: string): void {
    this.core.addGuest(peerId, slot, reclaimToken);
  }
  getReclaimToken(slot: PlayerSlot): string | null { return this.core.getReclaimToken(slot); }
  removeGuest(peerId: string): void { this.core.removeGuest(peerId); }
  tickGraceTimers(dt: number): void { this.core.tickGraceTimers(dt); }
  start(): void { this.core.start(); }
  stop(): void { this.core.stop(); }
  getGuestInput(slot: PlayerSlot): InputState { return this.core.getGuestInput(slot); }
  getNetworkInputs(): Map<string, InputState> { return this.core.getNetworkInputs(); }
  getStats(): HostDebugStats { return this.core.getStats(); }
  getExpectedGuestSlots(): PlayerSlot[] { return this.core.getExpectedGuestSlots() as PlayerSlot[]; }
  getSlotForPeer(peerId: string): PlayerSlot | undefined { return this.core.getSlotForPeer(peerId) as PlayerSlot | undefined; }
  setMatchOver(): void { this.core.setMatchOver(); }

  broadcastSnapshot(state: MatchState): void { this.core.broadcastSnapshot(state); }
  sendSnapshotTo(peerId: string, state: MatchState): void { this.core.sendSnapshotTo(peerId, state); }
  getLocalFrame(): number { return this.core.getLocalFrame(); }
  setPeerUnstable(peerId: string, unstable: boolean): void { this.core.setPeerUnstable(peerId, unstable); }
  isPeerUnstable(peerId: string): boolean { return this.core.isPeerUnstable(peerId); }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    this.core.handleUnreliableMessage(data, fromPeerId);
  }

  /** Clear latched jump flags only for the slots fixedUpdate consumed,
   *  preserving jumps latched by inputs that arrived mid-tick. */
  consumeGuestJumps(slots: Iterable<PlayerSlot>): void {
    const inputs = this.core.getNetworkInputs();
    for (const slot of slots) {
      const input = inputs.get(slot);
      if (input) input.jump = false;
    }
  }

  handleReconnectRequest(slot: PlayerSlot, newPeerId: string, presentedToken?: string): boolean {
    return this.core.handleReconnectRequest(slot, newPeerId, presentedToken);
  }

  /** Handle reliable messages — pause relay + disconnect teardown. Reconnect
   *  sync lives in NetMatch since it needs host-wide state (pause flag). */
  handleReliableMessage(msg: ReliableMessage, fromPeerId?: string): void {
    switch (msg.type) {
      case MsgType.PAUSE:
        if ((msg as { paused: boolean }).paused) {
          this.gameLoop.pause();
        } else {
          this.gameLoop.resume();
        }
        if (fromPeerId) {
          for (const pid of this.transport.getPeerIds()) {
            if (pid !== fromPeerId) {
              this.transport.sendReliableTo(pid, msg);
            }
          }
        }
        break;
      case MsgType.DISCONNECT:
        if (fromPeerId) this.core.removeGuest(fromPeerId);
        break;
    }
  }
}
