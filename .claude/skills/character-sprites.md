# Character Sprites Skill

Use when adding or modifying character visual rendering: body sprites, legs, feet, eyes, accessories, or per-character visual features.

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
