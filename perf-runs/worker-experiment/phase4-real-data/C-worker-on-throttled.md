# Perf Profile — 2026-05-09T06:40:20.852Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit e9b2753
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 17.8ms (56 fps)
- p50 17.7 · p95 18.7 · p99 18.9 · max 19.2
- long(>16.67ms): 600/600 (100.0%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 9.7MB · peak 14.7MB · end 14.7MB
- growth 5.0MB · sawtooth amplitude ~5.0MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 848 | 667.9 | 0.79 | 1.70 |
| fixedUpdate | 1812 | 1106.5 | 0.61 | 1.30 |
| simulator.perPlayerPhysics | 1812 | 802.8 | 0.44 | 1.00 |
| tickCosmetic | 1695 | 692.3 | 0.41 | 1.40 |
| cosmetic.playerTransition | 848 | 205.8 | 0.24 | 0.90 |
| cosmetic.playerCosmetic | 848 | 205.0 | 0.24 | 0.90 |
| awareness | 2133 | 180.0 | 0.08 | 0.30 |
| cosmetic.particles | 848 | 63.3 | 0.07 | 0.20 |
| cosmetic.reactive | 424 | 30.9 | 0.07 | 0.40 |
| gameplay.stomp | 1812 | 121.7 | 0.07 | 0.20 |
| cosmetic.surfaceImpact | 848 | 41.8 | 0.05 | 0.20 |
| cosmetic.wildlife | 424 | 16.5 | 0.04 | 0.20 |
| cosmetic.environment | 848 | 29.2 | 0.03 | 0.20 |
| cosmetic.entityTransition | 848 | 27.4 | 0.03 | 0.20 |
| cosmetic.hudFeedback | 848 | 19.9 | 0.02 | 0.20 |
| gameplay.match | 1812 | 36.0 | 0.02 | 0.20 |
| gameplay.hazard | 1812 | 31.0 | 0.02 | 0.10 |
| gameplay.arenaEntity | 1812 | 28.5 | 0.02 | 0.10 |
| gameplay.carrot | 1812 | 11.9 | 0.01 | 0.00 |
| gameplay.effectZone | 1812 | 10.7 | 0.01 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2499ms)

| % | ms | File:line |
|---|-----|-----------|
| 45.4 | 1135 | src/engine/worker/RendererProxy.ts:321 (post) |
| 5.2 | 130 | :0 (postMessage) |
| 5.0 | 126 | :0 (requestAnimationFrame) |
| 1.9 | 47 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.6 | 39 | src/engine/gameLoop/cosmetics/playerCosmetics.ts:22 (DM) |
| 1.2 | 29 | :0 (createBufferSource) |
| 1.1 | 28 | src/engine/ai/awareness.ts:70 (yA) |
| 1.1 | 28 | :0 (createBufferSource) |
| 1.0 | 25 | :0 (postMessage) |
| 1.0 | 25 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.9 | 22 | node_modules/howler/dist/howler.js:856 (g) |
| 0.8 | 19 | :0 (setTimeout) |
| 0.7 | 18 | node_modules/howler/dist/howler.js:741 (play) |
| 0.7 | 17 | src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts:33 (cosmeticUpdate) |
| 0.6 | 16 | node_modules/howler/dist/howler.js:856 (g) |
| 0.6 | 16 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:218 (cosmeticUpdate) |
| 0.6 | 16 | :0 (connect) |
| 0.6 | 16 | src/engine/gameLoop/cosmetics/entityTransitions.ts:8 (mM) |
| 0.6 | 15 | src/engine/gameLoop/gameplay/stomps.ts:16 (Nj) |
| 0.6 | 14 | src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts:169 (_tickBucket) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/gameplay/stomps.ts:16 (Nj) |
| 0.00 | src/engine/gameLoop/gameplay/match.ts:5 (Lj) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:50 (spawnDustParticles) |
| 0.00 | node_modules/howler/dist/howler.js:856 (g) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| worker | 46.1 | 1152 |
| other | 23.5 | 588 |
| gameLoop | 15.3 | 381 |
| engine-root | 8.2 | 204 |
| ai | 2.7 | 67 |
| simulator | 1.9 | 47 |
| themes | 0.8 | 20 |
| input | 0.7 | 18 |
| audio | 0.7 | 17 |
| rendering | 0.1 | 3 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
