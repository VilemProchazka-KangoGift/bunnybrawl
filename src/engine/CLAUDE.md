# Engine Caveats

## Renderer & Sprites
- Sprite drawing dispatches via `getSpriteRenderer(name)` / `getGibRenderer(name)` from character pack registry. Fallback pill-shape for unknown characters.
- Idle actions: shared library in `rendering/idleActions.ts` (6 actions: `headBob`, `headTilt`, `headShake`, `littleHop`, `stretch`, `lookAround`) + per-pack `CharacterPack.idleActions` config (`weights` overrides + `custom` signatures). Driver in `gameLoop/cosmetics/playerCosmetics.ts` (in-match) and `lobbyGame.ts` (lobby) — same state machine: 0.8s first-action delay, then alternating 0.6–1.4s rest gap and ~0.7–1.0s actions. State (`idleAction`, `idleActionTimer`, `idleActionDuration`) is local-only — NOT in `net/snapshot.ts`. Each peer rolls actions independently; cosmetic divergence is acceptable. Action ctx transform is applied to the main canvas around `drawImage(cached, ...)`, NOT inside `_drawCharacterSpriteImpl` — otherwise the per-frame transform bakes into the 1-bit-keyed sprite cache and the action freezes. Per-pack in-sprite tweaks (bunny ear-twitch, bear scratch, fox tail-wag, frog blink) still ride on the cached sprite via `isIdleAnim`/`idleT` params; they live with the 1-bit cache granularity.
- `spriteShading.ts`: `fillBodyGradient` for body fill, `drawHighlightSpot` for glint. Gradient edge blended 30% toward `darkColor` (not raw) to avoid harsh contrast on Panda/Cow.
- At 40px character height, subtle effects become prominent. Highlight spots must be ≤0.18 alpha. Stipple dots and outer glows look bad.
- Bubble helmet drawn at end of `drawCharacterSprite` for `space_station` and `underwater` themes only.
- Day/night rendering must check `this.theme.dayNight.enabled` before drawing. "Remove day/night" also means hide sun/moon from `drawFarBackground`.

## Render Scale
- Backing store grows to `1280×720 × min(devicePixelRatio, 2)` on desktop; touch stays at 1×. Use `applyRenderScaleToCanvas(canvas, ctx, scale)` from `renderScale.ts` — never set `canvas.width/height` directly.
- **Setting `canvas.width` resets the ctx transform AND the canvas's intrinsic layout size.** The helper does both: re-applies `setTransform(s,0,0,s,0,0)` and pins `canvas.style.width/height` to logical dims (otherwise the canvas overflows its parent — see "completely broken, zoomed in").
- Sprite cache (`players.ts`) and HUD cache (`hud.ts`) backing stores include scale; both expose `setSpriteCacheScale()` / `setHudScale()` which clear the cache on change. Sprite cache cap shrinks quadratically with scale to bound memory.
- `matchMedia('(resolution: Xdppx)')` only fires the transition AWAY from X — `renderScale.ts` re-creates the listener on each change.
- `Renderer.setRenderScale()` re-runs `renderBackground()` with the cached arena. Baked gibs/blood drips on the bg canvas are lost on scale change (rare event).

## Local-Device Preferences vs Match Mods
- **Match mods** (`matchSettings.mods.*`): host-authoritative, synced to guests via `SETTINGS_SYNC`, persisted in `gameStore` localStorage. Add via `MOD_LIST` in `ModsModal.tsx`.
- **Local-device prefs**: never synced to peers. Pattern: module-scope state + localStorage + `Set<Listener>` pub/sub (see `perfFlags.ts`, `renderScale.ts`). Read by engine via `getX()`, subscribed by React via `useSyncExternalStore(subscribeX, getX)` — never `useState(getX())` (stale snapshot).

## Game Loop
- **System architecture**: GameLoop owns two system arrays (`GameplaySystem[]` for `fixedUpdate`, `CosmeticSystem[]` for `cosmeticStep`). Each system implements `init(state) / update(dt) / cleanup()`. Systems receive shared state via constructor and call pure functions from the `cosmetics/` and `gameplay/` subdirectories.
- **ParticleSystem** is the central VFX hub — other systems reference it for `emitParticle()`, `spawnKillSplatter()`, `applyHazardHitVFX()`, etc. Created first in GameLoop constructor.
- **Per-player systems** (EffectZoneSystem, PlayerCollisionSystem) have `applyToPlayer()`/`checkCollisions()` methods called from GameLoop's per-player loop, NOT from the system array iteration.
- **`erasableSyntaxOnly: true`** in tsconfig — cannot use constructor parameter properties (`private foo: T` in constructor). Use explicit field declarations + constructor body assignment.
- **Avoid `.bind(this)` in hot paths** — creates new function per call. Use cached arrow fields: `private readonly _boundFn = (): T => this.fn()`.
- **`audio.playAnimal(name)`** is separate from `audio.play(name)` — both must be gated by `_audioEnabled` for rollback resimulation. Route through callbacks, not direct imports.
- `fixedUpdate` returns early when `matchOver` — timers that should keep running (screenFlash, slowMotion) must be decayed in `loop()` instead.
- Stomps must be checked BEFORE `collidePlayersHorizontal`; collision skips when vertical overlap < 50% (stomp zone).
- Never splice/shift `splatMarks` during `fixedUpdate` — multiple ticks per frame + `newSplatsSinceRender` stores indices. Cap array in render path only.
- `GameLoop.stop()` must stop ALL looping sounds — music, ambient, wind, zero_g, crowd, plus all theme `activeAmbientLoops`.
- Entity cleanup uses `swapRemove(arr, i)` in reverse-iterate loops. O(1), no order. Never `.filter()` per frame.
- New particles: always use `particleSystem.emitParticle()`, never push to the array directly.

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
- `updatePlayerState()` (called inside `fixedUpdate`) always derives `player.state` from velocity: `vy != 0` → airborne; `|vx| > 10` → run; else idle. Tests that need a specific state across a fixedUpdate boundary must set the matching velocity too — e.g. `player.state = 'run'; player.vx = 200` keeps run state.

## Characters
- Pack registry must be initialized before use — `registerBuiltinCharacters()` called at module scope in `App.tsx`.
- Character sounds live in each pack via `createSound?: () => Howl` — called once at AudioManager init. Simple tones use `generateToneBuffer()`, multi-segment use `generateMultiSegmentTone()`, custom synthesis (frog) uses `floatBufferToWavDataUri()` directly. Future packs can return MP3-backed Howls.
- `defaults.ts` CHARACTERS record is mutated at lobby exit (intentional). `getAllCharacters()` derives full roster from pack registry.
- Character emoji: use `getCharacterEmoji(name)` from `characters/registry.ts` — single source of truth. Used in React components with `.row-emoji` CSS class.
- Legs: shared `drawLegs()` in `characters/legRenderer.ts`, configured by `CharacterPack.legStyle` (shape, footStyle, dimensions). Called from both renderer.ts and CharacterSelect.tsx. Must be a pure function (output is sprite-cached).
- Rayman-style nub legs: defaults are 6px wide × 4px tall × 2px foot. When `legH <= 5`, all filled shapes (rounded/tapered/wide) render as ellipses — quad curves are invisible at this scale. Animation amplitudes are halved vs. original long-leg values. Hip attachment at `h * 0.82`.
- When scaling leg dimensions, scale animation amplitudes proportionally — large bounce/swing on tiny legs looks jittery. Also reduce squash expansion factors.
- Owl claws use explicit `footWidth`/`footHeight` overrides to stay prominent at nub scale. The claw renderer's stroke width and splay angles matter more than leg size for visual identity.
- Appendage anchors (tails, wings): use `cx - w * 0.45+`, not `cx - w * 0.3`. Body ellipse extends to `cx ± w * 0.4`, so closer anchors clip into the face. For `customEyes: true` packs, draw the appendage before the face circle/eyes so face details mask any residual overlap.

## Audio
- Audio system decomposed into `audio/` directory: `AudioManager.ts` (play/stop/mute/pause), `MusicManager.ts` (menu + arena music), `soundRegistry.ts` (declarative SFX table), `synthesis/` (pure generators grouped by category). Old `audio.ts` is a re-export shim.
- All procedural sounds are Float32Array → WAV data URI → Howler.js. No MP3 for SFX.
- Frequencies below 100Hz are inaudible on laptop speakers. Use 130Hz+ for thuds/impacts. Calibrate: generation amplitude * Howl volume should be ≥0.05 for one-shots.
- SFX cooldowns use per-player `Map<PlayerSlot, number>` (like `footstepAccumulators`) or a global number. Decay with `dt` every frame. Sound plays only when cooldown ≤ 0. Decay cooldowns BEFORE the hitstop `continue` so they don't accumulate during hitstop.
- Ambient sounds: `ArenaPack.ambientSoundConfig` with `loops` (continuous) and `periodic` (random interval one-shots). Loops tracked in `activeAmbientLoops[]`, all stopped in `stop()`. Periodic timers in `periodicAmbientTimers` Map, ticked at end of `fixedUpdate()`.
- Player-push bump sound uses global cooldown (not per-player) to prevent double-fire from both pushed players in the same frame. Detects push via `sideSquash === 0.8` (exact value set by `collidePlayersHorizontal`).
- All 11 arenas + menu have MP3 music. Each arena pack specifies `musicFile` (e.g. `'meadow.mp3'`), resolved by `audio.playMusic()` via `getArenaPack()`. Menu music uses a separate `menuMusicHowl` preloaded in `init()` — not tied to component lifecycle (persists across menu↔lobby). Suno generation prompts are in `docs/suno-arena-prompts.md`.
- `Howler.mute()` is the global kill switch for all audio. Three independent mute sources: `muted` (user toggle), `backgroundMuted` (tab hidden via visibilitychange), `gamePaused` (pause overlay). All three must be false before calling `Howler.mute(false)`. Adding a new mute source? Check all unmute paths gate on it.
- `gamePaused` is reset inside `audio.stopAllGameSounds()` — `GameLoop.stop()` runs that, so all game-exit paths (quit-from-pause, match-end cleanup, stall timeout) clear the mute automatically. New exit paths don't need explicit `setPaused(false)`, but must go through `stopAllGameSounds()` or call it directly.
- All MP3 music Howls (menu + arena) use `html5: true` — streams playback as bytes arrive instead of stalling on `decodeAudioData` behind the ~40 WAV SFX buffers that `registerAllSounds()` decodes at menu mount. New arena music Howls must set `html5: true` too. Procedural WAV SFX stay on Web Audio (no `html5` flag).
- Music preference persisted in `carrotroyale_music_disabled` (localStorage). Loaded at AudioManager field init, not in `init()`. Wrap localStorage access in try/catch for restricted contexts.
- `Howler.playing()` is unreliable after a blocked autoplay (mobile) — set optimistically even when the browser silently rejects `play()`. For anything that runs outside a user gesture (menu music on MainMenu mount), track actual playback via Howl `on('play')/on('stop')/on('playerror')`. Arena music is safe (always post-gesture).
- Pause only calls `Howler.mute(true)` — the arena Howl keeps running silently. Guard same-theme resume with `if (!musicHowl.playing()) musicHowl.play()`, otherwise a second concurrent instance starts at offset 0 (Howler allows concurrent playback by default).
- Audio tests: the `MockHowl` constructor in `src/engine/audio.test.ts` must stub `.on()` and `.once()` alongside `play/stop/volume/unload/playing`. MusicManager attaches event listeners in `createMenuHowl()`, so missing stubs throw at test-time.

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
- Lobby bots (`botLobbyInput()` in `lobbyGame.ts`) return `InputState` and go through `applyInput` like humans. Behavior (walk-to-zone + wall-jump) remains lobby-specific and does not share code with match AI.
- Lobby runs no `cosmeticStep` — any renderer-consumed cosmetic timer (`idleAction*`, `animFrame`, `squashScale`) must be ticked manually inside `LobbyGame.step()`. Mirror the logic from `gameLoop/cosmetics/playerCosmetics.ts`.

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
- **Guest loop**: No fixedUpdate — applies snapshots then calls `cosmeticStep(dt)` (same method as host). Visual timer decay for smooth interpolation stays in the guest loop.
- **`cosmeticStep(dt)`**: Shared cosmetic code path for both host and guest. Handles all sounds, particles, VFX, environment (wildlife/fog/pollen), and state-transition detection (stomp, jump, land, spring, etc.) via prev-state comparison. Host calls it after `fixedUpdate()`. Guest calls it after `applySnapshotToState()`. Minor host-only effects (crouch, zero_g, splash, pigeon_scatter, crowd, periodic ambient) remain in fixedUpdate.
- **Half-rate cosmetic (`tickCosmetic(dt)`)**: Production loops (local, host, guest) call `tickCosmetic(dt)`, which accumulates dt and only forwards to `cosmeticStep` once per `COSMETIC_INTERVAL` (2× FIXED_TIMESTEP, ~30Hz). Render stays at 60Hz; particle motion, SFX cooldown decay, and transition detection run at half rate. Per-step dt is capped at `COSMETIC_MAX_STEP` (4× FIXED_TIMESTEP) so tab-switch recovery doesn't dump seconds of work into one step. Tests call `cosmeticStep(FIXED_TIMESTEP)` directly to exercise the unthrottled per-tick behavior. When adding new cosmetic logic, remember it sees ~33ms dt and runs every other frame — transitions that flip on/off within a single 33ms window may be missed.
- **Render-time particle extrapolation**: `Renderer.renderFrame(state, arena, particles, cosmeticLead)` accepts seconds since the last cosmeticStep (`GameLoop.getCosmeticLead()`). The lead is forwarded to `drawParticles`, `drawGibs`, `drawConfetti`, `drawWeather`, and `drawFireworks`, which extrapolate position via `x + vx * lead`, `y + vy * lead` (and rotation via `rotation + rotationSpeed * lead` where present). This smooths half-rate motion to near-60Hz visual quality. New particle-style draw functions taking `(x,y,vx,vy)` entities should accept `lead = 0` and apply the same extrapolation. Sparkle/jitter terms keyed off position must use the *raw* `p.x`/`p.y` (not extrapolated) to stay stable across frames — see `drawFireworks` sparkle phase for the pattern.
- **Renderer signature changes**: `renderer.test.ts` has 40+ direct `renderer.renderFrame(state, arena, [])` call sites. New params on `renderFrame` should default-value (e.g. `cosmeticLead = 0`) rather than be required, otherwise every test needs updating.
- **Snapshot encoding**: Player timers as Uint8 frame counts (`Math.round(timer * 60)`, 0-255). Positions as Float32.
- **Interpolation**: `EntityInterpolation` uses frame-based interpolation with adaptive delay (2-5 frames based on snapshot gap detection). Extrapolates up to 4 frames using velocity + gravity when snapshots are late. Only x/y/vx/vy are lerped; timers/state use "after" snapshot. Sequence validation discards out-of-order packets.
- **Client prediction was tried and abandoned** — constant rubber-banding due to physics divergence in complex arenas (springs, geysers, player pushing, zero-G, etc.). `ClientPrediction` class still exists for reconciliation but `predict()` is dead code.
- **Input Echo system** (`net/inputEcho.ts`): instant visual feedback for the guest's local player WITHOUT position prediction. Overrides facing, squashScale, sideSquash, fastFalling, expression based on raw input (animFrame echo removed — caused walk shake). Position always from host snapshots. Hysteresis locks (RTT + 50ms) prevent snapshot-vs-echo flicker. Suppressed during death/respawn. Kill switch: `?noecho` URL param.
- **Input redundancy**: Guest sends last 8 inputs per packet (ring buffer). Host iterates all bundled inputs with per-slot `lastConsumedFrame` tracking to recover from burst packet loss. Protocol already supported 16 bundled inputs.
- **Delta compression (DISABLED)**: Infrastructure exists (ACKs, `createDelta`/`applyDelta` in core/) but disabled due to baseline mismatch from unreliable ACK delivery. Host always sends full snapshots. See "Delta compression disabled" bullet below for details.
- **Reconnection window** (20s grace): On guest disconnect, `startReconnection()` retries `transport.joinRoom()` every 2s (9 attempts). Host enters grace period (`disconnectedSlots` Map) instead of immediate removal. `RECONNECT_REQUEST` (0x15) / `RECONNECT_SYNC` (0x16) protocol messages. Match.tsx shows "Reconnecting..." overlay.
- **Stall detection** (guest-side): Tracks `lastSnapshotTime`. 500ms → `onStall(true)` ("Connection Unstable" banner). 3s → triggers reconnection. **Must check `!state.matchOver`** — host stops sending snapshots after match end.
- **Connection quality HUD**: 3-bar signal icon (top-right, guest only). Green/yellow/red based on RTT + jitter thresholds. Wired through `gameLoop.setConnectionQuality()` → `renderer.setConnectionQuality()`.
- **`FIXED_TIMESTEP` must be used in NetMatch loops** — never use raw `1/60`. The existing constant is `Math.fround(1/60)` for cross-architecture determinism.
- **cosmeticStep entity removal gotcha**: Carrot/thorn entities are `swapRemove`d by fixedUpdate before cosmeticStep runs. Sounds for these MUST stay inline in fixedUpdate. Use player state transitions (score change, slowTimer change) for guest-side detection.
- **Headbonk must use collision detection, not velocity heuristics** — at jump apex, vy passes through 0 gradually (gravity ~15/tick). Ceiling collision clamps vy to exactly 0. Headbonk stays in fixedUpdate after `collidePlatforms()`.
- **Delta compression disabled** — unreliable ACK delivery causes host/guest XOR baseline mismatch. Infrastructure preserved (`SNAPSHOT_DELTA` 0x22, `createDelta`/`applyDelta` in core/). Re-enable requires base frame number in delta header + guest-side snapshot history.
- **Wall-clock interpolation failed** — network jitter makes arrival timestamps noisy, producing jittery lerp factors. Frame-based interpolation (targetFrame = latest - delay) is stable.
- **Touch gesture disambiguation**: `JUMP_COMMIT_DELAY_MS = 80` delays jump reporting to allow swipe-down (crouch) to cancel. `SWIPE_DISTANCE = 25`. Without this, online guests send jump before swipe is recognized.
- **`net/core/`**: Generic netcode with zero game imports (`grep -r "from '\.\./" core/` = 0 matches). `CoreMsgType` (6 transport-level IDs) in `protocol.ts`, game extends via `MsgType = { ...CoreMsgType, ...gameTypes }` in `net/protocol.ts`. `GenericHostAuthority<TInput,TState,TSnapshot>` in `hostAuthority.ts` — delegates game-specific behavior via callbacks (`onInputReceived` for jump latching, `onPlayerReconnect` for respawn). Uses narrow `HostSimulation<TState>` interface (getState + disconnectPlayer only), not the full `Simulation`. Also: `SnapshotInterpolation<T>` ring buffer, `deltaCompression`, `networkSimulator`, `debugOverlay`, `types.ts`.
- **Ping/pong ownership**: Transport handles all ping/pong RTT measurement. Do NOT add ping intervals to HostAuthority or other modules — double pings waste bandwidth and confuse jitter measurement.
- **Player array order is stable**: `takeAuthSnapshot` iterates `state.players` in insertion order. `interpolateSnapshots` and `applySnapshotToState` use index-based access (`a.players[i]`), not Map lookups. Don't reorder `state.players` or break this invariant.
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
- **Mock maintenance**: `netMatch.test.ts` mocks `GameLoop`, `HostAuthority`, and `EntityInterpolation` via `Object.assign`. When adding methods to these classes, update the corresponding `mock*Instance` objects in the test or `vi.mock` factory — otherwise tests pass but emit unhandled `TypeError` exceptions (which can mask real failures). Similarly, `transport.test.ts` mocks must match the actual import paths (e.g. `./core/networkSimulator`, not `./networkSimulator`).
- **Transport health thresholds**: `DEGRADED_THRESHOLD_MS` and `PONG_TIMEOUT_MS` are in `transport.ts`. If changed, update the `lastPongTime` offsets in the `startPing health degradation` tests in `transport.test.ts`.
