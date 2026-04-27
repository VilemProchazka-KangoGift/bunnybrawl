# Jump Takeoff Dust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawn a small dust puff at a player's feet when they intentionally jump (input-jump only — not springs, not geysers).

**Architecture:** Pure cosmetic addition. Trigger lives in `playerTransitions.ts:detectPlayerTransitions`, gated on rising-edge of `springTrailTimer` (excludes spring launches) and absence of vy spike (excludes geyser launches). Pure spawn function in `particles.ts`. Wired through `ParticleSystem` and `TransitionCallbacks`. **No `Player` field changes, no snapshot wire-format changes, no protocol bump** — works on host and guest via the existing cosmeticStep architecture, since `springTrailTimer` is already snapshotted.

**Tech Stack:** TypeScript, Vitest. Half-rate `cosmeticStep` (~30Hz) on both host and guest.

---

## Spec reference

`docs/superpowers/specs/2026-04-27-jump-takeoff-dust-design.md` is the source of truth. Visual values, trigger rule, and out-of-scope items are pinned there.

The spec listed two implementation paths (transient `Player.jumpedThisTick` flag vs. snapshot-derived). **This plan picks snapshot-derived** — no Player field, no snapshot change. The signal:

- Spring launch this tick: `prev.springTrailTimer === 0 && player.springTrailTimer > 0`
- Geyser launch this tick: `prev.vy - player.vy > 300` (mirrors the existing `geyser` SFX detection 5 lines below the jump branch)

If neither fires on the grounded→airborne edge, it's an input jump.

---

## File Structure

All changes are extensions to existing files — no new files.

| File | Change |
|---|---|
| `src/engine/gameLoop/cosmetics/particles.ts` | Add pure `spawnJumpDustParticles(particles, freeList, player)` (~12 lines) |
| `src/engine/gameLoop/cosmetics/ParticleSystem.ts` | Add wrapper method (~3 lines) + import |
| `src/engine/gameLoop/cosmetics/playerTransitions.ts` | Add `springTrailTimer` to `PrevPlayerCosmeticState`; add `spawnJumpDustParticles` to `TransitionCallbacks`; gate trigger in `detectPlayerTransitions` (~10 lines) |
| `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts` | Wire callback to `ParticleSystem` (~1 line in `this.callbacks = {…}`) |
| `src/engine/cosmeticStep.test.ts` | Add 3 tests (jump fires dust, spring excludes, geyser excludes) |

`testHelpers.ts:makePlayer` already includes `springTrailTimer: 0`, so no test-helper change is needed.

`GameLoop.particleSystem` is a public field (no getter needed for tests — direct access is fine).

---

## Task 1: Track springTrailTimer in PrevPlayerCosmeticState

Plumbing only — extends the cosmetic prev-state record so the trigger logic in Task 5 can read both `prev.springTrailTimer` and `player.springTrailTimer`. No behavior change.

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/playerTransitions.ts`

- [ ] **Step 1.1: Extend the interface and the snapshot helper**

In `src/engine/gameLoop/cosmetics/playerTransitions.ts`, add `springTrailTimer: number` to `PrevPlayerCosmeticState` (around line 8) and copy it in `snapshotPlayerCosmeticState` (around line 20):

```typescript
export interface PrevPlayerCosmeticState {
  state: PlayerState;
  vx: number;
  vy: number;
  score: number;
  fatTimer: number;
  sideSquash: number;
  burnTimer: number;
  slowTimer: number;
  fastFalling: boolean;
  springTrailTimer: number;  // NEW
}

export function snapshotPlayerCosmeticState(player: Player): PrevPlayerCosmeticState {
  return {
    state: player.state, vx: player.vx, vy: player.vy,
    score: player.score, fatTimer: player.fatTimer, sideSquash: player.sideSquash,
    burnTimer: player.burnTimer, slowTimer: player.slowTimer,
    fastFalling: player.fastFalling,
    springTrailTimer: player.springTrailTimer,  // NEW
  };
}
```

- [ ] **Step 1.2: Update prev-state assignment at end of detectPlayerTransitions**

In the same file, at the bottom of `detectPlayerTransitions` (around line 120), append the new field to the prev-state update block:

```typescript
  // Update prev state
  prev.state = player.state;
  prev.vx = player.vx;
  prev.vy = player.vy;
  prev.score = player.score;
  prev.fatTimer = player.fatTimer;
  prev.sideSquash = player.sideSquash;
  prev.burnTimer = player.burnTimer;
  prev.slowTimer = player.slowTimer;
  prev.fastFalling = player.fastFalling;
  prev.springTrailTimer = player.springTrailTimer;  // NEW
```

- [ ] **Step 1.3: Typecheck and run cosmeticStep tests**

Run: `npx tsc -b`
Expected: clean build, no errors.

Run: `npm test -- cosmeticStep --run`
Expected: all existing cosmeticStep tests pass (no behavior change yet).

- [ ] **Step 1.4: Commit**

```bash
git add src/engine/gameLoop/cosmetics/playerTransitions.ts
git commit -m "refactor(cosmetics): track springTrailTimer in PrevPlayerCosmeticState"
```

---

## Task 2: Add the pure spawnJumpDustParticles function

The procedural particle spawner. Mirrors the shape of `spawnDustParticles` (landing dust) but with the spec's narrower, smaller, shorter values.

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/particles.ts`

- [ ] **Step 2.1: Add the function**

Insert after `spawnDustParticles` (which ends around line 41) in `src/engine/gameLoop/cosmetics/particles.ts`:

```typescript
export function spawnJumpDustParticles(
  particles: Particle[], freeList: Particle[],
  player: Player,
): void {
  const cx = player.x + player.width / 2;
  const groundY = player.y + player.height;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const sx = cx + (Math.random() - 0.5) * player.width * 0.4;
    const sy = groundY - Math.random() * 2;
    const vx = (Math.random() - 0.5) * 160;
    const vy = -Math.random() * 70 - 30;
    const life = 0.35 * (0.7 + Math.random() * 0.3);
    const size = 1.5 + Math.random() * 1.5;
    emitParticle(particles, freeList, sx, sy, vx, vy, life, size, '#C8B896');
  }
}
```

- [ ] **Step 2.2: Typecheck**

Run: `npx tsc -b`
Expected: clean. Function is unused for now but compiles.

- [ ] **Step 2.3: Commit**

```bash
git add src/engine/gameLoop/cosmetics/particles.ts
git commit -m "feat(cosmetics): add spawnJumpDustParticles pure function"
```

---

## Task 3: Expose spawnJumpDustParticles on ParticleSystem

Thin wrapper following the existing `spawnDustParticles` pattern.

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/ParticleSystem.ts`

- [ ] **Step 3.1: Update the import on line 9**

Replace the existing import line (around line 9) of `src/engine/gameLoop/cosmetics/ParticleSystem.ts`:

OLD:
```typescript
import { emitParticle as _emitParticle, spawnDustParticles as _spawnDustParticles, spawnGoreParticles as _spawnGoreParticles, spawnConfetti as _spawnConfetti, spawnCarrotVFX as _spawnCarrotVFX, spawnRingVFX as _spawnRingVFX, spawnFirework as _spawnFirework, updateParticles, updateConfetti } from './particles';
```

NEW:
```typescript
import { emitParticle as _emitParticle, spawnDustParticles as _spawnDustParticles, spawnJumpDustParticles as _spawnJumpDustParticles, spawnGoreParticles as _spawnGoreParticles, spawnConfetti as _spawnConfetti, spawnCarrotVFX as _spawnCarrotVFX, spawnRingVFX as _spawnRingVFX, spawnFirework as _spawnFirework, updateParticles, updateConfetti } from './particles';
```

- [ ] **Step 3.2: Add the wrapper method**

Add immediately after the existing `spawnDustParticles` method (around line 53):

```typescript
  spawnJumpDustParticles(player: Player): void {
    _spawnJumpDustParticles(this._particles, this.particleFreeList, player);
  }
```

- [ ] **Step 3.3: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3.4: Commit**

```bash
git add src/engine/gameLoop/cosmetics/ParticleSystem.ts
git commit -m "feat(cosmetics): expose spawnJumpDustParticles on ParticleSystem"
```

---

## Task 4: Add spawnJumpDustParticles to TransitionCallbacks

Wires the callback all the way to `detectPlayerTransitions`.

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/playerTransitions.ts` (interface)
- Modify: `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts` (constructor wiring)

- [ ] **Step 4.1: Extend TransitionCallbacks**

In `src/engine/gameLoop/cosmetics/playerTransitions.ts`, replace the `TransitionCallbacks` interface (around line 30):

```typescript
export interface TransitionCallbacks {
  playSound: (name: string) => void;
  playAnimal: (characterName: string) => void;
  spawnDustParticles: (player: Player, landVy: number) => void;
  spawnJumpDustParticles: (player: Player) => void;  // NEW
  spawnKillSplatter: (victim: Player) => void;
  pickupCarrotVFX: (x: number, y: number) => void;
  spawnPlayerSpawnVFX: (x: number, y: number) => void;
}
```

- [ ] **Step 4.2: Wire in PlayerTransitionSystem constructor**

In `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts`, add the new entry to the `this.callbacks = { ... }` block (around line 36):

```typescript
    this.callbacks = {
      playSound: this.playSound,
      playAnimal: this.playAnimal,
      spawnDustParticles: (p, vy) => this.particleSystem.spawnDustParticles(p, vy),
      spawnJumpDustParticles: (p) => this.particleSystem.spawnJumpDustParticles(p),  // NEW
      spawnKillSplatter: (v) => this.particleSystem.spawnKillSplatter(v, this.settings),
      pickupCarrotVFX: (x, y) => this.particleSystem.pickupCarrotVFX(x, y),
      spawnPlayerSpawnVFX: (x, y) => this.particleSystem.spawnRingVFX(x, y),
    };
```

- [ ] **Step 4.3: Typecheck**

Run: `npx tsc -b`
Expected: clean. (The callback is wired but no caller fires it yet — Task 5.)

- [ ] **Step 4.4: Commit**

```bash
git add src/engine/gameLoop/cosmetics/playerTransitions.ts src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts
git commit -m "feat(cosmetics): wire spawnJumpDustParticles through TransitionCallbacks"
```

---

## Task 5: Trigger detection — TDD

Write failing tests, then add the gating logic next to the existing jump-SFX line.

**Files:**
- Modify: `src/engine/cosmeticStep.test.ts` (add 3 tests)
- Modify: `src/engine/gameLoop/cosmetics/playerTransitions.ts` (add trigger)

- [ ] **Step 5.1: Add ParticleSystem import to the test file**

At the top of `src/engine/cosmeticStep.test.ts`, near the other imports (around line 46–49), add:

```typescript
import type { ParticleSystem } from './gameLoop/cosmetics/ParticleSystem';
```

- [ ] **Step 5.2: Write the three failing tests**

Add these tests inside the existing `describe('cosmeticStep transition detection', ...)` block, immediately after the `'detects jump: grounded → airborne plays jump sound'` test (around line 143):

```typescript
  it('spawns jump dust on input-jump grounded → airborne transition', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Establish initial grounded state (no spring trail active)
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Transition to airborne via input.jump (vy = JUMP_IMPULSE)
    player.state = 'airborne';
    player.vy = -650;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(player);
  });

  it('does NOT spawn jump dust when launched by a spring (springTrailTimer rising edge)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Grounded baseline, no active spring trail
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Spring contact this tick: airborne, vy = SPRING_BOUNCE,
    // springTrailTimer rises 0 → SPRING_TRAIL_DURATION (0.6).
    player.state = 'airborne';
    player.vy = -700;
    player.springTrailTimer = 0.6;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT spawn jump dust when launched by a geyser (vy spike > 300)', () => {
    const { loop } = createLoop();
    const state = loop.getState();
    const player = state.players[0];
    const ps: ParticleSystem = loop.particleSystem;
    const spy = vi.spyOn(ps, 'spawnJumpDustParticles');

    // Grounded baseline, vy ≈ 0
    player.state = 'idle';
    player.vy = 0;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    spy.mockClear();

    // Geyser launch: vy drops by > 300 px/s in one tick.
    // springTrailTimer stays 0 — geysers don't set spring trail.
    player.state = 'airborne';
    player.vy = -550;
    player.springTrailTimer = 0;
    loop.cosmeticStep(FIXED_TIMESTEP);

    expect(spy).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5.3: Run the new tests, verify they fail**

Run: `npm test -- cosmeticStep --run -t "jump dust"`
Expected: 3 FAILS — the trigger doesn't exist yet, so `spawnJumpDustParticles` is never called.

- [ ] **Step 5.4: Add the trigger logic**

In `src/engine/gameLoop/cosmetics/playerTransitions.ts`, replace the existing jump-detection line (around line 57):

OLD:
```typescript
  // Jump: grounded → airborne
  if (wasGrounded && isAirborne) cb.playSound('jump');
```

NEW:
```typescript
  // Jump: grounded → airborne
  if (wasGrounded && isAirborne) {
    cb.playSound('jump');
    // Jump dust fires only on input-jump — exclude spring (springTrailTimer
    // rising edge) and geyser (vy spike > 300 px/s in one tick) launches.
    const sprangThisTick = prev.springTrailTimer === 0 && player.springTrailTimer > 0;
    const geyseredThisTick = prev.vy - player.vy > 300;
    if (!sprangThisTick && !geyseredThisTick) {
      cb.spawnJumpDustParticles(player);
    }
  }
```

- [ ] **Step 5.5: Run the new tests, verify they pass**

Run: `npm test -- cosmeticStep --run -t "jump dust"`
Expected: 3 PASS.

Run: `npm test -- cosmeticStep --run`
Expected: all cosmeticStep tests pass (existing tests still green — `'detects jump'` test still asserts the `audio.play('jump')` call, which still fires).

- [ ] **Step 5.6: Commit**

```bash
git add src/engine/cosmeticStep.test.ts src/engine/gameLoop/cosmetics/playerTransitions.ts
git commit -m "feat(cosmetics): jump takeoff dust on input-jump grounded→airborne"
```

---

## Task 6: Full regression run + manual smoke

**Files:**
- Run-only.

- [ ] **Step 6.1: Run full unit test suite**

Run: `npm test -- --run`
Expected: all ~2000 tests pass.

The branch was created off `main` (clean baseline). If a snapshot test fails, examine the diff first:
- **Acceptable**: A determinism-/audio-trace snapshot picks up no new entries (jump dust is cosmeticStep-only, not in fixedUpdate traces). If the diff IS empty visually, just regenerate with `npm test -- -u`.
- **Unacceptable**: Logic changes in unrelated modules. Stop and investigate.

- [ ] **Step 6.2: Typecheck and production build**

Run: `npx tsc -b`
Expected: clean.

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds with no errors.

- [ ] **Step 6.3: Manual smoke test**

Start dev server (background): `npm run dev`

Open: `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2`

Walk through:
1. Jump as P1 (W/Space) — small tan puff appears at the player's feet, fades within ~0.4s.
2. Walk onto a spring mushroom — it bounces P1 high. Verify NO jump dust puff (only the existing spiral spring trail).
3. Spam jumps — particles do not visibly accumulate; pool stays well under cap.
4. Switch to volcano arena via URL `?arena=volcano&bots=2` — verify dust still appears on jump (theme-agnostic).

Stop dev server.

- [ ] **Step 6.4: Final commit (only if snapshot updates were needed)**

If Step 6.1 required `-u`:

```bash
git add src/engine/__tests__/__snapshots__/
git commit -m "test: regenerate snapshots for jump takeoff dust"
```

If no snapshot files changed, skip this step.

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| Trigger: input.jump only (not springs / geysers) | Task 5 — gating on `sprangThisTick` + `geyseredThisTick` |
| Visual params (5 / ±0.2×w spread / 80 vx / 70 vy / 0.35s / 1.5–3px / `#C8B896`) | Task 2 — `spawnJumpDustParticles` body |
| Architecture (cosmeticStep seam) | Task 5 — same line as existing `playSound('jump')` |
| Network behavior (no protocol change) | Tasks 1 + 5 — uses already-snapshotted `springTrailTimer` |
| Test: trigger fires on input jump | Task 5, test 1 |
| Test: trigger does NOT fire on spring | Task 5, test 2 |
| Test: trigger does NOT fire on geyser | Task 5, test 3 |
| Out of scope: surface-aware variation | Not implemented (deferred to E3) |
| Out of scope: gore-mode toggle | Not implemented (dust is neutral) |
| Open Q1 (flag-path vs derived) | Resolved: snapshot-derived rising edge (no Player field) |
| Open Q2 (testHelpers makePlayer) | N/A: `springTrailTimer: 0` already in `makePlayer` |
| Open Q3 (where to clear flag) | N/A: no flag |

## Self-review notes for the implementer

- The trigger lives next to the existing `cb.playSound('jump')` line, so future jump-related cosmetics stay grouped together.
- Spring exclusion uses **rising-edge** detection (`prev === 0 && curr > 0`), not `curr > 0` alone — a player jumping within 0.6s of a recent spring contact (still has trail decaying) WILL get jump dust. That's correct: it's a real input-jump.
- Geyser exclusion (`prev.vy - player.vy > 300`) is the same heuristic the codebase already uses for `playSound('geyser')` 5 lines below the jump branch. Consistency.
- The half-rate `cosmeticStep` (~30Hz) sees this transition exactly once on the rising edge — fine, jumps don't oscillate within a single 33ms window.
- Tests assert at the cosmetic-callback boundary (`vi.spyOn(ps, 'spawnJumpDustParticles')`). This is the same level the codebase already tests sound triggers (`audio.play` mock), and avoids coupling tests to particle internals.
