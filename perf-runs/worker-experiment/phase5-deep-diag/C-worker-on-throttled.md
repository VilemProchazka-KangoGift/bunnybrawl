# Perf Profile — 2026-05-10T10:09:29.814Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit ab50b28
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (56 fps)
- p50 17.7 · p95 19.0 · p99 28.0 · max 31.8
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 12.6MB · peak 14.7MB · end 14.7MB
- growth 2.1MB · sawtooth amplitude ~3.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 841 | 657.8 | 0.78 | 1.70 |
| fixedUpdate | 1811 | 1067.6 | 0.59 | 1.20 |
| simulator.perPlayerPhysics | 1811 | 771.2 | 0.43 | 1.00 |
| tickCosmetic | 1682 | 679.5 | 0.40 | 1.40 |
| cosmetic.playerTransition | 841 | 222.3 | 0.26 | 0.90 |
| cosmetic.playerCosmetic | 841 | 164.0 | 0.20 | 0.80 |
| awareness | 1876 | 201.4 | 0.11 | 0.30 |
| cosmetic.particles | 841 | 81.2 | 0.10 | 0.30 |
| cosmetic.reactive | 421 | 34.7 | 0.08 | 0.30 |
| gameplay.stomp | 1811 | 113.3 | 0.06 | 0.20 |
| cosmetic.wildlife | 421 | 17.7 | 0.04 | 0.20 |
| cosmetic.surfaceImpact | 841 | 34.9 | 0.04 | 0.20 |
| cosmetic.environment | 841 | 31.9 | 0.04 | 0.20 |
| cosmetic.entityTransition | 841 | 23.3 | 0.03 | 0.20 |
| cosmetic.hudFeedback | 841 | 22.4 | 0.03 | 0.20 |
| gameplay.match | 1811 | 36.2 | 0.02 | 0.20 |
| gameplay.arenaEntity | 1811 | 34.1 | 0.02 | 0.20 |
| gameplay.hazard | 1811 | 24.7 | 0.01 | 0.10 |
| gameplay.carrot | 1811 | 12.1 | 0.01 | 0.00 |
| gameplay.effectZone | 1811 | 11.6 | 0.01 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2735ms)

| % | ms | File:line |
|---|-----|-----------|
| 50.4 | 1377 | src/engine/worker/RendererProxy.ts:425 (post) |
| 4.3 | 118 | :0 (requestAnimationFrame) |
| 4.1 | 113 | :0 (postMessage) |
| 1.8 | 49 | src/engine/worker/RendererProxy.ts:241 (e) |
| 1.7 | 47 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.4 | 38 | src/engine/gameLoop/cosmetics/gibs.ts:79 (vM) |
| 1.3 | 35 | src/engine/ai/awareness.ts:70 (yA) |
| 1.2 | 32 | :0 (createBufferSource) |
| 1.1 | 29 | src/engine/gameLoop/cosmetics/playerCosmetics.ts:22 (DM) |
| 1.0 | 28 | :0 (createBufferSource) |
| 0.9 | 24 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.8 | 21 | :0 (postMessage) |
| 0.7 | 20 | src/engine/perfTrace.ts:94 (end) |
| 0.7 | 18 | :0 (setTimeout) |
| 0.6 | 18 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 0.6 | 16 | src/engine/worker/RendererProxy.ts:425 (post) |
| 0.6 | 16 | :0 (setTimeout) |
| 0.6 | 15 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:218 (cosmeticUpdate) |
| 0.5 | 15 | src/engine/gameLoop/cosmetics/particles.ts:161 (vO) |
| 0.5 | 14 | src/engine/physics.ts:129 (LO) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/gameplay/MatchSystem.ts:66 (fixedUpdate) |
| 0.00 | src/engine/rendering/idleActions.ts:161 (pu) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | src/engine/worker/RendererProxy.ts:241 (e) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 53.0 | 1450 |
| other | 19.0 | 520 |
| gameLoop | 14.7 | 402 |
| engine-root | 7.5 | 205 |
| ai | 2.5 | 68 |
| simulator | 1.8 | 50 |
| themes | 0.9 | 25 |
| input | 0.2 | 6 |
| audio | 0.2 | 5 |
| rendering | 0.2 | 5 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 27.14s | 28.4 | — |
| 28.74s | 29.3 | — |
| 28.82s | 31.0 | — |
| 29.89s | 27.7 | — |
| 30.24s | 28.0 | — |
| 30.37s | 28.0 | — |
| 30.44s | 31.8 | — |

## Worker offload diagnostics

> CPU throttle 4× applied to main thread (workers run on a separate thread, unaffected).

### Worker render time (per-frame distribution)

- frames: 3741
- avg renderFrame: 0.55ms
- p50 0.50 · p95 1.20 · p99 2.80 · max 34.40
- avg handler (incl cosmetic ticks): 0.57ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3741 | 2059.5 | 0.55 | 1.10 |
| render.fg-nature | 3741 | 545.3 | 0.15 | 0.20 |
| render.overlay | 3741 | 295.0 | 0.08 | 0.30 |
| render.players | 3741 | 263.9 | 0.07 | 0.20 |
| render.bg | 3741 | 247.8 | 0.07 | 0.20 |
| render.particles | 3741 | 238.5 | 0.06 | 0.20 |
| render.entities | 3741 | 106.6 | 0.03 | 0.10 |
| render.afterimages | 3741 | 72.7 | 0.02 | 0.10 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 34.40 | renderFrame 34.20ms, render.overlay 28.20ms, render.players 2.80ms, render.fg-nature 1.00ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1685
- avg 18.06ms (55 fps observed) · p50 17.80 · p95 18.80 · p99 23.20 · max 298.00
- frame drops (>20.67ms): 29/1685 (1.7%)
- heavy drops (>33.33ms): 1/1685

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
