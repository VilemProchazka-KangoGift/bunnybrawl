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

## Recommended next session

In priority order:
1. **#19** matchEnd race — small, real bug, easy fix.
2. **#18** field rename — clarity win.
3. **#20** test gap comment — 5 minutes.
4. **#5** render-scale propagation in sim-worker — low impact, easy.
5. **#14** GameLoop cast → typed interface — refactor, defer until
   sim-worker is promoted to default.

The branch is **mergeable as-is**. None of the LOW/NIT items block
shipping the renderer-only worker default-on. Sim-worker is opt-in
and the LOWs above all live behind that flag.
