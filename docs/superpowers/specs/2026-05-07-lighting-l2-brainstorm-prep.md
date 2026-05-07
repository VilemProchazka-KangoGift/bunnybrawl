# L2 brainstorm prep — open questions

**Date:** 2026-05-07
**Status:** Pre-brainstorm. Read before starting the L2 design session.
**Source:** Synthesis of three deep-review rounds on L1 (`docs/superpowers/reviews/2026-05-07-lighting-l1-cross-fade-review.md` + commit messages on `feat/lighting-l1-foundation`).

L2 ships per-arena emitters (point/spot lights, lava emissive, torches, fireflies, carrot glow). The L1 architecture is a 2D-scalar solution (one night intensity → two stacked DOM elements). Point lights are *additive* and *localized* — they can't extend the L1 mechanism; L2 will add a parallel pipeline, not extend the existing one.

The questions below are deliberately deferred from L1. Each carries a recommendation but the brainstorm should challenge.

---

## 1. Resurrect the half-res light buffer? (Most load-bearing.)

L1 deleted `getLightBuffer(): null` because the cross-fade architecture didn't need it. L2 point lights need additive blending of localized contributions — CSS DOM stacking can't do that.

**Three paths:**

- **(a) Resurrect the OffscreenCanvas light buffer.** Each emitter stamps a radial gradient into the buffer; the renderer multiplies fg by the buffer once per frame. Cost: the +5ms regression L1 saw, paid back as we add features. Mitigations: half-res, gate via perfTier, allow per-arena opt-out.
- **(b) Direct stamps on FG with `'lighter'` blend.** No buffer. Each emitter is one fillRect/arc with additive blend on fgCtx. Cost: N×fillRect/frame. Likely cheaper than (a) at low emitter counts, expensive at high. Budget question: what's the emitter ceiling on Med tier?
- **(c) Per-arena baked light maps.** Static lights only — torches mounted on walls in a graveyard. No dynamic lights (no carrot pickup glow, no firefly-follows-player). Limits the design.

**Recommendation:** Start with (b) and an emitter ceiling. Budget the cost: 10 emitters × 1 fillRect at 2× DPR × cheap radial gradient ≈ 1ms/frame. If we hit the ceiling, revisit (a).

## 2. Class topology — split or extend?

L1's `LightingPipeline` is night-tint-only. The name overstates what it owns.

**Recommendation:** Rename current class → `AmbientPipeline`. Add `EmitterPipeline` for L2. A thin `Lighting` orchestrator holds both. Renderer goes from `this.lighting` → `this.lighting.ambient` + `this.lighting.emitters`.

Risk: L4 adds per-arena bg keyframes (still ambient territory) and bloom (post-pipeline). The "Lighting orchestrator + per-concern pipelines" shape carries L4 fine.

## 3. Ambient access for multiple consumers

L1's `_ambientScratch` is a single private buffer mutated by `beginFrame`. L2 emitters will want to read ambient (lava emissive amplifies glow at night, sun shadow direction reads sun warmth).

**Recommendation:** Replace `_ambientScratch` with a public `getAmbient(): Readonly<RGB>` accessor that returns a per-frame stable reference. Internally still a scratch — just don't mutate after `beginFrame` returns.

## 4. Renderer constructor — refactor to options-bag now

Current: 7 positional + 4 trailing optional. L2 will add at least one more canvas (light buffer, if revived) plus likely a perf-debug overlay canvas.

**Recommendation:** Refactor before L2's first feature PR. Pattern:

```ts
new Renderer({ bgCanvas, fgCanvas, hudCanvas?, bgNightCanvas?, fgNightTint?, lightBufferCanvas? }, theme, { mirrored?, ... });
```

Touches every test setup once; subsequent L2 PRs add one field instead of one positional. Single-PR refactor.

## 5. `setHasDomDarkening` boolean → strategy?

L1's two darkening paths (CSS cross-fade vs source-over fillRect) are gated by a boolean. L2's emitter pipeline introduces a third state (emitters active, ambient inactive — e.g. perfTier='low' might disable the cross-fade but keep emitters).

**Recommendation:** Replace the boolean + `if (this.hasDomDarkening) return` with a strategy injected at construction (`SourceOverCompositor` vs `DomCompositor`). Pay the refactor cost when the third mode appears, not preemptively.

## 6. Emitter shape

```ts
type Light = {
  kind: 'point' | 'spot';
  x: number; y: number;
  color: RGB;
  intensity: number;   // 0..1, photosensitivity-aware
  radius: number;
  falloff: 'inverse-square' | 'linear' | 'smoothstep';
  flickerSeed?: number; // present → SeededRNG.fromTick(seed, tick) modulates intensity
};
```

Plain data, no methods. A `renderLight(ctx, light, tick)` pure function dispatches by kind. Same pattern as character pack renderers.

**Where do dynamic emitters live?** Two options:
- Field on the entity (`Carrot.lightIntensity`, decays in fixedUpdate)
- Separate pool managed by `LightSystem`

**Recommendation:** Field on the entity. Light is a property of the entity, snapshot-friendly for net replication, no separate lifecycle.

## 7. Static emitters — `ArenaPack.lights`

Add `lights: ReadonlyArray<Light>` to `ArenaPack`. Loaded at arena-load, merged with dynamic emitters from gameplay systems each frame.

## 8. Photosensitivity gating

Read `getPhotosensitivity()` once in `beginFrame` (not per-emitter). Apply as a global cap to each emitter's intensity: `intensity = photosensitivity ? Math.min(intensity, 0.7) : intensity`.

## 9. Net-mode visual consistency

`SeededRNG.fromTick(seed, tick)` keys on `state.tick`. Guests render between snapshots and may extrapolate; the tick the guest sees in renderFrame is the last-applied snapshot's tick, not the current frame's tick. Flicker on guest will lag ~2 ticks behind host.

**Recommendation:** Accept the lag for L2. If visible, pass an extrapolated tick into `beginFrame(theme, dayPhase, tick)` (the L2 reintroduction of the param).

## 10. AI ↔ light coupling

Bots reading light intensity (prefer lit areas, flee dark) is a gameplay-coupling we should explicitly rule out. The lighting program rule is "lighting is cosmetic." Locking it down avoids a creep into game-feel.

**Recommendation:** Document the rule in the L2 spec. No `awareness.ts` reads from lighting.

---

## Pre-L2 cleanup completed in the I-batch

These were applied as L1 polish before L2 starts (commit `<I-batch-sha>`):

- `SeededRNG` moved from `net/prng.ts` to `engine/seededRng.ts` (re-export shim preserved)
- `_tick` param dropped from `LightingPipeline.beginFrame` (will be re-added in L2 with a real contract)
- `wrapToUnit` applied to `effects.ts` sun + moon phase (parity with `sun.ts`)
- `_bgNightDirty` cleared inside `_bakeBgNightVariant` (single bake/frame robust regardless of which path triggered)
- `scatterFlocks: []` workaround consolidated into the `makeState` helper (recovered 39 perma-failing renderer tests)
- CharacterSelect lobby fallback documented at the construction site
- Reading order added to lighting program design doc; PERF-LIGHTING-L1.md sealed as superseded
- Decisions log appended to L1 spec
