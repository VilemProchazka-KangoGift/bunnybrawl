# Perf Profile — 2026-05-10T11:28:56.552Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 574d09e
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (55 fps)
- p50 17.8 · p95 18.9 · p99 26.0 · max 30.3
- long(>16.67ms): 600/600 (100.0%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.2MB · peak 14.1MB · end 9.2MB
- growth -1.0MB · sawtooth amplitude ~5.1MB
- GC events: 1 (avg drop 5.1MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 840 | 110.4 | 0.13 | 0.30 |
| fixedUpdate | 1807 | 201.7 | 0.11 | 0.20 |
| simulator.perPlayerPhysics | 1807 | 137.8 | 0.08 | 0.20 |
| tickCosmetic | 1679 | 114.1 | 0.07 | 0.30 |
| cosmetic.playerTransition | 840 | 42.1 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 840 | 23.1 | 0.03 | 0.10 |
| cosmetic.particles | 840 | 13.8 | 0.02 | 0.10 |
| awareness | 2022 | 31.3 | 0.02 | 0.10 |
| cosmetic.reactive | 420 | 4.7 | 0.01 | 0.10 |
| gameplay.stomp | 1807 | 20.0 | 0.01 | 0.10 |
| cosmetic.environment | 840 | 7.0 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 840 | 6.3 | 0.01 | 0.10 |
| cosmetic.entityTransition | 840 | 5.1 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1807 | 10.3 | 0.01 | 0.10 |
| gameplay.hazard | 1807 | 8.6 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 840 | 3.5 | 0.00 | 0.00 |
| gameplay.match | 1807 | 5.2 | 0.00 | 0.00 |
| gameplay.carrot | 1807 | 2.7 | 0.00 | 0.00 |
| gameplay.effectZone | 1807 | 1.1 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 88ms)

| % | ms | File:line |
|---|-----|-----------|
| 16.3 | 14 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 16.3 | 14 | src/engine/worker/RendererProxy.ts:428 (post) |
| 7.4 | 7 | :0 (disconnect) |
| 3.7 | 3 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 3.2 | 3 | src/engine/worker/RendererProxy.ts:241 (e) |
| 3.0 | 3 | src/engine/gameLoop/cosmetics/gibs.ts:79 (pP) |
| 2.9 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 2.8 | 2 | src/engine/gameLoop/gameplay/HazardSystem.ts:36 (fixedUpdate) |
| 2.1 | 2 | src/engine/ai/awareness.ts:70 (mM) |
| 2.0 | 2 | src/engine/gameLoop/gameplay/hazards.ts:87 (ZM) |
| 2.0 | 2 | :0 (requestAnimationFrame) |
| 1.9 | 2 | src/engine/perfTrace.ts:64 (wj) |
| 1.9 | 2 | src/engine/fpsCounter.ts:17 ($g) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:70 (kP) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 1.8 | 2 | src/engine/input/KeyboardManager.ts:87 (normalizeKey) |
| 1.8 | 2 | src/engine/perfTrace.ts:110 (measure) |
| 1.7 | 2 | :0 (postMessage) |
| 1.6 | 1 | src/engine/gameLoop/cosmetics/reactiveDecorations.ts:194 (io) |
| 1.6 | 1 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |
| 0.00 | src/engine/gameLoop/gameplay/carrots.ts:5 (eN) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | src/engine/gameLoop/gameplay/stomps.ts:16 (ON) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (tA) |
| 0.00 | src/engine/gameLoop/gameplay/hazards.ts:64 (XM) |
| 0.00 | src/engine/stomp.ts:105 (yA) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:11 (dP) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 32.8 | 29 |
| gameLoop | 24.1 | 21 |
| worker | 19.5 | 17 |
| engine-root | 13.8 | 12 |
| ai | 3.6 | 3 |
| input | 3.4 | 3 |
| simulator | 2.9 | 3 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 25.50s | 25.9 | — |
| 25.78s | 26.2 | — |
| 27.72s | 25.5 | — |
| 28.60s | 29.0 | — |
| 29.10s | 30.3 | — |
| 29.38s | 28.7 | — |
| 29.97s | 25.2 | — |
| 32.02s | 26.0 | — |
| 33.78s | 27.5 | — |

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3714
- avg renderFrame: 0.52ms
- p50 0.50 · p95 1.10 · p99 3.10 · max 36.20
- avg handler (incl cosmetic ticks): 0.54ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3714 | 1936.2 | 0.52 | 1.10 |
| render.fg-nature | 3714 | 527.5 | 0.14 | 0.20 |
| render.overlay | 3714 | 299.4 | 0.08 | 0.30 |
| render.players | 3714 | 258.4 | 0.07 | 0.20 |
| render.bg | 3714 | 236.5 | 0.06 | 0.20 |
| render.particles | 3714 | 190.2 | 0.05 | 0.20 |
| render.entities | 3714 | 84.0 | 0.02 | 0.10 |
| render.afterimages | 3714 | 74.6 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 36.20 | renderFrame 36.00ms, render.overlay 28.50ms, render.players 3.50ms, render.fg-nature 1.40ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1680
- avg 17.93ms (56 fps observed) · p50 17.70 · p95 18.80 · p99 24.60 · max 52.10
- frame drops (>20.67ms): 32/1680 (1.9%)
- heavy drops (>33.33ms): 1/1680

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
