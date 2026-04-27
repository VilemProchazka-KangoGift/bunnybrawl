# Fun Idle Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-axis idle pulse with a varied, "chatty" idle action system across all 17 characters in both lobby and match — and fix the bug where leg frames cycle as if walking when standing still.

**Architecture:** Three new local-only Player fields (`idleAction`, `idleActionTimer`, `idleActionDuration`) drive a per-player state machine in `playerCosmetics.ts` (in-match) and `lobbyGame.ts` (lobby). A new module `rendering/idleActions.ts` defines 6 shared actions; `CharacterPack.idleActions` lets packs override weights or add custom signatures. Renderer dispatches by action id via ctx transforms, applied before the cached sprite draw.

**Tech Stack:** TypeScript, Vitest, HTML5 Canvas 2D (no new deps).

**Spec:** `docs/superpowers/specs/2026-04-24-fun-idle-animations-design.md`

---

## File structure

**New files:**
- `src/engine/rendering/idleActions.ts` — type definitions, 6 shared actions, pool resolution, weighted pick.
- `src/engine/rendering/__tests__/idleActions.test.ts` — pure-function tests for actions, pool resolution, picker.

**Modified files:**
- `src/engine/constants.ts` — add `IDLE_FIRST_DELAY`, `IDLE_REST_MIN`, `IDLE_REST_MAX`.
- `src/engine/types.ts` — add 3 new `Player` fields (keep `idleAnimTimer` for now).
- `src/engine/characters/types.ts` — remove `IdleTransformType` and `idleTransform` field; add `idleActions?` field.
- `src/engine/gameLoop/initialState.ts` — initialize new fields in player factory.
- `src/engine/gameLoop/cosmetics/playerCosmetics.ts` — bug fix (gate `animFrame` advance) + new state machine.
- `src/engine/lobbyGame.ts` — initialize new fields, mirror state machine.
- `src/engine/rendering/players.ts` — add idleAction dispatch, drop `idleKey` from sprite cache key, replace with `isIdleAnim` 1-bit; update `drawCharacterSprite` and `_drawCharacterSpriteImpl` signatures.
- All 17 pack files in `src/engine/characters/packs/*.ts` — remove `idleTransform` line; owl gets `idleActions: { weights: { stretch: 0 } }`.
- 4 packs (`bunny.ts`, `bear.ts`, `fox.ts`, `frog.ts`) — drop `/ 0.5` divisor from `idleT` usage in `drawSprite`.
- `src/engine/__tests__/testHelpers.ts` — add new fields to `makePlayer()`.
- `src/engine/net/serialize.ts` — add new fields to legacy local-mode serializer (legacy / test-only path).
- `src/engine/net/serialize.test.ts`, `src/engine/net/net.test.ts`, `src/engine/net/interpolation.test.ts` — fixture updates.
- `src/engine/characters/builtin.test.ts` — drop `idleTransform` assertion.
- `src/engine/characters/__tests__/registry.test.ts` — drop `idleTransform: 'none'` from test factory.
- `src/engine/gameLoop.test.ts` — adapt `idleAnimTimer increments` test (line 2502) to test the new state machine.

---

## Task 1: Bug fix — animFrame stops cycling when not running

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/playerCosmetics.ts:28-32`
- Test: `src/engine/gameLoop.test.ts` (new test near line 2495)

- [ ] **Step 1: Write the failing test**

In `src/engine/gameLoop.test.ts`, add immediately after the existing "animFrame advance" test:

```ts
it('animFrame stays at 0 when player is idle (not running)', () => {
  const { loop } = createLoop();
  loop.skipCountdown();
  const state = loop.getState();
  const player = state.players[0];

  player.x = 200;
  player.y = 660 - PLAYER_HEIGHT;
  player.vx = 0;
  player.state = 'idle';
  player.active = true;
  player.hitstopTimer = 0;
  player.animFrame = 0;
  player.animTimer = 0;

  for (let i = 0; i < 30; i++) {
    loop.fixedUpdate(FIXED_TIMESTEP);
    loop.cosmeticStep(FIXED_TIMESTEP);
  }

  expect(player.animFrame).toBe(0);
});

it('animFrame resets to 0 when state transitions from run to idle', () => {
  const { loop } = createLoop();
  loop.skipCountdown();
  const state = loop.getState();
  const player = state.players[0];

  player.x = 200;
  player.y = 660 - PLAYER_HEIGHT;
  player.state = 'run';
  player.animFrame = 2;
  player.animTimer = 0.05;

  // Now switch to idle
  player.state = 'idle';
  player.vx = 0;
  loop.fixedUpdate(FIXED_TIMESTEP);
  loop.cosmeticStep(FIXED_TIMESTEP);

  expect(player.animFrame).toBe(0);
  expect(player.animTimer).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- gameLoop.test.ts -t "animFrame"`
Expected: the two new tests FAIL (current code ticks animFrame regardless of state).

- [ ] **Step 3: Implement the fix**

In `src/engine/gameLoop/cosmetics/playerCosmetics.ts`, replace lines 27-32:

```ts
  // Animation frame advance — only while running. Reset on transition out.
  if (player.state === 'run') {
    player.animTimer += dt;
    if (player.animTimer >= ANIM_FRAME_DURATION) {
      player.animTimer -= ANIM_FRAME_DURATION;
      player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
    }
  } else {
    player.animFrame = 0;
    player.animTimer = 0;
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- gameLoop.test.ts -t "animFrame"`
Expected: both new tests PASS, plus the existing "animFrame advance" test (verifies running advances) still passes.

- [ ] **Step 5: Commit**

```bash
git add src/engine/gameLoop/cosmetics/playerCosmetics.ts src/engine/gameLoop.test.ts
git commit -m "fix: stop legs walking in place during in-match idle"
```

---

## Task 2: Add constants

**Files:**
- Modify: `src/engine/constants.ts:87-88`

- [ ] **Step 1: Add new constants**

In `src/engine/constants.ts`, replace the existing "Idle animation" section:

```ts
// Idle animation
export const IDLE_ANIM_INTERVAL = 3;    // legacy — retained while idleAnimTimer transitional field still exists
export const IDLE_FIRST_DELAY  = 0.8;   // seconds standing still before first idle action
export const IDLE_REST_MIN     = 0.6;   // min seconds between idle actions
export const IDLE_REST_MAX     = 1.4;   // max seconds between idle actions
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `npm test -- --run`
Expected: full suite still PASS (constants are not yet read by anything new).

- [ ] **Step 3: Commit**

```bash
git add src/engine/constants.ts
git commit -m "feat: add idle action timing constants"
```

---

## Task 3: Add new Player fields

**Files:**
- Modify: `src/engine/types.ts:119-121`
- Modify: `src/engine/gameLoop/initialState.ts:66`
- Modify: `src/engine/lobbyGame.ts:37`
- Modify: `src/engine/__tests__/testHelpers.ts:32`
- Modify: `src/engine/net/serialize.ts:35,118,150`
- Modify: `src/engine/net/serialize.test.ts:35`
- Modify: `src/engine/net/net.test.ts:301,369`
- Modify: `src/engine/net/interpolation.test.ts:154-155`

- [ ] **Step 1: Add fields to Player interface**

In `src/engine/types.ts`, replace line 120 with:

```ts
  idleAnimTimer: number; // legacy — derived from idleAction state for backward compat
  idleAction: number;        // index into pack's idle action pool, -1 = none (resting)
  idleActionTimer: number;   // seconds remaining in current action or rest gap
  idleActionDuration: number;// total duration of current action; 0 during rest
```

- [ ] **Step 2: Initialize in `gameLoop/initialState.ts`**

Replace line 66:

```ts
    squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [], idleAnimTimer: 0,
    idleAction: -1, idleActionTimer: 0, idleActionDuration: 0,
```

- [ ] **Step 3: Initialize in `lobbyGame.ts`**

Replace line 37:

```ts
    afterimages: [], idleAnimTimer: 0,
    idleAction: -1, idleActionTimer: 0, idleActionDuration: 0,
```

- [ ] **Step 4: Initialize in `__tests__/testHelpers.ts`**

After line 32 (`idleAnimTimer: 0,`) add:

```ts
    idleAction: -1,
    idleActionTimer: 0,
    idleActionDuration: 0,
```

- [ ] **Step 5: Update legacy serialize**

In `src/engine/net/serialize.ts`:
- After line 35 (`idleAnimTimer: number;`), add:
```ts
  idleAction: number;
  idleActionTimer: number;
  idleActionDuration: number;
```
- After line 118 (`idleAnimTimer: p.idleAnimTimer,`), add:
```ts
    idleAction: p.idleAction,
    idleActionTimer: p.idleActionTimer,
    idleActionDuration: p.idleActionDuration,
```
- After line 150 (`p.idleAnimTimer = snap.idleAnimTimer;`), add:
```ts
  p.idleAction = snap.idleAction;
  p.idleActionTimer = snap.idleActionTimer;
  p.idleActionDuration = snap.idleActionDuration;
```

- [ ] **Step 6: Update test fixtures**

In `src/engine/net/serialize.test.ts:35` — after `idleAnimTimer: 1.2,` add `idleAction: -1, idleActionTimer: 0, idleActionDuration: 0,`

In `src/engine/net/net.test.ts:301` — same add.

In `src/engine/net/net.test.ts:369` — find the line `p.squashTimer = 0; p.sideSquash = 1; p.idleAnimTimer = 0;` and append: `p.idleAction = -1; p.idleActionTimer = 0; p.idleActionDuration = 0;`

In `src/engine/net/interpolation.test.ts:154-155` — both lines have `idleAnimTimer: 0,`. After each, add `idleAction: -1, idleActionTimer: 0, idleActionDuration: 0,`.

- [ ] **Step 7: Run full test suite**

Run: `npm test -- --run`
Expected: all tests PASS. (No behavior change yet — fields exist with default values.)

- [ ] **Step 8: Run typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/engine/gameLoop/initialState.ts src/engine/lobbyGame.ts src/engine/__tests__/testHelpers.ts src/engine/net/serialize.ts src/engine/net/serialize.test.ts src/engine/net/net.test.ts src/engine/net/interpolation.test.ts
git commit -m "feat: add idleAction state fields to Player"
```

---

## Task 4: Shared idle action library + tests

**Files:**
- Create: `src/engine/rendering/idleActions.ts`
- Create: `src/engine/rendering/__tests__/idleActions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/engine/rendering/__tests__/idleActions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SHARED_ACTION_IDS, getSharedAction, getActionPool, pickIdleAction, getIdleAction,
  clearIdleActionCache,
} from '../idleActions';
import { registerCharacter, getCharacterPack } from '../../characters/registry';
import { registerBuiltinCharacters } from '../../characters/builtin';

describe('idleActions', () => {
  beforeEach(() => {
    clearIdleActionCache();
    registerBuiltinCharacters();
  });

  it('exposes the 6 shared actions', () => {
    expect(SHARED_ACTION_IDS).toEqual(['headBob', 'headTilt', 'headShake', 'littleHop', 'stretch', 'lookAround']);
  });

  it('every shared action has a positive duration', () => {
    for (const id of SHARED_ACTION_IDS) {
      const a = getSharedAction(id)!;
      expect(a.duration).toBeGreaterThan(0);
    }
  });

  it('every shared action apply runs without throwing for t in [0, 0.5, 1]', () => {
    const ctx = makeFakeCtx();
    const colors = { color: '#fff', darkColor: '#888', lightColor: '#fff' };
    for (const id of SHARED_ACTION_IDS) {
      const a = getSharedAction(id)!;
      for (const t of [0, 0.5, 1]) {
        const fakePlayer = { facing: 'right' as const };
        expect(() => a.apply(ctx, 100, 100, 32, 40, t, colors, fakePlayer)).not.toThrow();
      }
    }
  });

  it('default pool for a pack with no idleActions field includes all 6 shared actions', () => {
    const pool = getActionPool('Bunny'); // bunny has no idleActions field
    expect(pool.length).toBe(6);
  });

  it('weight of 0 excludes a shared action from the pool', () => {
    // Owl will be configured with stretch: 0 in Task 6 — until then, register a test pack.
    registerCharacter({
      name: 'TestExclude', emoji: '!', color: '#fff', darkColor: '#888', lightColor: '#fff',
      customEyes: false,
      idleActions: { weights: { stretch: 0, headShake: 0 } },
      drawSprite: () => {}, drawGib: () => {},
      splatShape: 'circle', gibs: [],
      bodyEllipse: () => ({ cx: 0, cy: 0, rx: 1, ry: 1 }),
    });
    clearIdleActionCache();
    const pool = getActionPool('TestExclude');
    expect(pool.length).toBe(4);
    expect(pool.map(a => a.id)).not.toContain('stretch');
    expect(pool.map(a => a.id)).not.toContain('headShake');
  });

  it('custom actions are appended after shared actions', () => {
    registerCharacter({
      name: 'TestCustom', emoji: '!', color: '#fff', darkColor: '#888', lightColor: '#fff',
      customEyes: false,
      idleActions: { custom: [{ id: 'mySig', duration: 1.0, weight: 1, apply: () => {} }] },
      drawSprite: () => {}, drawGib: () => {},
      splatShape: 'circle', gibs: [],
      bodyEllipse: () => ({ cx: 0, cy: 0, rx: 1, ry: 1 }),
    });
    clearIdleActionCache();
    const pool = getActionPool('TestCustom');
    expect(pool.length).toBe(7);
    expect(pool[pool.length - 1].id).toBe('mySig');
  });

  it('pickIdleAction returns an entry from the pool with its index', () => {
    const result = pickIdleAction('Bunny');
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.action.duration).toBeGreaterThan(0);
  });

  it('getIdleAction returns the action at the given index', () => {
    const pool = getActionPool('Bunny');
    const a = getIdleAction('Bunny', 0);
    expect(a).toBe(pool[0]);
  });

  it('getIdleAction returns null for invalid index', () => {
    expect(getIdleAction('Bunny', -1)).toBeNull();
    expect(getIdleAction('Bunny', 99)).toBeNull();
  });
});

function makeFakeCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop,
    setTransform: noop,
  } as unknown as CanvasRenderingContext2D;
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- idleActions.test.ts`
Expected: all FAIL — the module doesn't exist yet.

- [ ] **Step 3: Create the module**

Create `src/engine/rendering/idleActions.ts`:

```ts
import type { CharacterColors } from '../characters/types';
import { getCharacterPack } from '../characters/registry';

/** Player view passed to action apply functions — narrow shape, only what actions need. */
export interface IdleActionPlayerView {
  facing: 'left' | 'right';
}

/** A single idle action: data + a transform/effect applier. */
export interface IdleAction {
  id: string;
  duration: number;
  /** Apply transform/effect for normalized t ∈ [0, 1]. Called before the cached sprite is drawn. */
  apply: (
    ctx: CanvasRenderingContext2D,
    cx: number, yOff: number, w: number, h: number,
    t: number,
    colors: CharacterColors,
    player: IdleActionPlayerView,
  ) => void;
}

export type SharedActionId = 'headBob' | 'headTilt' | 'headShake' | 'littleHop' | 'stretch' | 'lookAround';

export const SHARED_ACTION_IDS: SharedActionId[] = ['headBob', 'headTilt', 'headShake', 'littleHop', 'stretch', 'lookAround'];

/** Pack-level config attached to CharacterPack.idleActions. */
export interface PackIdleActionsConfig {
  weights?: Partial<Record<SharedActionId, number>>;  // override default 1.0; 0 disables
  custom?: IdleAction[];
}

const SHARED_ACTIONS: Record<SharedActionId, IdleAction> = {
  headBob: {
    id: 'headBob',
    duration: 0.7,
    apply: (ctx, _cx, _yOff, _w, _h, t) => {
      const pulse = Math.sin(t * Math.PI);
      ctx.translate(0, -pulse * 2);
    },
  },
  headTilt: {
    id: 'headTilt',
    duration: 0.7,
    apply: (ctx, cx, yOff, _w, h, t) => {
      const pulse = Math.sin(t * Math.PI);
      ctx.translate(cx, yOff + h * 0.5);
      ctx.rotate(pulse * 0.12);
      ctx.translate(-cx, -(yOff + h * 0.5));
    },
  },
  headShake: {
    id: 'headShake',
    duration: 0.8,
    apply: (ctx, cx, yOff, _w, h, t) => {
      // 2 oscillations across the duration, ramped in/out by sin(t*π) envelope
      const env = Math.sin(t * Math.PI);
      const osc = Math.sin(t * Math.PI * 4);
      ctx.translate(cx, yOff + h * 0.5);
      ctx.rotate(env * osc * 0.08);
      ctx.translate(-cx, -(yOff + h * 0.5));
    },
  },
  littleHop: {
    id: 'littleHop',
    duration: 0.55,
    apply: (ctx, _cx, _yOff, _w, _h, t) => {
      // arc up then back down
      const lift = Math.sin(t * Math.PI) * 14;
      ctx.translate(0, -lift);
    },
  },
  stretch: {
    id: 'stretch',
    duration: 0.95,
    apply: (ctx, cx, yOff, _w, h, t) => {
      const pulse = Math.sin(t * Math.PI);
      const sy = 1 + pulse * 0.10;
      const sx = 1 - pulse * 0.05;
      // Anchor at body bottom so feet stay planted
      const baseY = yOff + h;
      ctx.translate(cx, baseY);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -baseY);
    },
  },
  lookAround: {
    id: 'lookAround',
    duration: 1.0,
    apply: (_ctx, _cx, _yOff, _w, _h, t, _colors, player) => {
      // Flips facing left → right → original (the original facing is restored when the
      // driver clears idleAction via leaving idle / new pick — caller reads player.facing
      // for sprite cache key, so this writes to it directly).
      // 0.0 → 0.33: original
      // 0.33 → 0.66: opposite
      // 0.66 → 1.0: original
      // We can't know "original" here without storing it; instead we pulse based on t,
      // toggling between left/right deterministically. The driver leaves player.facing
      // as whatever the action last set when the action ends.
      if (t < 0.33) {
        // leave as-is at start
      } else if (t < 0.66) {
        player.facing = player.facing === 'right' ? 'left' : 'right';
      } else {
        // toggle back
        player.facing = player.facing === 'right' ? 'left' : 'right';
      }
    },
  },
};

export function getSharedAction(id: SharedActionId): IdleAction | null {
  return SHARED_ACTIONS[id] ?? null;
}

const poolCache = new Map<string, IdleAction[]>();

/** Build (and cache) the action pool for a character. */
export function getActionPool(charName: string): IdleAction[] {
  const cached = poolCache.get(charName);
  if (cached) return cached;

  const pack = getCharacterPack(charName);
  const config = pack?.idleActions;
  const pool: IdleAction[] = [];

  for (const id of SHARED_ACTION_IDS) {
    const w = config?.weights?.[id];
    if (w === 0) continue;            // explicit 0 → exclude
    pool.push(SHARED_ACTIONS[id]);    // default weight 1.0; non-zero weight included
  }
  if (config?.custom) {
    for (const c of config.custom) pool.push(c);
  }

  poolCache.set(charName, pool);
  return pool;
}

/** Build (and cache) the weight array parallel to the action pool. */
const weightCache = new Map<string, number[]>();
function getWeights(charName: string): number[] {
  const cached = weightCache.get(charName);
  if (cached) return cached;

  const pack = getCharacterPack(charName);
  const config = pack?.idleActions;
  const weights: number[] = [];

  for (const id of SHARED_ACTION_IDS) {
    const w = config?.weights?.[id];
    if (w === 0) continue;
    weights.push(w ?? 1.0);
  }
  if (config?.custom) {
    for (const c of config.custom) weights.push(c.weight);
  }

  weightCache.set(charName, weights);
  return weights;
}

/** Pick a weighted-random action from the pool. Returns the action and its pool index. */
export function pickIdleAction(charName: string): { action: IdleAction; index: number } {
  const pool = getActionPool(charName);
  const weights = getWeights(charName);

  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];

  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return { action: pool[i], index: i };
  }
  // Fallback (floating point)
  return { action: pool[pool.length - 1], index: pool.length - 1 };
}

export function getIdleAction(charName: string, index: number): IdleAction | null {
  const pool = getActionPool(charName);
  if (index < 0 || index >= pool.length) return null;
  return pool[index];
}

/** Test-only: clear the per-character pool/weight caches. */
export function clearIdleActionCache(): void {
  poolCache.clear();
  weightCache.clear();
}
```

- [ ] **Step 4: Update CharacterPack type**

In `src/engine/characters/types.ts`:
- Delete the `IdleTransformType` declaration (lines 41-43).
- Replace the `idleTransform: IdleTransformType;` line in `CharacterPack` (line 77) with:

```ts
  /** Optional config: weight overrides for shared idle actions, plus custom signatures. */
  idleActions?: import('../rendering/idleActions').PackIdleActionsConfig;
```

- [ ] **Step 5: Run tests**

Run: `npm test -- idleActions.test.ts`
Expected: all PASS. (Note: full suite will fail until Task 5 removes `idleTransform: 'none'` from registry test factory and the 17 packs.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/rendering/idleActions.ts src/engine/rendering/__tests__/idleActions.test.ts src/engine/characters/types.ts
git commit -m "feat: add shared idle action library + pack config type"
```

---

## Task 5: Remove `idleTransform` from packs and tests

**Files:**
- Modify: all 17 files in `src/engine/characters/packs/*.ts`
- Modify: `src/engine/characters/__tests__/registry.test.ts:38`
- Modify: `src/engine/characters/builtin.test.ts:83-88`

- [ ] **Step 1: Write failing test (negative — confirm field is gone)**

In `src/engine/characters/builtin.test.ts`, replace the `'all characters have an idleTransform'` test (lines 83-88) with:

```ts
  it('no character has the legacy idleTransform field', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)! as Record<string, unknown>;
      expect(pack.idleTransform).toBeUndefined();
    }
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- builtin.test.ts`
Expected: the new "no character has..." test FAILS (every pack still has `idleTransform`).

- [ ] **Step 3: Remove `idleTransform` from all 17 pack files**

For each file in `src/engine/characters/packs/`, find the line containing `idleTransform: '...',` and delete just the `idleTransform: '...',` clause. Specifically:

- `bunny.ts:50` — change `customEyes: false, idleTransform: 'none',` to `customEyes: false,`
- `bear.ts:56` — same pattern, remove `idleTransform: 'none',`
- `cat.ts:118` — remove `idleTransform: 'headTilt',`
- `chick.ts:74` — remove `idleTransform: 'headBob',`
- `cow.ts:80` — remove `idleTransform: 'headBob',`
- `fox.ts:62` — remove `idleTransform: 'none',`
- `frog.ts:50` — remove `idleTransform: 'none',`
- `goat.ts:113` — remove `idleTransform: 'headBob',`
- `hedgehog.ts:92` — remove `idleTransform: 'headBob',`
- `horse.ts:96` — remove `idleTransform: 'headBob',`
- `monkey.ts:70` — remove `idleTransform: 'headBob',`
- `owl.ts:78` — remove `idleTransform: 'headFlip',` AND add `idleActions: { weights: { stretch: 0 } },` on the next line
- `panda.ts:57` — remove `idleTransform: 'headBob',`
- `pig.ts:71` — remove `idleTransform: 'headBob',`
- `rhino.ts:63` — remove `idleTransform: 'headBob',`
- `sheep.ts:56` — remove `idleTransform: 'headBob',`
- `tiger.ts:73` — remove `idleTransform: 'headBob',`
- `wolf.ts:56` — remove `idleTransform: 'headBob',`

- [ ] **Step 4: Update registry test factory**

In `src/engine/characters/__tests__/registry.test.ts:38`, delete the `idleTransform: 'none',` line.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc -b`
Expected: no errors. (`IdleTransformType` is gone, no pack references it.)

- [ ] **Step 6: Run tests**

Run: `npm test -- --run`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/characters/packs/ src/engine/characters/__tests__/registry.test.ts src/engine/characters/builtin.test.ts
git commit -m "feat: remove idleTransform from packs; owl excludes stretch"
```

---

## Task 6: In-match idle state machine driver

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/playerCosmetics.ts:46-52`
- Modify: `src/engine/gameLoop.test.ts:2502-2521`

- [ ] **Step 1: Write failing test — entering idle seeds first delay**

In `src/engine/gameLoop.test.ts`, replace the existing "idleAnimTimer increments when player is idle" test (lines 2502-2521) with three tests:

```ts
it('entering idle seeds idleActionTimer to IDLE_FIRST_DELAY', () => {
  const { loop } = createLoop();
  loop.skipCountdown();
  const state = loop.getState();
  const player = state.players[0];

  player.x = 200;
  player.y = 660 - PLAYER_HEIGHT;
  player.vx = 0;
  player.state = 'idle';
  player.active = true;
  player.hitstopTimer = 0;
  player.idleAction = -1;
  player.idleActionTimer = 0;
  player.idleActionDuration = 0;

  loop.fixedUpdate(FIXED_TIMESTEP);
  loop.cosmeticStep(FIXED_TIMESTEP);

  // After 1 tick (~16.67ms) of being idle: timer was seeded to 0.8s, then ticked down by ~0.0167.
  expect(player.idleAction).toBe(-1);
  expect(player.idleActionTimer).toBeGreaterThan(0.7);
  expect(player.idleActionTimer).toBeLessThan(0.81);
});

it('idle action fires after IDLE_FIRST_DELAY of standing still', () => {
  const { loop } = createLoop();
  loop.skipCountdown();
  const state = loop.getState();
  const player = state.players[0];
  player.x = 200; player.y = 660 - PLAYER_HEIGHT; player.vx = 0;
  player.state = 'idle'; player.active = true; player.hitstopTimer = 0;
  player.idleAction = -1; player.idleActionTimer = 0; player.idleActionDuration = 0;

  // Tick for 1 second (>0.8s first delay)
  for (let i = 0; i < 60; i++) {
    loop.fixedUpdate(FIXED_TIMESTEP);
    loop.cosmeticStep(FIXED_TIMESTEP);
  }

  expect(player.idleAction).toBeGreaterThanOrEqual(0);
  expect(player.idleActionDuration).toBeGreaterThan(0);
});

it('leaving idle clears idleAction state', () => {
  const { loop } = createLoop();
  loop.skipCountdown();
  const state = loop.getState();
  const player = state.players[0];
  player.x = 200; player.y = 660 - PLAYER_HEIGHT; player.vx = 0;
  player.state = 'idle'; player.active = true; player.hitstopTimer = 0;

  // Run long enough to be in an action
  for (let i = 0; i < 90; i++) {
    loop.fixedUpdate(FIXED_TIMESTEP);
    loop.cosmeticStep(FIXED_TIMESTEP);
  }

  // Now switch to running
  player.state = 'run';
  loop.fixedUpdate(FIXED_TIMESTEP);
  loop.cosmeticStep(FIXED_TIMESTEP);

  expect(player.idleAction).toBe(-1);
  expect(player.idleActionTimer).toBe(0);
  expect(player.idleActionDuration).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- gameLoop.test.ts -t "idle"`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement state machine**

In `src/engine/gameLoop/cosmetics/playerCosmetics.ts`:

Add to imports (line 3 area):
```ts
import {
  ANIM_FRAME_DURATION, RUN_FRAMES, IDLE_ANIM_INTERVAL,
  IDLE_FIRST_DELAY, IDLE_REST_MIN, IDLE_REST_MAX,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
  SQUASH_DECAY_SPEED,
} from '../../constants';
import { pickIdleAction } from '../../rendering/idleActions';
```

(`IDLE_ANIM_INTERVAL` is no longer referenced by this file once the new state machine replaces the old block; remove it from the import list if unused. The constant itself stays in `constants.ts` for now since the legacy `idleAnimTimer` field still exists.)

Replace the existing idle animation block (lines 46-52, the one that reads "Idle animation timer"):

```ts
  // Idle action state machine — locally driven, not synced over network.
  if (player.state === 'idle') {
    // First-frame seeding: leaving idle zeros all three; re-entering idle hits this branch
    // exactly once before the decrement.
    if (player.idleActionTimer === 0 && player.idleAction === -1 && player.idleActionDuration === 0) {
      player.idleActionTimer = IDLE_FIRST_DELAY;
    }
    player.idleActionTimer -= dt;
    if (player.idleActionTimer <= 0) {
      if (player.idleAction >= 0) {
        // current action just ended → enter rest
        player.idleAction = -1;
        player.idleActionDuration = 0;
        player.idleActionTimer = IDLE_REST_MIN + Math.random() * (IDLE_REST_MAX - IDLE_REST_MIN);
      } else {
        // rest (or first delay) just ended → pick next action
        const pick = pickIdleAction(player.character.name);
        player.idleAction = pick.index;
        player.idleActionDuration = pick.action.duration;
        player.idleActionTimer = pick.action.duration;
      }
    }
    // Legacy field — derive from new state for backward compat
    player.idleAnimTimer = player.idleAction >= 0 ? player.idleActionTimer : 0;
  } else {
    player.idleAction = -1;
    player.idleActionTimer = 0;
    player.idleActionDuration = 0;
    player.idleAnimTimer = 0;
  }
```

**State machine trace:**
- Just entered idle: all three fields are 0 (set by the `else` branch on the previous non-idle frame).
- First idle tick: seeding branch sets `idleActionTimer = IDLE_FIRST_DELAY` (0.8). Then decrement → ~0.783.
- Subsequent ticks: only the decrement runs (seeding guard fails after first frame).
- Timer hits 0: `idleAction === -1`, so falls into "pick next action" branch — but on the very first action this is the same as "rest just ended." Both flows produce the same outcome.
- Subsequent cycles: action ends → `idleAction` is reset to -1 and a positive rest timer is set; rest ends → pick next action.

- [ ] **Step 4: Run tests**

Run: `npm test -- gameLoop.test.ts -t "idle"`
Expected: the three new tests PASS, plus the existing animFrame and other tests still pass.

- [ ] **Step 5: Run full suite**

Run: `npm test -- --run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/gameLoop/cosmetics/playerCosmetics.ts src/engine/gameLoop.test.ts
git commit -m "feat: in-match idle action state machine"
```

---

## Task 7: Lobby idle state machine

**Files:**
- Modify: `src/engine/lobbyGame.ts:190-195`
- Test: add to `src/engine/lobbyGame.test.ts`

- [ ] **Step 1: Write failing test**

Open `src/engine/lobbyGame.test.ts`, find an existing `describe('LobbyGame')` block, and add inside:

```ts
it('idle action timer is seeded on first idle frame', () => {
  const game = makeLobbyGame();
  const p = game.players[0];
  p.state = 'idle'; p.vx = 0;
  p.idleAction = -1; p.idleActionTimer = 0; p.idleActionDuration = 0;

  game.step(0.016, new Set(), null);

  expect(p.idleActionTimer).toBeGreaterThan(0.7);
});
```

(Adjust `makeLobbyGame` to whatever helper the existing test file uses; if there isn't one, copy the setup pattern from another test in the file.)

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- lobbyGame.test.ts -t "idle action timer"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/engine/lobbyGame.ts`:

Add to imports (top of file):
```ts
import { IDLE_FIRST_DELAY, IDLE_REST_MIN, IDLE_REST_MAX } from './constants';
import { pickIdleAction } from './rendering/idleActions';
```
(Update existing import list — don't duplicate.)

Replace lines 190-195 (the existing `if (p.state === 'idle')` block):

```ts
      // Idle action state machine — mirrors playerCosmetics.ts.
      if (p.state === 'idle') {
        if (p.idleActionTimer === 0 && p.idleAction === -1 && p.idleActionDuration === 0) {
          p.idleActionTimer = IDLE_FIRST_DELAY;
        }
        p.idleActionTimer -= dt;
        if (p.idleActionTimer <= 0) {
          if (p.idleAction >= 0) {
            p.idleAction = -1;
            p.idleActionDuration = 0;
            p.idleActionTimer = IDLE_REST_MIN + Math.random() * (IDLE_REST_MAX - IDLE_REST_MIN);
          } else {
            const pick = pickIdleAction(p.character.name);
            p.idleAction = pick.index;
            p.idleActionDuration = pick.action.duration;
            p.idleActionTimer = pick.action.duration;
          }
        }
        p.idleAnimTimer = p.idleAction >= 0 ? p.idleActionTimer : 0;
      } else {
        p.idleAction = -1;
        p.idleActionTimer = 0;
        p.idleActionDuration = 0;
        p.idleAnimTimer = 0;
      }
```

- [ ] **Step 4: Run tests**

Run: `npm test -- lobbyGame.test.ts`
Expected: new test PASS, existing lobby tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/lobbyGame.ts src/engine/lobbyGame.test.ts
git commit -m "feat: lobby idle action state machine"
```

---

## Task 8: Migrate legacy `idleT` divisor in 4 packs

**Files:**
- Modify: `src/engine/characters/packs/bunny.ts:8`
- Modify: `src/engine/characters/packs/bear.ts:27`
- Modify: `src/engine/characters/packs/fox.ts:22`
- Modify: `src/engine/characters/packs/frog.ts:16`

- [ ] **Step 1: Update bunny**

In `src/engine/characters/packs/bunny.ts:8`, change:
```ts
const earTwitch = isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI) * 0.25 : 0;
```
to:
```ts
const earTwitch = isIdleAnim ? Math.sin(idleT * Math.PI) * 0.25 : 0;
```

- [ ] **Step 2: Update bear**

In `src/engine/characters/packs/bear.ts:27`, change:
```ts
    const scratchY = Math.sin((idleT / 0.5) * Math.PI * 3) * 3;
```
to:
```ts
    const scratchY = Math.sin(idleT * Math.PI * 3) * 3;
```

- [ ] **Step 3: Update fox**

In `src/engine/characters/packs/fox.ts:22`, change:
```ts
  const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : (isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI * 2) * 4 : 0);
```
to:
```ts
  const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : (isIdleAnim ? Math.sin(idleT * Math.PI * 2) * 4 : 0);
```

- [ ] **Step 4: Update frog**

In `src/engine/characters/packs/frog.ts:16`, change:
```ts
  const frogBlink = isIdleAnim && (idleT / 0.5) > 0.3 && (idleT / 0.5) < 0.7;
```
to:
```ts
  const frogBlink = isIdleAnim && idleT > 0.3 && idleT < 0.7;
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run`
Expected: all PASS. (No behavior change yet — `idleT` passed by renderer is still the old form until Task 9.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/characters/packs/bunny.ts src/engine/characters/packs/bear.ts src/engine/characters/packs/fox.ts src/engine/characters/packs/frog.ts
git commit -m "refactor: drop /0.5 normalization from idleT consumers"
```

---

## Task 9: Renderer dispatch + sprite cache key update

**Files:**
- Modify: `src/engine/rendering/players.ts:116, 171-181, 246-295`

- [ ] **Step 1: Update `drawCharacterSprite` and `_drawCharacterSpriteImpl` signatures**

Both functions need three new params (`idleAction`, `idleActionTimer`, `idleActionDuration`) replacing the single `idleAnimTimer?` and need a `player: Player` reference (so the `lookAround` action can write to `player.facing`).

In `src/engine/rendering/players.ts`:

Add to imports (top of file):
```ts
import { getIdleAction } from './idleActions';
```

Replace the `drawCharacterSprite` signature (around line 171-178):

```ts
function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  char: { name: string; color: string; darkColor: string; lightColor: string },
  state: string, animFrame: number, fastFalling: boolean,
  idleAction: number, idleActionTimer: number, idleActionDuration: number,
  squashScale: number,
  theme: ThemeConfig | undefined,
  player: Player,
): void {
```

Replace the `_drawCharacterSpriteImpl` signature (around line 246-252) similarly:

```ts
function _drawCharacterSpriteImpl(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  char: { name: string; color: string; darkColor: string; lightColor: string },
  state: string, animFrame: number, fastFalling: boolean,
  idleAction: number, idleActionTimer: number, idleActionDuration: number,
  squashScale: number,
  theme: ThemeConfig | undefined,
  player: Player,
): void {
```

- [ ] **Step 2: Update internal call from `drawCharacterSprite` to `_drawCharacterSpriteImpl`**

Around line 206, replace:

```ts
  _drawCharacterSpriteImpl(sctx, x, y, w, h, char, state, animFrame, fastFalling, idleAnimTimer, squashScale, theme);
```

with:

```ts
  _drawCharacterSpriteImpl(sctx, x, y, w, h, char, state, animFrame, fastFalling, idleAction, idleActionTimer, idleActionDuration, squashScale, theme, player);
```

- [ ] **Step 3: Replace the idle dispatch block in `_drawCharacterSpriteImpl`**

Replace lines 271-292 (the existing `idleTransform` switch) with:

```ts
  // Idle action: dispatch to the action's apply fn (ctx transform applied before sprite draw).
  const isIdleAnimFlag = idleAction >= 0;
  const idleT = idleActionDuration > 0 ? 1 - (idleActionTimer / idleActionDuration) : 0;
  if (isIdleAnimFlag && state !== 'run' && state !== 'airborne') {
    const action = getIdleAction(char.name, idleAction);
    if (action) {
      const colors = { color: char.color, darkColor: char.darkColor, lightColor: char.lightColor };
      action.apply(ctx, cx, yOff, w, h, idleT, colors, player);
    }
  }
```

Then update the existing `drawCharacterCore(...)` call at line ~295 to pass the new boolean:

```ts
  drawCharacterCore(ctx, cx, yOff, w, h, char.name, state, animFrame, squashScale, colors, isIdleAnimFlag, idleT);
```

- [ ] **Step 4: Update sprite cache key**

In `drawCharacterSprite` (around line 179-183), replace the `idleKey` computation and cache key:

```ts
  // OLD: const idleKey = (state === 'idle' && idleAnimTimer !== undefined && idleAnimTimer > 0 && idleAnimTimer < 0.5) ? Math.floor(idleAnimTimer * 10) : -1;
  // NEW: 1-bit isIdleAnim — covers the four packs (bunny/bear/fox/frog) whose drawSprite reads it.
  const idleKey = idleAction >= 0 ? 1 : 0;
  const sqKey = Math.round(squashScale * 10);
  const cacheKey = `${char.name}_${state}_${animFrame}_${fastFalling ? 1 : 0}_${idleKey}_${sqKey}`;
```

- [ ] **Step 5: Update the call site at `players.ts:116`**

The `drawPlayer` function calls `drawCharacterSprite`. Replace the existing line:

```ts
    drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling, player.idleAnimTimer, player.squashScale, theme);
```

with:

```ts
    drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling, player.idleAction, player.idleActionTimer, player.idleActionDuration, player.squashScale, theme, player);
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc -b`
Expected: no errors. If `drawCharacterSprite` is called from anywhere else (e.g., test mocks), update those signatures too.

- [ ] **Step 7: Run full test suite**

Run: `npm test -- --run`
Expected: all PASS.

- [ ] **Step 8: Build**

Run: `npx tsc -b && npx vite build`
Expected: clean build.

- [ ] **Step 9: Manual visual verification**

Start the dev server and load a match with the test shortcut:

```bash
npm run dev
# In a browser, open: http://localhost:5173/carrot-royale/?arena=meadow&bots=2&difficulty=easy
```

Stand still as P1 and observe:
- Legs do NOT cycle through frames.
- After ~0.8s, the character does an idle action (head bob, tilt, shake, hop, stretch, or look around).
- After the action ends, there's a short rest, then another action.
- Different characters pick different actions (run a few matches with different P1 picks).
- Owl never plays `stretch`.

Also check the lobby (refresh `http://localhost:5173/carrot-royale/`):
- NPC characters in the lobby idle with the same variety.
- Bunny ear-twitch, bear scratch, fox tail-wag, frog blink still fire (check during any active action).

- [ ] **Step 10: Commit**

```bash
git add src/engine/rendering/players.ts
git commit -m "feat: dispatch idle actions in renderer; shrink sprite cache key"
```

---

## Task 10: Update CLAUDE.md notes

**Files:**
- Modify: `src/engine/CLAUDE.md` (Game Loop section, around line 94)

- [ ] **Step 1: Update the lobby caveat**

Find the line in `src/engine/CLAUDE.md` (around line 94):
```
- Lobby runs no `cosmeticStep` — any renderer-consumed cosmetic timer (`idleAnimTimer`, `animFrame`, `squashScale`) must be ticked manually inside `LobbyGame.step()`.
```

Update to:
```
- Lobby runs no `cosmeticStep` — any renderer-consumed cosmetic timer (`idleAction*`, `animFrame`, `squashScale`) must be ticked manually inside `LobbyGame.step()`. Mirror the logic from `gameLoop/cosmetics/playerCosmetics.ts`.
```

- [ ] **Step 2: Add an entry to the Renderer & Sprites section**

Near the top of the Renderer section, add:
```
- Idle actions: shared library in `rendering/idleActions.ts` (6 actions) + per-pack `CharacterPack.idleActions` config (weight overrides + custom signatures). Driver in `playerCosmetics.ts` (in-match) and `lobbyGame.ts` (lobby). State (`idleAction`, `idleActionTimer`, `idleActionDuration`) is local-only — not in `net/snapshot.ts`. Each peer rolls actions independently; divergence is acceptable.
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/CLAUDE.md
git commit -m "docs: note idle action system in engine caveats"
```

---

## Self-review checklist (post-write)

After completing all tasks, run:

- [ ] `npx tsc -b` — clean
- [ ] `npm test -- --run` — all green
- [ ] `npm run build` — clean
- [ ] Manual lobby + match check (Task 9 step 9)

Spec coverage check:
- [ ] **Spec §1 bug fix** → Task 1
- [ ] **Spec §2 player fields** → Task 3
- [ ] **Spec §3 shared action library** → Task 4
- [ ] **Spec §4 per-pack config** → Task 4 (type) + Task 5 (owl override + idleTransform removal)
- [ ] **Spec §5 driver state machine** → Task 6 (in-match) + Task 7 (lobby)
- [ ] **Spec §6 renderer integration + cache key + idleT semantics** → Task 8 (legacy packs) + Task 9 (renderer)
