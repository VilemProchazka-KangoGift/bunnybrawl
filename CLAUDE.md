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
    arenas/       # Arena pack system (registry-based, mirrors characters/)
      types.ts      # ArenaPack interface (merges Arena layout + ThemeConfig visuals)
      registry.ts   # Pack registry: register/get/list + nav data + toArena/toThemeConfig extractors
      builtin.ts    # Registers all 11 built-in arenas at app startup
      legacy.ts     # Backward-compat: getArena(), getTheme(), mirrorArena()
      index.ts      # Barrel export
      packs/        # One file per arena — layout + visuals + translations + musicFile
        meadow.ts winterLake.ts volcano.ts castle.ts candyLand.ts
        treetops.ts underwater.ts hauntedGraveyard.ts rooftops.ts spaceStation.ts waterfall.ts
    renderer.ts   # Canvas 2D orchestrator (two layers: bg + fg) — delegates to rendering/ modules
    rendering/    # Extracted rendering modules (from renderer.ts split)
      collectibles.ts  # Carrot, spring, thorn drawing
      particles.ts     # Weather, dust, gibs, confetti, wildlife, fireworks
      hazards.ts       # Lava, ghosts, zero-G, geysers, bouncy platforms, pigeons
      effects.ts       # Day/night cycle, lighting
      hud.ts           # Score display, kill feed, countdown, HUD caching
      players.ts       # Character sprites, sprite caching, expressions
      index.ts         # Barrel export + clearRenderingCaches()
    gameLoop.ts   # Main game loop with fixed timestep, all game systems
    audio.ts      # Procedural audio + Howler.js playback (animal sounds, SFX)
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
      index.ts      # Barrel export
    themes/       # Shared theme infrastructure (types + drawing primitives)
      types.ts      # ThemeConfig interface + all sub-interfaces (used by Renderer)
      drawPrimitives.ts  # Shared drawing functions (trees, bushes, flowers, etc.) + hazard renderer factories
      utils.ts      # Shared utilities (randRange, pickWeighted, swapRemove, getFloatingPlatforms)
    net/          # P2P network multiplayer (WebRTC/PeerJS rollback netcode)
      prng.ts       # SeededRNG (mulberry32) for deterministic simulation
      serialize.ts  # GameSnapshot take/restore + CRC32 desync detection
      protocol.ts   # Binary input encoding + typed JSON control messages
      transport.ts  # WebRTC P2P via PeerJS, room codes, RTT measurement
      rollback.ts   # GGPO-style rollback engine (input buffer, prediction, rewind+resimulate)
      netMatch.ts   # Orchestrator wiring Transport + RollbackEngine + GameLoop
      index.ts      # Barrel export
    index.ts      # Public API barrel export
  hooks/
    useScaler.ts  # Viewport scaling + fullscreen API hook
  components/     # React components (menus/HUD only — canvas is imperative)
    GameScaler.tsx      # Viewport-responsive wrapper (CSS transform scaling)
    MainMenu.tsx        # Title screen with Play/Online buttons, blood toggle, language switch, online modal
    CharacterSelect.tsx # Canvas-based JnB-style lobby (supports online mode: 1 player, any keys)
    OnlineLobby.tsx     # Room create/join connection screen, auto-transitions to CharacterSelect
    Match.tsx           # Game canvas mount + pause overlay + network match support
    VictoryScreen.tsx   # Results, stats, MVP awards, fireworks
  store/
    gameStore.ts  # Zustand store (screen flow, match settings, gore mode, online state)
  locales/
    en.json       # English strings
    cs.json       # Czech strings (default language)
    hi.json       # Hindi strings
    fil.json      # Filipino strings
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
- **Arena pack registry** — `ArenaPack` objects bundle layout + visuals + translations + music + physics mods. Registered at startup via `registerBuiltinArenas()`. Mirrors the character pack pattern. Shared drawing primitives in `themes/drawPrimitives.ts`.
- **AI via utility scoring + nav graph** — bots produce `InputState` (4 booleans) same as keyboard. Precomputed nav data (in each arena pack's `navData` field) provides nextHop/safeHop waypoints.
- **Death effects are gore-mode gated** — Gore ON: blood, gibs, splat marks. Gore OFF: confetti only.
- **P2P network multiplayer** — WebRTC DataChannels via PeerJS (free signaling). GGPO-style rollback netcode with seeded PRNG for determinism. 2-player MVP, bots run deterministically on both peers.
- **Mobile support** — `?mobile` URL param forces mobile mode. `isTouchPrimary()` detects coarse-pointer devices. `.is-mobile` CSS class on `<html>` for platform-conditional styles. Touch controls via `TouchInputManager` (same `InputState` interface as keyboard/AI). Haptic feedback via Vibration API.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
npm test          # Unit/integration tests (~130 tests, Vitest)
npm run test:e2e  # E2E tests (27 tests, Playwright, builds first)
npx vite-node scripts/generateNavData.ts  # Regenerate AI nav data (after arena/physics changes)
# Dev shortcut — skip lobby:
# http://localhost:5173/bunnybrawl/?arena=rooftops&bots=2&difficulty=hard
# Nav debug overlay:
# http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&debug=nav (toggle with ` key)
# Mobile testing (forces touch mode in desktop browser):
# http://localhost:5173/bunnybrawl/?mobile&arena=meadow&bots=2
```

## Testing

- Tests force `i18n.changeLanguage('en')` so string assertions work regardless of default language.
- When adding new Player fields, update `makePlayer()` in `src/engine/__tests__/testHelpers.ts` and mock players in `VictoryScreen.test.tsx`.
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
Each arena is a single file in `src/engine/arenas/packs/` exporting an `ArenaPack`.

1. Create `packs/newArena.ts` — copy an existing pack (e.g. `meadow.ts`). Provide:
   - Layout: `platforms`, `spawnPoints`, `width`, `height`
   - Visuals: `sky`, `hills`, `ground`, `platform`, `clouds`, `weather`, `wildlife`, `fog`, `ambientParticles`, `dayNight`
   - Draw functions: `drawBackgroundNature`, `drawForegroundNature`, optionally `drawFarBackground`, `drawAnimatedBackground`
   - `translations: { en: 'Name', cs: 'Jméno' }` — arena names live in the pack, not in locale JSON
   - `previewGradient` + `previewIcon` for arena selector UI
   - `musicFile: 'new_arena.mp3'` (place MP3 in `public/audio/`)
   - Optional: `bubbleHelmet: true`, `ghostConfig`, `physics`, `ambientSoundConfig`, etc.
2. Import and add to array in `arenas/builtin.ts`
3. Re-run `npx vite-node scripts/generateNavData.ts`

**ArenaPack bundles everything**: layout + visuals + translations + music + physics mods + hazard configs + ambient sounds. No separate theme file or locale keys needed.

### Adding arena-specific mechanics
All mechanics are configured directly in the `ArenaPack`:
- **Hazard zones** (`hazardZones`): static danger, nav graph danger scores
- **Effect zones** (`effectZones`): `zero_g`, `current`, `geyser` — applied to players AND gibs
- **No-spawn zones** (`noSpawnZones`): exclude springs/thorns/carrots/characters
- **Bouncy platforms** (`bouncyPlatforms`): platform indices, jelly overlay
- **Fall-off** (`allowFallOff`): gaps in ground, respawn on fall
- **Ghosts/Pigeons**: via `ghostConfig`/`pigeonConfig`
- **Carrot zones** (`carrotZones`): boosted carrot spawn likelihood
- **No springs** (`noSprings`), custom hazard skins (`drawCustomThorn`/`drawCustomSpring`)
- **Physics modifiers** (`physics`): gravity, friction, walkSpeed, jumpImpulse multipliers
- **Bubble helmet** (`bubbleHelmet: true`): glass dome on all characters (used by underwater + space station)

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

### Adding per-arena ambient sounds
Arena packs support ambient sounds via `ArenaPack.ambientSoundConfig`:
- **Loops** (`loops: string[]`): continuous background sounds, started in `GameLoop.start()`, stopped in `stop()`
- **Periodic** (`periodic: [{sound, intervalRange}]`): one-shots fired at random intervals, ticked in `fixedUpdate()`
- Sound generators go in `audio.ts`, config in each arena pack file in `src/engine/arenas/packs/`
- All active loops tracked in `GameLoop.activeAmbientLoops[]` and stopped on match end

### Adding arena MP3 music
1. Place MP3 in `public/audio/<arenaId>.mp3`
2. Set `musicFile: '<arenaId>.mp3'` in the arena pack file

### Adding a new language
1. Create `src/locales/<code>.json` — copy `en.json`, translate all keys. Verify key count matches with a script.
2. Import in `src/i18n.ts`, add to `resources` object. Language persisted in `bunnybrawl_lang` via `localStorage`.
3. Add to the `languages` array in `MainMenu.tsx` lang-toggle (data-driven `.map()` loop — code, label, flag SVG).
4. Add `<code>` key to `translations` in all 17 character packs in `src/engine/characters/packs/` and all 11 arena packs in `src/engine/arenas/packs/`.
5. **Arena names must fit the selector boxes** — test at runtime, shorten long names.
6. **Avoid literal translations** — use natural/colloquial phrasing. Gaming terms (gravity, stomp, kills) often stay in English or use loan words. Academic translations (गुरुत्वाकर्षण, भौतिकी, pisika) sound wrong in a game UI.

### Network multiplayer architecture
Online play uses P2P WebRTC via PeerJS with GGPO-style rollback netcode:

**Flow**: MainMenu (Online modal) → OnlineLobby (auto-create/join) → CharacterSelect (1 player, any keys) → Match (NetMatch drives GameLoop)

**Key files**: `net/prng.ts` (seeded PRNG), `net/serialize.ts` (snapshots), `net/transport.ts` (WebRTC), `net/rollback.ts` (input buffer + resimulation), `net/netMatch.ts` (orchestrator)

**Determinism**: 12 gameplay-affecting `Math.random()` calls replaced with `this.gameRandom()` (seeded in network mode, `Math.random()` in local). Cosmetic randomness (~234 calls) left as `Math.random()`.

**GameLoop network mode**:
- `setNetworkMode(true)` → `start()` skips internal RAF loop
- `fixedUpdate(dt, networkInputs?)` → accepts explicit inputs from rollback engine
- `playSound()` wrapper → muted during rollback resimulation via `setAudioEnabled(false)`
- `renderFrame(frameDt?)` → decays `slowMotion`/`screenFlash`/`hitstopZoom` (normally done in `loop()`)
- `resolveStuckPlayer()` failsafe runs after `collidePlatforms()` every frame

**Snapshot convention**: `snapshot[f]` = state at START of frame f (before tick). Snapshots taken BEFORE `fixedUpdate`, never after.

**Transport**: `Transport.setEvents()` re-wires callbacks when transitioning from lobby to match. PeerJS uses default `'binary'` serialization (NOT `'none'` — causes ESM/CJS issues with `sdp` module). Vite config needs `optimizeDeps.include: ['peerjs']`.

**Online lobby (CharacterSelect)**: In online mode, `playersRef.current` has only 1 entry (P1). `drawLobby` must guard against missing players. All 5 key bindings map to P1. START zone sends CHARACTER_SELECT + READY over transport.

**Player names**: `OnlineState.playerNames` maps slot → display name. Set in HANDSHAKE/SLOT_ASSIGNMENT handlers, consumed by `renderer.setPlayerNames()` for HUD and `VictoryScreen.charName()` for results. `RemotePlayerInfo.playerName` carries the canonical name per peer.

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — human P1-P5, bot B1-B5. Use `isBotSlot(slot)`, `getCharacterForSlot(slot)`.
- **Bot characters in `BOT_CHARACTERS` Map** — populated by `assignBotCharacters()`, not in `CHARACTERS` record.
- **Always document lessons** — update `.claude/skills/*.md` after completing features.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~560 lines (orchestrator) + `rendering/` modules ~1900 lines total — `gameLoop.ts` ~1770 lines
- `drawPrimitives.ts` ~990 lines — `CharacterSelect.tsx` ~900 lines
- `audio.ts` ~1050 lines — `VictoryScreen.css` ~520 lines
- Arena pack files ~200-800 lines each (11 arenas in `arenas/packs/`)
- AI: `utility.ts` ~450, `awareness.ts` ~370
- Net: `rollback.ts` ~340, `serialize.ts` ~320, `transport.ts` ~260, `protocol.ts` ~200
