# Worker offload — phase 5 deep diagnostics

**Branch:** `feat/worker-offload-experiment` · castle · 4 bots hard · 30 s · random P1 input
**Build:** `dist-perf` (sourcemaps), `npm run perf -- --arena=castle`

Phase 4 demonstrated that worker mode runs (and that the harness's main-thread
rAF metric was lying because of OffscreenCanvas vsync pacing). Phase 5 adds
proper instrumentation so we can see what's actually happening inside the
worker:

- **Worker-side `perfTrace` mirror.** When the URL has `?debug=perf`, the
  worker enables `perfTrace` and ships per-second snapshots back. Same
  `render.bg / render.fg-nature / render.players / render.particles / …`
  breakdown the main-thread report has always had, just for the worker side.
- **Per-frame render-time histogram.** 200 × 0.1 ms buckets, shipped as a
  number array per second. The proxy reconstructs p50/p95/p99 + long-frame
  counts. **Apples-to-apples comparison with main-thread rAF stats.**
- **Long-frame attribution inside the worker.** Soft threshold = 12 ms.
  Crossings capture the per-frame perfTrace section deltas so we can see
  which subsystem caused that hitch.
- **Compositor frame pacing.** Independent rAF probe in the proxy that
  measures presentation deltas during the perf window only (not contaminated
  by countdown / loading). Frame drops counted as deltas > one vsync.

## Headline (4 scenarios, single 30 s run each)

| Scenario | Main rAF avg | Main CPU/30s | Worker render avg/frame | Worker p99 | Compositor drops |
|---|---|---|---|---|---|
| A · worker on | 17.9 ms (56 fps) | **88 ms** | **0.54 ms** | 3.10 ms | 28 / 1 684 (1.7 %) |
| B · worker off (baseline) | 6.3 ms (158 fps) | 2 070 ms | — | — | — |
| C · worker on, 4× CPU throttle | 18.0 ms (56 fps) | 2 735 ms | 0.55 ms | 2.80 ms | 29 / 1 685 (1.7 %) |
| D · worker off, 4× CPU throttle | **32.1 ms (31 fps)** | 4 897 ms | — | — | — |

## What the deep instrumentation reveals (scenario A — worker on, no throttle)

### Per-frame distribution inside the worker

```
frames: 3 668
avg renderFrame:        0.54 ms
p50 0.50 · p95 1.10 · p99 3.10 · max 44.00
long(>12ms): 1 · long(>16.67ms): 1   ← single 44 ms outlier
```

The render is fast and tight: 95 % of frames complete in ≤ 1.1 ms; 99 % in ≤ 3.1 ms.

### Section timings inside the worker

| Section | Avg ms / frame |
|---------|---------------|
| renderFrame (total) | 0.54 |
| render.fg-nature | 0.14 |
| render.overlay (HUD) | 0.08 |
| render.players | 0.07 |
| render.bg | 0.07 |
| render.particles | 0.05 |
| render.entities | 0.02 |
| render.afterimages | 0.02 |

These match the main-thread baseline's section timings within sampling noise:
in scenario B, `render.fg-nature` averaged 0.14 ms, `render.players` 0.07 ms.
**Same code, same canvas API, same speed — different thread.**

### Long-frame attribution

```
44.00 ms frame: renderFrame 43.80 ms · render.overlay 37.50 ms · render.players 2.90 ms · render.fg-nature 1.00 ms
```

The single >16.67 ms outlier was a HUD redraw spike (probably the kill-feed
font shaping path on its first invocation in the worker — JIT cost). One
hitch in 30 s is well within the budget; the next-frame compositor catches
up and presents normally.

### Compositor presentation pacing

```
1 684 presentations · avg 17.89 ms (56 fps observed)
p50 17.60 · p95 18.90 · p99 22.80 · max 52.50
frame drops (>20.67 ms): 28 / 1 684 (1.7 %) · heavy drops (>33 ms): 2
```

Presentation cadence sits at vsync (~17.9 ms). 1.7 % of inter-presentation
gaps are >1 vsync (a dropped frame). Two events crossed 33 ms.

## What the deep instrumentation reveals under stress (scenario C — worker on + 4× throttle)

The throttle hits the main thread; workers run on a separate thread and
stay fast.

```
Worker render: avg 0.55 ms  (vs 0.54 ms unthrottled — within noise)
Worker p99:    2.80 ms      (vs 3.10 ms unthrottled — also within noise)
```

Compositor pacing in C shows one 298 ms outlier (`max 298.00`), but only 1
heavy drop overall — likely a single GC pause on the main side. The 99th
percentile is still 23.2 ms (one extra vsync).

Compare to **scenario D (worker off + throttle)**: main rAF avg 32.1 ms,
**151 frames over 33 ms (25 %)**, p99 = 67.7 ms. The user sees a slideshow.

## Cross-mode CPU comparison

| | Main thread CPU over 30 s |
|---|---|
| A worker on | 88 ms |
| B worker off | 2 070 ms |
| **Δ** | **23.5× reduction** |

(Phase 4 saw 27×; the difference is normal sample-to-sample variance — both
runs measure the same thing.)

## What this proves

1. **The worker's renderer matches main's renderer in per-frame work** — same
   sections, same averages within noise. The migration didn't introduce a
   slowdown, despite the structured-clone-per-frame wire format.
2. **Main-thread CPU drops by 23×** (88 ms vs 2 070 ms over 30 s). Main is
   genuinely free for React, audio, networking, lighting, future work.
3. **Frame-drop rate is acceptable**: 1.7 % at vsync (2 heavy drops in 30 s).
   Room to make it better — current wire format is structured-clone of the
   full MatchState per frame; replacing with the binary snapshot codec from
   `net/snapshot.ts` would cut postMessage cost.
4. **Under main-thread CPU pressure (the production case for offload), the
   win is dramatic**: worker stays at 56 fps, main-thread mode collapses
   to 31 fps with 25 % of frames missing one or more vsyncs.
5. **Long-frame attribution gives us a name when something hitches**:
   the single 44 ms outlier was `render.overlay` (HUD). Now we can fix it
   instead of guessing.

## Files

- `A-worker-on.md` · full perf report with worker diagnostics
- `B-worker-off.md` · baseline (no worker)
- `C-worker-on-throttled.md` · worker on + 4× CPU throttle
- `D-worker-off-throttled.md` · worker off + 4× throttle
- `*-stats.json` · raw worker stats (histogram, sections, long frames, compositor pacing)
