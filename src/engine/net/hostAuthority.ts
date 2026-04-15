/**
 * Host-authoritative game server running in the host's browser.
 *
 * The host runs the full GameLoop locally (same as local play) and broadcasts
 * compact binary snapshots to all guests every tick. Guests send their inputs
 * which the host buffers and applies on the next tick.
 *
 * This replaces the RollbackEngine on the host side.
 */
import type { InputState, PlayerSlot, MatchState } from '../types';
import type { GameLoop } from '../gameLoop';
import type { Transport } from './transport';
import {
  MsgType,
  decodeInputMessage, decodeSlot,
  encodePing, encodePong, decodePingPong,
  decodeSnapshotAck,
} from './protocol';
import type { ReliableMessage } from './protocol';
import { takeAuthSnapshot, encodeSnapshot } from './snapshot';

export interface HostAuthorityConfig {
  gameLoop: GameLoop;
  transport: Transport;
  localSlot: PlayerSlot;
  onMatchEnd?: (winner: PlayerSlot | null, state: MatchState) => void;
  onPlayerDisconnect?: (slot: PlayerSlot) => void;
}

export interface HostDebugStats {
  localFrame: number;
  rtt: number;
  jitter: number;
  snapshotBytes: number;
  guestCount: number;
  isRelay: boolean;
}

export class HostAuthority {
  private gameLoop: GameLoop;
  private transport: Transport;
  readonly localSlot: PlayerSlot;
  private onPlayerDisconnect?: (slot: PlayerSlot) => void;

  private localFrame = 0;
  private running = false;

  // Guest input buffers: slot → latest input
  private guestInputs = new Map<string, InputState>();
  // Peer → slot mapping
  private peerSlotMap = new Map<string, PlayerSlot>();

  // Delta compression infrastructure (disabled — baseline mismatch from unreliable ACKs)
  private guestBaselines = new Map<string, ArrayBuffer>();
  private guestAckedFrame = new Map<string, number>();

  // Per-slot frame tracking for input redundancy
  private lastConsumedFrame = new Map<string, number>();

  // Reconnection grace period: slot → { timer, oldPeerId }
  private disconnectedSlots = new Map<PlayerSlot, { timer: number; peerId: string }>();
  private readonly GRACE_PERIOD = 20; // seconds

  // Ping/pong
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // Stats
  private lastSnapshotBytes = 0;

  constructor(config: HostAuthorityConfig) {
    this.gameLoop = config.gameLoop;
    this.transport = config.transport;
    this.localSlot = config.localSlot;
    this.onPlayerDisconnect = config.onPlayerDisconnect;
  }

  /** Register a peer → slot mapping for input routing. */
  addGuest(peerId: string, slot: PlayerSlot): void {
    this.peerSlotMap.set(peerId, slot);
    this.guestInputs.set(slot, { left: false, right: false, jump: false, down: false });
  }

  /** Remove a disconnected guest — enters grace period for reconnection. */
  removeGuest(peerId: string): void {
    const slot = this.peerSlotMap.get(peerId);
    this.peerSlotMap.delete(peerId);
    this.guestBaselines.delete(peerId);
    this.guestAckedFrame.delete(peerId);
    if (slot) {
      this.guestInputs.delete(slot);
      // Enter grace period instead of immediate full removal
      this.disconnectedSlots.set(slot, { timer: this.GRACE_PERIOD, peerId });
      this.gameLoop.disconnectPlayer(slot);
      this.onPlayerDisconnect?.(slot);
    }
  }

  /** Permanently remove a guest after grace period expires. */
  private finalRemoveGuest(slot: PlayerSlot): void {
    this.disconnectedSlots.delete(slot);
    this.lastConsumedFrame.delete(slot);
  }

  /** Tick grace period timers. Called from host loop each tick. */
  tickGraceTimers(dt: number): void {
    for (const [slot, info] of this.disconnectedSlots) {
      info.timer -= dt;
      if (info.timer <= 0) {
        this.finalRemoveGuest(slot);
      }
    }
  }

  /** Handle reconnection request from a guest reclaiming a slot. */
  handleReconnectRequest(slot: PlayerSlot, newPeerId: string): boolean {
    const graceInfo = this.disconnectedSlots.get(slot);
    if (!graceInfo) return false; // No grace period active for this slot

    // Reclaim the slot
    this.disconnectedSlots.delete(slot);
    this.peerSlotMap.set(newPeerId, slot);
    this.guestInputs.set(slot, { left: false, right: false, jump: false, down: false });
    this.lastConsumedFrame.delete(slot);

    // Reactivate the player
    const player = this.gameLoop.getState().players.find(p => p.id === slot);
    if (player) {
      player.disconnected = false;
      player.active = true;
      // Trigger respawn if dead
      if (player.state === 'splat') {
        player.state = 'respawning';
        player.respawnTimer = 1.5;
        player.splatTimer = 0;
      }
    }

    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.localFrame = 0;

    // Start ping loop for RTT measurement
    this.pingInterval = setInterval(() => {
      this.transport.sendUnreliable(encodePing(performance.now()));
    }, 500);

    // Note: GameLoop.start() and the RAF loop are managed by NetMatch,
    // not by HostAuthority. We only handle input buffering + snapshot broadcast.
  }

  stop(): void {
    this.running = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /** Broadcast current state to all guests. Called by NetMatch after each fixedUpdate. */
  broadcastSnapshot(state: MatchState): void {
    this.localFrame++;

    const snap = takeAuthSnapshot(this.localFrame, state);
    const { buffer: encodeBuf, length: encodeLen } = encodeSnapshot(snap);

    // Always send full snapshots. Delta compression is disabled because
    // unreliable ACK delivery causes host/guest baseline mismatch — when an
    // ACK is lost, the host's XOR baseline diverges from the guest's, and
    // every subsequent delta produces garbage. Proper fix needs base frame
    // number in the delta header + guest-side snapshot history.
    const msg = new Uint8Array(1 + encodeLen);
    msg[0] = MsgType.SNAPSHOT;
    msg.set(new Uint8Array(encodeBuf, 0, encodeLen), 1);

    for (const peerId of this.transport.getPeerIds()) {
      this.transport.sendUnreliableTo(peerId, msg.buffer);
    }

    this.lastSnapshotBytes = encodeLen;
  }

  /** Handle incoming binary messages from guests (inputs, ping/pong, snapshot acks). */
  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (type === MsgType.INPUT) {
      const decoded = decodeInputMessage(data);
      if (!decoded || decoded.inputCount === 0) return;
      const slot = decodeSlot(decoded.source);
      const lastFrame = this.lastConsumedFrame.get(slot) ?? 0;
      const existing = this.guestInputs.get(slot);

      // Iterate all bundled inputs (oldest → newest) to recover from packet loss.
      // Only apply inputs newer than the last consumed frame.
      for (let i = 0; i < decoded.inputCount; i++) {
        const entry = decoded.inputs[i];
        if (entry.frame <= lastFrame) continue; // already consumed or stale

        if (existing) {
          // Latch jump: if a previous input set jump=true and the host tick
          // hasn't consumed it yet, don't let a subsequent jump=false overwrite it.
          const pendingJump = existing.jump;
          existing.left = entry.input.left;
          existing.right = entry.input.right;
          existing.jump = entry.input.jump || pendingJump;
          existing.down = entry.input.down;
        } else {
          this.guestInputs.set(slot, { ...entry.input });
        }
        this.lastConsumedFrame.set(slot, entry.frame);
      }

      // Relay input to other guests for their interpolation
      if (fromPeerId) {
        for (const pid of this.transport.getPeerIds()) {
          if (pid !== fromPeerId) {
            this.transport.sendUnreliableTo(pid, data);
          }
        }
      }
    } else if (type === MsgType.SNAPSHOT_ACK) {
      // Guest acknowledged receiving a snapshot (delta compression disabled,
      // but ACK tracking kept for future use / adaptive rate)
      const ackedFrame = decodeSnapshotAck(data);
      if (ackedFrame !== null && fromPeerId) {
        this.guestAckedFrame.set(fromPeerId, ackedFrame);
      }
    } else if (type === MsgType.PING) {
      const pp = decodePingPong(data);
      if (pp && fromPeerId) {
        this.transport.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
      }
    }
  }

  /** Handle reliable messages from guests (pause, disconnect, etc). */
  handleReliableMessage(msg: ReliableMessage, fromPeerId?: string): void {
    switch (msg.type) {
      case MsgType.PAUSE:
        if ((msg as { paused: boolean }).paused) {
          this.gameLoop.pause();
        } else {
          this.gameLoop.resume();
        }
        // Relay pause to other guests
        if (fromPeerId) {
          for (const pid of this.transport.getPeerIds()) {
            if (pid !== fromPeerId) {
              this.transport.sendReliableTo(pid, msg);
            }
          }
        }
        break;
      case MsgType.DISCONNECT:
        if (fromPeerId) this.removeGuest(fromPeerId);
        break;
      case MsgType.RECONNECT_REQUEST: {
        // Guest wants to reclaim a slot during grace period
        const reqSlot = (msg as { slot: string }).slot as PlayerSlot;
        if (fromPeerId && this.handleReconnectRequest(reqSlot, fromPeerId)) {
          // Send sync confirmation with current frame
          this.transport.sendReliableTo(fromPeerId, {
            type: MsgType.RECONNECT_SYNC,
            slot: reqSlot,
            snapshotFrame: this.localFrame,
          } as ReliableMessage);
          // Also send a full snapshot immediately so guest has fresh state
          const snap = takeAuthSnapshot(this.localFrame, this.gameLoop.getState());
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

  /** Get the current guest input for a given slot (called by GameLoop via network inputs). */
  getGuestInput(slot: PlayerSlot): InputState {
    return this.guestInputs.get(slot) ?? { left: false, right: false, jump: false, down: false };
  }

  /** Return guest inputs map for GameLoop.fixedUpdate(). Host input comes from keyboard/touch. */
  getNetworkInputs(): Map<string, InputState> {
    return this.guestInputs;
  }

  /** Clear latched jump flags after the host tick consumed them. */
  consumeGuestJumps(): void {
    for (const input of this.guestInputs.values()) {
      input.jump = false;
    }
  }

  getStats(): HostDebugStats {
    return {
      localFrame: this.localFrame,
      rtt: this.transport.currentRtt,
      jitter: this.transport.currentJitter,
      snapshotBytes: this.lastSnapshotBytes,
      guestCount: this.peerSlotMap.size,
      isRelay: this.transport.isRelay,
    };
  }

  setMatchOver(): void {
    // No special handling needed — host's game loop handles match end naturally
  }
}
