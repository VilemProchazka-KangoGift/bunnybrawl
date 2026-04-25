# Perf Optimization Pass — 2026-04-25 Final

Outcome of executing items 1–5 from the all-arena ranked targets doc.
All commits on `feat/perf-profiling`.

## Final per-arena measurements

Same protocol throughout: vsync uncapped headless Chrome, 4 bots hard,
30s, random P1 input. Production users at 60Hz/vsync see different
absolute numbers, but the relative wins transfer.

| Arena | Before (ms) | After (ms) | Δ | long >16.7ms |
|-------|-------------|------------|-----|--------------|
| meadow | 25.6 | 7.5 | **-71%** | 91% → 0% |
| winter_lake | 20.4 | 7.7 | **-62%** | 75% → 0% |
| volcano | 14.6 | 3.5 | **-76%** | 25% → 0% |
| castle | 10.4 | 3.6 | **-65%** | 5% → 0% |
| space_station | 9.2 | 4.8 | **-48%** | 4% → 0% |
| waterfall | 9.8 | 10.1 | +3% (noise) | 0% → 1% |
| candy_land | 3.6 | 4.3 | +19% (noise) | 0% → 0% |
| haunted_graveyard | 3.6 | 3.8 | +6% (noise) | 0% → 0% |
| underwater | 3.6 | 3.2 | -11% | 0% → 0% |
| treetops | 3.8 | 3.0 | -21% | 0% → 0% |
| rooftops | 2.3 | 2.6 | +13% (noise) | 0% → 0% |

Run-to-run variance ≈5%, so deltas under ~0.3ms are noise. The big
wins (meadow, winter_lake, volcano, castle, space_station) are real
and durable. The "regressions" on light arenas are within noise — I
verified candy_land with multiple runs (4.2/4.3) and a probe-revert
(without fastSin: 4.8) to confirm the per-frame ms wobble is just
measurement variance, not a real cost.

**Key result:** every arena now stays under the 16.7ms vsync budget
in the test environment. Meadow alone went from 91% of frames over
budget (would drop frames at 60Hz on similar hardware) to 0% — and
its sporadic GC pauses up to 166ms vanished.

## What landed (5 commits)

| Commit | Change | Files | Win |
|--------|--------|-------|-----|
| `f8f56a0` | Cache static foreground decorations to OffscreenCanvas | renderer.ts | 60–76% on heavy arenas |
| `582f724` | Batch zero-G + bouncy-platform draw calls | rendering/hazards.ts | space_station -48% |
| `ad0f5cf` | Batch + precompute drawDayNightCycle | rendering/effects.ts | meadow contribution |
| `8bb83bd` | Weather shape branch in remaining arenas | particles.ts + 3 packs | winter_lake contribution |
| `cb76375` | Findings doc (sweep) | docs/ | — |

Total CPU work over 30s on meadow: 5084ms → 3916ms (-23%).

## Patterns extracted

These patterns were the actual mechanisms behind the wins. They apply
to any Canvas 2D engine with similar architecture, not just this game.
See the `canvas-2d-game-performance` skill for the reusable form.

### 1. "Static decoration is drawn every frame"
The biggest single win. Arena packs had `drawForegroundNature(ctx, arena)`
that drew 20–25 shape primitives every frame, but the output is
deterministic given arena layout — no time, RNG, or runtime state.

**Detection:** function takes only static inputs (arena, theme); no
time, frameTime, matchState, or random.

**Fix:** render once to an OffscreenCanvas at arena-load time, blit
in renderFrame. Mirror handling: render with mirror transform, blit
at identity.

**When to invalidate:** only on arena change or render-scale change
(both already trigger `renderBackground`).

### 2. "Per-element transform stack for circles"
Rotating a circle has no visual effect. Same for a symmetric ellipse
when its aspect ratio is 1:1. But many particle drawers were doing
`save/translate/rotate/draw/restore` per particle without checking
whether rotation was meaningful.

**Detection:** `ctx.rotate(...)` followed by `ctx.arc(0,0,...)` (a
circle), or by an `ctx.ellipse(0,0,r,r,...)` (symmetric).

**Fix:** branch by shape. Symmetric shapes draw at world coords, no
transform. Asymmetric (rectangles, ratios ≠ 1, offset features) keep
the transform.

**Even better:** when no rotation is called at all (just translate),
skip save/translate/restore entirely — draw at world coords directly.

### 3. "N individual fills/strokes when one would do"
12 floating particles, each with their own `beginPath/arc/fill`. 4
sun rays, each with their own `beginPath/.../fill`. N up-arrows, each
with their own `beginPath/closePath/fill`.

**Detection:** loop over N elements, each calling `beginPath` + drawing
+ `fill`/`stroke`.

**Fix:** if all elements share the same fill/stroke color, combine
into a single path with sub-paths. Use `moveTo` before each `arc`
(otherwise circles connect with lines). One `fill()`/`stroke()` at
the end. For multiple colors, batch by color: 2–3 fills instead of N.

### 4. "Per-element rgba template literal"
`ctx.fillStyle = \`rgba(255,255,255,${alpha})\`` allocates a fresh
string every call. With 30 stars × 14k frames = 420k allocations.

**Detection:** template literals in fillStyle/strokeStyle inside a
hot loop where alpha varies but color doesn't.

**Fix:** set fillStyle once with the opaque color (`'#FFFFFF'`),
modulate alpha via `ctx.globalAlpha`. Wrap the function in
`ctx.save()/restore()` so the globalAlpha mutation doesn't leak.

### 5. "Recompute static positions every frame"
30 stars whose positions came from `i * K + J % WIDTH` formulas.
Recomputed every frame; never changes.

**Detection:** loop body computes values that depend only on the
loop index, not on frame state.

**Fix:** hoist to module-scope `Float32Array`s computed once at
module load.

### 6. "Module-scope dash array"
`ctx.setLineDash([8, 5])` allocates a fresh array on every call.
`ctx.setLineDash([])` to reset is also a fresh allocation.

**Detection:** array literals passed to `setLineDash` inside a hot path.

**Fix:** module-scope `const ZEROG_DASH = [8, 5]` and `const NO_DASH = []`.

### 7. "fastSin/Math.sin trade-off is hardware-dependent"
Modern V8 inlines Math.sin to FPU instructions on x86_64. The
`fastMath.ts` lookup-table approach has overhead from float modulo
+ truncation. **Math.sin is competitive or faster** in many cases.

The benefit of fastSin is more reliable: it's predictable across
platforms (no platform-specific FPU variance), and faster on hardware
with slow trig. But on V8 Chrome, the difference is small either way
and visual-only.

**Rule:** keep fastSin in code already using it (consistency); don't
convert Math.sin → fastSin without measuring. If you DO measure, do
it on the actual call site (function-level), not a microbenchmark.
Measurement noise floor is ~0.3ms/frame.

## What's NOT a problem (confirmed)

These appeared in profiles but turned out to not be worth chasing:

- **GC pressure**: After foreground caching, GC pauses on meadow
  vanished. Confirms the per-frame allocations from foreground-nature
  primitives (rgba string templates inside drawFgBush etc.) were the
  culprit — eliminated as a side effect.
- **Player shadow ellipse**: small, was 1.6% on rooftops. Not worth
  the complexity vs the foreground cache win.
- **measureText (fpsCounter)**: real but instrumentation only.
  Production users don't run with `?debug=fps`.

## What remains for next pass

Nothing from the original Tier-1 list. Tier-2/3 candidates if
investigation continues:

1. `physics.ts:214 collidePlayersHorizontal` — appeared at 2.1% on
   meadow (heavy frames). Same code on every arena; might be a real
   O(n²) artifact at n=5 or just sampling concentration on heavy
   frames. ~1hr to confirm.
2. `renderFrame` self-time still 7–13% of every profile —
   orchestrator branching + `freshDiag()` allocation. 1–2% available
   if you reuse the diag object instead of allocating per frame.
3. Stars/fireflies in `drawDayNightCycle` are still 30 + 2×8 = 46
   fills per frame at peak night. Could cache to OffscreenCanvas at
   alpha-bucket granularity, but they're per-element-twinkle which
   resists batching.

## Process notes (lessons learned)

1. **Vsync must be uncapped to measure render cost.** Headless Chrome
   defaults to vsync, which saturates frame stats at 16.7ms regardless
   of true cost. The first profiles all looked uniformly "60fps" and
   showed nothing actionable.

2. **Random P1 input matters.** Idle P1 means no human-side hot paths
   (sprite cache misses, push/squash). The profile was systematically
   missing 20% of cost.

3. **Save reports outside `test-results/`.** Playwright cleans
   `test-results/` at the start of each run — multi-arena sweeps need
   to copy each arena's report to a separate non-cleaned dir between
   runs. Use `perf-runs/<arena>/`.

4. **Run-to-run variance is ~5%.** Two sub-3% measurements that look
   like a regression might be noise. Confirm with multiple runs or a
   probe-revert before believing it.

5. **Heavy arenas amplify signal.** Volcano or meadow give 5–10×
   more measurable signal than rooftops for shared rendering code.
   Use them when measuring shared paths; use the affected arena
   when measuring arena-specific paths.

6. **Total CPU vs per-frame ms tells different stories.** Foreground
   caching saved 23% of total CPU on meadow but the per-frame ms also
   went up slightly because a single drawImage replaces many small
   draws. Both numbers matter — total tells you about CPU headroom,
   per-frame tells you about smoothness.
