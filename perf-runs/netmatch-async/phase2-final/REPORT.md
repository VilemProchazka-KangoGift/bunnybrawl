# Perf Profile — 2026-05-10T22:28:15.670Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 8f3de03
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.5ms (57 fps)
- p50 17.4 · p95 18.7 · p99 19.1 · max 19.2
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.9MB · peak 14.1MB · end 13.3MB
- growth 2.4MB · sawtooth amplitude ~3.5MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 573 | 123.9 | 0.22 | 0.40 |
| fixedUpdate | 1809 | 290.4 | 0.16 | 0.30 |
| simulator.perPlayerPhysics | 1809 | 203.1 | 0.11 | 0.30 |
| cosmetic.playerTransition | 573 | 54.5 | 0.10 | 0.30 |
| tickCosmetic | 1718 | 130.3 | 0.08 | 0.30 |
| cosmetic.playerCosmetic | 573 | 29.6 | 0.05 | 0.20 |
| cosmetic.particles | 573 | 14.6 | 0.03 | 0.10 |
| awareness | 2005 | 47.0 | 0.02 | 0.10 |
| gameplay.stomp | 1809 | 26.1 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 573 | 6.5 | 0.01 | 0.10 |
| cosmetic.entityTransition | 573 | 5.6 | 0.01 | 0.10 |
| cosmetic.environment | 573 | 4.6 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1809 | 13.9 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 573 | 3.9 | 0.01 | 0.10 |
| gameplay.hazard | 1809 | 9.9 | 0.01 | 0.10 |
| gameplay.match | 1809 | 7.7 | 0.00 | 0.00 |
| cosmetic.reactive | 287 | 1.0 | 0.00 | 0.00 |
| gameplay.carrot | 1809 | 4.8 | 0.00 | 0.00 |
| gameplay.effectZone | 1809 | 3.1 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 110ms)

| % | ms | File:line |
|---|-----|-----------|
| 23.4 | 26 | src/engine/worker/RendererProxy.ts:480 (post) |
| 6.1 | 7 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 5.9 | 7 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 5.6 | 6 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 4.6 | 5 | src/engine/perfTrace.ts:89 (begin) |
| 3.0 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 2.9 | 3 | src/engine/gameLoop/cosmetics/playerTransitions.ts:59 (Aj) |
| 2.7 | 3 | src/engine/gameLoop/GameLoop.ts:747 (loop) |
| 2.7 | 3 | :0 (postMessage) |
| 1.9 | 2 | src/engine/gameLoop/cosmetics/gibs.ts:79 (Ej) |
| 1.7 | 2 | src/engine/ai/awareness.ts:70 (Dk) |
| 1.6 | 2 | src/engine/physics.ts:129 (GD) |
| 1.6 | 2 | src/engine/worker/RendererProxy.ts:280 (e) |
| 1.5 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:77 (Uj) |
| 1.5 | 2 | :0 (clearTimeout) |
| 1.5 | 2 | :0 (disconnect) |
| 1.5 | 2 | :0 (Audio) |
| 1.5 | 2 | src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts:97 (fixedUpdate) |
| 1.4 | 2 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 1.4 | 2 | src/engine/worker/RendererProxy.ts:301 (handleMessage) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:747 (loop) |
| 0.00 | src/engine/worker/RendererProxy.ts:280 (e) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (_D) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts:43 (spawnDustParticles) |
| 0.00 | src/engine/gameLoop/cosmetics/playerTransitions.ts:21 (kj) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 32.0 | 35 |
| worker | 26.4 | 29 |
| gameLoop | 19.3 | 21 |
| engine-root | 15.8 | 17 |
| simulator | 3.0 | 3 |
| ai | 2.1 | 2 |
| input | 1.4 | 2 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## Worker offload diagnostics

### Worker render time (per-frame distribution)

- frames: 3067
- avg renderFrame: 0.80ms
- p50 0.80 · p95 1.50 · p99 2.30 · max 53.00
- avg handler (incl cosmetic ticks): 0.83ms
- long(>12ms): 1 · long(>16.67ms): 1
- ⚠ 1 frames exceeded the histogram upper bound

### Worker section timings (perfTrace inside the worker)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 3067 | 2428.5 | 0.79 | 1.40 |
| render.fg-nature | 3067 | 640.1 | 0.21 | 0.30 |
| render.overlay | 3067 | 376.0 | 0.12 | 0.40 |
| render.players | 3067 | 346.1 | 0.11 | 0.30 |
| render.bg | 3067 | 318.3 | 0.10 | 0.20 |
| render.particles | 3067 | 210.8 | 0.07 | 0.30 |
| render.entities | 3067 | 143.1 | 0.05 | 0.10 |
| render.afterimages | 3067 | 5.5 | 0.00 | 0.00 |

### Worker long frames (>12ms — first 1)

| frame ms | hot sections (this-frame totals) |
|----------|----------------------------------|
| 53.00 | renderFrame 52.50ms, render.overlay 43.50ms, render.players 4.30ms, render.bg 1.50ms |

### Compositor frame pacing (requestVideoFrameCallback deltas)

- presentations: 1719
- avg 17.55ms (57 fps observed) · p50 17.40 · p95 18.70 · p99 19.10 · max 69.50
- frame drops (>20.67ms): 1/1719 (0.1%)
- heavy drops (>33.33ms): 1/1719

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
