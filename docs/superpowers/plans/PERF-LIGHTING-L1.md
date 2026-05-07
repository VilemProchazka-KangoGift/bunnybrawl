# Lighting L1 Foundation — Perf Comparison

> **SUPERSEDED.** This doc captures the perf gate for the original
> deferred-lite + multiply pipeline (commit `7bb2d74`). That architecture was
> abandoned after the +6.8ms regression flagged below; the shipping pipeline
> is CSS-composited cross-fade + multiply fg-tint, with numbers in
> `perf-runs/lmode-comparison/REPORT.md`. Kept for archaeology — useful when
> L2 considers resurrecting the buffer for point lights.

**Date:** 2026-05-07
**Branch:** `feat/lighting-l1-foundation`
**Pre-M1 baseline commit:** `90ea4b7` (end of Part A integration stub)
**Post-M1 commit:** `7bb2d74` (Part B real pipeline + sun + ambient — superseded)
**Protocol:** `npm run perf -- --arena=<id>` — vsync uncapped headless Chrome, 4 bots hard, 30s, random P1 input. Run-to-run variance ~5% (deltas <0.3ms = noise).

## Frame stats

### Meadow

| Metric | Pre-M1 | Post-M1 | Δ |
|---|---|---|---|
| avg ms (fps) | 6.1 (164) | **12.9 (77)** | **+6.8 ms** |
| p50 / p95 / p99 / max | 5.5 / 11.9 / 14.4 / 32.6 | 12.0 / 19.5 / 38.5 / 42.1 | +6.5 / +7.6 / +24.1 / +9.5 |
| long >16.67ms (missed 60Hz) | 2/600 (0.3%) | **56/600 (9.3%)** | +54 |
| long >33.33ms (missed 30Hz) | 0/600 | **13/600 (2.2%)** | +13 |

### Haunted Graveyard

| Metric | Pre-M1 | Post-M1 | Δ |
|---|---|---|---|
| avg ms (fps) | 5.1 (198) | **9.3 (107)** | **+4.2 ms** |
| p50 / p95 / p99 / max | 4.4 / 10.4 / 11.0 / 11.3 | 8.8 / 14.1 / 15.1 / 16.9 | +4.4 / +3.7 / +4.1 / +5.6 |
| long >16.67ms | 0/600 (0.0%) | 1/600 (0.2%) | +1 |
| long >33.33ms | 0/600 | 0/600 | 0 |

## Section timings (perfTrace, mean ms/frame)

### Meadow

| Section | Pre Avg | Post Avg | Δ |
|---|---|---|---|
| renderFrame | 0.68 | **2.15** | **+1.47** |
| render.bg | 0.21 | 0.24 | +0.03 |
| render.fg-nature | 0.13 | 0.13 | 0.00 |
| render.players | 0.10 | 0.13 | +0.03 |

The instrumented sections account for ~1.5ms of the +6.8ms avg-frame-time increase. **The remaining ~5.3ms is uninstrumented GPU compositor work** — the `multiply` blend `drawImage` of the half-res light buffer at 1280×720 is the prime suspect, plus per-frame `createLinearGradient` evaluation in `drawSunGradient`.

## Verdict vs spec gate

Spec defined the gate as: `renderFrame p95 ≤ pre-M1 + 0.3ms`.

- Meadow `renderFrame` p95: 1.10 → 2.90 = **+1.80 ms** ❌ (6× over budget)
- Meadow avg-frame: +6.8 ms ❌ (catastrophic — drops sustained framerate from 164fps to 77fps)
- Graveyard `renderFrame`: 0.51 → ~0.85 ms estimated; avg-frame +4.2 ms ❌

**FAIL** — both arenas regress significantly past the spec's noise band.

## Likely culprits (ranked)

1. **`multiply` `drawImage` at full canvas (1280×720)** — every frame, the half-res buffer is composited via `globalCompositeOperation = 'multiply'` then drawn at full canvas size. Multiply is GPU-cheap per pixel but ~920k pixels per frame is non-trivial overhead.

2. **`createLinearGradient` in `drawSunGradient` evaluated per-frame** — known canvas-2d hazard (per `engine/CLAUDE.md`: *"CanvasGradient on large fills is catastrophic ... browser evaluates gradient function per-pixel"*). Even at half-res (640×360 = 230k pixels), this fires every frame the sun is visible.

3. **No caching when `dayPhase` is unchanged** — `beginFrame` recomputes ambient + sun every frame even though `dayPhase` changes ~0.001 per frame at default speed.

## Tuning knobs (deferred — L2 perf pass)

In rough order of expected win:

- **Pre-bake sun gradient to a 1×N strip** per the existing `bakeVerticalGradientStrip` pattern in `themes/utils.ts`. The strip is tiny; only re-bake when sun angle changes meaningfully (every ~10 frames at default day-cycle speed).
- **Reduce light buffer to 0.25× scale** on Med tier (currently 0.5×). 4× fewer pixels evaluated. Bilinear upscale should still look fine — lighting is low-frequency.
- **Cache `beginFrame` output when `dayPhase` change < 0.0005** (~30 frames). Compose against the cached buffer.
- **Skip `multiply` composite at noon** when ambient ≈ rgb(245,240,225) (effectively no-op multiply). Detect via early-out in `composite()`.
- **Move the brightness pass into the `composite` step** (single GPU pass instead of two when both are active).

## Decision needed

Per the user's directive (2026-05-07): everything stays on `feat/lighting-l1-foundation` worktree, no merge to main. M1 is experimental.

**Recommendation:** ship M1 with the regression documented. Fix in L2 (per-arena emitters) — by then the perf-tier branching from L1 will be more meaningful, and L2 will likely add a `lights:` registry that benefits from caching infrastructure anyway. Treat this as the canonical "first ugly light works end-to-end" moment from §19.9 — *"get one ugly light working, then add features"*.

If we want to fix now: the pre-bake-sun-gradient + skip-near-identity-multiply should recover most of the regression in ~1-2 hours of work.
