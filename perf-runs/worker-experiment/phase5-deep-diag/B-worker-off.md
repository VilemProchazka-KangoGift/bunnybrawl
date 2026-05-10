# Perf Profile — 2026-05-10T10:08:44.712Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit ab50b28
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 6.3ms (158 fps)
- p50 6.1 · p95 7.6 · p99 15.9 · max 22.6
- long(>16.67ms): 5/600 (0.8%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 12.8MB · peak 13.1MB · end 9.7MB
- growth -3.1MB · sawtooth amplitude ~3.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4465 | 2906.6 | 0.65 | 1.00 |
| render.fg-nature | 4465 | 738.5 | 0.17 | 0.30 |
| fixedUpdate | 1808 | 239.7 | 0.13 | 0.30 |
| cosmeticStep | 2232 | 277.8 | 0.12 | 0.30 |
| render.bg | 4465 | 417.6 | 0.09 | 0.20 |
| render.players | 4465 | 406.4 | 0.09 | 0.20 |
| simulator.perPlayerPhysics | 1808 | 159.4 | 0.09 | 0.20 |
| render.overlay | 4465 | 359.8 | 0.08 | 0.20 |
| tickCosmetic | 4465 | 297.5 | 0.07 | 0.20 |
| render.particles | 4465 | 257.1 | 0.06 | 0.20 |
| render.entities | 4465 | 215.0 | 0.05 | 0.10 |
| cosmetic.playerCosmetic | 2232 | 100.4 | 0.04 | 0.20 |
| render.afterimages | 4465 | 188.3 | 0.04 | 0.10 |
| cosmetic.playerTransition | 2232 | 69.4 | 0.03 | 0.10 |
| awareness | 2199 | 40.3 | 0.02 | 0.10 |
| gameplay.stomp | 1808 | 25.1 | 0.01 | 0.10 |
| cosmetic.reactive | 1116 | 12.4 | 0.01 | 0.10 |
| cosmetic.particles | 2232 | 22.5 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2232 | 17.6 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2232 | 14.7 | 0.01 | 0.10 |
| cosmetic.environment | 2232 | 13.2 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1808 | 9.6 | 0.01 | 0.10 |
| gameplay.match | 1808 | 9.4 | 0.01 | 0.10 |
| gameplay.hazard | 1808 | 8.8 | 0.00 | 0.00 |
| cosmetic.wildlife | 1116 | 4.8 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 2232 | 6.6 | 0.00 | 0.00 |
| gameplay.carrot | 1808 | 3.1 | 0.00 | 0.00 |
| gameplay.effectZone | 1808 | 2.1 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2070ms)

| % | ms | File:line |
|---|-----|-----------|
| 6.7 | 138 | :0 (drawImage) |
| 5.2 | 107 | src/engine/arenas/packs/castle.ts:39 (Id) |
| 5.0 | 104 | :0 (stroke) |
| 3.1 | 64 | src/engine/fpsCounter.ts:109 (vh) |
| 3.0 | 62 | :0 (requestAnimationFrame) |
| 2.7 | 55 | :0 (drawImage) |
| 2.4 | 49 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 2.3 | 47 | :0 (fillText) |
| 2.2 | 45 | :0 (fill) |
| 1.7 | 34 | src/engine/rendering/particles.ts:76 (jc) |
| 1.5 | 32 | src/engine/perfTrace.ts:110 (measure) |
| 1.4 | 29 | :0 (drawImage) |
| 1.4 | 29 | :0 (fillRect) |
| 1.3 | 26 | :0 (fill) |
| 1.1 | 23 | :0 (addColorStop) |
| 1.1 | 22 | :0 (drawImage) |
| 1.0 | 21 | src/engine/rendering/players.ts:173 (zu) |
| 1.0 | 21 | :0 (drawImage) |
| 1.0 | 20 | :0 (drawImage) |
| 1.0 | 20 | :0 (arc) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (lO) |
| 0.00 | src/engine/gameLoop/gameplay/carrots.ts:5 (aj) |
| 0.00 | :0 (cos) |
| 0.00 | src/engine/stomp.ts:12 (wO) |
| 0.00 | src/engine/gameLoop/cosmetics/playerTransitions.ts:59 (SM) |
| 0.00 | src/engine/gameLoop/gameplay/PlayerCollisionSystem.ts:33 (checkCollisions) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 59.1 | 1223 |
| engine-root | 12.7 | 262 |
| arenas | 9.2 | 190 |
| rendering | 9.1 | 189 |
| gameLoop | 4.4 | 90 |
| lighting | 2.9 | 60 |
| themes | 1.0 | 20 |
| ai | 0.6 | 13 |
| simulator | 0.5 | 11 |
| input | 0.4 | 8 |
| characters | 0.2 | 4 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
