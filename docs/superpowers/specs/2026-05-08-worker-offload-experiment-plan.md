# Worker offload — experimental worktree plan

**Date:** 2026-05-08
**Status:** Plan. Companion to `2026-05-08-worker-offload-brainstorm-prep.md`. Decisions below are the locked starting point; revisit only if a phase produces evidence that contradicts them.
**Worktree:** `../rabbits-worker` on branch `feat/worker-offload-experiment`
**Scope:** Production-shaped experiment. Castle-only perf checkpoints. E2E suite stays green through every phase.

## Goal

Validate the ~5ms main-thread recovery hypothesis from the brainstorm-prep doc by running the simulation + rendering inside a Web Worker via `transferControlToOffscreen`. Produce a real perf number on castle (current worst arena, 11.6ms avg / 38.8ms p99 per `perf-runs/post-l2/REPORT.md`).

**Success bar (castle, 30s × 4 hard bots × random P1 input):**
- avg: 11.6ms → ≤7.0ms (recovers ≥4ms main-thread budget)
- p99: 38.8ms → ≤20ms
- long>33ms: 14 → ≤2

If hit, the worktree is the start of the production refactor and merges through the normal phase-by-phase review path. If missed by >1.5ms on avg, file a "considered, deferred" record with the data and a write-up of where the savings went.

## Why production-shaped

The brainstorm-prep doc framed two options: spike-quality (throwaway) and production-shaped. We're choosing production-shaped because:
- The renderer/sim wiring is the same code either way — building it once correctly costs ~25% more time than a spike but produces 100% reusable code.
- E2E coverage stays green every commit, so regressions are caught at the phase that introduced them, not in a giant "make it work" PR at the end.
- The brainstorm-prep doc already pre-resolved every architectural question that mattered. There is nothing to discover by doing a spike first.

## Adopted defaults (locked)

From the brainstorm-prep doc, with rationale where it matters:

| # | Decision | Source |
|---|---|---|
| 1 | One worker holding sim + render + cosmetics. No two-worker split. No SAB. | Doc §1, §6c (GH Pages COOP/COEP blocker) |
| 2 | `transferControlToOffscreen` per existing canvas; CSS `mix-blend-mode` siblings preserved. | Doc §1 (5a) |
| 3 | Worker drives its own RAF. | Doc §2 (a) |
| 4 | Per-frame InputState batch main → worker. | Doc §3 (a) |
| 5 | Per-event SimulatorEvents worker → main. Revisit only if audio jitter measurable in playtest. | Doc §4 |
| 6 | State mirror at 60Hz (every tick) for `window.__bunnyTest` parity. Cheap on transferable buffers. | Doc §6 (a), production-shaped requirement |
| 7 | Kill switch: `?worker=off` URL param + `carrotroyale_worker` localStorage. Falls back to main-thread GameLoop. | Doc §14 (a) |
| 8 | Worker bundle: zero React / Howler / Trystero / i18next imports, enforced by regression test. | Doc §8 |
| 9 | Networking, lobby, mobile-touch stay on main thread for now. Touch input forwarded as InputState batch like keyboard. | Doc §10, §11 |

## Out of scope (deferred to follow-up PRs)

- **Networking integration in worker.** Production refactor blocker per doc §5. Host loop's input fairness ring + WebRTC datachannel ↔ worker integration is the trickiest piece; ship it on its own branch *after* the SP perf number is banked.
- **HMR / source-map DX work.** Doc §15. Accept full reload; revisit once core refactor is stable. Document the workflow in a follow-up.
- **Audio batching tuning.** Per-event postMessage is the simplest contract. Only revisit if measurable jitter shows up in manual play (most likely on stomps).
- **Lobby in worker.** Doc §11. Lobby is much cheaper than match; not worth the worker startup cost before the user has even picked an arena.
- **Two-week production hardening pass.** This plan ends at "castle perf is recovered, full test suite green, E2E happy path validated". Polish, perf tuning of the postMessage protocol, and edge-case bug fixes are follow-up work.

## Phases

Each phase ends with: `npm run perf -- --arena=castle` × 3 runs → median saved to `perf-runs/worker-experiment/<phase>/REPORT.md`. Variance >0.3ms is signal (per `feedback_canvas2d_perf_patterns` memory). Don't run perf concurrently with other Claude sessions (per `feedback_isolate_perf_runs` memory).

### Phase 0 — Worktree + baseline (1h)

- `git worktree add ../rabbits-worker -b feat/worker-offload-experiment`
- `npm install` in worktree (per memory: required for `tsc -b` and E2E)
- Run `npm run perf -- --arena=castle` × 3 on the unchanged branch HEAD; save median to `perf-runs/worker-experiment/baseline/REPORT.md`
- Sanity check: numbers should be within ~5% of `perf-runs/post-l2/REPORT.md` castle row (11.6ms avg / 38.8ms p99). If not, investigate before proceeding.
- Commit: scaffold doc updates, no code change yet.

### Phase 1 — Worker scaffold + canvas transfer round-trip (4h)

**Goal:** Vite worker config works, `transferControlToOffscreen` round-trip works, regression test prevents future drift.

- Vite config: confirm `new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })` builds. Check chunk output for forbidden imports.
- New file: `src/engine/worker/renderWorker.ts` — minimal entry: receives transferred canvas, draws a colored rect at 60Hz via own RAF, posts ack back.
- New file: `src/engine/worker/workerHost.ts` — main-thread side: constructs Worker, transfers fgCanvas, holds the message bridge.
- Match.tsx: gated by `?worker=off` (default ON) — when ON, instantiate WorkerHost instead of GameLoop's renderer-side; when OFF, current path.
- New test: `src/engine/worker/__tests__/worker-bundle-no-main-deps.test.ts` — resolves the worker entry's transitive imports via Vite's module graph (or static AST walk), asserts `react`, `howler`, `trystero`, `i18next` are absent.
- E2E: existing tests must still pass with `?worker=off` (the kill switch path). Add one new `e2e/worker-roundtrip.spec.ts` smoke test that loads with default (`?worker=on`), confirms the canvas got drawn into.

**Perf checkpoint:** likely break-even or small loss on castle (worker only draws a rect; no real win to measure yet). The number to watch is "did worker startup add ≥5ms to first-frame TTI?" which would matter for victory→rematch flow later.

### Phase 2 — Renderer in worker, Simulator on main (8h)

**Goal:** Renderer fully runs in worker. Main posts state snapshot per frame. Proves Renderer is worker-safe (no `Image()`, no `<img>`, no DOM-only APIs hidden inside).

- Worker imports `Renderer` + `rendering/*`. Worker constructs Renderer against transferred fgCanvas + bgCanvas.
- Main: every frame, after `gameLoop.fixedUpdate()`, build a state-for-render payload and post to worker. Investigate reusing `net/snapshot.ts` codec — same bytes already proven for network transfer; if too restrictive (`WirePlayer`-only), build a structured-clone path that ships full `MatchState` + `Particle[]` + `Gib[]` references. Decide based on cost.
- Worker calls `renderer.renderFrame(payload, ...)` from its RAF.
- bgNightCanvas + lightCanvas stay on main during this phase (they receive draws from main directly — keeps the diff small).
- DOM-API audit: walk `engine/rendering/` + Renderer for `Image()`, `Font*`, `document.*`, `window.*`. Expected zero hits. Any found get routed through a main-side bridge.
- HUD canvas stays on main (per CLAUDE.md: "HUD is NEVER tinted" — it's already on its own DOM canvas; cheaper to keep there than transfer).
- Lighting canvases (bgNight, light) — keep on main this phase to bound the diff. Migrate in phase 4.

**Perf checkpoint:** modest gain expected — Renderer's per-frame cost (~5-7ms of castle's 11.6ms) moves to worker, but state-snapshot postMessage adds new cost. Net win likely 1-2ms.

### Phase 3 — Move Simulator into worker (8-10h)

**The headline phase.** This is where the 4-5ms recovery should land.

- Worker now owns Simulator + ParticleSystem + 4 cosmetic systems.
- Main thread keeps: KeyboardManager (window listeners), TouchInputManager, AudioManager, Trystero transport (unused but kept for the network path), React, DOM HUD.
- Per-frame protocol:
  - Main → worker: `{type: 'tick', inputs: InputState[5], dt}` once per frame
  - Worker → main: SimulatorEvents events (`{type: 'sfx', name: 'jump'}`, `{type: 'haptic', slot, intensity}`, `{type: 'phaseChange', phase}`, etc.) per event
  - Worker → main: state mirror digest every tick (small Float32Array via Transferable; covers everything `__bunnyTest.state()` exposes)
- `window.__bunnyTest` rebinds to read from the mirror. Audit `bunnyTestShim.ts` and every E2E spec that touches `__bunnyTest.*` — every field they read must appear in the mirror.
- SimulatorEvents wiring: a single `MessagePort`-style switch on main, dispatches to `audio.play(name)`, haptics, phase-change handler, match-end handler, `onPlayerLanding`. Mirror existing GameLoop callback wiring exactly.
- Pause/resume: main posts `{type: 'pause'}` / `{type: 'resume'}` on React lifecycle; worker pauses its RAF.
- Match-end: worker fires `onMatchEnd` event; main triggers VictoryScreen as before.
- Arena switch: main posts `{type: 'switchArena', id, overrides}`; worker rebuilds Simulator + Renderer.
- E2E: full suite must pass. `e2e/perf-profile.spec.ts` reads `__bunnyTest?.state()?.countdown` — verify mirror staleness <100ms doesn't break the `waitForFunction` poll.

**Perf checkpoint:** **the number that decides go/no-go.** Expected: castle 11.6ms → 6-8ms avg.

### Phase 4 — Multi-canvas in worker (3h)

- Transfer bgNightCanvas + lightCanvas to worker.
- Confirm CSS `mix-blend-mode: multiply` (bgNight) and `mix-blend-mode: screen` (light) compose correctly across worker-owned offscreens. Browsers support this since OffscreenCanvas spec; verify visually.
- Move `_bakeBgNightVariant` into worker (it touches bgCanvas which is now worker-owned anyway).
- Move `_compositeEmitters` early-exit + light catalog bake into worker (already `OffscreenCanvasRenderingContext2D`-compatible per L2 design).

**Perf checkpoint:** marginal additional gain. Mostly a hygiene phase to put all rendering in one place.

### Phase 5 — Test suite green + final perf report + decision (4h)

- Run full `npm test` + `npm run test:e2e`. Fix anything that broke.
- Run perf on castle, meadow, rooftops with both `?worker=on` (default) and `?worker=off` (kill-switch path); confirm kill switch still produces baseline numbers.
- Write `docs/superpowers/specs/2026-05-XX-worker-offload-experiment-results.md` with measured deltas vs `perf-runs/post-l2/REPORT.md`.
- **Decision:**
  - **If success bar hit:** open follow-up issues for networking integration, HMR DX, audio batching tuning. Worktree merges via normal review (likely staged across 2-3 PRs split on phase boundaries).
  - **If success bar missed:** keep the worktree as evidence; write up where the savings went (postMessage overhead? state-mirror cost? Chrome-specific cliffs?); file as "considered, deferred". Production refactor postponed pending a different approach (rendering-only worker? specific hot-path workers?).

## Risks specific to the experiment

- **State mirror cost erases gains.** If the per-tick `__bunnyTest` mirror costs more on main than we saved by moving sim, phase 3 shows no win. **Mitigation:** mirror is a single Transferable Float32Array, structured-clone-free; should be sub-50µs/tick on modern Chromium. Measure separately if phase-3 numbers don't show win.
- **`e2e/perf-profile.spec.ts`'s `__bunnyTest?.state()?.countdown` read.** Mirror must include `countdown`. Audit *all* fields the spec reads (and other E2E specs) before phase 3 lands.
- **Audio jitter** from per-event postMessage — possibly perceptible on rapid stomp combos. Mitigation: only address if observed in playtest; reserve "fast-path bypass" for stomp/jump SFX.
- **`?debug=perffps` perfTrace** — currently uses `performance.now()` and mutates window state. In the worker, `perfTrace` calls happen in worker scope. The debug overlay still draws on the main-thread fpsCounter canvas. Need a perfTrace-in-worker shim that posts measurements back for the overlay to read. Without it, `npm run perf` reports become useless.
- **Random P1 input** (`PERF_INPUT=random`) — `e2e/perf-profile.spec.ts` injects keys via `page.evaluate`. KeyboardManager stays on main, so this works unchanged. Confirm in phase 1 smoke test.
- **First-frame TTI** — worker startup adds ~50-100ms cold. Confirm rematch flow still feels snappy. If startup is the issue, keep the worker alive across matches and reset state via switchArena message.
- **CSS mix-blend-mode across worker-owned canvases** — modern browsers handle this fine but worth visually confirming on phase 4. If broken, fall back to in-worker compositing (gives up GPU compositor, costs ~0.5ms — acceptable).

## What this plan is NOT

- Not a full production rollout. Networking, mobile, HMR DX, and audio tuning are explicitly deferred.
- Not a perf measurement methodology change. Use existing `npm run perf -- --arena=castle`. Don't invent a new measurement harness.
- Not a brainstorm. The 14 questions in the brainstorm-prep doc are pre-decided per the table above. New questions that surface during phases get addressed inline; design-level pivots get a new spec doc.

## Reading list

- `docs/superpowers/specs/2026-05-08-worker-offload-brainstorm-prep.md` — companion doc with the architectural reasoning
- `perf-runs/post-l2/REPORT.md` — baseline numbers
- `e2e/perf-profile.spec.ts` — perf measurement harness (must keep working)
- `src/components/bunnyTestShim.ts` — `__bunnyTest` API surface (must mirror)
- `src/engine/simulator/Simulator.ts` — what runs in worker
- `src/engine/simulator/__tests__/regression-no-browser-apis.test.ts` — existing invariant; the new `worker-bundle-no-main-deps.test.ts` is the worker-side parallel
- `src/engine/renderer.ts` + `src/engine/rendering/*` — what runs in worker as the render path
- `src/components/Match.tsx` — canvas mount; will own the WorkerHost handle when worker is on
