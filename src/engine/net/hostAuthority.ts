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
} from './protocol';
import type { ReliableMessage } from './protocol';
import { takeAuthSnapshot, encodeSnapshot, createDelta } from './snapshot';

// Send a full (non-delta) snapshot every N ticks for baseline recovery
const FULL_SNAPSHOT_INTERVAL = 120; // every 2 seconds

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

  // Per-guest acked baseline for delta compression
  private guestBaselines = new Map<string, ArrayBuffer>();

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

  /** Remove a disconnected guest. */
  removeGuest(peerId: string): void {
    const slot = this.peerSlotMap.get(peerId);
    this.peerSlotMap.delete(peerId);
    this.guestBaselines.delete(peerId);
    if (slot) {
      this.guestInputs.delete(slot);
      this.gameLoop.disconnectPlayer(slot);
      this.onPlayerDisconnect?.(slot);
    }
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
    // Copy once for this frame (shared buffer is reused next call)
    const encoded = encodeBuf.slice(0, encodeLen);
    const isFull = this.localFrame % FULL_SNAPSHOT_INTERVAL === 0;

    for (const peerId of this.transport.getPeerIds()) {
      const baseline = isFull ? null : (this.guestBaselines.get(peerId) ?? null);
      const delta = createDelta(encoded, baseline);
      this.transport.sendUnreliableTo(peerId, delta);

      if (isFull || !baseline) {
        this.guestBaselines.set(peerId, encoded);
      }
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
      // Use the most recent input from the bundle
      const latest = decoded.inputs[decoded.inputCount - 1];
      const slot = decodeSlot(decoded.source);
      this.guestInputs.set(slot, { ...latest.input });

      // Relay input to other guests for their interpolation
      if (fromPeerId) {
        for (const pid of this.transport.getPeerIds()) {
          if (pid !== fromPeerId) {
            this.transport.sendUnreliableTo(pid, data);
          }
        }
      }
    } else if (type === MsgType.PING) {
      const pp = decodePingPong(data);
      if (pp && fromPeerId) {
        this.transport.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
      }
    } else if (type === MsgType.SNAPSHOT_ACK) {
      // Guest acknowledged a snapshot — update their baseline
      if (fromPeerId && data.byteLength >= 5) {
        // The ack tells us which frame they received. For simplicity,
        // we update baseline on next full snapshot send.
        // (Advanced: track per-guest acked encoded snapshot for finer deltas)
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
    }
  }

  /** Get the current guest input for a given slot (called by GameLoop via network inputs). */
  getGuestInput(slot: PlayerSlot): InputState {
    return this.guestInputs.get(slot) ?? { left: false, right: false, jump: false, down: false };
  }

  /** Build the network inputs map for GameLoop.fixedUpdate(). */
  getNetworkInputs(): Map<string, InputState> {
    const inputs = new Map<string, InputState>();
    // Host input comes from keyboard/touch (not overridden)
    // Guest inputs come from network
    for (const [slot, input] of this.guestInputs) {
      inputs.set(slot, input);
    }
    return inputs;
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
