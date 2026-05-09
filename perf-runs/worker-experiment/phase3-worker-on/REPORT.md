# Worker offload — phase 3 (sim on main, render in worker)

**Branch:** `feat/worker-offload-experiment` @ commit `da6bf83` (+ this report's changes)
**Scenario:** castle · 4 bots hard · 30s · random P1 input
**Build:** `dist-perf` (sourcemaps), `npm run perf -- --arena=castle`
**Runs:** 3 sequential. Each run starts a fresh preview server.

## TL;DR

The Renderer is now hosted in a Web Worker via `RendererProxy`. Castle plays correctly with full visuals (lighting, HUD, players, particles, wildlife, reactive cobwebs).

**rAF wall-clock regressed from 6.4 ms (baseline) → 18.0 ms (worker on) — a 2.8× slowdown ON THE HARNESS METRIC.** But the main-thread CPU profile says something different: total main-thread work over 30 s is **88 ms** (~0.05 ms/frame, ~0.3% utilization). Main is essentially idle. The wall-clock reflects vsync pacing of OffscreenCanvas-backed worker rendering, not main-thread cost.

The perf harness's `--disable-gpu-vsync` flag only affects main-thread Canvas2D rendering. Worker-owned OffscreenCanvas paints feed the compositor through a different pipeline that stays vsync-paced (~60 Hz, ~16.7 ms/frame). So `npm run perf` can no longer differentiate "main does 0 ms" from "main does 16 ms" — both look the same on the rAF wall-clock metric.

This is a measurement-methodology finding, not just a perf finding.

## Frame stats (rAF samples, main thread)

| Run | avg | p50 | p95 | p99 | max | long>16.67 | long>33 |
|---|---|---|---|---|---|---|---|
| 1 | 17.9 | 17.7 | 18.8 | 21.1 | 33.7 | 599/600 (99.8%) | 1 |
| 2 | 18.0 | 17.8 | 18.8 | 24.9 | 31.4 | 598/600 (99.7%) | 0 |
| 3 | 18.0 | 17.9 | 18.9 | 21.2 | 28.8 | 599/600 (99.8%) | 0 |
| **median** | **18.0** | 17.8 | 18.8 | 21.2 | 31.4 | 599 | 0 |

vs baseline (phase 0, worker off):

|  | baseline | phase 3 worker | Δ rAF wall-clock |
|---|---|---|---|
| avg | 6.4 | 18.0 | **+11.6 ms** (apparent regression) |
| p99 | 14.7 | 21.2 | **+6.5 ms** |
| long>16.67 | 0/600 | 599/600 | **+599** |

## Main-thread CPU profile (30 s sample)

From the V8 sampling profiler (Top 20 hotspots, run 2):

```
Total profile = 88 ms  ← over 30 000 ms wall-clock
=  0.29 % main-thread CPU utilization
```

Top contributors:

| % | ms | What |
|---|----|------|
| 15.1 | 13 | `RendererProxy.post` (postMessage cost) |
| 14.6 | 13 | `howler.js _ended` (audio pipeline, runs even idle) |
|  7.5 |  7 | `howler.js _autoSuspend` |
|  7.1 |  6 | `Simulator.fixedUpdate` |
|  3.9 |  3 | `gibs.cosmeticStep` |

postMessage of the per-frame state is the largest single main-thread cost — 13 ms over 30 s = **0.022 ms per frame**. Howler accounts for another 0.04 ms/frame in audio book-keeping that runs whether sound plays or not.

Section timings (perfTrace, only main-thread spans):

| Section | Avg ms | (vs baseline) |
|---------|--------|---------------|
| fixedUpdate | 0.12 | (0.15) |
| cosmeticStep | 0.14 | (0.13) |
| simulator.perPlayerPhysics | 0.08 | (0.10) |

`renderFrame` is no longer instrumented on main — it only runs in the worker now, where main-thread perfTrace doesn't reach.

## Visual correctness check

Confirmed via Playwright + screenshot at `?arena=castle&bots=2`:

- Players paint with correct sprites + outlines
- Castle iso platforms + decorations render
- Lighting (torches, moon, ambient gradient) applies
- HUD (player names, scores, timer) draws on its own canvas
- Wildlife + reactive cobwebs animate (worker maintains its own copies of `WildlifeSystem` + `ReactiveDecorationSystem`, ticked from the shipped state)

No visible difference vs main-thread mode. Verified `?worker=off` falls back to direct main-thread Renderer.

## Headline interpretation

The rAF-wall-clock regression is an artefact of the perf harness, not a real perf regression. Main thread CPU utilization is **two orders of magnitude lower** (0.3% vs ~50% baseline) when the worker holds the renderer. In production this is a clear win: room for React UI, audio, transport, and incoming L3/L4/L5 lighting work without contending with the main render path.

But on the **specific success criterion the experiment was set up against** — castle main-thread rAF avg ≤ 4 ms (revised after the phase-2 +1 ms compositor floor) — we can't claim victory because the harness can't see below the OffscreenCanvas vsync floor. The actual main-thread cost is well under 1 ms; it's just unmeasurable through fpsCounter while OffscreenCanvas is paced at vsync.

## Net findings

1. **Worker render path WORKS end-to-end.** Castle is visually identical, plays correctly, no crashes. The full `IRenderer` surface (init, theme, background, frame, lighting bursts, gibs, blood, sprite warm, render-scale, debug states) is faithfully proxied.
2. **Howler must be stubbed in the worker bundle** (`vite.config.ts > worker.plugins`). The character packs all do `import { Howl } from 'howler'` for their `createSound` factory; the bare import crashes the worker on `HowlerGlobal is not defined`. Stub is no-op-only — `createSound` is never invoked inside the worker.
3. **Wildlife + reactive decorations cannot cross structured-clone.** `GroundCritterData.draw` is a pack-supplied function in `inst.data`. Solution: worker maintains its own local `WildlifeSystem` + `ReactiveDecorationSystem`, ticked from the shipped state. Both sides duplicate the cosmetic tick (~0.02 ms each); the duplication is cheap and keeps the wire payload structured-clone-safe.
4. **Main-thread CPU drops to ~0.3 % utilization** (88 ms over 30 s) when the renderer migrates to the worker. The `RendererProxy.post` postMessage is the new main-thread hotspot at 13 ms over 30 s — fully amortized by frame.
5. **The rAF-wall-clock metric is no longer comparable across worker/no-worker modes.** OffscreenCanvas-backed worker rendering paces at vsync (~16.7 ms) regardless of `--disable-gpu-vsync`. Future perf comparisons need to switch to either (a) main-thread CPU profile total, (b) frame-pacing metrics from `requestVideoFrameCallback` or `Compositor.framePresentationTime`, or (c) a worker-side rAF probe that runs independent of the compositor.

## Production decision (recommendation)

The worker path is mergeable AS A KILL-SWITCHED EXPERIMENTAL FEATURE behind `?worker=on`. It is NOT yet ready as default-on:

- The wire payload is a full structured-clone of MatchState every frame. Microbench needed to confirm it scales to 4-player matches without main-thread spikes. Likely fine — the codec already exists in `net/snapshot.ts` for the network path and produces ~10 KB binary; that codec could replace structured-clone for ~10× cheaper transfer. Out of scope here.
- The harness can no longer measure perf wins from this path. Before promoting to default-on, build a worker-side perf probe (rAF + perfTrace mirror) that posts back per-frame timings.
- L3 lighting + future renderer features must be tested in worker mode; bgNight + fgNightTint cross-fade is wired through the `nightOpacityCallback` channel and verified visually but not under L3 conditions.

The architectural shape (`IRenderer` interface, `RendererProxy`, worker-local cosmetic systems) is durable. If the team wants to keep this experiment alive, the next steps are:

1. Replace structured-clone with the existing binary snapshot codec (Transferable ArrayBuffer per frame).
2. Build a worker-side perfTrace mirror that posts back so the rAF metric reflects actual render cost.
3. Migrate the network path next (host's snapshot encode also moves to worker, single codec hop instead of two).
