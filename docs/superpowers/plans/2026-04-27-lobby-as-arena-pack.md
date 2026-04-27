# Plan: Convert Lobby to a Proper Arena Pack

**Goal:** Replace `lobbyRender.ts` (~386 lines of bespoke canvas drawing) with a standard `ArenaPack` so the lobby renders through the main `Renderer` pipeline. Gets iso 3D ground + wall for free; aligns lobby with the same visual system as matches.

**Out of scope:** Changing lobby gameplay (stomp/swap, ready-zone countdown, bot wandering). Networking. Mobile touch.

---

## Current state

- `engine/lobbyRender.ts` (386 lines): bespoke render — sky, hills, ground, wildlife, day/night, wall, characters, labels, ready zone, rules text, countdown
- `engine/lobbyConstants.ts`: `LOBBY_ARENA` stub (2 platforms, no insets) and `LOBBY_THEME` stub (only `bubbleHelmet: false`)
- `engine/lobbyGame.ts`: orchestrator (LobbyGame class), owns players/bots/wildlife/dayPhase, calls `drawLobby(ctx, ...)` each frame
- `components/CharacterSelect.tsx`: React mount, attaches input, ticks the LobbyGame loop, and (per CLAUDE.md) provides 1 canvas

The lobby's HUD overlays (ready-zone gradient + boundary, "GO" text, rules text, countdown, character labels above each player) are interleaved with world drawing in `drawLobby` today.

---

## Target architecture

Lobby becomes a standard arena: pack file + main `Renderer` + a thin lobby-overlay function for HUD elements that don't fit `ArenaPack`.

```
Frame loop:
  LobbyGame.update(dt)
  renderer.renderFrame(state, arena, particles)   // sky/hills/wildlife/iso platforms/players
  drawLobbyOverlay(hudCtx, lobbyState)            // labels, ready zone, countdown, rules
```

---

## Phases

### Phase 1 — Lobby arena pack
**File:** `src/engine/arenas/packs/lobby.ts` (new)

Compose from existing primitives — no new drawing helpers:

- **Layout**:
  - Ground platform `{ x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: ... }`
  - Wall obstacle `{ x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT }`
  - Wrap with `applyIsoInsets([...])` so both get `leftCollisionInset` / `bottomCollisionInset`
- **Visuals**:
  - `sky.gradient` — copy from current lobbyRender lines drawing the sky band
  - `hills` — array matching current 3 hill layers
  - `clouds` — minimal
  - `dayNight.enabled: true`, `dayCycleSeconds: 90` (matches `LOBBY_DAY_CYCLE`)
  - `wildlife` config (6 birds/butterflies, ground at `GROUND_Y`)
  - `weather`/`fog`/`ambientParticles` — empty/disabled
- **Draw functions**:
  - `drawPlatform`: dispatches by style — ground uses bespoke 2D ground (matching current lobby green hills + grass), wall uses standard `drawPlatformCap` + `drawPlatformRightFace` from `themes/drawPrimitives`
  - `drawPlatformOverlay`: draws the wall body face after players (gives "go behind wall" effect via the iso phantom strip)
  - `drawBackgroundNature`: trees, flowers, ferns from `lobbyRender` extracted
  - `drawForegroundNature`: tall grass / foreground decorations if any
- **Identity**: `id: 'lobby'`, `translations: { en: 'Lobby', cs: 'Lobby', hi: '...', fil: '...' }`, no `musicFile` (lobby music handled separately), no nav data
- **Skip nav data generation** — lobby doesn't host AI matches

**Acceptance:** `getArena('lobby')` returns an arena identical to current LOBBY_ARENA's collision but with iso insets, and `getTheme('lobby')` returns a working ThemeConfig.

---

### Phase 2 — Register the pack
**File:** `src/engine/arenas/builtin.ts`

Add `lobby` to BUILTINS array. Lobby pack registers like any other — but the arena selector in `MainMenu.tsx` should filter it out (it's not a playable match arena). Verify the random arena resolver in `Match.tsx` excludes it too.

**Risk:** if filtering is missed, lobby could appear in the arena picker. Add a `playable: false` flag to `ArenaPack` or filter by id.

---

### Phase 3 — `Renderer` lobby mode
**File:** `src/engine/renderer.ts`

The main `Renderer` calls `drawHUD` / `drawCountdown` / `drawConnectionQuality` from `_drawOverlayContent`. None of these are right for the lobby.

Add a constructor option:
```ts
new Renderer(bgCanvas, fgCanvas, theme, mirrored, hudCanvas, { lobbyMode: true })
```

When `lobbyMode` is set:
- `_drawOverlayContent` skips match-HUD / countdown / connection-quality / nav-debug / net-debug
- A registered `setLobbyOverlayFn(fn)` callback runs in their place — gets the hud ctx and the current frame time
- `screenFlash` / `slowMotion` / `hitstop` paths still allowed (some are useful for stomp swaps)

This keeps the per-frame Renderer lifecycle (cosmeticLead, isHudDirty, scale changes) consistent with matches.

**Acceptance:** `Renderer` typecheck passes with the new flag, and existing match call sites compile unchanged.

---

### Phase 4 — Lobby HUD overlay
**File:** `src/engine/lobbyRender.ts` (slimmed) or `src/engine/lobbyHud.ts` (new)

Strip lobbyRender down to a single function:
```ts
export function drawLobbyOverlay(
  ctx: CanvasRenderingContext2D,
  lobby: LobbyHudState,
  frameTime: number,
): void
```

Renders only the HUD-class elements (everything else moves into the arena pack):
- Ready-zone gradient fill + dashed boundary line
- "GO" text + arrow indicator
- Rules / "press jump to be ready" text on the right
- Per-character name labels above sprite (drawn here, not in pack — they're per-player runtime data)
- Countdown overlay when triggered

LobbyGame wires this into Renderer via `renderer.setLobbyOverlayFn((hctx, ft) => drawLobbyOverlay(hctx, this.hudState, ft))`.

The gradient cache (`_zoneGrad`) stays here — it's HUD geometry.

---

### Phase 5 — LobbyGame state shape
**File:** `src/engine/lobbyGame.ts`

`Renderer.renderFrame(state, arena, particles)` expects a `MatchState` with: `players`, `weather`, `wildlife`, `geyserStates`, `bouncyWobble`, `pigeonFlocks`, `lavaRocks`, `springs`, `thorns`, `carrots`, `gibs`, `confetti`, `shockwaves`, `fogParticles`, `pollenParticles`, `screenFlash`, `slowMotion`, `hitstopZoom`, `screenShake`, `dayPhase`, `timeElapsed`, `matchOver`, `countdown`, `scoreAnimations`.

Approach: add a `buildLobbyMatchState()` helper that returns a real `MatchState` with empty arrays for everything LobbyGame doesn't use, real values for `players`, `wildlife`, `dayPhase`, `timeElapsed`. Reuse `createInitialState()` from `gameLoop/initialState.ts` if its API allows; otherwise build inline.

**Risk:** `Renderer` may iterate over arrays (e.g. `for (const sw of matchState.shockwaves)`) — empty arrays are fine, but `null` would break. Audit `renderFrame` for `?.` vs direct iteration.

LobbyGame's `update(dt)` produces:
- Players (already in correct shape)
- Wildlife (already array)
- DayPhase (compute from `time / LOBBY_DAY_CYCLE`)
- Particles (the lobby has stomp dust today via `lobbyRender` — needs a small particle list, possibly reusing `particleSystem` from `cosmetics/`)

---

### Phase 6 — CharacterSelect wiring
**File:** `src/components/CharacterSelect.tsx`

- Add bg + fg + hud canvases (currently a single canvas)
- Construct `Renderer` once on mount with `lobbyMode: true`, theme = lobby pack's theme
- Each frame: `lobbyGame.update(dt)` → `renderer.renderFrame(state, arena, particles)` → (overlay runs inside renderFrame via `lobbyOverlayFn`)
- Cleanup: `clearRenderingCaches()` on unmount

**Risk:** going from 1 canvas to 3 changes the React layout slightly. The `useCanvasRenderScale` hook needs to wire all three; verify they sit at the same z-stack.

---

### Phase 7 — Cleanup
- Delete inline drawing from `lobbyRender.ts` (~300 lines), keep only `drawLobbyOverlay` + gradient cache
- Or: move `drawLobbyOverlay` into a new `lobbyHud.ts` and delete `lobbyRender.ts` entirely
- Remove `LOBBY_ARENA` and `LOBBY_THEME` stubs from `lobbyConstants.ts` (LobbyGame uses registry now)
- Keep `WALL_X`, `GROUND_Y`, `READY_ZONE_X`, `LOBBY_DAY_CYCLE`, etc. — they're still referenced by `lobbyGame.ts` and the new pack file
- Update `lobbyGame.test.ts` if it references LOBBY_ARENA directly
- Update E2E lobby tests if they pin specific render output

---

## Risks (ranked)

1. **MatchState shape mismatch** — Renderer expects fields LobbyGame doesn't produce. Mitigated by `buildLobbyMatchState()` shim with empty arrays.
2. **Extra canvas layers cost on lobby mount** — bg + fg + hud means three canvases instead of one. On mobile this could affect first-frame paint. Mitigation: same canvases the match already uses, no new cost in steady state.
3. **The lobby's iso platforms get the same physics insets as match arenas** — players walking into the wall now have a phantom strip. Could affect the wall's intended "hard barrier" feel. Mitigation: walls don't need the strip — when defining the wall platform, omit the inset (or extend `applyIsoInsets` with a `predicate` arg already supported per the `themes/drawPrimitives/platforms.ts` signature).
4. **Lobby ground iso skin needs to look distinct from match ground** — currently it's hand-drawn with hill curves. Pack's `drawPlatform` for ground should match the existing visual closely or the lobby will feel different overnight. Mitigation: lobby pack's `drawPlatform` for ground keeps the bespoke green-hills style, only the wall gets the iso treatment; or both go iso and we accept a visual change.
5. **Arena selector / random arena pick leakage** — `lobby` could appear as a playable arena. Mitigation: add `playable: false` to ArenaPack and filter at registration / random pick / selector / nav-data generation.
6. **Tests** — `lobbyGame.test.ts`, `CharacterSelect.test.tsx`, lobby E2E specs. Need to mock the new canvas trio and the registry lookup.

---

## What we lose

- **~300 lines of bespoke render code** (a feature, not a loss)
- **Direct control over draw order in the lobby** — now constrained by Renderer's pipeline. But the pipeline already supports BG / players / FG / overlay layers, which is exactly what the lobby needs.
- **One small piece of art**: the current lobby's ground is hand-painted with hill bumps; the iso ground is flatter. Phase 1 decision: keep bespoke or accept iso flatten.

---

## What we gain

- Iso 3D ground + wall (the original ask)
- Day/night cycle uses the standard pipeline (already configurable per-pack)
- Wildlife, weather, fog, ambientParticles all available if we want them
- HUD render scale handled by the same `setHudScale` machinery as matches
- High-DPI render scale already wired
- Lobby visuals editable by changing the pack file, no code spelunking
- Future arenas can share custom decorations with the lobby (trees, flowers, ferns extracted to `themes/drawPrimitives` if not already there)

---

## Estimated size

- Phase 1: ~250 lines (new pack file)
- Phase 2: ~5 lines
- Phase 3: ~30 lines (Renderer flag + overlay fn)
- Phase 4: ~150 lines (extracted HUD overlay)
- Phase 5: ~50 lines (state shim)
- Phase 6: ~30 lines (canvas wiring in CharacterSelect)
- Phase 7: net **−250 lines** after deletions

Net change: roughly zero LoC, but the bespoke code path collapses into the standard one — every future render improvement to matches gets the lobby for free.

---

## Suggested execution order

1. Phase 3 (Renderer flag) — small, low-risk, lets matches keep working untouched
2. Phase 1 (pack file) — bulk of the work; can be tested in isolation by registering and pointing a normal match at id `'lobby'` first
3. Phase 5 (state shim) — needed before Phase 6
4. Phase 4 (HUD overlay) — extract from current lobbyRender
5. Phase 6 (CharacterSelect wiring) — flips the switch
6. Phase 2 + 7 (registration filter + cleanup)

Each phase typechecks and tests independently; final E2E pass after Phase 6.
