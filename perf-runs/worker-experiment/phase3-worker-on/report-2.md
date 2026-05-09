# Perf Profile — 2026-05-09T06:02:59.478Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit da6bf83
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (55 fps)
- p50 17.8 · p95 18.8 · p99 24.9 · max 31.4
- long(>16.67ms): 598/600 (99.7%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 12.1MB · peak 14.8MB · end 12.5MB
- growth 0.5MB · sawtooth amplitude ~3.8MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 841 | 114.0 | 0.14 | 0.30 |
| fixedUpdate | 1806 | 210.9 | 0.12 | 0.20 |
| simulator.perPlayerPhysics | 1806 | 145.6 | 0.08 | 0.20 |
| tickCosmetic | 1682 | 117.6 | 0.07 | 0.30 |
| cosmetic.playerTransition | 841 | 40.3 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 841 | 27.1 | 0.03 | 0.20 |
| cosmetic.particles | 841 | 15.7 | 0.02 | 0.10 |
| awareness | 2142 | 34.4 | 0.02 | 0.10 |
| cosmetic.reactive | 420 | 4.8 | 0.01 | 0.10 |
| gameplay.stomp | 1806 | 20.1 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 841 | 6.9 | 0.01 | 0.10 |
| cosmetic.environment | 841 | 6.2 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1806 | 11.2 | 0.01 | 0.10 |
| cosmetic.entityTransition | 841 | 4.0 | 0.00 | 0.00 |
| gameplay.hazard | 1806 | 7.0 | 0.00 | 0.00 |
| cosmetic.wildlife | 420 | 1.6 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 841 | 2.8 | 0.00 | 0.00 |
| gameplay.match | 1806 | 5.3 | 0.00 | 0.00 |
| gameplay.carrot | 1806 | 3.2 | 0.00 | 0.00 |
| gameplay.effectZone | 1806 | 1.9 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 88ms)

| % | ms | File:line |
|---|-----|-----------|
| 15.1 | 13 | src/engine/worker/RendererProxy.ts:267 (post) |
| 14.6 | 13 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 7.5 | 7 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 7.1 | 6 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 5.6 | 5 | :0 (disconnect) |
| 3.9 | 3 | src/engine/gameLoop/cosmetics/gibs.ts:79 (vM) |
| 2.8 | 2 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 2.2 | 2 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 2.1 | 2 | src/engine/gameLoop/gameplay/hazards.ts:87 (nj) |
| 2.1 | 2 | src/engine/gameLoop/cosmetics/entityTransitions.ts:8 (mM) |
| 2.1 | 2 | src/engine/hazardCollision.ts:127 (Cj) |
| 1.9 | 2 | src/engine/physics.ts:129 (LO) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/reactiveDecorations.ts:194 (qa) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:2013 (_clearTimer) |
| 1.8 | 2 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 1.8 | 2 | src/engine/themes/utils.ts:115 (fo) |
| 1.8 | 2 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 1.8 | 2 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |
| 1.7 | 2 | :0 (requestAnimationFrame) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |
| 0.00 | src/engine/gameLoop/gameplay/HazardSystem.ts:36 (fixedUpdate) |
| 0.00 | src/engine/audio/AudioManager.ts:91 (setVolume) |
| 0.00 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:79 (vM) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:79 (spawnKillSplatter) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 34.9 | 31 |
| gameLoop | 23.8 | 21 |
| worker | 15.1 | 13 |
| engine-root | 10.9 | 10 |
| simulator | 7.1 | 6 |
| input | 3.6 | 3 |
| themes | 3.5 | 3 |
| ai | 1.1 | 1 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 24.76s | 31.4 | — |
| 25.49s | 30.7 | — |
| 25.76s | 31.0 | — |
| 29.11s | 29.9 | — |
| 33.14s | 27.7 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
