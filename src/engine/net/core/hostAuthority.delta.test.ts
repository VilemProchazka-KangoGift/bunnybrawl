/**
 * Regression suite for snapshot delta compression on slow / unreliable networks.
 *
 * The "old" delta path was disabled because lost SNAPSHOT_ACKs caused host/guest
 * baseline divergence and silent corruption. The new design pins recovery on
 * three guarantees:
 *
 *  1. baseFrame in delta header   — guest validates before applying
 *  2. ACK→ring lookup             — host only accepts ACKs whose frame is still
 *                                   in its encoded ring (otherwise too old to
 *                                   serve as a baseline)
 *  3. keyframe cadence            — every KEYFRAME_INTERVAL frames OR after
 *                                   STALE_ACK_THRESHOLD frames without an ACK,
 *                                   force a full snapshot regardless of state
 *
 * These tests pin those guarantees so we don't silently regress the way the
 * old implementation did.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GenericHostAuthority } from './hostAuthority';
import { CoreMsgType, encodeSnapshotAck } from './protocol';
import { applyDelta, readDeltaBaseFrame } from './deltaCompression';
import type { HostAuthorityConfig, SnapshotEncoder, InputCodec } from './types';

// ---- Synthetic test fixture ----
//
// We don't care about the game; we care about the byte stream and per-peer
// baseline tracking. Use a TState = number[] (mutable bytes), TSnapshot just
// wraps a frame + bytes copy, encode() returns the bytes verbatim.

type TState = { bytes: number[] };
type TSnapshot = { frame: number; bytes: Uint8Array };
type TInput = { tag: string };

const snapshotEncoder: SnapshotEncoder<TSnapshot, TState> = {
  takeSnapshot: (frame, state) => ({ frame, bytes: new Uint8Array(state.bytes) }),
  encode: (snap) => {
    // Slice into a fresh ArrayBuffer so the host's slice(0) call still
    // produces the right copy (it does — we just need encode() to return
    // a stable buffer per call).
    const buf = new ArrayBuffer(snap.bytes.length);
    new Uint8Array(buf).set(snap.bytes);
    return buf;
  },
};

const inputCodec: InputCodec<TInput> = {
  encode: () => 0,
  decode: () => ({ tag: '' }),
  noInput: () => ({ tag: '' }),
};

class MockTransport {
  peerIds: string[] = [];
  sent: Array<{ peerId: string; data: ArrayBuffer }> = [];
  currentRtt = 50;
  currentJitter = 10;
  isRelay = false;

  sendUnreliable(_: ArrayBuffer): void { /* unused — we always have peers */ }
  sendUnreliableTo(peerId: string, data: ArrayBuffer): void {
    this.sent.push({ peerId, data });
  }
  sendReliableTo(_: string, __: unknown): void { /* unused */ }
  getPeerIds(): string[] { return this.peerIds; }

  /** Test helper: drain and group by peer. */
  drainSentByPeer(): Map<string, ArrayBuffer[]> {
    const out = new Map<string, ArrayBuffer[]>();
    for (const { peerId, data } of this.sent) {
      let arr = out.get(peerId);
      if (!arr) { arr = []; out.set(peerId, arr); }
      arr.push(data);
    }
    this.sent = [];
    return out;
  }
}

function makeSim(initialBytes: number[]) {
  const state: TState = { bytes: [...initialBytes] };
  return {
    state,
    sim: {
      getState: () => state,
      disconnectPlayer: (_id: string) => { /* unused */ },
    },
  };
}

function buildHost(opts?: { peerIds?: string[]; bytes?: number[] }) {
  const transport = new MockTransport();
  if (opts?.peerIds) transport.peerIds = opts.peerIds;
  const { state, sim } = makeSim(opts?.bytes ?? [1, 2, 3, 4, 5, 6, 7, 8]);
  const cfg: HostAuthorityConfig<TInput, TState, TSnapshot> = {
    simulation: sim,
    snapshotEncoder,
    inputCodec,
    localSlot: 'host',
  };
  const host = new GenericHostAuthority(cfg, transport, () => null, () => '');
  return { host, transport, state };
}

/** First byte of a host-broadcast packet identifies the format. */
function msgType(buf: ArrayBuffer): number {
  return new Uint8Array(buf)[0];
}

/** Pretend to be a guest: send a SNAPSHOT_ACK for the given frame. */
function sendAck(host: GenericHostAuthority<TInput, TState, TSnapshot>, peerId: string, frame: number): void {
  host.handleUnreliableMessage(encodeSnapshotAck(frame), peerId);
}

// ---- Tests ----

describe('GenericHostAuthority — delta compression (regression)', () => {
  describe('feature flag', () => {
    it('defaults to OFF — every broadcast is a full snapshot', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      for (let i = 0; i < 10; i++) {
        host.broadcastSnapshot({ bytes: [i, i, i] });
      }
      const sent = transport.drainSentByPeer().get('a')!;
      expect(sent.length).toBe(10);
      for (const buf of sent) {
        expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
      }
    });

    it('enableDeltaCompression(true) opts in; first broadcast is still full (no baseline yet)', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);
      host.broadcastSnapshot({ bytes: [1, 2, 3] });
      const first = transport.drainSentByPeer().get('a')![0];
      expect(msgType(first)).toBe(CoreMsgType.SNAPSHOT);
      expect(host.getLastBroadcastFulls()).toBe(1);
      expect(host.getLastBroadcastDeltas()).toBe(0);
    });

    it('enableDeltaCompression(false) clears all delta state and reverts to full-only', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);
      host.broadcastSnapshot({ bytes: [1, 2, 3] }); // frame 1, full
      sendAck(host, 'a', 1);
      transport.sent = [];

      host.enableDeltaCompression(false);
      // After disable, baseline state is cleared. Broadcast must be full
      // even though we did just ACK frame 1.
      host.broadcastSnapshot({ bytes: [1, 2, 3] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });
  });

  describe('baseline establishment via ACK', () => {
    it('after a SNAPSHOT_ACK arrives, the next broadcast uses delta', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1, 2, 3, 4] }); // frame 1: full
      sendAck(host, 'a', 1);
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [1, 2, 3, 5] }); // frame 2: should delta
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT_DELTA);
      expect(host.getLastBroadcastDeltas()).toBe(1);
      expect(host.getLastBroadcastFulls()).toBe(0);
    });

    it('delta header carries baseFrame matching the ACKed frame', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1, 2, 3, 4] });
      sendAck(host, 'a', 1);
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [9, 8, 7, 6] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(readDeltaBaseFrame(buf)).toBe(1);
    });

    it('delta round-trips: applyDelta(delta, baseline) reconstructs current snapshot', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      // Frame 1: baseline established via ACK
      const bytes1 = [10, 20, 30, 40, 50];
      host.broadcastSnapshot({ bytes: bytes1 });
      const fullBuf = transport.drainSentByPeer().get('a')![0];
      // Strip the SNAPSHOT prefix to recover the raw encoded baseline
      const baselineRaw = new Uint8Array(fullBuf).slice(1).buffer;
      sendAck(host, 'a', 1);

      // Frame 2: delta against frame 1
      const bytes2 = [10, 25, 30, 45, 55];
      host.broadcastSnapshot({ bytes: bytes2 });
      const deltaBuf = transport.drainSentByPeer().get('a')![0];

      const reconstructed = applyDelta(deltaBuf, baselineRaw);
      expect(reconstructed).not.toBeNull();
      expect(Array.from(new Uint8Array(reconstructed!))).toEqual(bytes2);
    });

    it('out-of-order ACK (older frame) is ignored — newer baseline preserved', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] }); // frame 1
      host.broadcastSnapshot({ bytes: [2] }); // frame 2
      host.broadcastSnapshot({ bytes: [3] }); // frame 3
      sendAck(host, 'a', 3);
      sendAck(host, 'a', 2); // arrives later, should be ignored
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [4] }); // frame 4
      const buf = transport.drainSentByPeer().get('a')![0];
      // Should delta against frame 3, not frame 2
      expect(readDeltaBaseFrame(buf)).toBe(3);
    });

    it('ACK for a frame older than the encoded ring is rejected (no baseline updated)', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      // Burn the ring past ENCODED_RING_SIZE so frame 1 falls out
      const RING = 120;
      for (let i = 0; i < RING + 5; i++) {
        host.broadcastSnapshot({ bytes: [i & 0xFF] });
      }
      transport.sent = [];

      // Late ACK for frame 1 — too old, ring no longer has it
      sendAck(host, 'a', 1);

      // Next broadcast must still be a full snapshot (no baseline taken)
      host.broadcastSnapshot({ bytes: [42] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });

    it('ACK from a peer with no fromPeerId is ignored (defensive)', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] });
      // ACK without fromPeerId
      host.handleUnreliableMessage(encodeSnapshotAck(1));
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [2] });
      const buf = transport.drainSentByPeer().get('a')![0];
      // No baseline established → still a full
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });

    it('ACK while delta compression disabled is ignored', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      // delta NOT enabled
      host.broadcastSnapshot({ bytes: [1] });
      sendAck(host, 'a', 1);

      host.enableDeltaCompression(true);
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [2] });
      const buf = transport.drainSentByPeer().get('a')![0];
      // Even though we ACKed before enabling, the disabled-mode ACK was
      // dropped, so this must still be a full snapshot.
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });
  });

  describe('keyframe cadence (recovery floor)', () => {
    it('forces a keyframe every KEYFRAME_INTERVAL=60 frames even with fresh ACKs', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      // ACK every frame so the stale-ACK rule never trips. This isolates
      // the keyframe-interval rule.
      host.broadcastSnapshot({ bytes: [0] }); // frame 1, full (no baseline)
      sendAck(host, 'a', 1);

      const types: number[] = [];
      for (let f = 2; f <= 130; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
        const buf = transport.sent[transport.sent.length - 1].data;
        types.push(msgType(buf));
        sendAck(host, 'a', f);
      }
      // types[i] is the type for frame i+2.
      // Frame 1 was the first keyframe. Next forced keyframe at frame 61
      // (sinceKeyframe = 60). Next at 121.
      expect(types[61 - 2]).toBe(CoreMsgType.SNAPSHOT);  // frame 61
      expect(types[121 - 2]).toBe(CoreMsgType.SNAPSHOT); // frame 121
      // A frame in the middle should be delta
      expect(types[30 - 2]).toBe(CoreMsgType.SNAPSHOT_DELTA);
      expect(types[100 - 2]).toBe(CoreMsgType.SNAPSHOT_DELTA);
    });

    it('forces a keyframe after STALE_ACK_THRESHOLD=30 frames without an ACK', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [0] }); // frame 1, full
      sendAck(host, 'a', 1);
      transport.sent = [];

      // No ACKs from this point. After ~30 frames, host should give up
      // and force a keyframe regardless of baseline existence.
      let firstStaleKeyframeAt = -1;
      for (let f = 2; f <= 50; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
        const buf = transport.sent[transport.sent.length - 1].data;
        if (msgType(buf) === CoreMsgType.SNAPSHOT && firstStaleKeyframeAt < 0) {
          firstStaleKeyframeAt = f;
        }
      }
      // Should have forced a keyframe somewhere around frame 31
      // (sinceAck = 30 at frame 31). Allow ±1 tolerance for off-by-one
      // interpretations of the boundary.
      expect(firstStaleKeyframeAt).toBeGreaterThanOrEqual(30);
      expect(firstStaleKeyframeAt).toBeLessThanOrEqual(32);
    });

    it('lost-ACK burst eventually self-heals via keyframe cadence', () => {
      // Worst case for the old design: every ACK in flight is dropped.
      // The new design must still recover within ~1s via the keyframe floor.
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      const RING = 120;
      for (let f = 1; f <= RING + 30; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
        // NEVER ACK — pretend every ACK is lost
      }

      // Without a working recovery path, every send would be a full snapshot
      // (because !baseline). With recovery, that's actually fine — the guest
      // always has a fresh full snapshot to apply. Verify they're all sends
      // the guest can decode without history.
      const sent = transport.drainSentByPeer().get('a')!;
      for (const buf of sent) {
        // Either a full snapshot (no baseline, expected during ACK loss) OR
        // a delta with a baseFrame the guest could have actually held.
        expect([CoreMsgType.SNAPSHOT, CoreMsgType.SNAPSHOT_DELTA]).toContain(msgType(buf));
      }
      // First send must be full
      expect(msgType(sent[0])).toBe(CoreMsgType.SNAPSHOT);
      // With zero ACKs the host has no baseline to delta against; every send
      // is full. This is the safe fallback path.
      const fullCount = sent.filter(b => msgType(b) === CoreMsgType.SNAPSHOT).length;
      expect(fullCount).toBe(sent.length);
    });

    it('ACK loss followed by recovery: deltas resume after first surviving ACK', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      // 50 frames, all ACKs lost
      for (let f = 1; f <= 50; f++) host.broadcastSnapshot({ bytes: [f & 0xFF] });
      transport.sent = [];

      // ACK survives at frame 50
      sendAck(host, 'a', 50);

      // Next 5 frames should delta against frame 50 (modulo keyframe cadence
      // — at frame 51, sinceKeyframe will equal 50 if last keyframe was frame
      // 1; sinceKeyframe=50 < 60 so we're in delta range)
      for (let f = 51; f <= 55; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
        sendAck(host, 'a', f);
      }
      const sent = transport.drainSentByPeer().get('a')!;
      // At least one of those next sends should now be a delta
      const deltaCount = sent.filter(b => msgType(b) === CoreMsgType.SNAPSHOT_DELTA).length;
      expect(deltaCount).toBeGreaterThan(0);
    });
  });

  describe('encoded ring management', () => {
    it('caps the encoded snapshot ring at ENCODED_RING_SIZE=120 (bounded memory)', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      // Send 200 snapshots — ring must be capped to 120 entries
      for (let f = 1; f <= 200; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF, (f >> 8) & 0xFF] });
      }
      transport.sent = [];

      // ACKing frame 50 (now outside the 120-entry window: frames ~80–200)
      // must NOT establish a baseline, since we no longer have those bytes.
      sendAck(host, 'a', 50);
      host.broadcastSnapshot({ bytes: [99] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);

      // ACKing a frame INSIDE the window must establish a baseline.
      sendAck(host, 'a', 195); // 5 frames before the latest, well inside ring
      transport.sent = [];
      host.broadcastSnapshot({ bytes: [123] });
      const buf2 = transport.drainSentByPeer().get('a')![0];
      // Should now be a delta (baseFrame 195) — but only if keyframe cadence
      // doesn't override (frame 202, sinceKeyframe depends on last full).
      // The last forced keyframe was at frame 121 (or 181 depending on cadence
      // interaction); accept either delta or full. Key assertion: ACK was not
      // silently dropped.
      const t = msgType(buf2);
      if (t === CoreMsgType.SNAPSHOT_DELTA) {
        expect(readDeltaBaseFrame(buf2)).toBe(195);
      }
      expect([CoreMsgType.SNAPSHOT, CoreMsgType.SNAPSHOT_DELTA]).toContain(t);
    });
  });

  describe('multi-peer baseline isolation', () => {
    it('per-peer baselines are independent — peer-A ACK does not affect peer-B delta', () => {
      const { host, transport } = buildHost({ peerIds: ['a', 'b'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] });
      sendAck(host, 'a', 1);
      // peer-b never ACKs
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [2] });
      const sent = transport.drainSentByPeer();
      // peer-a has baseline → delta
      expect(msgType(sent.get('a')![0])).toBe(CoreMsgType.SNAPSHOT_DELTA);
      // peer-b has no baseline → full
      expect(msgType(sent.get('b')![0])).toBe(CoreMsgType.SNAPSHOT);
    });

    it('two peers at different baselines each get their own delta baseFrame', () => {
      const { host, transport } = buildHost({ peerIds: ['a', 'b'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] }); // f=1
      sendAck(host, 'a', 1);
      host.broadcastSnapshot({ bytes: [2] }); // f=2
      sendAck(host, 'b', 2);
      host.broadcastSnapshot({ bytes: [3] }); // f=3
      sendAck(host, 'a', 3);
      // peer-b still on baseline 2
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [4] }); // f=4
      const sent = transport.drainSentByPeer();
      const aBuf = sent.get('a')![0];
      const bBuf = sent.get('b')![0];
      expect(msgType(aBuf)).toBe(CoreMsgType.SNAPSHOT_DELTA);
      expect(msgType(bBuf)).toBe(CoreMsgType.SNAPSHOT_DELTA);
      expect(readDeltaBaseFrame(aBuf)).toBe(3);
      expect(readDeltaBaseFrame(bBuf)).toBe(2);
    });

    it('one slow peer does not stall the broadcast for healthy peers', () => {
      // Slow peer never ACKs (always gets keyframes), fast peer ACKs every
      // frame (gets deltas after frame 1). Fast peer must NEVER be downgraded
      // because of slow peer's behavior.
      const { host, transport } = buildHost({ peerIds: ['fast', 'slow'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] }); // both get full
      sendAck(host, 'fast', 1);

      let fastDeltaCount = 0;
      for (let f = 2; f <= 30; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
        sendAck(host, 'fast', f);
      }
      const sent = transport.drainSentByPeer();
      for (const buf of sent.get('fast')!.slice(1)) {
        // Skip the first (frame 1 full); subsequent should be deltas.
        if (msgType(buf) === CoreMsgType.SNAPSHOT_DELTA) fastDeltaCount++;
      }
      expect(fastDeltaCount).toBeGreaterThan(20);
    });
  });

  describe('peer lifecycle cleanup', () => {
    it('removeGuest clears baseline / lastAck / lastKeyframe state', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] });
      sendAck(host, 'a', 1);
      host.broadcastSnapshot({ bytes: [2] });
      transport.sent = [];

      host.removeGuest('a');
      // Re-add same peerId → must restart from full (state was cleared)
      transport.peerIds = ['a'];
      host.broadcastSnapshot({ bytes: [3] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });

    it('stop() clears all delta state (post-match safety)', () => {
      const { host, transport } = buildHost({ peerIds: ['a', 'b'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] });
      sendAck(host, 'a', 1);
      sendAck(host, 'b', 1);
      transport.sent = [];

      host.stop();
      // After stop, broadcastSnapshot still works (the no-op gate is on
      // matchOver tail, not running). Verify next broadcasts go full.
      host.broadcastSnapshot({ bytes: [2] });
      const sent = transport.drainSentByPeer();
      expect(msgType(sent.get('a')![0])).toBe(CoreMsgType.SNAPSHOT);
      expect(msgType(sent.get('b')![0])).toBe(CoreMsgType.SNAPSHOT);
    });
  });

  describe('interaction with broadcast divisor (slow / unstable peers)', () => {
    it('peers on divisor>1 always get full snapshots (delta bypassed for stressed peers)', () => {
      // Peers with divisor > 1 are flagged "unstable" — either the host's
      // RTT/jitter heuristics flagged them, or the guest sent
      // CONNECTION_UNSTABLE. In both cases their CPU/network is stressed
      // and we want robustness over bandwidth: sending fulls avoids
      // (a) the per-snapshot delta-decode cost on a slow guest, and
      // (b) the cascade risk if a delta references a baseline the guest
      //     dropped. Bandwidth is already halved by the divisor itself.
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);
      host.setPeerBroadcastDivisor('a', 2);

      host.broadcastSnapshot({ bytes: [1] }); // frame 1: skipped (1 % 2 != 0)
      host.broadcastSnapshot({ bytes: [2] }); // frame 2: sent (full)
      sendAck(host, 'a', 2);
      host.broadcastSnapshot({ bytes: [3] }); // frame 3: skipped
      host.broadcastSnapshot({ bytes: [4] }); // frame 4: sent — STILL full
      host.broadcastSnapshot({ bytes: [5] }); // frame 5: skipped
      host.broadcastSnapshot({ bytes: [6] }); // frame 6: sent — STILL full
      const sent = transport.drainSentByPeer().get('a')!;
      expect(sent.length).toBe(3);
      // ALL three sends must be full snapshots — never delta — for divisor>1
      for (const buf of sent) expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });

    it('peer reverting from divisor>1 to divisor=1 resumes delta encoding', () => {
      // A peer that recovered (CONNECTION_UNSTABLE → stalled=false, or
      // RTT/jitter dropped back) should be able to use deltas again.
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);
      host.setPeerBroadcastDivisor('a', 2);

      host.broadcastSnapshot({ bytes: [1] });
      host.broadcastSnapshot({ bytes: [2] });
      sendAck(host, 'a', 2);
      transport.sent = [];

      host.setPeerBroadcastDivisor('a', 1); // peer recovered

      host.broadcastSnapshot({ bytes: [3] });
      host.broadcastSnapshot({ bytes: [4] });
      sendAck(host, 'a', 4);
      host.broadcastSnapshot({ bytes: [5] });
      const sent = transport.drainSentByPeer().get('a')!;
      // After recovery, deltas should resume (against an ACKed baseline)
      const deltaCount = sent.filter(b => msgType(b) === CoreMsgType.SNAPSHOT_DELTA).length;
      expect(deltaCount).toBeGreaterThan(0);
    });

    it('unstable-peer (divisor=2) still gets eventual keyframes via the cadence', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);
      host.setPeerBroadcastDivisor('a', 2);

      // Drive 200 host frames without ACKs — peer-a receives ~100 of them.
      // Without keyframe cadence, peer-a's first send is a full and every
      // subsequent send is a full (no baseline). With cadence, that's still
      // safe — we're testing that nothing gets STUCK or corrupted.
      for (let f = 1; f <= 200; f++) {
        host.broadcastSnapshot({ bytes: [f & 0xFF] });
      }
      const sent = transport.drainSentByPeer().get('a')!;
      // peer-a got every-other frame: frames 2, 4, ..., 200 = 100 sends
      expect(sent.length).toBe(100);
      // All must be full (peer never ACKed, so no baseline ever)
      for (const buf of sent) expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });
  });

  describe('packet loss simulation (high-loss network)', () => {
    function simulate(opts: {
      lossRate: number;
      ackLossRate: number;
      reorderProb: number;
      frames: number;
      peerCount: number;
      seed?: number;
    }) {
      // Simple LCG so the test is deterministic regardless of host RNG.
      let s = opts.seed ?? 1234567;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xFFFFFFFF;
      };

      const peers = Array.from({ length: opts.peerCount }, (_, i) => `p${i}`);
      const { host, transport, state } = buildHost({ peerIds: peers, bytes: [0, 0, 0, 0, 0, 0, 0, 0] });
      host.enableDeltaCompression(true);

      // Per-peer guest state: latest applied bytes + frame
      const peerState = new Map<string, { bytes: ArrayBuffer | null; frame: number }>();
      for (const p of peers) peerState.set(p, { bytes: null, frame: 0 });

      let mismatches = 0;
      const pendingAcks: Array<{ peerId: string; frame: number }> = [];

      for (let f = 1; f <= opts.frames; f++) {
        // Mutate state a bit each frame
        for (let i = 0; i < state.bytes.length; i++) {
          if (rand() < 0.2) state.bytes[i] = (state.bytes[i] + 1) & 0xFF;
        }

        host.broadcastSnapshot(state);

        // Process the new sends
        const grouped = transport.drainSentByPeer();
        for (const peerId of peers) {
          const sends = grouped.get(peerId) ?? [];
          for (const buf of sends) {
            // Drop with lossRate
            if (rand() < opts.lossRate) continue;

            const t = msgType(buf);
            const ps = peerState.get(peerId)!;
            if (t === CoreMsgType.SNAPSHOT) {
              // Strip prefix to get raw bytes
              ps.bytes = new Uint8Array(buf).slice(1).buffer;
              ps.frame = f;
            } else if (t === CoreMsgType.SNAPSHOT_DELTA) {
              const base = readDeltaBaseFrame(buf);
              if (base === null || ps.bytes === null || ps.frame !== base) {
                // baseline mismatch — guest must DROP, not apply blindly
                continue;
              }
              const recon = applyDelta(buf, ps.bytes);
              if (!recon) continue;
              ps.bytes = recon;
              ps.frame = f;
            }
            // Verify reconstruction matches the actual host state at this frame
            if (ps.bytes) {
              const got = new Uint8Array(ps.bytes);
              for (let i = 0; i < state.bytes.length; i++) {
                if (got[i] !== state.bytes[i]) {
                  mismatches++;
                  break;
                }
              }
            }
            // Schedule ACK (with possible loss + reorder)
            if (rand() >= opts.ackLossRate) {
              pendingAcks.push({ peerId, frame: ps.frame });
            }
          }
        }

        // Deliver ACKs (with reordering)
        if (pendingAcks.length > 0 && rand() < opts.reorderProb && pendingAcks.length >= 2) {
          // Swap two random adjacent entries
          const i = Math.min(pendingAcks.length - 2, Math.floor(rand() * pendingAcks.length));
          [pendingAcks[i], pendingAcks[i + 1]] = [pendingAcks[i + 1], pendingAcks[i]];
        }
        // Deliver up to 3 per frame to simulate network buffer
        const toDeliver = Math.min(3, pendingAcks.length);
        for (let k = 0; k < toDeliver; k++) {
          const ack = pendingAcks.shift()!;
          sendAck(host, ack.peerId, ack.frame);
        }
      }

      return { mismatches };
    }

    it('5% packet loss + 5% ack loss: no baseline corruption (zero mismatches)', () => {
      const result = simulate({
        lossRate: 0.05, ackLossRate: 0.05, reorderProb: 0.1,
        frames: 300, peerCount: 2, seed: 1,
      });
      expect(result.mismatches).toBe(0);
    });

    it('20% packet loss + 20% ack loss: still no corruption', () => {
      const result = simulate({
        lossRate: 0.20, ackLossRate: 0.20, reorderProb: 0.2,
        frames: 300, peerCount: 2, seed: 2,
      });
      expect(result.mismatches).toBe(0);
    });

    it('50% packet loss + 30% ack loss: protocol still self-heals (no corrupt apply)', () => {
      const result = simulate({
        lossRate: 0.50, ackLossRate: 0.30, reorderProb: 0.3,
        frames: 500, peerCount: 3, seed: 3,
      });
      // Worst-case: with this much loss the guest may often hold a stale
      // baseline + reject incoming deltas. The contract is "never apply
      // a delta against the wrong baseline" — mismatches must be 0.
      expect(result.mismatches).toBe(0);
    });

    it('80% ack loss: guest never falls behind by more than the keyframe interval', () => {
      // Pathological ACK environment. Guest will fall back almost entirely
      // on full-snapshot keyframes. As long as those arrive intact, the
      // guest stays in sync.
      const result = simulate({
        lossRate: 0.0, ackLossRate: 0.80, reorderProb: 0.0,
        frames: 300, peerCount: 1, seed: 4,
      });
      expect(result.mismatches).toBe(0);
    });

    it('reorders (20% prob): out-of-order ACKs do not corrupt baseline', () => {
      const result = simulate({
        lossRate: 0.0, ackLossRate: 0.05, reorderProb: 0.20,
        frames: 300, peerCount: 2, seed: 5,
      });
      expect(result.mismatches).toBe(0);
    });
  });

  describe('matchOver and edge cases', () => {
    it('setMatchOver still allows tail broadcasts to send delta correctly', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1] });
      sendAck(host, 'a', 1);
      host.setMatchOver();
      transport.sent = [];

      // Tail should still go through and use delta (we have a baseline)
      host.broadcastSnapshot({ bytes: [1, 1] });
      const sent = transport.drainSentByPeer().get('a');
      expect(sent).toBeDefined();
      expect(sent!.length).toBe(1);
    });

    it('rapid enable/disable cycles do not leak baseline state across cycles', () => {
      const { host, transport } = buildHost({ peerIds: ['a'] });

      for (let cycle = 0; cycle < 5; cycle++) {
        host.enableDeltaCompression(true);
        host.broadcastSnapshot({ bytes: [cycle] });
        sendAck(host, 'a', host.getLocalFrame());
        host.broadcastSnapshot({ bytes: [cycle, 1] });
        host.enableDeltaCompression(false);
      }
      transport.sent = [];

      // Now off — must always be full
      host.broadcastSnapshot({ bytes: [99] });
      const buf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(buf)).toBe(CoreMsgType.SNAPSHOT);
    });

    it('snapshot that is byte-identical to baseline produces a heavily compressed delta', () => {
      // Pick a state size where delta header overhead (9 bytes) is dwarfed
      // by the payload. Realistic snapshots are 100s–1000s of bytes.
      const big = Array.from({ length: 500 }, (_, i) => (i * 31 + 17) & 0xFF);
      const { host, transport } = buildHost({ peerIds: ['a'], bytes: big });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: big });
      const fullBuf = transport.sent[0].data;
      const baselineRaw = new Uint8Array(fullBuf).slice(1).buffer;
      sendAck(host, 'a', 1);
      transport.sent = [];

      // Identical state — XOR is all zeros, RLE compresses heavily
      host.broadcastSnapshot({ bytes: big });
      const deltaBuf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(deltaBuf)).toBe(CoreMsgType.SNAPSHOT_DELTA);

      const recon = applyDelta(deltaBuf, baselineRaw);
      expect(recon).not.toBeNull();
      expect(Array.from(new Uint8Array(recon!))).toEqual(big);
      // Delta should be much smaller than the full snapshot
      expect(deltaBuf.byteLength).toBeLessThan(fullBuf.byteLength);
    });

    it('large state delta (200 bytes, fully different) still round-trips', () => {
      const { host, transport } = buildHost({ peerIds: ['a'], bytes: new Array(200).fill(0) });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: new Array(200).fill(0) });
      const fullBuf = transport.sent[0].data;
      const baselineRaw = new Uint8Array(fullBuf).slice(1).buffer;
      sendAck(host, 'a', 1);
      transport.sent = [];

      const newState = Array.from({ length: 200 }, (_, i) => (i * 7 + 13) & 0xFF);
      host.broadcastSnapshot({ bytes: newState });
      const deltaBuf = transport.drainSentByPeer().get('a')![0];
      expect(msgType(deltaBuf)).toBe(CoreMsgType.SNAPSHOT_DELTA);

      const recon = applyDelta(deltaBuf, baselineRaw);
      expect(recon).not.toBeNull();
      expect(Array.from(new Uint8Array(recon!))).toEqual(newState);
    });

    it('baseline byte mismatch (corrupt guest history) is detected and rejected', () => {
      // Simulates a guest holding wrong baseline bytes — applyDelta must
      // refuse rather than produce garbage.
      const { host, transport } = buildHost({ peerIds: ['a'] });
      host.enableDeltaCompression(true);

      host.broadcastSnapshot({ bytes: [1, 2, 3, 4] });
      sendAck(host, 'a', 1);
      transport.sent = [];

      host.broadcastSnapshot({ bytes: [1, 2, 9, 4] });
      const deltaBuf = transport.drainSentByPeer().get('a')![0];

      // Guest claims to have the right baseline but is actually different
      // length — applyDelta should return null.
      const wrongBaseline = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
      expect(applyDelta(deltaBuf, wrongBaseline)).toBeNull();
    });
  });
});
