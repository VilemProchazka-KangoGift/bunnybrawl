# L2 emitter compositing bakeoff — combined vs split

**Date:** 2026-05-07
**Branch:** `feat/lighting-l2-emitters`
**Commit (per run):** 3fd4783
**Scenario:** castle · 4 bots hard · 30s
**Build:** dist-perf with sourcemaps · Chromium 147

## Question

The L2 EmitterPipeline can write its per-frame composite into either:

- **Combined** — a single `lightCanvas` DOM sibling (z=5, mix-blend-mode: screen). Per frame: `clearRect` + `drawImage(staticCache)` + dynamic stamps + flicker overlay.
- **Split** — `lightStaticCanvas` (z=5) + `lightDynamicCanvas` (z=6), both screen-blend. Static rasterized once at arena-load (compositor caches it permanently). Per-frame work hits dynamic only.

Predicted trade-off: combined pays one extra `drawImage` per frame; split pays one extra DOM compositor layer + 2× GPU memory for light state.

## Method

3 runs per mode, alternating (combined→split→combined→split→combined→split) to spread thermal/cache effects. URL passthrough via `PERF_EXTRA_URL` env var (added to `e2e/perf-profile.spec.ts` for this bakeoff). Random P1 input mode. dayPhase cycles naturally over the 30s run (~25% of the 120s castle cycle), so the perf delta is diluted vs a midnight-pinned run — but both modes see the same dayPhase distribution, so the *sign* of any delta is preserved.

## Results

### Frame stats (rAF samples)

| Run | Mode | avg | p50 | p95 | p99 | max | long>16.67ms |
|---|---|---|---|---|---|---|---|
| 1 | combined | 7.1 | 6.6 | 12.2 | 15.0 | 17.9 | 1/600 |
| 2 | combined | 6.9 | 6.0 | 12.2 | 15.1 | 17.0 | 1/600 |
| 3 | combined | 6.5 | 5.9 | 12.0 | 14.2 | 15.7 | 0/600 |
| **mean** | **combined** | **6.83** | **6.17** | **12.13** | **14.77** | 16.87 | 0.7 |
| 1 | split | 6.5 | 6.1 | 11.6 | 13.8 | 18.9 | 1/600 |
| 2 | split | 6.6 | 5.9 | 12.9 | 14.8 | 16.1 | 0/600 |
| 3 | split | 6.8 | 6.1 | 12.5 | 15.1 | 28.1 | 4/600 |
| **mean** | **split** | **6.63** | **6.03** | **12.33** | **14.57** | 21.03 | 1.7 |

### Deltas (split minus combined)

| Metric | Δ (ms) | Verdict (vs CLAUDE.md 0.3ms noise floor) |
|---|---|---|
| avg | −0.20 | noise |
| p50 | −0.14 | noise |
| p95 | +0.20 | noise (split slightly worse) |
| p99 | −0.20 | noise |
| max | +4.16 | one outlier in split run 3 (28.1ms / 4 long-tasks) — variance, not a regression |

## Verdict

**Wash.** Every meaningful percentile delta sits at or below the 0.3ms run-to-run noise threshold. The single-frame max delta is dominated by one bad sample in split run 3, not a structural difference.

## Decision: combined

Tiebreakers favor **combined**:

1. **One fewer DOM compositor layer.** Layer count grows linearly with DOM siblings; the renderer-tree composite pass is a per-layer cost the browser pays every frame regardless of opacity. We're already at 6 layers with bg + bgNight + fg + fgTint + light + hud; adding a 7th when perf is a wash is a clear loss.
2. **Half the GPU memory for light state.** ~15MB vs ~30MB at 2×DPR. Real cost on low-end Android, irrelevant on desktop, but no upside to paying it.
3. **Simpler renderer code paths.** One canvas to manage, one opacity write per frame, one bake target. The split mode required an extra DOM ref, an extra ctx, an extra resize-applies-render-scale branch, and an extra opacity drive.

If a future profiling pass on a real low-end device shows split wins by >0.5ms in a meaningful percentile, we revisit. Until then, simpler wins.

## Follow-up

- Rip out `lightStaticCanvas` + `lightDynamicCanvas` plumbing from `Renderer`, `Match.tsx`, `GameLoop`, `NetMatch`, `RendererOptions`, `Match.css`, `lightMode.ts`. Keep `lightCanvas` only.
- Drop `?lmode=split` URL switch (and `LightMode` type alias). The `?lmode=combined` switch becomes vestigial — also drop.
- L2 spec doc: replace bakeoff phase with this REPORT.md as historical record.
