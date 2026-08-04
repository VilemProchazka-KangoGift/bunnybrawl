# Modularization Backlog

Generated 2026-05-08 from a 3-agent codebase review on `feat/reactive-treetops`
(commit `900e967`). Each finding is independently actionable; pick one and
ignore the rest.

Ranked by leverage within each tier (S/M/L effort).

---

## Quick wins (S effort, low risk)

### 1. Promote `Cooldowns<K>` utility — S

**Files**: `src/engine/sfxCooldowns.ts` (current narrow impl), `src/engine/lobbyGame.ts:141`,
`src/engine/arenas/packs/underwater.ts:22` (`_bubbleAccum`),
`src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts` (`footstepAccumulators`),
`src/engine/gameLoop/GameLoop.ts` (`periodicAmbientTimers`).

**Smell**: same `Map<X, number>` decay-and-fire pattern duplicated 5+ times.

**Cleanup**: hoist to `engine/cooldowns.ts` as `class Cooldowns<K>` with
`tick(k, dt) → boolean ready`, `set(k, t)`, `clear()`. Sweep + replace.

**Risk**: none — pure mechanical.

---

### 2. Hoist `darken()` + `Ctx2D` type alias — S

**Files**: `darken` exists in `src/engine/rendering/players.ts`, `src/engine/arenas/packs/underwater.ts`,
`src/engine/navDebugOverlay.ts` (AGENTS.md flags this directly: *"fold into a
shared util when adding a fourth"*). `Ctx2D` casts at `src/engine/renderer.ts:458,488`,
`src/engine/rendering/hud.ts:93`, `src/engine/rendering/players.ts:161,433`.

**Smell**: 3 darken impls; 5 `as unknown as CanvasRenderingContext2D` casts at
OffscreenCanvas seams.

**Cleanup**: move `darken` to `src/engine/fastMath.ts` next to `hexToRGB`.
Define `type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`
in `src/engine/types.ts` and use it on all `_drawX(ctx, ...)` helper signatures —
casts disappear.

**Risk**: none.

---

### 3. Generic `TransitionTracker<K, T>` — S

**Files**: `src/engine/gameLoop/cosmetics/playerTransitions.ts` +
`PlayerTransitionSystem.ts`, `entityTransitions.ts` + `EntityTransitionSystem.ts`,
`surfaceImpact.ts` + `SurfaceImpactSystem.ts`.

**Smell**: three near-identical impls of "store prev state, detect transitions,
refresh prev". AGENTS.md (engine) literally warns:

> Extending `PrevPlayerCosmeticState` requires updating three locations…
> missing one location leaves the prev field at its initial value, creating a
> stale-zero bug invisible to typecheck.

**Cleanup**: one generic class

```ts
class TransitionTracker<K, T> {
  snapshot(k: K, source: unknown): T;
  detect(k: K, source: unknown, onTransition: (prev: T, curr: T) => void): void;
}
```

Each consumer supplies one `snapshot(source) → T` fn — the three-place footgun
collapses to that fn alone.

**Risk**: low — pure refactor; behavior identical. Determinism snapshot tests
catch any drift.

---

### 4. Delete `_audioEnabled` — S

**Files**: `src/engine/gameLoop/GameLoop.ts:149, 257, 396, 477` and similar.

**Smell**: every `audio.play()` is gated `if (this._audioEnabled)` because
rollback resimulation needed silenced replays. Rollback was abandoned (AGENTS.md
net section: *"Client prediction was tried and abandoned"*). The flag is always
true; AGENTS.md still tells you to "always gate" — discipline for dead code.

**Cleanup**: delete the field, delete the gates. If any caller still wants
silenced replays, use a SimulatorEvents impl whose callbacks are no-ops
(see Big Refactor #11 for the framing).

**Risk**: low. Search for any remaining `setAudioEnabled` callers.

---

### 5. Single `__bunnyTest` E2E shim — S

**Files**: `src/components/Match.tsx:419-462` (the `window.__gameLoop` /
`__netMatch` / `__gameStore` setup), `src/store/gameStore.ts:136`.
E2E specs reading internals: `e2e/perf-online.spec.ts`,
`e2e/bot-behavior.spec.ts`, `e2e/renderer-branches.spec.ts`,
`e2e/perf-profile.spec.ts`.

**Smell**: 12+ E2E specs read `window.__gameLoop?.getState()`,
`getRendererDiagnostics()`, `isAutoSlowFlipped()`. Forces every diagnostic to
live as a public method on `GameLoop`/`Renderer`. Each new diagnostic widens
the god-object surface forever.

**Cleanup**: define `window.__bunnyTest: { state, diagnostics, autoSlowFlipped, ... }`
typed snapshot, built lazily by `Match.tsx` from already-public APIs. Type it
in a `global.d.ts` (no `as any`). Once it aggregates everything, drop the
diagnostic methods from GameLoop/Renderer.

**Risk**: medium-low — every E2E spec needs touching, but the changes are
straight property-rename. Pairs with Big Refactor #13 (after).

---

## Medium consolidations (M effort)

### 6. WildlifeSystem — M

**Files**: 8 arena packs roll their own flock/critter systems.
- `src/engine/arenas/packs/treetops.ts` — squirrels, butterflies, bees
- `src/engine/arenas/packs/meadow.ts` — butterflies, bees, snails
- `src/engine/arenas/packs/underwater.ts` — crabs (fish-school already in
  ReactiveDecorationSystem)
- `src/engine/arenas/packs/spaceStation.ts` — robots
- `src/engine/arenas/packs/castle.ts`, `hauntedGraveyard.ts` — rats
- `src/engine/arenas/packs/candyLand.ts` — gumdrops

**Smell**: all share the shape `home + fastSin(t*k+phase)*amp` +
`pushFromPlayers(...)` + module-scoped state arrays + `_tickXDt` tracker.
`themes/utils.ts` already extracted the primitives (`tickGroundCritter`,
`pushFromPlayers`, `makeDtTracker`) — but the orchestration is duplicated.

**Cleanup**: promote to `src/engine/gameLoop/cosmetics/WildlifeSystem.ts`,
mirroring `ReactiveDecorationSystem`. Each pack registers `WildlifeKind`
entries (`groundCritter | flock | clusterDrift`) with config + drawOne
callback. System owns per-instance state and dt tracker — module-level
`_squirrels`/`_crabs`/`_snails` arrays go away.

**Risk**: low. Primitives are already factored. Largest LOC reduction in
this backlog.

---

### 7. Split `net/snapshot.ts` (708 lines) — M

**Files**: `src/engine/net/snapshot.ts`.

**Smell**: 4 concerns mixed: type defs, binary encode/decode (180 lines each),
`takeAuthSnapshot` extractor, re-exported delta compression. Banner comments
already mark the seams.

**Cleanup**: split into `src/engine/net/snapshot/`:
- `types.ts` — `AuthSnapshot`, `SnapshotPlayer`, `createEmptySnapshot`
- `binaryCodec.ts` — `encodeSnapshot`/`decodeSnapshot` + helpers
- `extract.ts` — `takeAuthSnapshot(frame, state)` (only file needing
  gameplay imports)
- `index.ts` — barrel + delta re-exports

**Risk**: low — wire format must stay byte-identical, hash a known buffer
before/after. Smaller version of Big Refactor #11 — does NOT change the
encoding itself, just the file layout.

---

### 8. Split `rendering/hazards.ts` (879 lines) — M

**Files**: `src/engine/rendering/hazards.ts`.

**Smell**: 8 unrelated draw fns: hazard zones, ghosts, lava rocks, zero-G,
currents, geysers, bouncy overlays, pigeons + scatter flocks. Largest
remaining file in `rendering/` and the most heterogeneous.

**Cleanup**: split into `src/engine/rendering/hazards/`:
- `zones.ts` — `drawHazardZone`, `drawZeroGZone`, `drawCurrentZone`,
  `drawGeyser`, `drawBouncyPlatformOverlay`
- `creatures.ts` — `drawGhost`, `drawPigeonFlock`, `drawScatterFlock`,
  `drawFlyingScatter`, `pickScatterColor`
- `lava.ts` — `drawLavaRock`
- `index.ts` — barrel + `clearHazardCaches`

**Risk**: low. Functions are independent; cache module-locals consolidate
into `index.ts`.

---

### 9. Split `Match.tsx` (~600 lines) — M

**Files**: `src/components/Match.tsx`.

**Smell**: one component bundles canvas mount lifecycle, local-mode init,
online-mode init (NetMatch wiring), pause overlay, loading overlay timing
(`phaseIsLoading` + `localTasksDone` + `showLoadingCancel`), reconnect/
disconnect overlay sequencing with the 1.8s flash, arena change handler,
level-select modal, victory transition, wake-lock renewal.

**Cleanup**: extract hooks
- `useLocalMatch.ts` — local-mode lifecycle (the local `useEffect` body)
- `useOnlineMatch.ts` — online-mode lifecycle (NetMatch construction +
  listener wiring + reconnect overlay state machine)
- `useLoadingOverlay.ts` — `phaseIsLoading` + `localTasksDone` +
  `showLoadingCancel` + sub-text logic

And a `MatchOverlays.tsx` for pause/loading/reconnecting/level-select JSX
(presentational only).

**Risk**: medium — hook extraction must preserve cleanup-order. The
"reset `loadingPhase=true` at top of local branch" caveat must move with the
hook. Several refs (`netMatchRef`, `gameLoopRef`) are shared; pass through
hook params.

---

### 10. PlayerInput context arg — M (small but architectural)

**Files**: `src/engine/simulator/Simulator.ts:347-651` (the
`_getPlayerInput` branching), `src/engine/input/PlayerInput.ts` interface,
`src/engine/input/RemoteInput.ts`, `src/engine/input/RandomInput.ts`,
`src/engine/input/RuleBasedBot.ts`, `src/engine/input/KeyboardInput.ts`.

**Smell**: Simulator's per-player loop has 3 input branches (network → touch →
playerInputs map). AGENTS.md acknowledges the wart. `RemoteInput` adapter
exists but is bypassed by the per-tick `networkInputs` arg to `fixedUpdate`.

**Cleanup**: extend interface to
`PlayerInput.getAction(state, ctx?: { networkInputs?, airborne? })`.
`RemoteInput` reads from `ctx.networkInputs`; a new `TouchAdapter` reads
`ctx.airborne`. `Simulator.fixedUpdate(dt, ctx)` passes the same ctx to every
`getAction`. Removes ~30 lines of branching, makes the input map the single
source of truth.

**Risk**: low-medium — order of resolution must remain identical for online
correctness. Verifiable via `regression-determinism.test.ts` snapshot.

---

## Big refactors (L effort)

### 11. Schema-driven snapshot codec + `WirePlayer` split — L

**Files**: `src/engine/net/snapshot.ts:18-216` (`SnapshotPlayer` interface +
encode/decode), `src/engine/types.ts` (`Player` interface),
`src/engine/net/interpolation.ts` (`applySnapshotToState`).

**Smell**: `SnapshotPlayer` (lines 18-46) is a 28-field hand-curated mirror
of `Player`. Every wire-relevant field requires edits in 6 places + a
`PROTOCOL_VERSION` bump. AGENTS.md flags 3 separate "must update both"
gotchas tracing here:
- "Idle action state is local-only — NOT in `net/snapshot.ts`"
- "`Player.disconnected` must be in snapshots"
- "Cosmetic transition anchors use NaN-sentinel" + 5 init sites

`net/snapshot.ts` has 70 `setX` and 70 `getX` paired call sites. Each new
field is a 6-edit chain; miswires (encode adds, decode forgets) caused the
negative-timer / Uint8 wraparound bug class.

**Cleanup**: split `Player` into `WirePlayer` (everything snapshotted) +
`LocalPlayer` (idle action timers, fastFallAnchor, etc.). Drive encode/decode
from a static schema:

```ts
const PLAYER_SCHEMA: SnapshotSchema<WirePlayer> = [
  { field: 'x', type: 'f32' },
  { field: 'invincibleTimer', type: 'u8_timer' },
  // ...
];
```

Single `encodeArray(schema, items, view, o)` / `decodeArray(...)` walks
the schema. Eliminates ~400 lines of paired pencil-pushing.

**Risk**: high. PROTOCOL_VERSION 12 is in production. Wire format MUST
remain byte-identical — needs golden-byte regression tests before/after
(`tests/__snapshots__/wire.snap` style). Hot-path concern: walking a schema
array per field is slower than inlined `setUint8(o, mask)`. Mitigation:
code-generate the encoder at module-load time from the schema (closures
over offsets), or restrict the schema to entity types and keep player
encode bespoke.

**Highest correctness payoff** in the backlog.

**Prerequisites**: complete #13 first (decent Simulator-level coverage to
catch indirect breakage before snapshot tests run).

---

### 12. Decompose `net/netMatch.ts` (1084 lines) — L

**Files**: `src/engine/net/netMatch.ts`.

**Smell**: single `NetMatch` class owns ~10 distinct concerns:
- host-loop RAF
- guest-loop RAF
- reliable-message routing (~80-line MsgType switch)
- unreliable/snapshot routing
- snapshot pool + guest-baseline ring
- reconnect state machine
- loading-handshake (timeout + LOADED tracking)
- per-peer health/throttle broadcasting
- RTT-fairness input delay
- stall detection

~30 private fields, ~20 methods. Test file (`netMatch.test.ts`, 840 lines)
reaches into privates.

**Cleanup**: split into `src/engine/net/netMatch/`:
- `NetMatch.ts` — thin orchestrator, lifecycle + branching to host/guest
- `HostLoop.ts` — `startHostLoop`, broadcast tier logic, RTT input delay,
  host-side snapshot pool
- `GuestLoop.ts` — `startGuestLoop`, `handleGuestSnapshot/Delta`, baseline
  ring, ack
- `ReconnectController.ts` — `startReconnection`, `completeReconnection`,
  `abortReconnection`, reclaim tokens, timer
- `LoadingHandshake.ts` — `armLoadingTimeout`, `markHostLoaded`,
  `signalGuestLoaded`, `checkAllLoaded`
- `MessageRouter.ts` — `handleReliableMessage`/`handleUnreliableMessage`
  switches

**Risk**: high. Private fields are tightly intertwined (e.g. `reconnecting`
read by host loop, set by reconnect controller). Will need explicit small
interfaces or a shared `NetMatchContext` to thread state. Test file needs
parallel reorganization — do that first.

---

### 13. Move gameplay tests from GameLoop → Simulator — L (mechanical)

**Files**: `src/engine/gameLoop.test.ts` is **3,959 lines** with a 33-line
module-mock prelude (`audio` 12 stubs, `renderer` 8 stubs, `howler`
constructor, `installMockCanvas2D`).

**Smell**: most tests exercise gameplay (stomp scoring, headbonk, footstep
cooldowns) but pay full Renderer+Audio+Howler+Canvas mock tax. The Simulator
extraction was supposed to make these mock-free. Instead, gameplay assertions
still go through GameLoop because `loop.cosmeticStep()` is the only way to
trigger SFX transitions and several tests assert on `audio.play` mock calls.

**Cleanup**:
- Move physics-only gameplay tests onto `Simulator` directly (Node-pure,
  zero mocks).
- Move SFX-transition tests onto `PlayerTransitionSystem` directly using a
  captured-events sink (a `SimulatorEvents` impl that pushes to an array)
  instead of audio mocks.
- Keep `gameLoop.test.ts` only for genuine adapter behavior (RAF, debug-key,
  render-scale subscription).

**Risk**: low correctness, high volume — mechanical migration. **Reveals**
what GameLoop actually needs to expose (vs what tests just reached for).

**Pairs with**:
- Quick win #5 (kills diagnostic-method passthroughs)
- Big refactor #1 implication: NetMatch should depend on Simulator+Renderer,
  not GameLoop (currently `net/hostAuthority.ts:11` and `netMatch.ts:19-20`
  import the full `GameLoop`, forcing 18+ stale-prone test mocks).

**Recommended before**: #11 (snapshot schema) and #12 (NetMatch split) —
those refactors want a proper Simulator-level safety net.

---

## Recommended sequencing

If sequencing PRs:

1. **Quick wins #1–#5 in one batch** — pure cleanup, no risk, removes 4
   documented footguns from AGENTS.md.
2. **#6 WildlifeSystem** — natural follow-on to ReactiveDecorationSystem,
   biggest LOC reduction, well-formed pattern.
3. **#7 + #8 splits** — safe mechanical decompositions, prep for later work.
4. **#13 test migration** — unlocks honest unit-testing of Simulator. Should
   precede the bigger refactors so they have a safety net.
5. **#11 wire schema** — biggest correctness win, gated by #13's coverage.
6. **#12 NetMatch split** — last; biggest, benefits from cleaner Simulator
   boundary established by #13.

#9 (Match.tsx) and #10 (PlayerInput ctx) can land any time — they're
independent of the rest.

---

## Notes for fresh-session pickup

- Worktree path: `P:/projects/rabbits/.worktrees/reactive-treetops`
- Branch: `feat/reactive-treetops` (commit `900e967` at time of writing)
- Pending: this branch is ready to merge into main (perf-clean, all tests
  pass except the documented pre-existing 41).
- After merge, all the file paths above remain valid against `main`.
- For each finding, AGENTS.md (root + `src/engine/AGENTS.md`) is the best
  context source; many findings cite it directly.
