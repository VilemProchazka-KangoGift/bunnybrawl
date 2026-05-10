# Perf Profile — 2026-05-08T21:50:02.015Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 4b2f496
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 6.4ms (156 fps)
- p50 5.9 · p95 11.9 · p99 14.9 · max 16.1
- long(>16.67ms): 0/600 (0.0%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 11.8MB · peak 13.0MB · end 10.7MB
- growth -1.1MB · sawtooth amplitude ~3.8MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4503 | 3108.4 | 0.69 | 1.10 |
| render.fg-nature | 4503 | 780.0 | 0.17 | 0.30 |
| fixedUpdate | 1809 | 278.5 | 0.15 | 0.30 |
| cosmeticStep | 2252 | 308.8 | 0.14 | 0.30 |
| simulator.perPlayerPhysics | 1809 | 192.3 | 0.11 | 0.20 |
| render.bg | 4503 | 460.2 | 0.10 | 0.20 |
| render.players | 4503 | 447.0 | 0.10 | 0.20 |
| render.overlay | 4503 | 390.7 | 0.09 | 0.30 |
| tickCosmetic | 4503 | 331.0 | 0.07 | 0.30 |
| render.particles | 4503 | 275.3 | 0.06 | 0.20 |
| render.entities | 4503 | 223.2 | 0.05 | 0.10 |
| cosmetic.playerCosmetic | 2252 | 110.3 | 0.05 | 0.20 |
| render.afterimages | 4503 | 211.2 | 0.05 | 0.10 |
| cosmetic.playerTransition | 2252 | 73.3 | 0.03 | 0.20 |
| awareness | 2138 | 45.1 | 0.02 | 0.10 |
| gameplay.stomp | 1809 | 26.4 | 0.01 | 0.10 |
| cosmetic.particles | 2252 | 28.7 | 0.01 | 0.10 |
| cosmetic.reactive | 1126 | 12.0 | 0.01 | 0.10 |
| cosmetic.environment | 2252 | 21.8 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2252 | 16.0 | 0.01 | 0.10 |
| gameplay.hazard | 1809 | 12.8 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2252 | 14.0 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1809 | 10.7 | 0.01 | 0.10 |
| cosmetic.wildlife | 1126 | 6.3 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 2252 | 8.0 | 0.00 | 0.00 |
| gameplay.match | 1809 | 6.2 | 0.00 | 0.00 |
| gameplay.carrot | 1809 | 4.0 | 0.00 | 0.00 |
| gameplay.effectZone | 1809 | 2.8 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3471ms)

| % | ms | File:line |
|---|-----|-----------|
| 4.8 | 166 | :0 (drawImage) |
| 3.2 | 111 | :0 (drawImage) |
| 3.2 | 111 | src/engine/perfTrace.ts:110 (measure) |
| 3.1 | 109 | :0 (stroke) |
| 2.9 | 102 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 2.1 | 74 | src/engine/rendering/particles.ts:75 (jc) |
| 1.9 | 66 | :0 (drawImage) |
| 1.8 | 62 | :0 (requestAnimationFrame) |
| 1.8 | 62 | :0 (drawImage) |
| 1.6 | 55 | src/engine/rendering/players.ts:173 (Lu) |
| 1.4 | 49 | src/engine/fpsCounter.ts:108 (gh) |
| 1.4 | 48 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.2 | 42 | :0 (fill) |
| 1.1 | 39 | :0 (fill) |
| 1.1 | 39 | :0 (fillText) |
| 1.1 | 37 | src/engine/arenas/packs/castle.ts:786 (drawWeatherParticle) |
| 1.1 | 37 | src/engine/themes/drawPrimitives/foreground.ts:271 (ea) |
| 1.1 | 37 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.0 | 36 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.0 | 35 | :0 (clearRect) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:79 (spawnKillSplatter) |
| 0.00 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/ai/aiController.ts:70 (getInput) |
| 0.00 | src/engine/gameLoop/cosmetics/playerCosmetics.ts:22 (TM) |
| 0.00 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:59 (jM) |
| 0.00 | src/engine/rendering/collectibles.ts:12 (us) |
| 0.00 | node_modules/howler/dist/howler.js:2214 (init) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 53.7 | 1863 |
| engine-root | 14.8 | 515 |
| rendering | 11.9 | 413 |
| arenas | 7.1 | 248 |
| gameLoop | 6.1 | 211 |
| ai | 1.7 | 57 |
| themes | 1.6 | 55 |
| simulator | 1.4 | 48 |
| lighting | 1.1 | 38 |
| input | 0.3 | 11 |
| characters | 0.2 | 6 |
| audio | 0.1 | 5 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
