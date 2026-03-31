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
    arena.ts      # Meadow arena layout (platforms, spawn points)
    characters.ts # 14 character definitions + ALL_CHARACTERS roster
    renderer.ts   # Canvas 2D rendering (two layers: bg + fg) — LARGEST FILE (~2300 lines)
    audio.ts      # Procedural audio generation (14 animal sounds + SFX + music)
    gameLoop.ts   # Main game loop with fixed timestep, all game systems (~920 lines)
    index.ts      # Public API barrel export
  components/     # React components (menus/HUD only — canvas is imperative)
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
- **i18n via i18next** — Czech is the default language. Canvas text uses `i18n.t()` directly (not the React hook).

## Common Patterns

### Adding a new character
1. Add to `ALL_CHARACTERS` in `characters.ts` (with color scheme)
2. Add `} else if (char.name === 'NewAnimal')` block in `renderer.ts` `drawCharacterSprite` method
3. Add simplified version in `CharacterSelect.tsx` `drawLobbyCharacter` function
4. Add the name to the eye exclusion list if drawing custom eyes: `if (!['Frog', 'Owl', 'Cat', ...].includes(char.name))`
5. Add splat shape in `stomp.ts` `CHARACTER_SPLAT_SHAPES`
6. Add animal sound in `audio.ts` (SoundName type + init + generator function)
7. Add localized name in `en.json` and `cs.json` (`char_NewAnimal`)

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

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~2300 lines (all canvas drawing)
- `gameLoop.ts` ~920 lines (all game systems)
- `CharacterSelect.tsx` ~810 lines (lobby with its own game loop)
- `audio.ts` ~590 lines (procedural sound generation)
- `VictoryScreen.css` ~410 lines
