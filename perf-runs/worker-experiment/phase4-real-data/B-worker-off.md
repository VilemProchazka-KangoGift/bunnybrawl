# Perf Profile — 2026-05-09T06:39:35.773Z

**Scenario**: castle · 4 bots hard · 30s
**Build**: dist-perf (sourcemaps) · commit e9b2753
**User-Agent**: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36

## Frame stats (rAF samples)

- avg 7.4ms (134 fps)
- p50 6.4 · p95 14.6 · p99 21.2 · max 32.7
- long(>16.67ms): 13/600 (2.2%)
- long(>33.33ms): 0/600

## Heap timeline (1Hz)

- start 9.2MB · peak 12.7MB · end 10.9MB
- growth 1.7MB · sawtooth amplitude ~3.6MB
- GC events: 0 (avg drop 0MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)

| Section | Calls | Total ms | Avg ms | p95 ms |
|---------|-------|----------|--------|--------|
| renderFrame | 4378 | 2910.2 | 0.66 | 1.00 |
| render.fg-nature | 4378 | 770.5 | 0.18 | 0.30 |
| fixedUpdate | 1808 | 261.5 | 0.14 | 0.30 |
| cosmeticStep | 2189 | 266.0 | 0.12 | 0.30 |
| simulator.perPlayerPhysics | 1808 | 182.8 | 0.10 | 0.20 |
| render.bg | 4378 | 421.6 | 0.10 | 0.20 |
| render.players | 4378 | 404.1 | 0.09 | 0.20 |
| render.overlay | 4378 | 392.5 | 0.09 | 0.30 |
| tickCosmetic | 4378 | 286.1 | 0.07 | 0.20 |
| render.afterimages | 4378 | 213.0 | 0.05 | 0.10 |
| render.entities | 4378 | 205.2 | 0.05 | 0.10 |
| render.particles | 4378 | 191.5 | 0.04 | 0.20 |
| cosmetic.playerCosmetic | 2189 | 75.7 | 0.03 | 0.20 |
| cosmetic.playerTransition | 2189 | 72.0 | 0.03 | 0.10 |
| awareness | 2052 | 45.8 | 0.02 | 0.10 |
| gameplay.stomp | 1808 | 23.3 | 0.01 | 0.10 |
| cosmetic.reactive | 1095 | 13.6 | 0.01 | 0.10 |
| cosmetic.particles | 2189 | 23.7 | 0.01 | 0.10 |
| cosmetic.surfaceImpact | 2189 | 18.9 | 0.01 | 0.10 |
| cosmetic.entityTransition | 2189 | 16.5 | 0.01 | 0.10 |
| cosmetic.environment | 2189 | 15.4 | 0.01 | 0.10 |
| gameplay.arenaEntity | 1808 | 11.5 | 0.01 | 0.10 |
| gameplay.hazard | 1808 | 10.0 | 0.01 | 0.10 |
| cosmetic.wildlife | 1095 | 5.0 | 0.00 | 0.00 |
| gameplay.match | 1808 | 7.4 | 0.00 | 0.00 |
| cosmetic.hudFeedback | 2189 | 7.2 | 0.00 | 0.00 |
| gameplay.carrot | 1808 | 3.5 | 0.00 | 0.00 |
| gameplay.effectZone | 1808 | 2.1 | 0.00 | 0.00 |

## Top 20 CPU hotspots (self-time, total profile = 2169ms)

| % | ms | File:line |
|---|-----|-----------|
| 8.5 | 184 | :0 (drawImage) |
| 6.6 | 142 | :0 (stroke) |
| 5.4 | 117 | src/engine/arenas/packs/castle.ts:39 (Id) |
| 3.2 | 70 | src/engine/fpsCounter.ts:109 (vh) |
| 3.2 | 69 | :0 (requestAnimationFrame) |
| 3.0 | 66 | :0 (fillText) |
| 2.6 | 57 | :0 (drawImage) |
| 2.5 | 55 | src/engine/perfTrace.ts:110 (measure) |
| 2.0 | 44 | src/engine/arenas/packs/castle.ts:290 (draw) |
| 1.6 | 35 | :0 (drawImage) |
| 1.4 | 31 | :0 (fill) |
| 1.4 | 30 | :0 (addColorStop) |
| 1.2 | 26 | src/engine/rendering/hazards/creatures.ts:17 ($c) |
| 1.2 | 26 | :0 (fillRect) |
| 1.2 | 25 | :0 (fill) |
| 1.1 | 23 | :0 (drawImage) |
| 1.0 | 21 | src/engine/themes/drawPrimitives/foreground.ts:271 (ea) |
| 1.0 | 21 | src/engine/simulator/Simulator.ts:370 (fixedUpdate) |
| 0.9 | 20 | src/engine/rendering/players.ts:173 (zu) |
| 0.8 | 18 | :0 (drawImage) |

## Top 20 allocation sites (sampled MB/sec)

| MB/s | File:line |
|------|-----------|
| 0.00 | src/engine/gameLoop/GameLoop.ts:707 (loop) |
| 0.00 | :0 (set) |
| 0.00 | src/engine/rendering/players.ts:595 (Gu) |
| 0.00 | src/engine/stomp.ts:12 (wO) |
| 0.00 | src/engine/ai/utility.ts:392 (IA) |
| 0.00 | src/engine/input/KeyboardManager.ts:29 (_onKeyUp) |
| 0.00 | src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts:117 (applyStompImpulse) |
| 0.00 | src/engine/gameLoop/cosmetics/ParticleSystem.ts:66 (spawnCarrotVFX) |

## Self-time by module

| Module | % | ms |
|--------|---|-----|
| other | 59.9 | 1299 |
| engine-root | 13.2 | 287 |
| arenas | 8.8 | 191 |
| rendering | 7.8 | 169 |
| gameLoop | 4.8 | 105 |
| lighting | 2.3 | 50 |
| themes | 1.1 | 24 |
| simulator | 1.0 | 21 |
| ai | 0.7 | 16 |
| input | 0.2 | 4 |
| characters | 0.1 | 3 |

## Long frames (with GC attribution)

| t | frame ms | GC pause |
|---|----------|----------|
| 33.94s | 32.3 | — |
| 34.00s | 32.7 | — |

## How to read this report

The fastest path to fixes:
1. **Section timings** — which subsystem dominates? That is the file scope to focus on.
2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.
3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).
4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.
