# All-Arena Perf Sweep — 2026-04-25

11 arenas, 4 bots hard, 30s each, vsync uncapped, random P1 input.
Built against commit `19b1d0b` (post weather-particle optimization).

## Frame-time tier

Per-frame WORK (uncapped headless Chrome). Production users on better
hardware with vsync at 60Hz will see different absolute numbers, but
the ranking is what matters.

| Tier | Arena | avg ms | fps | long >16.7ms |
|------|-------|--------|-----|--------------|
| FAST | rooftops | 2.3 | 442 | 0% |
| FAST | candy_land | 3.6 | 276 | 0% |
| FAST | haunted_graveyard | 3.6 | 281 | 0% |
| FAST | underwater | 3.6 | 280 | 0% |
| FAST | treetops | 3.8 | 266 | 0% |
| MID | space_station | 9.2 | 109 | 4% |
| MID | waterfall | 9.8 | 102 | 0% |
| MID | castle | 10.4 | 96 | 5% |
| **HEAVY** | **volcano** | **14.6** | **69** | **25%** |
| **HEAVY** | **winter_lake** | **20.4** | **49** | **75%** |
| **HEAVY** | **meadow** | **25.6** | **39** | **91%** |

Meadow shows GC pauses up to 166ms and one outlier 492ms. Winter_lake
similar (multiple ≥30ms frames with GC attribution).

## Universal hot paths (all 11 arenas)

| Hotspot | Range across arenas | Notes |
|---------|---------------------|-------|
| `renderer.ts:365 renderFrame` self | 6.7–13.3% | orchestrator branching |
| `fpsCounter` (Sa + wa combined) | 4.0–11.0% | **instrumentation, not real game** |
| `:0 (measureText)` | 3.0–6.7% | mostly fpsCounter |
| `:0 (drawImage)` | 2.4–7.1% | sprite + bg blit |
| `:0 (fill)` | 5–15% summed | many draw calls |
| `players.ts:29 drawPlayer` | 1.7–3.3% | 5 players × every frame |
| `gameLoop.ts:483 loop` | 2.1–3.5% | rAF orchestrator |

## Ranked optimization targets

### TIER 1 — User-facing (heavy arenas)

**1. Cache static foreground decorations in meadow / winter_lake.**
Both arenas redraw ~20–25 static decorations every frame in
`drawForegroundNature`: `drawFgBush`, `drawTallGrass`, `drawFern`,
`drawFgLeafCluster`, `drawHangingVine`, `drawFgWildflower`. None of these
animate. Pre-render once into an OffscreenCanvas at match start, blit
once per frame.
- Files: `src/engine/arenas/packs/meadow.ts:229`, `winterLake.ts` foreground
- Evidence: `themes/drawPrimitives/foreground.ts:23 (drawFgBush)` 2.2% on
  meadow + many `:0 (fill)` rows summing to 8–10%
- Expected: meadow 25.6ms → ~15–18ms, winter_lake 20.4ms → ~12–14ms.
  Most impactful single change.
- Effort: ~half a day (pattern is repeatable for other arenas later).

**2. Optimize `drawZeroGZone` (space_station).** 4.5% of profile (97ms).
The zone draws a per-frame pulsing background, animated streak overlay,
and probably per-frame gradient creation.
- File: `src/engine/rendering/hazards.ts:187`
- Effort: 1–2 hours. Likely fix: cache the streak path per zone, reduce
  shimmer points, hoist gradient creation.
- Expected: space_station 9.2ms → ~7–8ms.

**3. Optimize `drawBouncyPlatformOverlay` (candy_land).** 4.5% of profile
(207ms — biggest single arena-specific cost). Wobbly jelly surface.
- File: `src/engine/rendering/hazards.ts:421`
- Effort: 1–2 hours. Likely fix: precompute wave-curve points, cache
  jelly path.
- Expected: candy_land 3.6ms → ~2.8–3.0ms.

**4. Cap or cache `drawDayNightCycle`.** Appears 2.3–3.1% on meadow,
winter_lake, waterfall (the arenas that use it). Likely allocates
strings (`rgba(...)`) and computes overlay every frame even when
`dayPhase` barely changed.
- File: `src/engine/rendering/effects.ts:7`
- Effort: 1–2 hours. Cache the rgba color string when dayPhase rounded
  to 1/256 hasn't changed; reuse last frame's color.
- Expected: 0.5–1ms / frame on the 4 affected arenas.

### TIER 2 — Cross-arena cleanup

**5. Apply weather-particle shape branch to remaining 8 arenas.**
Same pattern as `volcano.ts` / `rooftops.ts` already done. Symmetric
shapes (circles, symmetric ellipses) skip save/translate/rotate/restore.
- Files: `castle.ts:552`, `candyLand.ts:409`, `hauntedGraveyard.ts:423`,
  `spaceStation.ts:689`, `treetops.ts` (need to check), `underwater.ts:481`,
  `winterLake.ts` (need to check), `waterfall.ts` (need to check)
- Evidence: drawWeatherParticle 1.1–3.3% per arena. Combined ~150–200ms
  saved across the slow arenas.
- Effort: 1–2 hours total — mechanical refactor.
- Expected: 1–3% per affected arena.

**6. Cache `measureText` in `fpsCounter`.** Bold 12px monospace —
width is `text.length × charWidth`. Compute once at startup, reuse.
- File: `src/engine/fpsCounter.ts:105–106`
- Evidence: `:0 (measureText)` 3.0–6.7% across ALL arenas.
- Note: This is **instrumentation only** (`?debug=fps`). Players
  don't run with this. Worth doing because it makes our perf
  measurements cleaner — the perf-tool overhead drops from
  10–11% to 4–5%.
- Effort: 15 minutes.

**7. Player shadow ellipse — cache or skip.** `drawPlayer`
(`players.ts:29`) draws a per-frame shadow ellipse for each active
player. 5 × frame-count = 70k+ ellipses on rooftops over 30s.
- File: `src/engine/rendering/players.ts:39–55`
- Options: (a) skip when shadowAlpha < 0.05, (b) blit a pre-rendered
  shadow image instead of beginPath/ellipse/fill.
- Effort: 30 min – 1 hour.
- Expected: 1–2% reduction on every arena.

### TIER 3 — Investigations (no clear single fix)

**8. Why does meadow GC?** Profile shows GC pauses up to 166ms (and
one 492ms outlier). The allocation table shows ~0 MB/sec sampled, so
it's not bulk allocation — likely allocation BURSTS on rare events
(splat, score change, weather respawn). Worth tracing the long-frame
timeline against game events.
- Source: `perf-runs/meadow/long-tasks.json` + `report.md` long-frames
  table
- Effort: 2–3 hours of investigation.

**9. `physics.ts:214 collidePlayersHorizontal` 2.1% on meadow.** Why
heavier on meadow than other arenas? Same physics code runs everywhere.
Probably because meadow's heavy frames cluster physics ticks — but worth
confirming. If real, this is an O(n²) loop that could matter when n=5.
- File: `src/engine/physics.ts:214`
- Effort: 1 hour to confirm + decide whether to optimize.

**10. `renderFrame` self-time 7–13%.** This is the orchestrator function
itself — branching, dispatching, `freshDiag()` allocation. Hard to win
without restructuring. Could shave 1–2% by reusing the diag object,
not allocating per frame. Lower priority because allocation rate is
already ~0 MB/sec.

## Suggested order of attack

If you want maximum user-visible improvement with bounded effort:

1. **Static foreground caching for meadow + winter_lake** (#1) —
   biggest user impact, half a day.
2. **measureText cache in fpsCounter** (#6) — 15 min, makes future
   measurements clearer.
3. **Weather-particle shape branch for remaining 8 arenas** (#5) —
   2 hours, cumulative win.
4. **drawZeroGZone + drawBouncyPlatformOverlay** (#2, #3) — 2–3 hours
   each, mid-tier wins.
5. **Player shadow** (#7) — 1 hour, universal small win.
6. **drawDayNightCycle cache** (#4) — 1–2 hours, helps the 4 arenas
   that use it.

## Process notes

- Run-to-run variance ≈5% on frame stats. A 2% measurement is noise;
  a 5%+ measurement is signal.
- Heavy arenas amplify signal: the same suboptimal pattern shows up
  more loudly in meadow (40 frames over 30s) than rooftops (14k frames).
  Use volcano or meadow for stress measurements when investigating
  shared rendering hot paths.
- Save reports to `perf-runs/<arena>/` (outside `test-results/`) —
  Playwright cleans `test-results/` on each run.
