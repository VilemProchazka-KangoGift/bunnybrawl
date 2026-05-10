# Perf Profile — 2026-05-10T11:18:55.510Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit cdc2b6a
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.9ms (56 fps)
- p50 17.8 · p95 18.8 · p99 23.0 · max 32.5
- long(>16.67ms): 597/600 (99.5%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 11.3MB · peak 15.1MB · end 14.8MB
- growth 3.5MB · sawtooth amplitude ~4.5MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 845 | 635.5 | 0.75 | 1.70 |
| fixedUpdate | 1812 | 1171.4 | 0.65 | 1.30 |
| simulator.perPlayerPhysics | 1812 | 860.1 | 0.47 | 1.00 |
| tickCosmetic | 1690 | 656.2 | 0.39 | 1.30 |
| cosmetic.playerTransition | 845 | 207.4 | 0.25 | 0.80 |
| cosmetic.playerCosmetic | 845 | 186.1 | 0.22 | 0.80 |
| awareness | 2135 | 218.9 | 0.10 | 0.30 |
| cosmetic.particles | 845 | 71.0 | 0.08 | 0.30 |
| cosmetic.reactive | 422 | 30.6 | 0.07 | 0.20 |
| gameplay.stomp | 1812 | 113.9 | 0.06 | 0.20 |
| cosmetic.surfaceImpact | 845 | 39.4 | 0.05 | 0.20 |
| cosmetic.environment | 845 | 29.4 | 0.03 | 0.20 |
| cosmetic.entityTransition | 845 | 27.9 | 0.03 | 0.20 |
| gameplay.match | 1812 | 39.9 | 0.02 | 0.20 |
| cosmetic.hudFeedback | 845 | 17.8 | 0.02 | 0.20 |
| gameplay.arenaEntity | 1812 | 33.8 | 0.02 | 0.20 |
| gameplay.hazard | 1812 | 28.9 | 0.02 | 0.10 |
| gameplay.effectZone | 1812 | 11.5 | 0.01 | 0.00 |
| gameplay.carrot | 1812 | 10.7 | 0.01 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2597ms)

| % | ms | File:line |
|---|-----|-----------|
| 47.2 | 1225 | src/engine/worker/RendererProxy.ts:428 (post) |
| 4.9 | 126 | :0 (postMessage) |
| 4.6 | 120 | :0 (requestAnimationFrame) |
| 2.2 | 57 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 2.1 | 53 | src/engine/worker/RendererProxy.ts:241 (e) |
| 1.4 | 36 | src/engine/ai/awareness.ts:70 (mM) |
| 1.1 | 29 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 1.1 | 28 | :0 (createBufferSource) |
| 1.0 | 25 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 0.9 | 23 | :0 (createBufferSource) |
| 0.9 | 23 | :0 (requestAnimationFrame) |
| 0.8 | 22 | src/engine/physics.ts:129 (kA) |
| 0.8 | 20 | src/engine/perfTrace.ts:94 (end) |
| 0.7 | 19 | src/engine/perfTrace.ts:94 (end) |
| 0.7 | 18 | node_modules/howler/dist/howler.js:2136 (_refreshBuffer) |
| 0.7 | 17 | src/engine/gameLoop/gameplay/stomps.ts:16 (ON) |
| 0.7 | 17 | :0 (connect) |
| 0.7 | 17 | :0 (connect) |
| 0.7 | 17 | src/engine/input/RuleBasedBot.ts:28 (getAction) |
| 0.6 | 17 | src/engine/gameLoop/cosmetics/gibs.ts:79 (pP) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | src/engine/gameLoop/cosmetics/HUDFeedbackSystem.ts:88 (_detectScorePulses) |
| 0.00 | :0 ((V8 API)) |
| 0.00 | node_modules/howler/dist/howler.js:2288 (reset) |
| 0.00 | src/engine/gameLoop/cosmetics/playerTransitions.ts:59 (_P) |
| 0.00 | src/engine/ai/utility.ts:16 (_M) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 50.3 | 1306 |
| other | 21.0 | 546 |
| gameLoop | 13.1 | 340 |
| engine-root | 8.5 | 221 |
| ai | 2.7 | 69 |
| simulator | 2.3 | 60 |
| input | 1.0 | 26 |
| audio | 0.6 | 15 |
| themes | 0.3 | 9 |
| rendering | 0.2 | 4 |
| components | 0.1 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 28.86s | 32.5 | — |
| 29.86s | 29.2 | — |
| 30.83s | 25.2 | — |
| 34.05s | 26.0 | — |

## Worker offload diagnostics

> CPU throttle 4× applied to main thread (workers run on a separate thread, unaffected).

### Worker render time (per-frame distribution)

- frames: 3742
- avg renderFrame: 0.52ms
- p50 0.50 · p95 1.10 · p99 3.10 · max 32.40
- avg handler (incl cosmetic ticks): 0.54ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3742 | 1950.2 | 0.52 | 1.00 |
| render.fg-nature | 3742 | 525.7 | 0.14 | 0.20 |
| render.overlay | 3742 | 277.2 | 0.07 | 0.30 |
| render.players | 3742 | 248.4 | 0.07 | 0.20 |
| render.bg | 3742 | 244.3 | 0.07 | 0.20 |
| render.particles | 3742 | 186.1 | 0.05 | 0.20 |
| render.entities | 3742 | 116.5 | 0.03 | 0.10 |
| render.afterimages | 3742 | 73.9 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 32.40 | renderFrame 32.20ms, render.overlay 26.20ms, render.players 2.70ms, render.fg-nature 1.10ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1693
- avg 17.97ms (56 fps observed) · p50 17.80 · p95 18.70 · p99 19.00 · max 277.70
- frame drops (>20.67ms): 9/1693 (0.5%)
- heavy drops (>33.33ms): 1/1693

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
