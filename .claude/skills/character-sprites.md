# Character Sprites Skill

Use when adding or modifying character visual rendering: body sprites, legs, feet, eyes, accessories, or per-character visual features.

For character readability against arena backgrounds, also read [`visual-style/SKILL.md`](visual-style/SKILL.md).

## Architecture

- **Body**: drawn by `CharacterPack.drawSprite` in each pack file (`characters/packs/*.ts`)
- **Eyes**: generic dots drawn by renderer unless `customEyes: true`
- **Legs**: shared `drawLegs()` in `characters/legRenderer.ts`, configured by `CharacterPack.legStyle`
- **Shading**: `spriteShading.ts` provides `fillBodyGradient` + `drawHighlightSpot`
- **Sprite caching**: `drawCharacterSprite` caches to `OffscreenCanvas` keyed by `name_state_animFrame_fastFalling_idleKey_sqKey`. 600-entry eviction cap.

## Adding a New Character Pack

Each character is a single file in `src/engine/characters/packs/` exporting a `CharacterPack`.

1. Create `packs/newAnimal.ts` — copy an existing pack (e.g. `bunny.ts`). Provide:
   - `drawSprite: CharacterRenderer` — pure function, sprite-cached. Receives `(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors)`.
   - `drawGib: GibRenderer` — draws ear/tail/horn gibs. ctx already translated+rotated.
   - Data: `name`, `color/darkColor/lightColor`, `emoji`, `customEyes`, `splatShape`, `gibs[]`
   - Optional: `idleActions: { weights?: { stretch?: 0, ... }, custom?: [...] }` — override per-action weights (0 disables) or add signature actions. Defaults to all 6 shared actions weighted 1.0 if omitted.
   - `translations: { en: 'Name', cs: 'Jméno', ... }` — must include ALL active locale codes (currently `en`, `cs`, `hi`, `fil`)
2. Import and add to `BUILTINS` array in `characters/builtin.ts`
3. Add `createSound` field — returns `new Howl(...)`. Use `generateToneBuffer()` or `generateMultiSegmentTone()` from `audio/synthesis/core`, or custom synthesis with `floatBufferToWavDataUri()` from `audio/synthesis/wav`. Add the character name to `SoundName` union in `audio/types.ts`.

### Rendering Contract

- `customEyes: true` = renderer draws its own eyes; `false` = generic dots drawn after sprite.
- Idle actions are picked randomly from a per-pack pool (default: all 6 shared actions in `rendering/idleActions.ts`). The pack's `drawSprite` receives `isIdleAnim` (boolean) and `idleT ∈ [0, 1]` (action progress) for in-sprite tweaks like ear-twitch / tail-wag. Note: `idleT` flows through the sprite cache, so the in-sprite tweak only sees a 1-bit on/off (idleT ranges over the action duration but the cache key is binary). Big animated transforms belong in shared idle actions, not in `drawSprite`.
- Generic legs and bubble helmet draw inside the sprite cache (after pack `drawSprite`, still cached). Motion lines + fast-fall lines draw in `drawPlayer` POST-cache so the outline pass doesn't stamp them — don't draw any of these in pack.
- `bodyEllipse` must match the ellipse in `fillBodyGradient`. `noHighlight: true` skips white overlay.
- Sheep uses `fillBodyGradientCircle` (6 overlapping circles, not ellipse).

## Leg Rendering System

### LegStyle Config (on CharacterPack)

```typescript
legStyle?: {
  shape: 'rounded' | 'tapered' | 'stick' | 'wide';
  footStyle: 'paw' | 'hoof' | 'webbed' | 'claw' | 'round' | 'none';
  legWidth?: number;       // default 6
  legHeight?: number;      // default 8
  footColor?: string;      // default: lightColor
  footWidth?: number;      // default: legWidth + 2
  footHeight?: number;     // default: 3
  spreadAngle?: number;    // resting splay in px, default 0
}
```

### Per-Character Leg Styles

| Shape | Characters | Visual |
|-------|-----------|--------|
| rounded | Bunny, Bear, Panda, Pig, Cow, Sheep | Soft cartoon roundRect |
| tapered | Fox, Cat, Wolf, Goat, Horse, Monkey, Tiger | Wider at hip, narrow at foot |
| stick | Owl, Hedgehog | Thin line with round cap |
| wide | Frog, Rhino | Chunky roundRect, less corner radius |

| Foot | Characters | Visual |
|------|-----------|--------|
| paw | Bunny, Fox, Cat, Wolf, Monkey, Tiger, Hedgehog | Ellipse, slightly wider than leg |
| hoof | Pig, Cow, Goat, Horse, Sheep | Flat-bottom rounded rect |
| webbed | Frog | Three-pronged fan shape |
| claw | Owl | Three downward lines |
| round | Bear, Panda, Rhino | Simple circle |

### Animation Features

- **Walk cycle**: vertical `sin(animFrame * PI) * 3` + horizontal `cos(animFrame * PI) * 2`
- **Knee articulation**: quadratic curve midpoint offset — splays on landing, tucks in air, swings while running
- **Landing squash**: legs widen + shorten when `squashScale < 0.9` (compounds with outer body transform)
- **Idle weight shift**: gentle alternating vertical offset from `animFrame`
- **Airborne**: legs spread horizontally +3px each side, extend +2px taller

## Lessons Learned

### Frog pose consistency

Use the standing frog as the anatomy reference for its eight painted poses: preserve head width, eye spacing, torso volume, limb thickness, foot size, and outline weight while changing joint angles and expressions. Seated and stomp silhouettes should not become a larger, heavier frog. Update `docs/mockups/character-roster-expressive/frog-expressive-atlas.png` and its 384×192 runtime WebP together; the source uses 480×480 cells. Check all eight cells side by side and verify loading and clipping in both worker modes.

### Expressive Pocket Plush runtime

The [playable roster](../../../docs/mockups/playable-plush-roster/README.md) uses eight authored beats per animal: idle, alternating walk contacts, jump, sit, fast stomp, landing, and attention. `plush/playableRoster.ts` maps physics and idle-action state to those beats; species differences are drawn in each sheet. Keep authored poses out of the old body lean and squash transforms, while preserving the small seated movement sway. Runtime sheets are generated from the approved high-resolution studies by `scripts/generatePlayablePlush.py` at 96 pixels per cell and WebP quality 88, retaining at least 2x displayed resolution. Keep the source sheets and generated files in sync. Authored ears, horns, tails, and quills can extend beyond the 32-pixel collision box, so the sprite cache uses 16 pixels of padding for these packs. Verify at actual match size in both default sim-worker and `?simWorker=off` modes; a concept-sheet preview does not establish that game rendering or loading works.

### Thick legs need explicit gap spacing
Characters with `legWidth >= 7` (Bear, Panda, Rhino) will have their legs touch/overlap at the default hip spacing of 3px. The leg renderer uses `Math.max(3, legWidth/2 + 1)` for hip offset to guarantee a visible gap. Always check wide-legged characters after adjusting leg width.

### squashScale in the sprite cache key
`squashScale` is discretized to tenths (`Math.round(squashScale * 10)`) in the cache key. During landing/crouch transitions (~0.15s), this generates 3-4 unique cache entries per character. Acceptable given the 600-entry cap and fast decay, but don't add more continuous-valued parameters to the cache key without considering the combinatorial impact.

### Lobby and renderer must stay in sync
Leg rendering is called from both `renderer.ts` (in-game) and `CharacterSelect.tsx` (lobby). Both import the shared `drawLegs()` function, but the lobby lacks idle weight shift (`idleT = -1` was previously passed). Any new leg features should work correctly when the lobby passes default values.

### Type lookup tables with union types, not string
Use `Record<LegStyle['shape'], LegDrawer>` instead of `Record<string, LegDrawer>`. The compiler then enforces that the table covers all valid shape values and prevents typo access.

### Don't leave unused function parameters
Parameters added "for future use" (`_w`, `_idleT`) create noise and mislead readers. Add them when actually needed. The `/simplify` review caught these immediately.

### Foot width defaults should vary by foot style
Oval foot styles (paw, round, webbed, claw) look good slightly wider than the leg — default `legWidth + 2`. Rectangular foot styles (hoof) look clunky when wider than the leg — default to `legWidth`. The default is conditional on `footStyle` in `legRenderer.ts`. Don't apply a uniform foot width rule across all styles.

### Keep canvas drawing functions pure
`drawLegs()` must be a pure function of its inputs because its output is cached to OffscreenCanvas. No external mutable state, no randomness, no side effects. Derive all animation from the explicit parameters (state, animFrame, squashScale).

### Use authored poses when flat concept art cannot bend cleanly
The Pocket Plush Bunny experiment began with cutout ears and limbs from a flattened image. Rotation exposed missing art behind joints, the ear cuts scarred the forehead, and the body remained stiff. Keep face, body volume, ear roots, and outline consistent across complete authored frames; inspect them at match scale in daylight and darkness. A dark stamp around the final low-resolution sprite made the outline jagged. Extend the silhouette by a fraction of a logical pixel at several times game resolution, composite the original pose on top, then downsample once. Set `noOutline` so the generic cache stamp does not add another ring.

The `?pocketBunny=1` prototype now uses a 10-pose, 4× game-resolution atlas: original idle, attention, blink, walk A/pass/B, jump, fast stomp, impact, and seated. `CharacterPack.resolvePose` maps state, frame, fast-fall, idle action, and landing squash to an integer pose; that pose must be included in the sprite cache key. The authored pack disables shared transform-based idle actions and uses no-op actions as timers for blink and sit. The awkward half-sit transition was removed: idle sitting and input-held grounded crouch use the same seated pose. `SQUASH_ON_CROUCH` (0.6) distinguishes crouch from `SQUASH_ON_LAND` (0.7); when the player moves while crouched, use the run clock for a small foot-anchored sway. An idle action may declare `exitDuration` to keep a brief visual cue while movement begins. The match renderer skips generic run bounce, lean, landing squash, and fast-fall stretch for this pack; authored poses carry the main motion. Preserve gameplay physics, facing flip, power-up scaling, and foreground bush cover. The original procedural Bunny remains the default.

Pack source art lives in `docs/mockups/character-styles/v3/` through `v5/`; `packPocketBunnyAtlas.mjs` exports the roughly 357 KB game atlas. Avoid decoding full concept sheets and building high-resolution OffscreenCanvas silhouettes at every startup. Compare cold start as well as warmed frame cost in both worker modes, and keep browser audio gestures separate from render timing when evaluating perceived sluggishness. Decode the atlas before worker setup completes, and replay arena setup messages received during async loading or the background can stay black.

For fast stomp, expression alone is too subtle at match scale. Use a dedicated silhouette and pose: swept ears, fists near the face, joined downward feet, narrowed eyes, and an angry mouth. Match the other pose widths after packing: the same round-bodied artwork looked oversized at 36 game pixels and fits the jump pose at 32. Compare the atlas and a live crop before choosing the final scale; shrinking all anatomy in a new painting can make the torso too narrow. The selected source is `docs/mockups/character-styles/v5/angry-fast-stomp-chubby-source.png` and replaces only pose 8. Fixed-position generic angry eyebrows drift across authored head shapes and seated wobble; let the authored face carry its own expression and suppress that overlay for this pack.

### Shared gameplay size experiments

`MatchSettings.characterScale` is the base gameplay scale (default 1, first comparison range 1–1.5). Normalize through `engine/characterScale.ts`. Multiply collision dimensions and all movement velocities/accelerations by the same scale to preserve time while changing travel distances and jump height. Keep Giant Players and temporary power-ups separate. Lobby ready checks and labels must use each player's actual width/height, never the 32px constants. The jump tutorial wall remains solid at all tested scales.

Authored plush atlas rendering uses `size * h / 32` around the existing foot anchor. Sprite-cache padding grows with body dimensions, and cache hits check backing-store dimensions before reusing a bitmap. Otherwise a warmed 32px pose can silently appear at the wrong size or clip appendages in a larger lobby. Check both simulation worker modes and an arena change; `e2e/character-scale.spec.ts` covers this path. The playable production-renderer study and matched day/night captures live in `docs/mockups/lobby-scale/`.
