# Perf Profile — 2026-05-09T06:02:14.519Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit da6bf83
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.9ms (56 fps)
- p50 17.7 · p95 18.8 · p99 21.1 · max 33.7
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 1/600

## Heap timeline (1Hz)

- start 11.9MB · peak 15.2MB · end 13.3MB
- growth 1.4MB · sawtooth amplitude ~4.1MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 841 | 110.7 | 0.13 | 0.30 |
| fixedUpdate | 1806 | 197.5 | 0.11 | 0.20 |
| simulator.perPlayerPhysics | 1806 | 137.1 | 0.08 | 0.20 |
| tickCosmetic | 1682 | 115.2 | 0.07 | 0.20 |
| cosmetic.playerTransition | 841 | 38.1 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 841 | 26.5 | 0.03 | 0.10 |
| cosmetic.particles | 841 | 13.6 | 0.02 | 0.10 |
| awareness | 2117 | 33.0 | 0.02 | 0.10 |
| gameplay.stomp | 1806 | 22.0 | 0.01 | 0.10 |
| cosmetic.reactive | 421 | 4.3 | 0.01 | 0.10 |
| cosmetic.wildlife | 421 | 3.3 | 0.01 | 0.10 |
| cosmetic.entityTransition | 841 | 6.0 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 841 | 5.9 | 0.01 | 0.10 |
| cosmetic.environment | 841 | 4.9 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 841 | 3.6 | 0.00 | 0.00 |
| gameplay.arenaEntity | 1806 | 7.6 | 0.00 | 0.00 |
| gameplay.hazard | 1806 | 7.2 | 0.00 | 0.00 |
| gameplay.match | 1806 | 5.1 | 0.00 | 0.00 |
| gameplay.effectZone | 1806 | 2.7 | 0.00 | 0.00 |
| gameplay.carrot | 1806 | 2.0 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 83ms)

| % | ms | File:line |
|---|-----|-----------|
| 22.4 | 19 | src/engine/worker/RendererProxy.ts:267 (post) |
| 13.6 | 11 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 9.9 | 8 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 4.0 | 3 | src/engine/ai/awareness.ts:70 (yA) |
| 3.8 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 3.8 | 3 | :0 (postMessage) |
| 2.8 | 2 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:48 (MM) |
| 2.5 | 2 | src/engine/gameLoop/cosmetics/gibs.ts:79 (vM) |
| 2.4 | 2 | src/engine/physics.ts:129 (LO) |
| 2.2 | 2 | src/engine/stomp.ts:83 (EO) |
| 2.0 | 2 | src/engine/gameLoop/gameplay/ArenaEntitySystem.ts:46 (fixedUpdate) |
| 2.0 | 2 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 2.0 | 2 | :0 (disconnect) |
| 2.0 | 2 | node_modules/howler/dist/howler.js:1894 (_emit) |
| 1.9 | 2 | node_modules/howler/dist/howler.js:1213 (volume) |
| 1.9 | 2 | src/engine/gameLoop/gameplay/HazardSystem.ts:36 (fixedUpdate) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts:169 (_tickBucket) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/HUDFeedbackSystem.ts:54 (_detectComboKills) |
| 1.7 | 1 | src/engine/physics.ts:241 (zO) |
| 1.7 | 1 | src/engine/ai/utility.ts:378 (FA) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:117 (applyHazardHitVFX) |
| 0.00 | src/engine/gameLoop/gameplay/HazardSystem.ts:36 (fixedUpdate) |
| 0.00 | node_modules/howler/dist/howler.js:856 (g) |
| 0.00 | src/hooks/useScaler.ts:76 (s) |
| 0.00 | src/engine/gameLoop/gameplay/hazards.ts:25 (ej) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 35.0 | 29 |
| worker | 22.4 | 19 |
| gameLoop | 19.1 | 16 |
| engine-root | 12.7 | 11 |
| ai | 6.4 | 5 |
| simulator | 3.8 | 3 |
| themes | 0.4 | 0 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 29.55s | 33.7 | — |
| 30.11s | 28.7 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
