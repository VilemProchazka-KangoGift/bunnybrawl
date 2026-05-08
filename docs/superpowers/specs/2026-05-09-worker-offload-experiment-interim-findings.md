# Worker offload experiment — interim findings + phase 3 handoff

**Date:** 2026-05-09
**Branch:** `feat/worker-offload-experiment` (worktree at `.worktrees/worker-offload`)
**Phases complete:** 0, 1, 2. **Phase 3 not started — read this first.**
**Status:** Material finding from phase 2 changes the experiment's ROI math. Recommend re-evaluating before committing the ~10h needed for phase 3.

---

## TL;DR

The brainstorm-prep doc estimated ~5ms of main-thread budget recovery from moving sim + render to a worker. Phase 2 of this worktree wired a minimal worker (just paints a 160×90 colored rect, no real work) into Match.tsx via a `?workerSmoke=1` URL gate, and the result was **a ~1ms regression on castle's main-thread rAF cadence** — purely from the compositor having a second worker-owned canvas in the DOM tree.

**Implication:** the realistic win from a full sim+render migration is closer to 3-4ms, not 5ms. Combined with:
- castle is already at 6.4ms baseline (already meets the original ≤7ms success bar — see `perf-runs/worker-experiment/baseline/REPORT.md`)
- phase 3 is ~10h of dangerous refactor (state-mirror protocol, SimulatorEvents bridge, KeyboardManager round-trip, debug bridge rebuild, full E2E retest)
- audio jitter / DX regression / first-frame TTI risks documented in the prep doc are still on the table

…the case for going further is weaker than when the prep doc was written. **The prep doc's "considered, deferred" outcome is the most likely landing place.**

This doc captures what was built, what was learned, and a phase 3 implementation plan that incorporates the discovered constraints — so a future session can resume with full ground truth.

---

## What was built

### Phase 0 — baseline (committed)

`perf-runs/worker-experiment/baseline/REPORT.md` — 3 castle perf runs at branch HEAD (= main + experiment plan doc).

**Key numbers:**
- castle avg 6.4ms / p99 14.7ms / long>33ms 0/600
- **Already meets** the prep doc's original success bar of ≤7ms avg / ≤20ms p99
- Down from `perf-runs/post-l2/REPORT.md` (11.6ms avg / 38.8ms p99 / 14 long) — recovered by recent perf commits (confetti, weather, wildlife batching)

The original "5ms banked" justification is not currently observable in headline numbers because castle has already absorbed that budget through other optimizations.

### Phase 1 — worker scaffold (committed `c40fe35`)

`src/engine/worker/`:
- `messages.ts` — `HostInitMsg`, `HostStopMsg`, `WorkerReadyMsg`, `WorkerErrorMsg` wire types
- `renderWorker.ts` — module worker entry. Receives transferred OffscreenCanvas, draws colored-rect placeholder via own RAF
- `workerHost.ts` — main-thread `WorkerHost` class wrapping `new Worker(new URL(...), { type: 'module' })` + the transferControlToOffscreen postMessage protocol
- `workerFlag.ts` — `?worker=off` URL kill switch + `carrotroyale_worker` localStorage. Pattern: `createEmitter` from `engine/emitter.ts`, `safeStorage` from `src/storage.ts` — matches `perfFlags.ts`
- `__tests__/worker-bundle-no-main-deps.test.ts` — static-import walker checking the worker entry's transitive imports do not touch `react`, `howler`, `trystero`, `i18next`, etc. **Add new forbidden modules here as the worker grows.**
- `__tests__/workerHost.test.ts` — Worker constructor mocked, exercises message protocol + dispose semantics
- `__tests__/workerFlag.test.ts` — URL parsing + emitter behaviour

**Vite worker config:** none needed. The default `new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })` form Just Works. Production build emits a 794-byte separate worker chunk (`dist/assets/renderWorker-*.js`).

### Phase 2 — Match.tsx wiring + smoke E2E (committed)

- `src/components/match/WorkerSmoke.tsx` — small React component that mounts a 160×90 corner overlay canvas, transfers it to WorkerHost. Sets `data-ready="1"` on `[data-testid="worker-smoke"]` once the worker reports `worker:ready`, propagates errors via `data-error`.
- `src/components/Match.tsx` — gated render `{isWorkerSmokeRequested() && <WorkerSmoke />}`. Activated by `?workerSmoke=1`. Zero cost when not requested.
- `e2e/worker-smoke.spec.ts` — loads with `?workerSmoke=1&arena=meadow&bots=2`, asserts ready, asserts canvas isn't blank (via `toDataURL().length`), asserts no page errors. Passes (3.8s).
- `perf-runs/worker-experiment/phase2-smoke/REPORT.md` — castle perf with smoke active. **The headline finding.**

---

## The headline finding

Castle perf, 3 runs each, sequential, same machine, same commit:

|  | baseline (no worker) | phase 2 smoke (160×90 worker overlay, no real work) | Δ |
|---|---|---|---|
| avg | 6.4 | 7.4 | **+1.0ms** |
| p99 | 14.7 | 17.5 | **+2.8ms** |
| long>16.67ms | 0/600 | 9/600 | **+9** |
| long>33ms | 0/600 | 0/600 (run 3 saw 2) | borderline |

The smoke worker is doing **strictly less than baseline** — main thread paints the same game canvases as before, the worker paints a tiny separate canvas with a `fillStyle = hsl(...)` rect at 60fps. Yet main-thread rAF cadence is consistently slower.

**Why:** the `rAF` cadence measurement on this perf harness includes Chromium compositor time. Adding a second OffscreenCanvas-backed DOM layer means the compositor has more work to merge per frame, even when that layer's content is trivial. In addition, postMessage IPC + worker thread scheduling adds non-zero overhead even for an idle worker.

**Generalizing:** any phase 3 architecture that puts a worker-owned canvas in the same DOM tree as the existing canvases pays this floor. The savings have to clear the floor *before* they show up as a recovered ms.

This is **not** in the prep doc's risk section. It should be added.

---

## Revised success bar

Original (from prep doc): castle main-thread rAF 11.6ms → ≤7ms (recovers ≥4ms).
Already met by baseline alone (no worker change required).

After phase 2 finding, the realistic bar for phase 3 to clear, accounting for the worker-overhead floor:

- **Castle main-thread rAF avg ≤4.0ms** (recovers ≥2.4ms vs baseline)
- **Castle p99 ≤8ms** (recovers ≥6.7ms vs baseline)
- **No new long>33ms frames** vs baseline

If phase 3 lands those numbers, the worker offload is a clear win for L3/L4/L5 lighting headroom. Below those, the cost (DX regression, audio jitter risk, debug bridge complexity) outweighs the benefit and the right call is to keep the architecture and revisit in 6 months when budget pressure actually returns.

---

## Why the smoke result might *understate* phase 3

Counter-arguments to the pessimistic read:

1. **Phase 3 removes the *original* main-thread render work.** Phase 2 added a worker-owned canvas without removing anything; phase 3 replaces fgCanvas's draw work (currently main) with worker draw work. Main thread is doing strictly less, not strictly more.
2. **Compositor overhead is paid once, not per canvas.** A single transferred fgCanvas in the worker has the same compositor cost whether the worker draws a rect or a full game scene. The cost we measured is the floor for "a transferred canvas exists"; it doesn't scale with workload.
3. **Long-tail wins.** Even if avg is similar, the p99 / long-frame counts may improve dramatically because main thread is now mostly idle and Chromium has free cycles to handle GC, layout, audio decoding without bumping into game-tick deadlines.

Plausible phase 3 outcomes, given the floor:
- **Best case:** main rAF 2.5-3.0ms avg, p99 6-8ms, near-zero long frames. Headroom for L3/L4/L5 is unlocked. Clear go.
- **Median case:** main rAF 4-5ms avg, p99 10-14ms. Modest win. Worth landing if DX cost is manageable.
- **Worst case:** main rAF ~6-7ms (no win because compositor floor + state-mirror cost ~= saved render work). Clear no-go. Ship the experiment as a "considered, deferred" record.

The phase 2 number alone doesn't pick between these. **The only way to find out is to do phase 3.** This handoff doc exists so the next session goes in with eyes open about both the upside and the floor.

---

## Phase 3 implementation plan (refined)

If you decide to proceed, here is the concrete plan, pre-fleshed with answers to the design questions phase 2 surfaced.

### Architecture

```
Main thread:                          Worker:
  React (menus, modals, victory)        Simulator (state + systems)
  KeyboardManager (window listeners)    Renderer (Canvas 2D draw calls)
  TouchInputManager                     ParticleSystem + cosmetic systems
  AudioManager (Howler)                 RAF loop
  WebRTC transport (kept on main)       OffscreenCanvas refs (transferred)
  DOM HUD overlays (HUD canvas)
  Debug bridge (state mirror)

  Main → worker (postMessage):           Worker → main (postMessage):
   • host:init        (canvas transfer)   • worker:ready
   • host:tick        (input batch)       • worker:sfx       (audio request)
   • host:pause                           • worker:phase     (loading→playing)
   • host:resume                          • worker:matchEnd
   • host:switchArena                     • worker:landing   (haptic)
   • host:netSnapshot (guest snapshot)    • worker:state     (mirror, every tick)
   • host:netInputs   (host's input buf)  • worker:netSnapshot (host broadcast bytes)
```

### DOM-API audit (done in this session)

Quick static audit of `engine/` for `document.*`, `window.*`, `new Image`, `navigator.*`. Findings:

| Location | Usage | Worker-safe? |
|---|---|---|
| `Renderer` field types (`bgCanvas: HTMLCanvasElement` etc.) | Public API only — internally everything flows through `Ctx2D = CanvasRenderingContext2D \| OffscreenCanvasRenderingContext2D` | **Genericize** to `HTMLCanvasElement \| OffscreenCanvas` for phase 3 |
| `arenas/packs/spaceStation.ts:775`, `rendering/hazards/creatures.ts:49`, `rendering/hazards/zones.ts:71/87/144/237/250` | `useOffscreen ? new OffscreenCanvas(...) : document.createElement('canvas')` jsdom-test fallback | **Worker-safe** at runtime — OffscreenCanvas branch always taken in worker. The `document` ref is dead code there. |
| `audio/AudioManager.ts`, `net/transport.ts`, `net/netMatch/NetMatch.ts` | `document.addEventListener('visibilitychange')` | Stays on main thread (audio + transport stay on main) |
| `gameLoop/GameLoop.ts:230` | `document.querySelector('.game-scaler-content')` for fullscreen detection | Stays on main (GameLoop becomes adapter; query moves to Match.tsx if needed) |
| `renderScale.ts` | `window.matchMedia`, `document.addEventListener('fullscreenchange')` | Stays on main; render scale broadcast to worker via host:setRenderScale message |
| `touchInput.ts`, `touchDetect.ts` | DOM touch events, `window.matchMedia('(pointer: coarse)')` | Stays on main; TouchInputManager forwards InputState to worker via host:tick |
| `debugFlags.ts:3` (comment), `net/transport.ts:21` | `window.location.search` parsing | Stays on main (URL params parsed at app startup); worker receives flags via init message |

**Conclusion: no engine code requires DOM-specific APIs in render paths.** The `Ctx2D` alias has already done most of the work. The public Renderer constructor's `HTMLCanvasElement` typing is the only mechanical change needed in `rendering/`. Other DOM usage is concentrated in main-only modules (audio, transport, touch, render-scale) that stay on main as adapters.

This is a green light for phase 3 from the architectural side — no hidden landmines in the engine. The remaining risk is mostly in the message-protocol design and the per-frame state-snapshot codec.

### Phase 3 task list

Each task is independently committable.

1. **Move Renderer's canvas types from `HTMLCanvasElement` to `HTMLCanvasElement | OffscreenCanvas`.** The audit above confirms this is the only mechanical change in `engine/rendering/`. Public Renderer constructor + all field declarations + the bg/fg/hud/bgNight/light canvas refs.
2. **Create `src/engine/worker/renderHarness.ts`** — instantiates Renderer in worker scope using transferred OffscreenCanvas refs. No simulator yet; main posts state snapshots per frame.
3. **State snapshot codec.** `MatchState` + `Particle[]` + `Gib[]` per frame is too big for structured-clone at 60Hz (estimated ~24KB/frame, ~200µs cost). Reuse `net/snapshot.ts` codec where it covers the wire-needed fields; extend with a separate "render-extras" Float32Array for fields outside `WirePlayer` (cosmetic timers, anchors, idle state). Don't build this on hot-path postMessage; use a pre-allocated transferable `Uint8Array` + `Float32Array` pair, swap them in/out via the transfer list.
4. **Move Simulator into worker** — `src/engine/worker/simHarness.ts`. Imports `Simulator` from `engine/simulator/`. KeyboardManager stays on main; main posts `host:tick` per frame with the per-slot InputState[]. Worker's RAF drives `simulator.fixedUpdate(dt)` then renders.
5. **SimulatorEvents → postMessage bridge.** `WorkerHost` constructor now subscribes to `worker:sfx`, `worker:phase`, etc. Wire to `audio.play(name)` and the existing GameLoop callbacks. Per-event postMessage is the simplest contract; revisit only if measured to matter.
6. **State mirror.** Every tick (NOT every frame — 60Hz-vs-30Hz mismatch with cosmetic step is fine), worker posts a compact state digest via Transferable to main. Main exposes `window.__bunnyTest.state()` from the mirror. Audit every `__bunnyTest` field consumer for required completeness; the digest must include at least: `phase`, `countdown`, `timeElapsed`, `players[].state/x/y/score/active`, `matchOver`, `winner`, `killFeed`, `stats.perPlayer`, plus arena ID. Anything an E2E test reads must be in the digest.
7. **Pause / resume / match-end / arena-switch protocol.** Each is a one-message round-trip. React lifecycle on main posts; worker handles inline. Match.tsx's existing setOnPhaseChange wires to `worker:phase`.
8. **Networking (host).** Host's WebRTC datachannel stays on main (Trystero handles). Worker's `worker:netSnapshot` posts the binary snapshot bytes; main forwards via `transport.sendUnreliable`. Inbound (from peers) goes the other way: main receives snapshot via transport, posts `host:netSnapshot` to worker, worker applies via `applySnapshotToState`. The host input fairness ring lives in worker; main posts `host:netInputs` with the latest guest input buffer when it changes.
9. **Networking (guest).** Same shape. Guest's `applySnapshotToState` runs in worker; main forwards inbound transport messages.
10. **Worker-bundle import audit.** After phase 3 lands, `worker-bundle-no-main-deps.test.ts` must still pass. The forbidden list will need `react`, `react-dom`, `@vitejs/plugin-react`, `howler`, `trystero`, `@trystero-p2p/mqtt`, `i18next`, `react-i18next`, `zustand` to all stay out — and the worker will have pulled in a much larger dep graph (Simulator, Renderer, all systems). The walker test should report the visited count as ~150-300 files for sanity.
11. **Kill switch (`?worker=off`).** Match.tsx branches: when `isWorkerEnabled() === false`, fall back to the existing main-thread GameLoop path. Both paths must coexist for ~2 weeks of soak time before the main-thread path is removed.
12. **`?workerSmoke=1` removed.** Phase 2 smoke gate is no longer useful once phase 3 wires the real path.
13. **E2E suite.** Run full `npm test` + `npm run test:e2e` on both `?worker=on` (default) and `?worker=off` paths. State-mirror staleness <100ms must not break `waitForFunction` polls; if it does, mirror at higher frequency or batch.
14. **Final perf checkpoint.** 3 runs castle on/off worker. Save to `perf-runs/worker-experiment/phase3/REPORT.md`. Compare to baseline + phase 2 smoke.

### Phase 3 risks to monitor

- **State mirror cost.** If posting a small Float32Array per tick costs more than ~100µs structured-clone cycle, the mirror itself eats the win. Mitigate: use Transferable, pre-allocate, swap pointers (worker keeps two and ships them in alternation).
- **Audio jitter on stomp combos.** Per-event postMessage from worker has main-thread queueing latency. If perceptible (<20ms variance is fine, >40ms is bad), fast-path stomp/jump SFX events with their own immediate-flush mechanism.
- **`?debug=perffps` instrumentation.** `perfTrace.measure()` and `fpsCounter` currently sit on main. With work moved to worker, the traces from the worker need to reach the fpsCounter draw on main. Either: (a) ship perfTrace samples in the state mirror; (b) accept that the perf overlay only shows main-thread time (which is actually what we want measured anyway).
- **First-frame TTI on rematch.** Each match cold-starts the worker (~50-100ms). Keep the worker alive across matches; reset state via `host:switchArena` rather than `terminate + new Worker()`.
- **Long-frame surfacing.** The current perfTrace `long>33ms` counter only sees main-thread time. With sim in worker, a worker-side hitch wouldn't register. Add a `worker:longTask` event that posts the duration when the worker's RAF interval exceeds 33ms.

### Phase 3 estimated effort

- Tasks 1-3 (Renderer in worker, no sim): 4h. This is "phase 2 from the original plan" — moves the render work but state still on main.
- Tasks 4-7 (sim in worker): 6-8h. This is the production-shaped sim migration.
- Task 8-9 (networking): 4h. Defer if phase 3 numbers don't meet the bar.
- Tasks 10-14 (audit + E2E + perf + cleanup): 4h.

**Total: 18-20h for the full production-shaped phase 3.** Without networking: 14-16h.

---

## Recommendation

Before committing more time, **decide which of these you want**:

(a) **Land it green.** Reserve a 3-4 day window. Do tasks 1-7 first (sim+render in worker, no networking yet). Run perf at the end of task 3 (renderer-only) and task 7 (sim+renderer). If task 7 numbers clear the revised bar (≤4ms avg, ≤8ms p99), continue with networking + cleanup. Otherwise stop and ship as "considered, deferred".

(b) **Spike-and-decide.** Reserve a 1-day window. Do tasks 1-3 only (renderer-only in worker, sim still on main). State snapshot per frame via simple structured-clone. This is the cheapest way to measure whether the compositor floor + postMessage cost lets renderer-in-worker even break even. If yes, plan a follow-up 2-day session for the sim migration. If no, file as deferred with the spike data.

(c) **Defer entirely.** This worktree's findings (baseline already meets original bar; +1ms compositor floor for trivial worker; ongoing maintenance cost) are sufficient to justify "considered, deferred". The branch stays as a record. Lighting program (L3/L4/L5) lands without worker offload; if budget pressure returns and L4/L5 push castle past 12ms, this experiment is the starting point for the rewrite.

**My recommendation: (b).** Renderer-only phase 3 spike is the cheapest decisive measurement. The full sim+render production refactor is high-risk autonomous work; do it deliberately with one eye on the perf number after each commit, not in a single sleep-aided push.

---

## Files / commits in this worktree

```
docs/superpowers/specs/2026-05-08-worker-offload-experiment-plan.md      (initial plan)
docs/superpowers/specs/2026-05-09-worker-offload-experiment-interim-findings.md  (this doc)
src/engine/worker/                                                       (phase 1 scaffold)
src/components/match/WorkerSmoke.tsx                                     (phase 2 smoke)
e2e/worker-smoke.spec.ts                                                 (phase 2 smoke E2E)
perf-runs/worker-experiment/baseline/                                    (phase 0)
perf-runs/worker-experiment/phase2-smoke/                                (phase 2)
```

Commits, in order:
- `4b2f496` — `docs: worker offload experiment plan` (also on main)
- `c40fe35` — `feat(worker): phase 1 scaffold` (worker entry, host bridge, kill switch, bundle regression test)
- (next, after this commit) — `feat(worker): phase 2 smoke` (Match.tsx wiring + E2E + phase 2 perf)
- (next) — `docs: phase 3 handoff with phase 2 findings` (this doc)
