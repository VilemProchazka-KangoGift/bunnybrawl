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
    input.ts      # 4-player keyboard input with case-insensitive normalization
    arena.ts      # Arena layouts (platforms, spawn points) + getArena(id) + listArenas()
    characters.ts # 14 character definitions + ALL_CHARACTERS roster
    renderer.ts   # Canvas 2D rendering (two layers: bg + fg) — LARGEST FILE (~2300 lines)
    audio.ts      # Procedural audio generation (14 animal sounds + SFX + music)
    gameLoop.ts   # Main game loop with fixed timestep, all game systems (~920 lines)
    themes/       # Data-driven arena theme system
      types.ts      # ThemeConfig interface + all sub-interfaces
      drawPrimitives.ts  # Shared drawing functions (trees, bushes, flowers, etc.)
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
    CharacterSelect.tsx # Canvas-based JnB-style lobby (~810 lines)
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
- **Data-driven arena themes** — Each arena has a `ThemeConfig` controlling all visuals (sky, platforms, decorations, weather, wildlife, fog, day/night) and optional physics modifiers. Themes are mostly data (colors, counts, ranges) with custom draw functions for unique decorations. Shared drawing primitives live in `themes/drawPrimitives.ts` and are reused across themes.

## Common Patterns

### Adding a new character
1. Add to `ALL_CHARACTERS` in `characters.ts` (with color scheme)
2. Add `} else if (char.name === 'NewAnimal')` block in `renderer.ts` `drawCharacterSprite` method
3. Add simplified version in `CharacterSelect.tsx` `drawLobbyCharacter` function
4. Add the name to the eye exclusion list if drawing custom eyes: `if (!['Frog', 'Owl', 'Cat', ...].includes(char.name))`
5. Add splat shape in `stomp.ts` `CHARACTER_SPLAT_SHAPES`
6. Add animal sound in `audio.ts` (SoundName type + init + generator function)
7. Add localized name in `en.json` and `cs.json` (`char_NewAnimal`)

### Adding a new arena / level
1. Create theme config in `src/engine/themes/newTheme.ts` implementing `ThemeConfig` (see `meadow.ts` as reference)
   - Define sky gradient, hills, ground style, platform colors
   - Configure ambient systems: clouds, weather, wildlife, fog, ambient particles, day/night
   - Write `drawBackgroundNature(ctx, arena)` — background decorations (trees, rocks, etc.)
   - Write `drawForegroundNature(ctx, arena)` — foreground decorations drawn over players
   - Optionally provide `drawWeatherParticle` for custom particle rendering
   - Optionally set `physics` modifiers (gravity, friction, walkSpeed, jumpImpulse multipliers)
   - Use shared primitives from `drawPrimitives.ts` (drawTree, drawBush, drawPineTree, etc.)
2. Register theme in `src/engine/themes/registry.ts` (add to `THEMES` map)
3. Add arena layout in `src/engine/arena.ts` — platforms array + spawn points + `themeId`
4. Add arena to `ARENA_LIST` in `arena.ts` and register in `getArena()`
5. Add localized name in `en.json` and `cs.json` (`arena_new_theme`)
6. The MainMenu arena selector picks it up automatically from `listArenas()`

### Adding a new game mechanic / pickup
1. Define the interface in `types.ts`
2. Add constants in `constants.ts`
3. Add to `MatchState` interface in `types.ts`
4. Initialize in `GameLoop` constructor
5. Add spawn/update/collision logic in `gameLoop.ts` `fixedUpdate`
6. Add rendering in `renderer.ts` `renderFrame`

### Adding a new visual effect
1. If it needs state: add fields to `MatchState` or `Player` in `types.ts`
2. Add trigger logic in `gameLoop.ts` (e.g., spawn particles on event)
3. Add rendering in `renderer.ts` (draw method + call in `renderFrame`)
4. Particles use the shared `Particle` type and `this.particles` array in GameLoop

### Adding a new sound
1. Add name to `SoundName` union type in `audio.ts`
2. Add `this.sounds.set('name', new Howl({...}))` in `init()`
3. Add generator function (use `generateToneBuffer` or `floatBufferToWavDataUri`)
4. Call `audio.play('name')` where needed in `gameLoop.ts`

## Testing

- **Unit/Integration** (Vitest): `npm test` — 90 tests covering physics, stomp, input, arena, characters, store, components
- **E2E** (Playwright/Chromium): `npm run test:e2e` — 6 tests covering full game flow
- **The lobby walk-to-zone E2E test is inherently flaky** due to random NPC placement. Tagged `@flaky`, uses retries.
- Tests force `i18n.changeLanguage('en')` in setup so string assertions work regardless of default language.
- When adding new Player fields, update the `makePlayer()` helpers in `physics.test.ts` and `stomp.test.ts`, and the mock player objects in `VictoryScreen.test.tsx`.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
npm test          # Unit/integration tests
npm run test:e2e  # E2E tests (builds first)
```

## Important Caveats

- **renderer.ts is ~2300 lines** — the largest file. When editing, use targeted searches to find the right method. Character sprite drawing is organized by `if/else if (char.name === ...)` blocks.
- **gameLoop.ts fixedUpdate returns early when matchOver** — any timers that should keep running after match end (screenFlash, slowMotion) must be decayed in the `loop()` method instead.
- **Player-player collision and stomp detection interact** — stomps must be checked BEFORE `collidePlayersHorizontal`, and the collision must skip when vertical overlap < 50% (stomp zone).
- **CharacterSelect.tsx has its own physics loop** — separate from the main game engine. Changes to lobby physics don't use the engine's `physics.ts`.
- **Gore mode** is persisted in localStorage (`bunnybrawl_gore`).
- **The CHARACTERS record is mutated** at lobby exit to write the selected characters back. This is intentional.
- **Arena type is flat** — `Arena` has `themeId` + platforms/spawns directly (not nested in a `layout` sub-object). The theme provides all visual config; the Arena provides structural layout. Color fields (`backgroundColor`, `groundColor`, `platformColor`) were removed — use the theme instead.
- **Theme draw functions receive raw ctx + arena** — they import shared primitives from `drawPrimitives.ts` directly, not through a DrawKit indirection. Keep it simple.
- **platforms[0] is always the ground** — convention used by themes, renderer, and gameLoop. Ground platform is detected by `p.y >= 650`.
- **Screen containers must use `width/height: 100%`** — they inherit their size from `GameScaler`'s 1280x720 content div. Never set fixed pixel dimensions on screen containers (`.main-menu`, `.match-container`, `.char-select`, `.victory-screen`).

## Workflow Rules

- **Always document lessons learned** — after completing a feature or fixing iterative feedback, update the relevant `.claude/skills/*.md` file with lessons, gotchas, and patterns discovered. If no skill file exists for the domain, create one. This prevents repeating the same mistakes across sessions.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~2300 lines (canvas drawing, dispatches to theme for decorations)
- `gameLoop.ts` ~920 lines (all game systems, reads theme for ambient init)
- `CharacterSelect.tsx` ~810 lines (lobby with its own game loop)
- `audio.ts` ~590 lines (procedural sound generation)
- `themes/drawPrimitives.ts` — shared drawing functions extracted from renderer
- `VictoryScreen.css` ~410 lines
