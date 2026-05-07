# Lighting L1 — Foundation

**Date:** 2026-05-07
**Branch:** `feat/lighting-l1-foundation` (worktree at `.worktrees/lighting-l1`)
**Scope:** First milestone of the lighting program (`2026-05-07-lighting-program-design.md`). Stand up the deferred-lite pipeline as a parallel render path, prove it under real game load by migrating sun + ambient into it, ship the scaffolds (perf tier, accessibility, determinism, debug tooling) that L2–L5 rely on.
**Reference:** `lighting-reference.md` §21.1 (minimal pipeline), §21.2 (flicker — *not* M1 but informs determinism rule), §17.3 (sky-not-lit), §19.6/§19.7 (readability/HUD pitfalls), §17.15–17.17 (accessibility scaffolds).
**Architectural lesson chain:** `feat/rim-light` (per-frame baked into sprite cache → couldn't track sun, flipped with facing, applied at night) → `feat/character-outlines` (same root cause) → this milestone (per-frame, post-cache, screen-space).

## Goal

Build the deferred-lite lighting pipeline as a self-contained subsystem with a kill switch (`?lighting=off`). Migrate exactly two pieces of the existing renderer into it: the night ambient overlay and the directional sun glow (both currently inside `effects.ts > drawDayNightCycle`). Leave moon, stars, fireflies in their current code path — they're decorations, not light contributors, in M1.

The point of M1 is to prove the architecture under real load. A pipeline shell with no real light has no signal; a pipeline with one real directional contributor exercises ambient fill, additive accumulation, multiply composite, half-res buffer scaling, and the post-cache integration constraint.

## Definition of Done

1. `?lighting=off` URL param renders bit-identically to today's renderer (regression test in `e2e/` enforces).
2. Default (lighting on) renders through the new pipeline with sun + ambient as the only light contributions; moon, stars, fireflies still drawn the legacy way.
3. Frame budget unchanged or improved at perf-tier "Med" (default) on graveyard arena with 5 chars + 200 particles + bots. Measured via `npm run perf`, before-and-after numbers committed to `perf-runs/lighting-l1/`.
4. Debug overlay (`?debug=light`) toggles: `L` cycles composite stages, `[`/`]` step-through, `Shift+L` dumps state, `Ctrl+L` false-color overlay. Wired through `debugFlags.ts` runtime system.
5. Brightness slider, photosensitivity toggle, and lighting kill switch all exist as URL params + localStorage. Settings UI deferred to L5 polish.
6. Determinism rule codified in `lighting/determinism.ts` (`tickRng(seed, tick) → SeededRNG`) with unit tests. Doc in `engine/CLAUDE.md`.
7. Test suite green: unit tests for ambient/sun/perfTier/brightness/photosensitivity/determinism math, integration test for the pipeline composite, one Playwright screenshot regression at meadow-noon-fixed-seed, manual visual checklist completed.
8. PR sequence merged to `main` in order. Memory entry written documenting the architectural-lesson chain.

## Out of scope (deliberate)

Point lights, torches, lava emissive, shadows of any kind, bloom, vignette, color grading, settings-menu UI, in-game light editor, first-frame perf benchmark, mobile optimization beyond what falls out for free.

## Architecture

### Directory layout

```
src/engine/lighting/
  index.ts             # Barrel export + initLighting() called from main.tsx
  types.ts             # Light, LightKind, AmbientConfig, PerfTier, SunContribution
  pipeline.ts          # LightingPipeline class — owns scene/light buffers, beginFrame/composite
  ambient.ts           # Pure: themeToAmbient(theme, dayPhase, photosensitivity) → rgb
  sun.ts               # Pure: buildSunLight(theme, dayPhase, photosensitivity) → SunContribution | null
  perfTier.ts          # PerfTier enum + tierFromUrl/setTier/subscribeTier (URL+localStorage)
  brightness.ts        # 0.5..1.5 multiplier, observer-pattern emitter
  photosensitivity.ts  # Boolean toggle, observer-pattern emitter
  determinism.ts       # tickRng(seed, tick): SeededRNG — every phased effect derives from this
  debugOverlay.ts      # Composite-stage toggle, step-through, false-color overlay
  __tests__/
    ambient.test.ts
    sun.test.ts
    pipeline.test.ts
    pipeline-integration.test.ts
    perfTier.test.ts
    brightness.test.ts
    photosensitivity.test.ts
    determinism.test.ts
```

### Public surface

```ts
class LightingPipeline {
  constructor(width: number, height: number);
  resize(w: number, h: number, scale: number): void;     // hooks renderScale changes
  beginFrame(theme: ThemeConfig, frameTime: number, tick: number): void;
  composite(targetCtx: CanvasRenderingContext2D, fgCanvas: HTMLCanvasElement): void;
  isEnabled(): boolean;  // false when ?lighting=off
}
```

L2+ adds `addPointLight(x, y, color, radius)` and friends. M1's pipeline accumulates only the sun directional contribution and the ambient floor.

### Composite point: FG-only multiply (option A)

Sky and background canvas are treated as self-lit (ref §17.3 variant 1). Light buffer multiplies the FG canvas only. The existing splat-driven background-redraw optimization survives untouched.

```
1. BG canvas — sky, hills, mountains, splat marks (unchanged, redrawn on splat only)
2. FG canvas — platforms, players, particles, hazards, weather, wildlife
3. Light buffer (½-res) — ambient + sun + (future) lights
4. Visible: drawImage(BG) + drawImage(FG × Light)
5. HUD on top (post-lighting, stays bright)
```

**Rejected:**
- **Unified scene canvas (option B):** Would lose the bg-redraw-on-splat optimization (real perf cost) and force the sky to either be drawn after multiply or matched-to-night ambient (fragile). Bigger refactor risk in M1 with no offsetting benefit.
- **Per-layer composite (option C):** Two composite paths to maintain. Probably over-engineered for M1; can be added in L4 if color-grading needs it.

### Integration ordering inside `renderFrame`

```
renderFrame(state, arena, particles, cosmeticLead) {
  ┌─ existing ────────────────────────────────────┐
  │ 0. lighting.beginFrame(theme, frameTime, tick)│  ← NEW (called early so light buffer is
  │                                                │     ready when we composite at step 11)
  │ 1. Clear fgCtx                                │
  │ 2. hitstop zoom + screen shake transforms     │
  │ 3. drawAnimatedBackground (sky, aurora, etc.) │
  │ 4. clouds, weather, wildlife                  │
  │ 5. hazard zones, effect zones                 │
  │ 6. blit _fgNatureCache (static decoration)    │
  │ 7. dynamic entities: platforms, players,      │
  │    particles, gibs, springs, thorns, ghosts   │
  │ 8. drawDayNightCycle (sun glow, NIGHT OVERLAY │
  │    rect — both REMOVED in M1; moon/stars/     │
  │    fireflies stay)                            │
  │ 9. drawSceneTint (theme post-tint, untouched) │
  └───────────────────────────────────────────────┘
  ┌─ NEW in M1 ──────────────────────────────────────────┐
  │ 10. lighting.composite(targetCtx, fg)                │
  │ 11. brightness pass (single fillRect, alpha-tinted)  │
  └──────────────────────────────────────────────────────┘
  ┌─ existing ────────────────────────────────────┐
  │ 12. ctx.restore() (closes hitstop/shake xform)│
  │ 13. HUD blit (kill feed, scores, countdown)   │
  │ 14. debug overlays (nav, net, fps, +light)    │
  └───────────────────────────────────────────────┘
}
```

Composite happens **inside** the hitstop/shake transform so lights ride the screen shake. HUD and debug overlays draw **outside** the transform after lighting — they remain crisp.

### Sun + ambient math model

**Ambient** (`ambient.ts`):
```ts
themeToAmbient(theme: ThemeConfig, dayPhase: number, photosensitivity: boolean): RGB
```
Pure function. Filled into the light buffer at `beginFrame` (single `fillRect` with `source-over`). Driven by `theme.dayNight` config + current `dayPhase`. At noon: warm-white (~`rgb(245, 240, 225)`) — multiplies to ~no-op, world looks normal. At midnight: cool blue floor (~`rgb(60, 70, 110)`). Smooth lerp via cosine curve, identical to today's `nightIntensity` math.

When `theme.dayNight.enabled === false` (volcano, space_station, etc.), ambient is a fixed per-arena value with zero phase animation — same gating rule as today's celestial check.

When `photosensitivity === true`, ambient never crosses below `rgb(120, 130, 160)` — midnight is dimmer than normal but never deep blue.

Pure-black ambient is forbidden (ref §19.3 — pure black shadows look dead).

**Directional sun** (`sun.ts`):
```ts
buildSunLight(theme: ThemeConfig, dayPhase: number, photosensitivity: boolean): SunContribution | null
```
Returns `null` when sun is below horizon (`nightIntensity > 0.7`). Otherwise returns `{ angle, color, intensity }`.

Applied as a low-frequency gradient additively (`globalCompositeOperation = 'lighter'`) onto the light buffer right after the ambient fill. Sun is a *directional* light — fills the buffer with a screen-space gradient from the sun's screen direction, not a point light.

Color progression follows §5.4: sunrise/sunset = warm gold (`rgb(255, 180, 110)`), noon = neutral white (`rgb(255, 250, 230)`). Intensity peaks at `sunPhase = 0.25` (noon), tapers to 0 at horizon.

Sun position is **screen-space**, not world-space. Carrot Royale has no camera follow; the sun lives at a fixed screen y (~25% from top) with x sweeping right→top→left across `dayPhase` 0→0.5.

When `photosensitivity === true`, sun intensity is capped at 70% of normal.

### Perf tiers

`PerfTier = 'low' | 'med' | 'high'`. URL param `?perfTier=low|med|high`, localStorage key `carrotroyale_perf_tier`, observer-pattern emitter so the pipeline rebuilds buffers on tier change (same shape as the shelved `rimLight.ts` emitter — proven pattern, reused).

M1 implements only **Med**:

| Tier | M1 behavior | L2+ extensions |
|---|---|---|
| `low` | Falls through to Med. `// TODO L1.x` log marks the divergence point. | Light buffer at 0.25× scale or off entirely; no bloom; no shadows. |
| `med` (default) | Half-res light buffer (0.5×), ambient + sun, full composite. | Add point lights, blob shadows, threshold bloom. |
| `high` | Falls through to Med. Same TODO marker. | Full-res light buffer; per-light shadows; god rays; heat distortion. |

Auto-detection (first-frame benchmark, ref §17.23) is **not in M1**.

### Accessibility scaffolds

All three are URL param + localStorage with no UI in M1. UI lives in L5.

| Toggle | URL param | Storage key | M1 behavior |
|---|---|---|---|
| Brightness | `?brightness=0.7` (range 0.5–1.5) | `carrotroyale_brightness` | Final composite multiplier (step 11 in renderFrame). Single `fillRect` with `rgba(0,0,0,1-brightness)` for darken or `lighter` blend with `rgba(255,255,255,brightness-1)` for brighten. Skipped when slider = 1.0. |
| Photosensitivity | `?photosensitivity=on` | `carrotroyale_photosensitivity` | Caps ambient floor and sun intensity. L2+ flicker reads the same flag. |
| Lighting kill switch | `?lighting=off` | `carrotroyale_lighting_off` | Bit-identical fallback to today's renderer. Pipeline `isEnabled()` returns false; integration call is no-op. |

All three follow the observer-pattern + `safeStorage` + `useSyncExternalStore`-ready shape established by `perfFlags.ts` and `characters/preferences.ts`.

### Determinism rule

`lighting/determinism.ts` exports `tickRng(seed: number, tick: number): SeededRNG`. M1 doesn't use it directly (sun + ambient have no random component) but the helper exists with unit tests, and a doc comment in the file plus a one-line note in `engine/CLAUDE.md` makes the rule discoverable for L2:

> Any phased lighting effect (flicker, twinkle, pulse) MUST derive its phase from `tickRng(seed, state.tick)`. Never `Math.random()`, never `performance.now()`. Reason: host-authoritative netcode allows cosmetic divergence in principle, but consistent appearance across host/guest is a quality bar for player-visible lighting.

### Debug tooling

`?debug=light` URL param. Backtick handler integrates with the existing `GameLoop` debug cycle. Wired through `debugFlags.ts` runtime toggles (per `engine/CLAUDE.md` convention — use `setDebugFlag('light', ...)` for new runtime UI).

| Key | Effect |
|---|---|
| `L` | Cycle composite ON → light-buffer-only → scene-only → ambient-only → composite ON |
| `[` `]` | Step backward/forward through composite stages; freezes other rendering |
| `Shift+L` | Dump current ambient rgb + sun `{angle, color, intensity}` to console (one-shot) |
| `Ctrl+L` | Toggle gridded false-color overlay on light buffer (intensity bands) |

The fps overlay (existing) gains a lighting row showing buffer dims, ambient rgb, and sun-contribution presence.

## File-size estimate

| File | LoC est | Notes |
|---|---|---|
| `lighting/pipeline.ts` | ~180 | Class + buffer mgmt + composite |
| `lighting/ambient.ts` | ~50 | Pure function |
| `lighting/sun.ts` | ~60 | Pure function |
| `lighting/perfTier.ts` | ~70 | Emitter + URL/storage |
| `lighting/brightness.ts` | ~60 | Same shape |
| `lighting/photosensitivity.ts` | ~50 | Same shape |
| `lighting/determinism.ts` | ~40 | Helper + types |
| `lighting/debugOverlay.ts` | ~80 | Toggles + overlay paint |
| `lighting/types.ts` | ~50 | Interfaces |
| `lighting/index.ts` | ~20 | Barrel + initLighting() |
| **Total source** | **~660** | + ~400 LoC of tests |

Fits the codebase's existing module sizing (`audio/` ~1050 LoC, arena packs 200–800 each).

## Test strategy

### Unit (Vitest)

| File | Asserts |
|---|---|
| `ambient.test.ts` | rgb at noon/dawn/midnight; `dayNight.enabled === false` returns fixed; photosensitivity floor; output in [0,255] across full `dayPhase` sweep |
| `sun.test.ts` | null below horizon; angle at sunrise (right) / noon (top) / sunset (left); color at horizon (warm) vs noon (neutral); intensity peaks at noon; photosensitivity caps at 70% |
| `pipeline.test.ts` | beginFrame fills ambient correctly; composite produces expected pixel against a fixed scene fixture; buffer resize on `setRenderScale`; `isEnabled()` honors `?lighting=off` |
| `perfTier.test.ts` | Default = 'med'; URL wins over storage; storage wins over default; subscribers fire on change |
| `brightness.test.ts` | Default = 1.0; clamped to [0.5, 1.5]; emitter pattern |
| `photosensitivity.test.ts` | Default = false; subscribers fire |
| `determinism.test.ts` | Same seed + same tick = same output; different ticks = different output; different seeds with same tick = different output |

### Integration

`pipeline-integration.test.ts` — constructs a real `LightingPipeline`, runs a few frames against a synthesized minimal scene canvas, asserts composite output isn't mud (sample pixels at known platform/sky/character positions and verify expected luminance band).

### Visual regression (Playwright)

One screenshot test in M1: `e2e/lighting-baseline.spec.ts`. Auto-starts a match at meadow-noon with a fixed seed, waits for `phase === 'playing'`, screenshots after 30 stable frames. Compares against committed baseline PNG with 1.5% pixel diff threshold (absorbs anti-aliasing variance). Baseline ships with PR 2.

Why only one: lighting work is iterative; aggressive regression suites get stale fast. Cross-OS pixel diffs are real. The point is "did the composite path break", not "did pixels move 0.3%". L2+ adds coverage as features stabilize.

### Manual checklist (in PR description)

- [ ] `?lighting=off` looks identical to current main (A/B split-screen)
- [ ] Default looks subtly nicer at noon, identical at midnight
- [ ] Day → night transition smooth, no banding/popping
- [ ] All 11 arenas: spot-check `dayPhase=0.0` and `dayPhase=0.5`
- [ ] `dayNight.enabled === false` arenas (volcano, space_station, …) unchanged
- [ ] Hitstop zoom + screen shake still feel right (lighting rides the transform)
- [ ] HUD always crisp, never tinted
- [ ] `?brightness=0.5` darkens visibly; `?brightness=1.5` brightens; doesn't blow out
- [ ] `?photosensitivity=on` keeps midnight readable
- [ ] Debug overlays (`?debug=light`) all toggle correctly
- [ ] 5-player stress arena (graveyard, 5 chars, hard bots) maintains ≥58fps on dev laptop

### Performance gate

`npm run perf -- --arena=meadow` and `--arena=graveyard` baseline numbers captured *before* M1 work begins (saved to `perf-runs/lighting-pre-M1/`). After M1, same runs must show:
- Meadow `renderFrame` p95 ≤ pre-M1 + 0.3ms
- Graveyard same
- No new GC pauses (any frame > 32ms is a fail)

Per existing perf memory: deltas <0.3ms are noise, ≥0.3ms are signal. M1 should be 0 to slightly negative — lighting *replaces* the existing alpha-rect overlay, which is itself a full-screen pass; net wash or small win expected.

If M1 regresses: first knob is the half-res buffer scale (drop to 0.4× on Med); second knob is skipping the brightness pass when slider = 1.0.

## Worktree, branch, PR sequencing

### Worktree

`P:/projects/rabbits/.worktrees/lighting-l1`. Branch: `feat/lighting-l1-foundation`. Created from latest `main` at start.

### Three-PR sequence

**PR 1 — Integration stub** (~40 LoC + 1 test). Lands on `main` first, before deep M1 work begins.
- Empty `LightingPipeline` skeleton (no-op `beginFrame` and `composite`)
- The single composite-call insertion in `renderer.ts` wrapped in `if (lighting.isEnabled())` (returns false in this PR — bit-identical)
- `?lighting=off` URL param wired through `lighting/index.ts`
- One smoke test confirming renderer still produces identical output

This PR is the drift insurance against the (separately-brainstormed) FoliageSystem refactor. After it lands, both worktrees rebase onto a `main` that already has the integration point.

**PR 2 — Pipeline + ambient + sun migration** (~500 LoC + ~300 test LoC). Bulk of M1 on the `feat/lighting-l1-foundation` branch.
- Real `LightingPipeline` implementation (scene/light buffers, half-res, composite math)
- `ambient.ts`, `sun.ts`, `types.ts`, `index.ts`
- `perfTier.ts`, `brightness.ts`, `photosensitivity.ts`, `determinism.ts`
- Removal of night-overlay rect + sun glow from `effects.ts > drawDayNightCycle`
- Unit + integration tests
- Playwright screenshot baseline
- `engine/CLAUDE.md` update with lighting subsystem rules

Ships behind `?lighting=off` as the safety valve.

**PR 3 — Debug tooling + completed checklist** (~120 LoC).
- `debugOverlay.ts` with `L` / `[` / `]` / `Shift+L` / `Ctrl+L`
- Wired through `debugFlags.ts` runtime system
- PR description carries completed manual checklist + perf-run before/after

May be folded into PR 2 if diff stays small; decide at PR-time.

### Definition of merged

`feat/lighting-l1-foundation` merges to `main` when:
- All three PRs reviewed and squash-merged in order
- CI green (typecheck, unit, integration, e2e, screenshot test)
- Manual checklist completed in PR 2 description
- Perf gate met (perf-runs/ comparison committed)
- One `?lighting=off` regression e2e proves bit-identical fallback

### After M1 merges

Worktree archived (`.worktrees/lighting-l1` removed). Branch retained on remote for history. Memory entry written (`project_lighting_program.md`) with the architectural-lesson chain. L2's brainstorm starts in a fresh worktree.

### Commit policy

Per existing `feedback_commit_regularly.md`: commit + push frequently. Branch lives on remote from first commit; no part of L1 is risky enough to hide locally.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Multiply composite mud-darkens the world | Ambient floor never goes below `rgb(60, 70, 110)`; `dayNight.enabled === false` arenas use fixed mid-bright ambient; manual checklist asserts visual quality across all 11 arenas |
| Perf regression from extra full-screen passes | Half-res buffer (¼ pixels for light); skip brightness pass when slider = 1.0; baked benchmark gate (perf-runs/) |
| Drift conflict with FoliageSystem worktree | PR 1 (integration stub) lands first — both worktrees rebase from a `main` that has the hook. M1 itself touches only `effects.ts > drawDayNightCycle` and the new `lighting/` directory |
| Browser-specific composite behavior (ref §19.20, §19.10) | Integration test asserts pixel values; manual checklist runs in 2+ browsers; observable pre/post-M1 in CI |
| Window resize / renderScale changes break buffers (ref §19.12) | `pipeline.resize(w, h, scale)` re-creates buffers; covered in `pipeline.test.ts` |
| Tab going inactive, dt explosion (ref §19.13) | Lighting is per-frame and stateless — no accumulators. Existing dt clamp in `GameLoop` already handles this; no new exposure |

## Open decisions deferred to L2 brainstorm

- Per-arena `lights:` field shape — flat config array, or driven by FoliageSystem entities?
- Falloff library: how many curves to ship? §4.2 lists 5+; pick a starter set during L2 brainstorm.
- Light cookie / animated light textures (§3.9) — yes/no for L2.

## Acceptance summary (one paragraph)

When M1 is merged, the codebase has a real Canvas-2D deferred-lite lighting pipeline running on every frame for every arena, gated by a `?lighting=off` kill switch and a `Med` perf tier. Sun and ambient are the first proof-of-load contributions; moon, stars, fireflies stay legacy. Debug tooling lets us inspect every stage of the composite. Three accessibility toggles ship as URL+localStorage. The determinism rule is codified for L2's flicker work. The PR sequence keeps `renderer.ts` drift surface to a single-line composite-call insertion that lands first as an integration stub. L2 picks up against a stable, perf-gated foundation.
