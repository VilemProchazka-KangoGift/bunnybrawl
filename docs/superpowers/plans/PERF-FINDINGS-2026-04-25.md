# Perf Profiling Findings — 2026-04-25

Initial measurement pass with the new automated perf profiling tool
(`npm run perf`). Two tool fixes plus three optimizations landed.

## Tool calibration

The first profile run produced uniformly 16.7ms/frame regardless of
arena/load. Two missing pieces caused that:

1. **Headless Chrome rate-limits to vsync.** Frame stats were saturated
   at 60fps. Fixed by passing `--disable-frame-rate-limit`,
   `--disable-gpu-vsync`, `--disable-features=CalculateNativeWinOcclusion`
   to launchOptions in `playwright.perf.config.ts`. After the fix a
   30s rooftops run produces ~14k frames at ~497fps and we can actually
   see hot paths. Production users still play at 60Hz with vsync on, so
   absolute frame times under uncapped Chrome are NOT representative —
   but the hotspot RANKING is, which is what we care about.

2. **P1 sat idle while bots played.** No human-side input meant no
   facing changes (sprite cache misses), no pushes (squash transitions),
   no fast-fall. `simulateRandomInput()` in the spec drives P1 with
   weighted keys (35% left, 35% right, 20% jump, 10% down) for the
   collection window via `page.keyboard.down/up`, with an AbortController
   for clean teardown before profilers stop. `PERF_INPUT=off` opts out.

## Hot-path findings

### Rooftops baseline (4 bots hard, 30s)
- avg frame 2.0ms (497fps) under uncapped vsync
- p95 2.6ms · p99 2.9ms · max 8.2ms · 0 long frames
- Heap stable: 11MB → 12MB peak → 10MB end, no GC events
- Total CPU work ~5s of the 30s wall-clock window (one core, ~16% util)

Top hotspots by self-time:
| % | ms | What |
|---|----|------|
| 11.2 | 556 | renderer.ts renderFrame (orchestrator) |
| 10.6 | 549 | fpsCounter (perf-tool overhead, not real-game) |
| 7.0 | 367 | :0 (measureText) — hud + fpsCounter |
| 7.8 | 403 | :0 (drawImage) — sprite cache + bg blit |
| 6.3 | 308 | rendering/players.ts (Ey, Dy, My) |
| 4.6 | 224 | :0 (save+restore) — canvas state stack |

### Volcano (4 bots hard, 30s) — heavier baseline
- avg frame 3.2ms vs rooftops 2.0ms — visual cost of lava + 40 weather particles
- volcano `drawWeatherParticle` 3.9% of profile
- save+restore at 4.6% (vs rooftops ~2%)

### What's not a problem
- **GC pressure**: 0 GC events across all runs, allocation rates ≈0 MB/sec.
  No recurring allocations on the hot path.
- **AI**: awareness 0.02ms/frame avg, p95 0.10ms. Already cheap.
- **fixedUpdate**: 0.10–0.14ms/frame avg. Physics + gameplay is not the
  bottleneck — the renderer is, by ~3×.
- **fpsCounter overhead** is real (10.6%) but it's instrumentation, not
  shipped code. Production users don't run with `?debug=fps`.

## Optimizations landed

### 1. `updateHazardLifetimes` single-pass (`hazards.ts`)
Was two passes per array — forward decrement, reverse swapRemove. Combined
into single reverse-iterate matching the codebase's established pattern
(see CLAUDE.md "Entity cleanup uses swapRemove(arr, i) in reverse-iterate
loops"). Each entry now visited once.

**Measured impact:** below profile resolution at 60fps locked. The function
was ~5ms over 30s in the old vsync-on profile, which is 0.1% of the new
uncapped-vsync 5s total — invisible. Algorithm correctness preserved
(2223 tests pass). Worth keeping as code cleanup; not a perf win on its own.

### 2. Skip transform for round weather particles (`volcano.ts`, `rooftops.ts`)
`drawWeatherParticle` was issuing `save/translate/rotate/draw/restore` for
every particle, but rotation has no visual effect on circles or symmetric
ellipses (embers, ash circles). Branched by shape:
- Asymmetric (leaf rectangle, ash ellipse): keep transform
- Symmetric (ember, ash circle): draw at world coords, no transform

**Measured impact (volcano, 40 particles, 70% embers):**
| Metric | Before | After | Δ |
|--------|--------|-------|---|
| avg frame | 3.2ms | 3.1ms | -3% |
| p95 | 3.9ms | 3.8ms | -3% |
| p99 | 5.5ms | 4.2ms | **-24%** |
| max | 10.1ms | 9.3ms | -8% |
| total CPU work | 6070ms | 5954ms | -116ms (-2%) |

`:0 (save)`, `:0 (restore)`, `:0 (rotate)` all dropped out of top 20.
Rooftops impact below variance (only 5 affected particles per frame),
but `:0 (rotate)` also dropped out of top 20 there. Pattern available in
candyLand, hauntedGraveyard, spaceStation, underwater for future passes.

## Remaining targets (not yet addressed)

Ranked by likely return:

1. **`measureText` (7% rooftops, 4% volcano)** — every fpsCounter draw
   measures both text lines. Both use `bold 12px monospace`, so width is
   strictly `text.length × charWidth`. A two-line cache or precomputed
   constant width would eliminate ~10ms/sec at 60fps. Lower priority
   because fpsCounter is dev-only.

2. **renderFrame self-time 11.2%** — the orchestrator function itself.
   Mostly branching, function dispatching, and per-frame `freshDiag()`
   allocation (28-field object). Resetting fields in place instead of
   allocating could shave a small amount, but allocation rate is already
   ~0 MB/sec.

3. **Player shadow ellipse per frame** — every active player draws a shadow
   ellipse every frame in `players.ts` `drawPlayer`. 5 players × 14k
   frames = 70k ellipses. Could be drawn into the bg layer for static
   players, or skipped entirely when alpha < threshold.

4. **`drawWeatherParticle` in 4 other arenas** — the same shape-branch
   optimization applies. Wins scale with particle count.

5. **Per-frame string template allocations** — `rgba(0, 0, 0, ${alpha})`
   and similar formed in hot paths. Allocation rate is already low; only
   worth tackling if GC events appear.

## Process notes

- Run-to-run variance is ~5% on frame stats. Need 2–3 runs to call a sub-3%
  optimization "real."
- The perf-tool overhead (perfTrace, fpsCounter) inflates measurements
  proportionally at high fps. Hotspot RANKING is reliable; ABSOLUTE ms
  values are not directly representative of production.
- Volcano is a much better stress arena than rooftops for weather/particle
  optimizations — 40 particles vs 12 means 3.3× more measurable signal.
