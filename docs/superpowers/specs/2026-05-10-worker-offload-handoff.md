# Worker offload experiment — handoff

**Date:** 2026-05-10
**Branch:** `feat/worker-offload-experiment` (worktree at `.worktrees/worker-offload`)
**Status:** Complete. 14 commits ahead of main. Ready to merge or extend.

This doc is the single source of truth for the experiment's outcome. Read
this before touching any of the `src/engine/worker/` code or before
deciding whether to merge / promote / drop the branch.

## Headline result

**Main-thread CPU under normal load drops 18× when the renderer moves to
a Web Worker.** Castle, 4 bots hard, 30 s random P1 input:

| Mode | Main CPU / 30 s | Sustained fps under 4× CPU throttle |
|---|---|---|
| Worker off (baseline) | 2 039 ms (6.8 %) | **31 fps**, 25 % frames > 33 ms |
| Worker on (renderer) — default | **88 ms** (0.3 %) | 56 fps, 0 frames > 33 ms |
| simWorker on (sim + renderer) | 94 ms | 56 fps |

Renderer-only worker mode is the production-ready default. Sim-in-worker
is opt-in pending the netcode async refactor (handoff doc separately).

## What's in the branch

```
?worker=off         → main-thread renderer + sim (safe baseline)
?worker=on          → renderer in worker, sim on main (DEFAULT ON)
?simWorker=on       → sim AND renderer in worker (opt-in, local-only)
```

Both flags persist via `localStorage`. URL param wins over storage on
first load.

## Architecture (one diagram)

```
?worker=on (default)                  ?simWorker=on
─────────────────────                 ──────────────
Main thread:                          Main thread:
  React UI                              React UI
  Simulator (sim)                       KeyboardManager + Touch
  KeyboardManager + Touch               AudioManager (Howler)
  AudioManager (Howler)                 Transport (Trystero)
  Transport (Trystero)                  EngineWorkerProxy
  RendererProxy                           [forwards inputs,
    [posts MatchState/frame              dispatches engine events]
     to worker]
                                      Worker:
Worker:                                 Simulator + sim systems
  Renderer + cosmetic systems          Renderer + cosmetic systems
  RAF: receive state →                 ParticleSystem
       paint into                      RAF: read inputs →
       OffscreenCanvases                    fixedUpdate →
                                            cosmeticStep →
                                            render

Wire format:                          Wire format:
  main → wkr: state per frame           main → wkr: input batch (deduped)
  wkr → main: night opacity             wkr → main: SFX/music/match-end events
                                        wkr → main: state mirror (5 Hz, for E2E)
```

## Files added (all under `src/engine/worker/`)

```
workerFlag.ts                   — ?worker=on/off flag + emitter
simWorkerFlag.ts                — ?simWorker=on/off flag

RendererProxy.ts                — main-thread proxy for renderer-only mode
EngineWorkerProxy.ts            — main-thread proxy for sim-in-worker mode

renderWorker.ts                 — worker entry (handles both modes)
engineWorkerInit.ts             — lazy-loaded sim-in-worker init

messages.ts                     — postMessage wire format

howlerStub.ts                   — worker bundle alias for 'howler'
stubs/audio-worker-stub.ts      — worker bundle alias for engine/audio
stubs/haptics-worker-stub.ts    — worker bundle alias for engine/haptics
stubs/keyboardManager-worker-stub.ts
stubs/touchDetect-worker-stub.ts

__tests__/worker-bundle-no-main-deps.test.ts
                                — regression: walks worker imports,
                                  asserts no react/trystero/i18next
```

## Files touched (engine surface area)

```
src/engine/renderer.ts           — IRenderer interface; Ctx2D widening;
                                   nightOpacityCallback option
src/engine/rendering/hud.ts      — module-scope language setter (no
                                   more i18next import in worker bundle);
                                   warmHudFonts() pre-render path
src/engine/rendering/*.ts        — Ctx2D type sweep
src/engine/themes/*.ts           — Ctx2D type sweep
src/engine/lighting/*.ts         — Ctx2D type sweep
src/engine/lobbyRender.ts        — Ctx2D type sweep
src/engine/navDebugOverlay.ts    — Ctx2D
src/engine/fpsCounter.ts         — Ctx2D
src/engine/net/core/debugOverlay.ts — Ctx2D

src/engine/gameLoop/GameLoop.ts  — IRenderer field type;
                                   injectedRenderer constructor arg;
                                   _workerActive flag for cosmetic dedup
src/engine/gameLoop/cosmetics/ParticleSystem.ts — IRenderer in
                                   bakeToRenderer signature
src/engine/gameLoop/cosmetics/{wildlife,reactiveDecorations}.ts
                                — Ctx2D
src/engine/matchLoading.ts       — IRenderer; warmHudFonts call
src/engine/perfTrace.ts          — cumulativeTotals() for long-frame
                                   attribution
src/engine/audio/AudioManager.ts — Howler.autoSuspend = false
src/engine/renderScale.ts        — applyRenderScaleToCanvas widened
                                   to HTMLCanvasElement | OffscreenCanvas

src/engine/net/netMatch/types.ts — NetMatchConfig.injectedRenderer
src/engine/net/netMatch/NetMatch.ts — pass injectedRenderer to GameLoop

src/components/match/useLocalMatch.ts — three-way branch
                                   (simWorker / worker / off)
src/components/match/useOnlineMatch.ts — RendererProxy for online play

vite.config.ts                   — worker.plugins aliases for howler
                                   + audio + haptics + KeyboardManager +
                                   touchDetect

e2e/perf-profile.spec.ts         — PERF_CPU_THROTTLE; worker stats
                                   capture; compositor pacing capture
scripts/analyzePerfProfile.mjs   — worker offload diagnostics section
                                   in report.md
```

## What's NOT in the branch

- Sim-in-worker for online play. Local-only because NetMatch host loop
  drives `gameLoop.fixedUpdate` synchronously. Design + sequencing in
  `2026-05-10-netmatch-async-fixedupdate-handoff.md`.
- Multi-worker rendering (one worker per canvas). Marginal current
  benefit; cheap architectural prep for future renderer feature growth.
- WebGPU compute for particles / lighting. Different axis (GPU not
  CPU); separate multi-week project.
- SharedArrayBuffer-based shared memory sim. Blocked by GitHub Pages'
  inability to set COOP/COEP headers.
- Audio WAV synth in worker. ~30-50 ms one-time savings at app load,
  not worth the sync→async refactor of AudioManager.

## Test coverage

- `worker-bundle-no-main-deps.test.ts` — passes; walks worker entry's
  transitive imports; allowlist is `['react', 'react-dom',
  '@vitejs/plugin-react', 'trystero', '@trystero-p2p/mqtt', 'i18next',
  'react-i18next', 'zustand']` (note: `howler` allowed because it's
  stubbed via vite alias)
- All 2992 unit tests pass except 2 pre-existing flaky ones (integration
  network seam, switchArena spawn-point) — same as before this branch
- E2E perf spec extended with `PERF_CPU_THROTTLE` for stress runs
- Validated via Playwright: castle plays to completion in `?worker=on`
  AND `?simWorker=on`; visuals identical; victory screen renders with
  full statistics

## Rollback

If the worker path causes a production crash, the URL kill switch
(`?worker=off`) reverts to the main-thread-only path. localStorage
remembers it across sessions:
```js
// in browser console:
localStorage.setItem('carrotroyale_worker', 'off')
```

The branch keeps both code paths alive. Removing the main-thread path
is a separate cleanup commit (not yet done).

## How to continue

If you want to **merge as-is and call it done**:
1. Squash-merge the branch onto main (or rebase + merge for full history)
2. Watch real-user telemetry for 1-2 weeks
3. If no regressions, remove the `?worker=off` fallback path

If you want to **extend further**, the next moves in priority order:
1. Sim-in-worker for online (1-2 days; netcode handoff doc has the design)
2. WebGPU for particles + lighting (2-4 weeks; separate axis)
3. Real-device QA on Android / iOS (~1 day setup, ongoing)

If you want to **discard the branch**:
1. The diagnostics infrastructure (worker-side perfTrace mirror, render-
   time histogram, long-frame attribution, compositor pacing probe) is
   independently useful — extract those changes into a small PR before
   discarding
2. The HUD font warmup + cosmetic dedup are also independent wins
3. The Ctx2D widening / IRenderer interface work is harmless cleanup

## Perf reports (chronological)

```
perf-runs/worker-experiment/baseline/REPORT.md            — phase 0: castle 6.4ms baseline
perf-runs/worker-experiment/phase2-smoke/REPORT.md        — additive smoke (anti-pattern, deleted)
perf-runs/worker-experiment/phase3-worker-on/REPORT.md    — first measurement, vsync confound
perf-runs/worker-experiment/phase4-real-data/REPORT.md    — V8 profile + CPU throttle stress test
perf-runs/worker-experiment/phase5-deep-diag/REPORT.md    — worker-side perfTrace + histogram + long-frame attribution
perf-runs/worker-experiment/phase6-final/REPORT.md        — HUD font warmup, cosmetic dedup, online support
perf-runs/worker-experiment/phase7-sim-worker/REPORT.md   — sim-in-worker behind ?simWorker=on
perf-runs/worker-experiment/phase8-followups/             — input dedup + Howler autoSuspend off
```

## Memories saved (in `~/.claude/projects/.../memory/`)

- `feedback_worker_compositor_overhead.md` — adding worker canvases as
  siblings adds ~1 ms compositor overhead even when idle (phase 2 finding)
- `reference_vite_module_workers.md` — module workers Just Work in this
  Vite setup; engine code is mostly worker-safe via `Ctx2D` alias
- `feedback_execute_dont_handoff.md` — when user authorizes "work to the
  end", execute the plan; don't pause partway with options A/B/C

## Final commit log

```
git log --oneline main..HEAD
574d09e feat(worker): sim-in-worker mode behind ?simWorker=on (local-only)
cdc2b6a feat(worker): HUD font warmup + cosmetic dedup + online support
2b76961 feat(worker): deep perf diagnostics — section timings + histogram + attribution
ab50b28 feat(worker): worker-side perf probe + CPU-throttle stress test
e9b2753 feat(worker): worker-local cosmetic systems + Howler stub + phase 3 perf
da6bf83 feat(worker): hoist Renderer into a Web Worker via RPC proxy
2b06700 feat(worker): genericize Renderer for OffscreenCanvas hosting
05a621d docs(worker): phase 3 handoff with phase 2 finding + DOM-API audit
f506086 feat(worker): phase 2 smoke — wire WorkerHost into Match.tsx via ?workerSmoke=1
c40fe35 feat(worker): phase 1 scaffold — worker entry, host bridge, kill switch
5c9783e perf(worker): phase 0 baseline castle 6.4 ms
4b2f496 docs: worker offload experiment plan
```

(Plus phase-8 follow-ups commit in flight at handoff time.)
