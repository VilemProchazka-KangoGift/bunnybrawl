# Worker offload — phase 7 sim-in-worker

**Branch:** `feat/worker-offload-experiment` · castle · 4 bots hard · 30 s
**Build:** `dist-perf` (sourcemaps), `npm run perf -- --arena=castle`

Aggressive offload mode behind `?simWorker=on`. The worker hosts the entire
GameLoop (Simulator + ParticleSystem + cosmetic systems + Renderer) and
drives its own RAF. Main becomes a thin shell:

- KeyboardManager (window listeners) on main, builds per-frame input
  batches sent to the worker via `host:engineInputBatch`
- AudioManager (Howler) on main, dispatched via worker→main
  `worker:engineEvent` messages (`sfx`, `musicStart`, etc.)
- Haptics on main, same event channel
- TouchInputManager on main when applicable; merged into the input batch
- 5Hz state mirror back to main for `__bunnyTest.state()` and pause UI

Bundle hygiene: GameLoop's main-only deps are aliased to worker-safe
stubs in `vite.config.ts > worker.plugins`:

| Module | Real (main) | Worker stub |
|---|---|---|
| `'howler'` | Howler.js | no-op Howl class |
| `audio` | AudioManager | posts `worker:engineEvent` |
| `haptics` | Vibration API | posts `worker:engineEvent` |
| `KeyboardManager` | window listeners | no-op (RemoteInput slots take over) |
| `touchDetect.isTouchPrimary` | matchMedia query | returns `false` |

GameLoop runs unchanged inside the worker — the stubs route its audio /
haptic / keyboard interactions to main where the real adapters live.
The worker uses `RemoteInput` adapters for human slots (the same
adapters online netcode uses) and reads from an input map filled by
`host:engineInputBatch` messages.

**Local play only** — online play stays on the renderer-only worker
because NetMatch's host/guest loops drive `gameLoop.fixedUpdate`
synchronously and a sim-async refactor of NetMatch is out of scope.

## Validated end-to-end

Loaded `?arena=castle&bots=2&killLimit=4&simWorker=on` via Playwright.
Match played to completion: bots fought, kills landed, victory screen
rendered with full statistics. Audio, haptics, and HUD all worked.
Phase change (loading → playing → over) flowed through the worker→main
event channel.

## Headline numbers

| Scenario | Main rAF | Main CPU/30s | Δ vs phase 6 (renderer-only worker) |
|---|---|---|---|
| A · simWorker on, no throttle | 18.0 ms (56 fps) | **106 ms** | -5% (within sample noise) |
| B · simWorker on, 4× CPU throttle | 17.9 ms (56 fps) | **2 597 ms** | -4% (within sample noise) |

For comparison — phase 6 numbers:

| Scenario | Main rAF | Main CPU/30s |
|---|---|---|
| A · worker on (renderer only) | 17.7 ms | 112 ms |
| B · worker off (no offload) | 6.3 ms | **2 039 ms** (38× phase-7 main!) |
| C · worker on, throttled | 17.9 ms | 2 715 ms |
| D · worker off, throttled | 32.0 ms | 4 990 ms |

## What this means

**Sim-in-worker is roughly neutral on main CPU vs the renderer-only
worker** (106 ms vs 112 ms — 5% delta is within sample noise). The big
win was always the renderer migration, which we already shipped.

Why no further main CPU reduction:

- `postMessage` cost is **per call, not per payload**. Eliminating the
  structured-clone of `MatchState` per frame (the renderer-only mode
  ships state every frame) replaces it with smaller per-frame input
  batches — but `~10µs of postMessage overhead × 60fps × 30s ≈ 18ms`
  regardless of payload size.
- Howler bookkeeping (`_ended`, `_clearTimer`, `_cleanBuffer`) is
  unchanged at ~12 ms / 30 s — it runs whether sound plays or not.
- Simulator on main was already cheap (~3-5 ms of the 112 ms total).
  Removing it saves only what it cost.

What sim-in-worker DOES buy:

1. **Architectural separation.** Sim now runs at exact 60Hz inside the
   worker, immune to main-thread jank. If the future workload pushes
   main into stutter (React re-renders, network bursts, audio decoding),
   the simulation timing stays unaffected.
2. **Future scaling**. Adding more sim work (more bots, richer AI,
   physics changes) doesn't push main toward saturation.
3. **MatchState eliminated from the wire.** Per-frame postMessage
   payload shrinks from ~600 fields to ~5 input booleans per slot. The
   browser may handle this differently in the long run (large structured-
   clones occasionally GC, small ones don't).
4. **Harness still measures both modes the same way** — vsync-paced
   rAF with worker render time captured per-frame inside the worker.

## Verdict

Sim-in-worker is **shippable behind `?simWorker=on`** as an opt-in for
players experiencing main-thread jank from React UI / audio / network
bursts. Default-off because:

- No measurable improvement on the perf harness for the current workload.
- Local-only — online play falls back to renderer-only worker.
- Adds complexity (engine event protocol, worker stubs, state mirror).

The renderer-only worker (`?worker=on`, default ON) remains the
production default. It captured 95% of the available main-thread savings
(2 039 → 112 ms = 18× reduction) at 5% of the integration risk.

**Promote sim-in-worker to default-on if/when**:
- Future renderer features add noticeable main-thread cost (e.g.
  L4/L5 lighting, more cosmetic systems, third-party UI)
- Real-device telemetry shows sustained main-thread saturation that
  the renderer-only mode doesn't fix
- Online play's NetMatch is refactored to support async `fixedUpdate`,
  unlocking sim-worker for online too

## Files

- `A-simworker-on.md` · perf with sim+render in worker
- `B-simworker-on-throttled.md` · same with 4× CPU throttle
- `*-stats.json` · histogram + section timings + compositor pacing

## What's deferred

Three follow-ups identified during this work that didn't ship:

1. **Input-batch deduplication on main.** Currently posts a batch every
   main-rAF (60Hz). Inputs change far less often (~5-20 Hz). Comparing
   the new batch to the previous and only posting on diff would cut
   postMessage count 3-10×. Concrete next-step.
2. **NetMatch async fixedUpdate.** Required to support sim-in-worker
   for online play. ~1-2 day refactor of HostLoop / GuestLoop /
   ReconnectController.
3. **Howler bookkeeping audit.** ~12 ms / 30 s consumed by
   `_ended / _clearTimer / _cleanBuffer` even at idle. Investigate
   whether to suspend Howler timers during silent stretches or migrate
   to a leaner audio runtime.
