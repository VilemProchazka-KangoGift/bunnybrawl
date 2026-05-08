# Lighting Program — Pillar Decomposition

**Date:** 2026-05-07
**Scope:** Top-level program doc for the lighting system. Decomposes the work into 5 milestones (L1–L5), each landing independently with its own brainstorm → spec → plan → implement cycle.
**Mode:** Hobby/learning sandbox. Branches can be experiments. Cherry-pick survivors.
**Reference:** `lighting-reference.md` (2487-line design doc, used as inspiration not instruction).

## Reading order (start here)

1. **This doc** — pillar decomposition, dependency graph, cross-pillar conventions.
2. **`engine/CLAUDE.md` "## Lighting" section** — what shipped in L1+L2, in primary voice.
3. **`docs/superpowers/specs/2026-05-07-lighting-l1-foundation-design.md`** — L1 design. Has an "Implementation drift" header explaining where it diverged from plan.
4. **`docs/superpowers/reviews/2026-05-07-lighting-l1-cross-fade-review.md`** — L1 post-implementation review with cross-cutting patterns.
5. **`perf-runs/lmode-comparison/REPORT.md`** — the L1 7-mode A/B test that picked the cross-fade architecture.
6. **`docs/superpowers/specs/2026-05-07-lighting-l2-emitters-design.md`** — L2 design (emitter pipeline, per-arena `lights` catalog, dynamic synthesis).
7. **`perf-runs/l2-emitter-comparison/REPORT.md`** — the L2 combined-vs-split bakeoff (wash; combined picked on simplicity tiebreaker).
8. **`docs/superpowers/reviews/2026-05-08-lighting-l2-emitters-review.md`** — L2 post-implementation review.
9. **`docs/superpowers/specs/2026-05-08-lighting-l3-brainstorm-prep.md`** — open questions for L3 (read before starting L3 brainstorm).

The plan doc (`plans/2026-05-07-lighting-l1-foundation.md`) is the original 2700-line TDD task list — historical reference, not a current source of truth. The PERF doc (`plans/PERF-LIGHTING-L1.md`) is **superseded** — it captures the failed deferred-lite pipeline's perf gate; the shipping perf is in `perf-runs/lmode-comparison/REPORT.md`.

## Why this is a program, not a feature

A previous prototype on `feat/rim-light` shipped a single-effect rim-light experiment. Its post-mortem (`docs/rim-light-NEXT_STEPS.md`) identified one architectural lesson: **lighting is a per-frame, screen-space effect; it must NOT be baked into the sprite cache**. The same lesson applied to outlines later. Both were single-shot experiments without a pipeline; both ran into the same wall.

This program builds a real pipeline first, then plugs features in. The doc spans 21 sections covering pipeline, light catalog, falloff math, sun/sky, torches, fireflies, lava, shadows (geometric, soft, blob, drop), bloom, vignette, color grading, heat distortion, god rays, caustics, debug tooling, and dozens of party-game–specific tricks. None of that fits a single design.

## Pillar decomposition

### L1 — Foundation
**Pipeline + tooling + accessibility scaffolds.** Deferred-lite pipeline (scene buffer + light buffer + multiply composite, ref §21.1). Half-res light buffer integrated with `renderScale`. One light type only: the directional sun (replaces ambient overlay + sun glow in `drawDayNightCycle`). Tooling toggles. Perf-tier enum (Low/Med/High) wired but only Med implemented. Accessibility scaffolds day 1: photosensitivity toggle, brightness slider, `?lighting=off` kill switch. Determinism rule documented.

Blocks: L2, L3, L4, L5. **Spec: `2026-05-07-lighting-l1-foundation-design.md`** (deep-dive, brainstormed alongside this doc).

### L2 — Light catalog & per-arena emitters ✓ SHIPPED (2026-05-08, branch `feat/lighting-l2-emitters`)
Point/spot light primitives via `Light` discriminated union (`PointLight | SpotLight`). Falloff library: inverse-square / linear / smoothstep. `EmitterPipeline` parallel to `AmbientPipeline` under thin `Lighting` orchestrator. Single screen-blend `lightCanvas` DOM sibling above fg-night-tint (the combined-vs-split bakeoff was a wash; combined picked on simplicity tiebreaker). Castle: 5 torch emitters at the existing `TORCH_X` positions with deterministic flicker. Volcano: 3 lava emissives at hazard zone centers. Treetops/any `dayNight.showFireflies` arena: 8 firefly emitters synthesized from `effects.ts:fireflyPosition` (visual draw + emitter share the drift formula). Per-player aura derived from `Player.x/y/character.color`. Spawn pillar: aura intensity + radius ramp during respawn invincibility. Carrot glow: subtle warm-orange so they stay visible at night. Points-leader aura: gold-tinted boost (replaced the originally-spec'd low-health bump — game has no health stat; "who to chase" is a more useful read). All deterministic via `SeededRNG.floatFromTick(seed, tick)` with `tick = floor(timeElapsed * 60)`. Boundary question (entity-self-registration vs arena-pack declaration) resolved as: **static** lights via `ArenaPack.lights`, **dynamic** lights synthesized inline from existing entity fields (no `Player`/`Carrot` schema change). 

Spec: `2026-05-07-lighting-l2-emitters-design.md`. Review: `2026-05-08-lighting-l2-emitters-review.md`. Bakeoff: `perf-runs/l2-emitter-comparison/REPORT.md`.

### L3 — Shadows (pragmatic hybrid §9.10)
Player drop shadows are already on main (`rendering/players.ts` cached ellipse with height-based scaling). L3 extends: blob shadows under arena emissives (ref §9.9), directional sun shadows from platform edges (ref §9.6) — orientation per platform via a restored `sun.ts > sunDirection(dayPhase)`, soft-blurred. Per-light point-shadow casting (ref §9.2) is curiosity tier, deferred to L5. Self-shadow on character sprite (ref §9.11) optional, deferred until base shadow types ship.

Depends on: L1. Was originally parallel-able with L2; L2 has now landed so L3 starts on top of L1+L2.

**Brainstorm prep: `2026-05-08-lighting-l3-brainstorm-prep.md`** (read before starting L3 brainstorm).

### L4 — Atmosphere & post-processing
Bloom (ref §11.1) with threshold pre-pass (ref §11.2). Vignette (ref §11.3). Color grading per arena (ref §11.4) — read warm/cool tints from `ThemeConfig`. Underwater tint deepens (ref §11.13). Lightning flashes (ref §11.17) coupled to weather. Camera shake already exists; integrate with hit-flash brightness (ref §17.8). Frame composition (ref §11.18). Brightness/perf tier and photosensitivity toggle gate intensity.

Decision deferred to L4: does `theme.drawSceneTint` (current per-arena overlay) survive, or is it absorbed into color grading?

**Cross-faded BG variants — color grading via CSS-composited keyframes** (added 2026-05-07 after L1 perf work surfaced the design):

L1 ships a CSS-composited cross-fade BG variant (a sibling `bgNightCanvas` with the day BG + uniform tint baked in, opacity-driven each frame) plus an `mix-blend-mode: multiply` fg-tint div for color-preserving sprite darkening. This is uniform across all arenas. It can't do hue-shifted nights (ref §5.4 — *"don't just dim. Hue-shift."*) — that's exactly what L4 adds: arenas opt in to per-arena keyframes via `ArenaPack.bgKeyframes`, the same `bgNightCanvas` mechanism just with multiple keyframes lerped instead of one uniform tint.

The perf-optimal way to implement that is **NOT** canvas `drawImage` cross-fade between offscreen-baked variants (~2ms per frame from extra full-canvas blits — paying full-canvas pixel cost per blit). It's **stacked DOM canvases with CSS `opacity`** for cross-fade:

1. On arena load, generate N keyframe BGs (e.g. `bgNoon`, `bgSunset`, `bgMidnight`, `bgSunrise`) into separate `<canvas>` DOM elements at the same z-position. Each pre-rendered with arena-specific color grading at that lighting state.
2. Each frame: figure out which two adjacent keyframes bracket the current `dayPhase`, set their `style.opacity` for the lerp factor. The other variants get `opacity: 0`.
3. Browser's compositor blends them as part of the existing layer-composition pass that runs every frame for bg+fg+hud anyway. **Marginal cost ≈ 0.1ms.**
4. The L1 tint pass on FG goes away (or stays at low alpha for slight sprite darkening on top of the lit BG).

Why CSS opacity beats canvas `drawImage` cross-fade:
- Canvas `drawImage` re-rasterizes each frame on the GPU, paying full-canvas pixel cost per blit
- CSS opacity on stacked layers is part of the work the browser compositor was already doing for layered DOM
- Adding extra layers is cheap; the compositor blends them in one pass

Storage cost: 4 keyframes × 11 arenas × backing-res (2560×1440 at hi-DPI) × 4 bytes ≈ ~640MB worst case. **Way too much for in-memory.** Mitigations:
- Generate keyframes lazily per-arena (only the current arena's variants in memory; ~58MB)
- Allow `bgKeyframes: 2` (just `day` + `night`, lerp between) for arenas where 4 frames is overkill
- Drop to logical-res (1280×720, 1/4 memory) and let CSS upscale via the existing GameScaler — the bilinear smoothing is fine for color-graded backgrounds
- Per-arena: arena pack opts in via `ArenaPack.bgKeyframes?: BgKeyframeMap` — arenas that don't opt in fall back to L1's tint

Sprites stay procedural — sprite cross-fade is impractical (cache explosion, every character pack would need lit-variant draw functions). Sprites either stay bright at night (acceptable for a party game per readability constraint) or get a low-alpha tint pass on top of the lit BG (the L1 mechanism, retained).

This becomes the L4 color-grading mechanism. Each arena's `bgKeyframes` IS its color grading curve.

Depends on: L1, L2.

### L5 — Exotic & gameplay coupling
Heat distortion above lava (ref §12). God rays through windows/canopies (ref §13). Caustics underwater (ref §11.14). Per-light point-shadow casting (ref §9.2 Catalin Zima) on Hard tier only. Event-chain lighting on near-victory (ref §17.25). Hit flashes on stomp (ref §17.9) tied to existing hitstop. Lit projectiles / trail lights (ref §17.20–21). Boss-scale lighting hooks for future (ref §17.24). Settings menu UI for brightness / photosensitivity / perf tier (the toggles are URL+localStorage from L1, the UI lands here). Decide what survives, prune the rest.

Depends on: L1, L2, L3, L4.

## Dependency graph

```
        L1 (Foundation)
        ├─→ L2 (Light catalog & emitters)
        ├─→ L3 (Shadows)
        │
        ├─→ L4 (Atmosphere & post)  ← depends on L1 + L2
        │
        └─→ L5 (Exotic & polish)    ← depends on L1+L2+L3+L4
```

L2 and L3 are parallel-able after L1 lands.

## Cross-pillar conventions

These rules apply to every pillar; they're set in L1 and inherited.

1. **Lighting is per-frame, screen-space, post–sprite-cache.** Never bake light contributions into a sprite cache, the foreground-nature cache, or any other cached canvas. Lessons from `feat/rim-light` and `feat/character-outlines`.
2. **Determinism via tick.** Any phased lighting effect (flicker, twinkle, pulse) MUST derive its phase from `tickRng(seed, state.tick)` (helper in `lighting/determinism.ts`). Never `Math.random()`, never `performance.now()`. Reason: host-authoritative netcode allows cosmetic divergence in principle, but consistent appearance across host/guest is a quality bar for player-visible lighting.
3. **HUD and debug overlays draw AFTER lighting composite.** Hard rule. Bloom on UI is eye cancer (ref §19.7).
4. **Photosensitivity toggle is read by every flicker/flash effect** (L2+). Gate amplitude on the global flag from day one of each new effect.
5. **`?lighting=off` is the safety valve**. Every pillar must produce bit-identical output (or a clearly-acceptable downgrade) when the toggle is set. Regression test in `e2e/` enforces it for L1; subsequent pillars add to the same suite.
6. **Perf-tier gating is the rule, not the exception.** Each new effect declares its minimum tier. Low tier should always be playable on a 5-year-old laptop; High tier can be aspirational.
7. **Every pillar ships a section addition to `engine/CLAUDE.md`** documenting its rules, gotchas, and architectural lessons.

## Sequencing

| Order | When | Status |
|---|---|---|
| L1 | 2026-05-07 | ✓ Shipped. Single PR after pivot from 3-PR plan to cross-fade architecture. |
| L2 | 2026-05-07 → 2026-05-08 | ✓ Shipped. Single PR (`feat/lighting-l2-emitters`, 14 commits across 7 phases). FoliageSystem boundary resolved as "static via `ArenaPack.lights`, dynamic via inline synthesis." |
| L3 | Next | Pre-brainstorm. See `2026-05-08-lighting-l3-brainstorm-prep.md`. |
| L4 | After L3 stable | Atmosphere & post-processing. |
| L5 | Last | Exotic + settings UI. |

Each pillar gets its own brainstorm session at the time it starts. This program doc is updated as pillars land — strikethroughs for completed items, adjustments for things learned.

## Out of scope (program-wide)

- Realistic lighting math (ref §19.1 — uncanny in 2D).
- Full per-pixel shaders. Canvas 2D only; no WebGL fallback path.
- Mobile-first. Mobile is supported but the lighting pipeline targets desktop perf budget; mobile drops to Low tier or `?lighting=off`.
- Lighting as a *gameplay* element (Don't Starve–style darkness-as-mechanic) — this was considered as a goal during brainstorming and rejected. Carrot Royale is a 5-player party game; readability beats vibes (ref §17.18, §19.6).

## Tracking

Pillars and their status are tracked in a future memory entry `project_lighting_program.md` (written when L1 starts). Each pillar's spec lives at `docs/superpowers/specs/2026-MM-DD-lighting-l<N>-<slug>-design.md`.
