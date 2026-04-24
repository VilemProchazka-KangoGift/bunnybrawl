/**
 * Carrot Royale host authority — thin adapter over the generic core.
 *
 * Adds game-specific behavior:
 * - Jump latching (edge-triggered jump preserved across rapid input messages)
 * - consumeGuestJumps() to clear latched jumps after each tick
 * - Reconnect respawn (dead players respawn when reconnecting)
 * - Reliable message handling (pause/disconnect/reconnect with game protocol)
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

// Snapshot codec adapter for the generic core
const crSnapshotCodec = {
  takeSnapshot: (frame: number, state: MatchState) => takeAuthSnapshot(frame, state),
  encode: (snap: ReturnType<typeof takeAuthSnapshot>) => {
    const { buffer, length } = encodeSnapshot(snap);
    return buffer.slice(0, length);
  },
  decode: () => null, // Host doesn't decode snapshots
  applyToState: () => {}, // Host doesn't apply snapshots
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
        snapshotCodec: crSnapshotCodec,
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

  addGuest(peerId: string, slot: PlayerSlot): void { this.core.addGuest(peerId, slot); }
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

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    this.core.handleUnreliableMessage(data, fromPeerId);
  }

  /** Clear latched jump flags after the host tick consumed them. When a slot
   *  list is provided, only those are cleared — used by the host loop to avoid
   *  eating a jump that was latched by a newly-arrived INPUT message *after*
   *  `fixedUpdate` already read the ring. Calling with no argument (legacy /
   *  tests) clears every slot. */
  consumeGuestJumps(slots?: Iterable<PlayerSlot>): void {
    const inputs = this.core.getNetworkInputs();
    if (slots) {
      for (const slot of slots) {
        const input = inputs.get(slot);
        if (input) input.jump = false;
      }
    } else {
      for (const input of inputs.values()) {
        input.jump = false;
      }
    }
  }

  handleReconnectRequest(slot: PlayerSlot, newPeerId: string): boolean {
    return this.core.handleReconnectRequest(slot, newPeerId);
  }

  /** Handle reliable messages — game-specific protocol (pause/disconnect/reconnect). */
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
      case MsgType.RECONNECT_REQUEST: {
        const reqSlot = (msg as { slot: string }).slot as PlayerSlot;
        if (fromPeerId && this.core.handleReconnectRequest(reqSlot, fromPeerId)) {
          this.transport.sendReliableTo(fromPeerId, {
            type: MsgType.RECONNECT_SYNC,
            slot: reqSlot,
            snapshotFrame: this.core.getLocalFrame(),
          } as ReliableMessage);
          // Send fresh snapshot
          const snap = takeAuthSnapshot(this.core.getLocalFrame(), this.gameLoop.getState());
          const { buffer: buf, length: len } = encodeSnapshot(snap);
          const fullMsg = new Uint8Array(1 + len);
          fullMsg[0] = MsgType.SNAPSHOT;
          fullMsg.set(new Uint8Array(buf, 0, len), 1);
          this.transport.sendUnreliableTo(fromPeerId, fullMsg.buffer);
        }
        break;
      }
    }
  }
}
