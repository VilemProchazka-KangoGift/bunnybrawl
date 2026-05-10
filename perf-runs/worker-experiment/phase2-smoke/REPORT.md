# Worker offload experiment — phase 2 smoke (Match.tsx + WorkerHost wired)

**Branch:** `feat/worker-offload-experiment` @ commit `c40fe35`
**Scenario:** castle · 4 bots hard · 30s · random P1 input · `?workerSmoke=1` adds 160×90 worker-painted overlay
**Runs:** 3 sequential `npm run perf -- --arena=castle` with `PERF_EXTRA_URL='&workerSmoke=1'`. Median reported.

## Frame stats (rAF wall-clock, main thread)

| Run | avg | p50 | p95 | p99 | max | long>16.67 | long>33 |
|---|---|---|---|---|---|---|---|
| 1 | 7.0 | 6.1 | 13.8 | 15.6 | 24.0 | 1/600 (0.2%) | 0 |
| 2 | 7.4 | 6.2 | 13.9 | 17.5 | 32.9 | 9/600 (1.5%) | 0 |
| 3 | 7.9 | 6.7 | 15.8 | 31.7 | 34.0 | 19/600 (3.2%) | 2 |
| **median** | **7.4** | 6.2 | 13.9 | 17.5 | 32.9 | 9 | 0 |

## Comparison vs baseline (phase 0)

|  | baseline | phase 2 smoke | Δ |
|---|---|---|---|
| avg | 6.4 | 7.4 | **+1.0ms** |
| p99 | 14.7 | 17.5 | **+2.8ms** |
| long>16.67ms | 0 | 9 | **+9** |

## Interpretation

**The smoke worker draws a 160×90 colored rect at 60fps with no inputs from main.** Main thread is doing strictly less than baseline work — except it now also has to composite a second OffscreenCanvas-backed layer in the GPU process and pay the IPC overhead of worker startup.

**That alone costs ~1ms avg / ~3ms p99 on castle.** And run 3 saw 19 frames over 16.67ms (vs 0 baseline) plus 2 frames over 33ms — the long-tail got noticeably worse.

This is a **material finding** for phase 3 planning:
- The "5ms banked" hypothesis from the brainstorm-prep doc assumed worker overhead was negligible. It is not — there is a measurable cost just to having a worker present.
- Main-thread rAF measurement includes browser composite time. With a worker-painted layer in the DOM, the compositor has more work to merge before each frame.
- For phase 3 to land a real win, the main-thread render work it removes must exceed this overhead by at least ~2ms.

## Implication for phase 3 success bar

Revise the success bar again:
- Castle main-thread rAF must drop to ≤4ms avg (not ≤2ms). The compositor overhead floor with a worker present looks like ~1-2ms.
- The actual gain over baseline is what matters. Target: ≥2.5ms recovered (baseline 6.4 → phase 3 ≤ 4.0). Below that, the experiment is borderline-not-worth-it given the ongoing cost (DX hits, audio jitter risk, debug-bridge complexity).

## Next perf check

Phase 3 (sim + render in worker) — same harness, same scenario. The smoke overlay gets removed so castle is back to a single fg canvas, but that canvas is now worker-owned.
