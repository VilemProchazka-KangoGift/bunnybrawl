# Perf Profile — 2026-05-09T06:03:44.415Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit da6bf83
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 18.0ms (56 fps)
- p50 17.9 · p95 18.9 · p99 21.2 · max 28.8
- long(>16.67ms): 599/600 (99.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 11.9MB · peak 15.0MB · end 15.0MB
- growth 3.0MB · sawtooth amplitude ~4.0MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| cosmeticStep | 843 | 114.6 | 0.14 | 0.30 |
| fixedUpdate | 1807 | 209.0 | 0.12 | 0.20 |
| simulator.perPlayerPhysics | 1807 | 138.7 | 0.08 | 0.20 |
| tickCosmetic | 1686 | 118.5 | 0.07 | 0.30 |
| cosmetic.playerTransition | 843 | 43.2 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 843 | 21.2 | 0.03 | 0.10 |
| cosmetic.particles | 843 | 17.1 | 0.02 | 0.10 |
| awareness | 1919 | 30.0 | 0.02 | 0.10 |
| gameplay.stomp | 1807 | 22.2 | 0.01 | 0.10 |
| cosmetic.reactive | 421 | 4.8 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 843 | 7.3 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1807 | 12.0 | 0.01 | 0.10 |
| cosmetic.entityTransition | 843 | 5.2 | 0.01 | 0.10 |
| cosmetic.environment | 843 | 5.2 | 0.01 | 0.10 |
| gameplay.hazard | 1807 | 9.8 | 0.01 | 0.10 |
| cosmetic.wildlife | 421 | 2.2 | 0.01 | 0.00 |
| cosmetic.hudFeedback | 843 | 3.8 | 0.00 | 0.00 |
| gameplay.match | 1807 | 6.3 | 0.00 | 0.00 |
| gameplay.carrot | 1807 | 2.6 | 0.00 | 0.00 |
| gameplay.effectZone | 1807 | 1.7 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 114ms)

| % | ms | File:line |
|---|-----|-----------|
| 24.5 | 28 | src/engine/worker/RendererProxy.ts:267 (post) |
| 8.5 | 10 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 5.4 | 6 | :0 (requestAnimationFrame) |
| 4.2 | 5 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 3.6 | 4 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 2.9 | 3 | src/engine/fpsCounter.ts:17 (sh) |
| 2.2 | 3 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.9 | 2 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |
| 1.8 | 2 | src/engine/sfxCooldowns.ts:27 (decay) |
| 1.7 | 2 | :0 (postMessage) |
| 1.6 | 2 | src/engine/hazardCollision.ts:127 (Cj) |
| 1.6 | 2 | src/engine/input/RuleBasedBot.ts:28 (getAction) |
| 1.5 | 2 | src/engine/gameLoop/gameplay/PlayerCollisionSystem.ts:33 (checkCollisions) |
| 1.4 | 2 | src/engine/perfTrace.ts:64 (kk) |
| 1.4 | 2 | :0 (now) |
| 1.4 | 2 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 1.4 | 2 | node_modules/howler/dist/howler.js:461 (_autoSuspend) |
| 1.4 | 2 | node_modules/howler/dist/howler.js:1894 (_emit) |
| 1.4 | 2 | src/engine/gameLoop/cosmetics/wildlife.ts:150 (Eo) |
| 1.4 | 2 | src/engine/gameLoop/cosmetics/EntityTransitionSystem.ts:28 (cosmeticUpdate) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | node_modules/howler/dist/howler.js:2166 (_cleanBuffer) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:117 (applyHazardHitVFX) |
| 0.00 | src/engine/ai/aiController.ts:70 (getInput) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 30.5 | 35 |
| worker | 24.5 | 28 |
| gameLoop | 19.8 | 23 |
| engine-root | 16.2 | 18 |
| input | 2.9 | 3 |
| simulator | 2.3 | 3 |
| themes | 1.9 | 2 |
| ai | 1.9 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 32.93s | 25.6 | — |
| 33.78s | 28.8 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
