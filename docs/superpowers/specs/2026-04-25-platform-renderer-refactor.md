# Platform renderer refactor — comprehensive requirements + open design

**Date:** 2026-04-25
**Branch:** `feat/arena-visuals`
**Status:** Requirements gathering for second-opinion review

## Context

2D local-multiplayer party platformer (Jump'n'Bump-inspired). React 19 + Vite + TypeScript + HTML5 Canvas 2D. Fixed 1280×720 logical resolution. Two-layer rendering:
- **Background layer** (OffscreenCanvas, cached, redrawn only on splat events): sky / hills / platforms / ground / splat marks
- **Foreground layer** (every frame): characters, weather, particles, HUD

Characters: ~32px wide, 32px tall. Floating platforms: ~24px tall. Ground: ~60px tall. Strict AABB collision. ~20 platforms per arena, 11 arenas total.

Each platform: `{ x, y, width, height, style?, leftCollisionInset? }`. Currently `leftCollisionInset` exists in the type and is honored by physics, but no platform sets it (was tried, reverted).

## Established framework (`src/engine/themes/drawPrimitives/platforms.ts`)

Each platform has a 3D treatment with three rendered parts:

- **Body face** — rectangle at `(x, cF) → (x+w, y+h)` where `cF = y + 8` (= `CAP_DEPTH/2`). Body's visible top is at the cap's front-bottom.
- **Cap** — top face. Polygon straddling collision top y. Back at `cB = y - 8`. Front at `cF = y + 8`. The cap's back is shifted RIGHT by `sp = 8` for iso depth.
- **Right face** — parallelogram from body's front-right edge to cap's back-right corner. Closes the volume.

Locked parameters: `CAP_DEPTH = 16`, `SKEW_RATIO = 0.5`, `sp = 8`, character feet-y = collision-top y (unchanged).

Edge profile generators feed irregular front/back/left polygon points (`wavyDown`, `jaggedDown`, `subtleDown`, `candyDrips`, `backWavyUp`, `backFlat`, `backIso`, `leftWavy`, `leftJagged`, `leftSubtle`, `leftIso`). Per-arena materials compose these in their `drawPlatform` function.

11 arenas have been migrated. 5 are "architectural" (`castle`, `candyLand`, `hauntedGraveyard`, `spaceStation`, `rooftops`) and use iso back/left edges. 6 are "natural" (`meadow`, `winterLake`, `volcano`, `treetops`, `underwater`, `waterfall`) and use outward-bumping front/back/left edges.

## The cap geometry tension (the core problem)

**Hard requirement, user-confirmed:** architectural arenas need an iso parallelogram cap with the back-LEFT shifted INWARD by `sp` (i.e., `(plat.x + sp, cB)`). This mirrors the right-side back-shift. Vertical-left or trapezoidal caps are NOT acceptable — they read as "chopped off" or "perspective only on right" and break the architectural feel.

**Cap silhouette** (iso parallelogram, what user wants):
```
        (plat.x+sp, cB) ────────── (plat.x+w+sp, cB)    <- back edge
              \                          \
               \                          \
        (plat.x, cF)   ─────────── (plat.x+w, cF)        <- front edge
              ↑                          ↑
              (where body's front face begins, at y = cF = plat.y + 8)
```

Body face below: rectangle `(plat.x, cF) → (plat.x+w, plat.y + plat.height)`.

**Player's concrete experience.** Player ~32px tall standing next to the platform's left side. Feet at `plat.y` (standing height). Player's vertical extent: `plat.y - 32` to `plat.y`. Cap's vertical extent: `plat.y - 8` to `plat.y + 8`. Player's body overlaps cap region in `plat.y - 8` to `plat.y` (lower-mid cap).

In this overlap range, the cap's visible-left x-coordinate slopes from `plat.x + 8` at `cB` (cap top, where player's torso is) down to `plat.x + 4` at `plat.y` (mid-cap, where player's feet are). The cap's visible left edge therefore sits at `[plat.x+4, plat.x+8]` — to the RIGHT of the body face's left edge at `plat.x`.

This creates the **"left offset"** the user is reporting:
- Player's right edge bonks at `plat.x` (body's vertical left edge)
- Visible cap-back-top-left is at `plat.x + 8` (in the player's y range)
- Visible 4-8px gap between player and visible cap silhouette near the player's chest/torso level
- User reads this as the cap "floating right" of where it should be

## Solutions tried and why each failed

| # | Approach | What broke |
|---|---|---|
| 1 | Keep iso cap, no inset, body at `plat.x` | Original state. Visible left offset (4-8px gap user complained about). |
| 2 | Apply `leftCollisionInset = 8` (bonk wall at `plat.x + sp`), body at `plat.x` | Player can't bonk the body face — they push past its visible left and the body face occludes 8px of their right side every frame they push. Looks like player half-buried in body. |
| 3 | `leftCollisionInset = 8`, shift body to `platLeft = plat.x + 8` | Cap's front-bottom-left at `plat.x` extends 8px LEFT of body's top-left at `plat.x + 8`. **Visible wedge gap** at `y = cF` showing background through (this is what the screenshot showed). |
| 4 | `leftCollisionInset = 8`, body at `plat.x` (full width), AABB on full rect, resolve at `plat.x + sp` | Player on top in inset zone (right edge in `[plat.x, plat.x+8]`) — AABB triggers because `plat.x` is full-rect, top branch lands them. Player walks across phantom strip. **But:** when player's right edge transits across `plat.x + sp` from below at body-y, the position resolves jump from `plat.x + sp - width` (a 7-8px teleport visible). |
| 5 | Trapezoidal cap (vertical left, no iso back-left shift) | "Chopped off" look on small platforms. **User explicitly rejected this** ("inward back-left slope is a hard requirement"). |
| 6 | "Squash only on fresh bonk" (sideSquash > 0.95 gate) | Squash drops to 0.75 → cosmetic decay raises to ~0.95 → next frame fires fresh bonk → 0.75. Period ~133ms — visible "looping partial squash" twitch. Reverted to set-every-frame which keeps squash pinned at 0.75 statically. |

## Hard requirements (user has explicitly stated)

1. **Cap is iso parallelogram with INWARD back-left slope.** Back-top-left at `(plat.x + sp, cB)`. Non-negotiable.
2. **No visible offset** between bonk wall and visible cap silhouette in the player's y-range.
3. **No overhang gap** below the cap's front-bottom-left.
4. **No twitching** — squash and position must be stable when input is held against a wall.
5. **No fall-through** when player walks/stands on the platform near the left edge.
6. **Jump-from-below allows partial pass-behind.** When character jumps up against the platform's left side, they should be able to rise and be VISUALLY OCCLUDED by the platform (head/upper body partially "behind" the platform). Specifically, the cap's iso back-left shift creates a region where the player ought to be able to occupy space "behind" the visible cap.
7. **Collision physics must remain AABB** (changing it ripples into AI nav data, spawn logic, push physics, hitbox testing).
8. **Performance** — bg layer is cached, only re-baked on splat events. Per-frame draw cost should stay reasonable.

## Inferred requirements (from existing behavior)

- Right face shows iso depth on the right (mirrors the back-shift) — preserved.
- Body face is a vertical-left rectangle (not slanted/parallelogram).
- Player ALWAYS renders in foreground (currently — but this is up for grabs in the refactor).
- Per-arena `drawPlatform` function owns the rendering.
- Arena packs use deterministic PRNG (`mulberry32(seedFor(x, y))`) for stable per-platform variation.
- Character sprite is approximately the same as the AABB hitbox in extent (no significant overhang).

## The reframe: what the requirements suggest

The "pass-behind" requirement (#6) suggests this is fundamentally a **z-order / layer** problem, not a geometric one.

If the body face renders ON TOP OF the player (when their bboxes overlap), then:
- Player can occupy the iso-slope region (between `plat.x` and `plat.x + sp`) without visual mismatch — the body face will draw over them, occluding the part that "should be inside the platform"
- The iso back-left shift can be preserved (cap-back-left at `plat.x + sp`)
- The cap-front-bottom-left at `plat.x` doesn't overhang anything — body fills below it
- Bonk wall can sit at `plat.x + sp` (player can't push past the body's collision rect, but they can VISUALLY OVERLAP it because the body draws on top)
- For jump-from-below: head bump still fires at the body's collision bottom, but body face can occlude player's head visually as they approach — natural "going behind" feel

This is a substantial refactor: rendering split into bg pass (cap + right face) and fg pass (body face), with body drawn after players in the fg layer.

## Layer model under the reframe

Currently:
```
bg layer (cached, OffscreenCanvas):
  sky → hills → platforms (full draw: cap + body + right face) → splat marks

fg layer (per frame):
  players → particles → HUD
```

Proposed:
```
bg layer (cached):
  sky → hills → platform CAP + RIGHT FACE → splat marks

fg layer (per frame):
  players → platform BODY FACE (per platform) → particles → HUD
```

Body face must draw every frame in fg. This is the performance cost: ~20 platforms × `fillRect` + body texturing per frame. Body textures vary (brick mortar, plank grain, etc.) — for complex bodies, may need to bake to per-platform OffscreenCanvas and `drawImage` per frame.

## Collision model under the reframe

`leftCollisionInset` becomes meaningful again:
- AABB rect = `(plat.x + insetLeft, plat.y, plat.width - insetLeft, plat.height)` for side/bottom collision
- Top detection uses FULL rect `(plat.x, plat.y, plat.width, plat.height)` so player on top doesn't fall through phantom strip
- Phantom strip = `[plat.x, plat.x + insetLeft]`. Player can OCCUPY this strip horizontally without collision; body face renders on top for occlusion.

For architectural arenas: `insetLeft = sp = 8`.
For natural arenas: `insetLeft = 0` (their cap edges go OUTWARD from `plat.x`, no need for inward bonk shift).

## Open design questions (for second opinion)

### A. Is the layer split the right model?

Alternatives:
- **A1 (proposed):** bg = cap+right, fg = body, drawn after players. Per-frame body draw cost.
- **A2:** Composite operation magic. Draw all platforms in bg as before, but use canvas globalCompositeOperation when drawing players to clip them against platform bodies. Likely fragile and confusing.
- **A3:** Per-player z-order check. For each player, decide "renders before or after platform" based on bbox overlap. Within the fg layer, sort. Adds complexity per-player-per-platform.
- **A4:** Render player into an OffscreenCanvas, then composite into fg with a clipping path that excludes platform body regions. Per-player clipping per frame.

A1 is simplest and most direct. A2 is risky. A3/A4 add per-frame complexity.

### B. Body face needs textures (brick mortar, plank grain, candy crumbs, cobwebs). Bake to per-platform OffscreenCanvas, or redraw fully?

- **B1:** Bake each platform's body face to its own OffscreenCanvas at arena setup. Per-frame: `ctx.drawImage(cachedBody, plat.x, cF)`. Cheap. Memory: ~20 small offscreen canvases per arena.
- **B2:** Redraw body fully each frame. Simpler, but per-frame canvas commands × 20 platforms × textures = potentially expensive on slow devices.

B1 likely. Body offscreen canvas is invalidated only on splat events (same as current bg layer).

### C. What about the cap on small platforms (stumps, narrow chimneys)?

The 8px iso shift is a fixed `sp`. A 28px-wide chimney has a cap that's 28+8=36px wide on the back, 28px on the front. The shift is 28% of width — visually significant. For wider platforms (130-300px), it's 3-6% — subtle.

Should `sp` scale with platform width? Or stay fixed? Currently fixed. Visually, fixed `sp` looks correct (it's a depth cue, not a size-relative effect). But "chopped off" effect on narrow platforms is real.

The reframe doesn't directly address this. Possible: leave `sp = 8` fixed; if narrow platforms still look bad after the reframe, revisit.

### D. What's the headbump behavior for "pass-behind"?

User's request 6 is specifically about left-side approaches at body height (player jumping up next to platform's left). What about:

- **D1:** Player jumps up DIRECTLY beneath platform (not at left edge). Their head hits body bottom. Should it still snap (current behavior) or partially pass-behind too?
- **D2:** Player approaches from RIGHT (right side). Right face has iso shift outward (to `plat.x + w + sp`). Should player pass-behind on right side too? (Symmetric to left.) Likely yes.
- **D3:** Player jumps from LEFT-OF-PLATFORM upward, hooking into the iso slope region. Pass-behind expected.

The phantom-strip model handles D3 cleanly. For D1, the current head-bump might feel weird if neighboring left/right pass-behind. Could either:
- Keep current head-bump (snap at body bottom) — abrupt but consistent
- Allow partial pass-behind on bottom too — body face occludes head, head-bump fires when player's TOP reaches some threshold above body bottom

For D2, mirror the left-side phantom strip. Right side has `rightCollisionInset` analog at `plat.x + w` to `plat.x + w + sp`. Phantom strip on right too.

### E. Are there nav-graph implications?

Nav data is generated by `scripts/generateNavData.ts` based on platform layout. It uses platform x/width for jump/walk routes. Changing collision to inset rects (effective width = `width - insetLeft - insetRight`) might affect routing.

Likely impact: minor. AI bots check if they can jump from A to B based on x-distances. An inset of 8px reduces effective width by 8-16px. For 130-300px wide platforms, marginal. For narrow chimneys (28px → effective 20px), could matter for tight jump routing.

Need to regenerate nav data after collision change. Standard process per the migration playbook.

### F. Cosmetic effects / particles tied to platform edges?

Some particles spawn at platform edges (dust on landing, jelly wobble on bouncy, sprite cache hits). These use `plat.x` and `plat.width`. After refactor:
- Landing dust: spawn at `plat.x + insetLeft` to `plat.x + width` (visible footprint top).
- Bouncy jelly wave: already on top edge. Unaffected.
- Splatter/blood: bake to bg layer at hit position. Could now be ON the body face which is in fg. Splat marks would need to bake into the body's per-platform offscreen instead.

Not a blocker, but lots of small adjustments to audit.

### G. Z-order between players?

If body is in fg and players are in fg, what's the order between TWO players at the same platform? Currently players draw in slot order (P1, P2, ...). After refactor:

```
fg pass:
  for each player: draw player
  for each platform: draw body  // covers anyone overlapping
```

If P1 is "behind" platform body and P2 is "in front" (on top), both draw before bodies. Then bodies cover only the parts of P1 that overlap a platform body's region. P2 (on top, no body overlap) is undisturbed. ✓

If two players are both at body height behind two different platforms, both occluded correctly. ✓

If player is mid-air between two platforms, no body overlap, no occlusion. Renders normally. ✓

The only edge case: a player WALKING FORWARD past a platform's left edge. As their right edge enters phantom strip, body starts occluding their right side. Smooth visual transition. Looks like character ducking behind column — desired.

## Concrete refactor proposal

### Step 1: Rendering split

`ArenaPack.drawPlatform` signature changes to two functions or a `layer` param:

```ts
// Option 1: param
drawPlatform: (ctx, platform, isGround, layer: 'bg' | 'fg') => void;

// Option 2: split
drawPlatformBg: (ctx, platform, isGround) => void;  // cap + right face
drawPlatformFg: (ctx, platform, isGround) => void;  // body face
```

Renderer:
- During `renderBackground()` (cached bake): call `drawPlatformBg` per platform.
- During `renderFrame()` (per frame): after drawing players, iterate platforms and call `drawPlatformFg`.

Body face uses cached per-platform OffscreenCanvas (option B1) for performance.

### Step 2: Collision inset

Set `leftCollisionInset: sp` on architectural arena platforms (castle, candyLand, hauntedGraveyard, spaceStation, rooftops iso styles).

Optional: also add `rightCollisionInset: sp` for symmetric pass-behind on the right. (D2.)

### Step 3: Physics consumes inset

`collidePlatforms`:
- Top detection uses FULL rect (so player on top stays grounded across phantom strip)
- Side/bottom uses inset rect
- Resolve to `bonkLeftX = plat.x + insetLeft` (or `plat.x + width - insetRight` for right side)

### Step 4: Cap geometry

Restore iso parallelogram cap. `backIso` returns `(x + sp, cB)` to `(x + w + sp, cB)` — back-LEFT at `x + sp` (inward shift). `leftIso` returns `(x, cF)` to `(x + sp, cB)` — slanted. The cap's iso silhouette is preserved.

### Step 5: Body face

Body draws full width from `plat.x` to `plat.x + plat.width`. Vertical left edge at `plat.x` matches cap's front-bottom-left. No overhang gap. Body texture untouched.

### Step 6: Audit per-arena body draw

Each architectural arena's body draw moves to fg pass. Natural arenas with bumpy edges might keep current bg-only behavior (no inset, no phantom strip).

## What's been kept (independent of this refactor)

- 3D iso treatment for B2 tiny chimneys (decorative, no collision)
- AC fan upgrade (8 spokes, rings, hub)
- Chimney foreground-anchored body extension (8px past collision bottom)
- AC visual height extension (14px past collision bottom)
- Castle 2D pillar overlay removal (relies on 3D platforms now)
- Candyland bouncy wave on cap back rim
- Twitch fix (full-rect AABB for top detection — independent of inset/refactor)
- Squash set every frame (no fresh-bonk gate — independent of inset/refactor)

## What I'd ask the second AI

1. Is the layer split (bg = cap+right, fg = body) the right architecture given the AABB constraint and the cached-bg-layer model? Or is there a simpler approach we're missing?

2. The phantom strip (no-collision zone in body face's left band) plus body-on-top render — does this naturally satisfy "jump-from-below pass-behind", or does that need its own treatment?

3. Are there hidden gotchas with body in foreground + character cosmetic effects (e.g. blood splat marks baked to bg, gibs landing on platforms, AI vision, particles)?

4. Is `sp = 8` fixed too aggressive on narrow platforms (28-45px wide chimneys/stumps)? Should it scale, or are the decorative narrow elements fine staying at fixed 8?

5. Are there existing 2D platformers / 2.5D engines that solved this exact problem and can we steal their architecture?
