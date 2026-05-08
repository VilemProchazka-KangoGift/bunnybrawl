# L2 Foundation — Light catalog & per-arena emitters

**Date:** 2026-05-07
**Status:** Spec. Awaiting plan + execution.
**Branch:** `feat/lighting-l2-emitters` (off main `9c5a57f` post-L1 merge).
**Predecessor:** `2026-05-07-lighting-l1-foundation-design.md` + decisions log.
**Brainstorm input:** `2026-05-07-lighting-l2-brainstorm-prep.md` (10 deferred questions; resolutions captured at end of this doc).

## Goal

Plug per-emitter lights into the L1 foundation so arenas can show torches / lava emissive / fireflies / carrot pickup glow / per-player aura, with **best-of-both-worlds compositing** (screen-blend lights that punch through the L1 multiply night-tint while staying compositor-cheap).

L2 ships:

- A `Light` data type + per-arena static emitter list (`ArenaPack.lights`)
- An `EmitterPipeline` parallel to `LightingPipeline`, owning per-frame dynamic emitters
- Two compositing modes behind `?lmode=combined|split` for an empirical bakeoff (mirrors L1's 7-mode A/B test methodology)
- One real test scene (castle with 5 torches + per-player aura) sufficient to drive the bakeoff
- After bakeoff: the rest of the L2 catalog (carrot glow, spawn pillars, lava emissive, firefly lights, per-player aura with critical-moment bump)

L2 does **not** ship UI for emitter tuning — emitters live in arena pack files and are tuned via code.

## Architecture

### DOM compositor stack (post-L2)

```
bg-canvas       (z=1)  static day BG
bg-night-canvas (z=2)  baked night BG, opacity = bgNightOpacity
fg-canvas       (z=3)  players, particles, FG nature
fg-night-tint   (z=4)  multiply, opacity = fgTintOpacity
[light layer(s)] (z=5+) screen, opacity = bgNightOpacity   ← NEW in L2
hud-canvas      (z=last)  HUD
```

The light layer(s) sit ABOVE `fg-night-tint` so additive light contributions punch through the multiply darkening. `mix-blend-mode: screen` is perceptually additive for dark base pixels (the only time torches matter visually) and a near-no-op on bright pixels — same trick that made L1's cross-fade cheap.

The light layer's opacity is driven by `bgNightOpacity` so torches fade in with night and fully disappear during the day (browser compositor skips zero-opacity layers).

### Two compositing modes (bakeoff)

**Mode A — combined (`?lmode=combined`):** one DOM sibling `lightCanvas` at z=5.

Per frame on `lightCanvas`:
1. `clearRect`
2. `drawImage(staticLightCache)` — one blit (cache built at arena-load)
3. For each dynamic emitter: `lightStamp(ctx, light, tick)` with `'lighter'` blend
4. For each static torch: tiny additive flicker delta at known position (deterministic via `SeededRNG.fromTick`)

**Mode B — split (`?lmode=split`):** two DOM siblings: `lightStaticCanvas` (z=5) + `lightDynamicCanvas` (z=6).

- Static canvas built once at arena-load, never touched per-frame (browser compositor caches the rasterization)
- Dynamic canvas: `clearRect` + dynamic stamps + flicker deltas

Mode A wins on simplicity + GPU memory (~15MB vs ~30MB at 2×DPR). Mode B wins on per-frame work (one fewer `drawImage`) at the cost of an extra compositor layer. Visuals are identical (same screen-blend math, same final pixels). Empirical bakeoff resolves which is faster on real hardware with a real scene.

### Class topology (resolves L2-prep Q2)

```
Lighting (orchestrator)
  ├─ ambient: AmbientPipeline    ← renamed from L1's LightingPipeline
  └─ emitters: EmitterPipeline   ← new in L2
```

`Renderer` holds `this.lighting` (orchestrator); call sites become `this.lighting.ambient.beginFrame(...)` and `this.lighting.emitters.beginFrame(...)`. Composition order in `renderFrame` becomes:

```
ambient.beginFrame(theme, dayPhase)
emitters.beginFrame(state.tick, arena.lights, dynamicEmitters)
[bake drain → drive bgNight opacity]
[bg → players → fg → reactive → ambient.composite (source-over fallback)]
emitters.composite(lightCtx)   ← writes to lightCanvas, not fg
[brightness pass → HUD]
```

`ambient.composite()` stays the source-over fillRect fallback for lobby/tests. `emitters.composite()` is the new per-frame stamp pass on the light canvas.

The orchestrator class is thin (~30 LoC) — just holds the two pipelines and exposes `beginFrame(theme, dayPhase, tick, lights)` so the renderer doesn't manage two timing surfaces.

### Light type (resolves L2-prep Q6)

```ts
// src/engine/lighting/types.ts
export type LightKind = 'point' | 'spot';
export type Falloff = 'inverse-square' | 'linear' | 'smoothstep';

export interface Light {
  kind: LightKind;
  x: number;
  y: number;
  color: RGB;
  intensity: number;   // 0..1 — photosensitivity-aware (capped to 0.7 if flag set)
  radius: number;      // px in logical 1280×720 space
  falloff: Falloff;
  // Spot-only:
  direction?: number;  // radians; 0 = right, π/2 = down
  cone?: number;       // radians; full angular width
  // Determinism:
  flickerSeed?: number;     // present → SeededRNG.fromTick(seed, tick) modulates intensity
  flickerAmplitude?: number; // 0..1 — peak deviation from base intensity
}
```

Plain data, no methods. A free function `lightStamp(ctx, light, tick)` dispatches by `kind` and writes one fillRect/arc/path with `'lighter'` blend.

**Where dynamic emitters live (resolves L2-prep Q6):** field on the entity. `Carrot.lightIntensity` decays in fixedUpdate; `Player.auraIntensity` reflects critical-moment state. The renderer enumerates entities each frame and pushes a synthesized `Light` into the emitter pipeline's per-frame buffer. Snapshot-friendly for net replication; no separate lifecycle to manage.

**Static emitters (resolves L2-prep Q7):** `ArenaPack.lights: ReadonlyArray<Light>` declared in arena pack files. Loaded at arena-load, baked into the static cache.

### Determinism (cross-pillar rule)

All flicker/pulse phases derive from `SeededRNG.fromTick(emitterSeed, state.tick)`. Per-emitter `flickerSeed` keys (e.g. hash of arena-relative x/y) so co-located torches don't pulse in sync.

Reads `state.tick` from the snapshot — guests will lag ~2 ticks behind host (resolved L2-prep Q9 as deferred-acceptable; revisit if visible).

### Photosensitivity (resolves L2-prep Q8)

`getPhotosensitivity()` read **once per frame** in `EmitterPipeline.beginFrame`. Applied as a global cap to every emitter's intensity:

```ts
const cap = photosensitivity ? 0.7 : 1.0;
for (const light of lights) {
  effective.intensity = Math.min(light.intensity, cap);
}
```

Same 0.7 ceiling as L1's sun cap — keeps the contract symmetric.

### `hasDomDarkening` strategy (defers L2-prep Q5)

L1's boolean stays for now. Replace with a `Compositor` strategy ONLY when L2's third state appears (`perfTier='low'` → emitters disabled but ambient cross-fade still active). Premature otherwise.

### AI ↔ light coupling (resolves L2-prep Q10)

**Hard rule documented here:** AI does NOT read light contributions. Lighting is cosmetic. `awareness.ts` makes no `lighting.*` reads. Any future "bots prefer lit areas" feature requires lifting it out of the lighting subsystem and into a separate `awareness/preferLit` pillar that doesn't depend on the renderer.

## Phased rollout

### Phase 0 — Renderer constructor → options bag

Single-PR refactor. Pattern:

```ts
new Renderer({
  bgCanvas, fgCanvas, hudCanvas?,
  bgNightCanvas?, fgNightTint?,
  lightCanvas?, lightStaticCanvas?, lightDynamicCanvas?,  // L2 additions
  theme, mirrored?,
});
```

Touches every test setup once; subsequent L2 PRs add one field instead of one positional arg. Land before any L2 emitter work.

### Phase 1 — L2 scaffold + bakeoff infrastructure

- `src/engine/lighting/types.ts` — add `Light`, `LightKind`, `Falloff` types
- `src/engine/lighting/emitter.ts` — `EmitterPipeline` class
- `src/engine/lighting/lightStamp.ts` — pure `lightStamp(ctx, light, tick)` function (radial gradient + `'lighter'` blend)
- `src/engine/lighting/orchestrator.ts` — `Lighting` class holding `ambient` + `emitters`
- `src/engine/lighting/pipeline.ts` → rename class to `AmbientPipeline` (re-export `LightingPipeline` as alias for back-compat one cycle, then drop)
- DOM siblings in `Match.tsx`: `lightCanvasRef` (combined) + `lightStaticCanvasRef` + `lightDynamicCanvasRef` (split). Wire all three; mode picks which set the renderer uses.
- `?lmode=combined|split` URL switch (default `combined`)
- `mix-blend-mode: screen` CSS on light canvas(es), `will-change: opacity`
- Tests: orchestrator wiring, kill-switch parity (`?lighting=off` zeros emitter pipeline too), photosensitivity cap

### Phase 2 — Graveyard test scene

- Add `lights: ReadonlyArray<Light>` to `castle.ts` arena pack — 5 torches at the existing `TORCH_X` positions (flame Y 580), warm-orange `{r:255, g:150, b:60}`, `intensity: 0.8`, `radius: 80`, `falloff: 'inverse-square'`, `flickerSeed: i+1` per torch, `flickerAmplitude: 0.1` (matches existing `fastSin × 0.05` ±5% modulation in `drawAnimatedBackground`)
- Replace the existing 2D torch halo in `castle.drawAnimatedBackground` — the alpha-modulated circles get crushed by the fg-night-tint multiply at midnight, while real `Light` emitters punch through via the screen-blend layer. Keep the ember sparks (those still belong on FG ctx).
- Static cache: `OffscreenCanvas` at full or half-res, baked at arena-load
- Per-player aura: `Player.auraIntensity` field, baseline 0.3, ramps to 0.7 on critical moments (low health analog — revisit specifics in Phase 6). Renderer synthesizes a `Light` per active player each frame.
- Smoke test: load castle at midnight, verify 5 torches visible + 1 aura per player, verify photosensitivity caps both, verify `?lighting=off` produces clean downgrade.

### Phase 3 — Bakeoff + decision

- `npm run perf --arena=castle` × `?lmode=combined` × 5 runs
- `npm run perf --arena=castle` × `?lmode=split` × 5 runs
- Save reports to `perf-runs/l2-emitter-comparison/{combined,split}/` (mirroring L1's `lmode-comparison/` layout)
- Comparison table in `perf-runs/l2-emitter-comparison/REPORT.md`: p50/p95/p99 frame, GPU memory, compositor layer count
- Pick winner. Rip out loser path. Single commit.

### Phase 4+ (post-bakeoff sketches; firmed up after Phase 3)

- **Phase 4** — Carrot glow (dynamic emitter on `Carrot` entity, decays after pickup); spawn pillars (static emitters around spawn points, fade with respawn invincibility timer).
- **Phase 5** — Lava emissive (volcano arena: bottom-aligned warm point lights along the lava surface, intensity coupled to lava activity); firefly lights (treetops arena: per-particle dim point lights synthesized from existing firefly particles).
- **Phase 6** — Points-leader aura: gold-tinted, brighter, wider than the baseline aura. Visual "who's winning" cue at a glance. (Replaced the originally planned low-health critical-moment bump — the game has no health stat, and "who to chase next" is a more useful read for couch-co-op than "who's vulnerable.")
- **Phase 7** — Pre-L3 cleanup; CLAUDE.md updates documenting L2's lessons; L3 brainstorm prep.

## Resolved questions from L2 brainstorm prep

| Q | Resolution |
|---|---|
| Q1 — Light buffer revival? | Hybrid: per-arena static cache + per-frame dynamic stamps, both into a screen-blend DOM sibling. Bakeoff between combined and split layouts in Phase 3. |
| Q2 — Class topology | Split: `AmbientPipeline` + `EmitterPipeline` under thin `Lighting` orchestrator. |
| Q3 — Ambient access for multiple consumers | Public `getAmbient(): Readonly<RGB>` accessor on `AmbientPipeline`, returning a per-frame stable reference. Internally still scratch — don't mutate after `beginFrame`. Add when a real second consumer appears (lava emissive in Phase 5). |
| Q4 — Constructor refactor | Phase 0. |
| Q5 — Compositor strategy | Defer until perfTier=low introduces the third state. Boolean stays for now. |
| Q6 — Emitter shape + ownership | `Light` plain-data type; field on entity for dynamic, `ArenaPack.lights` for static. |
| Q7 — Static emitters | `ArenaPack.lights` field. |
| Q8 — Photosensitivity | Read once per frame in `EmitterPipeline.beginFrame`, applied as global intensity cap (0.7). |
| Q9 — Net-mode visual consistency | Accept ~2-tick flicker lag on guests for L2. Revisit if visible. |
| Q10 — AI ↔ light coupling | Hard ruled out. Documented in this spec + program design. |

## Test plan

- `tsc -b` clean throughout each phase
- New unit tests:
  - `EmitterPipeline.beginFrame` allocation-free with N=20 emitters
  - `lightStamp` produces expected coverage for each falloff type
  - Photosensitivity cap applies symmetrically to all emitters
  - `flickerSeed` produces stable per-tick intensity (deterministic across host/guest)
  - `?lighting=off` zeros emitter pipeline (extends L1's regression test)
- New E2E:
  - `lighting-l2-graveyard.spec.ts` — load castle at midnight, screenshot baseline, verify torches present, verify `?lmode=combined` and `?lmode=split` produce matching pixels (visual parity gate for the bakeoff)
- Renderer test setup: mock `lightCanvas` + `lightStaticCanvas` + `lightDynamicCanvas` refs (most tests pass `null` and stay on the L1 fallback path)

## Open follow-ups (not blocking L2 ship)

- L3 will read sun direction. The deleted `sun.ts` will be re-added in L3 with the real shape (not the L1 placeholder).
- L4 will add per-arena `bgKeyframes` for hue-shifted nights — same `bgNightCanvas` mechanism, multiple keyframes lerped instead of one uniform tint.
- L5 includes settings UI for accessibility toggles. Until then, L2 stays URL+localStorage like L1.
