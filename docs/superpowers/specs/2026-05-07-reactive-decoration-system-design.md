# Reactive Decoration System — Design

**Date:** 2026-05-07
**Branch:** `feat/reactive-decorations` (to be created)
**Supersedes:** Batch A (foliage system) and the env-wakes portion of Batch D in `docs/superpowers/specs/2026-05-04-cosmetics-pillar-design.md`.

## Motivation

The reactive-ambient PR (#12) shipped per-arena `drawAnimatedBackground` / `drawAnimatedForeground` hooks that read `matchState` directly and compute per-entity excitement/sway inline. Each arena pack grew its own bespoke reactivity logic for ~10 entity types (frogs, fish, gumdrops, banners, dandelions, butterflies, bees, gumdrop pacers, crabs, fog ribbons, etc.). The original Batch A spec (FoliageSystem with FoliageInstance[]) is largely superseded by what shipped, but inconsistently — different arenas use different patterns, and previously-static decorations (flowers, hanging vines, ferns, tall grass, mushrooms, trees) remain inert.

This spec unifies all arena-anchored decoration reactivity under a single system, migrates existing reactive entities into it, and brings previously-static decorations into the same model so the world feels alive everywhere. It also bundles underwater bubble trails (env-wakes from Batch D) as a separate per-arena cosmetic hook.

## Scope

**In scope:**

- New `ReactiveDecorationSystem` with four orthogonal reactivity primitives (wind sway, proximity response, stomp shake, burst trigger).
- Migration of every shipped reactive entity (frogs, fish, gumdrops, banners, dandelions, butterflies, bees, crabs, fog ribbons, …) into the new system.
- Migration of currently-static decorations (flowers, mushrooms, hanging vines, tall grass, ferns, trees, etc.) into the new system with sensible default reactivity per archetype.
- New per-arena `cosmeticTick` hook on `ArenaPack` for arena-specific cosmetic logic that doesn't fit the decoration model. First user: underwater bubble trails.
- Per-kind 30Hz or 60Hz update opt-in.
- Slow-device gating: skip dynamic math, keep instances visible.

**Out of scope:**

- Surface-impact effects (already shipped as Batch B).
- HUD feedback (already shipped as Batch E).
- Player VFX polish (already shipped as Batch C).
- Wildlife AI rewrites (existing flock logic stays; it just gets re-expressed as reactive instances).
- Performance regressions: must stay within current frame-time budget on slow-device with all batches on.

## Architecture

### Reactivity primitives

Four orthogonal behaviors. Every instance can opt into any subset.

| Primitive | What it is | Drives |
|---|---|---|
| **Wind sway** | global `windPhase` × per-instance amplitude | trees, grass, banners, vines, kelp |
| **Proximity response** | scalar 0..1 that rises when player within radius, decays when far. Mode flag picks `flee` / `lean` / `excite` (the draw fn interprets it). | parting, vine lean, butterfly flee, fish flee, frog leap, gumdrop wobble, dandelion bloom |
| **Stomp shake** | impulse `1.0` set on stomp within radius, decays each tick | trees, saplings, mushrooms, banners |
| **Burst trigger** | when shake crosses threshold → emit particles via ParticleSystem | cherry petals, leaf flurry |

### Data shape

```ts
type ReactiveInstance = {
  pos: { x: number; y: number };
  kind: string;                          // dispatches to draw function
  seed: number;                          // deterministic per-instance randomness
  windAmp?: number;                      // 0/undefined = no sway
  proximity?: {
    radius: number;
    mode: 'flee' | 'lean' | 'excite';    // how draw fn interprets excitement
    magnitude: number;                   // kind-relative
  };
  shakeRadius?: number;                  // undefined = stomp-immune
  burst?: { threshold: number; particleKind: string; count: number };
  // — runtime-mutated fields below —
  excitement: number;                    // 0..1, smoothed proximity
  shakeDecay: number;                    // 0..1, set on stomp impulse
};
```

### System state

- `instances30: ReactiveInstance[]`, `instances60: ReactiveInstance[]` — bucketed at arena-load time by each kind's registered frequency.
- `windPhase: number` — global, advanced in fixedUpdate (60Hz) so 60Hz instances see smooth phase.

### Update loop

- **`fixedUpdate` (60Hz):** advance `windPhase += dt × WIND_SPEED`. For each instance in `instances60`: rise/decay `excitement`, decay `shakeDecay`, fire burst on threshold edge.
- **`cosmeticStep` (30Hz):** for each instance in `instances30`: same per-instance update.
- **Stomp event handler** (called by `PlayerTransitionSystem` on stomp transition): iterate all instances within `shakeRadius` of stomp position, set `shakeDecay = 1.0`.

### Render loop

- In `Renderer.renderFrame`, after fg-nature cache blit and before the player layer.
- For each instance in `instances30 ∪ instances60`: `kindRenderers[kind](ctx, instance, swayPhase, dayPhase)` where `swayPhase = sin(windPhase + seed × 0.7) × windAmp`.
- Static-only decorations (background hills, distant trees that don't react) stay in the cached fg/bg-nature layer. Cache shrinks but doesn't disappear.

### Network play

- All system state is local-only.
- `excitement` derives from interpolated player positions on guests.
- Stomp transitions detected on guest-side cosmeticStep (already done).
- Zero protocol changes. PROTOCOL_VERSION unchanged.

## File organization

### Layered building blocks

| Layer | What | Where |
|---|---|---|
| 1. Stateless drawing primitives | `drawTree`, `drawFlower`, `drawHangingVine`, etc. Pure ctx ops, no reactivity. | `themes/drawPrimitives/` (already exists, unchanged) |
| 2. Reactive instance factories + draw fns | `tree(x, y)`, `drawTree(ctx, instance, swayPhase, excitement, shake)`. Composes layer 1 + reactive math. | Inside the arena pack that owns the kind |
| 3. Reactive system | Owns instance list, runs primitives, dispatches draw via registry. | `gameLoop/cosmetics/ReactiveDecorationSystem.ts` |

### All reactive kinds live in arena packs

No `themes/drawPrimitives/reactive/` directory. Sharing happens by import (one pack imports another's factory), not by promotion to a shared location.

```
arenas/packs/
  meadow.ts            # owns: tree, bush, flower, mushroom, hangingVine, fern, tallGrass,
                       #       dandelion, butterfly, bee
  lobby.ts             # imports tree/bush/flower/mushroom factories from meadow.ts directly
  treetops.ts          # owns: canopyTree, treetopsVine, leafCluster, butterfly variant
  waterfall.ts         # owns: waterfallTree, frog, splashDrop
  underwater.ts        # owns: kelp, fish; cosmeticTick for bubble trails
  candyLand.ts         # owns: gumdrop, lollipopTree
  castle.ts            # owns: banner, torch
  hauntedGraveyard.ts  # owns: deadTree, bat, crow, cobweb, fogRibbon
  rooftops.ts          # owns: crab, pacer, antenna
  spaceStation.ts      # owns: led, panel
  volcano.ts           # owns: lavaSpark, charredRock
  winterLake.ts        # owns: pine, snowDrift
```

When a pack file gets uncomfortable (~500+ lines), split into a subdirectory:

```
arenas/packs/meadow/
  index.ts             # the ArenaPack export
  decorations.ts       # factories + draw fns + registerReactiveKind calls
```

But not until needed.

### Promotion rule

A kind starts arena-scoped. When a second arena needs the *same* kind (truly identical, not just thematically similar), copy by import. When a third arena needs it, lift the kind into a shared helper module and re-import. Duplicate-by-import is fine until proven worth abstracting.

### Registry

- Global string keys with arena-id prefix convention: `registerReactiveKind('meadow.tree', drawTree)`, `registerReactiveKind('treetops.canopyTree', drawCanopyTree)`.
- Registration happens at arena pack module load (each pack file registers its own kinds at the top).
- `arenas/builtin.ts` already imports every pack module at startup → every kind is registered before first arena load.
- Per-kind opt-in for 60Hz: `registerReactiveKind('underwater.fish', drawFish, { highFrequency: true })`. Defaults to 30Hz.

## Default reactivity per archetype

What "reactive" means for previously-static decorations. Each arena pack's factories pick from this menu — these are defaults; packs can override per-instance.

| Archetype | Examples | Wind sway | Proximity | Stomp shake | Burst |
|---|---|---|---|---|---|
| **Ground cover** | flowers, mushrooms, small bushes, gravestones | tiny (1–2px) | — | — | — |
| **Parting strands** | tall grass, ferns, kelp | medium (3–5px) | radius 24, `flee`, magnitude 14 | — | — |
| **Hanging pendant** | vines, banners, lanterns | medium (4–8px) | radius 30, `lean`, magnitude 10 | — | — |
| **Leafy canopy** | trees, saplings, lollipop trees | strong (4–7px at top) | — | radius 80, decay 7 | threshold 0.95 → 8–14 leaf/petal particles |
| **Excited buddy** | frogs, gumdrops, dandelions | tiny | radius 50–60, `excite`, magnitude per-kind | — (or radius 40) | — |
| **Flock member** | butterflies, bees, fish | per-instance flock motion | radius 60–80, `flee`, magnitude 14–22 | — | — |

Stomp shake is opt-in (only canopies). Burst is opt-in (only trees + variants).

## Per-arena cosmetic hook

For arena-specific cosmetic logic that doesn't fit the decoration model (player-emitted trails, environmental triggers).

```ts
type ArenaPack = {
  // ...existing
  cosmeticTick?: (
    state: MatchState,
    dt: number,
    services: { emitParticle: ParticleEmitter['emit'] }
  ) => void;
};
```

Wired in `cosmeticStep` after the system update. One line.

**Underwater bubble trails (env-wakes):** uses this hook in `underwater.ts`. Per-player check: if `|vx| > 50`, emit a small pale-cyan bubble (1–3px, vy=-30, 1–1.5s life) behind the player at hip height. Throttled per-player (0.08s minimum between emits). Slow-device gated.

Pack owns its accumulator state as module-local closures (Map keyed by `PlayerSlot`). Stale entries get overwritten naturally.

## Migration plan

Incremental per-arena. PR 1 lands the system + meadow + bubble trails. Each subsequent arena is its own PR. Old per-arena `drawAnimatedForeground` paths keep running for un-migrated arenas during the transition.

### PR 1 — Foundation + meadow + bubble trails

- Create `ReactiveDecorationSystem.ts`.
- Add `buildReactiveDecorations` and `cosmeticTick` fields to `ArenaPack` interface.
- Renderer integration after fg-nature cache blit, before player layer.
- Stomp transition wired from `PlayerTransitionSystem`.
- Burst → `ParticleSystem.emitParticle` wired.
- Migrate meadow: tree, bush, flower, mushroom, hangingVine, fern, tallGrass, dandelion, butterfly, bee. Inline draw calls deleted from `drawForegroundNature` / `drawBackgroundNature`. Existing reactive dandelion/butterfly/bee logic in `drawAnimatedForeground` removed; behavior re-expressed via primitives.
- Add bubble trails to `underwater.ts` via `cosmeticTick`.
- Tests: system unit tests, meadow decoration smoke test, bubble trail underwater-only guard.

### PR 2–11 — One arena per PR

Order chosen for ramp-up — start with packs that share archetypes with meadow, end with the most exotic:

1. **lobby** — visually a meadow clone; mostly imports from meadow.
2. **treetops** — canopy + vines + leaves. Reuses meadow archetypes with treetops styling.
3. **waterfall** — adds frog, splashDrop. Migrates existing frog-leap logic.
4. **underwater** — adds fish, kelp. Migrates fish-flee logic. (Bubble trails already in PR 1.)
5. **candyLand** — gumdrop, lollipop trees. Migrates gumdrop wobble.
6. **hauntedGraveyard** — bats, crows, cobwebs, fog ribbons, dead trees.
7. **rooftops** — crabs, pacers, antennae. Round-9 reactive entities migrate.
8. **castle** — banners. Migrates banner excitement.
9. **volcano** — sparks, charred rocks (low reactivity).
10. **winterLake** — pines, snow drifts.
11. **spaceStation** — LEDs, panels (low reactivity).

### Per-arena PR checklist

1. Author instance list in `buildReactiveDecorations` (positions extracted from current inline draw calls).
2. Define arena-specific factories + draw fns + `registerReactiveKind` calls in pack file.
3. Delete migrated inline `drawX(...)` calls from `drawForegroundNature` / `drawBackgroundNature` / `drawAnimatedForeground`.
4. Smoke test: `arenas/packs/__tests__/<arena>-decorations.test.ts`.
5. Visual check via dev URL `?arena=<name>&bots=2`.
6. Run full suite + `tsc -b`.

### Rollback path

If a per-arena PR breaks something, revert just that PR. System and earlier arenas keep working.

## Visual fidelity bar

Match the spirit of currently-shipped reactive motion; allow slight refinement during re-implementation. Existing entity behaviors get re-expressed via the four primitives — motion stays recognizable but is allowed to differ in detail (slightly different easing curves, push amplitudes, timings). Spot-check each migrated arena visually; no pixel-comparison.

## Performance budget

- Update runs in `cosmeticStep` (30Hz) or `fixedUpdate` (60Hz) per kind. Per-instance update is O(1) for wind/shake/burst; proximity is O(M players) where M ≤ 5.
- At ~80 instances per arena, total update cost ≈ 400 ops/tick — negligible.
- Per-frame render is O(N instances). Each draw fn uses `fastSin` from `fastMath.ts`. No allocations in hot path.
- Reference desktop: ~1ms per-frame for the worst-case arena (meadow). Within budget.

### Slow-device gating

| Behavior | Slow-device on |
|---|---|
| Wind sway | OFF — instances render at `swayPhase = 0` |
| Proximity (excitement) | OFF — `excitement` stays 0 |
| Stomp shake | OFF — `shakeDecay` never set |
| Burst | OFF — particle emit skipped |
| Bubble trails | OFF — `arena.cosmeticTick` early-return |
| 60Hz update path | OFF (or drop to 30Hz; decide during PR 1 visual check) |

Instances still drawn (otherwise the world would be empty), just statically.

### Cache implications

Decorations that move out of `drawForegroundNature` no longer participate in the cached fg-nature layer. They re-render every frame. Static-only decorations (atmospheric stuff that doesn't react) stay cached. Cache shrinks but doesn't disappear.

### Particle pool

Burst particles + bubble trails share the existing 600-cap pool. No pool growth. Bubble trails throttled per-player (max ~12 active per player swimming).

## Test strategy

### Unit tests (`gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts`)

- `windPhase` advances at expected rate.
- `excitement` rises toward 1 when player within radius, decays when player leaves.
- `excitement` lerp factor produces ~10-frame ease.
- `shakeDecay` set to 1.0 on stomp event within `shakeRadius`, decays at `dt × 7`.
- `shakeDecay` not set if stomp is outside radius.
- Burst fires exactly once when `shakeDecay` crosses threshold (rising→falling edge).
- Instances without optional fields are inert for those primitives.
- 60Hz instances bucketed correctly, updated by fixedUpdate path.

### Per-arena smoke tests (`arenas/packs/__tests__/<arena>-decorations.test.ts`)

- `buildReactiveDecorations(arena)` returns a non-empty list.
- Every instance has a registered `kind`.
- Every instance's `pos` is within arena bounds.
- Renders without errors at multiple `windPhase` slices (0, 0.5, 1.0, 5.0).

### Per-kind draw tests (non-trivial kinds only)

- Mock ctx; assert draw call structure changes with excitement/shake.

### Integration

- `gameLoop.test.ts` passes (system runs alongside others).
- `regression-no-browser-apis.test.ts` continues to pass.
- Network test continues to pass (no protocol changes).

### E2E

- One playwright test: `?arena=meadow&bots=2&killLimit=4` → wait for stomp → assert no console errors.

### Manual visual checklist per arena PR

- Wind sway visible and not jittery.
- Walking through tall grass / ferns visibly parts them.
- Stomping near a tree shakes it; heavy stomp emits petals.
- Existing reactive entities still feel right.
- Slow-device toggle: sway/excitement effects gracefully degrade.

## Open questions / followups

1. **Wind speed constant** `WIND_SPEED` — start at 0.6 rad/s. Tune in playtest.
2. **Excitement lerp factor** — start 0.08/tick at 30Hz (≈10-frame ease). Tune per-kind via registration opts if needed.
3. **Burst threshold edge detection** — store `prevShakeDecay` per instance vs. a transient `burstFiredThisShake` flag. Decide during PR 1.
4. **Lobby reuse path** — re-register meadow kinds under `'lobby.X'` namespace, or reuse `'meadow.X'` keys directly. Decide during PR 2.
5. **Per-arena instance counts** — loop-generated positions get baked at migration time. If a hand-authored list becomes unwieldy, fall back to small loops in `buildReactiveDecorations`.
6. **Slow-device 60Hz behavior** — full skip vs. drop-to-30Hz. Decide during PR 1 visual check.
7. **Petal/leaf burst particle visuals** — new subtype with rotation, or reuse confetti. Decide during PR 1.
8. **Bubble emit position offset** — behind player at hip height. Tune offset during PR 1 underwater playtest.
