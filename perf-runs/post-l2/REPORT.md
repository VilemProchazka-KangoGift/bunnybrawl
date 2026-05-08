# Post-L2 perf snapshot — 2026-05-08

**Branch:** `feat/lighting-l2-emitters` @ `951cd3c`
**Scenario:** 4 bots hard, 30s, random P1 input. 1 run per arena.

## Frame stats per arena

| Arena | avg | p50 | p95 | p99 | max | long>16.67ms | long>33ms |
|---|---|---|---|---|---|---|---|
| **castle** | **11.6ms** | 11.1 | 19.6 | **38.8** | 48.2 | **47/600 (7.8%)** | **14** |
| meadow | 9.0 | 8.0 | 16.1 | 19.0 | 37.8 | 18/600 (3.0%) | 2 |
| volcano | 7.5 | 7.0 | 10.0 | 15.0 | 20.2 | 2/600 (0.3%) | 0 |
| treetops | 6.1 | 5.6 | 11.1 | 14.0 | 15.6 | 0/600 (0.0%) | 0 |

**Headline**: castle is the perf outlier. Was 6.83ms avg in the Phase 3 bakeoff (commit `3fd4783`); now 11.6ms — a ~5ms regression. Other arenas are within budget (16.67ms = 60fps frame).

## Castle hot spots (CPU self-time, total profile = 3156ms)

| % | ms | Site |
|---|---|---|
| 12.4 | 389 | `drawImage` (×4 entries: bg blits, fg-nature cache, light static cache, sprite cache) |
| 5.6 | 177 | (largest single drawImage) |
| 2.6 | 82 | `perfTrace.ts:109 (measure)` — instrumentation overhead |
| 2.1 | 65 | `fillText` — fpsCounter (artifact of `?debug=perffps` perf instrumentation) |
| 2.0 | 64 | `addColorStop` — `lightStamp.ts > stampGradient` builds 5 stops per emitter per frame |
| 2.0 | 63 | `particles.ts:80 (gc)` — particle iteration |
| 1.7 | 55 | `castle.ts:852 (drawAnimatedForeground)` — banners + rats |
| 1.3 | 42 | `lightStamp.ts:53 (stampGradient)` — radial-gradient creation per stamp |
| 1.1 | 35 | `castle.ts:825 (drawAnimatedBackground)` — torch embers |

renderFrame perfTrace span = 0.73ms avg (≤8% of frame budget). Most of the 11.6ms is unmeasured native canvas work + browser composite.

## Improvement opportunities — ranked

### 1. **Castle banner system (`drawAnimatedForeground`) — IMPORTANT**

55ms profiled in castle's drawAnimatedForeground (line 852). Banners draw across all floating platforms with quad-curve waving, per-frame. Castle has the most decorations of any arena. Pre-L2 this was already ~3ms/frame but unprofiled.

**Investigation:** quad path-fills per banner per frame. Likely cacheable (similar to `_fgNatureCache`) since banner shape is mostly static — only the wave phase changes. Phase-driven cache: bake N keyframes (4-8 phases), blit with phase index.

**Estimated win:** 1-2ms/frame on castle.

### 2. **`addColorStop` cost per emitter (64ms = 2.0%) — IMPORTANT**

`stampGradient` calls `createRadialGradient` + 4-5 `addColorStop` per emitter per frame. At ~10 active emitters/frame on castle (5 torch flicker overlays + 4 player auras + carrot glow when active), that's ~600 gradient creations + ~3000 addColorStop calls per second.

**Fix candidates:**
- **Quantize-and-cache gradients by (color hex, radius bucket, intensity bucket)** — likely 80%+ hit rate for player auras (color rarely changes; intensity steps coarsely with respawn-pillar ramp). Castle torches don't benefit much (flicker delta varies tick-to-tick).
- **Pre-bake static torch flicker overlays as N intensity tiers** (e.g. 8 buckets) at arena load. Per-frame stamp = drawImage, not gradient creation. Trade alloc time for setup time.
- **Drop falloff stops to 3** — the 5-stop `INVERSE_SQUARE` curve in `lightStamp.ts:84-91` is over-fitted; 3 stops produce visually identical gradients.

**Estimated win:** 0.5-1ms/frame on emitter-heavy arenas.

### 3. **Daytime skip threshold too tight — IMPORTANT**

`_compositeEmitters` early-returns when `_lastLightOpacity <= 0`. Castle's dayPhase cycles over 120s, so the layer hits exactly 0 only briefly at noon. Most of the run, opacity is small but nonzero (e.g. 0.05) — we still pay the per-frame stamp work for an essentially-invisible layer.

**Fix:** raise the skip threshold to `<= 0.02` or so. At opacity < 2% the screen-blend contribution is below the JND threshold; not paying the stamp cost is net visual neutral.

**Estimated win:** the per-frame stamp work × the fraction of run-time spent at low-opacity. On castle's 120s cycle that's most of the day-half, conservatively 30%+ of frames.

### 4. **`drawImage` chain on bgNight / fg-nature / light-static — NIT**

389ms across 4 drawImage entries dominates the profile. These are:
- bgNightCanvas blit (per arena load + post-kill)
- fgNatureCache blit (per frame)
- lightStaticCache blit (per frame, only when opacity > 0)
- sprite cache blits (per player per frame)

All necessary; all cached sources. **No obvious fix** — this is what we trade for not running shape primitives per frame.

### 5. **`particles.ts:80` 63ms (2.0%) — NIT**

Probably the cosmetic-step particle update or spawn loop. Not L2-related. Worth inspecting separately.

### 6. **Castle's drawAnimatedBackground embers — NIT**

35ms / 1.1%. Five floating ember sprites at 60Hz with `fastSin` drift. Could batch into one path-fill per frame (5 fills → 1 fill via `moveTo` + `arc` sub-paths). Already a documented pattern in CLAUDE.md.

**Estimated win:** ~10-15ms profiled = ~0.3ms/frame.

## Comparing castle vs Phase 3 (commit `3fd4783`)

|  | Phase 3 | Post-L2 | Δ |
|---|---|---|---|
| avg | 6.83 | 11.6 | +4.8 |
| p99 | 14.77 | 38.8 | +24 |
| long>33ms | 0 | 14 | +14 |

Phase 3 had: 5 torch emitters + 4 player auras (no leader detection, no spawn pillar amplification, no carrot glow synthesis). Post-L2 adds: spawn-pillar amplification (rare; only during respawn), leader detection (cached, ~free), carrot glow per active carrot, more dynamic emitters per frame.

**The 5ms regression isn't fully explained by L2 emitter additions alone** — the dynamic-emitter loops add at most 1-2 stamps per frame. Suspects:
- Banners/embers/etc were already expensive but masked by Phase 3's bakeoff focus on emitter cost
- p99 jumped from 15ms → 38.8ms; likely the addColorStop chain hit a GC threshold under sustained gradient creation
- 14 long-tasks > 33ms suggest GC pauses; the heap profile shows 0 GC events but only 1Hz sampling

**Recommended next step:** profile castle specifically with `?lighting=off` to isolate L2 cost. If `?lighting=off` brings castle back to ~7ms, the regression is L2-attributable. If not, it's banners/embers/something pre-existing.

## Test parity (no regression)

| Arena | Pre-L2 estimate (Phase 3) | Post-L2 measured | Within budget (16.67ms)? |
|---|---|---|---|
| castle | ~6.8ms | 11.6ms | yes (avg), borderline (p99) |
| volcano | unmeasured | 7.5ms | yes |
| meadow | unmeasured | 9.0ms | yes |
| treetops | unmeasured | 6.1ms | yes |

All arenas hold 60fps on average. Castle's p99 (38.8ms) is the only red flag.
