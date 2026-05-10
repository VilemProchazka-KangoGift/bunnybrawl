# Perf Profile — 2026-05-10T10:07:59.575Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit ab50b28
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.9ms (56 fps)
- p50 17.8 · p95 18.8 · p99 23.9 · max 30.1
- long(>16.67ms): 600/600 (100.0%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.3MB · peak 14.8MB · end 12.8MB
- growth 2.5MB · sawtooth amplitude ~4.5MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 842 | 116.0 | 0.14 | 0.30 |
| fixedUpdate | 1808 | 221.7 | 0.12 | 0.30 |
| simulator.perPlayerPhysics | 1808 | 155.1 | 0.09 | 0.20 |
| tickCosmetic | 1684 | 119.3 | 0.07 | 0.30 |
| cosmetic.playerTransition | 842 | 40.0 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 842 | 26.9 | 0.03 | 0.20 |
| cosmetic.reactive | 421 | 7.1 | 0.02 | 0.10 |
| awareness | 2120 | 34.4 | 0.02 | 0.10 |
| cosmetic.particles | 842 | 11.5 | 0.01 | 0.10 |
| gameplay.stomp | 1808 | 22.0 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 842 | 7.2 | 0.01 | 0.10 |
| cosmetic.entityTransition | 842 | 6.1 | 0.01 | 0.10 |
| cosmetic.wildlife | 421 | 2.7 | 0.01 | 0.10 |
| cosmetic.environment | 842 | 4.5 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 842 | 3.9 | 0.00 | 0.00 |
| gameplay.hazard | 1808 | 7.9 | 0.00 | 0.00 |
| gameplay.arenaEntity | 1808 | 6.8 | 0.00 | 0.00 |
| gameplay.match | 1808 | 5.3 | 0.00 | 0.00 |
| gameplay.carrot | 1808 | 2.8 | 0.00 | 0.00 |
| gameplay.effectZone | 1808 | 2.3 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 88ms)

| % | ms | File:line |
|---|-----|-----------|
| 22.1 | 19 | src/engine/worker/RendererProxy.ts:425 (post) |
| 5.5 | 5 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 5.3 | 5 | src/engine/worker/RendererProxy.ts:241 (e) |
| 5.3 | 5 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 4.9 | 4 | :0 (requestAnimationFrame) |
| 3.7 | 3 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 3.6 | 3 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 3.6 | 3 | :0 (postMessage) |
| 2.8 | 2 | src/engine/ai/aiController.ts:70 (getInput) |
| 2.3 | 2 | src/engine/physics.ts:129 (LO) |
| 2.0 | 2 | src/engine/hazardCollision.ts:48 (bj) |
| 1.9 | 2 | src/engine/perfTrace.ts:110 (measure) |
| 1.9 | 2 | src/engine/gameLoop/GameLoop.ts:790 (fixedUpdate) |
| 1.9 | 2 | node_modules/howler/dist/howler.js:1894 (_emit) |
| 1.9 | 2 | src/engine/stomp.ts:12 (wO) |
| 1.9 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:96 (IM) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:741 (play) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:50 (spawnDustParticles) |
| 1.8 | 2 | src/engine/stomp.ts:105 (DO) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:11 (gM) |
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | src/engine/gameLoop/cosmetics/reactiveDecorations.ts:228 (Xa) |
| 0.00 | src/engine/ai/aiController.ts:142 (computeIdealInput) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 27.4 | 24 |
| other | 23.0 | 20 |
| gameLoop | 21.2 | 19 |
| engine-root | 16.5 | 15 |
| ai | 6.2 | 5 |
| simulator | 5.3 | 5 |
| themes | 0.3 | 0 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 25.14s | 25.6 | — |
| 28.56s | 30.1 | — |
| 29.87s | 25.6 | — |
| 30.42s | 28.4 | — |

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3668
- avg renderFrame: 0.54ms
- p50 0.50 · p95 1.10 · p99 3.10 · max 44.00
- avg handler (incl cosmetic ticks): 0.56ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3668 | 1985.0 | 0.54 | 1.10 |
| render.fg-nature | 3668 | 529.5 | 0.14 | 0.20 |
| render.overlay | 3668 | 309.7 | 0.08 | 0.30 |
| render.players | 3668 | 256.3 | 0.07 | 0.20 |
| render.bg | 3668 | 254.3 | 0.07 | 0.20 |
| render.particles | 3668 | 197.8 | 0.05 | 0.20 |
| render.entities | 3668 | 89.1 | 0.02 | 0.10 |
| render.afterimages | 3668 | 64.8 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 44.00 | renderFrame 43.80ms, render.overlay 37.50ms, render.players 2.90ms, render.fg-nature 1.00ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1684
- avg 17.89ms (56 fps observed) · p50 17.60 · p95 18.90 · p99 22.80 · max 52.50
- frame drops (>20.67ms): 28/1684 (1.7%)
- heavy drops (>33.33ms): 2/1684

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
