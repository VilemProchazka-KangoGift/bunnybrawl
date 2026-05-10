# Perf Profile — 2026-05-10T18:07:33.103Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit e5d283c
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.8ms (56 fps)
- p50 17.7 · p95 18.8 · p99 18.9 · max 20.0
- long(>16.67ms): 598/600 (99.7%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.7MB · peak 15.2MB · end 13.9MB
- growth 3.1MB · sawtooth amplitude ~4.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 846 | 110.9 | 0.13 | 0.30 |
| fixedUpdate | 1807 | 212.1 | 0.12 | 0.20 |
| simulator.perPlayerPhysics | 1807 | 145.7 | 0.08 | 0.20 |
| tickCosmetic | 1693 | 116.0 | 0.07 | 0.20 |
| cosmetic.playerTransition | 846 | 38.0 | 0.04 | 0.20 |
| cosmetic.playerCosmetic | 846 | 30.8 | 0.04 | 0.20 |
| awareness | 2096 | 35.8 | 0.02 | 0.10 |
| cosmetic.particles | 846 | 12.9 | 0.02 | 0.10 |
| gameplay.stomp | 1807 | 21.4 | 0.01 | 0.10 |
| cosmetic.reactive | 423 | 4.3 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 846 | 6.0 | 0.01 | 0.10 |
| cosmetic.environment | 846 | 5.7 | 0.01 | 0.10 |
| cosmetic.entityTransition | 846 | 5.2 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1807 | 10.4 | 0.01 | 0.10 |
| gameplay.hazard | 1807 | 8.8 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 846 | 3.7 | 0.00 | 0.00 |
| gameplay.match | 1807 | 5.8 | 0.00 | 0.00 |
| gameplay.carrot | 1807 | 2.5 | 0.00 | 0.00 |
| gameplay.effectZone | 1807 | 2.5 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 97ms)

| % | ms | File:line |
|---|-----|-----------|
| 12.6 | 12 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 12.0 | 12 | src/engine/worker/RendererProxy.ts:441 (post) |
| 7.2 | 7 | src/engine/worker/RendererProxy.ts:253 (e) |
| 5.2 | 5 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 4.4 | 4 | src/engine/perfTrace.ts:89 (begin) |
| 3.5 | 3 | src/engine/physics.ts:129 (RO) |
| 3.3 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 3.2 | 3 | src/engine/worker/RendererProxy.ts:410 (renderFrame) |
| 2.2 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:39 (MM) |
| 2.2 | 2 | src/engine/fpsCounter.ts:17 (ch) |
| 1.9 | 2 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 1.8 | 2 | src/engine/gameLoop/gameplay/playerCollisions.ts:70 (Oj) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 1.7 | 2 | src/engine/fpsCounter.ts:17 (ch) |
| 1.7 | 2 | src/engine/hazardCollision.ts:98 (Cj) |
| 1.7 | 2 | src/engine/gameLoop/gameplay/HazardSystem.ts:36 (fixedUpdate) |
| 1.7 | 2 | :0 (now) |
| 1.7 | 2 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 1.7 | 2 | src/engine/autoSlowDetect.ts:41 (cM) |
| 1.6 | 2 | src/engine/perfTrace.ts:110 (measure) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:11 (_M) |
| 0.00 | src/engine/worker/RendererProxy.ts:253 (e) |
| 0.00 | src/engine/gameLoop/cosmetics/sfx.ts:46 (Lj) |
| 0.00 | src/engine/gameLoop/gameplay/arenaEntities.ts:38 (dj) |
| 0.00 | :0 ((V8 API)) |
| 0.00 | src/engine/gameLoop/cosmetics/SurfaceImpactSystem.ts:45 (cosmeticUpdate) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| gameLoop | 25.7 | 25 |
| engine-root | 24.1 | 23 |
| worker | 23.9 | 23 |
| other | 19.1 | 18 |
| simulator | 3.3 | 3 |
| ai | 2.7 | 3 |
| input | 1.2 | 1 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3999
- avg renderFrame: 0.50ms
- p50 0.40 · p95 1.10 · p99 3.10 · max 37.20
- avg handler (incl cosmetic ticks): 0.52ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3999 | 2000.8 | 0.50 | 1.00 |
| render.fg-nature | 3999 | 565.6 | 0.14 | 0.20 |
| render.overlay | 3999 | 278.2 | 0.07 | 0.20 |
| render.players | 3999 | 265.7 | 0.07 | 0.20 |
| render.bg | 3999 | 256.6 | 0.06 | 0.20 |
| render.particles | 3999 | 190.8 | 0.05 | 0.20 |
| render.entities | 3999 | 95.5 | 0.02 | 0.10 |
| render.afterimages | 3999 | 67.4 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 37.20 | renderFrame 37.00ms, render.overlay 30.80ms, render.players 3.00ms, render.fg-nature 1.10ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1693
- avg 17.79ms (56 fps observed) · p50 17.60 · p95 18.80 · p99 19.00 · max 35.30
- frame drops (>20.67ms): 1/1693 (0.1%)
- heavy drops (>33.33ms): 1/1693

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
