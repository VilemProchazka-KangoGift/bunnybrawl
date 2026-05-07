# Lighting Program — Pillar Decomposition

**Date:** 2026-05-07
**Scope:** Top-level program doc for the lighting system. Decomposes the work into 5 milestones (L1–L5), each landing independently with its own brainstorm → spec → plan → implement cycle.
**Mode:** Hobby/learning sandbox. Branches can be experiments. Cherry-pick survivors.
**Reference:** `lighting-reference.md` (2487-line design doc, used as inspiration not instruction).

## Why this is a program, not a feature

A previous prototype on `feat/rim-light` shipped a single-effect rim-light experiment. Its post-mortem (`docs/rim-light-NEXT_STEPS.md`) identified one architectural lesson: **lighting is a per-frame, screen-space effect; it must NOT be baked into the sprite cache**. The same lesson applied to outlines later. Both were single-shot experiments without a pipeline; both ran into the same wall.

This program builds a real pipeline first, then plugs features in. The doc spans 21 sections covering pipeline, light catalog, falloff math, sun/sky, torches, fireflies, lava, shadows (geometric, soft, blob, drop), bloom, vignette, color grading, heat distortion, god rays, caustics, debug tooling, and dozens of party-game–specific tricks. None of that fits a single design.

## Pillar decomposition

### L1 — Foundation
**Pipeline + tooling + accessibility scaffolds.** Deferred-lite pipeline (scene buffer + light buffer + multiply composite, ref §21.1). Half-res light buffer integrated with `renderScale`. One light type only: the directional sun (replaces ambient overlay + sun glow in `drawDayNightCycle`). Tooling toggles. Perf-tier enum (Low/Med/High) wired but only Med implemented. Accessibility scaffolds day 1: photosensitivity toggle, brightness slider, `?lighting=off` kill switch. Determinism rule documented.

Blocks: L2, L3, L4, L5. **Spec: `2026-05-07-lighting-l1-foundation-design.md`** (deep-dive, brainstormed alongside this doc).

### L2 — Light catalog & per-arena emitters
Point/spot/area light primitives (ref §3). Falloff library (ref §4). Then arena-specific emitters: lava emissive on volcano (ref §8), torches in graveyard/castle (ref §6) with deterministic flicker (ref §6.2), firefly point-lights integrated with existing firefly particles (ref §7), carrot pickup glow (ref §17.5), spawn pillars (ref §17.7), per-player aura with critical-moment bump (ref §17.4 + §17.6). Arena packs gain a `lights:` field.

Boundary question deferred to L2 brainstorm: do FoliageSystem entities carry `light?: LightConfig` and self-register, or do arena packs declare lights independently? Picked once both systems are concrete.

Depends on: L1.

### L3 — Shadows (pragmatic hybrid §9.10)
Drop shadows under characters (ref §9.8) — already partly shipped on `feat/drop-shadows`, finish/integrate. Blob shadows under emissives (ref §9.9). Directional sun shadows from platform edges (ref §9.6) — orientation per platform, soft-blurred. No per-light point-shadow casting in this milestone (curiosity tier, deferred to L5). Self-shadow on character sprite (ref §9.11) optional via shading pass.

Depends on: L1. Parallel-able with L2.

### L4 — Atmosphere & post-processing
Bloom (ref §11.1) with threshold pre-pass (ref §11.2). Vignette (ref §11.3). Color grading per arena (ref §11.4) — read warm/cool tints from `ThemeConfig`. Underwater tint deepens (ref §11.13). Lightning flashes (ref §11.17) coupled to weather. Camera shake already exists; integrate with hit-flash brightness (ref §17.8). Frame composition (ref §11.18). Brightness/perf tier and photosensitivity toggle gate intensity.

Decision deferred to L4: does `theme.drawSceneTint` (current per-arena overlay) survive, or is it absorbed into color grading?

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

| Order | When |
|---|---|
| L1 | Now (this brainstorm). 3-PR sequence (integration stub → pipeline+sun → debug tooling). |
| L2 + L3 | After L1 merges. Parallel worktrees. L2 may depend on FoliageSystem boundary decision — coordinate. |
| L4 | After L2 + L3 stable. |
| L5 | Last. Includes the settings UI for accessibility toggles. |

Each pillar gets its own brainstorm session at the time it starts. This program doc is updated as pillars land — strikethroughs for completed items, adjustments for things learned.

## Out of scope (program-wide)

- Realistic lighting math (ref §19.1 — uncanny in 2D).
- Full per-pixel shaders. Canvas 2D only; no WebGL fallback path.
- Mobile-first. Mobile is supported but the lighting pipeline targets desktop perf budget; mobile drops to Low tier or `?lighting=off`.
- Lighting as a *gameplay* element (Don't Starve–style darkness-as-mechanic) — this was considered as a goal during brainstorming and rejected. Carrot Royale is a 5-player party game; readability beats vibes (ref §17.18, §19.6).

## Tracking

Pillars and their status are tracked in a future memory entry `project_lighting_program.md` (written when L1 starts). Each pillar's spec lives at `docs/superpowers/specs/2026-MM-DD-lighting-l<N>-<slug>-design.md`.
