# Perf Profile — 2026-05-09T06:38:50.763Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit e9b2753
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.9ms (56 fps)
- p50 17.8 · p95 18.8 · p99 21.1 · max 30.1
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 11.3MB · peak 15.0MB · end 13.8MB
- growth 2.4MB · sawtooth amplitude ~4.3MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 842 | 112.9 | 0.13 | 0.30 |
| fixedUpdate | 1807 | 204.5 | 0.11 | 0.20 |
| simulator.perPlayerPhysics | 1807 | 140.9 | 0.08 | 0.20 |
| tickCosmetic | 1685 | 117.8 | 0.07 | 0.20 |
| cosmetic.playerTransition | 842 | 41.0 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 842 | 25.9 | 0.03 | 0.10 |
| awareness | 2097 | 37.8 | 0.02 | 0.10 |
| cosmetic.particles | 842 | 11.6 | 0.01 | 0.10 |
| cosmetic.reactive | 421 | 5.3 | 0.01 | 0.10 |
| gameplay.stomp | 1807 | 20.0 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 842 | 6.6 | 0.01 | 0.10 |
| cosmetic.environment | 842 | 5.9 | 0.01 | 0.10 |
| cosmetic.wildlife | 421 | 2.7 | 0.01 | 0.10 |
| gameplay.hazard | 1807 | 10.3 | 0.01 | 0.10 |
| cosmetic.entityTransition | 842 | 4.7 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1807 | 8.9 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 842 | 3.3 | 0.00 | 0.00 |
| gameplay.match | 1807 | 5.4 | 0.00 | 0.00 |
| gameplay.carrot | 1807 | 2.9 | 0.00 | 0.00 |
| gameplay.effectZone | 1807 | 1.8 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 79ms)

| % | ms | File:line |
|---|-----|-----------|
| 22.1 | 17 | src/engine/worker/RendererProxy.ts:321 (post) |
| 10.2 | 8 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 6.1 | 5 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 4.1 | 3 | :0 (disconnect) |
| 3.9 | 3 | :0 (requestAnimationFrame) |
| 3.0 | 2 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 2.6 | 2 | src/engine/physics.ts:322 (HO) |
| 2.5 | 2 | src/engine/ai/awareness.ts:70 (yA) |
| 2.5 | 2 | src/engine/ai/utility.ts:250 (kA) |
| 2.1 | 2 | src/engine/ai/aiController.ts:70 (getInput) |
| 2.1 | 2 | :0 (setTimeout) |
| 2.1 | 2 | src/engine/gameLoop/gameplay/arenaEntities.ts:38 (uj) |
| 2.1 | 2 | src/engine/autoSlowDetect.ts:41 (sM) |
| 2.0 | 2 | src/engine/fpsCounter.ts:17 (sh) |
| 2.0 | 2 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:218 (cosmeticUpdate) |
| 2.0 | 2 | src/engine/gameLoop/cosmetics/playerCosmetics.ts:22 (DM) |
| 2.0 | 2 | src/engine/physics.ts:129 (LO) |
| 2.0 | 2 | node_modules/howler/dist/howler.js:1925 (_loadQueue) |
| 1.9 | 2 | src/engine/perfTrace.ts:94 (end) |
| 1.9 | 2 | src/engine/rendering/idleActions.ts:194 (hu) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | :0 (find) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 28.4 | 22 |
| worker | 22.1 | 17 |
| engine-root | 18.7 | 15 |
| gameLoop | 18.6 | 15 |
| ai | 7.1 | 6 |
| simulator | 3.0 | 2 |
| rendering | 1.9 | 2 |
| themes | 0.2 | 0 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 27.16s | 28.9 | — |
| 28.51s | 30.1 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
