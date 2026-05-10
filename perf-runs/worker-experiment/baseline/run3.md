# Perf Profile — 2026-05-08T21:52:22.101Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit 4b2f496
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 6.8ms (147 fps)
- p50 6.0 · p95 13.1 · p99 14.7 · max 24.4
- long(>16.67ms): 1/600 (0.2%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 12.8MB · peak 13.6MB · end 11.2MB
- growth -1.6MB · sawtooth amplitude ~4.5MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4490 | 3068.1 | 0.68 | 1.10 |
| render.fg-nature | 4490 | 773.0 | 0.17 | 0.30 |
| fixedUpdate | 1810 | 293.6 | 0.16 | 0.30 |
| cosmeticStep | 2245 | 326.5 | 0.15 | 0.30 |
| simulator.perPlayerPhysics | 1810 | 202.3 | 0.11 | 0.20 |
| render.bg | 4490 | 454.7 | 0.10 | 0.20 |
| render.players | 4490 | 430.1 | 0.10 | 0.20 |
| render.overlay | 4490 | 406.2 | 0.09 | 0.30 |
| tickCosmetic | 4490 | 347.5 | 0.08 | 0.30 |
| cosmetic.playerCosmetic | 2245 | 133.7 | 0.06 | 0.20 |
| render.entities | 4490 | 250.5 | 0.06 | 0.20 |
| render.particles | 4490 | 242.6 | 0.05 | 0.20 |
| render.afterimages | 4490 | 183.3 | 0.04 | 0.10 |
| cosmetic.playerTransition | 2245 | 70.2 | 0.03 | 0.20 |
| awareness | 2049 | 45.2 | 0.02 | 0.10 |
| gameplay.stomp | 1810 | 30.8 | 0.02 | 0.10 |
| cosmetic.particles | 2245 | 26.7 | 0.01 | 0.10 |
| cosmetic.reactive | 1122 | 12.3 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2245 | 18.0 | 0.01 | 0.10 |
| cosmetic.environment | 2245 | 17.5 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1810 | 13.7 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2245 | 16.3 | 0.01 | 0.10 |
| gameplay.hazard | 1810 | 11.0 | 0.01 | 0.10 |
| cosmetic.wildlife | 1122 | 6.5 | 0.01 | 0.10 |
| gameplay.match | 1810 | 8.6 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 2245 | 8.6 | 0.00 | 0.00 |
| gameplay.carrot | 1810 | 4.4 | 0.00 | 0.00 |
| gameplay.effectZone | 1810 | 2.3 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3469ms)

| % | ms | File:line |
|---|-----|-----------|
| 5.6 | 196 | :0 (drawImage) |
| 2.9 | 102 | :0 (stroke) |
| 2.5 | 88 | :0 (drawImage) |
| 2.3 | 78 | src/engine/perfTrace.ts:110 (measure) |
| 2.2 | 77 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 1.9 | 64 | :0 (requestAnimationFrame) |
| 1.7 | 60 | :0 (drawImage) |
| 1.7 | 59 | :0 (drawImage) |
| 1.7 | 57 | src/engine/rendering/particles.ts:75 (jc) |
| 1.5 | 52 | src/engine/rendering/players.ts:173 (Lu) |
| 1.4 | 49 | :0 (fill) |
| 1.2 | 43 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.2 | 43 | src/engine/rendering/collectibles.ts:12 (us) |
| 1.2 | 42 | :0 (fill) |
| 1.2 | 41 | :0 (fillText) |
| 1.1 | 38 | src/engine/fpsCounter.ts:108 (gh) |
| 1.0 | 34 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.0 | 33 | :0 (clearRect) |
| 0.9 | 32 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 0.9 | 32 | :0 (fill) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | :0 (next) |
| 0.00 | src/engine/rendering/hazards/creatures.ts:282 (pl) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:102 (fO) |
| 0.00 | src/engine/rendering/particles.ts:8 (kc) |
| 0.00 | src/engine/ai/utility.ts:412 (IA) |
| 0.00 | src/engine/ai/awareness.ts:70 (_A) |
| 0.00 | src/engine/gameLoop/cosmetics/playerTransitions.ts:59 (bM) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:11 (mM) |
| 0.00 | src/engine/gameLoop/cosmetics/surfaceImpact.ts:59 (jM) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 54.8 | 1903 |
| engine-root | 14.1 | 488 |
| rendering | 11.8 | 409 |
| gameLoop | 7.2 | 249 |
| arenas | 6.2 | 214 |
| ai | 1.7 | 59 |
| lighting | 1.5 | 51 |
| simulator | 1.2 | 43 |
| themes | 0.9 | 31 |
| input | 0.3 | 10 |
| characters | 0.3 | 9 |
| audio | 0.1 | 3 |

## Long frames (with GC attribution)

_(no frames over 25ms)_

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
