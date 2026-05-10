# Perf Profile — 2026-05-10T10:40:34.239Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 2b76961
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 6.3ms (158 fps)
- p50 5.9 · p95 10.8 · p99 14.8 · max 17.7
- long(>16.67ms): 1/600 (0.2%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 12.0MB · peak 13.3MB · end 11.4MB
- growth -0.5MB · sawtooth amplitude ~3.9MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4456 | 2871.0 | 0.64 | 1.00 |
| render.fg-nature | 4456 | 726.0 | 0.16 | 0.30 |
| fixedUpdate | 1808 | 250.2 | 0.14 | 0.30 |
| cosmeticStep | 2228 | 276.4 | 0.12 | 0.30 |
| render.bg | 4456 | 411.5 | 0.09 | 0.20 |
| simulator.perPlayerPhysics | 1808 | 166.8 | 0.09 | 0.20 |
| render.players | 4456 | 404.4 | 0.09 | 0.20 |
| render.overlay | 4456 | 396.7 | 0.09 | 0.30 |
| tickCosmetic | 4456 | 296.5 | 0.07 | 0.20 |
| render.particles | 4456 | 236.6 | 0.05 | 0.20 |
| render.entities | 4456 | 193.8 | 0.04 | 0.10 |
| render.afterimages | 4456 | 190.3 | 0.04 | 0.10 |
| cosmetic.playerCosmetic | 2228 | 93.6 | 0.04 | 0.20 |
| cosmetic.playerTransition | 2228 | 69.0 | 0.03 | 0.10 |
| awareness | 2170 | 38.3 | 0.02 | 0.10 |
| gameplay.stomp | 1808 | 27.6 | 0.02 | 0.10 |
| cosmetic.particles | 2228 | 25.7 | 0.01 | 0.10 |
| cosmetic.reactive | 1114 | 11.7 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2228 | 16.8 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2228 | 16.1 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1808 | 12.8 | 0.01 | 0.10 |
| cosmetic.environment | 2228 | 15.5 | 0.01 | 0.10 |
| gameplay.hazard | 1808 | 10.2 | 0.01 | 0.10 |
| cosmetic.wildlife | 1114 | 5.3 | 0.00 | 0.00 |
| gameplay.match | 1808 | 7.8 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 2228 | 7.6 | 0.00 | 0.00 |
| gameplay.carrot | 1808 | 3.8 | 0.00 | 0.00 |
| gameplay.effectZone | 1808 | 2.0 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2039ms)

| % | ms | File:line |
|---|-----|-----------|
| 9.7 | 198 | :0 (drawImage) |
| 3.5 | 71 | :0 (requestAnimationFrame) |
| 3.1 | 63 | src/engine/arenas/packs/castle.ts:39 (Ld) |
| 3.1 | 62 | :0 (fillText) |
| 2.8 | 57 | :0 (drawImage) |
| 2.6 | 52 | :0 (stroke) |
| 2.5 | 51 | src/engine/fpsCounter.ts:109 (yh) |
| 2.3 | 46 | src/engine/perfTrace.ts:110 (measure) |
| 1.8 | 37 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.3 | 27 | :0 (fill) |
| 1.2 | 24 | :0 (drawImage) |
| 1.2 | 24 | :0 (fill) |
| 1.2 | 24 | src/engine/rendering/particles.ts:76 (jc) |
| 1.1 | 22 | :0 (fill) |
| 1.0 | 21 | :0 (fillRect) |
| 1.0 | 20 | src/engine/arenas/packs/castle.ts:786 (drawWeatherParticle) |
| 1.0 | 20 | src/engine/themes/drawPrimitives/foreground.ts:271 (ea) |
| 1.0 | 19 | src/engine/rendering/players.ts:173 (Bu) |
| 0.9 | 19 | :0 (drawImage) |
| 0.9 | 18 | :0 (addColorStop) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.01 | src/engine/gameLoop/GameLoop.ts:723 (loop) |
| 0.00 | src/engine/simulator/Simulator.ts:118 (applyHazardHitVFX) |
| 0.00 | :0 (next) |
| 0.00 | src/engine/ai/aiController.ts:142 (computeIdealInput) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 59.3 | 1208 |
| engine-root | 13.3 | 270 |
| rendering | 9.1 | 185 |
| arenas | 7.7 | 158 |
| gameLoop | 5.6 | 115 |
| lighting | 1.8 | 37 |
| ai | 1.1 | 22 |
| themes | 1.0 | 20 |
| simulator | 0.8 | 17 |
| input | 0.2 | 5 |
| characters | 0.1 | 1 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
