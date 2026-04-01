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
    ai/           # AI opponent system (utility-based decision making + nav graph)
      types.ts      # AIDifficulty, AIPersonality, AwarenessSnapshot, ActionScores
      aiController.ts # Per-bot brain: reaction buffer, stuck detection, taunt, search pause
      awareness.ts  # Single-pass game state sensing + nav graph lookup
      utility.ts    # 15 evaluators scoring moveLeft/moveRight/jump/drop
      personality.ts # 14 character profiles + 3 difficulty presets
      reachability.ts # Physics-based jump/drop/walk platform reachability functions
      navData.ts    # Auto-generated per-arena navigation graphs (nextHop tables)
      index.ts      # Barrel export
    themes/       # Data-driven arena theme system
      types.ts      # ThemeConfig interface + all sub-interfaces
      drawPrimitives.ts  # Shared drawing functions (trees, bushes, flowers, etc.)
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
- **AI opponents via utility scoring + nav graph** — up to 5 bots (BotSlot B1-B5) alongside 5 human players. Each bot runs an `AIController` that produces `InputState` (4 booleans) per frame — same interface as keyboard. Decision pipeline: `buildAwareness()` (single-pass state scan + nav graph lookup) → `evaluateActions()` (15 weighted evaluators) → reaction buffer delay → output. Precomputed per-arena reachability graphs (`ai/navData.ts`) provide `nextHop` (fastest) and `safeHop` (hazard-avoidant) waypoints. Edges have danger scores from proximity to hazardZones (icicles, lava). Cautious bots (cautiousness ≥ 1.2) use `safeHop`, aggressive bots use `nextHop`. Geyser edges let bots ride bubble columns as elevators (underwater arena). All difficulties use full pathfinding (zero runtime cost); difficulty is differentiated by reaction delay, noise, and awareness radius.
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
   - Define sky gradient, hills, ground style, platform colors, `previewIcon` (emoji)
   - Configure ambient systems: clouds, weather, wildlife (types: `butterfly`, `bird`, `fish`, `bat`), fog, ambient particles, day/night
   - Write `drawBackgroundNature(ctx, arena)` — background decorations (trees, rocks, etc.)
   - Write `drawForegroundNature(ctx, arena)` — foreground decorations drawn over players (make these large enough to hide behind, ~40-80px tall, at alpha 0.4-0.6)
   - Optionally provide `drawWeatherParticle` for custom particle rendering
   - Optionally provide `drawCustomThorn` / `drawCustomSpring` / `drawCustomHazardZone` / `drawCustomGhost` for themed skins
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
- **Effect zones** (`Arena.effectZones`): Zero-G (`zero_g`), water currents (`current`), bubble geysers (`geyser`). Zones applied in gameLoop per-player, rendered in renderer. Geyser zones generate nav graph edges so bots can ride them as elevators. Zero-G zones generate drift edges so bots cross through them (e.g. space station center).
- **No-spawn zones** (`Arena.noSpawnZones`): AABB zones where springs, thorns, and characters should not spawn. Used to exclude solid structures like the cemetery mausoleum from hazard spawning.
- **Bouncy platforms** (`Arena.bouncyPlatforms`): Platform indices that bounce players on landing. Rendered with jelly overlay.
- **Fall-off** (`Arena.allowFallOff`): Split ground into segments with gaps. Player falling below screen respawns at -1 score.
- **Ghosts** (`ThemeConfig.ghostConfig`): Roaming semi-transparent entities. Initialized in GameLoop constructor, updated/collided in fixedUpdate, drawn by renderer `drawGhost`.
- **Wind** (`ThemeConfig.windConfig`): Periodic gusts affecting airborne players. Managed by wind state in MatchState.
- **Pigeons** (`ThemeConfig.pigeonConfig`): Scatter-on-approach wildlife with particle burst.
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
- Personality weights multiply utility scores: `aggressiveness`, `cautiousness`, `greediness`, `chaosAffinity`, `platformPreference`
- Jump behavior: controlled by `JUMP_THRESHOLD` (0.55) in aiController and `jumpCooldown` (20 frames)

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

- **Unit/Integration** (Vitest): `npm test` — 115 tests covering physics, stomp, input, arena, characters, store, AI, components
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
npx vite-node scripts/generateNavData.ts  # Regenerate AI nav data (after arena/physics changes)
```

## Important Caveats

- **renderer.ts is ~2300 lines** — the largest file. When editing, use targeted searches to find the right method. Character sprite drawing is organized by `if/else if (char.name === ...)` blocks.
- **gameLoop.ts fixedUpdate returns early when matchOver** — any timers that should keep running after match end (screenFlash, slowMotion) must be decayed in the `loop()` method instead.
- **Player-player collision and stomp detection interact** — stomps must be checked BEFORE `collidePlayersHorizontal`, and the collision must skip when vertical overlap < 50% (stomp zone).
- **CharacterSelect.tsx has its own physics loop** — separate from the main game engine. Changes to lobby physics don't use the engine's `physics.ts`.
- **Gore mode** is persisted in localStorage (`bunnybrawl_gore`). Arena selection persisted in `bunnybrawl_arena` (default: `'random'`).
- **`arenaId: 'random'`** — resolved to a concrete arena in `Match.tsx` via `resolveArenaId()`, not in the store. A module-level `lastResolvedArenaId` prevents repeating the same arena on rematch. The store keeps `'random'` so it re-rolls each time.
- **Pause screen has a level selector** — "Change Level" button shows an arena grid. Selecting an arena sets `currentArenaId` local state which retriggers the game loop useEffect, restarting the match.
- **The CHARACTERS record is mutated** at lobby exit to write the selected characters back. This is intentional.
- **Arena type is flat** — `Arena` has `themeId` + platforms/spawns directly (not nested in a `layout` sub-object). The theme provides all visual config; the Arena provides structural layout. Color fields (`backgroundColor`, `groundColor`, `platformColor`) were removed — use the theme instead.
- **Theme draw functions receive raw ctx + arena** — they import shared primitives from `drawPrimitives.ts` directly, not through a DrawKit indirection. Keep it simple.
- **platforms[0] is always the ground** — convention used by themes, renderer, and gameLoop. Ground platform is detected by `p.y >= 650`. For arenas with `allowFallOff`, ground is split into segments but platforms[0] still has y=660.
- **Hazard zone collision is inset** — lava/hazard hitboxes are 12px smaller on each side than their visual, so players can step on the edge without getting hurt.
- **Effect zones interact with physics differently** — zero-G boosts upward velocity (vy*1.03) and slows falls (vy*0.92), currents add horizontal force (vx += force*dt), geysers set vy directly. All checked after normal physics. Zone arrays are cached as `cachedGeyserZones`/`cachedZeroGZones` class fields — never re-filter per frame.
- **Scoring** — kill (stomp) = 2 points, carrot = 1 point, fall-off = no score penalty (just respawn slowed). Default kill limit is 16.
- **Ghost/hazard hits apply knockback** — unlike thorns (which only slow), ghost/lava hits also knock the player back and trigger screen flash + squash.
- **Side squash on wall/push collisions** — `Player.sideSquash` (1.0 = normal, <1 = squashed horizontally). Triggered by platform side collision (0.75) or player push (0.8). Decays back to 1.0 via `SQUASH_DECAY_SPEED`. Renderer applies inverse: narrower + slightly taller. When adding new Player fields, also add `sideSquash: 1` to test helpers.
- **MatchState has non-serializable fields** — `bouncyWobble` is a Map. If serialization is ever needed, this must be handled.
- **Screen containers must use `width/height: 100%`** — they inherit their size from `GameScaler`'s 1280x720 content div. Never set fixed pixel dimensions on screen containers (`.main-menu`, `.match-container`, `.char-select`, `.victory-screen`).
- **Day/night rendering must be gated on `dayNight.enabled`** — the renderer's `drawDayNightCycle` draws sun, moon, overlay, fireflies, and shooting stars. It must check `this.theme.dayNight.enabled` before drawing. Disabling the flag in the theme config is NOT enough if the renderer call isn't gated. When user says "remove day/night cycle" they mean: set `enabled: false` AND ensure no sun/moon/celestial bodies appear in `drawFarBackground` either.
- **Tall narrow platform collision** — `collidePlatforms` uses a `landingFromAbove` guard (`sideOverlap > overlapTop`) to prevent the `feetNearTop` override from snapping players onto platforms they approached from the side. Without this, walking into the side of a tall block near its top edge would teleport the player on top. Very tall, very narrow platforms (e.g. 40x216) can still feel awkward — prefer wider-than-tall blocks for standable surfaces.
- **Spring collision uses `bounceTimer` as cooldown** — skip collision when `spring.bounceTimer > 0` (0.3s). Without this, crouching into a spring triggers it every frame (vy=0 satisfies vy≥0), causing rapid sound spam.
- **Spring spawn requires 200px clearance** — `spawnSpring()` filters out platforms that have another platform directly above within 200px. Spring bounce reaches ~272px (`SPRING_BOUNCE²/2g`), so spawning under a low ceiling wastes the spring.
- **`allowFallOff` arenas need hills pushed offscreen** — themes for arenas with no full-width ground should set `hills[].baseY` to 780+ (below screen). Otherwise the hill mounds float visibly in the void below the lowest platforms. Treetops learned this the hard way.
- **Treetops has no platforms[0] ground** — the lowest playable platform is platforms[0] (a branch). Theme decorations use hardcoded y=750 for tree roots and y=620 for fog, not `platforms[0].y`.
- **CharacterSelect.tsx canvas text needs i18n** — use `i18n.t('char_Name', name)` for character names displayed in the lobby canvas, not the raw English `char.name`.
- **Entity cleanup uses `swapRemove`** — dead entities (springs, thorns, carrots, particles, etc.) are removed via `swapRemove(arr, i)` from `themes/utils.ts` in reverse-iterate loops. This is O(1) but does not preserve order. Never use `.filter()` for per-frame entity cleanup.
- **`navData.ts` is generated** — do not hand-edit. Re-run `npx vite-node scripts/generateNavData.ts` after changing any arena platform layout, hazardZones, effectZones, or physics constants (`JUMP_IMPULSE`, `GRAVITY`, `MAX_WALK_SPEED`, `PLAYER_WIDTH`, `PLAYER_HEIGHT`, `CANVAS_WIDTH`). The generator computes jump/drop/walk/geyser edges with danger scores from hazard proximity, then Floyd-Warshall for `nextHop` (fastest) and `safeHop` (hazard-avoidant) paths.
- **Fat bots flee like hurt bots** — `evaluateActions` gates both `self.slowed` and `self.fat` into `evaluateHurtFlee`, skipping chase/stomp/platformSeeking. `navTarget` is only consulted when healthy.
- **Never splice/shift `splatMarks` during `fixedUpdate`** — multiple fixedUpdate ticks can run per frame, and `newSplatsSinceRender` stores indices into `splatMarks`. Splicing shifts indices and corrupts pending render references. Cap the array in the render path only (after indices are consumed).
- **`GameLoop.stop()` must stop ALL looping sounds** — music, ambient, wind, zero_g, crowd. If a new looping sound is added, add a corresponding `audio.stop()` in `stop()`.
- **Victory screen uses two-column layout** — left column: scoreboard + match stats, right column: stats table + MVP highlights. This fits within 720px viewport. If adding more sections, keep both columns balanced.

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — `Player.id` is `PlayerSlot` (not `CharacterSlot`). Human slots are P1-P5, bot slots are B1-B5. Use `isBotSlot(slot)` to check. `CHARACTERS` record only holds human slots; use `getCharacterForSlot(slot)` for universal lookup.
- **Bot characters stored in `BOT_CHARACTERS` Map** — populated by `assignBotCharacters()` before match start. The `CHARACTERS` record is NOT extended for bots.
- **AI awareness uses a single pass over `state.players`** — do NOT add separate `.filter()` loops. All enemy detection, roam target, clustering, and leader score are computed in one loop for perf.
- **AI evaluators must not allocate arrays** — `evaluateActions()` runs 60× per bot per second. Use simple arithmetic on the `ActionScores` object. No `.filter()`, `.sort()`, or `.map()` in evaluators.
- **Jump suppression has 3 layers** — tight-space check (platform <80px above), jump threshold (0.55), and jump cooldown (20 frames). All 3 must pass for a bot to jump. When tuning, check all 3.
- **Lobby bots use separate AI from match bots** — `CharacterSelect.tsx` has `updateBotLobbyAI()` for directed walking to ready zone. Match AI is in `src/engine/ai/`. They share no code.
- **Bot settings persisted in localStorage** — `bunnybrawl_botcount` and `bunnybrawl_botdiff` (`easy`/`medium`/`hard`/`impossible`), loaded in `gameStore.ts`.
- **Always document lessons learned** — after completing a feature or fixing iterative feedback, update the relevant `.claude/skills/*.md` file with lessons, gotchas, and patterns discovered. If no skill file exists for the domain, create one. This prevents repeating the same mistakes across sessions.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~2600 lines (canvas drawing, effect zone/ghost/hazard renderers, dispatches to theme)
- `gameLoop.ts` ~1100 lines (all game systems including wind/ghosts/zones/pigeons/bouncy)
- `CharacterSelect.tsx` ~810 lines (lobby with its own game loop)
- `audio.ts` ~700 lines (procedural sound generation including wind/geyser/pigeon)
- `themes/drawPrimitives.ts` — shared drawing functions extracted from renderer
- Individual theme files ~300-500 lines each (10 themes: meadow, winterLake, volcano, castle, candyLand, treetops, underwater, hauntedGraveyard, rooftops, spaceStation)
- `ai/awareness.ts` ~300 lines (single-pass game state sensing + nav graph lookup)
- `ai/utility.ts` ~400 lines (15 evaluator functions + nav-guided platformSeeking)
- `ai/navData.ts` — auto-generated, ~300-500 lines (precomputed platform reachability per arena)
- `VictoryScreen.css` ~410 lines
