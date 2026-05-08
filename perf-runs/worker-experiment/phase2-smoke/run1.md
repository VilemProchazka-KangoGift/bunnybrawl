# Perf Profile — 2026-05-08T22:02:26.082Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit c40fe35
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 7.0ms (143 fps)
- p50 6.1 · p95 13.8 · p99 15.6 · max 24.0
- long(>16.67ms): 1/600 (0.2%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 13.3MB · peak 13.4MB · end 11.3MB
- growth -2.0MB · sawtooth amplitude ~4.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4465 | 3111.9 | 0.70 | 1.10 |
| render.fg-nature | 4465 | 786.0 | 0.18 | 0.30 |
| fixedUpdate | 1809 | 266.8 | 0.15 | 0.30 |
| cosmeticStep | 2232 | 323.0 | 0.14 | 0.30 |
| render.bg | 4465 | 447.5 | 0.10 | 0.20 |
| simulator.perPlayerPhysics | 1809 | 179.8 | 0.10 | 0.20 |
| render.players | 4465 | 424.2 | 0.10 | 0.20 |
| render.overlay | 4465 | 405.4 | 0.09 | 0.30 |
| tickCosmetic | 4465 | 346.2 | 0.08 | 0.30 |
| render.particles | 4465 | 263.1 | 0.06 | 0.20 |
| render.entities | 4465 | 244.8 | 0.05 | 0.20 |
| render.afterimages | 4465 | 211.6 | 0.05 | 0.10 |
| cosmetic.playerCosmetic | 2232 | 105.2 | 0.05 | 0.20 |
| cosmetic.playerTransition | 2232 | 93.4 | 0.04 | 0.20 |
| awareness | 2040 | 38.0 | 0.02 | 0.10 |
| gameplay.stomp | 1809 | 24.9 | 0.01 | 0.10 |
| cosmetic.reactive | 1116 | 13.3 | 0.01 | 0.10 |
| cosmetic.particles | 2232 | 23.4 | 0.01 | 0.10 |
| cosmetic.environment | 2232 | 18.3 | 0.01 | 0.10 |
| cosmetic.wildlife | 1116 | 8.5 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2232 | 16.6 | 0.01 | 0.10 |
| gameplay.hazard | 1809 | 12.1 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1809 | 11.8 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2232 | 13.9 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 2232 | 11.8 | 0.01 | 0.10 |
| gameplay.match | 1809 | 7.5 | 0.00 | 0.00 |
| gameplay.carrot | 1809 | 3.7 | 0.00 | 0.00 |
| gameplay.effectZone | 1809 | 2.3 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3422ms)

| % | ms | File:line |
|---|-----|-----------|
| 5.2 | 178 | :0 (drawImage) |
| 3.7 | 125 | :0 (stroke) |
| 3.4 | 115 | :0 (drawImage) |
| 2.6 | 89 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 2.1 | 73 | src/engine/perfTrace.ts:110 (measure) |
| 1.8 | 61 | :0 (requestAnimationFrame) |
| 1.7 | 58 | :0 (fillText) |
| 1.7 | 58 | src/engine/rendering/particles.ts:75 (jc) |
| 1.7 | 57 | :0 (drawImage) |
| 1.6 | 54 | src/engine/fpsCounter.ts:108 (gh) |
| 1.5 | 50 | :0 (drawImage) |
| 1.4 | 48 | :0 (fill) |
| 1.3 | 44 | :0 (ellipse) |
| 1.2 | 43 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.2 | 42 | src/engine/themes/drawPrimitives/foreground.ts:271 (ea) |
| 1.2 | 41 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.1 | 38 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.0 | 35 | :0 (clearRect) |
| 0.9 | 32 | src/engine/rendering/players.ts:173 (Lu) |
| 0.9 | 30 | src/engine/rendering/hazards/creatures.ts:17 ($c) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (sO) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/simulator/Simulator.ts:118 (applyHazardHitVFX) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:161 (gO) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (sO) |
| 0.00 | node_modules/howler/dist/howler.js:2136 (_refreshBuffer) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 56.1 | 1920 |
| engine-root | 14.6 | 501 |
| rendering | 10.9 | 371 |
| arenas | 6.5 | 223 |
| gameLoop | 6.3 | 215 |
| themes | 1.5 | 52 |
| simulator | 1.4 | 47 |
| ai | 1.3 | 43 |
| lighting | 1.0 | 35 |
| input | 0.3 | 10 |
| characters | 0.1 | 3 |
| audio | 0.0 | 2 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
