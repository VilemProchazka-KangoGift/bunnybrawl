# Perf Profile — 2026-05-10T11:28:11.354Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 574d09e
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (56 fps)
- p50 17.6 · p95 18.8 · p99 26.0 · max 48.7
- long(>16.67ms): 598/600 (99.7%)
- long(>33.33ms): 3/600

## Heap timeline (1Hz)

- start 11.1MB · peak 15.2MB · end 9.2MB
- growth -1.9MB · sawtooth amplitude ~6.0MB
- GC events: 1 (avg drop 5.8MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 841 | 107.8 | 0.13 | 0.30 |
| fixedUpdate | 1806 | 205.9 | 0.11 | 0.20 |
| simulator.perPlayerPhysics | 1806 | 144.3 | 0.08 | 0.20 |
| tickCosmetic | 1683 | 109.1 | 0.06 | 0.20 |
| cosmetic.playerTransition | 841 | 37.4 | 0.04 | 0.20 |
| cosmetic.playerCosmetic | 841 | 25.8 | 0.03 | 0.10 |
| awareness | 2068 | 32.0 | 0.02 | 0.10 |
| cosmetic.reactive | 421 | 6.5 | 0.02 | 0.10 |
| cosmetic.particles | 841 | 12.3 | 0.01 | 0.10 |
| gameplay.stomp | 1806 | 20.1 | 0.01 | 0.10 |
| cosmetic.environment | 841 | 6.0 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 841 | 6.0 | 0.01 | 0.10 |
| cosmetic.entityTransition | 841 | 5.5 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1806 | 8.4 | 0.00 | 0.00 |
| gameplay.hazard | 1806 | 7.6 | 0.00 | 0.00 |
| gameplay.match | 1806 | 6.4 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 841 | 2.9 | 0.00 | 0.00 |
| gameplay.carrot | 1806 | 2.2 | 0.00 | 0.00 |
| gameplay.effectZone | 1806 | 2.0 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 94ms)

| % | ms | File:line |
|---|-----|-----------|
| 25.1 | 24 | src/engine/worker/RendererProxy.ts:428 (post) |
| 11.7 | 11 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 3.5 | 3 | :0 (disconnect) |
| 3.5 | 3 | src/engine/worker/RendererProxy.ts:241 (e) |
| 3.4 | 3 | :0 (postMessage) |
| 3.3 | 3 | src/engine/perfTrace.ts:94 (end) |
| 3.2 | 3 | src/engine/gameLoop/cosmetics/HUDFeedbackSystem.ts:54 (_detectComboKills) |
| 3.1 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 3.1 | 3 | src/engine/gameLoop/cosmetics/gibs.ts:79 (pP) |
| 3.0 | 3 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 2.3 | 2 | src/engine/physics.ts:129 (kA) |
| 2.2 | 2 | src/engine/gameLoop/cosmetics/playerTransitions.ts:59 (_P) |
| 1.8 | 2 | src/engine/perfTrace.ts:89 (begin) |
| 1.8 | 2 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 1.8 | 2 | src/engine/physics.ts:102 (EA) |
| 1.7 | 2 | src/engine/ai/aiController.ts:142 (computeIdealInput) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:1894 (_emit) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:1413 (_stopFade) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:79 (pP) |
| 0.00 | src/engine/gameLoop/gameplay/playerCollisions.ts:40 (xN) |
| 0.00 | src/engine/ai/aiController.ts:142 (computeIdealInput) |
| 0.00 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:96 (jP) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 30.3 | 28 |
| other | 28.6 | 27 |
| gameLoop | 20.0 | 19 |
| engine-root | 15.4 | 14 |
| simulator | 3.1 | 3 |
| ai | 2.6 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 23.65s | 26.0 | — |
| 23.72s | 48.7 | — |
| 27.57s | 33.4 | — |
| 29.68s | 29.7 | — |
| 29.77s | 30.8 | — |
| 33.80s | 37.8 | — |

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 4130
- avg renderFrame: 0.49ms
- p50 0.40 · p95 1.10 · p99 2.80 · max 36.70
- avg handler (incl cosmetic ticks): 0.51ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4130 | 2024.1 | 0.49 | 1.00 |
| render.fg-nature | 4130 | 579.8 | 0.14 | 0.20 |
| render.overlay | 4130 | 285.0 | 0.07 | 0.20 |
| render.bg | 4130 | 263.2 | 0.06 | 0.20 |
| render.players | 4130 | 260.4 | 0.06 | 0.20 |
| render.particles | 4130 | 195.6 | 0.05 | 0.20 |
| render.entities | 4130 | 97.7 | 0.02 | 0.10 |
| render.afterimages | 4130 | 67.8 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 36.70 | renderFrame 36.50ms, render.overlay 30.50ms, render.players 2.80ms, render.fg-nature 1.10ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1683
- avg 17.89ms (56 fps observed) · p50 17.60 · p95 18.80 · p99 23.10 · max 48.70
- frame drops (>20.67ms): 21/1683 (1.2%)
- heavy drops (>33.33ms): 5/1683

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
