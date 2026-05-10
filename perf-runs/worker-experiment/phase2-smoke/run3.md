# Perf Profile — 2026-05-08T22:04:14.272Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit c40fe35
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 7.9ms (127 fps)
- p50 6.7 · p95 15.8 · p99 31.7 · max 34.0
- long(>16.67ms): 19/600 (3.2%)
- long(>33.33ms): 2/600

## Heap timeline (1Hz)

- start 13.1MB · peak 13.2MB · end 10.7MB
- growth -2.5MB · sawtooth amplitude ~3.8MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4010 | 3062.6 | 0.76 | 1.20 |
| render.fg-nature | 4010 | 798.5 | 0.20 | 0.30 |
| fixedUpdate | 1811 | 306.1 | 0.17 | 0.30 |
| cosmeticStep | 2005 | 282.6 | 0.14 | 0.30 |
| simulator.perPlayerPhysics | 1811 | 213.5 | 0.12 | 0.30 |
| render.players | 4010 | 455.3 | 0.11 | 0.20 |
| render.overlay | 4010 | 446.1 | 0.11 | 0.40 |
| render.bg | 4010 | 425.7 | 0.11 | 0.20 |
| tickCosmetic | 4010 | 301.3 | 0.08 | 0.30 |
| render.particles | 4010 | 260.2 | 0.06 | 0.20 |
| render.afterimages | 4010 | 187.3 | 0.05 | 0.10 |
| cosmetic.playerCosmetic | 2005 | 91.9 | 0.05 | 0.20 |
| render.entities | 4010 | 166.9 | 0.04 | 0.10 |
| cosmetic.playerTransition | 2005 | 69.9 | 0.03 | 0.20 |
| awareness | 2074 | 56.2 | 0.03 | 0.10 |
| gameplay.stomp | 1811 | 29.5 | 0.02 | 0.10 |
| cosmetic.particles | 2005 | 23.1 | 0.01 | 0.10 |
| cosmetic.reactive | 1002 | 11.5 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2005 | 18.6 | 0.01 | 0.10 |
| cosmetic.environment | 2005 | 17.5 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1811 | 14.6 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2005 | 15.4 | 0.01 | 0.10 |
| cosmetic.wildlife | 1002 | 5.9 | 0.01 | 0.10 |
| gameplay.hazard | 1811 | 9.1 | 0.01 | 0.00 |
| cosmetic.hudFeedback | 2005 | 9.7 | 0.00 | 0.00 |
| gameplay.match | 1811 | 7.2 | 0.00 | 0.00 |
| gameplay.carrot | 1811 | 4.7 | 0.00 | 0.00 |
| gameplay.effectZone | 1811 | 2.3 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 3390ms)

| % | ms | File:line |
|---|-----|-----------|
| 6.5 | 220 | :0 (drawImage) |
| 3.9 | 131 | :0 (stroke) |
| 3.5 | 120 | :0 (drawImage) |
| 2.5 | 86 | src/engine/perfTrace.ts:110 (measure) |
| 2.3 | 77 | src/engine/rendering/players.ts:173 (Lu) |
| 2.0 | 69 | src/engine/arenas/packs/castle.ts:39 (Pd) |
| 2.0 | 68 | :0 (requestAnimationFrame) |
| 1.8 | 61 | :0 (drawImage) |
| 1.7 | 58 | :0 (drawImage) |
| 1.6 | 56 | src/engine/rendering/particles.ts:75 (jc) |
| 1.5 | 52 | :0 (fillText) |
| 1.4 | 48 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 1.4 | 48 | :0 (fill) |
| 1.3 | 43 | src/engine/fpsCounter.ts:108 (gh) |
| 1.2 | 41 | src/engine/arenas/packs/castle.ts:786 (drawWeatherParticle) |
| 1.2 | 39 | src/engine/arenas/packs/castle.ts:921 (drawAnimatedBackground) |
| 1.1 | 38 | :0 (fill) |
| 1.1 | 36 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.0 | 34 | :0 (clearRect) |
| 0.9 | 31 | src/engine/ai/awareness.ts:70 (_A) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:694 (loop) |
| 0.00 | node_modules/howler/dist/howler.js:1951 (_ended) |
| 0.00 | src/hooks/useScaler.ts:76 (s) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | :0 (set) |
| 0.00 | src/engine/arenas/packs/castle.ts:269 (draw) |
| 0.00 | src/engine/gameLoop/cosmetics/particles.ts:15 (sO) |
| 0.00 | :0 (get) |
| 0.00 | src/engine/ai/awareness.ts:70 (_A) |
| 0.00 | src/engine/rendering/hazards/creatures.ts:282 (pl) |
| 0.00 | src/engine/gameLoop/cosmetics/gibs.ts:11 (mM) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 54.6 | 1851 |
| engine-root | 14.3 | 486 |
| rendering | 12.1 | 411 |
| gameLoop | 6.2 | 212 |
| arenas | 5.8 | 196 |
| ai | 1.8 | 60 |
| lighting | 1.7 | 57 |
| simulator | 1.4 | 48 |
| themes | 0.9 | 30 |
| input | 0.5 | 18 |
| characters | 0.4 | 14 |
| audio | 0.2 | 6 |
| components | 0.1 | 2 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 31.16s | 30.5 | — |
| 31.19s | 30.8 | — |
| 31.28s | 33.9 | — |
| 33.27s | 32.7 | — |
| 33.33s | 30.3 | — |
| 33.36s | 31.7 | — |
| 33.40s | 34.0 | — |
| 33.43s | 31.7 | — |
| 33.47s | 32.8 | — |
| 33.59s | 32.2 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
