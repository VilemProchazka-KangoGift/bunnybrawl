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
- Music preference persisted in `bunnybrawl_music_disabled` (localStorage). Loaded at AudioManager field init, not in `init()`. Wrap localStorage access in try/catch for restricted contexts.

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
- React Strict Mode double-invokes effects. Setup + cleanup MUST be in ONE `useEffect` — separate effects cause cleanup to destroy transport while a `startedRef` guard prevents re-creation on re-mount.
- Desync checks send hash-only every 30 frames. Guest requests full snapshot only on mismatch via `DESYNC_REQUEST` / `DESYNC_CORRECTION` messages. This reduces bandwidth from ~5-10KB/check to ~50B when in sync.
- `hashGameState()` uses `Float64Array` + `crc32Bytes()` — zero string allocation. Pre-allocated buffer at module scope.
- Jitter tracking: `Transport.currentJitter` (EMA of |rtt - smoothedRtt|). `adaptInputDelay()` adds up to 2 extra frames of delay when jitter is high.
- Debug overlay: `?debug=net` URL param enables net stats overlay (RTT, jitter, frame advantage, rollback count). Toggle with `` ` `` key.
- Snapshot pool: `takeSnapshotInto()` copies into pre-allocated `GameSnapshot` objects. `createEmptySnapshot()` for ring buffer init. `AIController.serializeInto()` for zero-alloc AI snapshots.
- Visual correction smoothing: `Player.renderOffsetX/Y` are visual-only fields (not in snapshots/hash). Set after rollback, decay *= 0.7/frame. Large corrections (>30px) snap. Applied in `drawPlayer()`.
- Network simulator: `?simLatency=50&simJitter=20&simLoss=5` URL params. Wraps transport receive path, ping/pong bypasses simulator for real RTT measurement. Flush interval 2ms.
- Protocol v2: frame numbers use `Uint32` (was `Uint16`). Wraps at ~19.8 hours at 60fps. Message size: 54 bytes for 10 bundled inputs (was 34).
- `Player.renderOffsetX/Y` must be initialized to 0 in player creation and EXCLUDED from `snapshotPlayer` / `PlayerSnapshot` interface — they are cosmetic.
- Stall check must skip startup grace period: when `remoteConfirmedFrame == -1` (no inputs received yet), don't stall. Without this, both peers deadlock after 7 frames (~117ms) because neither has sent inputs yet.
- **MANDATORY**: Do not ship netcode changes without running the E2E online test suite (`npm run test:e2e -- --grep @online`). The online flow has multi-peer timing dependencies that unit tests cannot catch. The startup freeze bug (stall deadlock) was only visible with two actual browser tabs connecting.
- E2E online tests live in `e2e/online-multiplayer.spec.ts`. They use two `BrowserContext`s connecting via PeerJS. Test IDs: `online-btn`, `online-create-btn`, `online-code-input`, `online-join-submit`, `online-room-code`, `online-start-btn`, `online-ready-btn`.
- `window.__gameStore` exposes the Zustand store for E2E tests. `window.__gameLoop` exposes the active GameLoop instance.
- Debug URL params for testing: `?arena=meadow&bots=1&killLimit=4&timeLimit=30` skips lobby with short match. `?debug=net` shows network overlay. `?simLatency=100&simJitter=30&simLoss=5` simulates bad network.
- **NEVER return a cached mutable object from a function called in the input hot path.** `getInputAny()` previously returned a shared `_anyInput` object — rollback buffer stored references to it, so all slots aliased. Any per-frame mutation corrupted past frames. Always return a new object or deep-copy before storing.
- **Host relay must exclude the sender.** When forwarding unreliable messages, filter `fromPeerId` from the target list. Otherwise the sender receives their own input echoed back as "remote" input, causing conflicts.
- **Every `Math.random()` in fixedUpdate is a desync source during rollback.** Even cosmetic calls (dust spawn probability) must be gated by `if (!this._resimulating)` because they run during rollback resimulation and desynchronize the call count for subsequent `gameRandom()` invocations.
- **Host must send authoritative roster in START_MATCH.** Each peer independently computing bot characters produces different results due to RNG timing. The `roster` field in START_MATCH contains all slot→character mappings; guest applies it directly.
- **CHARACTER_SELECT relay must exclude sender** (same pattern as input relay). Otherwise creates echo loops that cascade through the auto-switch effect.
- **Auto-switch character effect needs a guard ref** to prevent re-entry. The conflict key tracks which collision was already handled; without it, the relay-triggered update fires the effect again.
- **Stomp preservation (favor the attacker)**: After rollback, if a predicted kill was undone but both attacker and victim corrected by < 25px, and `isStomping()` or `isNearStomp()` (generous 8px H + 10px V margin) still holds at corrected positions, re-apply the kill. Prevents "phantom misses" where tiny corrections silently undo clearly-valid stomps. Kill feed entry is added; splat marks are renderer-managed and not available in rollback.
- **When re-applying gameplay events after rollback** (stomps, pickups), always add the corresponding state entries (kill feed, score). Don't add renderer-only artifacts (splat marks, particles) — those are managed by the render path, not the simulation.
- **Any future `.sort()` in simulation code MUST include a tiebreaker on entity ID** for deterministic order across peers. Currently no `.sort()` calls exist in src/engine/ simulation paths.
- **PeerJS DataChannels are always reliable+ordered** (no true unreliable mode). The `sendUnreliable()` naming is aspirational — all messages arrive in order. Stale packet reordering concerns are moot given this constraint, but head-of-line blocking under packet loss is a tradeoff.
- **Physics uses `Math.fround()` for cross-architecture determinism.** x86 JIT can use 80-bit extended precision; ARM uses 64-bit doubles. All velocity/position mutations in `physics.ts` are wrapped with `Math.fround()` to force 32-bit float.
- **`Player.disconnected` must be in snapshots.** It prevents respawn in `stomp.ts` — if missing from serialization, a rollback through a disconnect event resurrects the player.
- **Desync checks use per-subsystem hashes** (players, entities, timers). When a mismatch occurs, the console log identifies which subsystem diverged first. Guest compares hash at the host's frame (snapshot-based) to avoid false positives from frame skew.

## Desync Debugging Checklist

When investigating a desync, work through these steps in order. Each "no" eliminates a category of bugs.

1. **Are both peers running identical code?** Check for any `if (isHost)` branches that skip or reorder a simulation step.
2. **Is the tick pipeline order identical?** Both peers call `fixedUpdate()` with the same system order.
3. **Is the RNG state identical at frame 0?** Print the seed and first 10 values on both peers.
4. **Does the checksum match at frame 1?** If not, the very first tick is non-deterministic.
5. **Does the checksum match at frame 60 with no inputs?** Run with empty inputs. Divergence here = simulation bug, not networking.
6. **Does the checksum match at frame 60 with identical hardcoded inputs?** Bypass the network and feed the same input array. Divergence = simulation, not networking.
7. **Does adding `Math.fround()` to all arithmetic fix it?** If yes, float precision issue (already applied to physics.ts).
8. **Does sorting all entity arrays by ID before processing fix it?** If yes, iteration order was the culprit.
9. **Which subsystem hash diverges first?** Check console log for `[net] Hash mismatch ... diverged subsystem(s):`. Start investigation there.
10. **Does removing all `Math.sin/cos/atan2` from simulation fix it?** If yes, trig divergence (currently all trig is cosmetic-only).
11. **Does the "two-tab" test (same machine, mirrored inputs) show divergence?** If yes, the bug is local determinism, not networking.
12. **Does removing prediction (thin client) fix it?** If yes, the bug is in prediction/reconciliation, not core simulation.
