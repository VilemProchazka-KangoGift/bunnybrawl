# Perf Profile — 2026-05-10T11:18:10.319Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit cdc2b6a
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (56 fps)
- p50 17.8 · p95 18.9 · p99 24.6 · max 29.6
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 11.4MB · peak 14.7MB · end 10.3MB
- growth -1.1MB · sawtooth amplitude ~5.9MB
- GC events: 1 (avg drop 5.2MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 841 | 111.9 | 0.13 | 0.30 |
| fixedUpdate | 1806 | 215.0 | 0.12 | 0.20 |
| simulator.perPlayerPhysics | 1806 | 156.5 | 0.09 | 0.20 |
| tickCosmetic | 1683 | 114.3 | 0.07 | 0.30 |
| cosmetic.playerTransition | 841 | 37.9 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 841 | 33.5 | 0.04 | 0.20 |
| awareness | 2097 | 37.3 | 0.02 | 0.10 |
| cosmetic.particles | 841 | 13.8 | 0.02 | 0.10 |
| gameplay.stomp | 1806 | 21.1 | 0.01 | 0.10 |
| cosmetic.reactive | 421 | 4.0 | 0.01 | 0.10 |
| cosmetic.environment | 841 | 5.9 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 841 | 5.9 | 0.01 | 0.10 |
| cosmetic.entityTransition | 841 | 4.4 | 0.01 | 0.10 |
| gameplay.hazard | 1806 | 6.8 | 0.00 | 0.00 |
| gameplay.arenaEntity | 1806 | 6.7 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 841 | 2.6 | 0.00 | 0.00 |
| gameplay.match | 1806 | 5.0 | 0.00 | 0.00 |
| gameplay.carrot | 1806 | 3.0 | 0.00 | 0.00 |
| gameplay.effectZone | 1806 | 2.3 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 106ms)

| % | ms | File:line |
|---|-----|-----------|
| 20.1 | 21 | src/engine/worker/RendererProxy.ts:428 (post) |
| 6.0 | 6 | src/engine/perfTrace.ts:89 (begin) |
| 5.6 | 6 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 5.6 | 6 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 3.8 | 4 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 3.2 | 3 | src/engine/autoSlowDetect.ts:41 (nP) |
| 3.1 | 3 | src/engine/fpsCounter.ts:17 ($g) |
| 3.1 | 3 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 2.9 | 3 | src/engine/hazardCollision.ts:98 (_N) |
| 2.9 | 3 | src/engine/worker/RendererProxy.ts:262 (handleMessage) |
| 2.6 | 3 | src/engine/physics.ts:129 (kA) |
| 2.2 | 2 | src/engine/stomp.ts:12 (gA) |
| 2.0 | 2 | src/engine/gameLoop/cosmetics/gibs.ts:79 (pP) |
| 2.0 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:48 (DP) |
| 1.9 | 2 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 1.6 | 2 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 1.6 | 2 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:54 (spawnJumpDustParticles) |
| 1.6 | 2 | :0 (clearTimeout) |
| 1.6 | 2 | src/engine/perfTrace.ts:89 (begin) |
| 1.5 | 2 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/simulator/Simulator.ts:118 (applyHazardHitVFX) |
| 0.00 | src/engine/gameLoop/GameLoop.ts:723 (loop) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| engine-root | 24.9 | 26 |
| worker | 24.0 | 26 |
| gameLoop | 22.0 | 23 |
| other | 20.7 | 22 |
| simulator | 3.8 | 4 |
| ai | 1.8 | 2 |
| audio | 1.5 | 2 |
| rendering | 1.2 | 1 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 29.53s | 29.6 | — |
| 31.64s | 27.0 | — |
| 32.34s | 26.1 | — |

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3816
- avg renderFrame: 0.50ms
- p50 0.40 · p95 1.10 · p99 2.80 · max 36.00
- avg handler (incl cosmetic ticks): 0.52ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3816 | 1903.4 | 0.50 | 1.00 |
| render.fg-nature | 3816 | 530.5 | 0.14 | 0.20 |
| render.overlay | 3816 | 266.1 | 0.07 | 0.30 |
| render.players | 3816 | 244.9 | 0.06 | 0.20 |
| render.bg | 3816 | 242.0 | 0.06 | 0.20 |
| render.particles | 3816 | 172.0 | 0.05 | 0.20 |
| render.entities | 3816 | 105.5 | 0.03 | 0.10 |
| render.afterimages | 3816 | 70.4 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 36.00 | renderFrame 35.80ms, render.overlay 28.90ms, render.players 3.10ms, render.fg-nature 1.40ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1683
- avg 17.89ms (56 fps observed) · p50 17.70 · p95 18.80 · p99 23.20 · max 34.80
- frame drops (>20.67ms): 23/1683 (1.4%)
- heavy drops (>33.33ms): 1/1683

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
