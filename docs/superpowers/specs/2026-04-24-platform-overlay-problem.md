# Platform overlay rendering — second-opinion brief

**Context:** 2D local-multiplayer party platformer (Jump'n'Bump-inspired). React 19 + Vite + TypeScript + HTML5 Canvas 2D. Fixed 1280×720 logical resolution. Two-layer rendering: **background layer** (OffscreenCanvas, cached, redrawn only on splat events) holds sky / hills / platforms / ground / splat marks; **foreground layer** (every frame) holds characters, weather, particles, HUD. Collision is strict AABB (rectangles). Characters are ~40px tall, platforms ~24px tall (floating) / 60px (ground).

## Design goal

Give flat 2D platforms an isometric "3D box" look via Canvas 2D drawing, without changing collision physics. Settled parameters from extensive brainstorm:

- **`CAP_DEPTH = 16`** (px). The 3D top "cap" straddles the collision top — extends `CAP_DEPTH/2 = 8px` above collision top (back of cap) and eats `8px` into the top of the body (front of cap). Characters render at collision top `y`, which is mid-cap visually — reads as "standing on a plateau."
- **`SKEW_RATIO = 0.5`**. Horizontal skew of back edge = `CAP_DEPTH * SKEW_RATIO = 8px`. The back-right corner of the cap is at `(x + w + 8, y - 8)`.
- **Right face** (parallelogram connecting body's front-right-bottom to cap's back-right-top) is drawn to sell the 3D volume.

## The collision-vs-visible tension

Making visible extend past collision is fundamental to the 3D look. The visible cap extends 8px above collision top. The right face extends 8px past collision right. These extensions all live in the **main bg pass** (drawn before characters), and characters draw on top, so:

- **Top**: cap drawn first. Character standing on platform has feet at collision top (= mid-cap vertically), body above. Cap-back (above collision) is drawn, then character's body covers it. Character visually sits mid-cap. Works.
- **Right**: right face drawn first. Character approaching from right stops at collision `x+w`, body extending further right. Character's body covers right face. Works.

Problem arises on the **bottom** and **left** approaches:

- **Bottom** (headbonk): character jumping up stops with head at collision bottom `y+h`. User wanted character's head to appear *partially inside* the platform. That means the platform must render **after** the character for the overlap region.
- **Left**: character moving right hits collision `x`. User wants character's right side to appear *partially inside* the platform (go "behind"). Same requirement: platform extension must render after character.

## Current implementation (after ~6 iteration commits)

We introduced a two-pass rendering architecture:

1. **`ArenaPack.drawPlatform(ctx, platform, isGround, layer)`** where `layer: 'main' | 'overlay'`.
2. Renderer iterates platforms twice:
   - Once during bg-layer bake: `layer='main'` → draws cap, body, right face, material details. Into cached bg OffscreenCanvas.
   - Once in foreground pass after characters: `layer='overlay'` → draws only the "extension bands" that should cover characters.

### Main pass (meadow as reference material — the only migrated arena)

- **Cap**: asymmetric trapezoid — `(x, cF)` front-left → `(x+w, cF)` front-right → `(x+w+sp, cB)` back-right → `(x, cB)` back-left. Left side is **vertical** (matches collision-left). Right side is the skewed diagonal (for the 3D cue). Cap back at `cB = y - 8`, cap front at `cF = y + 8`.
  - Previous version had the cap as a symmetric parallelogram with back-left at `(x+sp, cB)`. That created a real "invisible wall" on the left at cap y-heights: collision stopped character at `x`, but visible cap at those y's was at `x+sp`, leaving an obvious gap. Switched to vertical-left to kill that gap.
- **Body face**: `fillRect(x, bodyTop, w, bodyH)` where `bodyTop = cF`, `bodyH = platform.height - CAP_DEPTH/2`. Body is FLUSH with collision bottom (body's visible bottom at `y + h`).
- **Right face**: parallelogram from `(x+w, cF)` to `(x+w+sp, cB)` at top, down to `(x+w, y+h)` / `(x+w+sp, y+h-CAP_DEPTH)` at bottom. Flush with collision bottom.
- **Material**: meadow uses a soil gradient `#5a3a20 → #4a2e18 → #2e1e10` with dirt clumps, pebbles, a root tendril inside the body; grass-tufted green cap `#5a8f3a` with `#4a7a2e` dot texture.
- **Left-side decoration** (main pass): one varied stone + 2-3 root tendrils protruding left of body.

### Overlay pass (meadow)

- **Bottom band**: `fillRect(x, y+h, w, CAP_DEPTH/2)` filled with vertical gradient `#2e1e10 → #1a1008` (meant to continue body's gradient downward).
- **Right face extension**: parallelogram from `(x+w, y+h)` to `(x+w+sp, y+h-CAP_DEPTH)` at top, down to `(x+w, overlayBottom)` / `(x+w+sp, overlayBottom-CAP_DEPTH)` at bottom. Color `#150a04`.
- **Left band**: `fillRect(x - CAP_DEPTH/2, capBack, CAP_DEPTH/2, overlayBottom - capBack)` filled with horizontal gradient `#1a1008 → #2e1e10`. Spans from cap-back y to overlay-bottom y — covers character approaching from left at any platform-height y.

## The reported problem — user's feedback

> "Now the strips are glued on the left side as well (including the stumps); bottom of the platforms still only registers collision at the very edge."

Translation:

1. **Overlay bands read as "glued-on strips", not as a continuation of the platform body.** Both the bottom band and the new left band look like separate visual entities stuck next to the main platform, not as "the platform extending slightly past the collision edge." Character approach doesn't feel like "going behind the platform" — feels like "character passing near a strip."

2. **Bottom overlay still reads as flush with visible edge, not "character inside".** User perceives that when jumping up into the platform, the character stops at the visible edge, not penetrating into it. They expect the character to visibly "sink" into the platform on headbonk.

## Analysis of what's going wrong

### Why the overlay reads as a "glued strip"

The overlay must look like a seamless continuation of the platform body. Conditions for seamless:

- **Color matches at the junction.** At `y = bodyBottom = y+h`, body's gradient ends at `#2e1e10` and the bottom-overlay gradient starts at `#2e1e10`. Formally seamless.
- **Visual field reads as uniform.** BUT the overlay's gradient continues darkening (`#2e1e10 → #1a1008`). That darkening makes the overlay read as "a distinct band below the body," not as "body continuing."
- **Left band has a horizontal gradient** (`#1a1008 → #2e1e10`) which creates a shading from the left edge inward. That makes the band look like its own vertical strip with its own shading, not "the body extending 8px left."

The strip interpretation is exacerbated because:
- The body is vertical-gradient only (no horizontal variation). A horizontal gradient on the left band gives it a visual character the body lacks.
- The darkening (both bottom and left) suggests "shadow region" or "separate shape."

### Why "collision still registers at the edge"

User expects character's head to appear visually inside the platform on headbonk. Current geometry:

- Collision bottom at `y + h` (unchanged).
- Visible body bottom at `y + h` (main pass).
- Overlay extends `y + h` to `y + h + 8`.
- Character sprite head (during headbonk, collision top at `y+h`) occupies a few pixels around `y+h` on screen.
- Overlay drawn after character, so overlay **should** cover the top few pixels of the character sprite.

Two hypotheses for user perception:

a) **The overlay band reads as "something between the platform and character"** — because the overlay darkens and doesn't match body material, the user's brain registers three visual layers: platform body, darker band, character head. Rather than "character inside platform," it reads as "character below a separate band."

b) **Character sprite tall-extent vs collision.** If the character's sprite top = the character's collision top (i.e., the sprite doesn't extend significantly above the AABB), then only a thin strip of the character is "inside" the overlay. The effect is too subtle. If the sprite's visible head *does* extend above collision (hair, ears), the effect might need more overlay height.

Unclear which of (a) or (b) dominates without testing with a fixed overlay material.

### Why stumps look "cut off on the left"

The cap's asymmetric trapezoid (vertical left, diagonal right) looks "chopped" on a small 45-55px wide stump: the left side abruptly goes straight up from front to back, while the right side recedes diagonally. For a large platform this reads OK; for a small stump it reads as "missing the back-left corner." The left overlay band is meant to cover this, but the overlay is visually disconnected, so the cut-off perception remains.

## What's been tried

| Attempt | What we did | Result |
|---|---|---|
| Original | Body flush with collision; parallelogram cap | Left "invisible wall" (visible cap recedes right at top, collision at x); no "inside" feel |
| Extend body below collision | `bodyH = platform.height` (8px past collision) | Character drawn on top of platform → platform didn't cover character. Strictly a z-order mess. |
| Vertical cap left | Cap back-left at `(x, cB)` instead of `(x+sp, cB)` | No more left wall at cap heights. But cap looks chopped on narrow platforms (stumps). |
| Revert body extension | Flush bottom | No "inside" feel. Head touches visible bottom, no overlap. |
| Two-pass rendering (current) | `layer: 'main' | 'overlay'` param; overlay drawn after characters in foreground | Overlays read as separate strips, not as body continuation. User perception unchanged on "inside" feel. |

## Architecture notes

- Canvas 2D, no shaders / no compositing tricks beyond basic globalAlpha. Anti-aliasing is on by default; stroke endpoints can bleed ~0.5px past clip regions.
- The bg layer is cached to an OffscreenCanvas and re-baked only on splat events. All randomness in platform rendering is deterministic via seeded PRNG (`mulberry32(seedFor(x, y))`) so the cache stays valid.
- `renderPlatformOverlay` is a public method on the renderer called from the main render loop after players draw and before HUD.
- Collision remains strict AABB (`platform.x, .y, .width, .height`). Changing collision would ripple into AI nav data and physics balance.

## Proposals for next iteration

### Proposal A — Make overlay visually indistinguishable from body

Eliminate color variation in overlay gradients. Overlay pixels should be exactly the color the body would be at that screen position if the body extended:

- **Bottom overlay**: solid fill `#2e1e10` (body gradient's bottom color). No further darkening. The overlay reads as "more body, 8px worth."
- **Left overlay**: per-y-row color matching body's vertical gradient at that y — accomplished by using the same body gradient extended horizontally, not a separate horizontal gradient. The overlay's horizontal extent should not introduce any shading variation.
- If this reads correctly, the body/overlay seam should be invisible. Character entering the overlap region reads as "character going into the body" because the overlap region IS the body visually.

Cost: ~10 LOC change to `drawMeadowOverlay` / `drawMeadowStump`.

Risk: Might still read as "flush stop" if the character's visible head doesn't extend above its collision. Needs playtest.

### Proposal B — Increase overlay depth to make the effect more prominent

If Proposal A lands cleanly but the effect is still too subtle, increase overlay extent from `CAP_DEPTH/2` (8px) to `CAP_DEPTH` (16px) or more. More of the character is visibly covered.

Cost: trivial parameter change.

Risk: at 16px overlap, the character's "head" visibility is very limited during headbonk. Could look like the character is "too deep" into the platform. Tuning knob.

### Proposal C — Extend collision to match visible

Make the collision AABB larger than the nominal `platform.x/y/w/h` by `CAP_DEPTH/2` on the overlay sides (bottom + left). So character's head stops AT the visible bottom, not 8px above it. Character visually flush with visible edge, no overlap needed. No "inside" feel, but no "gap" feel either.

Cost: larger. Touches physics collision resolution (`collidePlatforms()`), AI nav data generation, spawn logic. Nav data would need regeneration. Existing platform layouts would need audit (gaps might become too small).

Risk: Gameplay feel changes. Wider targets for jumps. Could affect existing arena designs.

### Proposal D — Make character's sprite-top extend further above collision-top

Today, character rendering likely renders sprite with collision-box dimensions. If we intentionally render the character sprite so that its visible top extends 8px above its collision box (character has hair/ears in that top band), then during headbonk:
- Collision stops character's box-top at `y+h`
- Character's SPRITE top is at `y+h - 8` (hair above)
- That sprite portion is VISIBLY INSIDE the platform body (main pass, drawn before character — normally character draws over platform, but...)

Doesn't solve the z-order issue alone. Would need to combine with Proposal A.

Cost: Moderate. Touches character rendering. Need to verify current sprite-vs-AABB dimensions.

Risk: Changes character look across whole game.

### Proposal E — Wider/deeper bottom strip + solid body color + NO left extension

Accept the asymmetry: bottom gets 8-12px overlay in solid body color (cleanest "inside" effect). Left has no visible extension — collision at `x`, visible at `x`, flush. No overlap on left, no gap on left. Ignore user's "go behind on left" request.

Cost: Minimal.

Risk: User explicitly requested left overlap matching bottom. This rejects that ask.

## Open questions

1. **Is the overlay strictly a color-mismatch issue?** If we use solid body color for the overlay (Proposal A), does it visually disappear as a distinct strip? Need to confirm empirically.

2. **Does the character sprite extend above its collision box currently?** Need to check `drawCharacterSprite` in `src/engine/rendering/players.ts`. If yes, Proposal A alone might be enough. If no, we need Proposal C or D.

3. **Is the left overlap even the right interaction for 2D platformers?** Checking existing games: Celeste has tile-based flat platforms (no 3D); Jump'n'Bump has 1px-edge rectangles. Neither has the concept we're implementing. Maybe user's actual desired feel is different and they're reaching for "feels right" phrases.

4. **Should collision be extended to match visible (Proposal C)?** This is the "correct" AABB approach if we want collision to match what the eye reads as the platform edge. But it's a gameplay change.

5. **Is two-pass rendering even necessary?** If collision is extended to match visible, character stops at visible edge, and you never need to draw platform over character. Simpler architecture. Maybe two-pass is premature optimization for a problem that should be solved at the collision layer.

## Attached commits (feat/arena-visuals branch)

```
ded805c  fix(meadow): left overlay band + bottom gradient continuation
982bb47  feat: two-pass platform rendering (main bg + overlay after chars)
bce6f7f  fix(platforms): revert body extension; cap left edge vertical
3bc25fa  fix(platforms): no drop shadows; body extends past collision bottom
2fa82e1  fix(meadow): stumps extend visually to host cap front
6f136ba  fix(meadow): align platform stumps flush with host platform tops
a5b4641  fix(meadow): ground gets 3D cap + stumps use platform framework
78e7cc4  fix(meadow): skip drawPlatform for stump platforms
ff7a24c  feat: migrate meadow to pack-owned drawPlatform with 3D framework
```

## What I'd ask a second AI

Given the above design goal, the architecture constraints (AABB collision, cached bg layer, no shaders), and the specific user feedback: **what's the simplest fix that makes overlay bands visually seamless with the body and gives a credible "character inside platform" feel on bottom and left approaches?** Is Proposal A enough, or is there a fundamental architectural reframe worth considering (collision matches visible, or different rendering model)?
