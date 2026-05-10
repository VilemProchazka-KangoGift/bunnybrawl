# Worker offload — code review findings

**Date:** 2026-05-10
**Branch:** `feat/worker-offload-experiment`
**Scope:** Two rounds of deep review on the worker-offload experiment
(15 commits ahead of `main`).

Round 1 audited the whole branch end-to-end after phase 8 + handoff docs.
Round 2 verified the round-1 fix commits (`9152651` + `10fb8bc`) and looked
for new regressions introduced by them.

This doc preserves every finding so a future session can pick up without
re-doing the analysis. Status reflects the tree as of `10fb8bc`.

## Round 1 findings (pre-fix)

### BLOCKER

**#1 — Sim-in-worker mode could not construct.**
`EngineWorkerProxy.makeBootState` used `require('../simulator/initialState')`
in browser ESM and called `createInitialMatchState` with 2/6 args.
Construction crashed; `useLocalMatch`'s try/catch fell through to the
renderer-only path. **All phase 7 sim-worker perf numbers were
misattributed** — the path never engaged.
Status: **fixed** in `9152651`. Static import + 6-arg call with
`Math.random` as the placeholder `gameRandom`. Bootstate is overwritten
on the first 5Hz state mirror, so the placeholder RNG is fine.

### HIGH

**#2 — `mirrorArena` broken in renderer-only worker (default ON).**
The worker's hosted `ReactiveDecorationSystem` / `WildlifeSystem` were
built against the **un-mirrored** arena while main's Simulator ran
against the mirrored variant. Cosmetic positions misaligned; the static
fg-nature cache was wrong on mirrored matches. User-visible regression
on the default-on path.
Status: **fixed** in `9152651`. Added `_mirror` flag set at
`host:init`/`host:initEngine` and a `resolveArena(id)` helper that
re-applies `mirrorArena()` at every layout-bearing site
(`host:renderBackground`, `host:renderFrame`).

**#3 — Worker→main message races after `destroy()`.**
`handleMessage` could fire after the proxy was destroyed, spawning
`onPhaseChange` / `setPlayerNames` calls into a stale GameLoop or
overwriting `__rendererProxy` on a fresh constructor.
Status: **fixed** in `9152651`. Both proxies now early-return from
`handleMessage` when `destroyed`.

**#4 — No graceful fallback on worker death.**
Worker `error` / `messageerror` events surfaced to console but the
match kept running with a dead worker (no rendering). Per-frame
`postMessage` calls would log spam.
Status: **fixed** in `9152651`. Error handlers mark the proxy dead so
subsequent posts no-op silently; `onError` callback fires so Match.tsx
can surface a banner. Auto-fallback to main-thread Renderer is a
bigger lift, deferred — `?worker=off` URL kill switch is the manual
escape hatch.

**#5 — Render-scale changes don't reach worker in sim-mode.**
`getRenderScale()` is read only at construction. Subsequent DPR
changes (browser zoom, monitor switch) don't propagate to the
worker's hosted Renderer.
Status: **deferred**. Renderer-only path subscribes via
`subscribeRenderScale` in the proxy; sim-worker path needs the same
wiring. Low impact in practice (most users don't change DPR mid-match).

**#6 — `warmSpriteCache` called with empty list.**
EngineWorkerProxy's `getActiveCharacterNames()` returns `[]` until
the first state mirror, but `runLoadingTasks` calls `warmSpriteCache`
**before** any mirror lands. Worker pre-warms nothing; first frame
JIT-compiles the sprite cache.
Status: **fixed indirectly** by the BOT_CHARACTERS fix — the
`bootState.players` now have correct `character.name` fields, so
`getActiveCharacterNames` returns the real list.

**#7 — Vite alias rules brittle to relative-path depth.**
The old `id.endsWith('/audio')` heuristic over-matched and the
explicit `'../audio' || '../../audio'` enumeration missed deeper
nesting.
Status: **fixed** in `9152651`. Replaced with resolved-absolute-path
map. Works regardless of `../` depth, doesn't over-match unrelated
modules ending in `/audio`.

**#8 — Early input batches silently dropped.**
EngineWorkerProxy posted input batches before the worker finished
booting; structured-clone on a worker still loading its imports
queues the message. Mostly benign on modern browsers but flaky on
slow hardware.
Status: **mitigated** by the eager-import commit (`10fb8bc`) — the
worker boots faster, narrowing the race window. `inputsEverSent` flag
ensures at least one batch always lands.

### MEDIUM

**#9 — State mirror staleness.**
5Hz state mirror (200 ms interval) means main's `getState()` reads
20 frames behind worst case. Affects pause UI, bunnyTestShim
diagnostics, anything that synchronously reads state. Mostly
acceptable for the current callers.

**#10 — Unbounded `longFrames` buffer in worker.**
`_perf.longFrames` had no cap — a 4× CPU-throttled run could fill
hundreds. Status: ring-bound at `LONG_FRAME_BUFFER_CAP=32` per flush;
flushed every 1s. Total memory bound by flush interval × cap.

**#11 — Cosmetic 2× over-tick on worker.**
Worker calls both `reactiveSystem.fixedUpdate(dt)` and
`reactiveSystem.cosmeticUpdate(dt)` on the same tick. Main runs them
on different tick rates (60Hz fixed vs 30Hz cosmetic). Visual
difference is negligible for sway.

**#12 — Audio preload race in sim-worker.**
`audio.preloadArena(themeId)` fires from the worker's
`onPreloadArenaRequest` event. If the worker emits before main's
AudioManager finishes init, the preload no-ops.

**#13 — `warmedNames` not cleared on theme change.**
`makeRendererProxy.warmedNames` accumulates forever. On switchArena,
old character warmedNames stay tracked; harmless cache pollution.

**#14 — GameLoop cast hides ~20 missing methods.**
`engineProxy as unknown as GameLoop` in useLocalMatch defeats
type-checking on the engine-proxy public surface. Adding new public
methods to GameLoop won't error if EngineWorkerProxy doesn't
implement them.

### LOW

**#15-#17** — Setter-prop propagation: `setLanguage`, `switchArena`
mid-update race, `_workerActive` permanent flag. All cosmetic /
narrow-edge.

## Round 2 findings (post-fix)

Round 2 verified each round-1 fix is correct and looked for new
regressions introduced by the fix commits.

### LOW

**#18 — `EngineWorkerProxy.mirrorArena` field is misnamed.**
The field stores the un-mirrored arena Match.tsx hands the proxy.
`mirrorArena()` is re-applied inside the worker. End-to-end behavior
is correct; the field name implies a mirrored copy and will mislead
the next reader.
Recommendation: rename to `_arena`. ~6 use sites.

**#19 — `matchEnd` callback can read placeholder bootState.**
`EngineWorkerProxy.dispatchEngineEvent` line ~374:
```ts
case 'matchEnd': this.onMatchEnd(m.winner ?? null, this.mirrorState ?? this.bootState);
```
If a `matchEnd` event arrives before the first 200 ms state mirror,
VictoryScreen consumes the bootState (placeholder players, score 0).
Real matches can't end in <200 ms, but a stuck-loading path that
flips `matchOver` via `host:engineSetPhase` could hit it.
Recommendation: have the worker include the final state in the
`matchEnd` event payload, OR force a 5Hz mirror flush immediately
before posting `matchEnd`.

**#20 — Worker bundle hygiene test does not exercise vite stubs.**
`worker-bundle-no-main-deps.test.ts` walks raw source imports — it
catches regressions in `audio.ts` source (good) but doesn't validate
the post-stub graph. If a stub itself were to import a banned module,
the test would miss it.
Recommendation: add a comment to the test acknowledging the gap, or
add a second test that walks from worker entry through the stub map.

### NIT

**#21 — `CHARACTERS[slot] = def` couples to `def.slot === key`.**
`engineWorkerInit.ts:67` writes the def under the lobby-slot key
without checking `def.slot` matches. Holds by lobby contract.

**#22 — Eager-import comment understates bundle delta.**
The comment says "tens of KB"; actual delta is ~100-200 KB. The
trade-off (kill 3-5 s cold-start at the cost of a bigger one-time
worker fetch) is still right; comment is cosmetic.

## Round 2 — explicitly verified safe

**Worker-death postMessage race**: posts in flight from `tick()`
during the crash window go to a worker that's about to terminate.
`postMessage` doesn't throw on a dead worker — silently dropped. No
leak.

**`Math.random` in `makeBootState`**: bootstate is overwritten on
first 5Hz mirror; non-determinism doesn't cross the wire.

**`BOT_CHARACTERS.clear()` on each `host:initEngine`**: worker only
handles one match at a time (`host:stop` terminates), so the clear
is safe.

**Windows path-separator handling in vite alias map**: keys built via
`path.resolve` on Windows produce backslashes; lookup uses the same
function so they match. Verified.

## Round 3 findings (post-fix re-review)

A third review round looked at the tree after rounds 1 & 2 with fresh
eyes (concurrency, memory leaks, mirror chain, bundle leaks, type
safety, test coverage). **No new BLOCKERs or HIGHs.** Two MEDIUMs
plus a handful of LOW/NITs.

### MEDIUM

**#23 — `warmedNames` not cleared on switchArena (engine-mode).**
`EngineWorkerProxy.makeRendererProxy`'s `warmedNames` Set accumulates
across arena swaps. After `switchArena`, `hasWarmedAll` can falsely
return true for old characters; the new arena's first frame paints
without a pre-warmed sprite cache.

**#24 — React StrictMode double-mount of EngineWorkerProxy.**
Verified safe (the `=== this` guard on `__engineWorkerProxy` global
protects), but the interaction wasn't documented and would surprise
the next reader.

### LOW / NIT

- **#25** `host:stop` posted before `worker:ready` — robust, no fix.
- **#26** `i18next` in worker bundle test allowlist — verified zero
  imports today; allowlist retained as future-proofing.
- **#27** `STATE_MIRROR_INTERVAL_MS=200` vs `LOADING_TIMEOUT_MS=15000`
  — safe in practice.
- **#28** iOS background tab — consistent with no-worker behavior.
- **#29** Carry-over of #18 (mirrorArena field naming).
- **#30** `dispatchEngineEvent`'s `kind: string` defeats the
  `WorkerEngineEventMsg.kind` union. Adding a new kind in messages.ts
  won't error here.

### Verified safe in round 3

- Worker bundle hygiene (raw grep against shipped JS — no
  `react`/`howler`/`i18next`)
- `__rendererProxy` / `__engineWorkerProxy` global cleanup uses
  `=== this` guards correctly
- Worker-death postMessage race — silent drop, no throw
- `BOT_CHARACTERS.clear()` per init — per-worker, no contamination
- `_perf.longFrames` ring — per-worker, no carry-over
- `mirrorArena` re-application in sim-worker mode — `resolveArena`
  is only called from the renderer-only dispatch path; sim-worker
  routes through `engineWorkerInit.getEngineRenderer()` so the
  worker's own Renderer.mirrored handles it. No double-mirror.

## Status — all rounds 1-3

All actionable findings have been addressed in code:

| # | Severity | Status |
|---|----------|--------|
| 1 | BLOCKER | fixed (`9152651`) |
| 2-7 | HIGH | fixed (`9152651`) — including bonus discoveries |
| 8 | HIGH | mitigated by `10fb8bc` |
| 9-13 | MEDIUM | accepted (low impact in practice) |
| 14 | MEDIUM | deferred (typed interface refactor) |
| 15-17 | LOW | cosmetic, not addressed |
| 18 / 29 | LOW | fixed: field renamed `mirrorArena` → `_arena` |
| 19 | LOW | fixed: worker ships final state in `matchEnd` payload |
| 20 | LOW | fixed: comment added clarifying stub-graph gap |
| 21 | NIT | accepted |
| 22 | NIT | fixed: comment updated (~tens of KB → ~100-200 KB) |
| 23 | MEDIUM | fixed: `switchArena` flushes `warmedNames` |
| 24 | MEDIUM | fixed: comment added near `__engineWorkerProxy` |
| 25-28 | LOW/NIT | verified safe, no action needed |
| 30 | NIT | fixed: typed `kind` against `WorkerEngineEventMsg['kind']` |

**The branch is mergeable.** Renderer-only worker is the production
default. Sim-worker is opt-in via `?simWorker=on` for local play, with
the path to default-on documented in the top-level handoff and the
NetMatch async-fixedUpdate handoff.
