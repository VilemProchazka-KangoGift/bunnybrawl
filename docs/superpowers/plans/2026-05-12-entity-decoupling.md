# MatchState Entity Decoupling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the file blast for adding or removing a `MatchState` entity (pigeons, scatterFlocks, lavaRocks, ghosts, geyserStates, gibs, confetti, shockwaves, fogParticles, pollenParticles, shootingStars, surfaceDecals, ripples, scoreAnimations, comboPopups) from ~25 files to **1 file + 1 register call**.

**Motivating data:** Removing the (already-dead) pigeonFlocks system on 2026-05-12 touched 28 files. Each new ambient entity added in 2026 has paid the same cost. The pattern is the bottleneck.

**Tech Stack:** TypeScript, Vite 8, Vitest, Playwright, Canvas 2D. No new runtime deps.

**Pre-existing failing tests** (reproduce against `HEAD~` before assuming a regression, per CLAUDE.md):
- `MainMenu.test.tsx` (logo.png Vite transform)
- `VictoryScreen.test.tsx`
- `integration.test.ts > 'fixedUpdate with explicit inputMap drives both players'` (test-ordering / parallelism — passes when run alone via `npx vitest run src/engine/integration.test.ts`)

**Verification commands (used by every phase unless noted):**
```bash
npm run build           # tsc -b && vite build — CI parity
npx vitest run          # full unit suite
npm run test:e2e        # required only for phases touching renderer/Match.tsx
npm run perf -- --arena=volcano   # required for Phase 5+ (perf parity gate)
```

**Branch strategy:** One feature branch per phase, merged independently. `feat/entity-decouple-phase-1`, etc. Do NOT batch.

---

## Sequencing summary

| Phase | Scope | Effort | Risk | Depends on |
|-------|-------|--------|------|------------|
| 0 | Establish baseline (perf snapshot + screenshots) | S | none | — |
| 1 | `EntityKind<T>` interface + migrate `lavaRocks` as proof-of-concept | M | low | 0 |
| 2 | Migrate visual-only entities: `gibs`, `confetti`, `shockwaves`, `scoreAnimations`, `comboPopups`, `surfaceDecals`, `ripples` | M | low | 1 |
| 3 | Migrate ambient cosmetic entities: `fogParticles`, `pollenParticles`, `shootingStars` | S | low | 1 |
| 4 | Migrate physics-coupled entities: `ghosts`, `geyserStates`, `scatterFlocks` | M | medium | 1 |
| 5 | Introduce `getEntities()` registry; replace hardcoded dispatch | M | medium | 2, 3, 4 |
| 6 (optional) | Centralize local-rollback serialization via entity hooks | S | low | 5 |
| 7 (optional) | Derive `RenderDiagnostics` + worker mirror policy from registry | S | low | 5 |

**Stop-points:** Phases 1–5 are the value-delivery core. 6 and 7 are nice-to-haves that pay off only if entity churn continues. If after Phase 5 the team feels diminishing returns, ship 1–5 and close the plan. Do not start 6 without re-baselining.

**Out of scope (do NOT touch in this plan):**
- `net/snapshot/schema.ts` and `net/snapshot/codecGen.ts` — the WIRE snapshot. Per CLAUDE.md, this stays hand-rolled and is performance-critical. Entities that need to cross the wire keep their existing schema entries. The `mirrorPolicy` introduced in Phase 7 is for the worker→main state mirror, NOT the network wire.
- `MatchState.bouncyWobble: Map<number, number>` — keyed by platform index, not a per-entity shape; doesn't fit the model.
- `MatchState.players` — too entangled with physics/network code paths; isolation cost > benefit.
- `MatchState.weather`, `MatchState.wildlife`, `MatchState.killFeed`, `MatchState.stats`, `MatchState.ghosts` — wait, ghosts is in Phase 4. Killfeed/stats are not entity-shaped; skip them.
- `springs`, `thorns`, `carrots` — deeply coupled to per-player physics (`handleSpringCollision`, etc. live alongside player physics in `simulator/Simulator.ts`). Migrating these would force lifting the player loop into entity hooks, which inverts the cost/benefit. Leave them as-is.

---

## Target architecture

### `src/engine/entities/types.ts` (new)

```ts
import type { Arena, MatchState, MatchSettings, Player, PlayerSlot } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { Ctx2D } from '../types';
import type { SimulatorEvents } from '../simulator/types';
import type { ParticleEmitter } from '../simulator/types';

/** Context passed to entity.fixedUpdate. */
export interface EntityFixedCtx {
  dt: number;
  arena: Arena;
  theme: ThemeConfig;
  settings: MatchSettings;
  players: ReadonlyArray<Player>;          // host-authoritative state at this tick
  rng: () => number;                       // Simulator's gameRandom — deterministic
  events: Required<SimulatorEvents>;       // already-normalized callbacks
  particles: ParticleEmitter;              // ParticleSystem for spawning VFX
}

/** Context passed to entity.cosmeticStep. Half-rate (~30Hz); see CLAUDE.md tickCosmetic note. */
export interface EntityCosmeticCtx {
  dt: number;
  state: MatchState;                       // for cross-entity lookups (rare)
  arena: Arena;
  theme: ThemeConfig;
  players: ReadonlyArray<Player>;
  events: Required<SimulatorEvents>;
  particles: ParticleEmitter;
}

/** Context passed to entity.draw. */
export interface EntityRenderCtx {
  time: number;                            // matchState.timeElapsed
  cosmeticLead: number;                    // seconds since last cosmeticStep, for extrapolation
  dayPhase: number;
  mirrored: boolean;
  arena: Arena;
  theme: ThemeConfig;
  // beginMirror/endMirror helpers if the entity needs to draw under the mirror transform
  beginMirror(ctx: Ctx2D): { restore: () => void };
}

/** Optional per-entity policies. Default behaviors documented inline. */
export interface EntityPolicy<TInstance> {
  /** Worker→main mirror filtering. Default 'full'. 'none' = renderer-only (e.g. fogParticles, pollenParticles). */
  mirror?: 'full' | 'none' | { fields: ReadonlyArray<keyof TInstance> };

  /** Local rollback save/restore (`net/serialize.ts`). Default: shallow array copy. Override for entities with nested Maps or non-JSON-safe fields. */
  serialize?(state: TInstance[]): unknown;
  restore?(state: TInstance[], data: unknown): void;
}

export interface EntityKind<TInstance> extends EntityPolicy<TInstance> {
  /** Stable identifier. MUST match the MatchState field name (e.g. 'lavaRocks'). */
  readonly id: string;

  /** Build initial state for a new match. */
  init(args: {
    arena: Arena;
    theme: ThemeConfig;
    settings: MatchSettings;
    rng: () => number;
  }): TInstance[];

  /** Host-side gameplay tick. Optional — visual-only entities omit it. */
  fixedUpdate?(state: TInstance[], ctx: EntityFixedCtx): void;

  /** Cosmetic tick (host + guest, half-rate). Optional. */
  cosmeticStep?(state: TInstance[], ctx: EntityCosmeticCtx): void;

  /** Render. Optional — pure-physics entities omit it. */
  draw?(ctx: Ctx2D, state: TInstance[], renderCtx: EntityRenderCtx): void;
}
```

### `src/engine/entities/<entityId>.ts` (one file per entity)

```ts
// Example: scatterFlocks.ts
import type { EntityKind } from './types';
import { SCATTER_PARTICLE_COUNT } from '../constants';

export interface ScatterFlock {
  species: string;
  x: number;
  y: number;
  radius: number;
  respawnTime: number;
  active: boolean;
  armed: boolean;
  respawnTimer: number;
  scatterParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number; phase: number; color: string }>;
}

export const scatterFlocksEntity: EntityKind<ScatterFlock> = {
  id: 'scatterFlocks',

  init({ theme }) {
    return (theme.scatterFlockConfigs || []).flatMap(cfg =>
      cfg.positions.map(p => ({
        species: cfg.species,
        x: p.x, y: p.y,
        radius: cfg.radius,
        respawnTime: cfg.respawnTime,
        active: true, armed: true, respawnTimer: 0,
        scatterParticles: [],
      }))
    );
  },

  fixedUpdate(state, { dt, players, events }) {
    // Spawning / respawn-timer ticking / player-trigger check / SFX dispatch
    // (moved from Simulator.ts:589-619)
  },

  cosmeticStep(state, { dt }) {
    // Particle physics decay (moved from gameLoop/cosmetics/environment.ts)
  },

  draw(ctx, state, { time, cosmeticLead, beginMirror }) {
    // (moved from rendering/hazards/creatures.ts or wherever scatterFlocks draws)
  },
};
```

### Registry (Phase 5)

```ts
// src/engine/entities/registry.ts
import type { EntityKind } from './types';
import type { MatchState } from '../types';

const KINDS: Map<string, EntityKind<unknown>> = new Map();

export function registerEntity<T>(kind: EntityKind<T>): void {
  if (KINDS.has(kind.id)) throw new Error(`Duplicate entity kind: ${kind.id}`);
  KINDS.set(kind.id, kind as EntityKind<unknown>);
}

export function getEntities(): ReadonlyArray<EntityKind<unknown>> {
  // Stable order matters for tick determinism. Insertion order is fine for deterministic registration.
  return [...KINDS.values()];
}

/** Type-safe collection lookup. Asserts the field name is a known entity id. */
export function getCollection<K extends keyof MatchState>(state: MatchState, id: K): MatchState[K] {
  return state[id];
}

export function registerBuiltinEntities(): void {
  // Called once at App.tsx startup, like registerBuiltinArenas / registerBuiltinCharacters.
  // Imports + registers each entity in stable order.
}
```

### Dispatch (Phase 5)

Replace inline loops in `Simulator.fixedUpdate`, `GameLoop.cosmeticStep` (via `EnvironmentSystem` etc.), and `Renderer.renderFrame`:

```ts
// Simulator.fixedUpdate (sketch)
const ctx: EntityFixedCtx = { dt, arena: this.arena, theme: this.theme, settings: this.settings, players: this._state.players, rng: this.gameRandom, events: this._events, particles: this._particleEmitter };
for (const e of getEntities()) {
  if (e.fixedUpdate) e.fixedUpdate(this._state[e.id as keyof MatchState] as any, ctx);
}
```

**Order constraint:** Entity tick order matters for some interactions (e.g. carrots must update before player pickup-check). Plan around the existing order in `Simulator.fixedUpdate` (countdown → hazard → carrot → arenaEntity → per-player physics → effectZone → bouncy → scatterFlocks → carrot pickup → effectZone tick → stomp → match, per `src/engine/CLAUDE.md`). Entities migrated to the registry preserve their original tick slot — see Phase 5 details.

---

## Phase 0 — Baseline (S, no risk)

**Goal:** Capture before-state so subsequent phases can prove parity.

- [ ] Branch `feat/entity-decouple-baseline` off `main`.
- [ ] Run `npm run perf -- --arena=volcano` and `npm run perf -- --arena=meadow`. Copy the resulting `test-results/perf/report.md` to `perf-runs/entity-decouple-baseline/{volcano,meadow}.md`. These are the parity targets for Phase 5.
- [ ] Take E2E screenshots: `npm run test:e2e -- --grep "renders clouds"` (or whichever spec covers each migrated entity visually). Save under `perf-runs/entity-decouple-baseline/screenshots/`.
- [ ] Commit the baselines: `chore(entity-decouple): capture baseline perf + screenshots`.
- [ ] Open PR; merge after review (these are reference artifacts, not behavior changes).

**Validation:** Baseline files exist and are readable. No code changes.

---

## Phase 1 — `EntityKind<T>` + lavaRocks proof-of-concept (M, low risk)

**Why `lavaRocks` first:**
- Only volcano arena uses it.
- No per-player coupling beyond the host-side hit-detection (which already lives in `handleLavaRockCollision` and stays put).
- Renders via a single function (`drawLavaRocks` in `rendering/hazards/`).
- No cosmeticStep (state lives on `MatchState.lavaRocks`, ticks in fixedUpdate only).

### Files involved (current state — verify before editing)

- `src/engine/types.ts` — `LavaRock` type, `MatchState.lavaRocks` field, `MatchState.lavaRockTimer`.
- `src/engine/themes/types.ts` — `ThemeConfig.lavaRockConfig?`.
- `src/engine/arenas/types.ts` — `ArenaPack.lavaRockConfig?`.
- `src/engine/arenas/registry.ts` — `lavaRockConfig: pack.lavaRockConfig` mapping.
- `src/engine/simulator/initialState.ts` — `lavaRocks: []` (in `createEmptyMatchState`), `lavaRockTimer` init.
- `src/engine/simulator/Simulator.ts` — `updateLavaRocks` call site (inside ArenaEntitySystem.fixedUpdate path).
- `src/engine/gameLoop/gameplay/arenaEntities.ts` — `updateLavaRocks(state, dt, rng)` pure function.
- `src/engine/gameLoop/gameplay/ArenaEntitySystem.ts` — system class that calls `updateLavaRocks`.
- `src/engine/gameLoop/gameplay/playerCollisions.ts` — `handleLavaRockCollision` (STAYS — player coupling).
- `src/engine/rendering/hazards/<file>.ts` — `drawLavaRocks` (locate with grep before starting).
- `src/engine/renderer.ts` — draw-loop callsite.
- `src/engine/net/serialize.ts` — rollback save/restore of `lavaRocks` + `lavaRockTimer`.
- `src/engine/worker/engineWorkerInit.ts` — slim mirror pass-through for lavaRocks.
- Tests: search `grep -rn "lavaRock" src/engine/**/*.test.ts`.

### Steps

- [ ] Branch `feat/entity-decouple-phase-1` off `main` (post Phase 0 merge).
- [ ] Create `src/engine/entities/types.ts` with the `EntityKind<T>`, `EntityFixedCtx`, `EntityCosmeticCtx`, `EntityRenderCtx`, `EntityPolicy<T>` interfaces from "Target architecture" above. No registry yet — just the types.
- [ ] Create `src/engine/entities/lavaRocks.ts`:
  - Re-export the `LavaRock` interface from this file (move it from `types.ts` if practical, or keep the type in `types.ts` and import here — your call; co-location preferred).
  - Define `lavaRocksEntity: EntityKind<LavaRock>` with `init`, `fixedUpdate`, `draw`.
  - `fixedUpdate` should call the existing `updateLavaRocks(state, dt, rng)` pure function (don't move the body yet — Phase 1 is about establishing the seam, not rewriting logic).
  - `draw` should call the existing `drawLavaRocks(ctx, state.lavaRocks, time)`.
  - Export both `lavaRocksEntity` (new) and re-export `updateLavaRocks` for backwards compat — Phase 5 will tighten this.
- [ ] `lavaRockTimer` is a top-level `MatchState` scalar, not part of `lavaRocks[]`. Decide:
  - **Option A (recommended):** Move `lavaRockTimer` into a per-kind state bag owned by the entity (`entity.tickState` or similar). Adds complexity to the contract.
  - **Option B:** Leave `lavaRockTimer` on `MatchState` for now. Document it as an exception. Phase 5 can revisit.

  Go with B for Phase 1 to minimize surface; revisit in Phase 5.
- [ ] Update `ArenaEntitySystem.fixedUpdate` to call `lavaRocksEntity.fixedUpdate?.(state.lavaRocks, ctx)` instead of the direct `updateLavaRocks(state, dt)` call. The `ctx` object construction here is a one-off; Phase 5 generalizes it.
- [ ] Update `renderer.ts` to call `lavaRocksEntity.draw?.(ctx, state.lavaRocks, renderCtx)` instead of the direct `drawLavaRocks` call.
- [ ] Leave `net/serialize.ts`, worker mirror, RenderDiagnostics, and tests UNCHANGED. Phase 1 is about establishing the seam without forcing a serialization rewrite.

### Validation

- [ ] `npx tsc -b` clean.
- [ ] `npx vitest run` — same pass count as `main` (modulo pre-existing flakes listed above).
- [ ] Manually load volcano arena via `?arena=volcano&bots=2`. Lava rocks spawn, fly, fall, and damage players exactly as before.
- [ ] `npm run perf -- --arena=volcano` — within ±0.3ms p95 of Phase 0 baseline.

### Commit + PR

- [ ] Commit: `feat(entities): introduce EntityKind interface + migrate lavaRocks (proof of concept)`.
- [ ] Body: link to this plan; note that net/serialize and tests intentionally untouched; explain why Phase 1 keeps the existing pure-function as the body of entity.fixedUpdate (incremental).
- [ ] Push and open PR. Merge to main after review.

### Rollback

Phase 1 changes ~6 files in trivial ways. If any test or perf regression appears: `git revert` the single commit and reassess the plan.

---

## Phase 2 — Visual-only entities (M, low risk)

**Entities:** `gibs`, `confetti`, `shockwaves`, `scoreAnimations`, `comboPopups`, `surfaceDecals`, `ripples`.

**Why batch these:** All are cosmetic-only (no `fixedUpdate`, no host-authoritative state), no per-player coupling, no wire-format consequences (they're either renderer-only or already in the slim mirror as full state). Migrating one at a time gives diminishing returns; batch by similarity.

### For each entity, repeat the Phase 1 pattern

- [ ] Create `src/engine/entities/<entity>.ts` with the type + `EntityKind<T>` definition.
- [ ] Move `init` (whatever populates the field in `createInitialMatchState`, usually `[]`).
- [ ] Define `cosmeticStep` (calls the existing pure function from `cosmetics/`).
- [ ] Define `draw` (calls the existing draw function from `rendering/`).
- [ ] Update the relevant cosmetic system class to call `entity.cosmeticStep?.(state.<id>, ctx)`.
- [ ] Update `renderer.ts` to call `entity.draw?.(ctx, state.<id>, renderCtx)`.

### Per-entity notes (verify against current code before starting)

- **`gibs`** — spawned by `launchGib` from many call sites (player kills). The spawner stays where it is; the entity owns lifecycle + draw + serialization. Has `bakeGibs` side effect on bgCanvas — keep that in renderer.ts since it's a render-target write, not an entity tick.
- **`confetti`** — emitted on match-end. Similar shape to gibs.
- **`shockwaves`** — short-lived expansion rings. Simple.
- **`scoreAnimations`** — floating "+2" popups. Already in CLAUDE.md's "object-pool lifetime rule" exclusion list (don't pool these; they escape into MatchState).
- **`comboPopups`** — kill-streak text. Similar to scoreAnimations.
- **`surfaceDecals`** — blood drips / scorch marks (verify the exact mechanic). May write to bgCanvas like gibs.
- **`ripples`** — water surface (waterfall, underwater). Cosmetic only.

### Commit boundary

Commit per entity (`feat(entities): migrate <name>`), not per phase. Easier to bisect.

### Validation

Same as Phase 1: tsc + vitest + spot-check the affected arenas + perf parity. Add an extra E2E screenshot diff for any entity with a complex visual (gibs especially).

---

## Phase 3 — Ambient cosmetic entities (S, low risk)

**Entities:** `fogParticles`, `pollenParticles`, `shootingStars`.

All three are renderer-only state — host doesn't even need to mirror them to guests, and CLAUDE.md notes they're prime candidates for the slim mirror's `mirror: 'none'` policy. (This plan introduces the policy in Phase 7, not here. Phase 3 just migrates them mechanically.)

Each migration is mechanical; budget a few hours total.

- [ ] `src/engine/entities/fogParticles.ts`
- [ ] `src/engine/entities/pollenParticles.ts`
- [ ] `src/engine/entities/shootingStars.ts`
- [ ] Commit per entity. Validate same as Phase 2.

---

## Phase 4 — Physics-coupled entities (M, medium risk)

**Entities:** `ghosts`, `geyserStates`, `scatterFlocks`.

These have host-authoritative `fixedUpdate` AND per-player interactions:
- `ghosts` — wander, hit players via `handleGhostCollision`.
- `geyserStates` — periodic activation, affect players via `applyEffectZones` (the geyser zones live on `arena.effectZones`; the geyser timer ticks on MatchState).
- `scatterFlocks` — player triggers a flock, particles ensue.

### Key risk: `applyEffectZones` couples `geyserStates` to player physics

Current location: `gameLoop/gameplay/effectZones.ts`. The function iterates `state.effectZones` and `state.geyserStates` to apply per-player force. It runs INSIDE the per-player loop in `Simulator.fixedUpdate`.

**Strategy:** The geyser ENTITY owns `init` + `fixedUpdate` (timer ticking, active-state toggling). The per-player effect application STAYS in `applyEffectZones` — it's player physics, not entity logic. The entity reads state, the player loop reads from the entity's state.

This is the cleanest split for player-coupled entities and sets the pattern for any future entity in the same boat.

### Steps per entity

- [ ] Migrate the entity (init, fixedUpdate, draw) per the Phase 1 pattern.
- [ ] Leave the player-interaction handler (`handleGhostCollision`, `applyEffectZones`, etc.) in place. Document in the entity file's header comment that "per-player collision lives in `gameLoop/gameplay/playerCollisions.ts > handle<X>Collision`".
- [ ] Same validation as Phase 1, plus: explicitly test the player-entity interaction. Existing tests in `simulator-gameplay.test.ts` cover this.

### scatterFlocks SFX integration check

The `scatterFlocks` `fixedUpdate` fires `events.onSfxRequest('pigeon_scatter')` (the `pigeon_scatter` SFX name is intentionally retained — it's reused by the scatterFlocks system, per `src/engine/CLAUDE.md` and `src/engine/audio/soundRegistry.ts:61`). Verify the SFX still plays during migration. Test: load any arena with bird flocks (e.g. rooftops), walk into a flock, hear the scatter sound.

---

## Phase 5 — Registry + dispatch (M, medium risk)

**This is the payoff phase.** Until now each migrated entity is imported and called explicitly by Simulator / Renderer / Systems. Phase 5 replaces those explicit imports with a registry iteration.

### Files affected

- `src/engine/entities/registry.ts` (new — code shape under "Target architecture").
- `src/engine/entities/index.ts` (new — imports each entity file and calls `registerEntity()` at module load, similar to `arenas/builtin.ts`).
- `src/App.tsx` — call `registerBuiltinEntities()` at module scope, alongside `registerBuiltinArenas()` and `registerBuiltinCharacters()`.
- `src/engine/simulator/Simulator.ts` — replace inline entity `fixedUpdate` calls with `for (const e of getEntities()) e.fixedUpdate?.(...)`.
- `src/engine/gameLoop/cosmetics/EnvironmentSystem.ts` (or wherever the cosmetic dispatch lives) — same pattern for `cosmeticStep`.
- `src/engine/renderer.ts` — replace inline draw calls with a registry loop.
- `src/engine/simulator/initialState.ts` — `createInitialMatchState` calls `for (const e of getEntities()) state[e.id] = e.init({...})` instead of hardcoded inits.

### Tick-order preservation

The current `Simulator.fixedUpdate` order is documented in `src/engine/CLAUDE.md` (countdown → hazard → carrot → arenaEntity → per-player physics → effectZone → bouncy → scatterFlocks → carrot pickup → effectZone tick → stomp → match) and locked by `regression-determinism.test.ts.snap`.

**Two options for preserving order:**
- **Option A:** Add `tickPhase: 'pre-player' | 'post-player'` to `EntityKind`. Pre-player entities tick before the per-player loop; post-player after. This handles the carrot pickup case (post-player) and scatterFlocks (post-player).
- **Option B:** Keep order = registration order. Document that entities are registered in the same order as the current `Simulator.fixedUpdate` calls. Single phase, simpler interface, but less obvious from the entity file alone.

Recommended: **Option B**, since the existing order is already documented and the determinism snapshot pins it. Add a comment in `entities/index.ts` documenting the order and a `regression-tick-order.test.ts` to lock the registration sequence.

### Validation

- [ ] `tsc -b` + full vitest pass.
- [ ] `regression-determinism.test.ts` snapshots unchanged (if they DO change, investigate — the order has drifted).
- [ ] `npm run perf -- --arena=volcano` and `--arena=meadow` within ±0.3ms p95 of Phase 0 baseline. The registry adds one V8-inlinable indirection per entity per tick; expected impact is in the noise.
- [ ] E2E screenshot diffs vs Phase 0 baseline — pixel-equivalent on all migrated arenas.

### Commit

`refactor(entities): dispatch via registry, eliminate hardcoded per-entity loops`.

### Rollback

Phase 5 is the highest-blast-radius commit in the plan (~10 files, all in hot paths). Rollback strategy:
- If perf regresses: profile to identify whether the indirection is the cause. If yes, consider Option A from "Tick-order preservation" with explicit phase arrays so each phase is a tight loop with stable kind shape (better V8 inlining).
- If determinism snapshot diverges: a tick was reordered. Compare new order against `Simulator.fixedUpdate` in `git show HEAD~1`. Re-register entities in the original order.
- If correctness regresses: `git revert` the registry commit; entities still work via Phase 1–4 explicit calls.

---

## Phase 6 (optional) — Centralized local-rollback serialization (S, low risk)

**Trigger:** Only do this if entity churn is expected to continue. If no entity is being added or removed in the next month, skip.

`net/serialize.ts` currently hardcodes per-field clone + restore for each entity collection. With the registry, this becomes:

```ts
// Pseudocode
for (const e of getEntities()) {
  serialized[e.id] = e.serialize ? e.serialize(state[e.id]) : [...state[e.id]];
}
```

Same loop for restore. Each entity defines `serialize?` / `restore?` ONLY if its default shallow-array clone is insufficient (e.g. entities containing Maps).

### Files

- `src/engine/net/serialize.ts` — replace hardcoded blocks with registry iteration.
- Each entity file — add `serialize` / `restore` IF its current `net/serialize.ts` code does more than `[...arr]`. Most don't; expect <3 entities to need overrides.

### Validation

- [ ] Snapshot-restore round-trip tests pass for every migrated entity. Add a parametrized test: `for each entity, take snapshot → mutate → restore → verify state matches`.
- [ ] `net/serialize.test.ts` keeps passing (most cases stay golden).

### Commit

`refactor(entities): centralize local-rollback serialization via entity hooks`.

---

## Phase 7 (optional) — Worker mirror + RenderDiagnostics from registry (S, low risk)

**Trigger:** Only if Phase 6 lands.

`worker/engineWorkerInit.ts` slim mirror currently hardcodes per-field passthrough or strip. With `EntityPolicy.mirror`, this becomes a loop:

```ts
for (const e of getEntities()) {
  switch (e.mirror ?? 'full') {
    case 'full': mirrored[e.id] = source[e.id]; break;
    case 'none': mirrored[e.id] = EMPTY_ARRAY; break;
    default: /* field-filtered */ break;
  }
}
```

`RenderDiagnostics` becomes a `Set<entityId>` populated by each `draw` call (entity sets its own diagnostic flag). The `STUB_DIAGNOSTICS` in `worker/RendererProxy.ts` and `worker/EngineWorkerProxy.ts` become an empty Set.

### Files

- `src/engine/entities/<id>.ts` — add `mirror: 'none'` to renderer-only entities (`fogParticles`, `pollenParticles`, `shootingStars`, `gibs`, etc. — confirm policy with `git log` on the slim-mirror commit).
- `src/engine/worker/engineWorkerInit.ts` — replace slim mirror builder with the loop.
- `src/engine/renderer.ts` — `RenderDiagnostics` becomes a `Set<string>`; each entity that drew calls `diag.add(e.id)`.
- `src/engine/worker/{RendererProxy,EngineWorkerProxy}.ts` — `STUB_DIAGNOSTICS` becomes `new Set<string>()`.

### Validation

- [ ] Worker offload path still works (`?worker=on` or whatever the URL flag is — verify in current `src/engine/worker/`). Mirror stripping should match the current behavior byte-for-byte.
- [ ] `RenderDiagnostics` test consumers still work (search `grep -rn "RenderDiagnostics" src/`).

### Commit

`refactor(entities): derive worker mirror + RenderDiagnostics from entity policy`.

---

## Risk matrix

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Perf regression from registry indirection (Phase 5) | Medium | Phase 0 baseline + per-phase perf check; rollback plan in Phase 5 |
| Tick-order drift breaks determinism snapshot | Medium | Lock with `regression-determinism.test.ts.snap` (existing); add an entity-order test in Phase 5 |
| Per-player-coupled entities don't fit (springs, thorns, carrots) | Confirmed | Out of scope — leave them in `Simulator.ts` |
| Wire format change | Should be zero | Plan never touches `net/snapshot/`. If it does, abort and reassess. |
| Worker mirror byte-for-byte divergence (Phase 7) | Low | Mirror policy defaults to 'full' (current behavior); only entities explicitly opting into 'none' change behavior |
| `lavaRockTimer` and similar per-entity scalars don't fit the array model | Confirmed | Option B in Phase 1 — leave scalars on MatchState. Revisit in Phase 5. |
| New entity added during migration | Low | If urgent: add via current pattern (28 files) and migrate after this plan lands. If non-urgent: hold until Phase 5 ships. |

---

## Exit criteria

The plan is "done" when EITHER:
- Phases 0–5 are merged, AND a follow-up entity addition or removal demonstrably touches ≤3 files. (Run the experiment: pretend to add a new ambient entity; count file edits required.)
- The team decides Phase 6 / Phase 7 are not worth the cost and explicitly closes the plan.

Document the final outcome in `docs/superpowers/reviews/<date>-entity-decoupling-retro.md` so the next architectural review session has the post-mortem.

---

## Open questions for the executing session

1. **Co-locate type definitions or keep in `types.ts`?** Current `src/engine/types.ts` is a god-file of types. Migrating entity types to per-entity files would shrink `types.ts` but breaks the convention. Recommend: keep `types.ts` for now, move per-entity types in a follow-up if/when the convention shifts.
2. **`lavaRockTimer` and similar scalars** — Option A (move into entity tickState bag) or Option B (leave on MatchState)? Recommend Option B for the plan; revisit in Phase 5.
3. **Entity-test convention** — should every `entities/<id>.ts` have a sibling `entities/<id>.test.ts`? The current test layout has tests scattered across `__tests__/` folders. Recommend: leave existing tests where they are during migration. Phase 7 + 1 might be the time to colocate.

Defer any of these by sticking with the recommendation. None block the plan.
