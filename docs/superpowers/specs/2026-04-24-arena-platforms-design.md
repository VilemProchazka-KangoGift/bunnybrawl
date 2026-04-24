# Arena Platforms — 3D Treatment + Per-Arena Materials

**Date:** 2026-04-24
**Branch:** `feat/arena-visuals`
**Scope:** Replace flat-rect platform rendering with a 3D isometric treatment and per-arena material system. Covers floating platforms AND ground. Characters walk mid-cap on visible top surfaces.

## Motivation

Platforms currently render as flat rectangles with a 6–8px top strip (`renderer.ts:242-277`), driven by `ThemeConfig.platform.floatingBodyColor/TopColor/AccentColor/drawMoss`. Across 11 arenas this reads as "simplistic" — same silhouette everywhere, only color differs. No depth cues, no material identity, no edge variation. This phase addresses platforms specifically; B (life & motion), D (lighting & mood), and E (polish) are deferred as followups.

## Architecture

### Ownership — arena pack, not renderer

Platform rendering moves out of `Renderer.drawPlatform` into each arena pack. The `ArenaPack` gains a `drawPlatform(ctx, platform, isGround)` function that receives the full `Platform` object (x, y, width, height, and the new optional `style`). Shared helpers live in a new `src/engine/themes/drawPrimitives/platforms.ts`.

Rationale: material choice, edge style, and signature details vary per arena. Forcing these through a colors-and-flags config on `ThemeConfig` was always going to leak. Per-pack ownership matches the existing pattern (`drawBackgroundNature`, `drawForegroundNature`, `drawFarBackground`).

Removed from `ThemeConfig.platform`: `floatingBodyColor`, `floatingTopColor`, `floatingAccentColor`, `groundBodyColor`, `groundTopColor`, `drawMoss`, the existing `customDraw`. These were half an abstraction; the full pack-owned approach supersedes them.

### The 3D cap — straddling the collision line

Each platform is drawn with three parts:

- **Body front face** — rectangle at `(x, capFront)` to `(x+w, y+h)` where `capFront = y + depth/2` and `h` is the platform's existing height from the arena layout. Body visible height = `h - depth/2`. For floating platforms (h=24) that's 16px visible; for ground (h=60) that's 52px visible.
- **Right-side face** — parallelogram from body's front-right edge to the cap's back-right corner. Darker than the body (shadow side). This closes the 3D volume so the cap doesn't float.
- **Top cap** — parallelogram straddling the collision line. Back edge at `y - depth/2`; front edge at `y + depth/2`. Characters render at the collision top `y` unchanged, which is now mid-cap visually — reads as "standing on a plateau."

**Locked parameters:**
- `CAP_DEPTH = 16` (px, absolute — consumes 8px above collision + eats into top 8px of body)
- `SKEW_RATIO = 0.5` (horizontal skew = depth × ratio, so 8px right-overhang)
- Character feet-y = collision-top y (unchanged — no physics or AI-nav impact)

Collision remains AABB. The 3D is visual only. A small triangle exists at the top-right (8×8px) where visible cap extends past collision; character sprites (~40px tall) cover it at any relevant approach angle, and z-order keeps characters drawn on top of platforms. Accepted risk, monitored in playtest.

### Irregular front + back edges — polygon-modify-outward

Each material supplies `frontEdge(x, w, cF, rng)` and `backEdge(x, w, cB, sp, rng)` returning arrays of points along the respective edges. The cap polygon traces these instead of straight lines.

Critical constraint: **edges only extend OUTWARD** (front edge goes down into body region; back edge goes up into sky region). Never inward — that would create gaps showing sky/body through the cap. This is the candy-drip approach generalized.

Profile generators in `platforms.ts`:
- `wavyDown(...)` — sine-blended rounded peaks going down (meadow, treetops, waterfall, underwater, winter, candy-back)
- `jaggedDown(...)` — sharp V-peaks (volcano, haunted)
- `subtleDown(...)` — tiny hairline dips (castle, house, hallway, space)
- `candyDrips(...)` — sum-of-triangles drip shape (candy-front)
- `backWavyUp(...)` — mirror of `wavyDown` for back edges
- `backFlat(...)` — straight back edge for man-made

### Left-side protrusions — additive, varied

Round stone or leaf clusters extending left of the body. Drawn as separate additive shapes in body-matching color/theme before the body face (so the body's right bevel still renders cleanly over any overlap). Signature for natural materials only; man-made have none.

`drawStone(ctx, cx, cy, rx, ry, angle, base, dark, light)` draws a three-layer ellipse (shadow / base / highlight) with rotation. `leftStonesVaried(palette, opts)` picks one palette row per stone from a 4-entry list, uses independent `rx`/`ry`/`angle` per stone, and randomizes elongation chance. Treetops uses `drawLeafCluster` instead.

### Right face — straight for now

Right face stays as a clean parallelogram. Adding bumps to the right face runs into 3D-perspective complexity that doesn't justify the cost right now. Revisit only if playtest shows it's needed.

### Deterministic per-platform variation

All randomness in platform rendering uses `mulberry32(seedFor(x, y))`. Each platform's stones, edge bumps, crack positions, and cobweb corners are stable across frames (mandatory for the cached background layer — platforms only re-render on splat events, not every frame). Wide platforms get denser features; narrow ones get sparser.

### Ground treatment

Ground gets the same 3D cap (same depth, same skew ratio). The back edge sits only 8px above collision, well below hill heights (y ≥ 500), so existing hills don't need repositioning. Ground materials use the same per-arena material functions as floating platforms — one function, `drawPlatform(... isGround)` dispatches if the material wants to differentiate (e.g., grass blade density could scale with ground's wide span).

## Materials (11)

Each material is a per-arena function exposing: `bodyFace`, `rightFace`, `capColor`, `capLight`, `capTexture`, `frontEdge`, optional `backEdge`, optional `leftBumps`, optional `signature`.

| # | Arena | Body | Cap | Edge style | Signature | Left protrusions |
|---|-------|------|-----|------------|-----------|------------------|
| 1 | **Meadow** | Dirt/soil gradient with pebbles, dirt clumps, exposed root tendril | Green grass with tuft dots | Wavy down/up | — | Varied gray-brown stones (4-color palette) |
| 2 | **Winter Lake** | Snow-packed with bluish shadows | White snow with sparkles | Rounded snow domes (down/up) | Icicles hanging from body bottom | — |
| 3 | **Volcano** | Charred black rock with 2–3 seeded hot-pool gradients + branching glowing cracks | Near-black with ember flecks | Jagged sharp (down/up) | — | Varied near-black volcanic stones |
| 4 | **Castle** | Gray stone + brick mortar pattern (staggered) + weathering | Weathered stone with worn speckles + brick-direction mortar | Subtle inward chip notches | Cobweb in a random front-face corner (45% chance) | — |
| 5 | **Candy Land** | Pink layer cake with layer line + crumb texture | White frosting with rainbow sprinkles | Sum-of-triangles drips (down) / rounded sine (up) | — | — |
| 6 | **Treetops** | Warm wood gradient with gnarly bark ridges + multi-knot gradients | Mossy green with varied tones | Wavy rounded (down/up) | — | Green leaf clusters (3-5 overlapping ellipses per cluster, 4-shade palette) |
| 7 | **Underwater** | Deep teal with seed-picked coral arrangements (branching / tube / anemone) + varied barnacle count | Sandy tan with caustic ripples | Gentle wavy (down/up) | Kelp strands hanging from body bottom (count varies per seed) | Varied cool-gray algae-tinted stones |
| 8 | **Haunted Graveyard** | Cold gray-purple with 1-3 seeded deep cracks + ghostly green seepage | Dusty lichen-gray with grime patches | Jagged broken (down/up) | Cobweb in any of 4 front-face corners (70% chance) | Varied dusky purple-gray stones |
| 9a | **Rooftops — House** | Warm wood wallboard + molding + picture-frame hint | Wooden plank floor with crimson rug + gold fringe | Subtle wear scrapes | — | — |
| 9b | **Rooftops — Hallway** | Darker wood, simpler boarding | Plain wood planks + scuff streaks | Subtle wear scrapes | — | — |
| 10 | **Space Station** | Metal gradient + seam line + bolt heads + hazard stripe | Dark metal with cyan LED strip | Minimal (1px, sometimes none) | Red/green status LEDs on right face | — |
| 11 | **Waterfall** | Dark wet stone gradient + water streaks + algae | Wet moss (blue-green) with varied green dots | Wavy down/up | Water drops hanging from ~55% of front-edge peaks | Varied wet-stone blue-gray stones |

Rooftops arena has only 2 treatments (no separate roof tile). An optional `style?: string` field is added to the `Platform` interface (in `src/engine/types.ts`). Only rooftops uses it: each of the 5 platforms in `rooftops.ts` tags itself `style: 'house'` or `style: 'hallway'`. The rooftops pack's `drawPlatform` reads `platform.style` to dispatch. Other arenas ignore the field.

## Manual overlay workflow — unchanged

`drawBackgroundNature` and `drawForegroundNature` stay as they are today. Author-curated cosmetic overlays (flowers, bushes, vines, specific props) continue to live there. This phase only expands what `drawPlatform` produces automatically — **it does not automate or replace manual placement.**

No new overlay primitives (`drawSpiderwebOverlay`, `drawBannerOverlay`, `drawSatelliteDish`, etc.) in this phase. Those are a followup (see below).

## Implementation order

This phase stops after meadow ships and reads right in playtest. The remaining 10 arenas are a separate phase, unblocked by meadow's validation.

**In scope for this phase:**

1. **Framework + helpers** — `drawPrimitives/platforms.ts` with shared helpers (`drawStone`, `drawLeafCluster`, cap/body/right-face rendering, edge-profile generators, `mulberry32` reuse). `ArenaPack` interface gains `drawPlatform(ctx, platform, isGround)`. `Platform` interface gains optional `style?: string`. Renderer delegates to the pack. Remove `ThemeConfig.platform.*` fields from the interface.
2. **Transitional rendering for unmigrated packs** — during the meadow-only window, the other 10 packs don't have `drawPlatform` yet. Provide a default implementation (either a pack-level fallback `drawPlatform` that renders the current flat-rect behavior, or a renderer-level fallback when `pack.drawPlatform` is undefined) so the other 10 arenas keep rendering exactly as they do today. This keeps the codebase shippable at all times.
3. **Migrate meadow** — port meadow.ts to implement `drawPlatform` using the framework + its material. Verify:
   - Cached background still invalidates correctly on splat events.
   - Collision/AI unchanged (nav data, spawn positions, physics).
   - `tsc -b` passes.
   - Existing tests pass.
4. **Smoke test for framework** — unit test that exercises the shared helpers (`drawStone`, edge profile generators) and meadow's `drawPlatform` against a mock 2d context without throwing. Canvas packs excluded from coverage per existing config.
5. **PLAYTEST CHECKPOINT** — manually play meadow in dev server, verify:
   - 3D cap reads as intended mid-character
   - Varied stones on left side look good
   - Front/back edge irregularity feels right
   - No collision mismatch visible in the top-right triangle
   - Performance unchanged (splat triggers bg re-render, should feel instant)
   - No visual artifacts at different platform sizes (tiny stumps, wide ground, mid floating)
   - Other 10 arenas still render exactly as before (unchanged)

**Out of scope — future phase(s):**

- Migrating the remaining 10 arenas (winter, volcano, castle, candy, treetops, underwater, haunted, rooftops w/ house+hallway, space, waterfall). Each is a self-contained migration using the framework. The order within that phase can be driven by which materials are most-played or most-visually-impactful.
- Cleanup: removing the transitional fallback once all 11 packs have `drawPlatform`. At that point `drawPlatform` becomes required on `ArenaPack`.

## Testing approach

- `renderer.test.ts` has 40+ `renderFrame(state, arena, [])` call sites. The new `drawPlatform` signature on the pack is invoked by the renderer; tests won't need updates if the renderer's public API stays stable.
- Canvas drawing code (arena packs) excluded from coverage per existing config — visual correctness is not meaningfully unit-testable.
- Add a smoke test: for each registered pack, call `pack.drawPlatform` on a mock 2d context with a sample Platform object (first floating platform and ground) and assert no throw.

## Performance notes

- Platforms render into the cached background layer (see CLAUDE.md "Two-layer canvas"). They re-render only on splat events. Deterministic seeding is therefore mandatory — a non-deterministic render would cause visible "shimmer" when splats reset the layer.
- `mulberry32` is already in the codebase pattern (used in other cosmetic code). Reuse it rather than importing a new PRNG.
- Each platform renders ~50-150 paths (cap fill + gradient + texture dots + edge decoration + stones). At 13 platforms per arena × one render per splat, this is negligible.

## Followups — not in this phase

The original brainstorm covered four pillars. Only the platform pillar ships here. The rest is deferred, in priority order:

### B — Life & motion
- Platform breathing (subtle 2% scale sine wave over 3s on floating platforms).
- Foliage sway responding to a wind-noise field (grass, bushes, vines).
- Reactive environment: stomp causes nearby grass tufts to ripple outward; characters passing through bushes cause a rustle.
- Richer weather particle motion (leaves with true rotation, snow with 3-layer parallax, petals spiraling).

### D — Lighting & mood
- Richer time-of-day: sunset and dawn phases (warm pink/orange tints across scene) beyond the current binary day→night alpha.
- Colored light spill from hazards: lava glow tinting nearby platforms red, candy sparkles with pink/blue tint, space zero-G with cyan.
- Cloud shadows drifting across ground.
- Soft oval drop-shadow beneath each character's feet, grounding them against the cap surface.
- Thin rim light on character sprites facing the scene's key light direction.

### E — Polish & readability
- Atmospheric perspective: far background slightly desaturated + blue-shifted.
- Optional thin dark outline on character sprites for pop against busy backgrounds (toggle per-character or global).
- Richer landing dust (puff on land, different per surface material).
- Jump takeoff dust.

### Overlay primitive vocabulary
New reusable primitives in `drawPrimitives/` for hand-placement in `drawBackgroundNature` / `drawForegroundNature`:
- `drawFlowerSpillOver(ctx, platEdge, color)` — flower leaning over a platform edge with stem
- `drawSpiderwebOverlay(ctx, corner)` — standalone web not tied to cap corner (can be placed in scene)
- `drawSatelliteDish(ctx, plat)` — rooftop prop
- `drawIronRing(ctx, plat)` — castle wall fixture
- `drawPennantBanner(ctx, plat)` — castle/castle-adjacent
- `drawMushroomCluster(ctx, spot)` — meadow/treetops alternative to single mushrooms

These expand the hand-placement vocabulary so hero platforms can get extra signature flair without needing per-platform code in the arena.

## Visual reference

All nine revision iterations are saved in `.superpowers/brainstorm/422-1777026295/content/arena-materials-v*.html`. **v9 is the locked reference** — all subsequent implementation should match it. If mismatch emerges during code implementation, v9 is the source of truth.

Mockup files persist in `.superpowers/` (gitignored). Launch the server via `scripts/start-server.sh --project-dir <project>` from the superpowers brainstorming skill to reload them.
