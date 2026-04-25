# Performance Profiling E2E — Design

**Date:** 2026-04-25
**Scope:** New automated profiling workflow. Adds an opt-in Playwright spec, a sourcemap-aware analysis script, and lightweight in-engine section timing. Run with `npm run perf`, output is a markdown report optimized for Claude to read in a single turn and propose fixes.
**Goal:** "Run the profile, create analysis, offer improvements" as a one-prompt workflow. CPU + heap + GC tracking, file:line resolved hotspots, no sourcemap leak to production.

---

## Problem

Today there is no way to find performance bottlenecks beyond the in-game `?debug=fps` overlay (which only reports frame stats — current/avg/1%-low). When the game stalls or a frame goes long, we cannot tell:

- *What subsystem* is slow (physics vs cosmetics vs rendering vs AI).
- *What function* is hot (sprite drawing vs particle emission vs awareness pass).
- *Whether the stall is GC-induced* (allocation pressure causing pauses) or pure CPU work.
- *Whether memory is leaking* across a long match.

The diagnostic loop today is "guess and instrument." We want: run one command, get a self-contained markdown report that pinpoints hotspots with file:line, frame stats, allocation hotspots, and a heap timeline.

## Goal

A single command — `npm run perf` — that:

1. Builds the production bundle with sourcemaps to a non-deployed output directory.
2. Runs a configurable stress scenario in Playwright via `vite preview`.
3. Records a CPU sampling profile, a heap allocation sampling profile, and a heap-size timeline via Chrome DevTools Protocol.
4. Captures section timings (fixedUpdate / cosmeticStep / renderFrame / awareness / particles) from in-engine instrumentation gated on `?debug=perf`.
5. Resolves all file:line locations through the sourcemaps.
6. Emits `test-results/perf/report.md` — a markdown report designed for Claude to read in one turn and produce a fixes proposal.

The intended user-facing flow is one prompt: *"run the perf profile and propose fixes."* Claude runs `npm run perf`, reads the report, opens the cited source files, returns a fixes proposal in the same turn.

## Decisions captured during brainstorming

- **Workflow shape:** option B — one-prompt workflow. Claude runs the profile and analyzes in the same turn. No heuristic suggestions baked into the script (option C rejected — heuristics rot fast and miss the surprises).
- **Scenario scope:** option C — parameterized via CLI flags (`--arena --bots --duration --difficulty`). Default to one stress scenario (`rooftops`, 4 bots, hard, 30s). Single-scenario default; suite-style is feature creep.
- **Sourcemaps in production:** **never**. Production build (`npm run build` → `dist/`) stays sourcemap-free and untouched. Perf run uses a separate output (`dist-perf/`, gitignored) built only when running `npm run perf`. The vite config file is not changed; sourcemaps are toggled via the `vite build --sourcemap` CLI flag.
- **Section instrumentation:** included. Wraps `GameLoop.fixedUpdate`, `GameLoop.tickCosmetic`, `Renderer.renderFrame`, `AwarenessGraph.compute`, `ParticleSystem.update`. Gated on `debugFlags.perfEnabled` (URL param `?debug=perf`). When disabled: one boolean check per call, no other overhead.
- **Memory & GC tracking:** all three additions adopted — heap sampling profile (allocation hotspots), heap-size timeline (leaks vs churn), GC pause attribution on long frames. All collected in the same Playwright spec via CDP, near-zero collection cost.
- **CI integration:** none. Spec excluded from default `npm run test:e2e`. Perf tests are flaky as regression gates; opt-in only via `npm run perf`.
- **Comparison to baselines:** out of scope. Each run is self-contained. No stored history, no diff-vs-previous logic.
- **Function-name resolution:** by `file:line` only. Production minify mangles names away; sourcemaps reliably resolve location, less reliably resolve original identifiers. The report shows `src/engine/renderer.ts:185` — the reader opens the file to see the function.

---

## Architecture

Five pieces.

### 1. `src/engine/perfTrace.ts` (new, ~80 lines)

Lightweight `performance.now()` accumulators for engine subsystems. Gated on `debugFlags.perfEnabled`. Exports:

```ts
export const perfTrace = {
  enabled: false,                // synced from debugFlags.perfEnabled at startup
  begin(name: string): number,   // returns startMark; no-op if disabled
  end(name: string, start: number): void,
  snapshot(): Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }>,
  reset(): void,
};
```

When disabled: `begin` returns 0, `end` is a no-op (single boolean check). When enabled: stores per-section sample arrays, computes p95 on snapshot.

Wrapped sections:
- `GameLoop.fixedUpdate` (per tick)
- `GameLoop.tickCosmetic` (per cosmetic step)
- `Renderer.renderFrame` (per render frame)
- `buildAwareness` in `src/engine/ai/awareness.ts` (per bot per tick)
- `ParticleSystem.update` (per cosmetic step)

The wrapper is a `try/finally` pattern so an exception in the wrapped function still records the timing. Per-section sample buffers are circular Float32Arrays sized for ~5s of samples at the section's expected call rate (~300 for fixedUpdate, ~600 for renderFrame, ~2400 for awareness/4 bots). `perfTrace.enabled` is set once at module init from `debugFlags.perfEnabled` (which reads the URL `?debug=perf` flag). The toggle is per-page-load, not per-frame — runtime mutation is not supported.

`window.__perfTrace = perfTrace` exposed in dev/perf builds for E2E to read.

### 2. `e2e/perf-profile.spec.ts` (new, ~120 lines)

Reads scenario config from env vars (set by the wrapper script):

```
PERF_ARENA       default rooftops
PERF_BOTS        default 4
PERF_DIFFICULTY  default hard
PERF_DURATION_S  default 30
PERF_OUT_DIR     default test-results/perf
```

Flow:

1. `page.goto('/?arena=${arena}&bots=${bots}&difficulty=${difficulty}&killLimit=999&debug=perf')`
2. `await page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0)`
3. Open CDP session: `const cdp = await page.context().newCDPSession(page)`
4. Enable + start collection:
   - `Profiler.enable` + `Profiler.start({samplingInterval: 100})` — CPU profile, 100µs samples
   - `HeapProfiler.startSampling({samplingInterval: 32768})` — heap allocation profile, 32KB samples
   - PerformanceObserver in-page: `new PerformanceObserver(...).observe({entryTypes: ['longtask']})` — captures long-task entries (browser-default threshold ≥50ms). Long-task `attribution` array carries containerType which surfaces GC pauses. Pushes entries to a buffer on `window.__longTasks`.
   - Heap-size timeline: every 1s, `await cdp.send('Performance.getMetrics')`, push `JSHeapUsedSize` to local array.
5. `await page.waitForTimeout(duration * 1000)` while heap-size sampler runs.
6. Stop collection:
   - `const { profile } = await cdp.send('Profiler.stop')` → `cpu.cpuprofile`
   - `const { profile: heap } = await cdp.send('HeapProfiler.stopSampling')` → `heap.heapprofile`
   - Read `window.__perfTrace.snapshot()`, `window.__longTasks`, `window.__fpsCounter.dumpSamples()` via `page.evaluate`.
7. Write all artifacts under `${PERF_OUT_DIR}`:
   - `cpu.cpuprofile` (binary JSON, openable in Chrome DevTools as a fallback)
   - `heap.heapprofile`
   - `frame-samples.json` (rAF dt timeline + p50/p95/p99)
   - `sections.json` (`__perfTrace.snapshot()` output)
   - `long-tasks.json` (timestamped long-task entries)
   - `heap-timeline.json` (1Hz JSHeapUsedSize series)
   - `metadata.json` (scenario params, build commit SHA, build time, user agent, run timestamp)

### 3. `scripts/analyzePerfProfile.mjs` (new, ~250 lines)

Pure-Node script. Inputs: artifacts in `${PERF_OUT_DIR}`. Output: `${PERF_OUT_DIR}/report.md`.

Steps:

1. **Load** all six JSON artifacts + `cpu.cpuprofile` + `heap.heapprofile`.
2. **Build sourcemap consumer** — load every `dist-perf/assets/*.js.map` via the `source-map` package, build URL → consumer map.
3. **Resolve CPU profile**:
   - For each node in the cpuprofile, look up `callFrame.url + lineNumber + columnNumber` against the sourcemap.
   - Compute self-time per node: `hitCount * (totalDuration / totalSamples)`.
   - Sort by self-time descending, drop V8 internals (`(garbage collector)`, `(idle)`, `(program)`, frames at chrome-extension URLs).
   - Aggregate: top 20 hotspots; sum-by-module bucket (`rendering/`, `gameLoop/`, `ai/`, `audio/`, `net/`, `themes/`, `characters/`, `arenas/`, other).
4. **Resolve heap profile**: same shape — top 20 allocation sites by sampled bytes/second.
5. **Frame stats**: from `frame-samples.json`, compute mean / p50 / p95 / p99 / max, count of frames > 16.67ms, count of frames > 33ms. Compute long-frame timeline (frames > 25ms with timestamp).
6. **GC attribution**: for each long frame, find any long-task entry within ±50ms and attribute its GC time. Output as a column on the long-frame timeline.
7. **Heap timeline summary**: from `heap-timeline.json` — start, peak, end, growth rate, sawtooth amplitude (peak-to-trough average), GC event count (transitions where heap dropped >5MB).
8. **Section timings**: from `sections.json` — per-section calls, total, avg, p95.
9. **Write `report.md`** in the format specified below.

Filters and quality gates:
- Drop hotspots from `node_modules/` paths in the report's "by module" view (still listed in raw hotspots).
- If sourcemap lookup fails for a hotspot, fall back to `chunk-XXX.js:line` — surface the missing-sourcemap warning at the top of the report.
- If the cpuprofile is empty (sampling started before the page settled), abort with a clear error.

### 4. `scripts/runPerfProfile.mjs` (new, ~80 lines)

Wrapper that orchestrates the full run.

CLI: `--arena --bots --duration --difficulty`. Defaults: rooftops, 4, 30, hard.

Steps:
1. Parse CLI args; validate (arena ID against arena pack registry; bots 1–4; duration 5–300s).
2. Print scenario summary.
3. Run `vite build --sourcemap --outDir dist-perf` (build perf bundle).
4. Spawn `vite preview --outDir dist-perf --port 4175` in the background (detached child, killed on completion or error).
5. Wait for `http://localhost:4175/bunnybrawl/` to respond.
6. Run `playwright test e2e/perf-profile.spec.ts --reporter=line` with env vars set (`PERF_*` and `PLAYWRIGHT_BASE_URL=http://localhost:4175/bunnybrawl/`).
7. Stop preview server.
8. Run `node scripts/analyzePerfProfile.mjs --in test-results/perf`.
9. Print path to `test-results/perf/report.md`.

Failure handling: on any step failure, print the failing step + last 20 lines of stderr, exit non-zero. Always kill preview server in `finally`.

### 5. Configuration changes

- **`src/engine/debugFlags.ts`**: add `perfAllowed` and `perfEnabled` fields, parsed from `?debug=perf` (same shape as fps/nav/net flags). At module init, `perfTrace.enabled = perfAllowed`.
- **`playwright.config.ts`**: add `testIgnore: ['**/perf-profile.spec.ts']` so default `npm run test:e2e` doesn't pick it up. The perf wrapper invokes the spec by explicit filename.
- **`package.json`**: add scripts:
  - `"perf": "node scripts/runPerfProfile.mjs"`
  - `"perf:build": "vite build --sourcemap --outDir dist-perf"` (escape hatch for diagnosing build issues)
- **`.gitignore`**: add `dist-perf/`, `test-results/perf/`.

`vite.config.ts` is **not changed**. Sourcemaps are toggled via the `--sourcemap` CLI flag passed by the wrapper, never via the config file.

---

## Data flow

```
                         ┌─ vite build --sourcemap ──> dist-perf/ (with .map files)
runPerfProfile.mjs ──────┤
   (CLI wrapper)         ├─ vite preview --outDir dist-perf (background server)
                         │
                         ├─ playwright test perf-profile.spec.ts
                         │      │
                         │      ├─ goto ?debug=perf scenario URL
                         │      ├─ CDP: Profiler.start, HeapProfiler.startSampling
                         │      ├─ in-page: PerformanceObserver(longtask), 1Hz heap sampler
                         │      ├─ wait duration
                         │      └─ writes 6 JSON artifacts + 2 binary profiles
                         │
                         └─ analyzePerfProfile.mjs
                                │
                                ├─ load artifacts + dist-perf/**/*.map
                                ├─ resolve CPU + heap profiles via sourcemaps
                                ├─ correlate long frames ↔ long tasks
                                └─ writes report.md
```

---

## Report format

The report is the deliverable; everything else exists to produce it. Designed for Claude to read in one turn (~5KB) and produce fixes from. Sections in priority order:

```markdown
# Perf Profile — 2026-04-25T15:30:42Z

**Scenario**: rooftops · 4 bots hard · 30s
**Build**: prod (dist-perf, sourcemaps) · commit d2ae776
**User-Agent**: Chrome/Headless 12X.X (Playwright)

## Frame stats (rAF samples)
- avg 13.8ms (72 fps) · p50 13.5 · p95 19.2 · p99 28.4 · max 41.2
- long(>16.67ms): 142/2160 (6.6%)
- long(>33.33ms): 8/2160 (0.4%)

## Heap timeline (1Hz)
- start 38MB · peak 71MB · end 64MB
- growth +26MB over 30s (sawtooth, not leak)
- GC events: 47 (avg drop 24MB)

## Section timings (mean ms/frame, ?debug=perf instrumentation)
| Section          | Calls | Total | Avg  | p95  |
|------------------|-------|-------|------|------|
| renderFrame      | 2160  | 14.7s | 6.81 | 11.2 |
| fixedUpdate      | 1800  | 7.20s | 4.00 | 6.10 |
| cosmeticStep     |  900  | 1.89s | 2.10 | 3.40 |
| ai.awareness/bot | 7200  | 1.37s | 0.19 | 0.42 |
| particles.update |  900  | 0.95s | 1.06 | 2.00 |

## Top 20 CPU hotspots (self-time)
| %    | ms  | File:line |
|------|-----|-----------|
| 18.3 | 549 | src/engine/rendering/players.ts:412 |
| 11.2 | 336 | src/engine/renderer.ts:185 |
| ...  | ... | ... |

## Top 20 allocation sites (sampled bytes/sec)
| MB/s | File:line |
|------|-----------|
| 4.2  | src/engine/ai/awareness.ts:172 |
| 1.8  | src/engine/rendering/particles.ts:55 |
| ...  | ... |

## Self-time by module
| Module      | %    | ms   |
|-------------|------|------|
| rendering/  | 41.0 | 1240 |
| gameplay/   | 16.0 |  480 |
| ai/         | 10.0 |  290 |
| audio/      |  4.0 |  120 |
| net/        |  2.0 |   60 |
| other       | 27.0 |  810 |

## Long frames (with GC attribution)
| t      | frame ms | GC pause | top fn (in CPU profile, ±20ms window)               |
|--------|----------|----------|-----------------------------------------------------|
| 12.3s  | 41.2     | 22ms     | src/engine/rendering/particles.ts:98 (drawParticles) |
| 18.7s  | 33.4     | —        | src/engine/gameplay/playerCollisions.ts:64           |
| ...    | ...      | ...      | ...                                                  |

## How to read this report
The fastest path to fixes:
1. Look at "Section timings" — which subsystem dominates? That's the file scope to focus on.
2. Open the top 5 entries in "CPU hotspots" — read the cited line and the surrounding function.
3. Cross-reference with "allocation sites" — a function appearing in both is a high-value target (CPU + GC pressure).
4. For long frames with GC attribution, the allocation sites table tells you who to blame.
```

---

## Files to create / modify

**New:**
- `src/engine/perfTrace.ts` — section instrumentation
- `e2e/perf-profile.spec.ts` — Playwright spec
- `scripts/analyzePerfProfile.mjs` — sourcemap-aware analyzer
- `scripts/runPerfProfile.mjs` — orchestration wrapper

**Modified:**
- `src/engine/debugFlags.ts` — add `perfAllowed` / `perfEnabled`
- `src/engine/gameLoop/GameLoop.ts` — wrap `fixedUpdate` and `tickCosmetic` with `perfTrace.begin/end`
- `src/engine/renderer.ts` — wrap `renderFrame`
- `src/engine/ai/awareness.ts` — wrap `buildAwareness` (per bot per tick)
- `src/engine/gameLoop/cosmetics/ParticleSystem.ts` — wrap `update`
- `src/engine/fpsCounter.ts` — add `dumpSamples()` exporter for E2E to read
- `src/App.tsx` — expose `window.__perfTrace` and `window.__fpsCounter` in dev/perf builds
- `playwright.config.ts` — `testIgnore: ['**/perf-profile.spec.ts']`
- `package.json` — `"perf"` and `"perf:build"` scripts; add `source-map` to devDependencies
- `.gitignore` — `dist-perf/`, `test-results/perf/`

---

## Out of scope

- CI gating / regression detection (perf tests are flaky; would need quarantining and statistical tooling — feature creep)
- Stored baselines / diff-against-previous-run (each run is self-contained)
- Heuristic fix suggestions in the analyzer (workflow B chosen — Claude analyzes the report)
- Memory leak fix automation (we surface a leak verdict in the heap timeline; fixing it is a separate task)
- Multi-scenario suite mode (parameterized CLI is enough; running multiple scenarios is `npm run perf -- --arena=A` then `npm run perf -- --arena=B`)
- Mobile / touch profiling (desktop-only V1; mobile profiling has different mechanics — Chrome remote DevTools instead of CDP-via-Playwright)
- Production deployment of sourcemaps (explicitly forbidden — perf build is `dist-perf/`, never deployed)
- Replacing or extending the existing `?debug=fps` overlay — perfTrace is a parallel system; fpsCounter stays as the in-game live-view overlay
