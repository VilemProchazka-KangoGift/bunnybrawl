# Engine Caveats

## Renderer & Sprites
- Sprite drawing dispatches via `getSpriteRenderer(name)` / `getGibRenderer(name)` from character pack registry. Fallback pill-shape for unknown characters.
- `spriteShading.ts`: `fillBodyGradient` for body fill, `drawHighlightSpot` for glint. Gradient edge blended 30% toward `darkColor` (not raw) to avoid harsh contrast on Panda/Cow.
- At 40px character height, subtle effects become prominent. Highlight spots must be ≤0.18 alpha. Stipple dots and outer glows look bad.
- Bubble helmet drawn at end of `drawCharacterSprite` for `space_station` and `underwater` themes only.
- Day/night rendering must check `this.theme.dayNight.enabled` before drawing. "Remove day/night" also means hide sun/moon from `drawFarBackground`.

## Game Loop
- `fixedUpdate` returns early when `matchOver` — timers that should keep running (screenFlash, slowMotion) must be decayed in `loop()` instead.
- Stomps must be checked BEFORE `collidePlayersHorizontal`; collision skips when vertical overlap < 50% (stomp zone).
- Never splice/shift `splatMarks` during `fixedUpdate` — multiple ticks per frame + `newSplatsSinceRender` stores indices. Cap array in render path only.
- `GameLoop.stop()` must stop ALL looping sounds — music, ambient, wind, zero_g, crowd, plus all theme `activeAmbientLoops`.
- Entity cleanup uses `swapRemove(arr, i)` in reverse-iterate loops. O(1), no order. Never `.filter()` per frame.
- New particles: always use `this.emitParticle()`, never `this.particles.push({})`.

## Physics & Mechanics
- Hitstop is per-player (`Player.hitstopTimer`, ~7 frames). Physics skipped but visual timers (`damageFlashTimer`, `burnTimer`) still tick. Multi-kills use `Math.max`.
- Side squash: `Player.sideSquash` triggered by wall collision (0.75) or push (0.8). Add `sideSquash: 1` to test helpers for new Player fields.
- Hazard zone collision inset 12px on each side. Lava sets `burnTimer` + `slowTimer`; thorns/ghosts only `slowTimer`.
- Ghost/hazard hits apply knockback + screen flash; thorns only slow.
- Effect zones: zero-G boosts vy\*1.03 / slows vy\*0.92, currents add vx force, geysers set vy directly. Cached as class fields — never re-filter per frame.
- Spring collision uses `bounceTimer` cooldown (0.3s). Spring spawn requires 200px vertical clearance.
- Scoring: kill = 2pts, carrot = 1pt, fall-off = respawn only. Default kill limit 16.
- `MatchState.bouncyWobble` is a Map (non-serializable).
- Game mods are runtime-only via `eff*` multipliers — never mutate base constants or arena definitions.

## Characters
- Pack registry must be initialized before use — `registerBuiltinCharacters()` called at module scope in `App.tsx`.
- Character sounds stay in `audio.ts` (`SIMPLE_ANIMAL_SOUNDS` / `SEGMENT_ANIMAL_SOUNDS`), NOT in packs.
- `legacy.ts` CHARACTERS record is mutated at lobby exit (intentional). `getAllCharacters()` derives full roster from pack registry.
- Character emoji: use `getCharacterEmoji(name)` from `characters/registry.ts` — single source of truth. Used in React components with `.row-emoji` CSS class.
- Legs: shared `drawLegs()` in `characters/legRenderer.ts`, configured by `CharacterPack.legStyle` (shape, footStyle, dimensions). Called from both renderer.ts and CharacterSelect.tsx. Must be a pure function (output is sprite-cached).
- Rayman-style nub legs: defaults are 6px wide × 4px tall × 2px foot. When `legH <= 5`, all filled shapes (rounded/tapered/wide) render as ellipses — quad curves are invisible at this scale. Animation amplitudes are halved vs. original long-leg values. Hip attachment at `h * 0.82`.
- When scaling leg dimensions, scale animation amplitudes proportionally — large bounce/swing on tiny legs looks jittery. Also reduce squash expansion factors.
- Owl claws use explicit `footWidth`/`footHeight` overrides to stay prominent at nub scale. The claw renderer's stroke width and splay angles matter more than leg size for visual identity.

## Audio
- All procedural sounds are Float32Array → WAV data URI → Howler.js. No MP3 for SFX.
- Frequencies below 100Hz are inaudible on laptop speakers. Use 130Hz+ for thuds/impacts. Calibrate: generation amplitude * Howl volume should be ≥0.05 for one-shots.
- SFX cooldowns use per-player `Map<PlayerSlot, number>` (like `footstepAccumulators`) or a global number. Decay with `dt` every frame. Sound plays only when cooldown ≤ 0. Decay cooldowns BEFORE the hitstop `continue` so they don't accumulate during hitstop.
- Ambient sounds: `ArenaPack.ambientSoundConfig` with `loops` (continuous) and `periodic` (random interval one-shots). Loops tracked in `activeAmbientLoops[]`, all stopped in `stop()`. Periodic timers in `periodicAmbientTimers` Map, ticked at end of `fixedUpdate()`.
- Player-push bump sound uses global cooldown (not per-player) to prevent double-fire from both pushed players in the same frame. Detects push via `sideSquash === 0.8` (exact value set by `collidePlayersHorizontal`).
- All 11 arenas + menu have MP3 music. Each arena pack specifies `musicFile` (e.g. `'meadow.mp3'`), resolved by `audio.playMusic()` via `getArenaPack()`. Menu music uses a separate `menuMusicHowl` preloaded in `init()` — not tied to component lifecycle (persists across menu↔lobby). Suno generation prompts are in `docs/suno-arena-prompts.md`.
- `Howler.mute()` is the global kill switch for all audio. Three independent mute sources: `muted` (user toggle), `backgroundMuted` (tab hidden via visibilitychange), `gamePaused` (pause overlay). All three must be false before calling `Howler.mute(false)`. Adding a new mute source? Check all unmute paths gate on it.
- Music preference persisted in `carrotroyale_music_disabled` (localStorage). Loaded at AudioManager field init, not in `init()`. Wrap localStorage access in try/catch for restricted contexts.

## Arenas
- Arena pack registry must be initialized before use — `registerBuiltinArenas()` called at module scope in `App.tsx`. Nav data is embedded in each pack's `navData` field and auto-registered.
- `ArenaPack` in `arenas/types.ts` merges layout (platforms, spawns) + visuals (sky, draw functions) + translations + musicFile into one interface. `toArena()` / `toThemeConfig()` extract the old types for consumers that need them.
- `platforms[0]` is always ground (or first ground segment, detected by `p.y >= 650`).
- `allowFallOff` arenas: set `hills[].baseY` to 780+ to push hills offscreen.
- Tall narrow platform collision: `landingFromAbove` guard prevents side-approach snapping. Prefer wider-than-tall blocks.
- Solid building blocks need `noSpawnZones` covering interiors.
- `arenaId: 'random'` resolved in `Match.tsx` via `resolveArenaId()`, not in store.
- `themes/` directory still exists for shared infrastructure: `types.ts` (ThemeConfig interface used by Renderer), `drawPrimitives.ts` (shared draw functions), `utils.ts` (utility functions). Individual theme files are gone — visuals live in arena pack files.

## AI
- Awareness uses single pass over `state.players` — no `.filter()` loops.
- Evaluators must not allocate arrays — runs 60x/bot/sec.
- Jump suppression: 3 layers (tight-space check, threshold 0.55, cooldown 20 frames).
- Stuck recovery: nav-directed jump after 45 frames of <2px movement.
- Chase/priority evaluators defer to nav when enemy on different level (|dy| > 40).
- Fat bots flee like hurt bots (skip chase/stomp/platformSeeking).
- Nav data in pack files (between `NAV-DATA-START`/`NAV-DATA-END` markers) is generated — never hand-edit. Re-run `npx vite-node scripts/generateNavData.ts` after arena/physics changes.
- Nav graph doesn't model intra-platform obstacles or blocking ceilings. Small obstacles handled by stuck recovery; impassable barriers require splitting ground in arena definition.
- Nav ceiling gap must exceed 174px (MAX_JUMP_HEIGHT) or phantom edges are created.
- Lobby bots (`updateBotLobbyAI()` in CharacterSelect) are completely separate from match AI.

## Performance
- Sprite cache: keyed by `name_state_animFrame_fastFalling_idleKey_sqKey`, 600-entry cap. `sqKey` = `Math.round(squashScale * 10)`. Breathing (2% scale) excluded from key.
- Gradient cache: lava, zero-G, ghost, bouncy gradients cached in Maps by position.
- HUD cache: 1280x90 OffscreenCanvas, redraws on score/timer/player changes.
- Particle pool: free-list via `emitParticle()`, capped at 300.
- Platform filter cache: `getFloatingPlatforms()` uses WeakMap.
- AI throttle: decisions every 3rd frame, staggered by `botIndex % 3`.
- globalAlpha: bake into `rgba()` fillStyle, don't mutate `ctx.globalAlpha` per element.
- Off-screen culling for particles and gibs.
- `fastMath.ts`: lookup tables for `fastSin`/`fastCos` — visual effects only, keep `Math.sin`/`Math.cos` for physics.

## Mobile / Touch Input
- `TouchInputManager` follows same `attach()`/`detach()`/`getInput() → InputState` contract as `InputManager`. Integrated via `getPlayerInput()` touch branch in gameLoop.
- `isTouchPrimary()` result is cached at module scope — safe to call frequently, but `?mobile` URL param override only works on first call.
- Touch coordinate mapping: cache `getBoundingClientRect()` on attach + resize. NEVER call per-touch-event (causes layout reflow at 60-120Hz).
- `e.preventDefault()` on touch events blocks synthetic click events on buttons. Always check `target.tagName === 'BUTTON'` before preventing default.
- `haptics.isLocal(player.id)` gates all vibration calls — only vibrate for events involving the local touch player. Haptic calls are inside event-conditional blocks (stomp, hazard hit, spring, landing) — they do NOT run every frame per player.
- `touchSlot` defaults to the first human player (P1). For online guests, call `setLocalSlot(slot)` after GameLoop creation — otherwise touch input targets P1 (the host) instead of the guest's actual slot.
- **`getInputAny()` must use `getInputForPlayer(airborne)`, not raw `getInput()`.** Guests send `getInputAny()` to the host for network input. If it reads raw input, the airborne-tap→fast-fall conversion is lost — physics receives `{jump: true}` on an airborne player (ignored) instead of `{down: true}` (fast-fall). The touch player's airborne state is looked up via `touchSlot` from `state.players`.

## Network Multiplayer (Host-Authoritative)
- **Architecture**: Host runs full GameLoop (identical to local play), broadcasts binary snapshots to guests every tick. Guests interpolate between snapshots and send inputs to host. No determinism requirements — host is the single source of truth.
- **ICE servers**: `ICE_SERVERS` in transport.ts configures STUN + TURN. TURN required for mobile-to-mobile (symmetric NAT). Currently uses free metered.ca Open Relay.
- **Trystero MQTT signaling**: Replaced PeerJS. Serverless, zero infrastructure. Vite config needs `optimizeDeps.include: ['trystero']`.
- `fixedUpdate` is public in network mode. Accepts optional `networkInputs` map — host provides guest inputs via `HostAuthority.getNetworkInputs()`.
- `renderFrame(frameDt)` must receive frame delta in network mode to decay `slowMotion`/`screenFlash`/`hitstopZoom` (normally decayed in `loop()`).
- **`getInputAny()` must merge touch + keyboard input.** Guests send `getInputAny()` to host. If touch input isn't merged, mobile guests send empty inputs.
- **Timer decrements MUST use `Math.max(0, ...)`** to prevent negative values. `Math.fround()` can produce small negatives (e.g. -0.017). Negative timers encoded as Uint8 wrap to 255 in snapshots, causing permanent visual artifacts on guests. `encodeTimer()` has defense-in-depth `if (timer <= 0) return 0`.
- **Host input fairness delay**: Host buffers own inputs in a ring buffer, reads `delayFrames` behind. Delay adapts to guest RTT.
- **Guest loop**: No fixedUpdate — only interpolate snapshots + render. Decays visual timers locally between snapshots.
- **Snapshot encoding**: Player timers as Uint8 frame counts (`Math.round(timer * 60)`, 0-255). Positions as Float32.
- **Interpolation**: `EntityInterpolation` buffers snapshots, renders 2 frames behind latest. Only x/y/vx/vy are lerped; timers/state use "after" snapshot.
- `Transport.setEvents()` re-wires callbacks when transitioning from OnlineLobby to Match.
- NEVER echo HANDSHAKE messages — creates infinite ping-pong.
- Character selection messages must NOT auto-switch and re-send — creates infinite cascade.
- React `useCallback` closures capture stale Zustand state. Use refs for network callbacks.
- React Strict Mode double-invokes effects. Setup + cleanup MUST be in ONE `useEffect`.
- **Host must send authoritative roster in START_MATCH.** Guest applies `roster` directly.
- **CHARACTER_SELECT relay must exclude sender.** Otherwise creates echo loops.
- **Host relay must exclude the sender** when forwarding unreliable messages.
- **SETTINGS_SYNC must resolve `arenaId: 'random'`** to a concrete ID before sending.
- **Match end must suppress stall detection** (`netMatch.setMatchOver()`). Guard callbacks with `matchEnded` flag.
- Network simulator: `?simLatency=50&simJitter=20&simLoss=5` URL params.
- Debug overlay: `?debug=net` URL param. Toggle with `` ` `` key.
- E2E online tests in `e2e/online-multiplayer.spec.ts`.
- `window.__gameStore`, `window.__gameLoop`, `window.__netMatch` exposed for E2E.
- **`Math.fround()` covers all simulation-affecting arithmetic.** Nest fround for FMA prevention: `f(a + f(b * c))`. `const f = Math.fround` in physics.ts, gameLoop.ts, stomp.ts, hazardCollision.ts.
- **ARM FTZ**: Snap `|vx|, |vy| < 1e-4` to 0 after physics, before `updatePlayerState()`.
- **NEVER use float `===` float in collision.** Use index-based selection instead of value comparison.
- **`FIXED_TIMESTEP` must be pre-frounded** (`Math.fround(1/60)`). The constructor calls `gameRandom()` to initialize ghosts, lava rocks, geyser timers. If `this.rng` is undefined during construction, these calls fall back to `Math.random()` — producing different initial state on each peer. The `rng` parameter in the constructor sets `this.rng` before any `gameRandom()` calls.
- **Spawn retry loops must consume a fixed number of `gameRandom()` calls.** `spawnSpring`/`spawnThorn` retry up to `SPAWN_RETRY_ATTEMPTS` times, calling `gameRandom()` per attempt. If `playerNearSpawn()` returns different results on each peer (due to float precision in player positions), different retry counts consume different RNG calls — permanently desyncing the PRNG. Fix: pre-generate all random candidates before validation, so RNG call count is always `SPAWN_RETRY_ATTEMPTS * 2`.
- `renderFrame(frameDt)` must receive frame delta in network mode to decay `slowMotion`/`screenFlash`/`hitstopZoom` timers (normally decayed in `loop()` which doesn't run in network mode).
- `resolveStuckPlayer()` runs after `collidePlatforms()` — ejects players deeply embedded (>5px) in platforms. Catches desync-related position errors.
- Snapshot convention: `snapshot[f]` = state BEFORE tick f. Taking snapshots AFTER `fixedUpdate` and storing at the same frame index causes compounding timer drift (each rollback adds +1dt). Always take before tick.
- `Player.disconnected` must be in snapshots — prevents respawn in `stomp.ts`.
