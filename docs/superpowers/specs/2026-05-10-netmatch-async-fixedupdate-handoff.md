# NetMatch async fixedUpdate — handoff

**Date:** 2026-05-10
**Status:** Design only. Not implemented.
**Goal:** Unlock sim-in-worker (`?simWorker=on`) for online play. Today
the flag is local-only because NetMatch's host/guest loops drive
`gameLoop.fixedUpdate` synchronously and then read state synchronously
to broadcast.

## Current architecture (sync sim on main)

`net/netMatch/HostLoop.ts`:
```
hostLoop = (now) => {
  // 1. read inputs (own from KeyboardManager, guests from HostAuthority ring)
  // 2. accumulator → run gameLoop.fixedUpdate(dt, networkInputs)
  // 3. read state synchronously
  // 4. hostAuthority.broadcastSnapshot(state)  ← encodes + sends via transport
  // 5. gameLoop.cosmeticStep(dt) + renderFrame
}
```

`net/netMatch/GuestLoop.ts`:
```
guestLoop = (now) => {
  // 1. read local input (KeyboardManager + touch)
  // 2. send via transport.sendUnreliable
  // 3. apply latest snapshot (interpolation) into local state
  // 4. cosmeticStep + renderFrame
}
```

## Target architecture (sim in worker, online)

The simulation lives entirely in the worker. Main is the I/O hub.

```
Worker:
  Simulator + ParticleSystem + cosmetic systems + Renderer + own RAF
  receives: input batches (own + guest, via main's HostAuthority)
  emits:    encoded snapshot ArrayBuffer (host) / sim events / state mirror

Main (host):
  KeyboardManager + AudioManager + transport (Trystero)
  HostAuthority — owns input ring, RTT-based broadcast tier, ACK promotion
  Per main rAF:
    - merge own keyboard + queued guest inputs into a per-slot map
    - post host:engineInputBatch to worker (keep dedup)
  Receives from worker:
    - worker:engineEvent → audio/haptic dispatch
    - worker:engineSnapshot { buffer: Transferable } → transport.sendUnreliable

Main (guest):
  KeyboardManager + AudioManager + transport
  receive snapshot from transport → post host:engineSnapshotApply { buffer }
  worker decodes + applies + interpolates internally
```

## Why this is hard

1. **HostAuthority owns input ring + RTT measurement on main.** Today
   `gameLoop.fixedUpdate` reads from `hostAuthority.getNetworkInputs()`
   each tick. With sim-async, the input ring stays on main but main
   posts a snapshot of it to the worker each tick.

2. **Broadcast cadence is per-tick.** Today the host broadcasts after
   every fixedUpdate (60 Hz). With sim in worker, the worker would
   need to emit the encoded snapshot after each fixedUpdate. Either
   the worker calls a `transport.send` shim (one extra postMessage hop)
   or batches snapshots at lower frequency (~30 Hz).

3. **Snapshot encoding lives in `net/snapshot/binaryCodec.ts`** — pure,
   already worker-safe. Move the `encodeSnapshot()` call to the worker.
   Decode also moves. The codec module is already `engine-pure`.

4. **Reconnect/disconnect handling** runs on main (transport-driven).
   The worker stays oblivious to peer lifecycle; main posts
   `host:engineGuestConnected` / `host:engineGuestDisconnected` and the
   worker updates its `disconnectedSlots` tracking.

5. **Loading handshake** (LOADING_TIMEOUT_MS, LOADED messages) is
   transport-orchestrated on main. Worker just sets phase based on
   `host:engineSetPhase`.

6. **Input echo system** for guest visual responsiveness — currently
   in `net/inputEcho.ts`, runs on main against the guest's mirror of
   their player. Move into the worker, or keep on main and have main
   apply visual overrides on the rendered output (worker emits state
   mirror; main writes echo on top via a separate canvas).

## Recommended sequence (~1-2 days)

1. **Extract `HostAuthority` interaction.** Today `gameLoop.fixedUpdate`
   reads the input ring synchronously. Refactor so the host's per-rAF
   loop builds a `Map<slot, InputState>` once per tick (already does
   for `getNetworkInputs`) and posts it as `host:engineInputBatch`.
   Same wire format the local sim-worker mode uses.

2. **Move snapshot encode to worker.** Worker calls `encodeSnapshot()`
   after each fixedUpdate, posts the `ArrayBuffer` (Transferable) to
   main as `worker:engineSnapshot`. Main calls
   `transport.sendUnreliable(buffer)`. Snapshot ack handling stays on
   main as a transport-level concern.

3. **Move snapshot decode/apply to worker (guest).** Main receives the
   snapshot from transport, posts `host:engineSnapshotApply { buffer }`
   to the worker. Worker decodes + runs interpolation + applies to
   state. Adaptive delay tracking moves with it.

4. **Wire disconnect/reconnect events.** Add
   `host:engineGuestDisconnected { slot }` and `…Reconnected { slot }`
   messages. Worker calls existing `simulator.disconnectPlayer(slot)`
   etc.

5. **Refactor NetMatch's HostLoop / GuestLoop** to be sim-async aware.
   Both lose the `gameLoop.fixedUpdate` call; main's loop becomes
   "post inputs + receive worker snapshots". The 60 Hz cadence is
   driven by the worker's own RAF; main is a flat I/O loop.

6. **Smoke test** with `?simLatency=80&simJitter=20&simLoss=5`.
   Verify guest sees host moves correctly, ACKs flow, RECONNECT_REQUEST
   round-trips.

## What can ship without #1-6

The current state ships sim-in-worker for **local play only**. Online
play uses the renderer-only worker (which is default-on and works
identically to the renderer-only baseline for sim purposes).

The net win of the sim-in-worker refactor for online is small (sim is
already cheap, ~5ms/30s on main). The bigger wins are architectural:

- One-place truth for sim timing (worker's RAF, no main-thread interruption)
- Easier to add features that grow main-thread cost without affecting sim
- Eventual path to default-on for everyone

## Estimate

~1-2 focused days for someone who knows the netcode. Risk: medium —
the input fairness delay timing is the subtlest part of the netcode
and breaking it would cause user-visible jitter.

## Decisions locked at planning time (2026-05-10)

These ADRs were chosen before any Phase 2 code was written, so the
implementation can't drift away from the agreed boundaries. Each option
considered is captured for future readers.

### ADR.1 — Snapshot encode location

**Chosen: A.** Worker encodes after each `fixedUpdate`, posts ArrayBuffer
to main via `worker:netSnapshot { buffer, frame }`, main hands the buffer
to `transport.sendUnreliable` (or `hostAuthority.broadcastEncodedSnapshot`
which respects per-peer broadcast tier).

Rejected: B (main encodes after a state-mirror message arrives). Adds
~16ms one-frame latency, doubles state-mirror traffic, and breaks the
host's existing 60Hz broadcast cadence.

### ADR.2 — Snapshot decode location (guest)

**Chosen: A.** Worker decodes + interpolates + applies. Main only
forwards the buffer via `host:netSnapshotApply { buffer }` (transferable).
The `EntityInterpolation` ring + `decodeSnapshot` pool live in the worker.

Rejected: B (main decodes, posts the structured-cloned `AuthSnapshot` to
worker). Pays the clone twice and orphans interpolation timing from the
sim that consumes it.

### ADR.3 — Input fairness ring location

**Chosen: A.** `HostLoop` on main keeps the input ring + `delayFrames` +
RTT-derived adaptation verbatim. Each tick main posts the *already
delayed* per-slot input map as `host:engineInputBatch` (same wire format
as Phase 1's local sim-in-worker). Worker is oblivious to fairness.

Rejected: B (move the ring to the worker). Saves one postMessage per
tick but introduces a second source of truth for `delayFrames` against
the RTT measured on main. The risk vs the 0.5ms/tick saving isn't
justified — the input-fairness math is the subtlest piece of the
netcode per the handoff's own risk callout.

### ADR.4 — Transport location

**Chosen: A.** Trystero + WebRTC + MQTT signaling stay entirely on
main. Worker emits encoded snapshots; main pumps them into
`transport.sendUnreliable` / receives via the existing handlers and
forwards buffers to the worker via `host:netSnapshotApply`.

Rejected: B (move Transport to a SharedWorker / dedicated transport
worker). Trystero, MQTT, and WebRTC code paths can't migrate into a
worker without a port-relay refactor that's out of Phase 2 scope. Also
gated on `crossOriginIsolated` which GitHub Pages can't provide.

### ADR.5 — Sim-in-worker is the only Phase 2 mode

**Chosen.** Phase 2 wires `?simWorker=on` for online. The renderer-only
worker path (default, `?worker=on`) stays on the Phase 1 architecture
where main runs the simulation. Both paths coexist via the
`NetMatchDriver.isRemoteSim()` discriminator.

Rationale: pulling the renderer-only path through the same async
refactor would force every `HostLoop` / `GuestLoop` deviation onto an
identical seam — but main already runs the sim there cheaply (~5ms/30s
per the netmatch handoff), so the architectural win has no perf payoff
on that path.
