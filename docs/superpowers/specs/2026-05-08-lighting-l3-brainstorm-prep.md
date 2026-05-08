# L3 brainstorm prep — open questions

**Date:** 2026-05-08
**Status:** Pre-brainstorm. Read before starting the L3 design session.
**Source:** L2 implementation (`feat/lighting-l2-emitters`, 14 commits), L1 program design `2026-05-07-lighting-program-design.md`, L2 spec `2026-05-07-lighting-l2-emitters-design.md`.

L3 ships shadows. Per the program design doc:
- Blob shadows under emissives (springs, mushrooms, lava emitters, arena props) — ref §9.9
- Directional sun shadows from platform edges (orientation per platform, soft-blurred) — ref §9.6
- Self-shadow on character sprite (optional shading pass) — ref §9.11

**Already on main**: a player drop shadow (ellipse cached to OffscreenCanvas at `rendering/players.ts:46`, projected onto ground/platform below, shrinks with height). L3 doesn't rebuild that; it extends to other entities and adds the new shadow types.

L3 depends on L1 only and is parallel-able with L2. Since L2 has now landed, L3 starts on top of the L1+L2 foundation.

---

## 1. Compositing topology — additive lights vs subtractive shadows

L2 added `lightCanvas` (z=5, `mix-blend-mode: screen`) above the fg-night-tint multiply layer. Lights are additive: they brighten dark pixels without darkening bright ones. Shadows are the opposite — they darken without brightening.

**Three plausible places shadows can sit:**

- **(a) On the bg canvas, baked at arena-load.** Static-only — sun shadows and platform-edge shadows that don't change. Players don't cast onto bg. Per-frame cost: zero. Limits the design to truly static shadows.
- **(b) On the fg canvas before sprites draw.** Dynamic — drop shadows under players move with players, blob shadows under emissives sit at known positions. Per-frame cost: N draw calls where N = entities + platform-edge contributions. Scales with active entities.
- **(c) New DOM sibling at z=2.5 with `mix-blend-mode: multiply` and dark color.** Mirrors L2's lightCanvas trick but in reverse. Static + dynamic on one canvas, opacity-driven by `bgNightOpacity` (or its inverse — shadows fade at NIGHT, not the day). Per-frame cost: 1 clear + N stamps into the sibling.

**Recommendation:** start with (b). The existing player drop shadow lives on FG and works fine; extending the same pattern to springs/mushrooms/etc keeps shadows where the entities are. Sun shadows from platform edges are STATIC per arena — bake into bg cache (or a dedicated `bgShadowCache` OffscreenCanvas) and blit once when bg changes. Reserve (c) for L4/L5 if dynamic-shadow density forces it.

The "shadows fade at night" rule: drop shadows shouldn't show on a torchlit scene the same way they do at noon. Quick gate: shadow alpha = `(1 - bgNightOpacity) * SHADOW_DAYTIME_ALPHA`. Lava emissive zones still want SHADOWS on nearby platforms (the lava is the light source, not the sun) — so shadow-fading is per-source, not global. **Defer the per-source shadow-fading question to mid-implementation.**

## 2. Sun direction — restore `sun.ts`?

L1 deleted `sun.ts` + `buildSunLight` because there were no consumers. L3 is the first real consumer: directional sun shadows need a sun position derived from `dayPhase` to project shadow direction.

**Options:**
- **(a) Restore `sun.ts` with a real shape** — `sunDirection(dayPhase): { angle, intensity }` returning radians + 0..1 visibility. Used by sun-shadow projection. Same convention as the deleted L1 placeholder.
- **(b) Inline the math at the platform-shadow draw site** — a couple of trig ops per platform. Simpler, but if L4 / L5 emitters or god-rays also want sun direction, we duplicate.

**Recommendation:** (a). The L1 prep doc already anticipated this. Restore the file (deleted at commit `90b173d`) with `direction(dayPhase): number` (radians, 0 = sun on right, π/2 = above) plus a visibility factor (0 below horizon, 1 at noon). Keep the type narrow — emitter-style "color, intensity, x, y" Light fields aren't needed; this is a directional vector for shadow projection only.

## 3. Blob shadow shape — circles or ellipses?

The existing player drop shadow is an ellipse (20×4 cached bitmap, scaled per height). Extends naturally to other entities, but ellipse caches don't compose well across varying aspect ratios.

**Recommendation:** stick with the existing 20×4 elliptical bitmap, scale per entity (springs ~0.7×, mushrooms ~0.9×, carrots ~0.5×). For oddly-shaped entities that need a non-elliptical footprint (lava, multi-cell hazards) the same blit-with-scale approach extended to a small library of cached shapes (round, oval, rect-rounded) is cheaper than path-rendering each per frame.

## 4. Self-shadow — sprite-cache or runtime?

Per the program design "Self-shadow on character sprite (optional via shading pass)" — adds a darker tone to the side of the body opposite the dominant light source. Two approaches:

- **(a) Bake into the sprite cache.** Sprite cache key adds a light-direction bucket (8 directions = 8× cache size). One-time cost; cache hit is free.
- **(b) Composite at runtime.** Per-frame multiply pass over the sprite using a directional gradient mask. ~0.05ms per player.

**Recommendation:** defer. Self-shadow is the curiosity-tier feature in the program doc ("optional"). Implement after sun/blob/platform-edge shadows ship. When implementing, prefer (b) — sprite cache is already memory-bounded and adding 8× would force shrinking the cache cap. Runtime composite at 5 players × 0.05ms = 0.25ms/frame. Acceptable.

## 5. Platform-edge sun shadows — geometry shape

Each platform projects a soft-blurred quad onto the ground (or onto whatever's below it). Shape:
- Vertex 1: platform top-left
- Vertex 2: platform top-right
- Vertex 3: top-right + (sun-direction × shadow-length)
- Vertex 4: top-left + (sun-direction × shadow-length)

Soft blur via `ctx.filter = 'blur(4px)'` is GPU-cheap on modern Chromium but invalidates layer promotion; alternative is bake-at-arena-load with a pre-blurred mask. Since platform layouts are static per arena and the sun direction changes slowly (one cycle per match), **recommendation: bake N keyframes** (4 sun positions: morning, noon, afternoon, evening) into a `bgShadowCache` OffscreenCanvas, cross-fade between them via opacity-driven alpha. Same trick as L1's `bgNightCanvas`.

Cost: 4 keyframes × (1280 × 720 × scale) bytes ≈ 30MB at 2×DPR per arena. Per-arena = build only the current arena's keyframes; lazily destroy on `switchArena`.

## 6. Shadow color — black or arena-tinted?

Pure black shadows look harsh; the codebase already lerps shadow alpha but not color. For L3 sun shadows specifically, real-world shadows pick up skylight tint (cool-blue at noon, orange at sunset). For drop shadows under players, near-black + low alpha works.

**Recommendation:** keep drop shadows near-black (current behavior). For sun shadows, pull `theme.dayNight` afterglow color and lerp shadow color toward it by ~0.3 — gives "warm sunset shadow" without adding a configuration knob. Defer to mid-implementation.

## 7. Per-tier gating

The L1 perfTier scaffold is wired but only `med` is implemented. L3 is the right phase to populate `low` and `high`:

| Tier | Drop shadows | Blob shadows | Sun shadows | Self shadows |
|---|---|---|---|---|
| `low`  | character only | none | none | none |
| `med`  | character + emissives | per-entity | static bake | none |
| `high` | + soft blur | + soft blur | + 4-keyframe cross-fade | composite at runtime |

Implementation rule: each shadow path checks `getPerfTier()` once at draw entry and early-returns. Same pattern as L2's `?lighting=off` kill switch.

## 8. Compositing order in `renderFrame`

Where do shadows draw relative to the existing pipeline?

```
ambient.beginFrame
emitters.beginFrame
[bake drain]
[bg drawing → bg-shadow-cache blit ← NEW (sun shadows pre-baked)]
[players → blob shadows BEFORE players ← NEW (drop/spring/mushroom shadows)]
[reactive prePlayer]
[ghosts, ambient particles, reactive postPlayer]
[ambient.composite]
[emitters.composite]
[brightness pass]
```

Drop shadows at sprite-draw time (already correct for player). Sun shadows on bg (pre-baked, blit once per arena/scale). Both inside the hitstop/screen-shake transform so shadows ride the shake.

## 9. Net-mode visual consistency

Shadows derive from `dayPhase` (sun direction, alpha gating) and entity positions (drop / blob anchors). Both are per-frame state already in snapshots. Same ~2-tick guest lag as L2 emitters — acceptable.

One concern: sun-shadow keyframes cross-fade based on `dayPhase`. The L2 dayPhase wrap-aware lerp fix in `net/interpolation.ts:228` is load-bearing here too — if sun shadow opacity passes through the seam with a naive lerp it'll briefly snap to the wrong keyframe. Already fixed; verify when implementing.

## 10. Carry-over from L2

L2's `Lighting` orchestrator currently exposes `ambient` + `emitters`. L3 might add `shadows` as a third subsystem, or fold sun-shadow logic into `ambient` (since sun direction is ambient-coupled).

**Recommendation:** new `ShadowPipeline` under the orchestrator, parallel to `EmitterPipeline`. Same shape: a `setStaticCasters(...)` for arena-load + a per-frame `compositeDynamic(ctx, dayPhase)`. Ambient stays focused on the dayPhase tint computation; shadows are a separate concern that happens to read sun direction.

---

## L3 dependencies on L2

- **L2 `Light` data type stays** — sun-shadow projection doesn't reuse `Light`, but blob shadows under L2 emissives need to know emitter positions. The `ArenaPack.lights` catalog is the right source. (Static shadows under static torches, baked once.)
- **L2's `lightCanvas` stays** — shadows go elsewhere (bg or fg, see Q1).
- **L2's `bgNightOpacity` stays** — shadow alpha gates against it (shadows fade at night, except where the lava is the light source — Q1 deferred).

## L3 explicit non-goals

- **Per-light point-shadow casting** (Catalin Zima §9.2) — curiosity tier, deferred to L5 per the program doc. Don't build it in L3.
- **Stencil-based shadow volumes** — Canvas 2D doesn't support stencil; if anything fancy is needed, do it via clip+mask. Not in L3.
- **Soft shadows via shadowmap blur** — Canvas 2D `ctx.filter = 'blur'` is the only path; for static shadows pre-blur the mask. No per-frame blur kernels.

---

## Pre-L3 cleanup completed in L2 close-out

These were applied as L2 polish before L3 starts (commits `12f46a5`, `adf2f4b`):

- L2 simplify pass — alloc cleanup, `isLivePlayer` rule applied, `_compositeEmitters` daytime skip
- Discriminated union for `Light` (`PointLight | SpotLight`)
- `blendRgb` lifted to `fastMath.ts`, deduped 3 color-lerp callers
- Volcano lava emitters table-and-mapped, `LAVA_GLOW_RGB` constant pulled out
- `FIREFLY_FLICKER` built via `Array.from({length: FIREFLY_COUNT}, ...)` so length is structural
- Renderer test mock updated for Phase 5 `./rendering` exports (`computeNightIntensity`, `fireflyPosition`, `FIREFLY_COUNT`)
