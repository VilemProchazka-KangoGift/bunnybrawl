# Perf Profile — 2026-05-08T22:03:23.805Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit c40fe35
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 7.4ms (136 fps)
- p50 6.2 · p95 13.9 · p99 17.5 · max 32.9
- long(>16.67ms): 9/600 (1.5%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 10.4MB · peak 13.2MB · end 12.0MB
- growth 1.6MB · sawtooth amplitude ~3.1MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4521 | 3101.6 | 0.69 | 1.10 |
| render.fg-nature | 4521 | 792.3 | 0.18 | 0.30 |
| fixedUpdate | 1811 | 289.9 | 0.16 | 0.30 |
| cosmeticStep | 2260 | 304.2 | 0.13 | 0.30 |
| simulator.perPlayerPhysics | 1811 | 199.1 | 0.11 | 0.20 |
| render.bg | 4521 | 457.2 | 0.10 | 0.20 |
| render.players | 4521 | 446.3 | 0.10 | 0.20 |
| render.overlay | 4521 | 426.6 | 0.09 | 0.30 |
| tickCosmetic | 4521 | 326.8 | 0.07 | 0.30 |
| render.particles | 4521 | 235.6 | 0.05 | 0.20 |
| cosmetic.playerCosmetic | 2260 | 113.7 | 0.05 | 0.20 |
| render.afterimages | 4521 | 209.4 | 0.05 | 0.10 |
| render.entities | 4521 | 196.7 | 0.04 | 0.10 |
| cosmetic.playerTransition | 2260 | 72.1 | 0.03 | 0.20 |
| awareness | 2158 | 48.1 | 0.02 | 0.10 |
| gameplay.stomp | 1811 | 29.4 | 0.02 | 0.10 |
| cosmetic.reactive | 1130 | 13.7 | 0.01 | 0.10 |
| cosmetic.particles | 2260 | 22.7 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2260 | 18.6 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1811 | 13.2 | 0.01 | 0.10 |
| cosmetic.environment | 2260 | 16.1 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2260 | 15.3 | 0.01 | 0.10 |
| gameplay.hazard | 1811 | 9.8 | 0.01 | 0.00 |
| cosmetic.wildlife | 1130 | 6.1 | 0.01 | 0.10 |
| cosmetic.hudFeedback | 2260 | 9.0 | 0.00 | 0.00 |
| gameplay.match | 1811 | 6.5 | 0.00 | 0.00 |
| gameplay.carrot | 1811 | 6.3 | 0.00 | 0.00 |
| gameplay.effectZone | 1811 | 2.5 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3434ms)

| % | ms | File:line |
|---|-----|-----------|
| 6.2 | 214 | :0 (drawImage) |
| 3.3 | 114 | :0 (drawImage) |
| 3.2 | 109 | :0 (stroke) |
| 2.9 | 101 | src/engine/perfTrace.ts:110 (measure) |
| 2.6 | 88 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 1.8 | 62 | src/engine/rendering/particles.ts:75 (jc) |
| 1.7 | 57 | src/engine/fpsCounter.ts:108 (gh) |
| 1.7 | 57 | :0 (drawImage) |
| 1.6 | 54 | :0 (requestAnimationFrame) |
| 1.5 | 52 | src/engine/rendering/players.ts:173 (Lu) |
| 1.5 | 50 | :0 (drawImage) |
| 1.4 | 49 | :0 (fillText) |
| 1.4 | 49 | :0 (ellipse) |
| 1.3 | 45 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.3 | 45 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.3 | 44 | :0 (fill) |
| 1.2 | 40 | src/engine/arenas/packs/castle.ts:786 (drawWeatherParticle) |
| 1.1 | 37 | :0 (fill) |
| 1.0 | 35 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.0 | 33 | src/engine/ai/awareness.ts:70 (_A) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.01 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | :0 (set) |
| 0.00 | src/engine/perfTrace.ts:94 (end) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:161 (gO) |
| 0.00 | src/engine/rendering/surfaceImpact.ts:54 (Yu) |
| 0.00 | :0 ((BYTECODE_COMPILER)) |
| 0.00 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 0.00 | src/engine/gameLoop/cosmetics/playerTransitions.ts:21 (yM) |
| 0.00 | src/engine/rendering/players.ts:380 (Ru) |
| 0.00 | src/engine/renderer.ts:736 (_drawLightBursts) |
| 0.00 | src/engine/rendering/idleActions.ts:194 (pu) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 52.9 | 1817 |
| engine-root | 15.3 | 524 |
| rendering | 10.4 | 358 |
| gameLoop | 7.2 | 247 |
| arenas | 7.0 | 241 |
| lighting | 2.2 | 75 |
| ai | 1.9 | 66 |
| simulator | 1.4 | 49 |
| themes | 0.8 | 29 |
| input | 0.5 | 16 |
| characters | 0.3 | 11 |
| audio | 0.1 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 31.18s | 32.9 | — |
| 31.26s | 31.9 | — |
| 31.29s | 32.6 | — |
| 34.02s | 30.0 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
