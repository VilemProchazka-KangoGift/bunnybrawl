# BunnyBrawl — Claude Development Guide

## Project Overview

BunnyBrawl is a local-multiplayer party game inspired by Jump'n'Bump (1998). Up to 5 players share one keyboard, controlling cartoon animals on a 2D platformer arena. The goal: land on opponents' heads to splat them.

**Tech stack**: React 19 + Vite 8 + TypeScript + HTML5 Canvas + Howler.js + Zustand + i18next

## Architecture

```
src/
  engine/         # Pure game logic — NO React, NO DOM
    types.ts      # All interfaces (Player, MatchState, Arena, etc.)
    constants.ts  # Physics, timing, sizing constants
    physics.ts    # Movement, gravity, collision, player pushing
    stomp.ts      # Stomp detection, splat marks, respawn
    input.ts      # 5-player keyboard input with case-insensitive normalization
    arena.ts      # Arena layouts (platforms, spawn points) + getArena(id) + listArenas()
    characters/   # Character pack system (registry-based, extensible)
      types.ts      # CharacterPack interface, CharacterRenderer/GibRenderer function types
      registry.ts   # Pack registry: register/get/list + convenience lookups (emoji, eyes, splat, gibs)
      builtin.ts    # Registers all 17 built-in characters at app startup
      fallbacks.ts  # Fallback pill-shape renderer for unknown/unregistered characters
      legacy.ts     # CHARACTERS record (P1-P5 defaults), assignBotCharacters, getCharacterForSlot
      index.ts      # Barrel export
      packs/        # One file per character — self-contained with renderer, gibs, data, translations
        bunny.ts fox.ts frog.ts bear.ts owl.ts cat.ts wolf.ts panda.ts
        pig.ts cow.ts goat.ts horse.ts sheep.ts monkey.ts tiger.ts rhino.ts hedgehog.ts
    canvasAnimations.ts # Shared canvas utilities (wildlife, day/night cycle) used by MainMenu + CharacterSelect
    renderer.ts   # Canvas 2D rendering (two layers: bg + fg) — dispatches to character pack renderers
    audio.ts      # Procedural audio generation (animal sounds + SFX + music)
    gameLoop.ts   # Main game loop with fixed timestep, all game systems (~1700 lines)
    debugFlags.ts # Dev-only flags from URL params (?debug=nav)
    navDebugOverlay.ts # Nav graph debug overlay renderer (edges, platform indices, bot targets)
    ai/           # AI opponent system (utility-based decision making + nav graph)
      types.ts      # AIDifficulty, AIPersonality, AwarenessSnapshot, ActionScores
      aiController.ts # Per-bot brain: reaction buffer, stuck detection, taunt, search pause
      awareness.ts  # Single-pass game state sensing + nav graph lookup
      utility.ts    # 15 evaluators scoring moveLeft/moveRight/jump/drop
      personality.ts # 11 character profiles + 4 difficulty presets
      reachability.ts # Physics-based jump/drop/walk platform reachability functions
      navData.ts    # Auto-generated per-arena navigation graphs (nextHop tables)
      index.ts      # Barrel export
    themes/       # Data-driven arena theme system
      types.ts      # ThemeConfig interface + all sub-interfaces
      drawPrimitives.ts  # Shared drawing functions (trees, bushes, flowers, etc.) + hazard renderer factories
      utils.ts      # Shared utilities (randRange, pickWeighted, swapRemove)
      meadow.ts     # Meadow theme config
      winterLake.ts # Winter Lake theme config
      registry.ts   # Theme registry map + getTheme() + listThemes()
      index.ts      # Barrel export
    index.ts      # Public API barrel export
  hooks/
    useScaler.ts  # Viewport scaling + fullscreen API hook
  components/     # React components (menus/HUD only — canvas is imperative)
    GameScaler.tsx      # Viewport-responsive wrapper (CSS transform scaling)
    MainMenu.tsx        # Title screen with Play button, blood toggle, language switch
    CharacterSelect.tsx # Canvas-based JnB-style lobby (~1100 lines)
    Match.tsx           # Game canvas mount + pause overlay
    VictoryScreen.tsx   # Results, stats, MVP awards, fireworks
  store/
    gameStore.ts  # Zustand store (screen flow, match settings, gore mode persistence)
  locales/
    en.json       # English strings (character names, UI)
    cs.json       # Czech strings (default language)
  i18n.ts         # i18next config (Czech default, English fallback)
```

## Key Design Decisions

- **Two-layer canvas**: Background (static terrain + splat marks) and foreground (players, particles, HUD, effects). Background is only redrawn when splat marks are added.
- **Fixed 60fps timestep** with accumulator pattern to decouple physics from rendering.
- **All audio is procedural** — generated as WAV data URIs at init time. No external audio files.
- **All character sprites are procedural** — drawn with Canvas 2D primitives. No sprite sheets.
- **React is for menus only** — the game canvas and lobby canvas use imperative requestAnimationFrame loops.
- **CSS transform scaling** — the game renders internally at a fixed 1280x720 logical resolution. `GameScaler` wraps all screens and uses `transform: scale()` to fit the viewport while preserving 16:9 aspect ratio. Screen containers use `width/height: 100%` and inherit size from the scaler. Fullscreen via F11 or the corner button.
- **i18n via i18next** — Czech is the default language. Canvas text uses `i18n.t()` directly (not the React hook).
- **AI opponents via utility scoring + nav graph** — up to 5 bots (BotSlot B1-B5) alongside 5 human players. Each bot runs an `AIController` that produces `InputState` (4 booleans) per frame — same interface as keyboard. Decision pipeline: `buildAwareness()` (single-pass state scan + nav graph lookup) → `evaluateActions()` (15 weighted evaluators) → reaction buffer delay → output. Precomputed per-arena reachability graphs (`ai/navData.ts`) provide `nextHop` (fastest) and `safeHop` (hazard-avoidant) waypoints. Edges have danger scores from proximity to hazardZones (icicles, lava). Cautious bots (cautiousness ≥ 1.2) use `safeHop`, aggressive bots use `nextHop`. Geyser edges let bots ride bubble columns as elevators (underwater arena). All difficulties use full pathfinding (zero runtime cost); difficulty is differentiated by reaction delay, noise, and awareness radius.
- **Character pack registry** — Characters are registered as `CharacterPack` objects that bundle all per-character data: colors, emoji, rendering functions (`CharacterRenderer` + `GibRenderer`), gib definitions, splat shape, AI personality, and sound parameters. Built-in characters are registered at app startup via `registerBuiltinCharacters()` in `App.tsx`. The renderer dispatches to `getSpriteRenderer(name)` / `getGibRenderer(name)` with fallback pill-shape renderers for unknown characters. This architecture enables external character packs (JS modules providing `CharacterPack` objects).
- **Data-driven arena themes** — Each arena has a `ThemeConfig` controlling all visuals (sky, platforms, decorations, weather, wildlife, fog, day/night) and optional physics modifiers. Themes are mostly data (colors, counts, ranges) with custom draw functions for unique decorations. Shared drawing primitives live in `themes/drawPrimitives.ts` and are reused across themes.

## Common Patterns

### Adding a new character
Each character is a single self-contained file in `src/engine/characters/packs/` exporting a `CharacterPack` object.

1. Create `src/engine/characters/packs/newAnimal.ts` — copy an existing pack file (e.g. `bunny.ts`) as template. Provide:
   - `drawSprite: CharacterRenderer` — draws body, ears, tail, custom eyes (if any). Must be a **pure function** of its inputs (result is sprite-cached). Receives `(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors)`.
   - `drawGib: GibRenderer` — draws non-body gib pieces (ears, tail, horns). Receives `(ctx, gibType, width, height, colors)` with ctx already translated+rotated to gib position.
   - Data: `name`, `color/darkColor/lightColor`, `emoji`, `customEyes`, `idleTransform`, `splatShape`, `gibs[]`
   - `translations: { en: 'Name', cs: 'Jméno' }` — character display names per language
2. Import and add to the `BUILTINS` array in `characters/builtin.ts`
3. Add animal sound in `audio.ts` — add to `SoundName` type, then add entry to `SIMPLE_ANIMAL_SOUNDS` or `SEGMENT_ANIMAL_SOUNDS` table in `init()`

**Rendering contract:**
- `customEyes: true` = renderer MUST draw its own eyes. `customEyes: false` = generic black-dot eyes drawn automatically after the sprite renderer.
- `idleTransform`: `'none'` | `'headTilt'` (Cat) | `'headFlip'` (Owl) | `'headBob'` (most characters) — applied by renderer BEFORE `drawSprite` is called.
- Sprite caching: keyed by `name_state_animFrame_fastFalling_idleKey`. Same renderer used in game and lobby.
- Generic legs, motion lines, fast-fall lines, and bubble helmet are drawn AFTER `drawSprite` by the renderer — don't draw these in the pack.
- `bodyEllipse`: returns `BodyEllipseParams` for the highlight spot overlay. Values must match the body ellipse passed to `fillBodyGradient` inside `drawSprite`.
- `noHighlight: true` skips the white highlight overlay — use for characters that already draw their own light belly/face (e.g., Hedgehog).
- **Sheep uses `fillBodyGradientCircle`** instead of `fillBodyGradient` — its body is 6 overlapping circles, not a single ellipse. The circle variant applies per-circle gradients.

### Adding a new arena / level
1. Create theme config in `src/engine/themes/newTheme.ts` implementing `ThemeConfig` (see `meadow.ts` as reference)
   - Define sky gradient, hills, ground style, platform colors, `previewIcon` (emoji)
   - Configure ambient systems: clouds, weather, wildlife (types: `butterfly`, `bird`, `fish`, `bat`), fog, ambient particles, day/night
   - Write `drawBackgroundNature(ctx, arena)` — background decorations (trees, rocks, etc.)
   - Write `drawForegroundNature(ctx, arena)` — foreground decorations drawn over players (make these large enough to hide behind, ~40-80px tall, at alpha 0.4-0.6)
   - Optionally provide `drawWeatherParticle` for custom particle rendering
   - Optionally provide `drawCustomThorn` / `drawCustomSpring` / `drawCustomHazardZone` / `drawCustomGhost` for themed skins. Use `createThornRenderer()` / `createSpringRenderer()` factories from `drawPrimitives.ts` to avoid duplicating grow/fade/transform boilerplate.
   - Optionally set `physics` modifiers (gravity, friction, walkSpeed, jumpImpulse multipliers)
   - Optionally set `ghostConfig` for roaming hazard entities
   - Optionally set `windConfig` for periodic wind gusts
   - Optionally set `pigeonConfig` for scatter-on-approach wildlife
   - Use shared primitives from `drawPrimitives.ts` (drawTree, drawBush, drawPineTree, etc.)
2. Register theme in `src/engine/themes/registry.ts` (add to `THEMES` map)
3. Add arena layout in `src/engine/arena.ts` — platforms array + spawn points + `themeId`
   - Optionally add `hazardZones` (lava pools etc. — collision inset by 12px on sides)
   - Optionally add `effectZones` (zero_g, current, geyser)
   - Optionally add `bouncyPlatforms` (indices into platforms array)
   - Optionally set `allowFallOff: true` (gaps in ground, fall = respawn + -1 score)
4. Add arena to `ARENA_LIST` in `arena.ts` and register in `getArena()`
5. Add localized name in `en.json` and `cs.json` (`arena_new_theme`)
6. Re-run `npx vite-node scripts/generateNavData.ts` to regenerate AI navigation data (also required after physics constant changes)
7. The MainMenu arena selector picks it up automatically from `listArenas()`

### Adding arena-specific mechanics
Arena mechanics are a combination of **Arena** fields (structural positions) and **ThemeConfig** fields (behavioral config):
- **Hazard zones** (`Arena.hazardZones`): Static danger areas (lava, icicles). Collision in gameLoop, rendered in renderer `drawHazardZone`. Also used by nav graph to compute danger scores — cautious bots route around hazards via `safeHop`. Lava hits set `burnTimer` (fire particles + orange glow) in addition to `slowTimer`; thorns/ghosts only set `slowTimer` (red pulse). The renderer uses `burnTimer > 0` to choose fire glow vs red pulse (`else if`).
- **Effect zones** (`Arena.effectZones`): Zero-G (`zero_g`), water currents (`current`), bubble geysers (`geyser`). Zones applied in gameLoop per-player AND per-gib, rendered in renderer. Geyser zones generate nav graph edges so bots can ride them as elevators. Zero-G zones generate drift edges so bots cross through them (e.g. space station center). Gibs interact with effect zones: zero-G dampens/boosts, geysers push upward (70% player strength), currents drift horizontally.
- **No-spawn zones** (`Arena.noSpawnZones`): AABB zones where springs, thorns, characters, AND carrots should not spawn. Used to exclude solid structures (mausoleum, building interiors below hallways) from all entity spawning.
- **Bouncy platforms** (`Arena.bouncyPlatforms`): Platform indices that bounce players on landing. Rendered with jelly overlay.
- **Fall-off** (`Arena.allowFallOff`): Split ground into segments with gaps. Player falling below screen respawns at -1 score.
- **Ghosts** (`ThemeConfig.ghostConfig`): Roaming semi-transparent entities. Initialized in GameLoop constructor, updated/collided in fixedUpdate, drawn by renderer `drawGhost`.
- **Wind** (`ThemeConfig.windConfig`): Periodic gusts affecting airborne players. Managed by wind state in MatchState.
- **Pigeons** (`ThemeConfig.pigeonConfig`): Scatter-on-approach wildlife with particle burst.
- **Carrot zones** (`Arena.carrotZones`): AABB zones with boosted carrot spawn likelihood. Generates 8 extra candidates per zone with 2x distance bias. Used by Space Station to lure players into zero-G.
- **No springs** (`Arena.noSprings`): Disables spring spawning on the arena. Used by Candy Land (all-bouncy) and Space Station (zero-G).
- **Custom hazard skins** (`ThemeConfig.drawCustomThorn`, `drawCustomSpring`): Override default thorn/spring rendering per theme.

### Adding a new game mechanic / pickup
1. Define the interface in `types.ts`
2. Add constants in `constants.ts`
3. Add to `MatchState` interface in `types.ts`
4. Initialize in `GameLoop` constructor
5. Add spawn/update/collision logic in `gameLoop.ts` `fixedUpdate`
6. Add rendering in `renderer.ts` `renderFrame`

### Adding a new AI behavior
1. If it needs new game state data: add field to `AwarenessSnapshot` in `ai/types.ts`
2. Compute the new field in `ai/awareness.ts` `buildAwareness()` — prefer adding to the existing single-pass player loop
3. Add evaluator function in `ai/utility.ts` (convention: `evaluateXxx(awareness, scores, personality)`)
4. Wire it into `evaluateActions()` — order matters: earlier evaluators can be overridden by later ones
5. If it needs per-bot persistent state (timers, cooldowns): add field to `AIController` class

### Tuning AI difficulty
- `ai/personality.ts` has `DIFFICULTY_PARAMS` with `easy`/`medium`/`hard`/`impossible` presets
- Key levers: `reactionFrames` (input delay), `awarenessRadius` (detection range), `noiseChance` (random input), `walkSpeedMult` (movement speed), `hesitationChance` (random freezes)
- All difficulties use full pathfinding (`pathfindingDepth: Infinity`) — nav data is precomputed with zero runtime cost. Difficulty is differentiated by reaction delay, noise, awareness radius, and hesitation only.
- `impossible`: 0 reaction frames, infinite awareness, 0 noise, 0 hesitation — perfect play
- Personality weights multiply utility scores: `aggressiveness`, `cautiousness`, `greediness`, `chaosAffinity`
- Jump behavior: controlled by `JUMP_THRESHOLD` (0.55) in aiController and `jumpCooldown` (20 frames)

### Adding a new game mod
1. Add boolean to `GameMods` interface in `types.ts`
2. Add default `false` to the `loadStorage` parse + fallback in `gameStore.ts`
3. Add constants if needed in `constants.ts`
4. Implement the mod logic — see existing patterns:
   - **Physics mods** (turbo, giant): multiply `eff*` fields or player dimensions in GameLoop constructor (after theme multipliers). Never change base constants — that would require nav regeneration.
   - **Spawn rate mods** (carrot chase): use ternary on `this.settings.mods.xxx` in the timer reset
   - **Arena structure mods** (super bounce): shallow-copy `this.arena` with overrides — never mutate the source arena
   - **Scoring mods** (carrot chase): gate in `stomp.ts` `checkStomps` via the optional `mods` param
   - **AI behavior mods** (carrot chase): thread flag through `getInput` → `computeIdealInput` → `evaluateActions`
   - **Visual-only mods**: modify renderer, no physics impact
5. Add entry to the mods array in `MainMenu.tsx` (the `[{ key, name, desc }]` array renders all toggles)
6. Add i18n keys to `en.json` and `cs.json` (`mod_xxx`, `mod_xxx_desc`)
7. **Critical**: all mods must be runtime-only — never change values used by `generateNavData.ts` (base physics constants, platform layouts). Apply multipliers to `eff*` fields or per-player fields instead.

### Adding a new visual effect
1. If it needs state: add fields to `MatchState` or `Player` in `types.ts`
2. Add trigger logic in `gameLoop.ts` (e.g., spawn particles on event)
3. Add rendering in `renderer.ts` (draw method + call in `renderFrame`)
4. Particles use the shared `Particle` type and `this.particles` array in GameLoop

### Adding arena MP3 music (overriding procedural music)
1. Place the MP3 file in `public/audio/<themeId>.mp3`
2. Add entry to `AudioManager.MUSIC_MP3` map in `audio.ts` (e.g., `meadow: 'meadow.mp3'`)
3. That's it — `playMusic(themeId)` checks `MUSIC_MP3` before falling back to `generateThemeMusic()`

### Adding a new sound
1. Add name to `SoundName` union type in `audio.ts`
2. For animal sounds: add entry to `SIMPLE_ANIMAL_SOUNDS` or `SEGMENT_ANIMAL_SOUNDS` table in `init()`. For other sounds: add `this.sounds.set('name', new Howl({...}))` in `init()`
3. If needed, add generator function (use `generateToneBuffer` or `floatBufferToWavDataUri`)
4. Call `audio.play('name')` where needed in `gameLoop.ts`

## Testing

- **Unit/Integration** (Vitest): `npm test` — ~115 tests covering physics, stomp, input, arena, characters, store, AI, components
- **E2E** (Playwright/Chromium): `npm run test:e2e` — 12 tests across 2 spec files (game-flow, bot-behavior)
- **The lobby walk-to-zone E2E test is inherently flaky** due to random NPC placement. Tagged `@flaky`, uses retries.
- Tests force `i18n.changeLanguage('en')` in setup so string assertions work regardless of default language.
- When adding new Player fields, update the `makePlayer()` helpers in `physics.test.ts` and `stomp.test.ts`, and the mock player objects in `VictoryScreen.test.tsx`.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
# Dev test link — skip lobby, jump straight into a match:
# http://localhost:5173/bunnybrawl/?arena=rooftops&bots=2&difficulty=hard
# Params: arena (required), bots (0-5, default 1), difficulty (easy|medium|hard|impossible)
# Nav debug overlay — visualize AI navigation graph:
# http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&debug=nav
# Toggle with ` (backtick) key during gameplay
npm test          # Unit/integration tests
npm run test:e2e  # E2E tests (builds first)
npx vite-node scripts/generateNavData.ts  # Regenerate AI nav data (after arena/physics changes)
```

## Important Caveats

- **renderer.ts (~2100 lines)** — character sprite drawing is dispatched via `getSpriteRenderer(name)` from the character pack registry. The old if/else chain is gone. Gib drawing dispatches via `getGibRenderer(name)`.
- **3D sprite shading** — `spriteShading.ts` provides `fillBodyGradient` (radial gradient body fill) and `drawHighlightSpot` (white glint overlay). Each pack's `drawSprite` calls `fillBodyGradient` for the body; the renderer calls `drawHighlightSpot` after `drawSprite` using `pack.bodyEllipse()` params. Gradient edge color is blended 30% toward `darkColor` (not raw `darkColor`) to avoid harsh contrast on characters like Panda/Cow where `darkColor` is their marking color, not a shadow color.
- **Sprite-scale visual effects need restraint** — at 40px character height, subtle effects become prominent. Gradient shading works well; stipple dots and outer glows looked bad (visible halos/artifacts). Highlight spots must be very low alpha (≤0.18) or they look like glare. When `darkColor` differs dramatically from `color` (Panda, Cow), use a blended edge color, not raw `darkColor`.
- **Character pack registry must be initialized before use** — `registerBuiltinCharacters()` is called at module scope in `App.tsx`. Any code that calls `getSpriteRenderer`, `getCharacterEmoji`, etc. before this will get fallback values.
- **Character sounds are NOT in packs** — sound definitions stay in `audio.ts` (`SIMPLE_ANIMAL_SOUNDS` / `SEGMENT_ANIMAL_SOUNDS`). The pack `sound` field was removed to avoid stale duplication. If external packs need sounds, use `audio.registerSound()`.
- **`legacy.ts` CHARACTERS record is still mutated at lobby exit** — the lobby writes selected characters back to `CHARACTERS`. `getAllCharacters()` derives the full roster from the pack registry; `CHARACTERS` only holds the P1-P5 default slot mapping.
- **gameLoop.ts fixedUpdate returns early when matchOver** — any timers that should keep running after match end (screenFlash, slowMotion) must be decayed in the `loop()` method instead.
- **Player-player collision and stomp detection interact** — stomps must be checked BEFORE `collidePlayersHorizontal`, and the collision must skip when vertical overlap < 50% (stomp zone).
- **CharacterSelect.tsx has its own physics loop** — separate from the main game engine. Changes to lobby physics don't use the engine's `physics.ts`. `LobbyPlayer` has `sideSquash` (wall/edge hit → 0.75) and `squashScale` (crouch → 0.6), both decaying at rate 8. The draw function applies the same squash transform as the main renderer (narrower+taller for side, wider+shorter for crouch). Wildlife and day/night cycle are shared via `canvasAnimations.ts` (also used by MainMenu).
- **Gore mode** is persisted in localStorage (`bunnybrawl_gore`). Arena selection persisted in `bunnybrawl_arena` (default: `'random'`).
- **Death effects are gore-mode gated** — Gore ON: red blood particles + character-specific gibs (body parts) + enlarged splat marks + blood drip trails on platforms. Gore OFF: confetti particles (stars, diamonds, ribbons) only, no blood/splats/gibs at all. Gibs use platform collision (bounce once, then settle), persist on ground for 15s, then fade out. Blood drips are baked to bgCtx like splat marks. Gib definitions per character in `stomp.ts` `CHARACTER_GIBS`, gib shape rendering in `renderer.ts` `drawGibShape`.
- **`arenaId: 'random'`** — resolved to a concrete arena in `Match.tsx` via `resolveArenaId()`, not in the store. A module-level `lastResolvedArenaId` prevents repeating the same arena on rematch. The store keeps `'random'` so it re-rolls each time.
- **Pause screen has a level selector** — "Change Level" button shows an arena grid. Selecting an arena sets `currentArenaId` local state which retriggers the game loop useEffect, restarting the match.
- **The CHARACTERS record is mutated** at lobby exit to write the selected characters back. This is intentional.
- **Arena type is flat** — `Arena` has `themeId` + platforms/spawns directly (not nested in a `layout` sub-object). The theme provides all visual config; the Arena provides structural layout. Color fields (`backgroundColor`, `groundColor`, `platformColor`) were removed — use the theme instead.
- **Theme draw functions receive raw ctx + arena** — they import shared primitives from `drawPrimitives.ts` directly, not through a DrawKit indirection. Keep it simple.
- **platforms[0] is always the ground (or first ground segment)** — convention used by themes, renderer, and gameLoop. Ground platform is detected by `p.y >= 650`. For arenas with `allowFallOff` or impassable ground-level obstacles (haunted graveyard mausoleum), ground is split into segments but platforms[0] still has y=660.
- **Hazard zone collision is inset** — lava/hazard hitboxes are 12px smaller on each side than their visual, so players can step on the edge without getting hurt.
- **Effect zones interact with physics differently** — zero-G boosts upward velocity (vy*1.03) and slows falls (vy*0.92), currents add horizontal force (vx += force*dt), geysers set vy directly. All checked after normal physics. Zone arrays are cached as `cachedGeyserZones`/`cachedZeroGZones` class fields — never re-filter per frame.
- **Scoring** — kill (stomp) = 2 points, carrot = 1 point, fall-off = no score penalty (just respawn slowed). Default kill limit is 16.
- **Ghost/hazard hits apply knockback** — unlike thorns (which only slow), ghost/lava hits also knock the player back and trigger screen flash + squash.
- **Side squash on wall/push collisions** — `Player.sideSquash` (1.0 = normal, <1 = squashed horizontally). Triggered by platform side collision (0.75) or player push (0.8). Decays back to 1.0 via `SQUASH_DECAY_SPEED`. Renderer applies inverse: narrower + slightly taller. When adding new Player fields, also add `sideSquash: 1` to test helpers.
- **MatchState has non-serializable fields** — `bouncyWobble` is a Map. If serialization is ever needed, this must be handled.
- **Game mods are runtime-only** — `GameMods` (5 booleans in `MatchSettings.mods`) are applied in the GameLoop constructor via `eff*` multipliers, per-player fields, or shallow arena copies. They must NEVER mutate base constants or arena definitions, as that would corrupt nav data. The Super Bounce mod shallow-copies the arena (`{ ...arena, bouncyPlatforms: [...] }`). Mods are persisted as JSON in `bunnybrawl_mods` localStorage key. The Carrot Chase mod also affects AI behavior — `evaluateActions` receives a `carrotChase` flag that skips combat evaluators and boosts carrot pursuit weight.
- **Screen containers must use `width/height: 100%`** — they inherit their size from `GameScaler`'s 1280x720 content div. Never set fixed pixel dimensions on screen containers (`.main-menu`, `.match-container`, `.char-select`, `.victory-screen`).
- **Buttons use `.btn-base` from `shared.css`** — provides shared font-family, border-radius, cursor, transition, hover scale(1.06), active scale(0.97). Component-specific CSS adds colors, sizes, borders. New buttons should include `btn-base` in their className.
- **Bubble helmet is theme-gated in `drawCharacterSprite`** — drawn at the end of the method for `space_station` and `underwater` themes only. A glass dome ellipse overlays the character's head with reflection highlights and a collar ring. If adding more "costume" arenas, extend the theme ID check there.
- **Day/night rendering must be gated on `dayNight.enabled`** — the renderer's `drawDayNightCycle` draws sun, moon, overlay, fireflies, and shooting stars. It must check `this.theme.dayNight.enabled` before drawing. Disabling the flag in the theme config is NOT enough if the renderer call isn't gated. When user says "remove day/night cycle" they mean: set `enabled: false` AND ensure no sun/moon/celestial bodies appear in `drawFarBackground` either.
- **Tall narrow platform collision** — `collidePlatforms` uses a `landingFromAbove` guard (`sideOverlap > overlapTop`) to prevent the `feetNearTop` override from snapping players onto platforms they approached from the side. Without this, walking into the side of a tall block near its top edge would teleport the player on top. Very tall, very narrow platforms (e.g. 40x216) can still feel awkward — prefer wider-than-tall blocks for standable surfaces.
- **Spring collision uses `bounceTimer` as cooldown** — skip collision when `spring.bounceTimer > 0` (0.3s). Without this, crouching into a spring triggers it every frame (vy=0 satisfies vy≥0), causing rapid sound spam.
- **Spring spawn requires 200px clearance** — `spawnSpring()` filters out platforms that have another platform directly above within 200px. Spring bounce reaches ~272px (`SPRING_BOUNCE²/2g`), so spawning under a low ceiling wastes the spring.
- **`allowFallOff` arenas need hills pushed offscreen** — themes for arenas with no full-width ground should set `hills[].baseY` to 780+ (below screen). Otherwise the hill mounds float visibly in the void below the lowest platforms. Treetops learned this the hard way.
- **Treetops has no platforms[0] ground** — the lowest playable platform is platforms[0] (a branch). Theme decorations use hardcoded y=750 for tree roots and y=620 for fog, not `platforms[0].y`.
- **CharacterSelect.tsx canvas text needs i18n** — use `i18n.t('char_Name', name)` for character names displayed in the lobby canvas, not the raw English `char.name`.
- **Entity cleanup uses `swapRemove`** — dead entities (springs, thorns, carrots, particles, etc.) are removed via `swapRemove(arr, i)` from `themes/utils.ts` in reverse-iterate loops. This is O(1) but does not preserve order. Never use `.filter()` for per-frame entity cleanup.
- **`navData.ts` is generated** — do not hand-edit. Re-run `npx vite-node scripts/generateNavData.ts` after changing any arena platform layout, hazardZones, effectZones, or physics constants (`JUMP_IMPULSE`, `GRAVITY`, `MAX_WALK_SPEED`, `PLAYER_WIDTH`, `PLAYER_HEIGHT`, `CANVAS_WIDTH`). The generator computes jump/drop/walk/geyser edges with danger scores from hazard proximity, then Floyd-Warshall for `nextHop` (fastest) and `safeHop` (hazard-avoidant) paths.
- **Nav debug overlay** (`?debug=nav`) — renders the precomputed nav graph on the game canvas. Shows color-coded edges (jump=yellow, drop=red, walk=green, geyser=blue, drift=cyan), platform indices, approach point diamonds, danger thickness, and per-bot nav targets (orange dashed lines). Toggle with backtick (`` ` ``) key. Implementation: `debugFlags.ts` (URL param reader + toggle), `navDebugOverlay.ts` (all drawing), renderer calls it after HUD. `AIController.getLastNavTarget()` exposes the bot's current awareness navTarget for visualization. Zero cost when disabled (single boolean check).
- **Nav graph doesn't model intra-platform obstacles** — the nav graph treats each platform as a single walkable node. Small obstacles sitting on a platform (headstones, stumps, pillars) block horizontal movement but the nav doesn't know. Bots handle these via directed stuck recovery (jump toward navTarget). For impassable barriers (mausoleum), split the ground manually in the arena definition. Do NOT auto-split all platforms — splitting mid-level platforms at small obstacles creates tiny segments that cause jitter (bots oscillate between segments each frame).
- **Nav graph doesn't know about blocking ceilings** — `canJumpTo()` only checks physics (height, distance), NOT whether a solid platform blocks the path. If a hallway floor is within MAX_JUMP_HEIGHT (~174px) of an upper building block, the generator creates a phantom edge that bots try and fail to use (they hit the ceiling). Fix: ensure the vertical gap between hallway floor and the platform above exceeds 174px (e.g., rooftops uses 180px gaps).
- **Solid building blocks need noSpawnZones** — when an arena uses thick building blocks (e.g., rooftops' upper/lower blocks around hallways), add `noSpawnZones` covering the building interiors. Without this, carrots spawn inside unreachable solid blocks. Hazards (springs/thorns) are also blocked by these zones.
- **Fat bots flee like hurt bots** — `evaluateActions` gates both `self.slowed` and `self.fat` into `evaluateHurtFlee`, skipping chase/stomp/platformSeeking. `navTarget` is only consulted when healthy.
- **Never splice/shift `splatMarks` during `fixedUpdate`** — multiple fixedUpdate ticks can run per frame, and `newSplatsSinceRender` stores indices into `splatMarks`. Splicing shifts indices and corrupts pending render references. Cap the array in the render path only (after indices are consumed).
- **`GameLoop.stop()` must stop ALL looping sounds** — music, ambient, wind, zero_g, crowd. If a new looping sound is added, add a corresponding `audio.stop()` in `stop()`.
- **Menu music (`menuMusicHowl`) must NOT be tied to component lifecycle** — MainMenu and CharacterSelect both call `playMenuMusic()` on mount (no-ops if already playing), but neither stops it on unmount. Stopping is handled by `playMusic()` (game start), `stopAll()`, or `toggleMute()`. Tying stop to unmount causes the music to restart (from the beginning) on every menu↔lobby transition.
- **Menu music Howl is preloaded in `init()`** — avoids a loading delay on first play. The MP3 is fetched from `public/audio/` via `import.meta.env.BASE_URL`.
- **Arena MP3 overrides via `AudioManager.MUSIC_MP3`** — a static map of `themeId → filename`. `playMusic()` checks this before falling back to `generateThemeMusic()`. MP3 files live in `public/audio/`.
- **Victory screen uses two-column layout** — left column: scoreboard + match stats, right column: stats table + MVP highlights. This fits within 720px viewport. If adding more sections, keep both columns balanced.

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — `Player.id` is `PlayerSlot` (not `CharacterSlot`). Human slots are P1-P5, bot slots are B1-B5. Use `isBotSlot(slot)` to check. `CHARACTERS` record only holds human slots; use `getCharacterForSlot(slot)` for universal lookup.
- **Bot characters stored in `BOT_CHARACTERS` Map** — populated by `assignBotCharacters()` before match start. The `CHARACTERS` record is NOT extended for bots.
- **AI awareness uses a single pass over `state.players`** — do NOT add separate `.filter()` loops. All enemy detection, roam target, clustering, and leader score are computed in one loop for perf.
- **AI evaluators must not allocate arrays** — `evaluateActions()` runs 60× per bot per second. Use simple arithmetic on the `ActionScores` object. No `.filter()`, `.sort()`, or `.map()` in evaluators.
- **Jump suppression has 3 layers** — tight-space check (platform <80px above, skipped when navTarget is a jump edge), jump threshold (0.55), and jump cooldown (20 frames). All 3 must pass for a bot to jump. When tuning, check all 3.
- **Stuck recovery is nav-directed** — after 45 frames of <2px movement, the bot jumps toward the navTarget approach point (not randomly). This clears small obstacles (headstones, stumps) blocking the nav path. Only falls back to random jump when no navTarget exists.
- **Chase/priority/invincibility evaluators defer to nav** — when the enemy is on a different level (|dy| > 40) and a navTarget exists, chase and priority evaluators return early to avoid fighting the nav path direction. This prevents bots from walking into walls trying to reach elevated targets directly.
- **Lobby bots use separate AI from match bots** — `CharacterSelect.tsx` has `updateBotLobbyAI()` for directed walking to ready zone. Match AI is in `src/engine/ai/`. They share no code.
- **Bot settings persisted in localStorage** — `bunnybrawl_botcount` and `bunnybrawl_botdiff` (`easy`/`medium`/`hard`/`impossible`), loaded in `gameStore.ts`.
- **Always document lessons learned** — after completing a feature or fixing iterative feedback, update the relevant `.claude/skills/*.md` file with lessons, gotchas, and patterns discovered. If no skill file exists for the domain, create one. This prevents repeating the same mistakes across sessions.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~3200 lines (canvas drawing, effect zone/ghost/hazard renderers, dispatches to theme)
- `gameLoop.ts` ~1700 lines (all game systems including wind/ghosts/zones/pigeons/bouncy)
- `CharacterSelect.tsx` ~1100 lines (lobby with its own game loop)
- `themes/drawPrimitives.ts` ~1000 lines (shared drawing functions extracted from renderer)
- `audio.ts` ~660 lines (procedural sound generation including wind/geyser/pigeon)
- Individual theme files ~250-800 lines each (10 themes: meadow, winterLake, volcano, castle, candyLand, treetops, underwater, hauntedGraveyard, rooftops, spaceStation)
- `ai/awareness.ts` ~370 lines (single-pass game state sensing + nav graph lookup)
- `ai/utility.ts` ~460 lines (15 evaluator functions + nav-guided platformSeeking)
- `ai/navData.ts` — auto-generated, ~300-500 lines (precomputed platform reachability per arena)
- `VictoryScreen.css` ~410 lines
- `fastMath.ts` — trig lookup table (fastSin/fastCos) for hot render paths

## Performance Architecture

The renderer and game loop use several caching/pooling strategies to maintain 60fps:

- **Sprite caching** — `drawCharacterSprite` caches drawn sprites to `OffscreenCanvas` keyed by `char+state+animFrame+fastFalling+idleKey`. Cache hit = single `drawImage` instead of 50+ path ops. 600-entry eviction cap. Breathing animation (2% scale) is intentionally excluded from cache key — too small to notice, would defeat caching.
- **Gradient caching** — Lava, zero-G, ghost glow, and bouncy platform gradients are cached in Maps keyed by position. Only created once per zone, reused every frame. Dynamic gradients (afterglow, fire glow, shimmer) remain per-frame.
- **HUD caching** — `drawHUD` renders to a 1280x90 `OffscreenCanvas`. Only redraws when scores, timer second, or player count changes. Score animations (+N popups) draw on main ctx. Cache-busting also triggers during timer pulse mode (<30s remaining).
- **Particle pool** — `emitParticle()` reuses dead particle objects via a free-list (`particleFreeList`, capped at 300). Avoids GC pressure from hundreds of short-lived allocations per second during combat.
- **Platform filter caching** — `getFloatingPlatforms()` in `themes/utils.ts` uses a WeakMap to cache `arena.platforms.filter(p => p.y < 650 && p.width >= 80)`. All 10 themes use this instead of filtering per frame.
- **AI throttling** — Bots compute decisions every 3rd frame, staggered by `botIndex % 3`. The reaction buffer naturally smooths this. `buildAwareness()` is called once per decision (not twice).
- **globalAlpha batching** — Stars, fireflies, fog, and ambient particles bake alpha into `rgba()` fillStyle instead of mutating `ctx.globalAlpha` per element (which flushes the GPU pipeline).
- **Off-screen culling** — Particles and gibs outside viewport bounds are skipped in draw loops.
- **`fastMath.ts`** — 360-entry Float32Array lookup tables for `fastSin`/`fastCos`. Use for visual effects only (animations, sparkles, stars). Keep `Math.sin`/`Math.cos` for physics.
- When adding new particles, always use `this.emitParticle(x, y, vx, vy, life, size, color)` instead of `this.particles.push({...})` to enable free-list recycling.
