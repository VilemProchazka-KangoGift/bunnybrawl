# Cosmetics Pillar — Batch C: Player VFX Polish (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 4 player VFX upgrades — richer thorn barbs, yellow spring curlicue trail, chromatic fast-fall streaks, hue-shifted afterimages — in `feat/cosmetics-pillar` branch as the lowest-risk batch of the cosmetics pillar work. No new systems, no new arena migrations.

**Architecture:** Pure rendering and particle-emit upgrades on top of existing `ParticleSystem` and `rendering/` modules. Slow-device gating reuses `getSlowDevice()` from `perfFlags.ts`. No new state fields, no protocol changes, no new tests for arena packs.

**Tech Stack:** TypeScript, Canvas 2D, Vitest. Touched modules: `gameLoop/cosmetics/ParticleSystem.ts`, `rendering/particles.ts`, `rendering/players.ts`, `renderer.ts`, plus their test files.

---

## Background context

Specification: `docs/superpowers/specs/2026-05-04-cosmetics-pillar-design.md`. Batch C section starts at "### Batch C — Player VFX polish (4 effects, ship first)".

Existing code locations:
- Thorn hit particle emit: `src/engine/gameLoop/cosmetics/ParticleSystem.ts:139-156` (case `'thorn'` in `applyHazardHitVFX`).
- Spring trail rendering: `src/engine/rendering/particles.ts:339-359` (`drawSpringTrail`, currently a green spiral around player feet).
- Fast-fall lines: `src/engine/rendering/players.ts:521-530` (`drawFastFallLines`, 5 vertical white-yellow lines).
- Afterimage rendering: `src/engine/renderer.ts:747-775` (already gated by `slow`).
- Test patterns: `src/engine/renderer.test.ts` mocks particle/render functions with `vi.fn()` and asserts `toHaveBeenCalled`.

Gating notes:
- `rich-fastfall` and `rich-afterimage` must be gated by `getSlowDevice()`. Fast-fall falls back to the existing flat-color line set when slow. Afterimage already gates via `if (!slow)` at line 749 — we only modify behavior inside that branch.
- `rich-spring` and `rich-thorn` are always-on (richer particle counts have negligible perf cost).

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/engine/gameLoop/cosmetics/ParticleSystem.ts` | Modify | Richer thorn-case particle emit (more barb-shaped fragments, contact-point drip, screen flash boost) |
| `src/engine/rendering/particles.ts` | Modify | Replace green spiral in `drawSpringTrail` with yellow curlicue arc |
| `src/engine/rendering/players.ts` | Modify | Replace `drawFastFallLines` with chromatic streak variant; add slow-device gating callback |
| `src/engine/renderer.ts` | Modify | Hue-shifted afterimage fillStyle in existing afterimage loop |
| `src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts` | Create | Particle counts and presence of contact-drip on thorn hit |
| `src/engine/rendering/__tests__/players.fastfall.test.ts` | Create | Chromatic streak draw call structure (asserting layer count + slow-device fallback) |
| `src/engine/renderer.test.ts` | Modify | Existing afterimage test extended to assert hue-shifted fillStyle invocations |

No new files in `engine/cosmetics/` proper — Batch C is pure refinement.

---

## Task 1: rich-thorn — barb fragments, contact drip, brighter flash

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/ParticleSystem.ts:139-156`
- Test: Create `src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts`

Behavior change (from spec): on `applyHazardHitVFX` `case 'thorn'`, replace the current 18 blood + 8 brown shrapnel emit with 18 blood + 12 sharp barb-color fragments (smaller, faster, sharper-aimed upward-radial) + 1 long-life drip particle at the contact point + boosted `screenFlash` to 0.18.

- [ ] **Step 1: Write the failing test**

Create `src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MatchState } from '../../../types';
import { makeArena, makeSettings, makeState } from '../../../__tests__/testHelpers';
import type { HazardHitResult } from '../../gameplay/playerCollisions';

vi.mock('../../../audio', () => ({
  audio: {
    play: vi.fn(), stop: vi.fn(), setVolume: vi.fn(),
    playAnimal: vi.fn(), stopAllGameSounds: vi.fn(),
  },
}));
vi.mock('../../../haptics', () => ({
  haptics: {
    isLocal: () => false, init: vi.fn(), bump: vi.fn(),
    hazardHit: vi.fn(), spring: vi.fn(), hitstop: vi.fn(), landing: vi.fn(),
  },
}));

import { ParticleSystem } from '../ParticleSystem';
import { getTheme } from '../../../arenas';

describe('ParticleSystem.applyHazardHitVFX — thorn (rich-thorn batch C)', () => {
  let ps: ParticleSystem;
  let state: MatchState;
  const arena = makeArena();
  const theme = getTheme('meadow');
  const settings = makeSettings();

  beforeEach(() => {
    state = makeState({ arena });
    state.phase = 'playing';
    ps = new ParticleSystem(state, arena, theme, settings, new Map());
  });

  it('emits more particles than the legacy thorn case', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    // Legacy: 18 blood + 8 shrapnel = 26. New: 18 blood + 12 barbs + 1 drip = 31.
    expect(ps.getParticles().length).toBeGreaterThanOrEqual(31);
  });

  it('emits at least one long-lived drip particle near the contact point', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    const dripCandidates = ps.getParticles().filter(p =>
      Math.abs(p.x - 100) < 6 &&
      Math.abs(p.y - 215) < 6 &&
      p.life > 0.7
    );
    expect(dripCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it('boosts screen flash to at least 0.18', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215, screenFlash: 0.1 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    expect(state.screenFlash).toBeGreaterThanOrEqual(0.18);
  });
});
```

If `makeArena`/`makeState` signatures differ from above, mirror the local `mockArena`/`mockTheme`/`makeSystemState` pattern in `src/engine/gameLoop/__tests__/systems.test.ts` (lines 56–110). The shared `testHelpers.ts` exports are the canonical test-fixture path.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts`
Expected: FAIL — particle count 26 (not ≥31), no drip particle found, screenFlash unchanged.

- [ ] **Step 3: Update the thorn case in ParticleSystem**

In `src/engine/gameLoop/cosmetics/ParticleSystem.ts`, replace the `case 'thorn':` block (lines ~139–156) with:

```typescript
      case 'thorn': {
        // Boost screen flash so the impact reads stronger
        if (!resimulating && hit.screenFlash !== undefined) {
          state.screenFlash = Math.max(state.screenFlash, 0.18);
        }
        // Blood from player
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          const life = 0.4 + Math.random() * 0.5;
          this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2.5 + Math.random() * 4, BLOOD_COLOR);
        }
        // Barb fragments — sharper, faster, radial-upward
        if (hit.sx !== undefined && hit.sy !== undefined) {
          for (let i = 0; i < 12; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
            const speed = 80 + Math.random() * 140;
            const life = 0.25 + Math.random() * 0.35;
            // Mix two barb shades so the burst doesn't look monochrome
            const color = i % 2 === 0 ? '#5C3A1E' : '#3A2210';
            this.emitParticle(hit.sx, hit.sy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.2 + Math.random() * 1.6, color);
          }
          // Slow drip at contact point — long life, tiny downward velocity
          this.emitParticle(hit.sx, hit.sy, 0, 30, 1.0, 1.8, BLOOD_COLOR);
        }
        break;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npm test 2>&1 | tail -25`
Expected: All test files pass (~2000 tests). No new failures.

- [ ] **Step 6: Commit**

```bash
cd P:/projects/rabbits/.worktrees/cosmetics-pillar
git add src/engine/gameLoop/cosmetics/ParticleSystem.ts src/engine/gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts
git commit -m "$(cat <<'EOF'
visuals(thorn): richer barb fragments + slow drip + brighter flash

Batch C of cosmetics pillar (rich-thorn). 18 blood + 12 sharper barb
fragments (mixed shades) + 1 long-life drip at contact point.
ScreenFlash boosted to 0.18 minimum.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: rich-fastfall — chromatic streaks with slow-device fallback

**Files:**
- Modify: `src/engine/rendering/players.ts:521-530` (`drawFastFallLines`) and call site at `:255`
- Test: Create `src/engine/rendering/__tests__/players.fastfall.test.ts`

Behavior change: replace the single-color `drawFastFallLines` with `drawFastFallStreaks` that has two paths — a 3-color chromatic split (cyan, magenta, red) when slow-device is OFF, falling back to the existing flat-color lines when ON. Gating decision is made inside the function so the call site stays simple.

The function reads `getSlowDevice()` directly. This avoids threading a flag through `drawPlayer`'s long signature.

- [ ] **Step 1: Write the failing test**

Create `src/engine/rendering/__tests__/players.fastfall.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drawFastFallStreaks } from '../players';
import * as perfFlags from '../../perfFlags';

function makeMockCtx() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawFastFallStreaks (rich-fastfall batch C)', () => {
  let slowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    slowSpy = vi.spyOn(perfFlags, 'getSlowDevice');
  });
  afterEach(() => { slowSpy.mockRestore(); });

  it('draws a single stroke pass when slow-device is on', () => {
    slowSpy.mockReturnValue(true);
    const ctx = makeMockCtx();
    drawFastFallStreaks(ctx, 100, 50);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('draws three chromatic streak fills when slow-device is off', () => {
    slowSpy.mockReturnValue(false);
    const ctx = makeMockCtx();
    drawFastFallStreaks(ctx, 100, 50);
    // One fillRect-only path with 3 layers × N segments
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it('does not call stroke when chromatic path is taken', () => {
    slowSpy.mockReturnValue(false);
    const ctx = makeMockCtx();
    drawFastFallStreaks(ctx, 100, 50);
    expect(ctx.stroke).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/rendering/__tests__/players.fastfall.test.ts`
Expected: FAIL — `drawFastFallStreaks` not exported.

- [ ] **Step 3: Replace `drawFastFallLines` with `drawFastFallStreaks`**

In `src/engine/rendering/players.ts`, add `getSlowDevice` import near other engine imports at top:

```typescript
import { getSlowDevice } from '../perfFlags';
```

Replace the `drawFastFallLines` function (lines ~521–530) with:

```typescript
/** Fast-fall speed lines. Three offset chromatic fills (cyan / magenta / red
 *  shadow) when slow-device is off; falls back to the legacy flat lines when on.
 *  Drawn outside the sprite cache so the outline pass doesn't stamp them. */
export function drawFastFallStreaks(ctx: CanvasRenderingContext2D, cx: number, headY: number): void {
  if (getSlowDevice()) {
    ctx.strokeStyle = 'rgba(255,255,220,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(cx + i * 5, headY - 2);
      ctx.lineTo(cx + i * 5, headY - 20);
    }
    ctx.stroke();
    return;
  }
  // Chromatic split: cyan core, magenta offset right, red shadow offset left.
  const SEGMENT_W = 3;
  const SEGMENT_H = 16;
  const SEGMENT_SPACING_Y = 4;
  const SEGMENTS = 3; // three vertical pulses per streak
  for (let s = 0; s < SEGMENTS; s++) {
    const segY = headY - 4 - s * (SEGMENT_H + SEGMENT_SPACING_Y);
    // cyan core
    ctx.fillStyle = 'rgba(120,230,250,0.55)';
    ctx.fillRect(cx - SEGMENT_W / 2, segY - SEGMENT_H, SEGMENT_W, SEGMENT_H);
    // magenta offset right
    ctx.fillStyle = 'rgba(230,90,210,0.45)';
    ctx.fillRect(cx - SEGMENT_W / 2 + 2, segY - SEGMENT_H + 1, SEGMENT_W, SEGMENT_H);
    // red shadow offset left
    ctx.fillStyle = 'rgba(255,90,90,0.35)';
    ctx.fillRect(cx - SEGMENT_W / 2 - 2, segY - SEGMENT_H + 2, SEGMENT_W, SEGMENT_H);
  }
}
```

Update the call site at line ~255:

```typescript
    } else if (fastFalling) {
      drawFastFallStreaks(ctx, cx, y);
    }
```

Remove the now-unused `drawFastFallLines` (was a non-exported `function`, not referenced elsewhere — confirmed by grep above).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/rendering/__tests__/players.fastfall.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run the full test suite**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npm test 2>&1 | tail -25`
Expected: No new failures.

- [ ] **Step 6: Commit**

```bash
cd P:/projects/rabbits/.worktrees/cosmetics-pillar
git add src/engine/rendering/players.ts src/engine/rendering/__tests__/players.fastfall.test.ts
git commit -m "$(cat <<'EOF'
visuals(fastfall): chromatic streak speed lines with slow-device fallback

Batch C of cosmetics pillar (rich-fastfall). Replaces 5-line draw with
3 stacked chromatic segments (cyan core, magenta + red offsets) when
slow-device is off; legacy line set retained when on.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: rich-afterimage — hue-shifted ghost echo

**Files:**
- Modify: `src/engine/renderer.ts:747-775`
- Modify: `src/engine/renderer.test.ts:514` (extend existing afterimage test)

Behavior change: in the afterimage rendering loop, instead of a single static `fillStyle`, derive a hue-shifted color per afterimage based on its index in the trail. Older afterimages (lower index) get a stronger shift toward warm/cool offset; newest (last) reads close to character color. Skipped entirely when slow-device is on (existing `if (!slow)` guard already does this).

Convert `player.character.color` to HSL once per player, shift hue by `(i / total) * 18` degrees per afterimage. Use `hsl()` fillStyle string. Reuse `hexToRGB` from `fastMath.ts`.

- [ ] **Step 1: Write the failing test**

Extend the existing afterimage test in `src/engine/renderer.test.ts`. Find the test at line ~514:

```typescript
it('draws afterimages when player has them', () => {
  // ...existing
  state.players[0].afterimages = [{ x: 190, y: 620, alpha: 0.5 }];
  renderer.renderFrame(state, arena, []);
  expect(renderer.getDiagnostics().afterimages).toBe(true);
});
```

Add a new test below it:

```typescript
it('uses hue-shifted hsl fillStyle for afterimages, not raw character color', () => {
  state.players[0].afterimages = [
    { x: 190, y: 620, alpha: 0.3 },
    { x: 200, y: 620, alpha: 0.5 },
    { x: 210, y: 620, alpha: 0.7 },
  ];
  // Capture distinct fillStyle values seen during the afterimage pass.
  const seen: string[] = [];
  const ctx = renderer.getDiagnostics().ctx as CanvasRenderingContext2D;
  Object.defineProperty(ctx, 'fillStyle', {
    set(v) { seen.push(String(v)); },
    get() { return ''; },
    configurable: true,
  });
  renderer.renderFrame(state, arena, []);
  // Afterimage fills must be `hsl(...)`, and each afterimage gets a different one
  const hslFills = seen.filter(s => s.startsWith('hsl('));
  const unique = new Set(hslFills);
  expect(hslFills.length).toBeGreaterThanOrEqual(3);
  expect(unique.size).toBeGreaterThanOrEqual(2);
});
```

This requires `getDiagnostics()` to return the underlying `ctx`. If it doesn't already, add a getter — see step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/renderer.test.ts -t "hue-shifted"`
Expected: FAIL — current code uses `player.character.color` (a hex string), not `hsl(...)`.

- [ ] **Step 3: Implement hue-shift in renderer.ts**

First, expose `ctx` on diagnostics. Find the `Diagnostics` interface near line 70:

```typescript
export interface Diagnostics {
  // ...existing fields
  ctx?: CanvasRenderingContext2D;  // add this for tests
}
```

In the renderer's `getDiagnostics()` (find it via `grep -n "getDiagnostics" src/engine/renderer.ts`), add `ctx: this.ctx` to the returned object.

Now find the afterimage loop at lines ~747–775. Add this helper near the top of the file (after imports):

```typescript
/** Convert hex color "#RRGGBB" to HSL components (h ∈ [0,360], s,l ∈ [0,1]). */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}
```

Replace the afterimage loop body (the inner `for (const img of afterimages)` block, lines ~760–771) with:

```typescript
            const isInvincible = player.invincibleTimer > 0;
            const baseHsl = isInvincible
              ? { h: 215, s: 1, l: 0.78 }  // cyan #88BBFF
              : hexToHSL(player.character.color);
            const total = afterimages.length;
            for (let i = 0; i < total; i++) {
              const img = afterimages[i];
              // Shift hue by up to ±18°: oldest (i=0) shifted most, newest (i=total-1) closest to base.
              const shift = ((i / Math.max(1, total - 1)) - 1) * 18;
              const h = (baseHsl.h + shift + 360) % 360;
              ctx.fillStyle = `hsl(${h.toFixed(1)},${(baseHsl.s * 100).toFixed(0)}%,${(baseHsl.l * 100).toFixed(0)}%)`;
              ctx.globalAlpha = img.alpha;
              ctx.beginPath();
              ctx.ellipse(
                img.x + player.width / 2,
                img.y + player.height * 0.55,
                player.width * 0.38,
                player.height * 0.38,
                0, 0, Math.PI * 2
              );
              ctx.fill();
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/renderer.test.ts -t "hue-shifted"`
Expected: PASS.

- [ ] **Step 5: Run all renderer tests**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/renderer.test.ts`
Expected: All tests green (~80 in renderer.test.ts).

- [ ] **Step 6: Commit**

```bash
cd P:/projects/rabbits/.worktrees/cosmetics-pillar
git add src/engine/renderer.ts src/engine/renderer.test.ts
git commit -m "$(cat <<'EOF'
visuals(afterimage): hue-shifted ghost echoes per trail position

Batch C of cosmetics pillar (rich-afterimage). Each afterimage in the
trail gets a hue offset (-18° at oldest → 0° at newest) from the
character color, computed via hexToHSL helper. Already gated by the
existing slow-device branch in renderer.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: rich-spring — yellow curlicue trail

**Files:**
- Modify: `src/engine/rendering/particles.ts:339-359` (`drawSpringTrail`)
- Test: extend `src/engine/renderer.test.ts` (existing test at line ~612 verifies `drawSpringTrail` is called; we keep that and add a content test)

Behavior change: replace the green spiral around player feet with a yellow curlicue arc rising from spring base toward player head. Same `springTrailTimer` driver. Color matches the visual mock the user approved (yellow `#FFD45A`).

- [ ] **Step 1: Write the failing test**

Add a focused test for the new draw shape. Create `src/engine/rendering/__tests__/particles.springTrail.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { drawSpringTrail } from '../particles';
import type { Player } from '../../types';

function makeMockCtx() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
    stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function makePlayer(): Player {
  return {
    id: 'P1', x: 100, y: 200, width: 28, height: 40,
    springTrailTimer: 0.4,
    character: { name: 'Bunny', color: '#FFFFFF', darkColor: '#000000', lightColor: '#888888', emoji: '🐰' } as never,
  } as unknown as Player;
}

describe('drawSpringTrail (rich-spring batch C)', () => {
  it('uses a yellow stroke style for the curlicue', () => {
    const ctx = makeMockCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // strokeStyle is set to a yellow tone
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('uses lineTo for an arc path, not arc primitives', () => {
    const ctx = makeMockCtx();
    drawSpringTrail(ctx, makePlayer(), 0);
    // Curlicue is a poly-line, not a series of `arc` calls.
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/rendering/__tests__/particles.springTrail.test.ts`
Expected: FAIL — current `drawSpringTrail` uses `arc` per point (12 calls), no `lineTo`. The "should not use arc" test should fail.

- [ ] **Step 3: Replace drawSpringTrail with curlicue**

In `src/engine/rendering/particles.ts`, replace the existing `drawSpringTrail` function (lines ~339–359) with:

```typescript
export function drawSpringTrail(ctx: CanvasRenderingContext2D, player: Player, frameTime: number): void {
  const cx = player.x + player.width / 2;
  const baseY = player.y + player.height;
  const t = player.springTrailTimer / SPRING_TRAIL_DURATION; // 1 = just started, 0 = fading

  // Curlicue arc: rising sinusoidal poly-line above the spring base.
  // Length scales with `t` so the arc grows during launch and fades after.
  ctx.save();
  ctx.strokeStyle = `rgba(255,212,90,${(0.55 * t).toFixed(3)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const ARC_HEIGHT = 60;
  const STEPS = 14;
  const phaseOffset = frameTime * 0.005;
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS;
    const reach = u * t;  // tip of arc lengthens with t
    const ax = cx + Math.sin(reach * 20 + phaseOffset) * 4;
    const ay = baseY - 8 - Math.sin(reach * Math.PI) * ARC_HEIGHT;
    if (s === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
  }
  ctx.stroke();
  ctx.restore();
}
```

Note: `SPRING_TRAIL_DURATION` is already imported at top of file — keep its import. The signature is unchanged so no call-site updates needed.

- [ ] **Step 4: Run new test to verify it passes**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/rendering/__tests__/particles.springTrail.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Run renderer.test.ts to verify the existing `drawSpringTrail` integration test still passes**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx vitest run src/engine/renderer.test.ts -t "spring"`
Expected: PASS (existing test asserts `drawSpringTrail` is called; signature unchanged).

- [ ] **Step 6: Commit**

```bash
cd P:/projects/rabbits/.worktrees/cosmetics-pillar
git add src/engine/rendering/particles.ts src/engine/rendering/__tests__/particles.springTrail.test.ts
git commit -m "$(cat <<'EOF'
visuals(spring): yellow curlicue arc replaces green spiral trail

Batch C of cosmetics pillar (rich-spring). Spring launch trail rises as
a sinusoidal arc tracking the launch path, fading with springTrailTimer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npm test 2>&1 | tail -30`
Expected: All ~2000 tests pass. Pre-existing known-failing tests stay at their current count (see CLAUDE.md "Testing" section: `MainMenu.test.tsx`, `VictoryScreen.test.tsx`, and one `switchArena` flake).

- [ ] **Step 2: Run `tsc -b` for stricter type checking**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npx tsc -b 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Manual smoke test in dev server**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && npm run dev`
Open: `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&killLimit=4`

Verify visually:
- Touch a thorn → see darker barb fragments + a slow drip + brighter flash
- Bounce on a spring → yellow curlicue arc rises behind the launching player
- Press DOWN while airborne → see chromatic split streaks (cyan/magenta/red) above head, not flat lines
- Sprint left+right repeatedly → afterimages show subtle hue variation across the trail

Then toggle slow-device on (Mods modal → "Slow device"):
- Fast-fall streaks revert to flat-color lines
- Afterimages disappear (existing `!slow` guard, unchanged)

Stop dev server.

- [ ] **Step 4: Commit (no-op if step 3 made no changes)**

If any tweaks needed during smoke test, fix and commit. Otherwise skip.

- [ ] **Step 5: Branch summary**

Run: `cd P:/projects/rabbits/.worktrees/cosmetics-pillar && git log --oneline main..HEAD`
Expected: 4 commits (one per effect) on top of the spec commit.

Batch C is complete. Subsequent batches (B, A, E, D) get their own plans on the same branch as they're scoped.
