# Fun Idle Animations — Design

**Date:** 2026-04-24
**Scope:** Both lobby and in-match. All 17 characters.
**Goal:** Replace the current single-axis idle pulse (head-tilt / head-flip / head-bob / none) with a chatty, varied, per-character idle system. Also fix the bug where leg frames cycle as if walking when standing still.

---

## Problem

Current behavior:

1. **Bug:** `gameLoop/cosmetics/playerCosmetics.ts:28-32` advances `animFrame` every frame regardless of state. During in-match idle the legs cycle through `RUN_FRAMES`, producing a "marching in place" look. The lobby version (`lobbyGame.ts:185-188`) guards correctly on `|vx| > 10`.
2. **Idle feels flat.** Every 3s the character does one transform (defined per pack as `'none' | 'headTilt' | 'headFlip' | 'headBob'`) over a 0.5s pulse, then sits still for 2.5s. The four pack-level tweaks (bunny ear twitch, bear scratch, fox tail wag, frog blink) ride on top via `isIdleAnim`/`idleT`. The cycle is predictable, low-energy, and most characters use only one of the four transforms throughout a match.

## Goal

A chatty rhythm with varied, fun idle actions. Every character should feel alive within seconds of going still. Architecture leaves room for per-character signature moves later, but v1 ships with a shared library that gives all 17 characters distinct-looking idles for free.

## Decisions captured during brainstorming

- **Scope:** lobby + match (and the lobby uses `drawCharacterCore` already, so it picks up the new behavior once its `step()` loop populates the new fields).
- **Architecture:** hybrid — shared action library + optional per-pack signature actions and weight overrides.
- **Rhythm:** chatty. First action fires after **0.8s** of standing still, then short rests between actions (0.6–1.4s).
- **Reactivity:** none. Pure weighted random pick, no environment/enemy awareness.
- **Network:** local-only state. Fields are not added to the host-authoritative snapshot. Idle picks diverge between peers — purely cosmetic, nobody watching one character.
- **Migration of existing per-pack flavor:** kept. Bunny/bear/fox/frog tweaks fire whenever an idle action is active; converting them to first-class custom actions is a future PR.

---

## Section 1 — Bug fix: legs animating during idle

`gameLoop/cosmetics/playerCosmetics.ts:28-32` advances `animFrame` unconditionally. Change to advance only when `player.state === 'run'`. On the frame the player leaves run, reset `animFrame = 0` and `animTimer = 0` so the standing pose is the canonical "frame 0" foot placement.

Lobby is already correct (gated on `|vx| > 10`); no change there.

## Section 2 — Player state fields

Three new fields on `Player`:

```ts
idleAction: number;         // index into player's action pool, -1 = none ("rest")
idleActionTimer: number;    // seconds remaining in current action or rest gap
idleActionDuration: number; // total duration of current action; 0 during rest
```

`idleAnimTimer` is kept for one release as a derived value (`= isIdleAnim ? idleActionTimer : 0`). The four packs that already read `isIdleAnim` / `idleT` (bunny, bear, fox, frog) keep working unchanged. A future PR can convert their tweaks into proper custom signature actions and remove `idleAnimTimer`.

**Initial values:** new player constructors (`gameLoop/initialState.ts`, `lobbyGame.ts`, test helpers in `engine/__tests__/testHelpers.ts`, mock players in `VictoryScreen.test.tsx`) set `idleAction = -1`, `idleActionTimer = 0`, `idleActionDuration = 0`.

**Network:** none of the three fields enter `net/snapshot.ts`. Idle action selection runs locally on host and each guest. Divergence is acceptable and matches how `idleAnimTimer` already behaves in host-authoritative mode (it lives only in the legacy `net/serialize.ts` local-mode test path).

## Section 3 — Shared action library

New module: `src/engine/rendering/idleActions.ts`. Each action is data + an `apply(ctx, cx, yOff, w, h, t, colors)` function where `t ∈ [0,1]` eases linearly across the action's duration. Apply runs *before* `drawCharacterCore` so its ctx transform doesn't invalidate the sprite cache.

Initial action set:

| id | duration | effect |
|---|---|---|
| `headBob` | 0.7s | 2px vertical bob (`Math.sin(t * π) * 2`). Existing behavior. |
| `headTilt` | 0.7s | Rotate ±0.12 rad about body center (`y = yOff + h * 0.5`). Existing behavior. |
| `headShake` | 0.8s | Two oscillations of ±0.08 rad rotate. "No no no." |
| `littleHop` | 0.55s | Visual Y offset arc up to 14px (`-Math.sin(t * π) * 14`). No physics. |
| `stretch` | 0.95s | scaleY 1 → 1.10 → 1, scaleX 1 → 0.95 → 1, anchored at body bottom. |
| `lookAround` | 1.0s | Flips `player.facing` left → right → original (no transform). |

`lookAround` is the one action that mutates `player.facing`. The sprite cache already keys on facing, so this is safe.

The old `idleTransform: 'headFlip'` (scaleX squish through 0.85) is dropped — at 40px character height it reads as a glitch. Owl is the only pack using it today; its weight map (Section 4) favors `headTilt` and `lookAround` instead.

## Section 4 — Per-pack config

Replace `CharacterPack.idleTransform` with `idleActions`:

```ts
type SharedActionId = 'headBob' | 'headTilt' | 'headShake' | 'littleHop' | 'stretch' | 'lookAround';

type CustomIdleAction = {
  id: string;
  duration: number;
  weight: number;
  apply: (ctx, cx, yOff, w, h, t, colors) => void;
};

interface CharacterPack {
  // ...existing fields, idleTransform removed
  idleActions?: {
    weights?: Partial<Record<SharedActionId, number>>;  // override default 1.0; 0 disables
    custom?: CustomIdleAction[];                         // pack-specific signatures
  };
}
```

**Default behavior:** if a pack omits `idleActions`, all 6 shared actions are weighted 1.0. Every character gets variety for free.

**Pool resolution:** the action pool for a character is built once at first lookup and cached: `[...sharedActionsWithNonZeroWeight, ...customActions]`. The pack config is read from the registry. `getIdleAction(charName, index)` and `pickIdleAction(charName)` are the two public functions in `idleActions.ts`.

**v1 signature actions:** none. Shared pool plus existing per-pack sprite tweaks (bunny ear twitch, etc.) already covers all 17 characters distinctly. The `custom` slot is wired so future PRs can add bunny `bigHop`, fox `tailChase`, bear `bellyScratch`, etc. without re-architecting.

**Owl weight override** (only one in v1):

```ts
idleActions: { weights: { stretch: 0 } } // owl has no arms; stretch reads weird
```

Other packs ship without an `idleActions` field.

## Section 5 — Driver state machine

Lives in `gameLoop/cosmetics/playerCosmetics.ts` (in-match) and is mirrored in `lobbyGame.ts:190-195` (lobby). Replaces the current `idleAnimTimer` block.

Constants in `engine/constants.ts`:

```ts
export const IDLE_FIRST_DELAY = 0.8;   // seconds standing still before first action
export const IDLE_REST_MIN    = 0.6;   // min gap between actions
export const IDLE_REST_MAX    = 1.4;   // max gap between actions
```

Per-frame logic (when `player.state === 'idle'`):

```
idleActionTimer -= dt
if idleActionTimer <= 0:
  if idleAction >= 0:
    // current action just ended → enter rest
    idleAction = -1
    idleActionTimer = randRange(IDLE_REST_MIN, IDLE_REST_MAX)
    idleActionDuration = 0
  else:
    // rest just ended → pick next action
    pick = pickIdleAction(charName)
    idleAction = pick.indexInPool
    idleActionDuration = pick.duration
    idleActionTimer = pick.duration
```

State transitions:

```
on entering idle (state changed away from 'idle' → 'idle'):
  idleAction = -1
  idleActionTimer = IDLE_FIRST_DELAY
  idleActionDuration = 0

on leaving idle:
  idleAction = -1
  idleActionTimer = 0
  idleActionDuration = 0
```

**Detection of "entering idle"** is implicit: when `state !== 'idle'` the timer is reset to 0; the next time `state === 'idle'` and `idleAction === -1` and `idleActionTimer === 0`, treat it as the first-action case but seed the timer with `IDLE_FIRST_DELAY` instead of a random rest. Implementation note: cleanest is an explicit `if (player.state !== 'idle') { reset; } else if (timer === 0 && action === -1) { timer = IDLE_FIRST_DELAY; }`.

**Rhythm check:** 0.8s → ~0.7s action → ~1.0s rest → ~0.7s action → ~1.0s rest → ... = action every ~1.7s on average. With 5 players, the random per-player rest gap (0.6–1.4s) keeps actions out of phase.

**Weighted pick:** inline helper, allocation-free in the hot path. Pool is built once per character on first lookup and cached in a module-scope `Map<charName, Pool>`. `Math.random()` is fine; no determinism needed.

**Hitstop / splat / disconnected:** the `state === 'idle'` guard handles these — splat sets `state = 'splat'`, hitstop is skipped at the system-loop level entirely.

## Section 6 — Renderer integration

In `rendering/players.ts` `_drawCharacterSpriteImpl` (currently lines 271-292), replace the `idleTransform` switch with action dispatch.

The function currently receives `idleAnimTimer?: number` from its caller (`drawCharacterSprite` in the same file). Extend the parameter list to take `idleAction`, `idleActionTimer`, `idleActionDuration`. Update the single internal call site and the public `drawCharacterSprite` signature; update its callers in `renderer.ts` (which has the player object) and `lobbyRender.ts` (same — has the player object).

```ts
// OLD: switch (pack.idleTransform) { case 'headTilt': ... }
// NEW: dispatch to whatever action is active
if (idleAction >= 0 && state !== 'run' && state !== 'airborne') {
  const action = getIdleAction(char.name, idleAction);
  const t = idleActionDuration > 0
    ? 1 - (idleActionTimer / idleActionDuration)
    : 0;
  action.apply(ctx, cx, yOff, w, h, t, colors);
}
```

**Sprite cache key:** today's key (`name_state_animFrame_fastFalling_idleKey_sqKey`, `players.ts` ~line 195) includes `idleKey` derived from `idleAnimTimer`. Shared actions are pure ctx transforms applied outside the cached draw, so they don't belong in the key. Drop `idleKey` and replace with a 1-bit `isIdleAnim` flag (`true` while any action is playing, `false` during rest). That gives the four packs whose `drawSprite` reads `isIdleAnim` (bunny/bear/fox/frog) the two-state variation they have today, without the per-frame cache thrash that `idleKey` produced.

The cache cap (`_spriteCacheCap`, currently 600) does not need to change.

**`isIdleAnim` / `idleT` to pack renderers:** still passed (for backward compat with bunny/bear/fox/frog). `isIdleAnim = idleAction >= 0`. **Semantics change for `idleT`:** today it's seconds-into-pulse in `[0, 0.5)`; the four packs read `(idleT / 0.5)` to normalize. New value is the already-normalized `idleT = 1 - (idleActionTimer / idleActionDuration)` ∈ `[0, 1]`. The four packs must be updated in this PR to drop the `/ 0.5` divisor:

- `bunny.ts:8`: `Math.sin((idleT / 0.5) * Math.PI) * 0.25` → `Math.sin(idleT * Math.PI) * 0.25`
- `bear.ts:27`: `Math.sin((idleT / 0.5) * Math.PI * 3) * 3` → `Math.sin(idleT * Math.PI * 3) * 3`
- `fox.ts:22`: `Math.sin((idleT / 0.5) * Math.PI * 2) * 4` → `Math.sin(idleT * Math.PI * 2) * 4`
- `frog.ts:16`: `(idleT / 0.5) > 0.3 && (idleT / 0.5) < 0.7` → `idleT > 0.3 && idleT < 0.7`

**Lobby renderer (`lobbyRender.ts`):** uses `drawCharacterCore`, picks up new behavior automatically once `LobbyGame.step()` runs the same state-machine logic.

**Test impact:**

- `characters/builtin.test.ts:83-86` asserts `idleTransform ∈ ['none','headTilt','headFlip','headBob']`. Drop this test — the field is gone.
- `engine/__tests__/testHelpers.ts` `makePlayer()` needs `idleAction: -1, idleActionTimer: 0, idleActionDuration: 0`. Mock players in `components/VictoryScreen.test.tsx` likewise.
- `gameLoop.test.ts` test "idleAnimTimer increments when player is idle" (line 2502) — adapt to assert `idleActionTimer > 0` instead, or replace with a test on `idleAction` cycling.
- New unit tests:
  - `idleActions.ts`: each shared action's `apply` runs without throwing across `t ∈ [0, 0.5, 1]`.
  - Driver: entering idle seeds 0.8s; action timer counts down; transitions action → rest → action; leaving idle clears.
  - Pool resolution: default pack gets all 6 shared actions; `weights: { stretch: 0 }` excludes stretch; custom actions appended.

## Migration / rollout

Single PR:

1. Remove `idleTransform` from the `CharacterPack` type and from all 17 pack files.
2. Add `idleActions` field; only owl populates it (`weights: { stretch: 0 }`).
3. Add new `Player` fields and update all constructors / test helpers.
4. Add `rendering/idleActions.ts` with the 6 shared actions.
5. Update `playerCosmetics.ts` driver and bug-fix `animFrame` advance.
6. Mirror driver in `lobbyGame.ts:190-195`.
7. Update `_drawCharacterSpriteImpl` signature and dispatch; drop `idleKey` from cache key, add `isIdleAnim` 1-bit.
8. Update bunny/bear/fox/frog `drawSprite` to drop the `/ 0.5` `idleT` normalization (Section 6).
9. Update tests per Section 6.

No deprecation period needed for the type field — we own all packs.

## Out of scope (future)

- Custom signature actions per pack (bunny `bigHop`, fox `tailChase`, bear `bellyScratch`, owl `wingPreen`, frog `croak`).
- Migrating the existing four packs' inline sprite tweaks to first-class custom actions and removing `idleAnimTimer`.
- Light reactivity (look-toward-nearest, shiver-near-lava). Brainstorm explicitly chose A: self-contained.
- Idle action sounds (yawn, croak, etc.). The audio system supports per-character sounds today; adding a `soundOnStart?: SoundName` field to actions is a one-line follow-up if desired.
