/**
 * Generic host-authoritative game server.
 *
 * Buffers guest inputs, broadcasts snapshots, manages peer connections.
 * Game-specific logic (input latching, reconnect respawn) is injected via callbacks.
 */
import type { SnapshotEncoder, InputCodec, HostAuthorityConfig } from './types';
import { CoreMsgType, encodePong, decodePingPong } from './protocol';

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
  snapshotBytesMean: number;
  snapshotBytesMax: number;
  guestCount: number;
  isRelay: boolean;
}

export class GenericHostAuthority<TInput, TState, TSnapshot> {
  private simulation: HostSimulation<TState>;
  private snapshotEncoder: SnapshotEncoder<TSnapshot, TState>;
  private inputCodec: InputCodec<TInput>;
  private transport: HostTransport;
  readonly localSlot: string;

  private onInputReceived?: (slot: string, existing: TInput, incoming: TInput) => TInput;
  private onPlayerReconnect?: (state: TState, slot: string) => void;
  private onPlayerDisconnect?: (slot: string) => void;

  private localFrame = 0;
  private running = false;
  // After `setMatchOver()`, the host sends this many more snapshots (so late
  // guests see matchOver=true even if the first copy is lost), then stops.
  private matchOverSnapshotsLeft = -1;
  private static readonly MATCH_OVER_TAIL = 20;

  // Guest input buffers: slot → latest input
  private guestInputs = new Map<string, TInput>();
  // Peer → slot mapping
  private peerSlotMap = new Map<string, string>();

  // Per-slot frame tracking for input redundancy
  private lastConsumedFrame = new Map<string, number>();

  // Reconnection grace period (seconds before a disconnected slot is final-evicted).
  private disconnectedSlots = new Map<string, { timer: number; peerId: string }>();
  private readonly gracePeriodSec: number;
  private static readonly DEFAULT_GRACE_PERIOD_SEC = 20;

  // Stats — ring buffer of last 120 snapshot sizes (~2s at 60Hz)
  private lastSnapshotBytes = 0;
  private static readonly SNAPSHOT_HISTORY_SIZE = 120;
  private snapshotHistory = new Uint16Array(GenericHostAuthority.SNAPSHOT_HISTORY_SIZE);
  private snapshotHistoryIdx = 0;
  private snapshotHistoryCount = 0;

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
    this.snapshotEncoder = config.snapshotEncoder;
    this.inputCodec = config.inputCodec;
    this.transport = transport;
    this.localSlot = config.localSlot;
    this.onInputReceived = config.onInputReceived;
    this.onPlayerReconnect = config.onPlayerReconnect;
    this.onPlayerDisconnect = config.onPlayerDisconnect;
    this.gracePeriodSec = config.gracePeriodSec ?? GenericHostAuthority.DEFAULT_GRACE_PERIOD_SEC;
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
    if (slot) {
      this.guestInputs.delete(slot);
      // Clear lastConsumedFrame too: a fresh peer reconnecting into the same
      // slot (without going through the explicit RECONNECT_REQUEST flow)
      // starts at guestFrame=1 — if a stale lastConsumedFrame from the prior
      // session survives, all of the new peer's inputs are silently discarded
      // until their counter catches up. The grace-period reclaim path
      // (handleReconnectRequest) clears this on its own; this guards the
      // bare-transport-recycle path.
      this.lastConsumedFrame.delete(slot);
      this.disconnectedSlots.set(slot, { timer: this.gracePeriodSec, peerId });
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
    // After match end, send a finite tail so guests reliably see matchOver=true
    // then stop — no point burning bandwidth on a dead simulation.
    if (this.matchOverSnapshotsLeft === 0) return;
    if (this.matchOverSnapshotsLeft > 0) this.matchOverSnapshotsLeft--;
    this.localFrame++;
    const snap = this.snapshotEncoder.takeSnapshot(this.localFrame, state);
    const encodeBuf = this.snapshotEncoder.encode(snap);

    const msg = new Uint8Array(1 + encodeBuf.byteLength);
    msg[0] = CoreMsgType.SNAPSHOT;
    msg.set(new Uint8Array(encodeBuf), 1);

    for (const peerId of this.transport.getPeerIds()) {
      this.transport.sendUnreliableTo(peerId, msg.buffer);
    }

    this.lastSnapshotBytes = encodeBuf.byteLength;
    this.snapshotHistory[this.snapshotHistoryIdx] = Math.min(encodeBuf.byteLength, 65535);
    this.snapshotHistoryIdx = (this.snapshotHistoryIdx + 1) % GenericHostAuthority.SNAPSHOT_HISTORY_SIZE;
    if (this.snapshotHistoryCount < GenericHostAuthority.SNAPSHOT_HISTORY_SIZE) this.snapshotHistoryCount++;
  }

  /** One-off snapshot to a single peer — used for reconnect sync where the
   *  reclaimed guest needs a fresh full state outside the broadcast cadence.
   *  Does not advance localFrame or touch the match-over tail. */
  sendSnapshotTo(peerId: string, state: TState): void {
    const snap = this.snapshotEncoder.takeSnapshot(this.localFrame, state);
    const encodeBuf = this.snapshotEncoder.encode(snap);
    const msg = new Uint8Array(1 + encodeBuf.byteLength);
    msg[0] = CoreMsgType.SNAPSHOT;
    msg.set(new Uint8Array(encodeBuf), 1);
    this.transport.sendUnreliableTo(peerId, msg.buffer);
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (type === CoreMsgType.INPUT) {
      const decoded = this.decodeInputMessage(data);
      if (!decoded || decoded.inputCount === 0) return;
      const slot = this.decodeSlot(decoded.source);
      // Source authentication: a malicious / buggy peer could spoof another
      // slot ID (including a bot slot) on the wire to hijack inputs. We trust
      // only the slot the host assigned to the originating peer.
      if (fromPeerId !== undefined) {
        const expected = this.peerSlotMap.get(fromPeerId);
        if (!expected || expected !== slot) return;
      }
      // Counter-reset detection: guestFrame is encoded as Uint32 on the wire
      // and wraps to 0 at ~828 days at 60fps, OR a fresh client could rejoin
      // the same slot with its own counter starting at 1. If the incoming
      // bundle's newest frame is far below our stored lastConsumedFrame
      // (>> 1M frames behind), treat it as a counter reset and accept the
      // bundle from scratch. Without this, the slot would be silently muted
      // forever once the wire counter wrapped.
      const stored = this.lastConsumedFrame.get(slot) ?? 0;
      const newest = decoded.inputs[decoded.inputCount - 1].frame;
      const COUNTER_RESET_GAP = 1_000_000;
      if (stored - newest > COUNTER_RESET_GAP) {
        this.lastConsumedFrame.delete(slot);
      }
      // Track a per-call max so a non-monotonic intra-bundle ordering can't
      // overwrite a newer frame with an older one. (lastConsumedFrame is
      // snapshotted before the loop and only written after — without this
      // local guard, [F=10, F=5, F=8] would apply F=5 over F=10.)
      let maxFrameThisCall = this.lastConsumedFrame.get(slot) ?? 0;

      for (let i = 0; i < decoded.inputCount; i++) {
        const entry = decoded.inputs[i];
        if (entry.frame <= maxFrameThisCall) continue;

        const existing = this.guestInputs.get(slot);
        if (existing && this.onInputReceived) {
          const merged = this.onInputReceived(slot, existing, entry.input);
          this.guestInputs.set(slot, merged);
        } else {
          this.guestInputs.set(slot, entry.input);
        }
        maxFrameThisCall = entry.frame;
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
    let sum = 0;
    let max = 0;
    const n = this.snapshotHistoryCount;
    for (let i = 0; i < n; i++) {
      const v = this.snapshotHistory[i];
      sum += v;
      if (v > max) max = v;
    }
    const mean = n > 0 ? sum / n : 0;
    return {
      localFrame: this.localFrame,
      rtt: this.transport.currentRtt,
      jitter: this.transport.currentJitter,
      snapshotBytes: this.lastSnapshotBytes,
      snapshotBytesMean: mean,
      snapshotBytesMax: max,
      guestCount: this.peerSlotMap.size,
      isRelay: this.transport.isRelay,
    };
  }

  getLocalFrame(): number { return this.localFrame; }

  /** Return the slot IDs of all currently-connected guests. Used by
   *  host-level LOADED handshake to know which slots are expected to signal
   *  readiness. Excludes slots in the reconnection grace period. */
  getExpectedGuestSlots(): string[] {
    return [...this.peerSlotMap.values()];
  }

  /** Resolve a transport peerId to its assigned slot, or undefined if the
   *  peer has no slot (not yet joined or already removed). */
  getSlotForPeer(peerId: string): string | undefined {
    return this.peerSlotMap.get(peerId);
  }

  /** Arm the finite match-over broadcast tail. After MATCH_OVER_TAIL more
   *  snapshots, broadcastSnapshot becomes a no-op until the authority is
   *  destroyed. */
  setMatchOver(): void {
    if (this.matchOverSnapshotsLeft < 0) {
      this.matchOverSnapshotsLeft = GenericHostAuthority.MATCH_OVER_TAIL;
    }
  }
}
