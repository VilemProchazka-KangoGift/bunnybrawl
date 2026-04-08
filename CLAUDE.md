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
    renderer.ts   # Canvas 2D rendering (two layers: bg + fg) — dispatches to character pack renderers
    gameLoop.ts   # Main game loop with fixed timestep, all game systems
    audio.ts      # Procedural audio + Howler.js playback (animal sounds, SFX)
    music.ts      # MP3-based menu music + procedural arena music generation
    spriteShading.ts # fillBodyGradient (radial body fill) + drawHighlightSpot (white glint)
    fastMath.ts   # Trig lookup tables (fastSin/fastCos) for hot render paths
    canvasAnimations.ts # Shared canvas utilities (wildlife, day/night) for MainMenu + CharacterSelect
    debugFlags.ts # Dev-only flags from URL params (?debug=nav)
    navDebugOverlay.ts # Nav graph debug overlay renderer
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
    ai/           # AI opponent system (utility-based decision making + nav graph)
      types.ts      # AIDifficulty, AIPersonality, AwarenessSnapshot, ActionScores
      aiController.ts # Per-bot brain: reaction buffer, stuck detection, taunt, search pause
      awareness.ts  # Single-pass game state sensing + nav graph lookup
      utility.ts    # 15 evaluators scoring moveLeft/moveRight/jump/drop
      personality.ts # 11 character profiles + 4 difficulty presets
      reachability.ts # Physics-based jump/drop/walk platform reachability functions
      navData.ts    # Auto-generated per-arena navigation graphs (nextHop tables)
      index.ts      # Barrel export
    themes/       # Data-driven arena theme system (11 themes)
      types.ts      # ThemeConfig interface + all sub-interfaces
      drawPrimitives.ts  # Shared drawing functions (trees, bushes, flowers, etc.) + hazard renderer factories
      utils.ts      # Shared utilities (randRange, pickWeighted, swapRemove)
      registry.ts   # Theme registry map + getTheme() + listThemes()
      index.ts      # Barrel export
      meadow.ts winterLake.ts volcano.ts castle.ts candyLand.ts
      treetops.ts underwater.ts hauntedGraveyard.ts rooftops.ts spaceStation.ts waterfall.ts
    index.ts      # Public API barrel export
  hooks/
    useScaler.ts  # Viewport scaling + fullscreen API hook
  components/     # React components (menus/HUD only — canvas is imperative)
    GameScaler.tsx      # Viewport-responsive wrapper (CSS transform scaling)
    MainMenu.tsx        # Title screen with Play button, blood toggle, language switch
    CharacterSelect.tsx # Canvas-based JnB-style lobby
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

- **Two-layer canvas**: Background (static terrain + splat marks) redrawn only on splat; foreground (players, particles, HUD) every frame.
- **Fixed 60fps timestep** with accumulator pattern to decouple physics from rendering.
- **All character sprites are procedural** — Canvas 2D primitives, no sprite sheets. Sprite-cached to OffscreenCanvas.
- **React is for menus only** — game and lobby canvases use imperative requestAnimationFrame loops.
- **CSS transform scaling** — fixed 1280x720 logical resolution, `GameScaler` scales to viewport. Fullscreen via F11.
- **i18n via i18next** — Czech default. Canvas text uses `i18n.t()` directly (not the React hook).
- **Character pack registry** — `CharacterPack` objects bundle colors, emoji, renderers, gibs, AI personality. Registered at startup via `registerBuiltinCharacters()`. Renderer dispatches via `getSpriteRenderer(name)`.
- **Data-driven arena themes** — `ThemeConfig` controls all visuals + optional physics modifiers. Shared primitives in `drawPrimitives.ts`.
- **AI via utility scoring + nav graph** — bots produce `InputState` (4 booleans) same as keyboard. Precomputed `navData.ts` provides nextHop/safeHop waypoints.
- **Death effects are gore-mode gated** — Gore ON: blood, gibs, splat marks. Gore OFF: confetti only.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
npm test          # Unit/integration tests (~113 tests, Vitest)
npm run test:e2e  # E2E tests (12 tests, Playwright, builds first)
npx vite-node scripts/generateNavData.ts  # Regenerate AI nav data (after arena/physics changes)
# Dev shortcut — skip lobby:
# http://localhost:5173/bunnybrawl/?arena=rooftops&bots=2&difficulty=hard
# Nav debug overlay:
# http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&debug=nav (toggle with ` key)
```

## Testing

- Tests force `i18n.changeLanguage('en')` so string assertions work regardless of default language.
- When adding new Player fields, update `makePlayer()` in `physics.test.ts` and `stomp.test.ts`, and mock players in `VictoryScreen.test.tsx`.
- The lobby walk-to-zone E2E test is inherently flaky (random NPC placement). Tagged `@flaky`, uses retries.

## Common Patterns

### Adding a new character
Each character is a single file in `src/engine/characters/packs/` exporting a `CharacterPack`.

1. Create `packs/newAnimal.ts` — copy an existing pack (e.g. `bunny.ts`). Provide:
   - `drawSprite: CharacterRenderer` — pure function, sprite-cached. Receives `(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors)`.
   - `drawGib: GibRenderer` — draws ear/tail/horn gibs. ctx already translated+rotated.
   - Data: `name`, `color/darkColor/lightColor`, `emoji`, `customEyes`, `idleTransform`, `splatShape`, `gibs[]`
   - `translations: { en: 'Name', cs: 'Jméno' }`
2. Import and add to `BUILTINS` array in `characters/builtin.ts`
3. Add animal sound in `audio.ts` — add to `SoundName` type + `SIMPLE_ANIMAL_SOUNDS` or `SEGMENT_ANIMAL_SOUNDS`

**Rendering contract:**
- `customEyes: true` = renderer draws its own eyes; `false` = generic dots drawn after sprite.
- `idleTransform`: `'none'` | `'headTilt'` | `'headFlip'` | `'headBob'`
- Generic legs, motion lines, fast-fall lines, bubble helmet drawn AFTER `drawSprite` — don't draw in pack.
- `bodyEllipse` must match the ellipse in `fillBodyGradient`. `noHighlight: true` skips white overlay.
- Sheep uses `fillBodyGradientCircle` (6 overlapping circles, not ellipse).

### Adding a new arena / level
1. Create theme in `src/engine/themes/newTheme.ts` implementing `ThemeConfig` (see `meadow.ts`)
2. Register in `themes/registry.ts` (add to `THEMES` map)
3. Add arena layout in `arena.ts` — platforms + spawn points + `themeId`
4. Add to `ARENA_LIST` in `arena.ts` and register in `getArena()`
5. Add localized name in `en.json` and `cs.json` (`arena_new_theme`)
6. Re-run `npx vite-node scripts/generateNavData.ts`

### Adding arena-specific mechanics
Arena = structural positions, ThemeConfig = behavioral config:
- **Hazard zones** (`Arena.hazardZones`): static danger, nav graph danger scores
- **Effect zones** (`Arena.effectZones`): `zero_g`, `current`, `geyser` — applied to players AND gibs
- **No-spawn zones** (`Arena.noSpawnZones`): exclude springs/thorns/carrots/characters
- **Bouncy platforms** (`Arena.bouncyPlatforms`): platform indices, jelly overlay
- **Fall-off** (`Arena.allowFallOff`): gaps in ground, respawn on fall
- **Ghosts/Wind/Pigeons**: via `ThemeConfig.ghostConfig`/`windConfig`/`pigeonConfig`
- **Carrot zones** (`Arena.carrotZones`): boosted carrot spawn likelihood
- **No springs** (`Arena.noSprings`), custom hazard skins (`drawCustomThorn`/`drawCustomSpring`)

### Adding a new game mechanic / pickup
1. Define interface in `types.ts`, add constants in `constants.ts`
2. Add to `MatchState`, initialize in `GameLoop` constructor
3. Spawn/update/collision in `gameLoop.ts` `fixedUpdate`
4. Rendering in `renderer.ts` `renderFrame`

### Adding a new game mod
1. Add boolean to `GameMods` in `types.ts` + default in `gameStore.ts` `loadStorage`
2. Implement — apply via `eff*` multipliers or shallow arena copy. **Never mutate base constants.**
3. Add to mods array in `MainMenu.tsx`, add i18n keys (`mod_xxx`, `mod_xxx_desc`)

### Adding a new sound
1. Add to `SoundName` union in `audio.ts`
2. Add entry to `SIMPLE_ANIMAL_SOUNDS`/`SEGMENT_ANIMAL_SOUNDS` or `this.sounds.set()`
3. Call `audio.play('name')` in `gameLoop.ts`
4. **Volume calibration**: test on laptop speakers. Frequencies below 100Hz are inaudible on most laptop speakers — use 130Hz+ for thuds/impacts. Generation amplitude * Howl volume should be ≥0.05 effective for one-shots, ≥0.02 for ambient loops. Reference: existing `jump` sound = square wave 0.25 amplitude * Howl 0.3 = 0.075 effective at 300-600Hz.
5. **Cooldown for rapid-fire SFX**: use per-player `Map<PlayerSlot, number>` accumulators (like `footstepAccumulators`), or a global cooldown number. Decay every frame. Sound plays only when cooldown ≤ 0.

### Adding per-theme ambient sounds
Themes support ambient sounds via `ThemeConfig.ambientSoundConfig`:
- **Loops** (`loops: string[]`): continuous background sounds, started in `GameLoop.start()`, stopped in `stop()`
- **Periodic** (`periodic: [{sound, intervalRange}]`): one-shots fired at random intervals, ticked in `fixedUpdate()`
- Sound generators go in `audio.ts`, config in each theme file in `src/engine/themes/`
- All active loops tracked in `GameLoop.activeAmbientLoops[]` and stopped on match end

### Adding arena MP3 music
1. Place MP3 in `public/audio/<themeId>.mp3`
2. Add to `AudioManager.MUSIC_MP3` map in `audio.ts`

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — human P1-P5, bot B1-B5. Use `isBotSlot(slot)`, `getCharacterForSlot(slot)`.
- **Bot characters in `BOT_CHARACTERS` Map** — populated by `assignBotCharacters()`, not in `CHARACTERS` record.
- **Always document lessons** — update `.claude/skills/*.md` after completing features.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~2370 lines — `music.ts` ~980 lines — `gameLoop.ts` ~1770 lines
- `drawPrimitives.ts` ~990 lines — `CharacterSelect.tsx` ~900 lines
- `audio.ts` ~1050 lines — `VictoryScreen.css` ~520 lines
- Theme files ~250-800 lines each (11 themes)
- AI: `utility.ts` ~450, `awareness.ts` ~370, `navData.ts` ~300-500 (generated)
