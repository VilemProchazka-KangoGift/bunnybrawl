# Lobby De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/engine/lobbyGame.ts`'s parallel mini-engine (885 lines) with calls to engine primitives — `Player` type, `physics.ts` pipeline, `isStomping()`, `drawPlayer` — while preserving lobby-specific behavior (swap-on-stomp, walk-to-zone bot AI, bespoke background art).

**Architecture:** `LobbyPlayer` → `Player`; `updateLobbyPhysics` → `applyInput` + `applyGravity` + `movePlayer` + `collidePlatforms` + inline clamp + `updatePlayerState`; synthetic 2-platform `Arena` (ground + wall); `isStomping()` replaces bespoke AABB math; `drawPlayer` replaces `drawLobbyCharacter` + `drawSquishedChar`. Swap-on-stomp, walk-to-zone bot AI, lobby art stay inline.

**Tech Stack:** TypeScript, Vitest, HTML5 Canvas 2D. No new libraries.

**Reference spec:** `docs/superpowers/specs/2026-04-16-lobby-dedupe-design.md`

---

## File Structure

**Modified:**
- `src/engine/lobbyGame.ts` — main refactor target (885 → ~400 lines)
- `src/engine/lobbyGame.test.ts` — mechanical field-name updates
- `src/components/CharacterSelect.tsx` — if any `LobbyPlayer` field access leaks (check `startMatch` callback)

**No new files.** The synthetic `LOBBY_ARENA`, `LOBBY_THEME`, and `makeLobbyPlayer` helpers live inside `lobbyGame.ts` alongside the existing class.

---

## Task 1: Add helpers (additive, no behavior change)

**Files:**
- Modify: `src/engine/lobbyGame.ts`

Adds new constants and factory at the top of the file. Nothing uses them yet — they'll be wired in later tasks. This keeps the diff reviewable.

- [ ] **Step 1: Add `LOBBY_ARENA` constant above the `LobbyGame` class**

Add after the existing constants block (around line 42, just before `// ---- Public types ----`):

```ts
import type { Arena } from './types';

// Synthetic arena used by engine physics (collidePlatforms needs a Platform[]).
// Ground spans full width; wall obstacle matches the visual WALL_X/WALL_Y/WALL_WIDTH/WALL_HEIGHT.
const LOBBY_ARENA: Arena = {
  id: 'lobby',
  name: 'Lobby',
  themeId: 'lobby',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y },
    { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT },
  ],
  spawnPoints: [],
  allowFallOff: false,
};
```

Also add `LOBBY_THEME` (minimal stub for `drawPlayer`):

```ts
import type { ThemeConfig } from './themes/types';

// Minimal theme stub for drawPlayer — it only reads theme.bubbleHelmet.
// Other fields set to satisfy the type but never consulted in the lobby render path.
const LOBBY_THEME = { bubbleHelmet: false } as unknown as ThemeConfig;
```

- [ ] **Step 2: Add `makeLobbyPlayer` factory above `LobbyGame` class**

```ts
import type { Player, CharacterDef, PlayerSlot } from './types';

function makeLobbyPlayer(slot: PlayerSlot, char: CharacterDef, x: number, y: number): Player {
  return {
    id: slot,
    character: { ...char, slot },
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

- [ ] **Step 3: Verify compilation**

Run: `npx tsc -b`
Expected: no errors (helpers are unused but type-check).

- [ ] **Step 4: Commit**

```bash
git add src/engine/lobbyGame.ts
git commit -m "refactor(lobby): add LOBBY_ARENA, LOBBY_THEME, makeLobbyPlayer helpers"
```

---

## Task 2: Refactor bot AI + NPC wander to return `InputState`

**Files:**
- Modify: `src/engine/lobbyGame.ts` (`updateBotLobbyAI` function + inline wander logic in `LobbyGame.update`)

Currently bot AI and the NPC wanderer mutate `vx`/`vy` directly. Refactor both to return an `InputState` (`{left, right, jump, down}`). Update `LobbyGame.update` to consume the returned state by mutating the player's velocity the same way it does today for humans (since engine physics isn't wired in yet — that's Task 4). This is a mechanical refactor that preserves behavior.

- [ ] **Step 1: Rewrite `updateBotLobbyAI` to return `InputState`**

Replace the current function (around line 401) with:

```ts
import type { InputState } from './types';

function botLobbyInput(bot: LobbyPlayer): InputState {
  const slotIdx = parseInt(bot.slot[1]) - 1;
  const speedMult = BOT_SPEED_VARIANCE[slotIdx % BOT_SPEED_VARIANCE.length];
  const pauseChance = BOT_PAUSE_CHANCE[slotIdx % BOT_PAUSE_CHANCE.length];

  const zoneWidth = CANVAS_WIDTH - READY_ZONE_X - 20;
  const botTargetX = READY_ZONE_X + 30 + (slotIdx / 5) * zoneWidth;

  // Past the zone entrance: fine-tune to target x
  if (bot.x + PLAYER_WIDTH > READY_ZONE_X + 20) {
    const dxToTarget = botTargetX - bot.x;
    if (Math.abs(dxToTarget) > 30) {
      return { left: dxToTarget < 0, right: dxToTarget > 0, jump: false, down: false };
    }
    return { left: false, right: false, jump: false, down: false };
  }

  // Random pause
  if (Math.random() < pauseChance) {
    return { left: false, right: false, jump: false, down: false };
  }

  // Default: walk right toward zone (speedMult baked into ratio — we can't vary speed via InputState,
  // but lobby physics clamps to LOBBY_SPEED regardless. Keep speedMult for backward-compat but unused here.)
  void speedMult;

  let jump = false;
  // Jump near wall
  if (bot.onGround && bot.x + PLAYER_WIDTH > WALL_X - 60 && bot.x < WALL_X + WALL_WIDTH + 20) {
    jump = true;
  }
  if (bot.onGround && Math.abs(bot.x - (WALL_X - PLAYER_WIDTH)) < 4) {
    jump = true;
  }

  return { left: false, right: true, jump, down: false };
}
```

Note: the in-air "push right through wall" branch (last if-block in the original) is removed because `collidePlatforms` (Task 4) will naturally resolve collisions. For now, without engine physics yet, this is fine — bots still walk right and jump.

- [ ] **Step 2: Update `LobbyGame.update` to consume `botLobbyInput`**

Replace the bot loop (around line 254) with:

```ts
// --- Bot players — directed AI walking toward ready zone ---
for (const bot of this.bots) {
  if (bot.splatTimer > 0) { bot.splatTimer = Math.max(0, bot.splatTimer - dt); continue; }
  const input = botLobbyInput(bot);
  applyInputToLobbyPlayer(bot, input);
  updateLobbyPhysics(bot, dt);
}
```

Add a helper above the class (this is a transitional helper — goes away in Task 4):

```ts
function applyInputToLobbyPlayer(p: LobbyPlayer, input: InputState): void {
  if (input.left) { p.vx = -LOBBY_SPEED; p.facing = 'left'; }
  else if (input.right) { p.vx = LOBBY_SPEED; p.facing = 'right'; }
  else { p.vx *= 0.85; if (Math.abs(p.vx) < 5) p.vx = 0; }
  if (input.jump && p.onGround) { p.vy = LOBBY_JUMP; p.onGround = false; }
  if (input.down && !p.onGround) p.vy = Math.max(p.vy, LOBBY_FAST_FALL);
}
```

- [ ] **Step 3: Replace inline NPC wander with `wanderInput` function**

Add helper:

```ts
function wanderInput(): InputState {
  const left = Math.random() < 0.005;
  const right = Math.random() < 0.005;
  const jump = Math.random() < 0.005;
  return { left: left && !right, right: right && !left, jump, down: false };
}
```

Replace the NPC loop (around line 246) with:

```ts
// --- NPC extras — simple wandering AI ---
for (const npc of this.extraChars) {
  if (npc.splatTimer > 0) { npc.splatTimer = Math.max(0, npc.splatTimer - dt); continue; }
  const input = wanderInput();
  applyInputToLobbyPlayer(npc, input);
  updateLobbyPhysics(npc, dt);
}
```

Note: NPC wander behavior changes slightly. The old logic occasionally set `vx` to a random value in `[-40, 40]`; the new logic uses input booleans, so `vx` will jump to `±LOBBY_SPEED` when `left`/`right` triggers. This is fine for the lobby — NPCs still wander unpredictably. If visual testing shows they're too jittery, add a `speedScale` field to `applyInputToLobbyPlayer` — but don't preemptively.

- [ ] **Step 4: Refactor human input loop to use the same helper**

Replace the human player loop input-building block (around line 213) with:

```ts
for (const p of this.players) {
  if (p.splatTimer > 0) { p.splatTimer = Math.max(0, p.splatTimer - dt); continue; }

  let input: InputState;
  if (touchInput && p.slot === 'P1') {
    input = touchInput;
  } else {
    const bindings = KEY_BINDINGS[p.slot as CharacterSlot];
    input = {
      left: keys.has(bindings.left),
      right: keys.has(bindings.right),
      jump: keys.has(bindings.jump),
      down: keys.has(bindings.down),
    };
  }

  applyInputToLobbyPlayer(p, input);

  // Crouch-on-ground squat (lobby-specific — stays here even after Task 4)
  if (input.down && p.onGround) p.squashScale = SQUASH_ON_CROUCH;

  updateLobbyPhysics(p, dt, input.down && p.onGround);
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- lobbyGame`
Expected: all lobby tests pass. Bot movement test (`bots move toward the ready zone`) should still pass since bots still walk right with `vx = LOBBY_SPEED`.

- [ ] **Step 6: Commit**

```bash
git add src/engine/lobbyGame.ts
git commit -m "refactor(lobby): bot AI and NPC wander return InputState"
```

---

## Task 3: Replace `LobbyPlayer` type with `Player`

**Files:**
- Modify: `src/engine/lobbyGame.ts`
- Modify: `src/engine/lobbyGame.test.ts`
- Modify: `src/components/CharacterSelect.tsx`

This is the largest task — a mechanical type swap. The `Player` type has more fields than `LobbyPlayer`, all provided with defaults by `makeLobbyPlayer`. The key field renames are `slot` → `id`, `char` → `character`, `onGround` → derived from `state !== 'airborne'`. After this task, `LobbyGame` arrays are typed as `Player[]` but physics still uses the bespoke `updateLobbyPhysics` (swapped out in Task 4).

- [ ] **Step 1: Remove the `LobbyPlayer` interface export**

Delete the `LobbyPlayer` interface block (lines ~78-92 in `lobbyGame.ts`). Remove `export` keyword where present.

- [ ] **Step 2: Replace every internal `LobbyPlayer` reference with `Player`**

In `lobbyGame.ts`:
- Class field types: `players: LobbyPlayer[]` → `players: Player[]` (same for `bots`, `extraChars`, `_allLobby`, `_participants`, `_extrasSet`)
- Function signatures: `updateBotLobbyAI(bot: LobbyPlayer, ...)` → `(bot: Player, ...)`, same for `updateLobbyPhysics`, `applyInputToLobbyPlayer`, `wanderInput` (doesn't take a player — unchanged), `drawSquishedChar`, `drawLobbyCharacter`, and the `drawLobby` parameters.
- Imports: add `Player` to the type import from `./types`.

- [ ] **Step 3: Replace `.slot` with `.id` and `.char` with `.character`**

In `lobbyGame.ts`, every access:
- `p.slot` → `p.id` (across all lobby player references)
- `p.char` → `p.character`

Use find-in-file replacement. Do NOT replace `CharacterSlot` or `BotSlot` type names.

The `KEY_BINDINGS[p.slot as CharacterSlot]` becomes `KEY_BINDINGS[p.id as CharacterSlot]`.

- [ ] **Step 4: Replace `.onGround` reads and writes**

`Player` has no `onGround` field; instead, `state === 'airborne'` means in-air.

In `lobbyGame.ts`:
- Reads: `p.onGround` → `p.state !== 'airborne'`
- Writes: `p.onGround = true` → `p.state = p.vx !== 0 ? 'run' : 'idle'`
- Writes: `p.onGround = false` → `p.state = 'airborne'`

This appears in:
- `makeLobbyPlayer` already sets `state: 'idle'` (covers initial `onGround: true`)
- `applyInputToLobbyPlayer`: the `if (input.jump && p.onGround)` check becomes `if (input.jump && p.state !== 'airborne')`; the `p.onGround = false` inside becomes `p.state = 'airborne'`
- `updateLobbyPhysics`: ground-land block — change `p.onGround = true` to `p.state = p.vx !== 0 ? 'run' : 'idle'`; wall-top block same
- `botLobbyInput`: `bot.onGround` reads → `bot.state !== 'airborne'`
- NPC init `onGround: true` is covered by `makeLobbyPlayer`'s `state: 'idle'`

- [ ] **Step 5: Update `LobbyGame` constructor to use `makeLobbyPlayer`**

Replace the three `.map(...)` blocks in the constructor (around lines 152-184) with:

```ts
this.players = activeSlots.map((slot, i) =>
  makeLobbyPlayer(slot, assigned[i], 40 + i * 90, GROUND_Y - PLAYER_HEIGHT)
);

this.bots = botSlots.map((slot, i) =>
  makeLobbyPlayer(slot, botAssigned[i], 40 + (SLOTS.length + i) * 60, GROUND_Y - PLAYER_HEIGHT)
);

this.extraChars = extras.map((ch) => {
  const p = makeLobbyPlayer('P1' as CharacterSlot, ch, 40 + Math.random() * (WALL_X - 80), GROUND_Y - PLAYER_HEIGHT);
  p.vx = (Math.random() - 0.5) * 60;
  p.facing = Math.random() > 0.5 ? 'right' : 'left';
  return p;
});
```

Note: extras still carry `id: 'P1'` because the engine's `Player.id` requires a valid slot. The lobby tracks extras via the `_extrasSet` reference check, not via slot.

- [ ] **Step 6: Update `lobbyGame.test.ts` — field name migration**

Mechanical replacements across the whole file:
- `p.slot` → `p.id` (where `p` is a lobby player)
- `p.char` → `p.character`
- `p.onGround` → `p.state !== 'airborne'` for reads
- `p.onGround = true` → `p.state = 'idle'`
- `p.onGround = false` → `p.state = 'airborne'`
- Remove the `import type { LobbyPlayer } from './lobbyGame'` line and any `LobbyPlayer` type annotations.

Specific test updates:
- `expect(slots).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])` at line ~65 — this reads from `p.slot`, change to `.id`, assertion stays the same.
- The "bots move toward the ready zone" test sets `bot.onGround = true` — change to `bot.state = 'idle'`.
- The "player jumps" test uses `p.onGround = true` and later `expect(p.onGround).toBe(false)` — rewrite as `p.state = 'idle'` and `expect(p.state).toBe('airborne')`.
- The "swaps characters on stomp" test uses `attacker.char.name`, `victim.char.name`, `victim.onGround = true`, `attacker.onGround = false` — convert each.

- [ ] **Step 7: Check `CharacterSelect.tsx` for `LobbyPlayer` field access**

Grep for `lobbyGameRef.current.` usages. The `startMatch` callback (line ~36) reads:
- `inZone.filter(p => !isBotSlot(p.slot))` → `inZone.filter(p => !isBotSlot(p.id))`
- `CHARACTERS[lp.slot as CharacterSlot] = { ...lp.char, slot: lp.slot }` → `CHARACTERS[lp.id as CharacterSlot] = { ...lp.character, slot: lp.id }`
- `humanInZone.map(p => p.slot as CharacterSlot)` → `humanInZone.map(p => p.id as CharacterSlot)`
- `botInZone.map(p => p.slot as BotSlot)` → `botInZone.map(p => p.id as BotSlot)`
- `BOT_CHARACTERS.set(bot.slot as BotSlot, { ...bot.char, slot: bot.slot })` → `.set(bot.id as BotSlot, { ...bot.character, slot: bot.id })`
- `activePlayers: PlayerSlot[] = inZone.map(p => p.slot)` → `inZone.map(p => p.id)`

- [ ] **Step 8: Run type check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Run lobby tests**

Run: `npm test -- lobbyGame`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/engine/lobbyGame.ts src/engine/lobbyGame.test.ts src/components/CharacterSelect.tsx
git commit -m "refactor(lobby): replace LobbyPlayer with engine Player type"
```

---

## Task 4: Replace `updateLobbyPhysics` with engine pipeline

**Files:**
- Modify: `src/engine/lobbyGame.ts`

Swap the bespoke physics + collision for the engine's `applyInput` → `applyGravity` → `movePlayer` → `collidePlatforms` → inline clamp → `updatePlayerState`. The transitional `applyInputToLobbyPlayer` goes away — inputs go through `applyInput` directly.

- [ ] **Step 1: Add a `clampLobbyBounds` helper inside `lobbyGame.ts`**

Add below `makeLobbyPlayer`:

```ts
function clampLobbyBounds(p: Player): void {
  // Horizontal clamp (NOT wrap — we don't want players teleporting across the canvas)
  if (p.x < 0) {
    if (p.vx < 0) p.sideSquash = 0.75;
    p.x = 0;
    p.vx = 0;
  } else if (p.x + p.width > CANVAS_WIDTH) {
    if (p.vx > 0) p.sideSquash = 0.75;
    p.x = CANVAS_WIDTH - p.width;
    p.vx = 0;
  }
  // Vertical ceiling
  if (p.y < 0) {
    p.y = 0;
    if (p.vy < 0) p.vy = 0;
  }
}
```

- [ ] **Step 2: Delete `updateLobbyPhysics` and `applyInputToLobbyPlayer`**

Remove both functions (around lines 447-498 and the transitional helper added in Task 2).

- [ ] **Step 3: Rewrite `LobbyGame.update` to use the engine pipeline**

Replace the three per-entity loops (players, extras, bots) with a unified loop. New body of `update` after the array-rebuild block:

```ts
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState } from './physics';

// ...inside update(), after rebuild of _allLobby/_participants/_extrasSet:

const step = (p: Player, input: InputState): void => {
  if (p.splatTimer > 0) { p.splatTimer = Math.max(0, p.splatTimer - dt); return; }

  applyInput(p, input, dt, LOBBY_SPEED, 1500 /* friction */, LOBBY_JUMP);
  applyGravity(p, dt, LOBBY_GRAVITY, 800);
  movePlayer(p, dt);
  collidePlatforms(p, LOBBY_ARENA.platforms);
  clampLobbyBounds(p);
  updatePlayerState(p);

  // Squash decay (engine decays these inside GameLoop with fround — lobby doesn't need determinism)
  if (p.squashScale !== 1) {
    p.squashScale += (1 - p.squashScale) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.squashScale - 1) < 0.02) p.squashScale = 1;
  }
  if (p.sideSquash !== 1) {
    p.sideSquash += (1 - p.sideSquash) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.sideSquash - 1) < 0.02) p.sideSquash = 1;
  }

  // Anim frame tick
  if (Math.abs(p.vx) > 10) {
    p.animTimer += dt;
    if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
  }

  // Lobby-specific: crouch-on-ground squat
  if (input.down && p.state !== 'airborne') p.squashScale = SQUASH_ON_CROUCH;
};

// Humans
for (const p of this.players) {
  let input: InputState;
  if (touchInput && p.id === 'P1') {
    input = touchInput;
  } else {
    const bindings = KEY_BINDINGS[p.id as CharacterSlot];
    input = {
      left: keys.has(bindings.left),
      right: keys.has(bindings.right),
      jump: keys.has(bindings.jump),
      down: keys.has(bindings.down),
    };
  }
  step(p, input);
}

// Extras (NPCs)
for (const npc of this.extraChars) {
  step(npc, wanderInput());
}

// Bots
for (const bot of this.bots) {
  step(bot, botLobbyInput(bot));
}
```

Note: `applyInput` will set `fastFalling = true` on `input.down && state === 'airborne'` and snap `vy` to `FAST_FALL_INITIAL`. This replaces the lobby's `LOBBY_FAST_FALL` (500). Acceptable — behavior is identical in spirit (snap to downward velocity when pressing down in air).

Note: `applyInput` checks `player.state === 'splat' || player.state === 'respawning'` and early-returns. The lobby never sets `respawning`, and the `splatTimer > 0` early-return at the top of `step` skips `applyInput` entirely for splatted players. Safe.

- [ ] **Step 4: Remove now-unused constants**

Delete these from `lobbyGame.ts` if no references remain after the refactor:
- `LOBBY_FAST_FALL` (replaced by `FAST_FALL_INITIAL` inside `applyInput`)
- The imports of `applySimpleGravity` and `moveSimple` from `./physics` (no longer used)

- [ ] **Step 5: Run tests**

Run: `npm test -- lobbyGame`
Expected: all tests pass.

Known quirks to watch:
- The "player jumps" test expects `p.vy < 0` after jump. `applyInput` sets `vy = JUMP_IMPULSE_arg * getJumpMult(p)` which for a fresh Player with `fatTimer=0, slowTimer=0` returns 1, so `vy = LOBBY_JUMP = -400`. Passes.
- The "applies gravity" test sets `p.y = 200; p.onGround = false` — after Task 3 that's `p.state = 'airborne'`. `applyGravity` doesn't skip when state is airborne (it only skips splat/respawning). Passes.
- The "moves player right when right key held" test uses `d` key (P1 right). `applyInput` with `right: true` accelerates via `ACCELERATION * dt`. One frame of dt = 1/60 with ACCELERATION ≈ 2000 → vx becomes ~33 px/s after one frame, then `movePlayer` moves x by ~0.5 px. The test asserts `p.x > 100`. Must verify: depending on ACCELERATION constant, one frame may produce movement > 0 but small. If the test fails due to insufficient movement per single frame, update the test to loop 5+ times:

```ts
for (let i = 0; i < 5; i++) game.update(1 / 60, new Set(['d']));
expect(p.x).toBeGreaterThan(100);
```

- [ ] **Step 6: Check ACCELERATION and fix move tests if needed**

```bash
grep -n "ACCELERATION" src/engine/constants.ts
```

If a single `1/60` tick with right-key produces < 1px movement, update the two `moves player right/left when key held` tests to iterate 5-10 times. Do the same for `P2 moves right with the correct key binding` and any other single-tick movement assertions in `lobbyGame.test.ts`.

- [ ] **Step 7: Run tests again**

Run: `npm test -- lobbyGame`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/lobbyGame.ts src/engine/lobbyGame.test.ts
git commit -m "refactor(lobby): use engine physics pipeline (applyInput + collidePlatforms)"
```

---

## Task 5: Replace `processStomps` AABB with `isStomping`

**Files:**
- Modify: `src/engine/lobbyGame.ts`

The AABB + vy threshold math in `processStomps` is exactly what `isStomping()` does. Swap it; keep the swap-on-stomp logic inline (that's genuinely lobby-specific).

- [ ] **Step 1: Import `isStomping`**

Add to the imports:

```ts
import { isStomping } from './stomp';
```

- [ ] **Step 2: Replace the AABB check inside `processStomps`**

Replace the `if (…)` block inside the inner victim loop (around lines 281-286) with:

```ts
if (isStomping(attacker, victim)) {
  const tempChar = attacker.character;
  attacker.character = { ...victim.character, slot: attacker.id };
  victim.character = { ...tempChar, slot: victim.id };
  victim.splatTimer = 0.8;
  victim.state = 'splat';  // so drawPlayer uses drawSplatCharacter (X-eyes)
  attacker.vy = -300;
  audio.play('stomp');

  const isNPC = this._extrasSet.has(victim);
  if (isNPC) {
    // … existing relocation logic unchanged …
  }
}
```

Remove the per-attacker `vy < STOMP_VY_THRESHOLD` pre-check — `isStomping` handles it internally.

- [ ] **Step 3: Clean up unused imports**

Remove `STOMP_VY_THRESHOLD` from the `./constants` import if no longer referenced. Remove `PLAYER_WIDTH, PLAYER_HEIGHT` from the AABB math (they're no longer used inline — `isStomping` reads from the Player). PLAYER_WIDTH may still be used elsewhere (tag positioning, etc.) — only remove if grep returns zero hits.

- [ ] **Step 4: Run tests**

Run: `npm test -- lobbyGame`
Expected: stomp test (`swaps characters on stomp`) still passes. The test setup ensures attacker is above victim with vy=200, which satisfies `isStomping`'s vy threshold and AABB overlap.

- [ ] **Step 5: Commit**

```bash
git add src/engine/lobbyGame.ts
git commit -m "refactor(lobby): reuse isStomping() for stomp detection"
```

---

## Task 6: Replace `drawLobbyCharacter` + `drawSquishedChar` with `drawPlayer`

**Files:**
- Modify: `src/engine/lobbyGame.ts`

`drawPlayer` already handles: facing flip, squash/sideSquash transform, running bounce, splat drawing (X-eyes via `drawSplatCharacter`), shadow, sprite caching. Every lobby-inappropriate overlay (killstreak flame, fire glow, slow pulse, damage flash, invincible blink, carrot blush) is gated by fields that stay at 0/false/null on lobby players.

- [ ] **Step 1: Import `drawPlayer`**

Add to the imports in `lobbyGame.ts`:

```ts
import { drawPlayer } from './rendering/players';
```

- [ ] **Step 2: Replace per-entity draw calls inside `drawLobby`**

Find the three "draw NPCs / bots / players" loops (around lines 658-698). Replace each character-draw call:

Old:
```ts
if (npc.splatTimer > 0) { drawSquishedChar(ctx, npc); }
else { drawLobbyCharacter(ctx, npc); }
```

New:
```ts
drawPlayer(ctx, npc, false /*nearCarrot*/, LOBBY_THEME, performance.now());
```

Do this for all three loops (NPCs, bots, players). The tag labels above each character (P1 badge, BOT badge, character name text) stay unchanged.

- [ ] **Step 3: Delete `drawLobbyCharacter` and `drawSquishedChar`**

Remove both function definitions at the bottom of `lobbyGame.ts` (around lines 843-885).

- [ ] **Step 4: Clean up unused imports**

Remove from `lobbyGame.ts`:
- `import { drawCharacterCore } from './rendering/players'` (replaced by `drawPlayer`)
- `SQUASH_ON_CROUCH` — still used for crouch squat, keep
- `SQUASH_DECAY_SPEED` — still used for squash decay, keep
- `STOMP_VY_THRESHOLD` — removed in Task 5, should already be gone
- `PLAYER_HEIGHT` — still used (tag positioning, spawn Y), keep

Grep-verify before deleting: any import where zero hits remain in the file should be deleted.

- [ ] **Step 5: Run tests**

Run: `npm test -- lobbyGame`
Expected: pass. Note that `lobbyGame.test.ts` already mocks `drawCharacterCore`; update the `vi.mock('./rendering/players', ...)` block to also mock `drawPlayer`:

```ts
vi.mock('./rendering/players', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, drawCharacterCore: vi.fn(), drawPlayer: vi.fn() };
});
```

- [ ] **Step 6: Visual verification**

Run: `npm run dev`
Open lobby (CharacterSelect screen). Verify:
- Characters render with correct sprites, facing, legs, eyes.
- Running animation plays when walking.
- Squash/stretch from landing looks right.
- Wall-hit side squash fires.
- Splat (stomp victim): X-eyed splat appears instead of flat ellipse (approved visual change).
- Shadow appears under each character (this is an additive polish from `drawPlayer` that the old code didn't have).

- [ ] **Step 7: Commit**

```bash
git add src/engine/lobbyGame.ts src/engine/lobbyGame.test.ts
git commit -m "refactor(lobby): reuse drawPlayer for all character rendering"
```

---

## Task 7: Final cleanup + verification

**Files:**
- Modify: `src/engine/lobbyGame.ts` (imports cleanup only)
- Verify: all tests, type check, E2E smoke

- [ ] **Step 1: Check final line count**

Run: `wc -l src/engine/lobbyGame.ts`
Expected: ~400 lines (down from 885). If significantly higher, scan for dead code missed in previous tasks.

- [ ] **Step 2: Remove unused imports**

Grep for each import in `lobbyGame.ts`. Delete any with zero uses. Expected removals include (confirm each):
- `applySimpleGravity`, `moveSimple` (Task 4)
- `drawCharacterCore` (Task 6)
- `STOMP_VY_THRESHOLD` (Task 5)
- `LOBBY_FAST_FALL` constant (Task 4) — already removed

- [ ] **Step 3: Full type check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all ~1600 tests pass. Known pre-existing failures in `MainMenu.test.tsx` and `VictoryScreen.test.tsx` (logo.png import) are acceptable — do not count as regressions.

- [ ] **Step 5: Dev server smoke test**

Run: `npm run dev`
Open `http://localhost:5173/carrot-royale/` → Main Menu → Play → Character Select.

Smoke checklist:
- [ ] P1–P5 characters visible at bottom of the lobby
- [ ] WASD (P1) moves and jumps the first character
- [ ] Bots walk right toward the ready zone and jump the wall
- [ ] NPC extras wander unpredictably
- [ ] Stomp an NPC: character swap happens, victim shows X-eyed splat briefly
- [ ] 1 human + 1 bot enter ready zone → countdown starts (5 seconds)
- [ ] Countdown reaches 0 → match starts with selected characters

- [ ] **Step 6: Mobile smoke test**

Run: open `http://localhost:5173/carrot-royale/?mobile` in desktop browser (forces touch mode).

Smoke checklist:
- [ ] Only P1 spawned (no P2–P5 in the lobby)
- [ ] Touch joystick moves P1
- [ ] Swipe up triggers jump
- [ ] Touch input drives same physics path as keyboard (visually indistinguishable)

- [ ] **Step 7: E2E lobby test**

Run: `npm run test:e2e -- lobby`
Expected: lobby E2E tests pass (walk-to-zone + start match). The flaky `@flaky` test may need a retry — rerun once if it fails.

- [ ] **Step 8: Commit any final cleanup**

```bash
git add src/engine/lobbyGame.ts
git commit -m "refactor(lobby): final cleanup of unused imports and constants" --allow-empty
```

(The `--allow-empty` is insurance — no-op if there's nothing to commit.)

- [ ] **Step 9: Update CLAUDE.md caveat notes**

Open `src/components/CLAUDE.md` and find the bullet:

> `CharacterSelect.tsx` has its own physics loop — separate from engine `physics.ts`. `LobbyPlayer` has `sideSquash` and `squashScale`, both decaying at rate 8.

Replace with:

> `CharacterSelect.tsx` delegates to `LobbyGame` which uses engine physics (`applyInput` + `collidePlatforms` against a 2-platform synthetic `LOBBY_ARENA`). Swap-on-stomp, walk-to-zone bot AI, and bespoke lobby art remain lobby-specific. Squash decay is inline (no fround — lobby is not network-replicated).

Also find the bullet in `src/engine/CLAUDE.md`:

> Lobby bots (`updateBotLobbyAI()` in CharacterSelect) are completely separate from match AI.

Replace with:

> Lobby bots (`botLobbyInput()` in `lobbyGame.ts`) return `InputState` and go through `applyInput` like humans. Behavior (walk-to-zone + wall-jump) remains lobby-specific and does not share code with match AI.

- [ ] **Step 10: Commit docs update**

```bash
git add src/components/CLAUDE.md src/engine/CLAUDE.md
git commit -m "docs: update CLAUDE.md after lobby de-duplication"
```

---

## Self-Review Checklist

Already verified inline:

- [x] Spec coverage: every table row in "Collapse onto engine" has a task. `LobbyPlayer→Player` (T3), physics pipeline (T4), synthetic arena (T1+T4), `isStomping` (T5), `drawPlayer` (T6). Spec mentioned a `decaySquash` helper in `physics.ts`; after reading `gameLoop/GameLoop.ts` and `gameLoop/cosmetics/playerCosmetics.ts`, the match code uses `Math.fround` for network determinism and `squashTimer` gating — materially different from lobby's inline decay. Extracting a shared helper would either break match determinism or carry fround cost into the lobby pointlessly. **Decision:** keep decay inline in lobby (Task 4, Step 3). Match code unchanged. This is the one spec deviation — recorded here rather than amending the spec because the divergence is trivial.
- [x] No placeholders — every code block is complete.
- [x] Type consistency — `InputState`, `Player`, `Arena`, `ThemeConfig` types used consistently across tasks. Field renames (`slot`/`char`/`onGround` → `id`/`character`/`state`) applied uniformly.
- [x] No deferred details — test update expectations are spelled out; the "iterate 5 times if single-frame movement is insufficient" path is named explicitly in Task 4 Step 6.

Ready for execution.
