# L2 — Light catalog & per-arena emitters — post-implementation review

**Date:** 2026-05-08
**Branch:** `feat/lighting-l2-emitters` (off main `9c5a57f`).
**Spec:** `2026-05-07-lighting-l2-emitters-design.md`.
**Bakeoff:** `perf-runs/l2-emitter-comparison/REPORT.md`.
**Phases shipped:** 0 (constructor refactor) → 7 (this doc).

## What landed vs the spec

| Phase | Spec said | Shipped |
|---|---|---|
| 0 | Renderer constructor → options bag | ✓ as spec |
| 1 | EmitterPipeline scaffold + `?lmode=combined\|split` bakeoff infra | ✓ as spec |
| 2 | Test scene with `lights: [...]` + per-player aura | ✓ but switched arena: castle (5 torches at existing `TORCH_X`) instead of haunted_graveyard. User-suggested mid-implementation; better fit because castle already had torch positions + a 2D halo to replace. |
| 3 | Bakeoff + decision | ✓ wash result; combined picked on simplicity tiebreaker |
| 4 | Carrot glow + spawn pillars | ✓ as spec. Spawn pillars folded into the per-player aura intensity ramp (no separate emitter). |
| 5 | Lava emissive + firefly lights | ✓ as spec. `fireflyPosition` extracted as a shared helper between the visual draw in `effects.ts > drawDayNightCycle` and the emitter synthesis in the renderer — kept the two locked-in-step. |
| 6 | Per-player aura + critical-moment bump | **Inverted scope at user request:** game has no health stat, so "low-health bump" was rebooted as "points-leader gold-tinted boost." Reinforces the same competitive read as the score HUD. |
| 7 | Pre-L3 cleanup + L3 brainstorm prep | ✓ this doc + `2026-05-08-lighting-l3-brainstorm-prep.md` |

Two simplify passes ran outside the phase numbering: one after Phase 5 covering all of L2 (commit `e79d620`), one after Phase 6 (commit `12f46a5`). Plus a discriminated-union refactor of `Light` (`4ac1f87`) and a `blendRgb` lift to `fastMath.ts` (`adf2f4b`).

## Architectural decisions

### `Lighting` orchestrator + two pipelines

```
Lighting
  ├─ ambient: AmbientPipeline    (renamed from L1's LightingPipeline)
  └─ emitters: EmitterPipeline   (new in L2)
```

Resolves L2-prep Q2. Renderer holds one `lighting` field; renames don't ripple to call sites since both pipelines are accessed through it. The orchestrator is intentionally thin (~30 LoC): it just owns the two pipelines and forwards `resize` + `isEnabled`.

### Single screen-blend `lightCanvas`

The bakeoff (3 runs of `?lmode=combined` vs 3 runs of `?lmode=split` on castle) showed all percentile deltas at or below the 0.3ms run-to-run noise floor documented in CLAUDE.md. Combined picked on simplicity:
- One DOM compositor layer instead of two (we're already at 6 layers; the 7th was a clear loss when perf was a wash)
- Half the GPU memory for light state (~15MB vs ~30MB at 2×DPR)
- Simpler renderer code

`mix-blend-mode: screen` puts additive light contributions above the L1 fg-night-tint multiply layer — they punch through the night darkening. Layer opacity is `bgNightOpacity`-driven so emitters fade in with night and disappear during the day (browser compositor skips zero-opacity layers).

### `Light` discriminated union

Original spec had a single `interface Light` with optional spot fields and two flat flicker fields. Refactored to:

```ts
type Light = PointLight | SpotLight;
interface CommonLight { x, y, color, intensity, radius, falloff; flicker?: Flicker; }
interface PointLight extends CommonLight { kind: 'point'; }
interface SpotLight extends CommonLight { kind: 'spot'; direction: number; cone: number; }
interface Flicker { seed: number; amplitude: number; }
```

Catches `{kind:'point', direction:0}` and `{flickerSeed:7}` (no amplitude) at compile time. Spot's `direction` and `cone` are now required — `stampSpot` lost its `?? 0` / `?? Math.PI/3` defaults.

### Static catalog vs dynamic synthesis

Resolves L2-prep Q6/Q7. **Static** lights live on `ArenaPack.lights: ReadonlyArray<Light>` — declared in the arena pack file, baked once at arena-load into an internal `OffscreenCanvas` cache, blitted onto `lightCanvas` per frame. **Dynamic** lights are synthesized inline in `Renderer._synthesizeDynamicLights` from existing entity state — no `Player`/`Carrot` schema change, no snapshot wire-format change. The pool reuses Light slots across frames via `_ensureLightSlot(i)`.

This split avoided the FoliageSystem-vs-arena-pack boundary question entirely: static catalog is arena-pack-scoped, dynamic is entity-scoped, neither side needed cross-system plumbing.

### Determinism

All flicker derives from `SeededRNG.floatFromTick(seed, tick)` — a new allocation-free static helper added to `seededRng.ts` for the L2 hot path. `tick = floor(matchState.timeElapsed * 60)` avoids a wire-format change for an explicit tick field; guests see ~2-tick flicker lag (acceptable per L2-prep Q9).

## Cross-cutting patterns established

- **Mix-blend-mode + opacity-driven DOM siblings** for pillar-scoped composites that need to read OR write to the foreground without per-frame canvas blits. L1 used this for night darkening (multiply); L2 reused it for emitters (screen). L3 sun shadows likely a third instance.
- **Pool-by-index Light slots in `_dynamicLights`** — `_ensureLightSlot(i)` allocates on first use, reuses across frames, trims length to the live count. Clears per-call any optional fields that previous emitter types might have set, so reused slots can switch types between frames without leaking config.
- **Memoization caches per-character.** `_hslCache`, `_rgbCache`, `_leaderRgbCache` — same shape: `Map<hex, parsedValue>`, lazy populate, bounded by character pack count (≤17). Per-character allocation, never per-frame.
- **`Array.from({length: N}, ...)`** for per-instance constants — `FIREFLY_FLICKER` builds 8 frozen entries this way; `LAVA_EMITTERS.map(...)` does the same for the volcano lava lights. Length follows the count constant by construction.
- **Shared math helpers, thin wrappers per use site.** `fireflyPosition(i, frameTime, out)` shared between visual draw and emitter synthesis. `blendRgb(a, b, t, out?)` shared between three RGB-lerp callers.

## Findings caught in review

Across 4 simplify-pass agent rounds (architecture, correctness, code-quality, perf), things that were caught and fixed:

- **`isLivePlayer` rule violation** — inline `!p.active || state==='splat' || state==='respawning'` guard was the third such inline copy; the rule is documented in `engine/CLAUDE.md`. Fixed to use `themes/utils.ts > isLivePlayer`.
- **Per-frame Light + RGB allocs** in `_synthesizeDynamicLights` — pooled via `_ensureLightSlot`, RGB cached via `_rgbCache`.
- **`SeededRNG.fromTick` allocates per call** — added `floatFromTick` static helper that returns the float without an RNG instance. ~360 fewer allocs/sec on castle.
- **`{...light, intensity:0}` per-frame spread** in flicker overlays — pre-built `_staticFlickerOverlays` once in `setStaticLights`.
- **`_compositeEmitters` ran at zero opacity (daytime)** — early-return after driving opacity; saves the per-frame stamp work during the most-common visual state.
- **Stale `flicker` config leaking into reused slots** — `_ensureLightSlot` clears `flicker = undefined` per call.
- **Latent leader-stays-stuck-after-respawn bug** — leader detection used `isLivePlayer` filter, so a temporarily-splat leader could lose the title to a trailing player and never recover. Drop the filter; leader is whoever has the highest score regardless of liveness, their aura just doesn't render while splat.
- **Leader detection ran every frame** — cached on `(scoreSum, matchOver)` dirty key. Per-frame cost in steady state: 1 sum loop + 2 compares.
- **`renderer.test.ts` mock missed Phase 5 `./rendering` exports** (`computeNightIntensity`, `fireflyPosition`, `FIREFLY_COUNT`) — caught at Phase 6 simplify time, mocks added.

## Skipped (deferred to L4/L5 or "won't ever")

- **Discriminated union for `Light`** was initially deferred as "no concrete bug" — applied later when the user asked for an explanation. Worth doing whenever a discriminated shape is more honest than optional-fields.
- **`blendRgb` lift to `fastMath.ts`** was initially deferred as "out of scope" — applied later when the user asked. Doing it earlier would have been fine.
- **AI ↔ light coupling** (L2-prep Q10) — hard-ruled-out. AI does not read light contributions; lighting stays cosmetic. Documented in the program design doc.
- **Compositor strategy** (L2-prep Q5) — `hasDomDarkening` boolean stays. The third state (perfTier=low, emitters disabled but ambient on) hasn't materialized.
- **Half-res light buffer revival** — bakeoff confirmed direct stamps + cached static blit are perf-equivalent to a buffer.

## Lessons for L3+ pillars

- **Bake the bakeoff into the spec.** L1's `?lmode=` 7-mode comparison and L2's combined-vs-split bakeoff both produced empirical answers at the cost of dual-implementation work. Both paid off — picked the right architecture each time. L3's sun-shadow keyframe count (2 vs 4 vs 8) and the choice between baked vs runtime-blur are similar empirical questions.
- **Trust the simplicity tiebreaker when perf is a wash.** L2's split-mode would have added a 7th DOM layer with no measurable benefit. The "fewer DOM layers + half the GPU memory + simpler code" stack of tiebreakers won every time.
- **Inline synthesis from existing fields beats new schema fields when the data is already in flight.** Spawn pillars, carrot glow, leader aura — none required `Player`/`Carrot` schema changes; all derive from existing fields. The renderer is a fine place for this kind of decode-from-state logic since it doesn't affect simulation determinism.
- **The `mix-blend-mode + opacity` DOM-sibling pattern is the L1+L2 workhorse.** L3's sun shadows are the natural third application (`mix-blend-mode: multiply`, opacity gated on inverse-night-intensity). Same RAM/composite trade-offs.
- **Discriminated unions over optional fields** — apply early. Catches typos at compile time, removes silent-default fallbacks in consumers.
- **Lift duplicated math** — apply the second time you see it. The third copy of color-lerp (across `Renderer.blendColor`, `spriteShading.blendColors`, `getLeaderRgb`) was the right inflection point.

## What the user explicitly asked for vs default behavior

- **"Castle is the better candidate"** for the bakeoff scene — switched from haunted_graveyard. Saved time (positions already declared) and gave a cleaner before/after for the screen-blend punch-through demo.
- **"Bakeoff now"** vs "start with combined and bakeoff later if needed" — chose the empirical-now path, took ~4 hours, produced an unambiguous answer.
- **"Aura for points leader, not low-health"** — inverted Phase 6's stated direction. Better fit for a couch-co-op with no health stat.
- **"Cache the leader, don't recompute every frame"** — perf review caught afterward; user pushed for the cache directly.
- **"Explain discriminated union for Light"** → **"do it"** — the discriminated-union refactor got applied after the user asked for the explanation. Same for `blendRgb` lift.

The pattern: simplify-pass findings the user judged worth applying immediately got applied; "deferred" wasn't a permanent bucket. Worth defaulting future passes to "explain trade-off, then ask" instead of pre-skipping.

## Net delta (vs main `9c5a57f`)

```
~25 commits across 7 phases + 2 simplify passes + 2 standalone refactors
~1500 LoC source change net (mostly additions)
~400 LoC tests added (lighting + fastMath + arenas)
```

L2 ships 4 distinct emitter sources (per-player aura, carrot glow, firefly, leader boost) + 3 arena packs with static catalogs (castle, volcano, +any with `dayNight.showFireflies`). Single screen-blend DOM sibling, allocation-free hot path, deterministic across host/guest.
