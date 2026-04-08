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
- Legs: shared `drawLegs()` in `characters/legRenderer.ts`, configured by `CharacterPack.legStyle` (shape, footStyle, dimensions). Called from both renderer.ts and CharacterSelect.tsx. Must be a pure function (output is sprite-cached). Characters with `legWidth >= 7` need the auto-gap logic to prevent blending.

## Audio
- All procedural sounds are Float32Array → WAV data URI → Howler.js. No MP3 for SFX.
- Frequencies below 100Hz are inaudible on laptop speakers. Use 130Hz+ for thuds/impacts. Calibrate: generation amplitude * Howl volume should be ≥0.05 for one-shots.
- SFX cooldowns use per-player `Map<PlayerSlot, number>` (like `footstepAccumulators`) or a global number. Decay with `dt` every frame. Sound plays only when cooldown ≤ 0. Decay cooldowns BEFORE the hitstop `continue` so they don't accumulate during hitstop.
- Theme ambient sounds: `ThemeConfig.ambientSoundConfig` with `loops` (continuous) and `periodic` (random interval one-shots). Loops tracked in `activeAmbientLoops[]`, all stopped in `stop()`. Periodic timers in `periodicAmbientTimers` Map, ticked at end of `fixedUpdate()`.
- Player-push bump sound uses global cooldown (not per-player) to prevent double-fire from both pushed players in the same frame. Detects push via `sideSquash === 0.8` (exact value set by `collidePlayersHorizontal`).

## Arenas & Themes
- `platforms[0]` is always ground (or first ground segment, detected by `p.y >= 650`).
- Arena type is flat: `themeId` + platforms/spawns directly. Theme provides visuals, Arena provides structure.
- `allowFallOff` arenas: set `hills[].baseY` to 780+ to push hills offscreen.
- Tall narrow platform collision: `landingFromAbove` guard prevents side-approach snapping. Prefer wider-than-tall blocks.
- Solid building blocks need `noSpawnZones` covering interiors.
- `arenaId: 'random'` resolved in `Match.tsx` via `resolveArenaId()`, not in store.

## AI
- Awareness uses single pass over `state.players` — no `.filter()` loops.
- Evaluators must not allocate arrays — runs 60x/bot/sec.
- Jump suppression: 3 layers (tight-space check, threshold 0.55, cooldown 20 frames).
- Stuck recovery: nav-directed jump after 45 frames of <2px movement.
- Chase/priority evaluators defer to nav when enemy on different level (|dy| > 40).
- Fat bots flee like hurt bots (skip chase/stomp/platformSeeking).
- `navData.ts` is generated — never hand-edit. Re-run after arena/physics changes.
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

## Network Multiplayer
- `gameRandom()` wraps seeded PRNG in network mode, `Math.random()` in local. Use for ALL gameplay-affecting randomness (hazard spawning, respawn, AI decisions). Cosmetic randomness (particles, weather, gibs) stays as `Math.random()`.
- `fixedUpdate` is public in network mode. Accepts optional `networkInputs` map — when provided, `getPlayerInput()` reads from it instead of InputManager/AIController.
- `playSound()` wrapper gates all audio in fixedUpdate. Set `setAudioEnabled(false)` during rollback resimulation to prevent replay sounds.
- `renderFrame(frameDt)` must receive frame delta in network mode to decay `slowMotion`/`screenFlash`/`hitstopZoom` timers (normally decayed in `loop()` which doesn't run in network mode).
- `resolveStuckPlayer()` runs after `collidePlatforms()` — ejects players deeply embedded (>5px) in platforms. Catches desync-related position errors.
- Snapshot convention: `snapshot[f]` = state BEFORE tick f. Taking snapshots AFTER `fixedUpdate` and storing at the same frame index causes compounding timer drift (each rollback adds +1dt). Always take before tick.
- `MatchState.bouncyWobble` is a Map — serialize to `[key, value][]` for snapshots.
- `AIController.serialize()`/`restore()` must capture ring buffer, all timers, and frame counter for correct rollback.
- PeerJS `serialization: 'none'` breaks Vite builds (sdp module is CJS-only). Use default `'binary'` serialization.
- `Transport.setEvents()` re-wires callbacks when transitioning from OnlineLobby to Match (transport created in lobby, message routing changes for match).
- In `setupConnection()`, check `conn.open` immediately after attaching listeners — PeerJS may fire `peer.on('connection')` after the DataChannel is already open.
- NEVER echo HANDSHAKE messages — both sides send once on connect. Echoing creates infinite ping-pong.
- Character selection messages must NOT auto-switch and re-send — creates infinite cascade. Filter the dropdown instead.
- React `useCallback` closures capture stale Zustand state. Use refs (`localCharRef`, `remoteCharRef`) for values read inside callbacks that fire from network events.
