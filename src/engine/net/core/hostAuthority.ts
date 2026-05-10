/**
 * Generic host-authoritative game server.
 *
 * Buffers guest inputs, broadcasts snapshots, manages peer connections.
 * Game-specific logic (input latching, reconnect respawn) is injected via callbacks.
 */
import type { SnapshotEncoder, InputCodec, HostAuthorityConfig } from './types';
import { CoreMsgType, encodePong, decodePingPong, decodeSnapshotAck } from './protocol';
import { createDelta } from './deltaCompression';

/**
 * Frame gap threshold for detecting input counter resets. If a new bundle's
 * newest frame is more than this many frames below our stored max, treat it
 * as a fresh counter (Uint32 wraparound, or a reconnecting client whose
 * disconnect we never observed) and reset the stored value.
 */
const COUNTER_RESET_GAP = 1_000_000;

/** Generate a cryptographically random reclaim token. Uses crypto when
 *  available (browsers, Node 19+); falls back to Math.random() in test
 *  envs that don't expose crypto.getRandomValues. 128 bits of entropy.
 *  Exported so the lobby (which issues tokens before HostAuthority is
 *  constructed) can call the same generator instead of duplicating it. */
export function generateReclaimToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let s = '';
  for (let i = 0; i < 16; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

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
  /** Per-slot reclaim secret. Generated on addGuest and presented by the
   *  reconnecting peer in RECONNECT_REQUEST. Without this, any peer in the
   *  room could claim a disconnected slot and steal the original player's
   *  score. Survives across the disconnect grace period; cleared only on
   *  finalRemoveGuest (slot truly gone). */
  private reclaimTokens = new Map<string, string>();
  private readonly gracePeriodSec: number;
  private static readonly DEFAULT_GRACE_PERIOD_SEC = 20;

  // Per-peer broadcast divisor. 1 = full 60Hz, 2 = ~30Hz, 3 = ~20Hz.
  // Set via setPeerBroadcastDivisor — the unstable signal trips this to 2,
  // upstream callers can also set finer tiers based on RTT/jitter telemetry.
  private peerBroadcastDivisor = new Map<string, number>();

  // ---- Delta compression state (per-peer baseline tracking) ----
  // Disabled by default; opt in via enableDeltaCompression().
  private deltaEnabled = false;
  // Ring of recently-encoded full snapshots, keyed by frame, for ACK→baseline lookup.
  private encodedSnapshotRing: Map<number, ArrayBuffer> = new Map();
  /** Per-peer baseline = the encoded snapshot frame the guest has confirmed
   *  applying. We send delta against this. `frame` doubles as the most-recent
   *  ACK for stale-baseline detection. */
  private peerBaseline = new Map<string, { frame: number; encoded: ArrayBuffer }>();
  /** Frame at which we last sent peer a full snapshot (keyframe). Forced
   *  every KEYFRAME_INTERVAL frames as a recovery floor: even if every ACK
   *  is lost, the guest gets a clean baseline within ~1s. */
  private peerLastKeyframe = new Map<string, number>();
  private static readonly KEYFRAME_INTERVAL = 60;        // ~1s @ 60Hz
  private static readonly STALE_ACK_THRESHOLD = 30;      // ~0.5s without ACK → keyframe
  private static readonly ENCODED_RING_SIZE = 120;       // 2s of history

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

  /** Register a guest. Optionally accept a pre-issued reclaim token (e.g. a
   *  token already sent to the guest in lobby SLOT_ASSIGNMENT). When omitted,
   *  generates a fresh token. Use getReclaimToken(slot) to retrieve. */
  addGuest(peerId: string, slot: string, reclaimToken?: string): void {
    this.peerSlotMap.set(peerId, slot);
    this.guestInputs.set(slot, this.inputCodec.noInput());
    if (reclaimToken) {
      this.reclaimTokens.set(slot, reclaimToken);
    } else if (!this.reclaimTokens.has(slot)) {
      this.reclaimTokens.set(slot, generateReclaimToken());
    }
  }

  /** Returns the reclaim token for a slot, or null if none is registered.
   *  Used by the host to send the token to the guest in SLOT_ASSIGNMENT. */
  getReclaimToken(slot: string): string | null {
    return this.reclaimTokens.get(slot) ?? null;
  }

  removeGuest(peerId: string): void {
    const slot = this.peerSlotMap.get(peerId);
    this.peerSlotMap.delete(peerId);
    this.peerBroadcastDivisor.delete(peerId);
    this.peerBaseline.delete(peerId);
    this.peerLastKeyframe.delete(peerId);
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

  /** Set the broadcast frame divisor for one peer. 1 = full 60Hz (default),
   *  2 = ~30Hz, 3 = ~20Hz, 4 = ~15Hz. Bandwidth + decode cost scales as
   *  1/divisor. The widened interpolation delay ceiling absorbs the larger
   *  inter-arrival gap. Capped at 4 to bound the worst case. */
  setPeerBroadcastDivisor(peerId: string, divisor: number): void {
    const d = Math.max(1, Math.min(4, Math.floor(divisor)));
    if (d === 1) this.peerBroadcastDivisor.delete(peerId);
    else this.peerBroadcastDivisor.set(peerId, d);
  }

  getPeerBroadcastDivisor(peerId: string): number {
    return this.peerBroadcastDivisor.get(peerId) ?? 1;
  }

  /** Convenience: binary unstable signal maps to divisor=2 (≈30Hz). */
  setPeerUnstable(peerId: string, unstable: boolean): void {
    this.setPeerBroadcastDivisor(peerId, unstable ? 2 : 1);
  }

  isPeerUnstable(peerId: string): boolean {
    return this.getPeerBroadcastDivisor(peerId) > 1;
  }

  private finalRemoveGuest(slot: string): void {
    this.disconnectedSlots.delete(slot);
    this.lastConsumedFrame.delete(slot);
    // Keep the reclaim token: after grace expires, the original peer can
    // still present their token to reclaim, but a stranger CANNOT (storedToken
    // exists, presented token differs, validation rejects). If we deleted
    // here, the post-grace path would fall through with storedToken=undefined
    // and let any peer claim the abandoned slot — defeating the auth fix.
    // Tokens get dropped at match end via stop().
  }

  tickGraceTimers(dt: number): void {
    for (const [slot, info] of this.disconnectedSlots) {
      info.timer -= dt;
      if (info.timer <= 0) {
        this.finalRemoveGuest(slot);
      }
    }
  }

  handleReconnectRequest(slot: string, newPeerId: string, presentedToken?: string): boolean {
    // Never let a remote peer reclaim the host's own slot. The host's localSlot
    // is never in peerSlotMap (which only tracks remote peers), so without this
    // check a malicious guest could send RECONNECT_REQUEST{slot: hostSlot} and
    // hijack input authority over the host's player.
    if (slot === this.localSlot) return false;

    // Token validation: if we issued a token for this slot, the reclaiming
    // peer must present a matching one. This prevents a malicious peer in
    // the room from claiming a disconnected stranger's slot to steal score.
    const storedToken = this.reclaimTokens.get(slot);
    if (storedToken && storedToken !== presentedToken) return false;

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
    this.peerBroadcastDivisor.clear();
    this.resetDeltaState();
    // Drop reclaim tokens at match end — finalRemoveGuest deliberately keeps
    // them across grace expiry to maintain auth integrity, but match end is
    // the actual lifetime boundary.
    this.reclaimTokens.clear();
  }

  /** Enable delta compression. Off by default. Caller should ensure both
   *  sides agree (PROTOCOL_VERSION rolls when this lands). */
  enableDeltaCompression(enabled: boolean): void {
    this.deltaEnabled = enabled;
    if (!enabled) this.resetDeltaState();
  }

  private resetDeltaState(): void {
    this.encodedSnapshotRing.clear();
    this.peerBaseline.clear();
    this.peerLastKeyframe.clear();
  }

  /** Test introspection: count of full vs delta sends per peer in the last
   *  broadcast call. Resets each broadcast. */
  private _lastBroadcastFulls = 0;
  private _lastBroadcastDeltas = 0;
  getLastBroadcastFulls(): number { return this._lastBroadcastFulls; }
  getLastBroadcastDeltas(): number { return this._lastBroadcastDeltas; }

  broadcastSnapshot(state: TState): void {
    // After match end, send a finite tail so guests reliably see matchOver=true
    // then stop — no point burning bandwidth on a dead simulation.
    if (this.matchOverSnapshotsLeft === 0) return;
    if (this.matchOverSnapshotsLeft > 0) this.matchOverSnapshotsLeft--;
    this.localFrame++;
    const snap = this.snapshotEncoder.takeSnapshot(this.localFrame, state);
    const encodeBuf = this.snapshotEncoder.encode(snap);
    this._broadcastEncodedInternal(encodeBuf);
  }

  /** Phase 2: worker-emitted snapshot path. The simulation lives in a
   *  Web Worker, which produces the encoded buffer (same wire shape as
   *  takeAuthSnapshot+encodeSnapshot). Main pumps the buffer here so the
   *  existing per-peer broadcast tier + delta-compression bypass still
   *  applies — we just skip the local takeSnapshot+encode step.
   *
   *  `frame` is the worker's host-frame counter; we adopt it as our
   *  localFrame so guests see continuous frame numbers. The
   *  matchOverSnapshotsLeft tail behaves the same as broadcastSnapshot. */
  broadcastEncodedSnapshot(encodeBuf: ArrayBuffer, frame: number): void {
    if (this.matchOverSnapshotsLeft === 0) return;
    if (this.matchOverSnapshotsLeft > 0) this.matchOverSnapshotsLeft--;
    this.localFrame = frame;
    this._broadcastEncodedInternal(encodeBuf);
  }

  private _broadcastEncodedInternal(encodeBuf: ArrayBuffer): void {
    this._lastBroadcastFulls = 0;
    this._lastBroadcastDeltas = 0;

    // Build full-snapshot message lazily (only if any peer needs it).
    let fullMsgBuf: ArrayBuffer | null = null;
    const buildFull = (): ArrayBuffer => {
      if (!fullMsgBuf) {
        const msg = new Uint8Array(1 + encodeBuf.byteLength);
        msg[0] = CoreMsgType.SNAPSHOT;
        msg.set(new Uint8Array(encodeBuf), 1);
        fullMsgBuf = msg.buffer;
      }
      return fullMsgBuf;
    };

    // Track wire bytes sent — this is what actually consumes bandwidth.
    // For delta-on we want to see the post-compression payload size, not
    // the source-encoded size. Take the max across peers (worst peer drives
    // the cost on a multi-guest host); when there are no peers, fall back
    // to the encoded size so single-page tests still see something.
    let wireBytesThisTick = 0;
    let baselineStashed = false;
    for (const peerId of this.transport.getPeerIds()) {
      const divisor = this.peerBroadcastDivisor.get(peerId) ?? 1;
      // Skip when divisor > 1 and this frame doesn't align with the divisor.
      if (divisor > 1 && this.localFrame % divisor !== 0) continue;

      let buf: ArrayBuffer;
      if (this.deltaEnabled) {
        // Stash baseline lazily — only when at least one delta-eligible peer
        // is going to receive this frame. Skips a slice + Map insert per
        // tick when the host is solo or all peers are on divisor>1.
        if (!baselineStashed && divisor === 1) {
          this.encodedSnapshotRing.set(this.localFrame, encodeBuf.slice(0));
          if (this.encodedSnapshotRing.size > GenericHostAuthority.ENCODED_RING_SIZE) {
            this.encodedSnapshotRing.delete(this.localFrame - GenericHostAuthority.ENCODED_RING_SIZE);
          }
          baselineStashed = true;
        }
        buf = this.encodeForPeer(peerId, divisor, encodeBuf, buildFull);
      } else {
        buf = buildFull();
      }
      this.transport.sendUnreliableTo(peerId, buf);
      if (buf.byteLength > wireBytesThisTick) wireBytesThisTick = buf.byteLength;
    }

    // If no peer was sent (all skipped or empty room), record the full-message
    // size as a stand-in so the rolling stats stay populated.
    if (wireBytesThisTick === 0) wireBytesThisTick = 1 + encodeBuf.byteLength;

    this.lastSnapshotBytes = wireBytesThisTick;
    this.snapshotHistory[this.snapshotHistoryIdx] = Math.min(wireBytesThisTick, 65535);
    this.snapshotHistoryIdx = (this.snapshotHistoryIdx + 1) % GenericHostAuthority.SNAPSHOT_HISTORY_SIZE;
    if (this.snapshotHistoryCount < GenericHostAuthority.SNAPSHOT_HISTORY_SIZE) this.snapshotHistoryCount++;
  }

  /** Decide whether to send full or delta to one peer, build the bytes,
   *  and update bookkeeping. Returns the message buffer to send. */
  private encodeForPeer(peerId: string, divisor: number, currentEncoded: ArrayBuffer, buildFull: () => ArrayBuffer): ArrayBuffer {
    // Stressed peers (divisor > 1) skip delta entirely: CPU/network is
    // already strained, robustness over bandwidth.
    if (divisor > 1) {
      this._lastBroadcastFulls++;
      return buildFull();
    }

    const baseline = this.peerBaseline.get(peerId);
    const lastKeyframe = this.peerLastKeyframe.get(peerId) ?? -Infinity;

    // Force full when:
    //  - no baseline yet (peer just joined or never ACKed)
    //  - keyframe interval elapsed (recovery floor)
    //  - no fresh ACK in STALE_ACK_THRESHOLD frames (peer stopped confirming)
    const sinceKeyframe = this.localFrame - lastKeyframe;
    const sinceAck = baseline ? this.localFrame - baseline.frame : Infinity;
    const needKeyframe = !baseline
      || sinceKeyframe >= GenericHostAuthority.KEYFRAME_INTERVAL
      || sinceAck >= GenericHostAuthority.STALE_ACK_THRESHOLD;

    if (needKeyframe) {
      this.peerLastKeyframe.set(peerId, this.localFrame);
      this._lastBroadcastFulls++;
      return buildFull();
    }

    // Delta path: encode against this peer's confirmed baseline.
    const delta = createDelta(currentEncoded, baseline.encoded, baseline.frame);
    this._lastBroadcastDeltas++;
    return delta;
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
      // Counter-reset detection (see COUNTER_RESET_GAP at module top).
      const stored = this.lastConsumedFrame.get(slot) ?? 0;
      const newest = decoded.inputs[decoded.inputCount - 1].frame;
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
    } else if (type === CoreMsgType.SNAPSHOT_ACK) {
      // Guest confirmed applying a snapshot — promote that frame to its
      // baseline so we can delta-encode against it next broadcast.
      if (!this.deltaEnabled || !fromPeerId) return;
      const ackedFrame = decodeSnapshotAck(data);
      if (ackedFrame === null) return;
      const encoded = this.encodedSnapshotRing.get(ackedFrame);
      if (!encoded) return; // ACK is older than our ring — nothing to base on
      const existing = this.peerBaseline.get(fromPeerId)?.frame ?? -1;
      if (ackedFrame <= existing) return; // out-of-order ACK, ignore
      this.peerBaseline.set(fromPeerId, { frame: ackedFrame, encoded });
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
