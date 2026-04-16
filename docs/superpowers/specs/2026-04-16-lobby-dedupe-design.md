# Lobby De-duplication Design

**Date:** 2026-04-16
**Goal:** Collapse `src/engine/lobbyGame.ts` (885 lines) onto engine primitives. Principle: don't reimplement anything unless strongly justified.

## Problem

`lobbyGame.ts` is a parallel mini-engine for `CharacterSelect`. It reimplements:

- **Player state**: `LobbyPlayer` mirrors `Player` with a subset of fields.
- **Physics**: `updateLobbyPhysics` re-rolls ground + wall + world-bounds collision, squash decay, anim-frame ticking — despite the engine already doing all of this in `physics.ts`.
- **Stomp detection**: `processStomps` re-implements the AABB + vy math already in `stomp.ts` `isStomping()`.
- **Character rendering**: `drawLobbyCharacter` re-implements the facing-flip + squash-transform + running-bounce wrapper already in `rendering/players.ts` `drawPlayer`.
- **Splat drawing**: `drawSquishedChar` (flat ellipse) duplicates `drawSplatCharacter` (X-eyed splat).

Some of this duplication is genuine (swap-on-stomp semantics, walk-to-zone bot AI, bespoke lobby art). Most of it is not.

## Scope: Tier B (per user direction "start with A+B")

### Keep reimplementing — strongly justified

| Thing | Why |
|---|---|
| Swap-on-stomp logic | Lobby-specific feature — match kills, lobby swaps characters. |
| `updateBotLobbyAI` (walk-to-zone + wall-jump) | Fundamentally different goal than match AI; no nav graph needed. |
| `wanderAI` for NPC extras | 5-line random-walk; not worth a shared abstraction. |
| Lobby background art + UI overlay | Bespoke art (treeline, wall, ready zone, GO text, rules hint, countdown, UI bar). This is the lobby's visual identity. Scope C, not B. |
| Crouch-on-ground squat | 1 inline branch — not in `applyInput`, not worth extracting. |

### Collapse onto engine — unjustified duplication

| Current | Replaced with |
|---|---|
| `LobbyPlayer` interface | `Player` (with defaults for unused fields) |
| `updateLobbyPhysics` | `applyInput` → `applyGravity` → `movePlayer` → `collidePlatforms` → `applyArenaConstraints` → `updatePlayerState` |
| Bespoke ground + wall collision | Two-platform synthetic `Arena` + `collidePlatforms` |
| `processStomps` AABB math | `isStomping()` call (swap logic stays inline) |
| `drawLobbyCharacter` | `drawPlayer(ctx, player, false, LOBBY_THEME, frameTime)` |
| `drawSquishedChar` | Removed — `drawPlayer` draws `drawSplatCharacter` when `state === 'splat'` |
| Squash decay (inline) | New helper `decaySquash(player, dt)` in `physics.ts` (shared with `gameLoop/` caller) |

**Expected size:** 885 → ~400 lines in `lobbyGame.ts`.

## Architecture

### Data model

```ts
// lobbyGame.ts
function makeLobbyPlayer(slot: PlayerSlot, char: CharacterDef, x: number, y: number): Player {
  return {
    id: slot, character: char,
    x, y, vx: 0, vy: 0,
    width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
    state: 'idle', facing: 'right',
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true,
    animFrame: 0, animTimer: 0, fastFalling: false,
    fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1,
    afterimages: [], idleAnimTimer: 0,
    expression: 'normal', killStreak: 0,
    breathTimer: 0, springTrailTimer: 0,
    damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
  };
}
```

All three categories (humans, bots, extras) become `Player[]`. `LobbyGame.players`, `.bots`, `.extraChars` retain their grouping (affects stomp targeting rules).

### Synthetic arena

```ts
const LOBBY_ARENA: Arena = {
  id: 'lobby',
  name: 'Lobby',
  themeId: 'lobby',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y }, // ground
    { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT },              // wall
  ],
  spawnPoints: [],  // unused — lobby never respawns via engine
  allowFallOff: false,
};
```

`collidePlatforms` handles both the ground landing (minDir=2) and the wall side collision (minDir=0/1, setting `sideSquash = 0.75`). The ground-plane floor (`y + height >= GROUND_Y`) is naturally covered by the ground platform.

### Physics loop (inside `LobbyGame.update`)

```ts
for (const p of this._participants.concat(this.extraChars)) {
  if (p.splatTimer > 0) { p.splatTimer = Math.max(0, p.splatTimer - dt); continue; }

  const input = getLobbyInput(p, keys, touchInput);  // humans: keyboard/touch; bots/extras: AI

  applyInput(p, input, dt, LOBBY_SPEED, 1500, LOBBY_JUMP);
  applyGravity(p, dt, LOBBY_GRAVITY, 800);
  movePlayer(p, dt);
  collidePlatforms(p, LOBBY_ARENA.platforms);
  clampLobbyBounds(p);   // manual x clamp + vertical ceiling; NOT applyArenaConstraints (that wraps horizontally)
  updatePlayerState(p);
  decaySquash(p, dt);

  // Lobby-specific: crouch-on-ground squat (3 lines inline)
  if (input.down && p.state !== 'airborne') p.squashScale = SQUASH_ON_CROUCH;

  // Anim frame tick (3 lines inline)
  if (Math.abs(p.vx) > 10) {
    p.animTimer += dt;
    if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
  }
}
```

### Input wiring

`updateBotLobbyAI` and the NPC wanderer both refactored to return `InputState`:

```ts
function botLobbyInput(bot: Player): InputState { /* walk-to-zone logic → {left,right,jump,down} */ }
function wanderInput(npc: Player): InputState   { /* random walk → {left,right,jump,down} */ }
```

This unifies every entity through `applyInput` and eliminates direct `vx`/`vy` mutation.

### Stomp detection

```ts
for (const attacker of this._participants) {
  if (attacker.splatTimer > 0) continue;
  const attackerIsBot = isBotSlot(attacker.id);

  for (const victim of this._allLobby) {
    if (victim === attacker) continue;
    if (victim.splatTimer > 0) continue;
    if (attackerIsBot && !this._extrasSet.has(victim)) continue;

    if (isStomping(attacker, victim)) {
      swapCharacters(attacker, victim);   // lobby-specific — stays inline
      victim.splatTimer = 0.8;
      victim.state = 'splat';              // so drawPlayer renders X-eyes
      attacker.vy = -300;
      audio.play('stomp');
      if (this._extrasSet.has(victim)) relocateNPC(victim, attacker);
    }
  }
}
```

### Rendering

```ts
// drawLobby loop over all entities:
for (const p of allLobby) {
  drawPlayer(ctx, p, false, LOBBY_THEME, performance.now());
  // tag label (P1 / BOT) stays
}
```

`LOBBY_THEME: ThemeConfig` is a minimal stub — `drawPlayer` only reads `theme?.bubbleHelmet`.

**Visual change:** splatted characters in the lobby switch from flat ellipse to X-eyed splat (user approved).

### Shared helper: `decaySquash`

New export in `physics.ts`:

```ts
export function decaySquash(p: Player, dt: number): void {
  if (p.squashScale !== 1) {
    p.squashScale += (1 - p.squashScale) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.squashScale - 1) < 0.02) p.squashScale = 1;
  }
  if (p.sideSquash !== 1) {
    p.sideSquash += (1 - p.sideSquash) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.sideSquash - 1) < 0.02) p.sideSquash = 1;
  }
}
```

Caller in `gameLoop/GameLoop.ts` already has equivalent inline code; switch it to this helper for consistency.

## Risks

- **Splat visual change**: confirmed acceptable.
- **Player field defaults**: any engine code that checks e.g. `player.active` won't see lobby players — but lobby doesn't invoke engine logic that cares. `drawPlayer` doesn't gate on `active`.
- **`applyInput` side-effects**: it sets `player.facing` on input. The lobby relies on this — good, no regression.
- **`applyArenaConstraints` calls `wrapHorizontal`**: horizontal wrap at `x < 0` / `x > width` would teleport lobby players across the screen. Need to verify: lobby uses a world-bounds clamp instead of wrapping. **Mitigation:** the lobby arena needs a field telling `applyArenaConstraints` not to wrap — or we skip `applyArenaConstraints` and call just the vertical clamp manually (same ~3 lines as current). **Decision:** skip `applyArenaConstraints`; do manual x clamp in the per-entity loop. Alternative is adding an `noHorizontalWrap` arena flag, which is overkill for one use site.
- **`updatePlayerState` sets state to `'run'` on `|vx| > 10`**: matches current `isRunning` logic. No regression.
- **Test updates**: `lobbyGame.test.ts` (1269 lines) likely asserts on `LobbyPlayer` shape. Will need a rewrite of field accessors (`p.onGround` → `p.state !== 'airborne'`, `p.char` → `p.character`). Volume of churn is expected but mechanical.

## Non-goals (deferred)

- Converting lobby to a full `ArenaPack` (scope C).
- Running the real `GameLoop` in lobby mode (scope C).
- Replacing lobby bot AI with utility-based AI (scope C).
- Refactoring the bespoke background art into `themes/drawPrimitives.ts` helpers — already uses primitives where appropriate; inline art is lobby-specific.

## Success criteria

- `lobbyGame.ts` line count drops from 885 to ~400.
- No new engine-level abstractions introduced beyond `decaySquash` helper.
- All existing `lobbyGame.test.ts` cases still pass (after mechanical field-name updates).
- E2E lobby flow (walk to zone → countdown → start match) works in both keyboard and mobile touch modes.
- Visual parity except for splat shape (flat ellipse → X-eyed splat, approved).

## Implementation order

1. Add `decaySquash` to `physics.ts` and switch `gameLoop/` caller.
2. Add `makeLobbyPlayer` + `LOBBY_ARENA` + `LOBBY_THEME` constants in `lobbyGame.ts`.
3. Convert `LobbyPlayer` usages to `Player` throughout `lobbyGame.ts` and `CharacterSelect.tsx`.
4. Replace `updateLobbyPhysics` call-site with engine pipeline.
5. Refactor `updateBotLobbyAI` + wander to return `InputState`.
6. Replace `processStomps` AABB with `isStomping`.
7. Replace `drawLobbyCharacter` / `drawSquishedChar` with `drawPlayer`.
8. Update `lobbyGame.test.ts` field accessors.
9. Run full test suite + manual E2E.
