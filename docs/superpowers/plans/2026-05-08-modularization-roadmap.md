# Modularization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute all 13 findings in `docs/modularization-backlog.md` as a sequenced series of PR-sized phases, eliminating documented footguns and unblocking the bigger architectural refactors.

**Architecture:** Each finding lands as one PR (one phase here). Phases are ordered so cleanups precede splits, splits precede test migrations, and test migrations precede the high-risk wire-format and NetMatch refactors. Most phases are mechanical refactors backed by the existing ~2000-test suite plus `tsc -b`. The two high-risk phases (#11, #12) gate on extra golden-byte / determinism snapshots written in earlier phases.

**Tech Stack:** TypeScript, Vite 8, Vitest, Playwright, React 19, Canvas 2D. No new runtime deps anywhere in the roadmap.

**Source spec:** `docs/modularization-backlog.md` (read in full before starting any phase — every phase below cites a numbered finding there).

**Branch strategy:** One feature branch per phase, e.g. `feat/modularize-cooldowns`, merged into `main`. Do NOT batch multiple phases into one branch — independent review and revertability are the whole point.

**Verification commands (used by every phase unless noted):**

```bash
npm run build           # tsc -b && vite build — stricter than --noEmit; CI parity
npm test                # vitest run; check `git diff --stat` for CRLF-only snapshot churn before committing
npm run test:e2e        # playwright; only required for phases that touch Match.tsx, renderer, or net code
```

**Pre-existing failing tests** (reproduce against `HEAD~` before assuming a regression, per CLAUDE.md):
- `MainMenu.test.tsx` (logo.png Vite transform)
- `VictoryScreen.test.tsx`
- `switchArena.test.ts > respawns players at new arena spawn points`
- `integration.test.ts > network mode round-trip > fixedUpdate with explicit inputMap drives both players`

---

## Sequencing summary

| Phase | Finding | Effort | Risk | Depends on |
|-------|---------|--------|------|------------|
| 1 | #1 `Cooldowns<K>` utility | S | none | — |
| 2 | #2 `darken()` + `Ctx2D` alias | S | none | — |
| 3 | #3 `TransitionTracker<K, T>` | S | low | — |
| 4 | #4 Delete `_audioEnabled` | S | low | — |
| 5 | #5 `__bunnyTest` E2E shim | S | medium-low | — |
| 6 | #6 WildlifeSystem | M | low | (none, but better after #2 lands `Ctx2D`) |
| 7 | #7 Split `net/snapshot.ts` | M | low | — |
| 8 | #8 Split `rendering/hazards.ts` | M | low | (better after #2) |
| 9 | #9 Split `Match.tsx` | M | medium | (better after #5) |
| 10 | #10 PlayerInput context arg | M | low-medium | — |
| 11 | #13 Move gameplay tests onto Simulator | L | low correctness, high volume | #5 |
| 12 | #11 Schema-driven snapshot codec | L | high | #7, #11 (this list) |
| 13 | #12 Decompose `net/netMatch.ts` | L | high | #11, #12 (this list) |

Phases 1–5 can ship in any order or in parallel branches (no shared files except minor ones). Phase 9 is independent of the rest; bump it earlier if `Match.tsx` is in your way. Phases 11/12/13 are strict-ordered.

---

## Phase 1 — Promote `Cooldowns<K>` utility (Backlog #1)

**Goal:** Eliminate the duplicated `Map<X, number>` decay-and-fire pattern. Five+ sites collapse to one class.

> **Scope correction (made during implementation):** Survey of the 5 spec sites found that only 2 share the genuine countdown shape (`set(k, T); decay; fire on ≤0; re-set`): `arenas/packs/underwater.ts` (`_bubbleAccum`) and `gameLoop/gameplay/MatchSystem.ts` (`periodicAmbientTimers`). The other 3 are different patterns:
> - `sfxCooldowns.ts` is a struct-of-named-cooldowns per player (`{ land, headbonk, crouch }`) with a single per-tick decay step that's split from check-and-set; cleanly migrating it requires 3 `Cooldowns<PlayerSlot>` instances and touches 5+ call sites across systems.
> - `PlayerCosmeticSystem.footstepAccumulators` and `lobbyGame._footstepAccs` are accumulators with a per-tick variable threshold (interval depends on `|vx|`) and drift-free residual carryover. `Cooldowns.set` would overwrite residuals; `uninitialized=ready` is wrong here.
>
> Phase 1 migrates the 2 countdown sites only. The other 3 are filed as a follow-up (provisionally **Phase 1b: `Accumulator<K>` utility + sfxCooldowns split**) — to be scoped after the rest of the roadmap lands or earlier if the duplication bites.

**Files:**
- Create: `src/engine/cooldowns.ts`
- Create: `src/engine/__tests__/cooldowns.test.ts`
- Modify: `src/engine/arenas/packs/underwater.ts` (`_bubbleAccum` — countdown shape, fits)
- Modify: `src/engine/gameLoop/gameplay/MatchSystem.ts` (`periodicAmbientTimers` — countdown shape, fits)
- ~~`sfxCooldowns.ts`~~, ~~`lobbyGame.ts:141`~~, ~~`PlayerCosmeticSystem.ts > footstepAccumulators`~~ — **deferred to Phase 1b** (different patterns; see scope-correction note above)

**Tasks:**

- [ ] **1.1 Survey the call sites.** Run `grep` for the existing patterns to confirm every site:
  ```bash
  grep -rn "footstepAccumulators\|periodicAmbientTimers\|_bubbleAccum\|sfxCooldowns" src/
  ```
  Note any spot using a non-Map (plain number) variant — those are still candidates if they share the decay-and-fire shape.

- [ ] **1.2 Write the `Cooldowns<K>` test.** API: `tick(k, dt) → boolean ready`, `set(k, t)`, `clear()`, `clear(k)`. Test:
  - `set` then `tick` returns `false` until accumulated dt exceeds the set value, then `true` once.
  - `tick` for a key that was never set returns `true` (i.e. uninitialized = ready, matching footstep semantics).
  - `clear()` resets all keys; `clear(k)` resets one.
  - Negative dt: clamp to 0 (defensive).

- [ ] **1.3 Implement `Cooldowns<K>` in `src/engine/cooldowns.ts`.** Single class, generic over `K`. No deps. Use `Map<K, number>`. Keep file under 60 lines.

- [ ] **1.4 Verify the test passes.**
  ```bash
  npx vitest run src/engine/__tests__/cooldowns.test.ts
  ```

- [ ] **1.5 Migrate `sfxCooldowns.ts`.** Replace its impl with a `Cooldowns<SoundName>`-backed export, OR delete it and update its callers to use `Cooldowns` directly. Decide based on how thin the wrapper is — if it adds nothing, delete.

- [ ] **1.6 Migrate the four other sites** (`lobbyGame`, `underwater`, `PlayerCosmeticSystem`, `GameLoop`). One file per task. After each: run `npm test` and verify no regressions in the file's own test (e.g. `gameLoop.test.ts` for `GameLoop`).

- [ ] **1.7 Full verify.** `npm run build` then `npm test`. Check `git diff --stat` for CRLF-only snapshot churn.

- [ ] **1.8 Commit & PR.** Title: `refactor(engine): consolidate decay-and-fire cooldowns into Cooldowns<K>`. Body cites backlog #1.

---

## Phase 2 — Hoist `darken()` + `Ctx2D` type alias (Backlog #2)

**Goal:** Three `darken` impls collapse to one; ~5 `as unknown as CanvasRenderingContext2D` casts disappear.

**Files:**
- Modify: `src/engine/fastMath.ts` — add `export function darken(hex: string, amount: number): string` next to `hexToRGB`.
- Modify: `src/engine/types.ts` — add `export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`.
- Modify: `src/engine/rendering/players.ts` — delete local `darken`, import; replace `Ctx2D` casts.
- Modify: `src/engine/arenas/packs/underwater.ts` — delete local `darken`, import.
- Modify: `src/engine/navDebugOverlay.ts` — delete local `darken`, import.
- Modify: `src/engine/renderer.ts:458,488` — use `Ctx2D` on signatures, drop casts.
- Modify: `src/engine/rendering/hud.ts:93` — same.

**Tasks:**

- [ ] **2.1 Diff the three `darken` impls** to confirm they're equivalent.
  ```bash
  grep -nA 8 "function darken" src/engine/rendering/players.ts src/engine/arenas/packs/underwater.ts src/engine/navDebugOverlay.ts
  ```
  If any differ (e.g. different clamping), pick the most defensive variant and note any behavioral change in the commit message.

- [ ] **2.2 Add `darken` to `fastMath.ts`** with a small unit test (input → output for known hex values, including edge `#000` and `#fff`).

- [ ] **2.3 Add `Ctx2D` to `types.ts`.**

- [ ] **2.4 Replace each call site.** One file per commit if you're feeling defensive — these are independent. Use `Ctx2D` on internal helper signatures (`_drawX(ctx: Ctx2D, ...)`). Casts at sprite-cache seams should melt away.

- [ ] **2.5 Verify.** `npm run build` then `npm test`. Visual smoke test: `npm run dev`, open meadow + underwater, confirm no rendering regressions.

- [ ] **2.6 Commit & PR.** Title: `refactor(engine): hoist darken() + Ctx2D alias, drop OffscreenCanvas casts`.

---

## Phase 3 — Generic `TransitionTracker<K, T>` (Backlog #3)

**Goal:** Collapse the three near-identical `prevState` / `detect transitions` impls into one generic class. Removes the documented "extending `PrevPlayerCosmeticState` requires updating three locations" footgun.

**Files:**
- Create: `src/engine/transitionTracker.ts`
- Create: `src/engine/__tests__/transitionTracker.test.ts`
- Modify: `src/engine/gameLoop/cosmetics/playerTransitions.ts` + `PlayerTransitionSystem.ts`
- Modify: `src/engine/gameLoop/cosmetics/entityTransitions.ts` + `EntityTransitionSystem.ts`
- Modify: `src/engine/gameLoop/cosmetics/surfaceImpact.ts` + `SurfaceImpactSystem.ts`

**Tasks:**

- [ ] **3.1 Read all three current impls.** Confirm the shape: `Map<K, T> prev`, `snapshot(source) → T`, `detect(prev, curr) → effect`. Identify any divergence (most likely: how prev is initialized).

- [ ] **3.2 Write tests for `TransitionTracker<K, T>`.** API:
  ```ts
  class TransitionTracker<K, T> {
    constructor(snapshot: (source: unknown) => T);
    detect(k: K, source: unknown, onTransition: (prev: T, curr: T) => void): void;
    clear(): void;
  }
  ```
  Tests cover: first call (no prev → no transition), second call with same source → no fire, second call with changed source → fire with prev/curr, `clear()` resets.

- [ ] **3.3 Implement `TransitionTracker`.**

- [ ] **3.4 Migrate `playerTransitions`.** This is the largest consumer. Move the `PrevPlayerCosmeticState` interface into `PlayerTransitionSystem` and pass `(player) => snapshotPlayer(player)` to the tracker. Delete the separate `prevPlayerCosmeticState` map.

- [ ] **3.5 Run full test suite + determinism snapshot.**
  ```bash
  npx vitest run src/engine/__tests__/regression-determinism.test.ts
  npm test
  ```
  Determinism MUST be byte-identical — this is a pure refactor.

- [ ] **3.6 Migrate `entityTransitions`.**

- [ ] **3.7 Migrate `surfaceImpact`.**

- [ ] **3.8 Search for any leftover `prevX` map** in cosmetics that fits the same shape — promote it too while you're here. Stop at the first one that doesn't fit cleanly.

- [ ] **3.9 Update `src/engine/CLAUDE.md`.** The "extending `PrevPlayerCosmeticState` requires updating three locations" warning is now obsolete — replace it with the new pattern (one `snapshot` fn).

- [ ] **3.10 Commit & PR.** Title: `refactor(cosmetics): unify transition detection into TransitionTracker<K, T>`.

---

## Phase 4 — Delete `_audioEnabled` (Backlog #4)

**Goal:** Remove the rollback-era silenced-replay flag. It is always `true` and exists only as a discipline tax.

**Files:**
- Modify: `src/engine/gameLoop/GameLoop.ts` (lines 149, 257, 396, 477 per backlog — re-grep at execution time)
- Possibly: any caller of `setAudioEnabled` (search confirms scope)

**Tasks:**

- [ ] **4.1 Confirm the flag is dead.**
  ```bash
  grep -rn "_audioEnabled\|setAudioEnabled\|audioEnabled" src/
  ```
  Every read should be a self-gate inside `GameLoop`; every write should set `true` (or the field initializer). If any caller sets `false`, STOP and reassess — the backlog assumption is wrong.

- [ ] **4.2 Delete the field.** Remove the declaration, the setter (if exposed), and every `if (this._audioEnabled)` guard around `audio.play()` calls.

- [ ] **4.3 Update CLAUDE.md.** Drop any "always gate audio" guidance.

- [ ] **4.4 Verify.**
  ```bash
  npm run build && npm test
  ```
  Watch for: tests that mocked `audio.play` and counted calls. They should now count exactly the same number — if they don't, an `if (this._audioEnabled)` guard was hiding a real bug.

- [ ] **4.5 Commit & PR.** Title: `chore(engine): remove dead _audioEnabled rollback flag`.

---

## Phase 5 — Single `__bunnyTest` E2E shim (Backlog #5)

**Goal:** Aggregate every E2E diagnostic into one typed `window.__bunnyTest` snapshot so individual diagnostic methods can leave `GameLoop`/`Renderer`.

**Files:**
- Create: `src/components/bunnyTestShim.ts`
- Create: `src/types/global.d.ts` (if absent — declare `window.__bunnyTest`)
- Modify: `src/components/Match.tsx:419-462` (the existing `window.__gameLoop` / `__netMatch` / `__gameStore` block)
- Modify: `src/store/gameStore.ts:136`
- Modify (sweep): `e2e/perf-online.spec.ts`, `e2e/bot-behavior.spec.ts`, `e2e/renderer-branches.spec.ts`, `e2e/perf-profile.spec.ts`, plus any other E2E reading `window.__gameLoop` / `getRendererDiagnostics` / `isAutoSlowFlipped`

**Tasks:**

- [ ] **5.1 Inventory the E2E reads.**
  ```bash
  grep -rn "__gameLoop\|__netMatch\|__gameStore\|getRendererDiagnostics\|isAutoSlowFlipped" e2e/
  ```
  Make a list — every property accessed becomes a key on `__bunnyTest`.

- [ ] **5.2 Define `BunnyTestSnapshot`** in `global.d.ts`. Include: `state` (current MatchState getter), `diagnostics` (renderer diagnostics), `autoSlowFlipped`, `gameStore` getter, `netMatch` (or whatever the inventory turned up). Use real types — no `any`.

- [ ] **5.3 Build `__bunnyTest` lazily** in `Match.tsx`. Only mount in dev/test (`import.meta.env.DEV || window.__BUNNY_TEST_BUILD`). All values come from already-public APIs.

- [ ] **5.4 Migrate one E2E spec end-to-end.** Pick `e2e/bot-behavior.spec.ts` (smallest). Replace every `window.__gameLoop?.getState()` with `window.__bunnyTest.state()`. Run:
  ```bash
  npm run test:e2e -- bot-behavior
  ```

- [ ] **5.5 Migrate the rest of the E2E specs.** One per commit if the diff is large.

- [ ] **5.6 Drop the old shims.** Delete `window.__gameLoop`, `window.__netMatch`, `window.__gameStore` from `Match.tsx`. Verify no specs still reference them:
  ```bash
  grep -rn "__gameLoop\|__netMatch\|__gameStore" e2e/
  ```

- [ ] **5.7 Optional follow-up (in this PR or next):** drop the diagnostic methods from `GameLoop`/`Renderer` that exist only for E2E (`getRendererDiagnostics`, `isAutoSlowFlipped`). Each becomes a closure inside `bunnyTestShim.ts`.

- [ ] **5.8 Update CLAUDE.md.** Replace the "use `window.__gameLoop.getState()`" guidance with `window.__bunnyTest.state()`.

- [ ] **5.9 Commit & PR.** Title: `test(e2e): unify diagnostic surface into typed __bunnyTest shim`.

---

## Phase 6 — WildlifeSystem (Backlog #6)

**Goal:** Mirror `ReactiveDecorationSystem` for wildlife. Eight arena packs share the `home + fastSin(t*k+phase)*amp + pushFromPlayers` shape — promote it to a registered cosmetic system.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/WildlifeSystem.ts`
- Create: `src/engine/gameLoop/cosmetics/wildlife.ts` (pure helpers + kind registry)
- Create: `src/engine/__tests__/wildlifeSystem.test.ts`
- Modify (8 arena packs): `treetops.ts`, `meadow.ts`, `underwater.ts`, `spaceStation.ts`, `castle.ts`, `hauntedGraveyard.ts`, `candyLand.ts` — and any other pack with module-scoped wildlife state arrays found via grep
- Modify: `src/engine/gameLoop/GameLoop.ts` — register WildlifeSystem alongside other cosmetic systems
- Modify: `src/engine/themes/utils.ts` — keep `tickGroundCritter`, `pushFromPlayers`, `makeDtTracker` exports (now consumed by the system); remove anything that becomes dead.

**Tasks:**

- [ ] **6.1 Read `ReactiveDecorationSystem.ts`** and `reactiveDecorations.ts` end-to-end. The new system mirrors this exactly: `WildlifeKind` + `registerWildlifeKind` + `buildWildlife(arena) → WildlifeInstance[]` per arena pack.

- [ ] **6.2 Inventory wildlife per pack.**
  ```bash
  grep -rn "_squirrels\|_butterflies\|_bees\|_crabs\|_snails\|_robots\|_rats\|_gumdrops" src/engine/arenas/packs/
  ```
  Categorize each into `groundCritter | flock | clusterDrift` (or a new kind if none fits). Document the decision in the PR description.

- [ ] **6.3 Define types.** `WildlifeKind` interface ({ id, layer: 'pre'|'post', tick(inst, dt, players), draw(ctx, inst) }), `WildlifeInstance` (kind id, home, data bag for kind-specific runtime state).

- [ ] **6.4 Implement `WildlifeSystem`** with init/update/cleanup. Update phase ticks every instance via its kind's `tick`; draw is invoked from renderer at appropriate layer.

- [ ] **6.5 Register the three primitive kinds** (`groundCritter`, `flock`, `clusterDrift`) in `wildlife.ts`. Each calls existing primitives in `themes/utils.ts`.

- [ ] **6.6 Migrate `meadow.ts` first** (simplest: butterflies, bees, snails). Add `buildWildlife(arena)` to the pack, delete module-level `_butterflies`/`_bees`/`_snails` arrays and `_tickXDt`. Run:
  ```bash
  npm test -- arenas
  ```

- [ ] **6.7 Visual smoke-test meadow.** `npm run dev`, open `?arena=meadow&bots=2`, watch for: same number of critters, same wandering, players still push them away.

- [ ] **6.8 Migrate the other seven packs.** One per commit. After each pack, smoke-test that arena via the URL shortcut.

- [ ] **6.9 Wire `WildlifeSystem` into `GameLoop`.** It registers alongside `ReactiveDecorationSystem` (init on arena change, update each cosmeticStep, cleanup on stop).

- [ ] **6.10 Verify.**
  ```bash
  npm run build && npm test && npm run test:e2e
  ```

- [ ] **6.11 Update CLAUDE.md.** Document `WildlifeSystem` next to `ReactiveDecorationSystem` in the architecture section, including the kind registration pattern.

- [ ] **6.12 Commit & PR.** Title: `refactor(arenas): unify wildlife into WildlifeSystem with registered kinds`.

---

## Phase 7 — Split `net/snapshot.ts` (Backlog #7)

**Goal:** 708-line file → 4 focused files. Wire format byte-identical.

**Files:**
- Create: `src/engine/net/snapshot/types.ts`
- Create: `src/engine/net/snapshot/binaryCodec.ts`
- Create: `src/engine/net/snapshot/extract.ts`
- Create: `src/engine/net/snapshot/index.ts`
- Create: `src/engine/__tests__/snapshot-wire-format.test.ts` (golden bytes — see 7.1)
- Delete: `src/engine/net/snapshot.ts` (replaced by directory)

**Tasks:**

- [ ] **7.1 BEFORE moving anything, write a golden-bytes test.** This is the single most important step in the phase — and it gates Phase 12 too.
  - Construct a known `MatchState` with a couple of players (deterministic positions, timers, flags).
  - Call `encodeSnapshot(takeAuthSnapshot(42, state))`.
  - Snapshot the resulting `Uint8Array` (use `toMatchSnapshot()` with a hex stringifier — not `toMatchInlineSnapshot` to keep the file readable).
  - The test lives in `src/engine/__tests__/snapshot-wire-format.test.ts` and MUST stay green for the rest of this phase AND for Phase 12.

- [ ] **7.2 Create the directory and `index.ts` barrel** that re-exports the existing public surface verbatim. This stays in place during the migration.

- [ ] **7.3 Move types** into `types.ts`: `AuthSnapshot`, `SnapshotPlayer`, `createEmptySnapshot`, plus any pure interfaces.

- [ ] **7.4 Move binary codec** into `binaryCodec.ts`: `encodeSnapshot`, `decodeSnapshot`, all helpers. Delta re-exports stay in `index.ts`.

- [ ] **7.5 Move `takeAuthSnapshot`** into `extract.ts`. This is the only file allowed to import from gameplay (`types.ts`, `gameLoop`).

- [ ] **7.6 Run the golden test** after each move:
  ```bash
  npx vitest run snapshot-wire-format
  ```

- [ ] **7.7 Delete the original `snapshot.ts`** once the directory's `index.ts` covers every previously-exported name.

- [ ] **7.8 Verify.** `npm run build && npm test && npm run test:e2e`. Pay attention to `netMatch.test.ts` and any `interpolation.test.ts`.

- [ ] **7.9 Commit & PR.** Title: `refactor(net): split snapshot.ts into types/codec/extract`. Mention "wire-format byte-identical, gated by golden-bytes regression test".

---

## Phase 8 — Split `rendering/hazards.ts` (Backlog #8)

**Goal:** 879-line heterogeneous file → 4 focused files by hazard category. Visual output identical.

**Files:**
- Create: `src/engine/rendering/hazards/zones.ts` (`drawHazardZone`, `drawZeroGZone`, `drawCurrentZone`, `drawGeyser`, `drawBouncyPlatformOverlay`)
- Create: `src/engine/rendering/hazards/creatures.ts` (`drawGhost`, `drawPigeonFlock`, `drawScatterFlock`, `drawFlyingScatter`, `pickScatterColor`)
- Create: `src/engine/rendering/hazards/lava.ts` (`drawLavaRock`)
- Create: `src/engine/rendering/hazards/index.ts` (barrel + `clearHazardCaches` consolidating module-locals)
- Delete: `src/engine/rendering/hazards.ts`

**Tasks:**

- [ ] **8.1 Map module-local caches** (any `let cachedX = ...` or `const xCache = new Map(...)` at module scope). They consolidate into the new `index.ts` so that `clearHazardCaches()` continues to clear all of them at once.

- [ ] **8.2 Create the directory + `index.ts` barrel** re-exporting the existing public surface.

- [ ] **8.3 Move functions one category at a time.** Order: `lava` → `zones` → `creatures`. After each move:
  ```bash
  npm test -- rendering
  ```

- [ ] **8.4 Visual smoke test.** `npm run dev`, open volcano (lava), space station (zero-G), waterfall (currents), haunted graveyard (ghosts), rooftops (pigeons). Compare against `main` if anything looks off.

- [ ] **8.5 Delete the original `hazards.ts`.**

- [ ] **8.6 Verify.** `npm run build && npm test && npm run test:e2e`.

- [ ] **8.7 Commit & PR.** Title: `refactor(rendering): split hazards.ts by category`.

---

## Phase 9 — Split `Match.tsx` (Backlog #9)

**Goal:** 675-line component → orchestrator + 3 hooks + presentational overlays. **Order-of-effects is critical.**

**Files:**
- Create: `src/components/match/useLocalMatch.ts`
- Create: `src/components/match/useOnlineMatch.ts`
- Create: `src/components/match/useLoadingOverlay.ts`
- Create: `src/components/match/MatchOverlays.tsx`
- Modify: `src/components/Match.tsx` (becomes the slim orchestrator)
- Tests: ensure existing `Match.test.tsx` still passes; add focused tests for any non-trivial hook (loading overlay state machine deserves its own test).

**Tasks:**

- [ ] **9.1 Read `Match.tsx` end-to-end** and write a comment-block summary at the top of each `useEffect` describing: deps, cleanup order, refs accessed. This is your contract for the hook extraction.

- [ ] **9.2 Snapshot current behavior.** Manually run through: local match → pause → resume → arena change → victory. Then: online match → reconnect overlay (use `?simLatency=80&simJitter=20` plus a forced disconnect). Note any flicker or timing quirk you DON'T want to introduce.

- [ ] **9.3 Extract `useLoadingOverlay` first** — it's the most self-contained (`phaseIsLoading` + `localTasksDone` + `showLoadingCancel` + sub-text). Add a unit test for the state machine.

- [ ] **9.4 Extract `useLocalMatch`.** Pass refs (`gameLoopRef`, etc.) as parameters. **Critical:** preserve the "reset `loadingPhase=true` at top of local branch" caveat — it must run inside the hook, not after.

- [ ] **9.5 Extract `useOnlineMatch`.** This is the biggest. Includes NetMatch construction, listener wiring, the 1.8s reconnect-flash sequencing, wake-lock renewal. Reuse the same ref-passing pattern.

- [ ] **9.6 Extract `MatchOverlays.tsx`** — pure presentational JSX for pause/loading/reconnecting/level-select. Props in, JSX out, no effects.

- [ ] **9.7 Slim `Match.tsx`** to: refs, hook calls, overlay component mount, canvas mount. Target <200 lines.

- [ ] **9.8 Verify.** Run through the manual scenario list from 9.2. Then `npm run build && npm test && npm run test:e2e`. Online E2E (`@online`) is documented-flaky — re-run flakes once.

- [ ] **9.9 Commit & PR.** Title: `refactor(match): extract Match.tsx into hooks + presentational overlays`.

---

## Phase 10 — `PlayerInput` context arg (Backlog #10)

**Goal:** Remove the 3-branch (`network → touch → playerInputs`) in `Simulator._getPlayerInput`. Input map becomes the single source of truth; `RemoteInput` and a new `TouchAdapter` read from a per-tick context.

**Files:**
- Modify: `src/engine/input/PlayerInput.ts` (interface)
- Modify: `src/engine/input/RemoteInput.ts`
- Modify: `src/engine/input/RandomInput.ts`
- Modify: `src/engine/input/RuleBasedBot.ts`
- Modify: `src/engine/input/KeyboardInput.ts`
- Create: `src/engine/input/TouchAdapter.ts`
- Modify: `src/engine/simulator/Simulator.ts:347-651` (the `_getPlayerInput` branching) and `fixedUpdate` signature
- Modify: callers of `Simulator.fixedUpdate` (host loop in `net/hostAuthority.ts`, headless runner)

**Tasks:**

- [ ] **10.1 Read `Simulator._getPlayerInput`** and `fixedUpdate(dt, networkInputs)` to map the exact resolution order. Document it. **The order must remain identical** for online correctness.

- [ ] **10.2 Define the new interface.**
  ```ts
  interface PlayerInputContext {
    readonly networkInputs?: ReadonlyMap<PlayerSlot, InputState>;
    readonly airborne?: boolean; // for touch adapter
  }
  interface PlayerInput {
    readonly slot: PlayerSlot;
    getAction(state: MatchState, ctx?: PlayerInputContext): InputState;
    dispose?(): void;
  }
  ```
  All existing impls take `ctx?` and ignore it (no behavioral change yet).

- [ ] **10.3 Run the determinism snapshot test.**
  ```bash
  npx vitest run regression-determinism
  ```
  Must pass — interface widening only.

- [ ] **10.4 Update `RemoteInput`** to read `ctx.networkInputs?.get(this.slot)` instead of holding a reference set externally each tick.

- [ ] **10.5 Add `TouchAdapter`** that reads `ctx.airborne` (and whatever else the touch path needs) and produces an `InputState`. Replace the touch branch in `Simulator` with an inserted `TouchAdapter` for slots using touch.

- [ ] **10.6 Replace the `Simulator._getPlayerInput` branching** with a single `playerInputs.get(slot).getAction(state, ctx)`. The ctx is built once per tick.

- [ ] **10.7 Run determinism + integration + headless tests.**
  ```bash
  npx vitest run regression-determinism integration headless
  ```

- [ ] **10.8 Verify.** `npm run build && npm test && npm run test:e2e -- @online`.

- [ ] **10.9 Update `src/engine/CLAUDE.md`.** Drop the "browser-side touch and host-side network input overrides remain explicit special cases" caveat — it's no longer true.

- [ ] **10.10 Commit & PR.** Title: `refactor(input): unify input resolution via PlayerInputContext`.

---

## Phase 11 — Move gameplay tests onto Simulator (Backlog #13)

**Goal:** Migrate the bulk of `gameLoop.test.ts` (3,959 lines) onto `Simulator` directly so it runs Node-pure with no audio/renderer/howler/canvas mocks. Leaves `gameLoop.test.ts` for genuine adapter behavior only.

**Why now:** This unlocks the next two phases — `#11 wire schema` and `#12 NetMatch split` — by giving them a fast, mock-free safety net at the Simulator level.

**Files:**
- Create: `src/engine/__tests__/simulator-gameplay.test.ts` (or split into multiple files by topic)
- Create: `src/engine/__tests__/playerTransitionSystem.test.ts` (for SFX-transition assertions, using a captured-events sink)
- Create: `src/engine/__tests__/helpers/eventSink.ts` — an `implements SimulatorEvents` impl that pushes to an array
- Modify: `src/engine/gameLoop.test.ts` — strip out migrated cases; keep RAF/debug-key/render-scale tests.

**Tasks:**

- [ ] **11.1 Categorize every `describe` block in `gameLoop.test.ts`.** Tag each as:
  - `gameplay-pure` (physics, stomps, scoring, collisions, headbonk) → migrate to Simulator.
  - `cosmetic-transition` (audio.play, gibs spawn, particles) → migrate to system tests with event sink.
  - `adapter-only` (RAF lifecycle, debug-key handler, render-scale subscription) → leave in place.

- [ ] **11.2 Build the event sink helper.**
  ```ts
  // src/engine/__tests__/helpers/eventSink.ts
  export class CapturedEvents implements SimulatorEvents {
    sfx: Array<{ name: SoundName; args: unknown[] }> = [];
    musicStart: string[] = [];
    // ...one array per event
    onSfx = (name, ...args) => this.sfx.push({ name, args });
    // etc.
    clear() { /* reset all arrays */ }
  }
  ```

- [ ] **11.3 Migrate `gameplay-pure` blocks first** — they're easiest. New tests construct `Simulator` directly, no mocks.

  Example pattern:
  ```ts
  const events = new CapturedEvents();
  const sim = new Simulator({ arena: meadow, settings, events, particleEmitter: noopEmitter });
  sim.fixedUpdate(FIXED_TIMESTEP, /* ctx */ { });
  expect(sim.getState().players[0].x).toBeCloseTo(/* ... */);
  ```

- [ ] **11.4 Run the migrated file in isolation** to confirm no mocks needed:
  ```bash
  npx vitest run simulator-gameplay --reporter=verbose
  ```
  Should be ~10x faster than the equivalent `gameLoop.test.ts` block.

- [ ] **11.5 Migrate `cosmetic-transition` blocks.** Use the event sink:
  ```ts
  expect(events.sfx).toContainEqual(expect.objectContaining({ name: 'stomp' }));
  ```
  Drive transitions by stepping the system directly with prev/curr state pairs (per CLAUDE.md note about `cosmeticStep` accumulator).

- [ ] **11.6 Strip migrated cases from `gameLoop.test.ts`.** Keep the 33-line module-mock prelude only for the remaining adapter-only tests. If after stripping, the prelude is overkill for what's left, simplify it.

- [ ] **11.7 Verify.**
  ```bash
  npm run build && npm test
  ```
  Total test count should be roughly preserved (some consolidation expected). Wall-clock test time should drop visibly.

- [ ] **11.8 Update `src/engine/CLAUDE.md`** — replace the "GameLoop tests require mocking..." block with guidance to write Simulator-level tests by default and reach for GameLoop only for adapter behavior.

- [ ] **11.9 Commit & PR.** Title: `test(simulator): migrate gameplay tests off GameLoop mocks`. Mention LOC + wall-clock improvement in the body.

- [ ] **11.10 Bonus follow-up (optional, this PR or next):** make `net/hostAuthority.ts` and `net/netMatch.ts` depend on `Simulator + Renderer` rather than the full `GameLoop` (per backlog "Pairs with"). Removes 18+ stale-prone mocks.

---

## Phase 12 — Schema-driven snapshot codec + `WirePlayer` split (Backlog #11)

**Goal:** Eliminate the 28-field hand-curated `SnapshotPlayer` mirror and the 70 paired `setX`/`getX` call sites. Behind a static schema, behind a code-generated encoder.

**Risk:** **High.** PROTOCOL_VERSION 12 is in production. Wire format MUST stay byte-identical.

**Prerequisites:**
- ✅ Phase 7 done (`net/snapshot/` directory exists)
- ✅ Phase 11 done (Simulator-level coverage in place — needed because regressions may surface as gameplay drift, not snapshot bytes)
- ✅ Golden-bytes test from Phase 7.1 (`snapshot-wire-format.test.ts`) green and committed

**Files:**
- Create: `src/engine/net/snapshot/schema.ts` — `PLAYER_SCHEMA`, `SnapshotSchema<T>` type, schema field types (`f32`, `u8_timer`, `bool`, `enum`, etc.)
- Create: `src/engine/net/snapshot/codecGen.ts` — module-load-time encoder/decoder generator that closes over offsets (mitigates the per-field-walk perf concern called out in the backlog)
- Modify: `src/engine/types.ts` — split `Player` into `WirePlayer` + `LocalPlayer` (or keep `Player` and tag wire-relevant fields some other way; decide in 12.2)
- Modify: `src/engine/net/snapshot/binaryCodec.ts` — `encodeSnapshot` / `decodeSnapshot` use the generated codecs
- Modify: `src/engine/net/snapshot/types.ts` — `SnapshotPlayer` becomes `Pick<WirePlayer, ...>` or aliased.
- Modify: `src/engine/net/interpolation.ts` — `applySnapshotToState` uses the schema for field-by-field application.

**Tasks:**

- [ ] **12.1 Confirm the golden-bytes test from Phase 7.1 is robust.** It must cover: a player with multiple non-zero timers, a disconnected player, the negative-timer / Uint8 wraparound case mentioned in CLAUDE.md. Add cases if missing. **This test is the safety net for the entire phase.**

- [ ] **12.2 Decide on the `WirePlayer` split strategy.**
  - Option A: separate `WirePlayer` interface + `LocalPlayer` interface; `Player = WirePlayer & LocalPlayer`.
  - Option B: keep `Player` but use a `WIRE_FIELDS` type-level Pick, validated by the schema.
  - Recommend A — clearer intent, but Player references in gameplay code don't need to change since Player still extends both.

- [ ] **12.3 Define the schema vocabulary** in `schema.ts`:
  ```ts
  type FieldType = 'f32' | 'u16' | 'u8' | 'u8_timer' | 'bool' | 'enum' | 'i8';
  type SchemaField<T> = { field: keyof T; type: FieldType; enumValues?: readonly string[] };
  type SnapshotSchema<T> = readonly SchemaField<T>[];
  ```

- [ ] **12.4 Author `PLAYER_SCHEMA`** matching the current encode order EXACTLY. Cross-reference against `binaryCodec.ts` line by line.

- [ ] **12.5 Implement the schema-driven encoder for ONE field** (`x: f32`) and verify the golden test still passes when that field is encoded via the new path and the rest by the old path. Use a temporary feature flag in `binaryCodec.ts`. This is the proof of concept.

- [ ] **12.6 Build the code-generated encoder** in `codecGen.ts`:
  ```ts
  export function compilePlayerEncoder(schema: SnapshotSchema<WirePlayer>): (view, o, p) => number {
    const ops: Array<(view: DataView, o: number, p: WirePlayer) => number> = schema.map(field => /* per-type compiled fn */);
    return (view, o, p) => { for (const op of ops) o = op(view, o, p); return o; };
  }
  ```
  Same for decoder. Run at module load — the resulting closures encode without per-field branching.

- [ ] **12.7 Microbench encode** with the new generated codec vs the old inlined version. Acceptance: ≤5% regression on encode hot path. If worse, fall back to a hybrid (schema for entities, bespoke for player) per the backlog mitigation.

- [ ] **12.8 Cut over `encodeSnapshot`** to the generated path, fully. Run the golden-bytes test — must remain green byte-for-byte.

- [ ] **12.9 Cut over `decodeSnapshot`** symmetrically.

- [ ] **12.10 Cut over `applySnapshotToState`** in `interpolation.ts` to schema-driven application (or leave bespoke if it doesn't pay off — the field count there is already smaller).

- [ ] **12.11 Run the full suite incl. E2E `@online`.**
  ```bash
  npm run build && npm test && npm run test:e2e
  ```
  Plus a manual host/guest smoke test at `?simLatency=80&simJitter=20`.

- [ ] **12.12 Update `src/engine/CLAUDE.md`** with the schema-driven flow, replacing the "extending the snapshot is a 6-edit chain" warnings with "add one entry to PLAYER_SCHEMA".

- [ ] **12.13 PROTOCOL_VERSION:** Do NOT bump. Wire format is byte-identical. (If a bump is needed, the cutover failed — abort.)

- [ ] **12.14 Commit & PR.** Title: `refactor(net): schema-driven snapshot codec, WirePlayer/LocalPlayer split`. Body must include: golden-bytes test reference, microbench results, manual smoke-test confirmation.

---

## Phase 13 — Decompose `net/netMatch.ts` (Backlog #12)

**Goal:** 1,089-line `NetMatch` class → orchestrator + 5 collaborators. Each collaborator owns one concern with a small, explicit interface.

**Risk:** **High.** Tightly intertwined private fields. Test file (`netMatch.test.ts`, 840 lines) reaches into privates.

**Prerequisites:**
- ✅ Phase 11 done (Simulator-level safety net)
- ✅ Phase 12 done (cleaner snapshot boundary)

**Files:**
- Create: `src/engine/net/netMatch/NetMatch.ts` (thin orchestrator)
- Create: `src/engine/net/netMatch/HostLoop.ts`
- Create: `src/engine/net/netMatch/GuestLoop.ts`
- Create: `src/engine/net/netMatch/ReconnectController.ts`
- Create: `src/engine/net/netMatch/LoadingHandshake.ts`
- Create: `src/engine/net/netMatch/MessageRouter.ts`
- Create: `src/engine/net/netMatch/NetMatchContext.ts` — typed shared-state record (refs, flags, timers) explicitly threaded between collaborators
- Create: `src/engine/net/netMatch/index.ts` — barrel
- Delete: `src/engine/net/netMatch.ts`
- Modify: `src/engine/net/__tests__/netMatch.test.ts` — reorganize parallel to the new file structure; reach into the right collaborator instead of a god class.

**Tasks:**

- [ ] **13.1 Reorganize the test file FIRST,** per the backlog's note. Group existing tests by concern:
  - Host loop tests
  - Guest loop tests
  - Reconnect tests
  - Loading handshake tests
  - Message routing tests
  Don't change implementations yet; just renaming `describe` blocks and reordering. Land this as a separate small commit so the next ones diff cleanly.

- [ ] **13.2 Define `NetMatchContext`** as the shared-state seam. Map every private field of `NetMatch` to either:
  - Owned by one collaborator (most fields).
  - Owned by `NetMatchContext` (anything two collaborators read AND write — e.g. `reconnecting` flag).
  Document each field's owner in the file. This is the contract.

- [ ] **13.3 Extract `LoadingHandshake` first** — smallest. It owns `armLoadingTimeout`, `markHostLoaded`, `signalGuestLoaded`, `checkAllLoaded`. Move those methods + supporting fields. Update tests.

- [ ] **13.4 Verify after each extraction.**
  ```bash
  npx vitest run netMatch
  npm run test:e2e -- @online
  ```
  Online E2E is flaky — run twice if a transient fails.

- [ ] **13.5 Extract `ReconnectController`.** Includes `startReconnection`, `completeReconnection`, `abortReconnection`, reclaim tokens, the reconnect timer.

- [ ] **13.6 Extract `MessageRouter`.** The ~80-line MsgType switch becomes its own file. `handleReliableMessage`/`handleUnreliableMessage` become methods on the router; the router calls into `HostLoop`/`GuestLoop`/`ReconnectController` as needed.

- [ ] **13.7 Extract `HostLoop`.** Owns `startHostLoop`, broadcast tier logic, RTT input delay, host-side snapshot pool. Constructor takes `NetMatchContext` + the systems it drives.

- [ ] **13.8 Extract `GuestLoop`.** Owns `startGuestLoop`, `handleGuestSnapshot/Delta`, baseline ring, ack.

- [ ] **13.9 Slim `NetMatch.ts`.** It now: constructs the collaborators, threads them context, owns lifecycle (`start`, `stop`, `dispose`), and branches on host/guest. Target <250 lines.

- [ ] **13.10 Final verification.**
  ```bash
  npm run build && npm test && npm run test:e2e
  ```
  Plus manual smoke: 2-player room create/join, force a reconnect, run a full match. Run with `?debug=net` to confirm overlay still works.

- [ ] **13.11 Update `src/engine/CLAUDE.md`** — document the NetMatch decomposition under the network multiplayer section.

- [ ] **13.12 Commit & PR.** Title: `refactor(net): decompose NetMatch into orchestrator + 5 collaborators`.

---

## After all phases

- [ ] **Audit `docs/modularization-backlog.md`.** Annotate each finding with its merge SHA + PR link, or if any was abandoned, document why. Move the file to `docs/archive/2026-modularization.md` for posterity.
- [ ] **Sanity-skim CLAUDE.md (root and `src/engine/CLAUDE.md`).** Strike out any guidance that became obsolete and wasn't already updated by an individual phase.
- [ ] **Re-run nav data generation** as a smoke test (it touches arena packs, validates registry):
  ```bash
  npx vite-node scripts/generateNavData.ts
  ```
  No diff expected — if there is one, investigate.

---

## Notes for fresh-session pickup

- This plan is the source-of-truth ordering. The backlog doc (`docs/modularization-backlog.md`) is the spec for each individual phase — every phase here cites a numbered backlog finding. Read both.
- Each phase is a self-contained PR. Do not batch.
- For phases 11/12/13: do NOT skip the prerequisites. They exist because each prerequisite installs the safety net the next phase relies on.
- For phase 12 specifically: the golden-bytes test from phase 7.1 is the contract. If that test goes red and you can't make it green by reverting your last edit, abort the cutover for that field and reassess — don't bump PROTOCOL_VERSION as a workaround.
- CLAUDE.md (root + `src/engine/CLAUDE.md`) often cites the exact footgun a phase removes. Search for the phase's keywords there before starting.
