# Worker offload experiment — baseline (phase 0)

**Branch:** `feat/worker-offload-experiment` @ commit `4b2f496` (= main HEAD + experiment plan doc)
**Scenario:** castle · 4 bots hard · 30s · random P1 input · uncapped vsync (`?debug=perffps`)
**Runs:** 3 sequential `npm run perf -- --arena=castle`. Median reported.

## Frame stats (rAF wall-clock, main thread)

| Run | avg | p50 | p95 | p99 | max | long>16.67 | long>33 |
|---|---|---|---|---|---|---|---|
| 1 | 6.4 | 5.9 | 11.9 | 14.9 | 16.1 | 0/600 | 0 |
| 2 | 6.0 | 5.7 | 7.9 | 13.5 | 13.9 | 0/600 | 0 |
| 3 | 6.8 | 6.0 | 13.1 | 14.7 | 24.4 | 1/600 (0.2%) | 0 |
| **median** | **6.4** | 5.9 | 11.9 | 14.7 | 16.1 | 0 | 0 |

## Comparison to `perf-runs/post-l2/REPORT.md` (commit `951cd3c`, taken 2026-05-08 morning)

|  | post-l2 | baseline (now) | Δ |
|---|---|---|---|
| avg | 11.6 | 6.4 | **-5.2ms** |
| p99 | 38.8 | 14.7 | **-24ms** |
| long>33ms | 14 | 0 | **-14** |

Castle has **already recovered the entire L2 regression** — likely from the recent perf commits (`7e4f9b9 perf(confetti)`, `dd37718 perf(rendering)`, `314f407 perf(weather)`). The original brainstorm-prep doc's "5ms banked" motivation has been delivered without the worker rewrite.

## Implication for the experiment

The original success bar (`castle avg 11.6ms → ≤7ms`) is already met by baseline. **The success bar is revised:** the experiment now measures main-thread budget recovery for *future* L3/L4/L5 lighting work, not for current L2.

**Revised success bar (main-thread rAF cadence with worker on):**
- avg: 6.4ms → ≤2.0ms (everything but KeyboardManager + AudioManager + state-mirror handler should run in worker)
- p99: 14.7ms → ≤6ms

Total frame time (worker draw + main composite) should stay similar — the win is freeing main for React/audio/network/future-lighting headroom, not making the GPU faster.

## Section timings (run 1, perfTrace ms/frame, sum to ~3ms of the 6.4ms)

| Section | avg | Notes |
|---|---|---|
| renderFrame | 0.69 | total render orchestrator span |
| render.fg-nature | 0.17 | foreground-nature cache blit |
| fixedUpdate | 0.15 | sim tick |
| cosmeticStep | 0.14 | cosmetic systems |
| simulator.perPlayerPhysics | 0.11 | physics |
| render.bg | 0.10 | background blit |
| render.players | 0.10 | sprite draws |
| render.overlay | 0.09 | hud / debug |

perfTrace covers ~3ms of 6.4ms. The remaining ~3.4ms is unmeasured native canvas + browser composite + paint. Worker offload moves the perfTrace-covered work off main; the unmeasured composite/paint stays main-side regardless.
