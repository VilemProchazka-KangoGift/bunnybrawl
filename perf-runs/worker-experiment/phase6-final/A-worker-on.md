# Perf Profile — 2026-05-10T10:39:49.191Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 2b76961
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.7ms (56 fps)
- p50 17.6 · p95 18.8 · p99 19.0 · max 19.3
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.2MB · peak 14.7MB · end 12.5MB
- growth 2.2MB · sawtooth amplitude ~4.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 845 | 114.2 | 0.14 | 0.30 |
| fixedUpdate | 1807 | 208.1 | 0.12 | 0.20 |
| simulator.perPlayerPhysics | 1807 | 143.3 | 0.08 | 0.20 |
| tickCosmetic | 1691 | 118.2 | 0.07 | 0.30 |
| cosmetic.playerTransition | 845 | 40.2 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 845 | 28.1 | 0.03 | 0.10 |
| awareness | 2080 | 37.3 | 0.02 | 0.10 |
| cosmetic.particles | 845 | 14.7 | 0.02 | 0.10 |
| gameplay.stomp | 1807 | 21.6 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 845 | 8.1 | 0.01 | 0.10 |
| cosmetic.reactive | 423 | 3.4 | 0.01 | 0.10 |
| cosmetic.environment | 845 | 5.9 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1807 | 10.2 | 0.01 | 0.10 |
| cosmetic.entityTransition | 845 | 4.6 | 0.01 | 0.10 |
| gameplay.hazard | 1807 | 8.0 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 845 | 3.6 | 0.00 | 0.00 |
| gameplay.match | 1807 | 5.6 | 0.00 | 0.00 |
| gameplay.carrot | 1807 | 3.3 | 0.00 | 0.00 |
| gameplay.effectZone | 1807 | 2.2 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 112ms)

| % | ms | File:line |
|---|-----|-----------|
| 17.8 | 20 | src/engine/worker/RendererProxy.ts:428 (post) |
| 8.3 | 9 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 5.4 | 6 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 5.1 | 6 | :0 (requestAnimationFrame) |
| 4.2 | 5 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 3.9 | 4 | src/engine/worker/RendererProxy.ts:241 (e) |
| 2.9 | 3 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 2.8 | 3 | :0 (setTimeout) |
| 2.8 | 3 | :0 (postMessage) |
| 2.7 | 3 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 2.5 | 3 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 2.5 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 2.5 | 3 | src/engine/ai/aiController.ts:142 (computeIdealInput) |
| 2.3 | 3 | src/engine/gameLoop/cosmetics/gibs.ts:79 (yM) |
| 1.6 | 2 | src/engine/gameLoop/cosmetics/particles.ts:15 (uO) |
| 1.6 | 2 | src/engine/perfTrace.ts:94 (end) |
| 1.5 | 2 | src/engine/gameLoop/gameplay/ArenaEntitySystem.ts:46 (fixedUpdate) |
| 1.5 | 2 | src/engine/perfTrace.ts:89 (begin) |
| 1.5 | 2 | src/engine/fpsCounter.ts:17 (ch) |
| 1.4 | 2 | node_modules/howler/dist/howler.js:1894 (_emit) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | src/engine/ai/awareness.ts:70 (bA) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (uO) |
| 0.00 | src/engine/physics.ts:112 (IO) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:79 (spawnKillSplatter) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 39.2 | 44 |
| worker | 23.0 | 26 |
| gameLoop | 15.2 | 17 |
| engine-root | 11.2 | 13 |
| ai | 4.5 | 5 |
| input | 3.9 | 4 |
| simulator | 3.0 | 3 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3922
- avg renderFrame: 0.49ms
- p50 0.40 · p95 1.10 · p99 2.80 · max 33.00
- avg handler (incl cosmetic ticks): 0.51ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3922 | 1899.5 | 0.48 | 1.00 |
| render.fg-nature | 3922 | 530.8 | 0.14 | 0.20 |
| render.overlay | 3922 | 259.0 | 0.07 | 0.30 |
| render.players | 3922 | 257.5 | 0.07 | 0.20 |
| render.bg | 3922 | 237.0 | 0.06 | 0.20 |
| render.particles | 3922 | 169.1 | 0.04 | 0.20 |
| render.entities | 3922 | 99.5 | 0.03 | 0.10 |
| render.afterimages | 3922 | 71.6 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 33.00 | renderFrame 32.80ms, render.overlay 26.90ms, render.players 2.60ms, render.fg-nature 1.10ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1691
- avg 17.81ms (56 fps observed) · p50 17.60 · p95 18.80 · p99 19.60 · max 52.20
- frame drops (>20.67ms): 15/1691 (0.9%)
- heavy drops (>33.33ms): 1/1691

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
