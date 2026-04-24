# Arena Platforms — Resume Notes

**Last session:** 2026-04-24. Branch: `feat/arena-visuals` in worktree `.worktrees/arena-visuals`.

## Where we are

**Phase 1 (framework + meadow) is SHIPPED and working.** Tip commit: `bb0f598`.

### What's done

- Platform framework in `src/engine/themes/drawPrimitives/platforms.ts`:
  - Constants `CAP_DEPTH=16`, `SKEW_RATIO=0.5`
  - `mulberry32` PRNG + `seedFor(x,y)` deterministic seeding
  - Edge-profile generators: `wavyDown`, `jaggedDown`, `subtleDown`, `candyDrips`, `backWavyUp`, `backFlat`
  - Rendering helpers: `drawPlatformDropShadow`, `drawPlatformRightFace`, `drawPlatformCap`, `drawStone`, `drawLeafCluster`, `drawLeftStones`
  - Derived geometry: `capFrontY`, `capBackY`, `skewPx`
- `Platform.style?: string` field added for per-platform variants
- `ArenaPack.drawPlatform` (signature: `(ctx, platform, isGround) => void`) — optional, propagates through `ThemeConfig` via `toThemeConfig`
- Renderer dispatches to `theme.drawPlatform` when defined; falls back to flat-rect for unmigrated packs
- Ground decorations (`theme.ground.surfaceColor` fillRect + grass-blade loop) are SKIPPED when a pack owns drawPlatform — see the guard in `renderer.ts`
- Meadow migrated: dirt body + grass cap, stumps (tagged `style:'stump'`) rendered with bark material + tree rings
- Cap is an asymmetric trapezoid: vertical left (matches collision), skewed right (3D cue). Collision = visible on bottom and left (pixel-perfect).
- Full test suite: 2205/2205 pass; `tsc -b` clean

### What's NOT in the current state (by user decision)

- **No two-pass overlay rendering.** Tried it; produced "glued strip" visual artifacts that user hated. Reverted to `bce6f7f` (single-pass). See `docs/superpowers/specs/2026-04-24-platform-overlay-problem.md` for the full writeup of what we tried and why it didn't work.
- **No drop shadows on platforms.**
- **No body extension past collision bottom.** Body is flush with collision.
- **Layer param removed from ArenaPack.drawPlatform** (the interface change from the two-pass attempt).

## Deferred — future phases

### Phase 2: 10 remaining arenas

Each arena pack in `src/engine/arenas/packs/` (not meadow) still uses the legacy flat-rect fallback. Migration pattern = copy meadow's approach:

1. Define per-arena material (body gradient + cap color + signature) in the pack's own `drawPlatform` function
2. Compose shared helpers from `drawPrimitives/platforms.ts`
3. Add a smoke test in `src/engine/arenas/packs/__tests__/<arena>-platform.test.ts`

Reference art target: `.superpowers/brainstorm/422-1777026295/content/arena-materials-v9.html` (11 material cards).

Per-pack materials (from brainstorm):
- **winterLake**: snow + icicles
- **volcano**: charred rock + glowing lava cracks (seeded pools + branching cracks)
- **castle**: stone masonry + cobweb signature
- **candyLand**: layer cake + drip front edge (use `candyDrips`)
- **treetops**: natural wood/branch with green leaves for `leftBumps`
- **underwater**: refined coral + kelp + varied stones (per-platform seeded)
- **hauntedGraveyard**: broken slab + cobweb in 4 corners (per-platform seeded)
- **rooftops**: 2 styles — `'house'` and `'hallway'` (tag each platform in layout, dispatch in `drawPlatform`). No roof-tile style.
- **spaceStation**: metal panel + LED strip
- **waterfall**: wet mossy stone with water drops

Spec covers all 11 materials in detail: `docs/superpowers/specs/2026-04-24-arena-platforms-design.md`.

### Phase 3 (B, D, E pillars from original brainstorm)

All deferred. Spec section "Followups — not in this phase" has the details:

- **B — Life & motion**: platform breathing, foliage sway, reactive environment, richer particles
- **D — Lighting & mood**: sunset/dawn phases, hazard light spill, cloud shadows, player drop shadows
- **E — Polish**: atmospheric perspective, character outlines, landing dust
- **Overlay primitives**: hand-placeable items (flower spill, satellite dish, etc.) for `drawBackgroundNature`/`drawForegroundNature`

## How to resume

### Option A: Ship phase 1 (recommended)

Meadow works. Ship it. From the worktree:

1. `git log --oneline main..HEAD` — review the 15+ commits on the branch
2. `/gsd:ship` or manually create a PR via `gh pr create`
3. Target: merge to main. Phase 2 (10 arenas) becomes a follow-up branch

### Option B: Continue to phase 2 (10 arenas)

1. Pick up from the spec: `docs/superpowers/specs/2026-04-24-arena-platforms-design.md`
2. For each arena: write the pack's `drawPlatform` function per the material table. Use meadow as the reference implementation. Match visual target in the v9 mockup.
3. Each arena can be its own commit. Or group by "easy" first (winterLake, candy, space — single-material) then complex (volcano with cracks, haunted with cobwebs, rooftops with 2 styles).
4. Smoke test per pack. Run full suite. tsc -b.
5. Regenerate nav data ONLY if you change platform layout: `npx vite-node scripts/generateNavData.ts`.

### Option C: B/D/E pillars

These are best started AFTER phase 2 (all arenas on framework). They touch cross-cutting concerns (rendering, cosmetic systems) and benefit from a uniform platform baseline.

Start by re-reading the spec's "Followups" section, then likely brainstorm each pillar independently before planning.

## Session gotchas worth remembering

1. **Don't try two-pass overlay rendering** unless the visual-continuity problem is solved first (see the overlay-problem doc). The core failure was: overlay strips always looked like "glued-on bands" instead of body extensions, because overlay gradients introduced their own shading language. A solution would need overlay pixels to be *exactly* the same as the body material at each y — shared gradient factory + shared texture with same seed, clipped.

2. **Collision cannot be decoupled from visible**. User wants pixel-perfect alignment on bottom and left. Current: ✓. Any future geometric change must preserve this.

3. **Cap is asymmetric** (vertical left, skewed right). Stump tree-rings center at `skew/4`, not `skew/2`. If future arenas use the cap's centroid for anything, same formula.

4. **Platforms render into cached bg layer.** All randomness MUST be seeded. Never `Math.random()` in platform draw code — use `mulberry32(seedFor(x,y))`.

5. **Meadow.ts file grew to ~380 lines** with 2 render helpers (`drawMeadowMain` and `drawMeadowStump`). If phase 2 packs land similarly, consider a `packs/<arena>/` subdirectory pattern — but only after a second file demonstrates the need.

## Key file paths

- Framework: `src/engine/themes/drawPrimitives/platforms.ts`
- Meadow pack: `src/engine/arenas/packs/meadow.ts`
- Renderer dispatcher: `src/engine/renderer.ts` (search for `drawPlatform`)
- Design spec: `docs/superpowers/specs/2026-04-24-arena-platforms-design.md`
- Implementation plan (phase 1, complete): `docs/superpowers/plans/2026-04-24-arena-platforms-meadow.md`
- Overlay-problem post-mortem: `docs/superpowers/specs/2026-04-24-platform-overlay-problem.md`
- Visual reference: `.superpowers/brainstorm/422-1777026295/content/arena-materials-v9.html`
