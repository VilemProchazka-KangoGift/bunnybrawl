# Lighting L1 cross-fade — three-agent review findings

**Date**: 2026-05-07
**Scope**: commits `058b630..19bfc6f` on `feat/lighting-l1-foundation` (CSS-composited cross-fade BG + multiply fg-tint).
**Reviewers**: Code-reuse, code-quality, efficiency agents (parallel, fresh context each).

This doc preserves the cross-cutting findings since several patterns will recur as L2–L5 land. Each finding is tagged with the original severity and an outcome (`fixed` / `deferred` / `skipped`).

## Cross-cutting patterns to remember

These came up in multiple agents' reports and are likely to recur in lighting work:

1. **Quantize-and-write helper for style attributes**. Two near-identical 8-line blocks in `_driveBgNightOpacity` differing only by which ref/element. The pattern (round → compare with last → conditionally write) is a candidate for `setQuantizedOpacity(el, target, lastRef)` in a shared helper. L2's per-arena emitters and L4's per-keyframe opacity drives will hit this exact pattern. **→ fixed**

2. **Constants belong with their domain.** Magic numbers `0.7` (fg-tint multiplier), `rgba(20,24,48,0.55)` (bake tint), `rgba(80,100,160)` (multiply color) lived inline. These tie back to `MAX_TINT_ALPHA` / `TINT_COLOR` in `pipeline.ts`. Strings re-stringifying RGB values that already exist as objects is a code smell — derive from the source. **→ fixed**

3. **Comments with perf numbers rot.** Block comments saying "measured 1.6ms perf win at midnight, 5.7ms vs 7.3ms meadow" capture a moment in time and rot as the codebase evolves. Replace with WHY-only ("triggers Chromium GPU layer promotion → fg gets its own compositor layer") and let the perf-runs reports be the canonical source. **→ fixed**

4. **Constructor parameter sprawl.** `Renderer` constructor: 7 positional params (5 required + 2 optional pre-change) → 7 (5 + 4 optional with two trailing canvases) post-change. `GameLoop` got 2 new optional positional args after an existing optional `rng`, forcing `undefined, // rng` placeholders at call sites. Both are signaling that the next addition should refactor to an options object. **→ deferred** (broader test impact, the L2 light-catalog work will likely add another set of canvases — refactor at that boundary).

5. **House style for color literals.** CLAUDE.md notes "House style: emit parsed colors as `rgb(r,g,b)` strings." A `rgba(80,100,160,1)` (trailing `,1`) violates that. Use `rgb()` when alpha is 1. **→ fixed**

6. **Stale comments about call sites.** Renderer comments at `renderBackground` claim it fires on "splat marks / gib bakes mid-match." Those operations write to `bgCtx` directly without calling `renderBackground`. Bake frequency is correctly bounded to arena-load + render-scale change. **→ fixed** (stale comment removed; bake bounds remain correct).

7. **Mode-toggle boolean pattern.** `setBgNightWired(boolean)` is a one-shot capability flag set at construction. The codebase prefers (a) constructor-injected dependencies or (b) `subscribe*`/emitter pattern. Boolean toggle on a class is a third pattern, mildly inconsistent. **→ skipped** (not worth the churn for a single boolean; if a third mode appears, refactor then).

8. **Leaky abstraction (Renderer writing to React-owned DOM).** Renderer pokes `style.opacity` on a div passed in by React. Mild but real. Cleaner alternatives: callback `onLightingFrame(bgOp, fgOp)` that React owns, or a `LightingTargets` class wrapping the elements. **→ skipped** (overkill for two writes; documented boundary).

## Specific findings (raw, by file)

### `src/engine/renderer.ts`

- **MED**: `_driveBgNightOpacity` has duplicate quantize-and-write blocks. Extract helper. → **fixed** as `_setQuantizedOpacity(el, target, getLast, setLast)`.
- **MED**: `_bakeBgNightVariant` hardcodes `'rgba(20,24,48,0.55)'`, duplicating `MAX_TINT_ALPHA` + `TINT_COLOR` from pipeline. → **fixed** by deriving the bake string from those constants.
- **MED**: Magic `0.7` fg-tint multiplier. → **fixed** as `FG_TINT_INTENSITY_MUL` in pipeline.ts.
- **MED**: Verbose 5-line comment block on bgNightCanvas wiring restating pipeline.ts contract. → **fixed** (compressed to 1 line).
- **NIT**: Inconsistent style — `if (bgNightCanvas) { … }` block vs `if (fgNightTint) this._fgNightTint = fgNightTint;` one-liner. → **fixed** (aligned).
- **NIT**: `_lastBgNightOpacity = -1` / `_lastFgTintOpacity = -1` sentinel is fine; works because opacity ∈ [0,1].
- **NIT**: Could early-out from `_driveBgNightOpacity` when neither element is wired. → **fixed** (cached `_anyDomDark` flag at construction).
- **STALE**: Comment in `renderBackground` callers list claiming bake fires on splat/gib bakes — incorrect. → **fixed** (corrected).

### `src/engine/lighting/pipeline.ts`

- **MED**: 24-line dual-mode mechanism prose at top of file → compress to ~6 lines naming the modes; the code is the spec. → **fixed**.
- **MED**: Two long block comments on `bgNightWired` field and `setBgNightWired` setter restating the same thing. → **fixed** (one terse JSDoc).
- **NIT**: `bgNightWired` boolean — could be enum, not worth it.

### `src/components/Match.tsx`

- **NIT**: 4-line comment for `fgNightTintRef` restates Match.css. → **fixed** (one line).
- **MED**: `undefined, // rng` placeholder in `new GameLoop(...)` call signals constructor sprawl. → **deferred**.

### `src/components/Match.css`

- **NIT**: `.fg-night-tint` background `rgba(80, 100, 160, 1)` should be `rgb(80, 100, 160)` per house style. → **fixed**.
- **NIT**: 5-line comment block referencing perf delta and `perf-runs/lmode-comparison/` — perf numbers rot. → **fixed** (kept the WHY about layer promotion, dropped the numeric claim).

### `src/engine/CLAUDE.md`

- **MED**: "5.7ms vs 7.3ms meadow" perf number embedded in entry. → **fixed** (replaced with "measured perf win" + reference to perf-runs).

### `src/engine/gameLoop/GameLoop.ts`, `src/engine/net/netMatch.ts`

- **MED**: Trailing optional positional params adding up. → **deferred** (refactor at L2 boundary when next set of canvases lands).

## False positives / wrong findings

Worth flagging since these will tempt future reviewers:

1. **"Skip `applyRenderScaleToCanvas` on bgNightCanvas — its setTransform is dead because the bake uses identity."** The setTransform IS overridden by the bake, but the helper also sets `canvas.width/height` (backing store) and `style.width/height` (CSS dims). Skipping the helper would break high-DPI rendering. The cost of the redundant `setTransform` is one matrix write per scale change — not a hot path. **Skipped**: the agent's suggested fix would break correctness.

2. **"`bgNightCanvas.getContext('2d')` is allocated even when lighting=off."** Browsers create 2D contexts lazily on first use; the call is effectively free. **Skipped**.

3. **"mix-blend-mode + opacity:0 — does the layer still cost work?"** Compositor skips fully-transparent layers. Verified intent. **Skipped**.

## What I'd add to a future review prompt

For lighting work specifically, prompt agents to check for:

- Per-frame string allocations in `style.*` writes (use cached strings or skip writes).
- Cross-canvas `drawImage` paths and their interaction with `setTransform` / DPR (hi-DPI fallout is the recurring source of bugs in this area — see `feat/rim-light` lessons).
- New comments capturing transient perf numbers — replace with mechanism-level WHY.
- Magic color/alpha literals near `MAX_TINT_ALPHA` / `TINT_COLOR` — derive from those constants.
