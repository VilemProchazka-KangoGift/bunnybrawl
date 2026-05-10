/**
 * HostLoop — host-side per-frame simulate + broadcast loop.
 *
 * Owns: rafId, input fairness ring buffer, broadcast cadence timer, the
 * RTT-derived per-peer broadcast-tier logic. Reads transport / hostAuthority
 * / gameLoop through NetMatchContext.
 *
 * Public API: start() begins the rAF loop. stop() cancels the pending frame.
 *
 * Behavior preserved verbatim from the pre-decomposition NetMatch.startHostLoop.
 */
import type { PlayerSlot, InputState } from '../../types';
import { FIXED_TIMESTEP } from '../../constants';
import { debugFlags } from '../../debugFlags';
import { sampleFps } from '../../fpsCounter';
import * as autoSlowDetect from '../../autoSlowDetect';
import { perfTrace } from '../../perfTrace';
import type { NetMatchContext } from './NetMatchContext';

/** Max frames of input fairness delay (~133ms at 60Hz). */
const MAX_DELAY = 8;
/** Throttle broadcasts to 60Hz even on a 120Hz host display. */
const BROADCAST_INTERVAL_MS = 1000 / 60;

export class HostLoop {
  private ctx: NetMatchContext;
  private rafId = 0;

  constructor(ctx: NetMatchContext) {
    this.ctx = ctx;
  }

  /** Host: simulate + broadcast + render. */
  start(): void {
    let lastTime = performance.now();
    const FIXED_DT = FIXED_TIMESTEP;
    let accumulator = 0;
    let lastBroadcastTime = 0;

    // Fairness delay: buffer host inputs to match guest round-trip latency.
    // Without this, host has 0ms input lag while guest has RTT/2 + interpolation delay.
    // Ring buffer stores recent inputs; we read from delayFrames behind.
    const inputRing: InputState[] = Array.from(
      { length: MAX_DELAY },
      () => ({ left: false, right: false, jump: false, down: false }),
    );
    let writeIdx = 0;
    let delayFrames = 2; // initial delay (updated from RTT)
    let rttCheckTimer = 0;
    // Reused scratch buffer: only clear jumps fixedUpdate actually consumed,
    // so a jump latched mid-tick survives to the next tick.
    const consumedJumpSlots: PlayerSlot[] = [];
    // Reused scratch InputState passed to networkInputs.set(localSlot, ...).
    // We copy the delayed ring slot here so consumeGuestJumps' mutation of
    // input.jump doesn't corrupt the ring — otherwise an increase in
    // delayFrames re-reads the same slot whose jump was already cleared.
    const localInputScratch: InputState = { left: false, right: false, jump: false, down: false };

    const loop = (now: number) => {
      sampleFps(now);
      // Cap dt to 3 ticks — prevents tick burst after fullscreen/tab-switch pauses
      const dt = Math.min((now - lastTime) / 1000, FIXED_DT * 3);
      lastTime = now;
      autoSlowDetect.feedFrame(dt * 1000);
      accumulator += dt;

      // Periodically adapt delay to match guest RTT (every ~1s)
      rttCheckTimer += dt;
      if (rttCheckTimer > 1) {
        rttCheckTimer = 0;
        const rtt = this.ctx.transport.currentRtt;
        // Target: half RTT (one-way) + 2 frames interpolation delay, in frames
        // Guest sees: RTT/2 (input to host) + RTT/2 (snapshot back) + 2 frames interp
        // Host should delay by: RTT/2 + 1 frame (to roughly match guest's total)
        const targetDelay = Math.round((rtt / 2) / (FIXED_DT * 1000)) + 1;
        delayFrames = Math.max(1, Math.min(MAX_DELAY, targetDelay));

        // Per-peer broadcast tier based on health. Divisor 1 = 60Hz, 2 = 30Hz,
        // 3 = 20Hz. Skip if the guest's CONNECTION_UNSTABLE signal already
        // pinned a tier — the explicit signal beats RTT-derived heuristics.
        for (const peerId of this.ctx.transport.getPeerIds()) {
          if (this.ctx.hostAuthority?.isPeerUnstable(peerId)) continue;
          const info = this.ctx.transport.getPeerInfo(peerId);
          if (!info) continue;
          let divisor = 1;
          if (info.rtt > 300 || info.jitter > 100) divisor = 3;
          else if (info.rtt > 150 || info.jitter > 50) divisor = 2;
          this.ctx.hostAuthority?.setPeerBroadcastDivisor(peerId, divisor);
        }
      }

      while (accumulator >= FIXED_DT) {
        // Write current input into ring buffer
        const currentInput = this.ctx.gameLoop.getInputAny();
        inputRing[writeIdx % MAX_DELAY].left = currentInput.left;
        inputRing[writeIdx % MAX_DELAY].right = currentInput.right;
        inputRing[writeIdx % MAX_DELAY].jump = currentInput.jump;
        inputRing[writeIdx % MAX_DELAY].down = currentInput.down;
        writeIdx++;

        // Read delayed input (or current if buffer not full yet). Copy into
        // a scratch InputState so consumeGuestJumps' jump-clear mutation
        // doesn't corrupt the ring buffer (re-reading the same slot when
        // delayFrames increases would otherwise see an already-cleared jump).
        const readIdx = writeIdx > delayFrames ? writeIdx - delayFrames : writeIdx - 1;
        const delayedInput = inputRing[readIdx % MAX_DELAY];
        localInputScratch.left = delayedInput.left;
        localInputScratch.right = delayedInput.right;
        localInputScratch.jump = delayedInput.jump;
        localInputScratch.down = delayedInput.down;

        const networkInputs = this.ctx.hostAuthority!.getNetworkInputs();
        networkInputs.set(this.ctx.localSlot, localInputScratch);
        consumedJumpSlots.length = 0;
        for (const [slot, input] of networkInputs) {
          if (input.jump) consumedJumpSlots.push(slot as PlayerSlot);
        }

        // Phase 2: branch on whether the simulation lives in the worker.
        // When remote, post the already-fairness-delayed input map to the
        // worker; the worker's driveTick consumes it and runs fixedUpdate
        // + encode + emit there. Main stays oblivious to the encode side;
        // worker:netSnapshot is pumped to broadcastEncodedSnapshot in
        // NetMatch.start (Task 17 wiring).
        if (this.ctx.gameLoop.isRemoteSim()) {
          this.ctx.gameLoop.postInputBatch(networkInputs as ReadonlyMap<PlayerSlot, InputState>);
        } else {
          this.ctx.gameLoop.fixedUpdate(FIXED_DT, networkInputs);
        }
        this.ctx.hostAuthority!.consumeGuestJumps(consumedJumpSlots);
        // Tick reconnection grace timers (always on main — host owns the
        // grace ring + transport, regardless of where sim runs).
        this.ctx.hostAuthority!.tickGraceTimers(FIXED_DT);
        // Local-sim only: drive cosmetics here so prev-state baselines
        // capture against the just-mutated state. In remote-sim mode the
        // worker drives both fixedUpdate and tickCosmetic inside the same
        // tick, so calling it again on main would double-fire transitions.
        if (!this.ctx.gameLoop.isRemoteSim()) {
          this.ctx.gameLoop.tickCosmetic(FIXED_DT);
        }
        accumulator -= FIXED_DT;
      }

      // Throttle to 60Hz. A 120Hz host display would otherwise broadcast 120
      // snapshots/sec and double the guest's decode + GC load for no benefit
      // (the simulation is fixed-timestep at 60Hz).
      //
      // In remote-sim mode the worker emits worker:netSnapshot per tick and
      // NetMatch pumps to broadcastEncodedSnapshot — we skip the inline
      // broadcast here so we don't double-send.
      if (!this.ctx.gameLoop.isRemoteSim() && now - lastBroadcastTime >= BROADCAST_INTERVAL_MS) {
        lastBroadcastTime = now;
        const broadcastStart = perfTrace.begin('net.broadcastSnapshot');
        this.ctx.hostAuthority!.broadcastSnapshot(this.ctx.gameLoop.getState());
        perfTrace.end('net.broadcastSnapshot', broadcastStart);
      }

      this.ctx.gameLoop.setConnectionQuality(this.ctx.transport.currentRtt, this.ctx.transport.currentJitter);

      if (debugFlags.netDebugEnabled) {
        const s = this.ctx.hostAuthority!.getStats();
        this.ctx.gameLoop.setNetDebugStats({
          localFrame: s.localFrame,
          rtt: s.rtt,
          jitter: s.jitter,
          stalled: false,
          isRelay: s.isRelay,
          snapshotBytes: s.snapshotBytes,
          snapshotBytesMean: s.snapshotBytesMean,
          snapshotBytesMax: s.snapshotBytesMax,
          guestCount: s.guestCount,
          interpDelayFrames: delayFrames,
          bufferDepth: 0,
        });
      }

      this.ctx.gameLoop.renderFrame(dt);
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
}
