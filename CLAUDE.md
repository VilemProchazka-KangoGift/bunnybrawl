# Carrot Royale — Claude Development Guide

## Project Overview

Carrot Royale is a local-multiplayer party game inspired by Jump'n'Bump (1998). Up to 5 players share one keyboard, controlling cartoon animals on a 2D platformer arena. The goal: land on opponents' heads to splat them.

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
      operations.ts # Arena lookup + transformations: getArena(), getTheme(), mirrorArena()
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
    gameLoop/     # Game loop system (decomposed from monolithic gameLoop.ts)
      GameLoop.ts   # Orchestrator: fixed timestep, per-player physics, system iteration
      types.ts      # GameplaySystem + CosmeticSystem interfaces (init/update/cleanup)
      initialState.ts # Pure MatchState + Player[] constructors + computeEffectivePhysics()
      index.ts      # Barrel export
      cosmetics/    # Cosmetic systems (driven by cosmeticStep)
        ParticleSystem.ts      # Owns particle pool, gibs, VFX emission, collision particles
        PlayerTransitionSystem.ts # Owns prevCosmeticState, sfxCooldowns, transition detection
        PlayerCosmeticSystem.ts   # Owns afterimage/footstep accumulators
        EntityTransitionSystem.ts # Owns prevEntityState, spring/countdown/matchOver sounds
        EnvironmentSystem.ts      # Wildlife, fog, pollen, shooting stars, shockwaves
        particles.ts  gibs.ts  environment.ts  sfx.ts  # Pure functions (used by systems)
        playerTransitions.ts  playerCosmetics.ts  entityTransitions.ts
      gameplay/     # Gameplay systems (driven by fixedUpdate)
        HazardSystem.ts        # Owns floatingPlatforms, spring/thorn spawn
        CarrotSystem.ts        # Carrot spawn + VFX
        ArenaEntitySystem.ts   # Owns cached zones, lava rocks, ghosts, geysers, pigeons
        EffectZoneSystem.ts    # Zero-G, currents, geysers per-player + zero-G sound
        PlayerCollisionSystem.ts # All hazard collision handlers per-player
        StompSystem.ts         # Stomp detection, kill feed, player-player collision
        MatchSystem.ts         # Crowd cheering, ambient sounds, match end
        hazards.ts  carrots.ts  arenaEntities.ts  effectZones.ts  # Pure functions
        playerCollisions.ts  stomps.ts  match.ts
    audio.ts      # Re-export shim → audio/ directory
    audio/        # Audio system (decomposed from monolithic audio.ts)
      AudioManager.ts   # Singleton: play/stop/mute/pause + Howl map + visibility
      MusicManager.ts   # Menu + arena music lifecycle (delegates from AudioManager)
      soundRegistry.ts  # Declarative SFX table + character pack sound init
      types.ts          # SoundName union, ToneSegment interface
      synthesis/        # Pure procedural audio generators (no Howler dependency)
        core.ts         # generateToneBuffer, generateMultiSegmentTone
        wav.ts          # floatBufferToWavDataUri (Float32Array → WAV data URI)
        sfx.ts          # Gameplay SFX generators (jump, stomp, land, etc.)
        ambient.ts      # Ambient loop generators (wind, lava, underwater, etc.)
        periodic.ts     # Periodic one-shot generators (bird chirp, ghost, etc.)
    spriteShading.ts # fillBodyGradient (radial body fill) + drawHighlightSpot (white glint)
    fastMath.ts   # Trig lookup tables (fastSin/fastCos) for hot render paths
    renderScale.ts # Backing-store scale (1×–2×). applyRenderScaleToCanvas() helper + subscribeRenderScale()
    canvasAnimations.ts # Shared canvas utilities (wildlife, day/night) for MainMenu + CharacterSelect
    lobbyGame.ts  # Lobby simulation orchestrator — LobbyGame class, stomp/swap, ready-zone countdown
    lobbyConstants.ts # Layout constants, LOBBY_ARENA stub, READY_ZONE_X, BOT_PAUSE_CHANCE
    lobbyBots.ts  # botLobbyInput + wanderInput (pure input generators)
    lobbyRender.ts # drawLobby + gradient cache — all canvas rendering for the lobby
    debugFlags.ts # Dev-only flags from URL params (?debug=nav)
    navDebugOverlay.ts # Nav graph debug overlay renderer
    characters/   # Character pack system (registry-based, extensible)
      types.ts      # CharacterPack interface, CharacterRenderer/GibRenderer function types
      registry.ts   # Pack registry: register/get/list + convenience lookups (emoji, eyes, splat, gibs)
      builtin.ts    # Registers all 17 built-in characters at app startup
      fallbacks.ts  # Fallback pill-shape renderer for unknown/unregistered characters
      defaults.ts   # CHARACTERS record (P1-P5 defaults), assignBotCharacters, getCharacterForSlot
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
      drawPrimitives/ # Shared drawing functions (split by category, re-exported via index.ts)
        background.ts # Trees, bushes, flowers, mushrooms, grass, hills, clouds, moss
        foreground.ts # Tall grass, ferns, hanging vines, leaf clusters, stumps
        winter.ts     # Pine, christmas trees, snowballs, ice, snow drifts, igloos, snowmen
        hazardFactories.ts # createThornRenderer, createSpringRenderer
        index.ts      # Barrel export
      utils.ts      # Shared utilities (randRange, pickWeighted, swapRemove, getFloatingPlatforms)
    input/        # Unified PlayerInput abstraction (Phase 2 of headless refactor)
      PlayerInput.ts   # Interface: { slot, getAction(state) -> InputState, dispose? }
      KeyboardManager.ts # Owns window listeners + per-slot pressed-key state (5 slots)
      KeyboardInput.ts # PlayerInput backed by a slot's KEY_BINDINGS
      RuleBasedBot.ts  # PlayerInput wrapping AIController; setArena() on switchArena
      RemoteInput.ts   # PlayerInput backed by ReadonlyMap<slot, InputState> buffer (host netcode)
      RandomInput.ts   # Synthetic PlayerInput with seeded RNG + tunable jump/move/down probs
      index.ts         # Barrel export
    simulator/    # Pure simulation core — Node-safe, no browser/audio imports
      Simulator.ts     # Owns: state, settings, arena, RNG, AI controllers, PlayerInputs,
                       # all 7 gameplay systems. Side effects (audio, phase, match-end,
                       # particles, haptics) routed through SimulatorEvents/ParticleEmitter
                       # interfaces — no direct audio.* or browser API calls.
      types.ts         # SimulatorEvents (7 callbacks), SimulatorOptions, ParticleEmitter,
                       # TouchInputProvider, HapticEmitter interfaces
      index.ts         # Barrel export
    headless/     # Headless ML-driven simulation runner (Phase 4)
      HeadlessRunner.ts # Drives Simulator until matchOver/maxTicks. Optional recording:
                        # observation snapshot + action capture + reward shaper per slot.
      observation.ts    # extractObservation(state, slot, arena, settings, out): writes 98-float
                        # egocentric Float32Array. wrapDx for horizontal arena wrap.
      reward.ts         # RewardShaper class with tunable RewardWeights (kill/carrot/death/
                        # win/loss/survival/airborne shaping). Per-slot stateful.
      policy.ts         # BatchedPolicy interface (one forward pass per tick fills all slots)
                        # + PolicyBroker orchestrator + PolicyInput per-slot adapter
      recording.ts      # MatchRecorder interface; InMemoryRecorder + NDJSONFileRecorder
                        # (line-delimited JSON via node:fs, multi-million-sample friendly)
      types.ts          # MatchResult, HeadlessRunnerConfig, RecordingConfig
      index.ts          # Barrel export
    net/          # Host-authoritative network multiplayer (WebRTC via Trystero MQTT)
      core/             # Generic netcode core (zero game imports — reusable library foundation)
        types.ts          # Generic interfaces: Simulation, SnapshotCodec, InterpolationConfig, InputCodec
        protocol.ts       # CoreMsgType constants, ping/pong/snapshot-ack encoding
        interpolation.ts  # SnapshotInterpolation<T> ring buffer with adaptive delay
        deltaCompression.ts # XOR+RLE delta codec for binary snapshots
        networkSimulator.ts # Latency/jitter/loss simulator (?simLatency, ?simJitter, ?simLoss)
        debugOverlay.ts   # NetDebugStats type + canvas debug overlay (?debug=net)
        index.ts          # Barrel export
      protocol.ts       # Game-specific: MsgType (extends CoreMsgType), input encoding, message interfaces
      transport.ts      # Trystero MQTT signaling, WebRTC data channels, RTT/jitter
      hostAuthority.ts  # Host: runs simulation, buffers guest inputs, broadcasts snapshots
      interpolation.ts  # Game-specific: entity interpolation, extrapolation, applySnapshotToState
      snapshot.ts       # Binary snapshot encode/decode, Uint8 timer compression
      netMatch.ts       # Orchestrator: host loop (simulate+broadcast) or guest loop (interpolate+render)
      inputEcho.ts      # Guest visual feedback without position prediction (facing, anim, squash)
      prng.ts           # SeededRNG (used for local-mode determinism)
      serialize.ts      # Legacy GameSnapshot take/restore (local-mode, test-only)
      index.ts          # Barrel export
    index.ts      # Public API barrel export
  hooks/
    useScaler.ts  # Viewport scaling + fullscreen API hook
    useCanvasRenderScale.ts # Wires a canvas backing-store to global render scale
  components/     # React components (menus/HUD only — canvas is imperative)
    GameScaler.tsx      # Viewport-responsive wrapper (CSS transform scaling)
    MainMenu.tsx        # Title screen with Play/Online buttons, blood toggle, language switch
    menuBackground.ts   # Procedural animated background for MainMenu (hills, trees, wildlife, day/night)
    HelpModal.tsx       # How-to-play modal (static, presentational)
    ModsModal.tsx       # Match mods toggles modal
    OnlineModal.tsx     # Online multiplayer lobby modal (UI only — network logic in useOnlineRoom)
    useOnlineRoom.ts    # Hook: Transport lifecycle + protocol handlers + host/guest startMatch
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
- **High-DPI render scale** — canvas backing stores are `1280×720 × min(devicePixelRatio, 2)` on desktop, 1× on touch. Logical coords stay 1280×720 via `ctx.setTransform`. New canvases must use `useCanvasRenderScale(ref)` (React) or `applyRenderScaleToCanvas(canvas, ctx, scale)` (engine).
- **i18n via i18next** — Czech default. Canvas text uses `i18n.t()` directly (not the React hook).
- **Character pack registry** — `CharacterPack` objects bundle colors, emoji, renderers, gibs, AI personality. Registered at startup via `registerBuiltinCharacters()`. Renderer dispatches via `getSpriteRenderer(name)`.
- **Arena pack registry** — `ArenaPack` objects bundle layout + visuals + translations + music + physics mods. Registered at startup via `registerBuiltinArenas()`. Mirrors the character pack pattern. Shared drawing primitives in `themes/drawPrimitives.ts`.
- **AI via utility scoring + nav graph** — bots produce `InputState` (4 booleans) same as keyboard. Precomputed nav data (in each arena pack's `navData` field) provides nextHop/safeHop waypoints.
- **Death effects are gore-mode gated** — Gore ON: blood, gibs, splat marks. Gore OFF: confetti only.
- **Host-authoritative network multiplayer** — WebRTC DataChannels via Trystero (serverless MQTT signaling). Host runs full simulation and broadcasts binary snapshots every tick. Guests interpolate between snapshots and send inputs to host. No determinism requirements — host is the single source of truth. 2-player MVP, bots run on host only.
- **cosmeticStep architecture** — Both host and guest call `gameLoop.cosmeticStep(dt)` for all SFX, particles, VFX. Host calls after `fixedUpdate()`, guest calls after `applySnapshotToState()`. Transition detection via prev-state comparison. No separate GuestSFX module.
- **Mobile support** — `?mobile` URL param forces mobile mode. `isTouchPrimary()` detects coarse-pointer devices. `.is-mobile` CSS class on `<html>` for platform-conditional styles. Touch controls via `TouchInputManager` (same `InputState` interface as keyboard/AI). Haptic feedback via Vibration API.
- **Hexagonal Simulator extraction (Solution C)** — `Simulator` (in `src/engine/simulator/`) is the pure simulation core: owns MatchState, RNG, AIControllers, PlayerInputs map, all 7 gameplay systems. Zero browser/DOM/audio imports — verified by `regression-no-browser-apis.test.ts`. Side effects flow through `SimulatorEvents` (audio request callbacks: sfx, music start/stop, all-sounds-stop, phase change, match end, player landing for haptics) and `ParticleEmitter` interface. `GameLoop` becomes a browser adapter: owns Renderer, RAF loop, KeyboardManager, TouchInputManager, ParticleSystem + 4 cosmetic systems; constructs Simulator and subscribes to events. Public GameLoop API is preserved (Match.tsx / NetMatch unchanged); methods delegate to `simulator.*`.
- **PlayerInput abstraction (Phase 2)** — All input sources (keyboard, rule-based AI, network remote, ML policy, synthetic random) implement the `PlayerInput` interface (`{ slot, getAction(state) → InputState }`). `Simulator` holds `Map<PlayerSlot, PlayerInput>`. The browser-side touch and host-side network input overrides remain explicit special cases inside Simulator's per-player loop because they depend on per-tick state (touchInput airborne flag, network input buffer freshness).
- **Headless ML pipeline** — `HeadlessRunner` composes `Simulator` + per-slot `PlayerInput`s for Node self-play. Observation extraction writes 68-float egocentric `Float32Array`s into caller-provided buffers (zero per-tick alloc). Recording: observations + captured actions + reward-shaper outputs persisted via `InMemoryRecorder` (tests) or `NDJSONFileRecorder` (training data). `BatchedPolicy` interface enables one neural-net forward pass per tick across all slots; `PolicyBroker` extracts observations into a flat batch and distributes actions via per-slot `PolicyInput` adapters. Run `npx vite-node scripts/selfPlay.ts` for the example pipeline.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
npm test          # Unit/integration tests (~2000 tests, Vitest)
npm run test:e2e  # E2E tests (~120 tests, Playwright, builds first)
npx vite-node scripts/generateNavData.ts  # Regenerate AI nav data (after arena/physics changes)
npx vite-node scripts/selfPlay.ts -- --episodes 5 --arena meadow --out data/run.ndjson  # Headless self-play data generation (see docs/headless-recording-format.md for format + CLI flags)
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
- `MainMenu.test.tsx` and `VictoryScreen.test.tsx` have a known pre-existing failure (logo.png import denied by Vite test transform).
- **GameLoop tests** require mocking `audio`, `renderer`, `howler`, and `HTMLCanvasElement.prototype.getContext`. See `gameLoop.test.ts` top for the full mock block. Always call `loop.stop()` in `afterEach` to prevent keydown listener leaks.
- **Audio tests** — the `AudioManager` singleton creates a `menuMusicHowl` at field init time (before tests run), so the `Howl` mock must be a real constructor function (not arrow), and tracking instances requires `globalThis` (vi.mock factories run before `const` declarations).
- **Registry tests** — character/arena registries use module-scoped Maps with no `clear()`. Use unique pack names per test to avoid collisions. Count-based assertions should use `toBeGreaterThanOrEqual`, not exact counts.
- **Character pack names are capitalized** — `getCharacterPack('Bunny')` not `'bunny'`.
- **E2E shortcuts** — `/?arena=meadow&bots=2&killLimit=4` auto-starts a match (skips lobby). Requires `arena` param to trigger. Use `window.__gameLoop.getState()` and `window.__gameStore.getState()` for in-match assertions.
- **E2E countdown waits** — use `page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0)` instead of `waitForTimeout(4000)`.
- **E2E flakiness** — online multiplayer tests (`@online`) are inherently flaky due to Trystero MQTT signaling. New E2E tests should use URL param auto-start and `waitForFunction` polling over hardcoded waits.
- **Interpolation tests** — snapshots pushed in rapid succession have near-identical frame numbers relative to delay. Assert value ranges, not exact lerp results.
- **E2e tests require `npm install`** — `@trystero-p2p/mqtt` types must be installed for `tsc -b && vite build` to succeed. CI handles this automatically but local runs fail without it.
- **Vitest mock constructors** — `vi.fn(() => instance)` fails with `new`. Use `class MockX { constructor() { Object.assign(this, mockInstance); } }` instead.
- **Vitest partial mocks** — `vi.mock('./mod', async (importOriginal) => ({ ...(await importOriginal()), fn: vi.fn() }))` preserves un-mocked exports. Access mocked fns via `const mod = await import('./mod'); vi.mocked(mod.fn)`.
- **Arena IDs are snake_case** in URL params and registry: `space_station`, `candy_land`, `haunted_graveyard`.
- **Nav data tests** must call `registerArena()` with `navData` — `getArenaNav(id)` reads from the registry Map, not from the arena object.
- **Coverage config** (`vitest.config.ts`) excludes `arenas/packs/**` and `characters/packs/**` — canvas drawing code, not meaningful to unit test.
- **E2E online diagnostics** — `window.__netMatch.getStats()` for RTT/frame/snapshot stats. `?simLatency=80&simJitter=20` simulates network conditions. `?debug=net` shows overlay.

## Common Patterns

### Adding a new character
Each character is a single file in `src/engine/characters/packs/` exporting a `CharacterPack`.

1. Create `packs/newAnimal.ts` — copy an existing pack (e.g. `bunny.ts`). Provide:
   - `drawSprite: CharacterRenderer` — pure function, sprite-cached. Receives `(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors)`.
   - `drawGib: GibRenderer` — draws ear/tail/horn gibs. ctx already translated+rotated.
   - Data: `name`, `color/darkColor/lightColor`, `emoji`, `customEyes`, `splatShape`, `gibs[]`
   - Optional: `idleActions: { weights?: { stretch?: 0, ... }, custom?: [...] }` — override per-action weights (0 disables) or add signature actions. Defaults to all 6 shared actions weighted 1.0 if omitted.
   - `translations: { en: 'Name', cs: 'Jméno' }`
2. Import and add to `BUILTINS` array in `characters/builtin.ts`
3. Add `createSound` field — returns `new Howl(...)`. Use `generateToneBuffer()` or `generateMultiSegmentTone()` from `audio/synthesis/core`, or custom synthesis with `floatBufferToWavDataUri()` from `audio/synthesis/wav`. Add the character name to `SoundName` union in `audio/types.ts`.

**Rendering contract:**
- `customEyes: true` = renderer draws its own eyes; `false` = generic dots drawn after sprite.
- Idle actions are picked randomly from a per-pack pool (default: all 6 shared actions in `rendering/idleActions.ts`). The pack's `drawSprite` receives `isIdleAnim` (boolean) and `idleT ∈ [0, 1]` (action progress) for in-sprite tweaks like ear-twitch / tail-wag. Note: `idleT` flows through the sprite cache, so the in-sprite tweak only sees a 1-bit on/off (idleT ranges over the action duration but the cache key is binary). Big animated transforms belong in shared idle actions, not in `drawSprite`.
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
1. Add to `SoundName` union in `audio/types.ts`
2. Write the generator function in the appropriate `audio/synthesis/` file (sfx, ambient, or periodic)
3. Add entry to the declarative table in `audio/soundRegistry.ts`
4. Call `audio.play('name')` in `gameLoop.ts`
4. **Volume calibration**: test on laptop speakers. Frequencies below 100Hz are inaudible on most laptop speakers — use 130Hz+ for thuds/impacts. Generation amplitude * Howl volume should be ≥0.05 effective for one-shots, ≥0.02 for ambient loops. Reference: existing `jump` sound = square wave 0.25 amplitude * Howl 0.3 = 0.075 effective at 300-600Hz.
5. **Cooldown for rapid-fire SFX**: use per-player `Map<PlayerSlot, number>` accumulators (like `footstepAccumulators`), or a global cooldown number. Decay every frame. Sound plays only when cooldown ≤ 0.

### Adding per-arena ambient sounds
Arena packs support ambient sounds via `ArenaPack.ambientSoundConfig`:
- **Loops** (`loops: string[]`): continuous background sounds, started in `GameLoop.start()`, stopped in `stop()`
- **Periodic** (`periodic: [{sound, intervalRange}]`): one-shots fired at random intervals, ticked in `fixedUpdate()`
- Sound generators go in `audio/synthesis/` files, config in each arena pack file in `src/engine/arenas/packs/`
- All active loops tracked in `GameLoop.activeAmbientLoops[]` and stopped on match end

### Adding arena MP3 music
1. Place MP3 in `public/audio/<arenaId>.mp3`
2. Set `musicFile: '<arenaId>.mp3'` in the arena pack file

### Adding a new language
1. Create `src/locales/<code>.json` — copy `en.json`, translate all keys. Verify key count matches with a script.
2. Import in `src/i18n.ts`, add to `resources` object. Language persisted in `carrotroyale_lang` via `localStorage`.
3. Add to the `languages` array in `MainMenu.tsx` lang-toggle (data-driven `.map()` loop — code, label, flag SVG).
4. Add `<code>` key to `translations` in all 17 character packs in `src/engine/characters/packs/` and all 11 arena packs in `src/engine/arenas/packs/`.
5. **Arena names must fit the selector boxes** — test at runtime, shorten long names.
6. **Avoid literal translations** — use natural/colloquial phrasing. Gaming terms (gravity, stomp, kills) often stay in English or use loan words. Academic translations (गुरुत्वाकर्षण, भौतिकी, pisika) sound wrong in a game UI.

### Network multiplayer architecture
Online play uses host-authoritative architecture with Trystero MQTT signaling for P2P WebRTC:

**Flow**: MainMenu (Online modal) → OnlineLobby (auto-create/join) → CharacterSelect (1 player, any keys) → Match (NetMatch drives host or guest loop)

**Architecture**: Host runs full GameLoop (identical to local play), broadcasts compact binary snapshots to guests every tick. Guests send inputs to host, interpolate between received snapshots for smooth rendering. No determinism requirements — host is the single source of truth.

**Key files**: `net/transport.ts` (Trystero signaling + WebRTC), `net/hostAuthority.ts` (host input buffering + snapshot broadcast), `net/interpolation.ts` (guest entity interpolation), `net/snapshot.ts` (binary snapshot encode/decode), `net/netMatch.ts` (orchestrator)

**Host loop** (`NetMatch.startHostLoop`):
- Fixed-timestep accumulator drives `gameLoop.fixedUpdate()`
- After each tick: `hostAuthority.broadcastSnapshot(state)` sends binary snapshot to all guests
- Input fairness delay: host buffers own inputs by RTT/2 frames to match guest latency
- Guest inputs buffered in `HostAuthority.guestInputs` Map, read via `getNetworkInputs()`

**Guest loop** (`NetMatch.startGuestLoop`):
- No fixedUpdate — guest only interpolates and renders
- Sends local input to host every frame via `transport.sendUnreliable()`
- Applies interpolated snapshot via `applySnapshotToState()` before rendering
- Decays visual timers locally between snapshots (invincible blink, slow tint, screen shake)
- `renderFrame(dt)` decays `slowMotion`/`screenFlash`/`hitstopZoom`

**Snapshot encoding**: Timers encoded as Uint8 frame counts (`timer * 60`, clamped 0-255). Positions as Float32. All timer decrements use `Math.max(0, ...)` to prevent negative values wrapping to 255 in Uint8.

**Transport**: Trystero MQTT signaling (serverless, zero infrastructure). `Transport.setEvents()` re-wires callbacks when transitioning from lobby to match. Vite config needs `optimizeDeps.include: ['trystero']`.

**Online lobby (CharacterSelect)**: In online mode, `playersRef.current` has only 1 entry (P1). `drawLobby` must guard against missing players. All 5 key bindings map to P1. START zone sends CHARACTER_SELECT + READY over transport.

**Player names**: `OnlineState.playerNames` maps slot → display name. Set in HANDSHAKE/SLOT_ASSIGNMENT handlers, consumed by `renderer.setPlayerNames()` for HUD and `VictoryScreen.charName()` for results. `RemotePlayerInfo.playerName` carries the canonical name per peer.

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — human P1-P5, bot B1-B5. Use `isBotSlot(slot)`, `getCharacterForSlot(slot)`.
- **Bot characters in `BOT_CHARACTERS` Map** — populated by `assignBotCharacters()`, not in `CHARACTERS` record.
- **Always document lessons** — update `.claude/skills/*.md` after completing features.

## File Size Reference

Largest files to be aware of when context is limited:
- `renderer.ts` ~560 lines (orchestrator) + `rendering/` modules ~1900 lines total
- `gameLoop/GameLoop.ts` ~780 lines + `gameplay/` and `cosmetics/` systems ~2000 lines total (`initialState.ts` ~175)
- `themes/drawPrimitives/` ~990 lines across 4 files (winter.ts ~540 is largest)
- `lobbyGame.ts` ~330 + `lobbyRender.ts` ~390 + `lobbyConstants.ts` ~45 + `lobbyBots.ts` ~45
- `Match.tsx` ~600 (canvas mount + online/local lifecycle + pause/reconnect overlays)
- `OnlineModal.tsx` ~365 (UI) + `useOnlineRoom.ts` ~515 (network) — `CharacterSelect.tsx` ~160 (lobby logic moved to engine/)
- `audio/` directory total ~1050 lines (split: AudioManager ~140, MusicManager ~90, soundRegistry ~80, synthesis/ ~700) — `VictoryScreen.css` ~520 lines
- Arena pack files ~200-800 lines each (11 arenas in `arenas/packs/`)
- AI: `utility.ts` ~450, `awareness.ts` ~370
- Net: `snapshot.ts` ~575, `netMatch.ts` ~770, `transport.ts` ~500, `interpolation.ts` ~350
- Hooks: `useTransientBanner.ts` ~30, `useDelayedFlag.ts` ~15
