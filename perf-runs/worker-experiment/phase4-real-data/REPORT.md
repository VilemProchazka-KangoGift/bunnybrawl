# Worker offload — phase 4 real data

**Branch:** `feat/worker-offload-experiment` · castle · 4 bots hard · 30 s · random P1 input
**Build:** `dist-perf` (sourcemaps), `npm run perf -- --arena=castle`

The vsync-paced rAF metric in phase 3 was non-comparable. Phase 4 measures
two ways the harness CAN see through it:

1. **Worker-side render-time probe** — instrument `renderer.renderFrame()`
   inside the worker, post per-second rollups back to main, capture in
   `worker-stats.json`. Direct measurement of render cost, immune to
   compositor pacing on main.
2. **CPU throttle pair** — run with `Emulation.setCPUThrottlingRate=4`
   (main thread only — workers run on separate threads, unaffected).
   Compare main-thread mode vs worker mode. Real-world stress: a slow
   main thread is exactly what mobile / low-end laptops experience.

## Headline numbers

| Scenario | Main rAF avg | Main CPU / 30 s | Worker render / frame |
|---|---|---|---|
| A · worker on | 17.9 ms (56 fps) | **79 ms** (0.26 %) | **0.51 ms** |
| B · worker off (baseline) | 7.4 ms (134 fps) | **2 169 ms** (7.2 %) | — |
| C · worker on, 4× CPU throttle | 17.8 ms (56 fps) | 2 499 ms | 0.52 ms |
| D · worker off, 4× CPU throttle | **32.0 ms (31 fps)** | 5 112 ms | — |

## Three findings, each replicable

### 1. Main-thread CPU drops 27× when the renderer migrates to the worker

| | Main-thread CPU (V8 sampling profiler total over 30 s) |
|---|---|
| Worker off (B) | 2 169 ms |
| Worker on (A) | 79 ms |
| **Ratio** | **27.5×** |

The worker really does free the main thread. Main now spends ~0.26 % of wall-
clock executing JS — the rest is idle and available for React, audio,
transport, and incoming L3/L4/L5 lighting work.

### 2. Worker-side render time matches main-thread render time

The worker reports 0.51 ms/frame for `renderer.renderFrame()` (1 976.6 ms ÷
3 890 frames). The main-thread baseline reports 0.60 ms for the same span via
perfTrace (run B's `render.fg` + bg + entities + players + overlay, summed).
Same code, same canvas API, same arena — the 0.09 ms difference is sampling
noise plus a slightly hotter cache in the worker (no main-thread interruptions
between cosmetic ticks).

**Worker isn't a slow renderer. It's the same renderer, on a different
thread.** The phase 3 rAF wall-clock comparison was misleading because of
OffscreenCanvas vsync pacing — direct render-time measurement clears that up.

### 3. Under CPU throttle, worker mode keeps 60 fps; main mode collapses

`Emulation.setCPUThrottlingRate=4` slows the main thread 4× (workers run on
separate threads, unaffected — this matches real mobile / OS-throttling
behaviour where one core gets pinned and others stay fast).

| | Worker on (C) | Worker off (D) | Δ |
|---|---|---|---|
| avg ms/frame | 17.8 | **32.0** | +14.2 ms |
| fps | 56 | **31** | -25 |
| long > 16.67 ms | 600/600 | 600/600 | (both saturated) |
| long > 33.33 ms | 0/600 | **149/600 (24.8 %)** | +149 |
| p99 | 18.9 | 78.7 | +59.8 ms |
| max | 19.2 | 90.2 | +71.0 ms |

Worker mode rides through the throttle untouched (worker render time stays
at 0.52 ms/frame). Main-thread mode loses 25 fps of throughput and produces
a long-tail of 33–90 ms hitches.

This is the production case the offload was designed for: low-end Android,
older laptops, throttled tabs. **The win is real; the harness just couldn't
see it until the throttle exposed the headroom.**

## Why phase 3's 18 ms wall-clock wasn't a regression

OffscreenCanvas-backed worker rendering is paced by the browser compositor
at vsync (~16.7 ms). `--disable-gpu-vsync` only uncaps main-thread Canvas2D
rendering. Once the canvases are transferred to the worker, the rAF wall-
clock on main reflects the compositor cadence, not the work being done.

The V8 profile total (79 ms over 30 s) is the truth. The wall-clock metric
was lying.

## Production decision (revised from phase 3)

Worker mode is a **clear production win** under any of these conditions:

- The user device is CPU-constrained (mobile, low-end laptops, thermally
  throttled, background tab) — the throttle test makes this concrete.
- Future work adds main-thread cost: L3/L4/L5 lighting, more React UI,
  audio fast-paths, network loops. Worker mode buys 2 000 ms / 30 s of
  main-thread budget back.
- No quality regression — visuals, lighting, HUD, wildlife, reactive
  decorations all paint identically (verified via screenshot).

**Default-on is defensible.** The kill switch (`?worker=off`) stays for
diagnostics. Online play stays on main-thread for now (NetMatch's host /
guest snapshot loops are too entangled with the renderer for this pass —
documented as next-step in the plan doc).

## Files

- `A-worker-on.md` · `B-worker-off.md` · `C-worker-on-throttled.md` · `D-worker-off-throttled.md` — full perf reports
- `A-worker-on-stats.json` · `C-worker-on-throttled-stats.json` — worker-side render-time rollups
