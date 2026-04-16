/**
 * Generic host-authoritative game server.
 *
 * Buffers guest inputs, broadcasts snapshots, manages peer connections.
 * Game-specific logic (input latching, reconnect respawn) is injected via callbacks.
 */
import type { SnapshotCodec, InputCodec, HostAuthorityConfig } from './types';
import { CoreMsgType, encodePong, decodePingPong, decodeSnapshotAck } from './protocol';

/** Minimal simulation interface — only what the host authority actually calls. */
export interface HostSimulation<TState> {
  getState(): TState;
  disconnectPlayer(id: string): void;
}

/** Minimal transport interface — only what the host authority actually calls. */
export interface HostTransport {
  sendUnreliable(data: ArrayBuffer): void;
  sendUnreliableTo(peerId: string, data: ArrayBuffer): void;
  sendReliableTo(peerId: string, msg: unknown): void;
  getPeerIds(): string[];
  readonly currentRtt: number;
  readonly currentJitter: number;
  readonly isRelay: boolean;
}

export interface HostDebugStats {
  localFrame: number;
  rtt: number;
  jitter: number;
  snapshotBytes: number;
  guestCount: number;
  isRelay: boolean;
}

export class GenericHostAuthority<TInput, TState, TSnapshot> {
  private simulation: HostSimulation<TState>;
  private snapshotCodec: SnapshotCodec<TSnapshot, TState>;
  private inputCodec: InputCodec<TInput>;
  private transport: HostTransport;
  readonly localSlot: string;

  private onInputReceived?: (slot: string, existing: TInput, incoming: TInput) => TInput;
  private onPlayerReconnect?: (state: TState, slot: string) => void;
  private onPlayerDisconnect?: (slot: string) => void;

  private localFrame = 0;
  private running = false;

  // Guest input buffers: slot → latest input
  private guestInputs = new Map<string, TInput>();
  // Peer → slot mapping
  private peerSlotMap = new Map<string, string>();

  // Delta compression infrastructure (disabled — kept for future)
  private guestAckedFrame = new Map<string, number>();

  // Per-slot frame tracking for input redundancy
  private lastConsumedFrame = new Map<string, number>();

  // Reconnection grace period
  private disconnectedSlots = new Map<string, { timer: number; peerId: string }>();
  private readonly GRACE_PERIOD = 20; // seconds

  // Stats
  private lastSnapshotBytes = 0;

  // Decode helpers (injected since encoding is game-specific)
  private decodeInputMessage: (data: ArrayBuffer) => {
    inputs: Array<{ frame: number; input: TInput }>;
    inputCount: number;
    source: number;
  } | null;
  private decodeSlot: (byte: number) => string;

  constructor(
    config: HostAuthorityConfig<TInput, TState, TSnapshot>,
    transport: HostTransport,
    decodeInputMessage: (data: ArrayBuffer) => { inputs: Array<{ frame: number; input: TInput }>; inputCount: number; source: number } | null,
    decodeSlot: (byte: number) => string,
  ) {
    this.simulation = config.simulation;
    this.snapshotCodec = config.snapshotCodec;
    this.inputCodec = config.inputCodec;
    this.transport = transport;
    this.localSlot = config.localSlot;
    this.onInputReceived = config.onInputReceived;
    this.onPlayerReconnect = config.onPlayerReconnect;
    this.onPlayerDisconnect = config.onPlayerDisconnect;
    this.decodeInputMessage = decodeInputMessage;
    this.decodeSlot = decodeSlot;
  }

  addGuest(peerId: string, slot: string): void {
    this.peerSlotMap.set(peerId, slot);
    this.guestInputs.set(slot, this.inputCodec.noInput());
  }

  removeGuest(peerId: string): void {
    const slot = this.peerSlotMap.get(peerId);
    this.peerSlotMap.delete(peerId);
    this.guestAckedFrame.delete(peerId);
    if (slot) {
      this.guestInputs.delete(slot);
      this.disconnectedSlots.set(slot, { timer: this.GRACE_PERIOD, peerId });
      this.simulation.disconnectPlayer(slot);
      this.onPlayerDisconnect?.(slot);
    }
  }

  private finalRemoveGuest(slot: string): void {
    this.disconnectedSlots.delete(slot);
    this.lastConsumedFrame.delete(slot);
  }

  tickGraceTimers(dt: number): void {
    for (const [slot, info] of this.disconnectedSlots) {
      info.timer -= dt;
      if (info.timer <= 0) {
        this.finalRemoveGuest(slot);
      }
    }
  }

  handleReconnectRequest(slot: string, newPeerId: string): boolean {
    const graceInfo = this.disconnectedSlots.get(slot);
    if (!graceInfo) {
      const hasActivePeer = [...this.peerSlotMap.values()].includes(slot);
      if (hasActivePeer) return false;
    }

    this.disconnectedSlots.delete(slot);
    this.peerSlotMap.set(newPeerId, slot);
    this.guestInputs.set(slot, this.inputCodec.noInput());
    this.lastConsumedFrame.delete(slot);

    // Delegate game-specific reconnect logic (e.g. respawn if dead)
    this.onPlayerReconnect?.(this.simulation.getState(), slot);

    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.localFrame = 0;
    // Ping/pong for RTT measurement is handled by the Transport layer.
  }

  stop(): void {
    this.running = false;
  }

  broadcastSnapshot(state: TState): void {
    this.localFrame++;
    const snap = this.snapshotCodec.takeSnapshot(this.localFrame, state);
    const encodeBuf = this.snapshotCodec.encode(snap);

    const msg = new Uint8Array(1 + encodeBuf.byteLength);
    msg[0] = CoreMsgType.SNAPSHOT;
    msg.set(new Uint8Array(encodeBuf), 1);

    for (const peerId of this.transport.getPeerIds()) {
      this.transport.sendUnreliableTo(peerId, msg.buffer);
    }

    this.lastSnapshotBytes = encodeBuf.byteLength;
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (type === CoreMsgType.INPUT) {
      const decoded = this.decodeInputMessage(data);
      if (!decoded || decoded.inputCount === 0) return;
      const slot = this.decodeSlot(decoded.source);
      const lastFrame = this.lastConsumedFrame.get(slot) ?? 0;

      for (let i = 0; i < decoded.inputCount; i++) {
        const entry = decoded.inputs[i];
        if (entry.frame <= lastFrame) continue;

        const existing = this.guestInputs.get(slot);
        if (existing && this.onInputReceived) {
          const merged = this.onInputReceived(slot, existing, entry.input);
          this.guestInputs.set(slot, merged);
        } else {
          this.guestInputs.set(slot, entry.input);
        }
        this.lastConsumedFrame.set(slot, entry.frame);
      }

      // Relay to other guests
      if (fromPeerId) {
        for (const pid of this.transport.getPeerIds()) {
          if (pid !== fromPeerId) {
            this.transport.sendUnreliableTo(pid, data);
          }
        }
      }
    } else if (type === CoreMsgType.SNAPSHOT_ACK) {
      const frame = decodeSnapshotAck(data);
      if (frame !== null && fromPeerId) {
        this.guestAckedFrame.set(fromPeerId, frame);
      }
    } else if (type === CoreMsgType.PING) {
      const pp = decodePingPong(data);
      if (pp && fromPeerId) {
        this.transport.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
      }
    }
  }

  getGuestInput(slot: string): TInput {
    return this.guestInputs.get(slot) ?? this.inputCodec.noInput();
  }

  getNetworkInputs(): Map<string, TInput> {
    return this.guestInputs;
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

  getLocalFrame(): number { return this.localFrame; }

  setMatchOver(): void {}
}
