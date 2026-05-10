# Perf Profile — 2026-05-10T10:41:19.317Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 2b76961
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.9ms (56 fps)
- p50 17.7 · p95 18.8 · p99 26.0 · max 35.3
- long(>16.67ms): 600/600 (100.0%)
- long(>33.33ms): 1/600

## Heap timeline (1Hz)

- start 9.8MB · peak 14.9MB · end 14.3MB
- growth 4.5MB · sawtooth amplitude ~5.2MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 840 | 647.1 | 0.77 | 1.70 |
| fixedUpdate | 1810 | 1156.0 | 0.64 | 1.30 |
| simulator.perPlayerPhysics | 1810 | 841.0 | 0.46 | 1.00 |
| tickCosmetic | 1681 | 672.2 | 0.40 | 1.30 |
| cosmetic.playerTransition | 840 | 227.7 | 0.27 | 0.90 |
| cosmetic.playerCosmetic | 840 | 174.6 | 0.21 | 0.80 |
| awareness | 2128 | 214.3 | 0.10 | 0.30 |
| cosmetic.particles | 840 | 71.4 | 0.09 | 0.30 |
| cosmetic.reactive | 420 | 31.6 | 0.08 | 0.30 |
| gameplay.stomp | 1810 | 129.5 | 0.07 | 0.20 |
| cosmetic.surfaceImpact | 840 | 40.1 | 0.05 | 0.20 |
| cosmetic.environment | 840 | 28.9 | 0.03 | 0.20 |
| cosmetic.entityTransition | 840 | 27.4 | 0.03 | 0.20 |
| cosmetic.hudFeedback | 840 | 17.4 | 0.02 | 0.20 |
| gameplay.arenaEntity | 1810 | 32.8 | 0.02 | 0.20 |
| gameplay.match | 1810 | 32.4 | 0.02 | 0.20 |
| gameplay.hazard | 1810 | 30.4 | 0.02 | 0.10 |
| gameplay.carrot | 1810 | 11.4 | 0.01 | 0.00 |
| gameplay.effectZone | 1810 | 9.8 | 0.01 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2715ms)

| % | ms | File:line |
|---|-----|-----------|
| 46.8 | 1271 | src/engine/worker/RendererProxy.ts:428 (post) |
| 4.9 | 132 | :0 (postMessage) |
| 4.1 | 111 | :0 (requestAnimationFrame) |
| 1.8 | 48 | src/engine/worker/RendererProxy.ts:241 (e) |
| 1.6 | 44 | :0 (createBufferSource) |
| 1.4 | 39 | src/engine/ai/awareness.ts:70 (bA) |
| 1.3 | 36 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.2 | 32 | src/engine/gameLoop/cosmetics/particles.ts:161 (yO) |
| 1.0 | 27 | src/engine/perfTrace.ts:94 (end) |
| 0.9 | 26 | src/engine/gameLoop/cosmetics/gibs.ts:79 (yM) |
| 0.7 | 20 | :0 (createBufferSource) |
| 0.7 | 18 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 0.6 | 17 | src/engine/gameLoop/gameplay/stomps.ts:16 (Pj) |
| 0.6 | 17 | src/engine/physics.ts:129 (RO) |
| 0.6 | 16 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.6 | 16 | src/engine/gameLoop/cosmetics/EnvironmentSystem.ts:18 (cosmeticUpdate) |
| 0.6 | 16 | node_modules/howler/dist/howler.js:1213 (volume) |
| 0.6 | 15 | src/engine/gameLoop/cosmetics/playerCosmetics.ts:22 (OM) |
| 0.5 | 15 | :0 (connect) |
| 0.5 | 14 | :0 (setTimeout) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.00 | src/engine/ai/awareness.ts:70 (bA) |
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | node_modules/howler/dist/howler.js:741 (play) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 49.3 | 1339 |
| other | 20.9 | 567 |
| gameLoop | 15.0 | 407 |
| engine-root | 9.1 | 247 |
| ai | 2.9 | 78 |
| simulator | 1.4 | 38 |
| input | 0.5 | 13 |
| audio | 0.4 | 11 |
| themes | 0.4 | 10 |
| rendering | 0.1 | 3 |
| arenas | 0.1 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 23.97s | 27.5 | — |
| 24.38s | 25.6 | — |
| 26.55s | 26.2 | — |
| 31.53s | 26.2 | — |
| 31.72s | 26.0 | — |
| 31.95s | 27.9 | — |
| 34.23s | 35.3 | — |

## Worker offload diagnostics

> CPU throttle 4× applied to main thread (workers run on a separate thread, unaffected).

### Worker render time (per-frame distribution)

- frames: 3848
- avg renderFrame: 0.52ms
- p50 0.50 · p95 1.10 · p99 3.10 · max 34.70
- avg handler (incl cosmetic ticks): 0.54ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3848 | 2011.7 | 0.52 | 1.00 |
| render.fg-nature | 3848 | 553.1 | 0.14 | 0.20 |
| render.players | 3848 | 278.8 | 0.07 | 0.20 |
| render.overlay | 3848 | 265.0 | 0.07 | 0.30 |
| render.bg | 3848 | 253.5 | 0.07 | 0.20 |
| render.particles | 3848 | 195.4 | 0.05 | 0.20 |
| render.entities | 3848 | 108.6 | 0.03 | 0.10 |
| render.afterimages | 3848 | 74.2 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 34.70 | renderFrame 34.60ms, render.overlay 28.70ms, render.players 2.70ms, render.fg-nature 1.00ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1683
- avg 18.09ms (55 fps observed) · p50 17.80 · p95 18.80 · p99 24.30 · max 314.80
- frame drops (>20.67ms): 38/1683 (2.3%)
- heavy drops (>33.33ms): 2/1683

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
