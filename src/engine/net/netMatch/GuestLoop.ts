/**
 * GuestLoop — guest-side per-frame loop + snapshot/delta handlers.
 *
 * Owns: rafId, the input redundancy ring buffer (8 inputs), the snapshot
 * decode pool, InputEcho, and the wire-side helpers (handleGuestSnapshot,
 * handleGuestDelta, noteSnapshotArrival, storeGuestBaseline, sendAck).
 *
 * Cross-collaborator state read/written here lives on NetMatchContext:
 *   prevGuestPhase, guestMatchOverFired, autoSlowReported, lastSnapshotTime,
 *   stallNotified, reconnecting, guestBaselines.
 *
 * Behavior preserved verbatim from the pre-decomposition NetMatch.startGuestLoop /
 * handleGuestSnapshot / handleGuestDelta — only the host references were
 * pivoted onto ctx.
 */
import type { PlayerSlot, InputState } from '../../types';
import { FIXED_TIMESTEP } from '../../constants';
import { sampleFps } from '../../fpsCounter';
import * as autoSlowDetect from '../../autoSlowDetect';
import { perfTrace } from '../../perfTrace';
import { MsgType } from '../protocol';
import type { ReliableMessage } from '../protocol';
import { applySnapshotToState } from '../interpolation';
import { decodeSnapshot, createEmptySnapshot } from '../snapshot';
import type { AuthSnapshot } from '../snapshot';
import { encodeInputMessage } from '../protocol';
import { encodeSnapshotAck } from '../core/protocol';
import { applyDelta, readDeltaBaseFrame } from '../core/deltaCompression';
import { InputEcho } from '../inputEcho';
import {
  type NetMatchContext,
  SNAPSHOT_POOL_SIZE,
  GUEST_BASELINE_RING_SIZE,
} from './NetMatchContext';

/** Input redundancy: ring buffer of last 8 inputs (~133ms coverage). */
const INPUT_RING_SIZE = 8;

export class GuestLoop {
  private ctx: NetMatchContext;
  private rafId = 0;
  private inputEcho: InputEcho | null = null;

  // Snapshot decode pool — recycled to eliminate per-snapshot small-object
  // allocations. Pool size matches the interpolation ring so the slot we're
  // about to overwrite has already been evicted from the ring.
  private snapshotPool: AuthSnapshot[];
  private snapshotPoolIdx = 0;

  constructor(ctx: NetMatchContext, opts?: { disableInputEcho?: boolean }) {
    this.ctx = ctx;
    this.snapshotPool = Array.from({ length: SNAPSHOT_POOL_SIZE }, () => createEmptySnapshot());
    if (!opts?.disableInputEcho) {
      this.inputEcho = new InputEcho(this.ctx.localSlot);
    }
  }

  /** Guest: send inputs + receive snapshots → render. */
  start(): void {
    // Transport owns all ping/pong RTT measurement. NetMatch used to start its
    // own 500ms ping interval here — dead code because Transport intercepts
    // ping/pong before they reach NetMatch's handleUnreliableMessage.
    const FIXED_DT = FIXED_TIMESTEP;
    let lastTime = performance.now();
    let guestFrame = 0;

    const inputRing: Array<{ frame: number; input: InputState }> = Array.from(
      { length: INPUT_RING_SIZE },
      () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
    );
    let inputRingCount = 0;
    // Pre-allocated array for ordered input encoding (avoids per-frame allocation)
    const orderedSlice: Array<{ frame: number; input: InputState }> = Array.from(
      { length: INPUT_RING_SIZE },
      () => ({ frame: 0, input: { left: false, right: false, jump: false, down: false } }),
    );

    const loop = (now: number) => {
      sampleFps(now);
      // Cap dt to 3 ticks — prevents tick burst after fullscreen/tab-switch pauses
      const dt = Math.min((now - lastTime) / 1000, FIXED_DT * 3);
      lastTime = now;
      autoSlowDetect.feedFrame(dt * 1000);

      // 1. Read local input, push to ring buffer, send bundled to host
      const localInput = this.ctx.gameLoop.getInputAny();
      guestFrame++;
      const ringIdx = guestFrame % INPUT_RING_SIZE;
      inputRing[ringIdx].frame = guestFrame;
      inputRing[ringIdx].input.left = localInput.left;
      inputRing[ringIdx].input.right = localInput.right;
      inputRing[ringIdx].input.jump = localInput.jump;
      inputRing[ringIdx].input.down = localInput.down;
      if (inputRingCount < INPUT_RING_SIZE) inputRingCount++;

      // Build ordered slice (oldest → newest) for encoding — reuses pre-allocated array
      const sendCount = inputRingCount;
      for (let i = sendCount - 1; i >= 0; i--) {
        const src = inputRing[((guestFrame - i) % INPUT_RING_SIZE + INPUT_RING_SIZE) % INPUT_RING_SIZE];
        const dst = orderedSlice[sendCount - 1 - i];
        dst.frame = src.frame;
        dst.input.left = src.input.left;
        dst.input.right = src.input.right;
        dst.input.jump = src.input.jump;
        dst.input.down = src.input.down;
      }
      this.ctx.transport.sendUnreliable(
        encodeInputMessage(orderedSlice, 0, sendCount, this.ctx.localSlot),
      );

      // 2. Apply interpolated host snapshot to state
      if (this.ctx.interpolation) {
        const snap = this.ctx.interpolation.getInterpolatedState();
        if (snap) {
          const applyStart = perfTrace.begin('net.applySnapshot');
          applySnapshotToState(snap, this.ctx.gameLoop.getState());
          perfTrace.end('net.applySnapshot', applyStart);
        }
      }

      // 2b. Detect host-driven phase changes arriving via snapshot. Guest's
      // gameLoop.setPhase is never called (phase is mutated directly by
      // applySnapshotToState), so onPhaseChange must be forwarded here.
      const state = this.ctx.gameLoop.getState();
      const curPhase = state.phase;
      if (curPhase !== this.ctx.prevGuestPhase) {
        // loading→playing edge: kick off music, ambient, per-arena loops,
        // and re-prime cosmetic prev-state baselines. Mirrors host's
        // setPhase('playing'). Without this, the guest plays the entire
        // match in silence (no music, no per-arena ambient).
        if (this.ctx.prevGuestPhase === 'loading' && curPhase === 'playing') {
          this.ctx.gameLoop.onEnterPlayingPhase();
        }
        this.ctx.prevGuestPhase = curPhase;
        this.ctx.onPhaseChange?.(curPhase);
      }
      // 2c. Snapshot-driven match-end fallback. The MATCH_RESULT reliable
      // message is defensive but can be lost if the host's connection closes
      // mid-send. The match-over tail of 20 snapshots (core/hostAuthority.ts)
      // gives us redundant delivery — as soon as any of them lands with
      // matchOver=true, synthesize the onMatchEnd callback locally.
      if (!this.ctx.guestMatchOverFired && state.matchOver) {
        this.ctx.guestMatchOverFired = true;
        this.ctx.onMatchEnd?.(state.winner as PlayerSlot | null, state);
      }

      // 3. Tick cosmetics (SFX, particles, visual effects via state-transition detection)
      // No matchOver guard — cosmeticStep needs to run the frame matchOver flips
      // to detect the transition and play the victory sound.
      // During loading, `cosmeticStep` would early-return — instead, run the
      // systems with prev-state pinned to current so JIT compiles the hot paths
      // before phase flips to 'playing'.
      if (state.phase === 'loading') {
        this.ctx.gameLoop.warmupCosmeticDuringLoading(dt);
      } else {
        this.ctx.gameLoop.tickCosmetic(dt);
      }

      // 4. Apply input echo for local player visual responsiveness
      if (this.inputEcho) {
        this.inputEcho.apply(localInput, state, this.ctx.transport.currentRtt, dt);
      }

      // 5. Decay gameplay timers for smooth visual interpolation between snapshots.
      // Only timers NOT handled by cosmeticStep — these affect gameplay (stomp immunity,
      // respawn timing) and are driven by fixedUpdate on the host / snapshots on the guest.
      for (const p of state.players) {
        if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
        if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
        if (p.splatTimer > 0) p.splatTimer = Math.max(0, p.splatTimer - dt);
        if (p.respawnTimer > 0) p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.burnTimer > 0) p.burnTimer = Math.max(0, p.burnTimer - dt);
        if (p.hitstopTimer > 0) p.hitstopTimer = Math.max(0, p.hitstopTimer - dt);
      }
      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt);

      // 5b. Signal slow CPU to host once our local autoSlow flips — host
      // halves broadcast rate and skips delta encoding to this peer.
      if (!this.ctx.autoSlowReported && state.phase !== 'loading'
          && autoSlowDetect.isFlipped()) {
        this.ctx.autoSlowReported = true;
        this.ctx.transport.sendReliable({
          type: MsgType.CONNECTION_UNSTABLE,
          stalled: true,
        } as ReliableMessage);
      }

      // 6. Stall detection (soft banner only). A snapshot-stream gap no longer
      // triggers reconnection — the transport's pong timeout is the single
      // source of truth for peer liveness. Forcing reconnection on brief
      // Wi-Fi blips while the WebRTC channel is still alive caused all
      // reconnect attempts to be rejected by the host (hasActivePeer=true)
      // until the pong timeout caught up ~7s later. Now we just flash a
      // "Connection Unstable" banner; actual reconnect fires from
      // onPeerDisconnected in setEvents.
      // Skip during loading: a >500ms gap is normal as JIT compiles the
      // snapshot decode path on a cold guest, and the ensuing
      // CONNECTION_UNSTABLE message would tell the host "guest has a slow
      // connection" before the match has even started.
      if (this.ctx.lastSnapshotTime > 0 && !this.ctx.reconnecting && !state.matchOver
          && state.phase !== 'loading') {
        const elapsed = now - this.ctx.lastSnapshotTime;
        if (elapsed > 500 && !this.ctx.stallNotified) {
          this.ctx.stallNotified = true;
          this.ctx.onStall?.(true);
          // Reliable hint to host: "my snapshot stream is lagging." Host will
          // show a banner so the human running the host knows why the guest
          // is misbehaving, without waiting for the pong timeout.
          this.ctx.transport.sendReliable({
            type: MsgType.CONNECTION_UNSTABLE,
            stalled: true,
          } as ReliableMessage);
        }
      }

      // 7. Render
      this.ctx.gameLoop.renderFrame(dt);

      // 8. Update connection quality indicator for HUD
      this.ctx.gameLoop.setConnectionQuality(this.ctx.transport.currentRtt, this.ctx.transport.currentJitter);

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Guest-only: returns the latest received snapshot's host-frame number,
   *  or -1 if nothing has arrived yet. */
  getLatestSnapshotFrame(): number {
    if (!this.ctx.interpolation) return -1;
    const snap = this.ctx.interpolation.getLatestSnapshot();
    return snap ? snap.frame : -1;
  }

  /** Wait until the snapshot stream has warmed up before signalling LOADED.
   *  See NetMatch.waitForGuestNetworkReady for the full rationale. Resolves
   *  on success or graceful timeout — never rejects. */
  async waitForNetworkReady(opts: {
    minSnapshots?: number;
    minMs?: number;
    timeoutMs?: number;
  } = {}): Promise<void> {
    if (!this.ctx.interpolation) return;
    const minSnapshots = opts.minSnapshots ?? 12;
    const minMs = opts.minMs ?? 250;
    const timeoutMs = opts.timeoutMs ?? 4000;
    const startTime = performance.now();
    let firstSnapshotTime = 0;
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.ctx.interpolation) { resolve(); return; }
        const depth = this.ctx.interpolation.getBufferDepth();
        const rtt = this.ctx.transport.currentRtt;
        const now = performance.now();
        if (depth > 0 && firstSnapshotTime === 0) firstSnapshotTime = now;
        const elapsed = now - startTime;
        const sinceFirst = firstSnapshotTime > 0 ? now - firstSnapshotTime : 0;
        if (depth >= minSnapshots && rtt > 0 && sinceFirst >= minMs) { resolve(); return; }
        if (elapsed >= timeoutMs) { resolve(); return; }
        setTimeout(check, 50);
      };
      check();
    });
  }

  handleGuestSnapshot(data: ArrayBuffer): void {
    if (!this.ctx.interpolation) return;
    this.noteSnapshotArrival();

    const handleStart = perfTrace.begin('net.handleSnapshot');
    // Skip the 1-byte type prefix and decode into a pooled instance —
    // pool size matches the interpolation ring so the slot we're about to
    // overwrite has already been evicted from the ring.
    const out = this.snapshotPool[this.snapshotPoolIdx];
    this.snapshotPoolIdx = (this.snapshotPoolIdx + 1) % SNAPSHOT_POOL_SIZE;
    const decodeStart = perfTrace.begin('net.decodeSnapshot');
    const snap = decodeSnapshot(data, 1, out);
    perfTrace.end('net.decodeSnapshot', decodeStart);
    if (snap) {
      this.ctx.interpolation.pushSnapshot(snap);
      // Skip baseline-store + ACK after we've signalled slow CPU — the host
      // bypasses delta encoding to unstable peers so this work is unused.
      if (!this.ctx.autoSlowReported) {
        this.storeGuestBaseline(snap.frame, data.slice(1));
        this.sendAck(snap.frame);
      }
    }
    perfTrace.end('net.handleSnapshot', handleStart);
  }

  handleGuestDelta(data: ArrayBuffer): void {
    if (!this.ctx.interpolation) return;

    const handleStart = perfTrace.begin('net.handleDelta');
    const baseFrame = readDeltaBaseFrame(data);
    if (baseFrame === null) {
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }
    const baseline = this.ctx.guestBaselines.get(baseFrame);
    if (!baseline) {
      // Baseline not in our ring — host will keyframe within
      // STALE_ACK_THRESHOLD frames, so just drop. No sense ACKing nothing.
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }
    const reconstructed = applyDelta(data, baseline);
    if (!reconstructed) {
      perfTrace.end('net.handleDelta', handleStart);
      return;
    }

    // Counts as snapshot arrival once we've actually got bytes we can use.
    this.noteSnapshotArrival();

    const out = this.snapshotPool[this.snapshotPoolIdx];
    this.snapshotPoolIdx = (this.snapshotPoolIdx + 1) % SNAPSHOT_POOL_SIZE;
    const decodeStart = perfTrace.begin('net.decodeSnapshot');
    const snap = decodeSnapshot(reconstructed, 0, out);
    perfTrace.end('net.decodeSnapshot', decodeStart);
    if (snap) {
      this.ctx.interpolation.pushSnapshot(snap);
      this.storeGuestBaseline(snap.frame, reconstructed);
      this.sendAck(snap.frame);
    }
    perfTrace.end('net.handleDelta', handleStart);
  }

  /** Update stall-detection bookkeeping after any successful snapshot
   *  arrival (full or delta). */
  private noteSnapshotArrival(): void {
    this.ctx.lastSnapshotTime = performance.now();
    if (this.ctx.stallNotified) {
      this.ctx.stallNotified = false;
      this.ctx.onStall?.(false);
      this.ctx.transport.sendReliable({
        type: MsgType.CONNECTION_UNSTABLE,
        stalled: false,
      } as ReliableMessage);
    }
  }

  /** Push raw encoded bytes (no type prefix) into the guest baseline ring
   *  and trim oldest entries to bound memory. */
  private storeGuestBaseline(frame: number, encoded: ArrayBuffer): void {
    this.ctx.guestBaselines.set(frame, encoded);
    if (this.ctx.guestBaselines.size > GUEST_BASELINE_RING_SIZE) {
      // Drop the oldest (smallest frame number)
      const oldest = this.ctx.guestBaselines.keys().next().value;
      if (oldest !== undefined) this.ctx.guestBaselines.delete(oldest);
    }
  }

  /** ACK the host: "I have applied frame N, you may delta against it." */
  private sendAck(frame: number): void {
    this.ctx.transport.sendUnreliable(encodeSnapshotAck(frame));
  }
}
