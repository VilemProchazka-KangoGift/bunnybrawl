# Perf Profile — 2026-05-08T21:51:31.305Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 4b2f496
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 6.0ms (166 fps)
- p50 5.7 · p95 7.9 · p99 13.5 · max 13.9
- long(>16.67ms): 0/600 (0.0%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.1MB · peak 13.2MB · end 11.9MB
- growth 1.8MB · sawtooth amplitude ~4.1MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4490 | 3155.9 | 0.70 | 1.20 |
| render.fg-nature | 4490 | 781.4 | 0.17 | 0.30 |
| fixedUpdate | 1810 | 269.5 | 0.15 | 0.30 |
| cosmeticStep | 2245 | 312.3 | 0.14 | 0.30 |
| render.bg | 4490 | 453.6 | 0.10 | 0.20 |
| simulator.perPlayerPhysics | 1810 | 179.5 | 0.10 | 0.20 |
| render.players | 4490 | 437.7 | 0.10 | 0.20 |
| render.overlay | 4490 | 425.5 | 0.09 | 0.30 |
| tickCosmetic | 4490 | 334.3 | 0.07 | 0.30 |
| render.particles | 4490 | 256.0 | 0.06 | 0.20 |
| render.entities | 4490 | 241.1 | 0.05 | 0.10 |
| cosmetic.playerCosmetic | 2245 | 108.2 | 0.05 | 0.20 |
| render.afterimages | 4490 | 205.6 | 0.05 | 0.10 |
| cosmetic.playerTransition | 2245 | 75.0 | 0.03 | 0.10 |
| awareness | 1965 | 38.0 | 0.02 | 0.10 |
| gameplay.stomp | 1810 | 25.8 | 0.01 | 0.10 |
| cosmetic.particles | 2245 | 24.2 | 0.01 | 0.10 |
| cosmetic.reactive | 1123 | 11.5 | 0.01 | 0.10 |
| cosmetic.environment | 2245 | 22.3 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2245 | 19.0 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2245 | 16.3 | 0.01 | 0.10 |
| gameplay.hazard | 1810 | 11.7 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1810 | 10.2 | 0.01 | 0.10 |
| cosmetic.wildlife | 1123 | 5.6 | 0.00 | 0.00 |
| gameplay.match | 1810 | 8.1 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 2245 | 9.3 | 0.00 | 0.00 |
| gameplay.carrot | 1810 | 3.8 | 0.00 | 0.00 |
| gameplay.effectZone | 1810 | 2.8 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3560ms)

| % | ms | File:line |
|---|-----|-----------|
| 5.9 | 210 | :0 (drawImage) |
| 4.0 | 143 | :0 (stroke) |
| 3.6 | 127 | :0 (drawImage) |
| 3.2 | 113 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 3.1 | 111 | src/engine/perfTrace.ts:110 (measure) |
| 1.9 | 68 | src/engine/fpsCounter.ts:108 (gh) |
| 1.6 | 56 | :0 (drawImage) |
| 1.5 | 53 | src/engine/rendering/particles.ts:75 (jc) |
| 1.4 | 50 | :0 (fillText) |
| 1.4 | 49 | :0 (fill) |
| 1.3 | 47 | :0 (drawImage) |
| 1.3 | 46 | :0 (requestAnimationFrame) |
| 1.3 | 45 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.2 | 44 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.2 | 42 | :0 (fill) |
| 1.1 | 40 | :0 (clearRect) |
| 1.1 | 39 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.0 | 34 | :0 (ellipse) |
| 0.9 | 33 | src/engine/arenas/packs/castle.ts:786 (drawWeatherParticle) |
| 0.9 | 30 | src/engine/rendering/players.ts:173 (Lu) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/stomp.ts:12 (SO) |
| 0.00 | :0 (set) |
| 0.00 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | src/engine/rendering/surfaceImpact.ts:74 (Xu) |
| 0.00 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:70 (MM) |
| 0.00 | src/engine/gameLoop/gameplay/playerCollisions.ts:100 (Ej) |
| 0.00 | src/engine/fpsCounter.ts:108 (gh) |
| 0.00 | src/engine/ai/awareness.ts:70 (_A) |
| 0.00 | node_modules/howler/dist/howler.js:856 (g) |
| 0.00 | src/engine/rendering/surfaceImpact.ts:33 (Ju) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 55.4 | 1974 |
| engine-root | 14.6 | 521 |
| rendering | 11.1 | 394 |
| arenas | 7.0 | 249 |
| gameLoop | 6.5 | 233 |
| ai | 1.5 | 54 |
| lighting | 1.4 | 49 |
| simulator | 1.3 | 45 |
| themes | 0.6 | 22 |
| input | 0.4 | 13 |
| characters | 0.2 | 8 |
| audio | 0.0 | 2 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
