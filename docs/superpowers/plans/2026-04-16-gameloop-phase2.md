# GameLoop Phase 2: Extract Remaining Chunks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract ~470 lines from `gameLoop.ts` (1597→~1100 lines) by pulling out the per-player collision handlers, transition detection, cosmetic updates, entity transitions, and stomp processing into focused submodules.

**Architecture:** Pure function extraction (same pattern as Phase 1). Functions receive state + callbacks for side effects (particle emission, sound). Hazard collision functions return result structs with collision position so GameLoop can emit VFX. No System objects — that's Phase 3.

**Tech Stack:** TypeScript, same imports as existing gameLoop submodules.

**Key constraint:** All hazard collision blocks follow the same 3-part pattern: (1) detect via existing `hazardCollision.ts` function, (2) apply state changes to player, (3) emit particles at collision point. Parts 1-2 are pure and extract cleanly. Part 3 (particle emission) uses `this.emitParticle` — the extracted function returns collision position in a result struct, and GameLoop emits particles based on it.

---

## File Structure

```
src/engine/gameLoop/
  cosmetics/
    playerTransitions.ts   (NEW — ~120 lines)  transition detection → sound/VFX dispatch
    playerCosmetics.ts     (NEW — ~100 lines)  animation, fire, afterimages, footsteps, expressions
    entityTransitions.ts   (NEW — ~55 lines)   spring bounce, countdown, match-over detection
  gameplay/
    playerCollisions.ts    (NEW — ~175 lines)  spring/thorn/hazard/ghost/lava/fall-off collision handling
    stomps.ts              (NEW — ~65 lines)   stomp processing, kill feed, stats
  gameLoop.ts              (MODIFY)            replace inline blocks with delegate calls
```

---

### Task 1: Extract `cosmetics/entityTransitions.ts`

Smallest and most self-contained. Good warm-up.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/entityTransitions.ts`
- Modify: `src/engine/gameLoop/cosmetics/index.ts`
- Modify: `src/engine/gameLoop.ts:775-822`

- [ ] **Step 1: Create `entityTransitions.ts`**

This extracts the spring bounce detection, countdown sounds, and match-over sound. The function takes the entity arrays + prev-state tracking object + callbacks, and mutates the prev-state in place (same as it does currently).

```typescript
// src/engine/gameLoop/cosmetics/entityTransitions.ts
import type { MatchState, Player } from '../../types';
import { SPRING_TRAIL_DURATION } from '../../constants';

/** Mutable prev-state for entity transition detection across frames. */
export interface PrevEntityState {
  carrotActives: boolean[];
  springBounces: number[];
  thornHits: boolean[];
  countdownSec: number;
  matchOver: boolean;
}

export function createPrevEntityState(): PrevEntityState {
  return { carrotActives: [], springBounces: [], thornHits: [], countdownSec: 4, matchOver: false };
}

/**
 * Detect entity state transitions and fire sounds.
 * Mutates `pes` in place to track frame-to-frame changes.
 */
export function detectEntityTransitions(
  state: MatchState,
  pes: PrevEntityState,
  playSound: (name: string) => void,
): void {
  // Springs: bounceTimer 0 → >0 (springs survive the bounce, so detection works)
  for (let i = 0; i < state.springs.length; i++) {
    const cur = state.springs[i].bounceTimer;
    const prevBounce = pes.springBounces[i] ?? 0;
    if (prevBounce <= 0 && cur > 0) {
      playSound('spring');
      // Set springTrailTimer on nearest player
      const sx = state.springs[i].x;
      const sy = state.springs[i].y;
      let closest: Player | null = null;
      let minDist = 60;
      for (const p of state.players) {
        if (!p.active || p.state === 'splat') continue;
        const dist = Math.sqrt((p.x + p.width / 2 - sx) ** 2 + (p.y + p.height - sy) ** 2);
        if (dist < minDist) { minDist = dist; closest = p; }
      }
      if (closest) closest.springTrailTimer = SPRING_TRAIL_DURATION;
    }
    pes.springBounces[i] = cur;
  }
  pes.springBounces.length = state.springs.length;

  // Countdown
  if (state.countdown > 0) {
    const curSec = Math.ceil(state.countdown);
    if (curSec < pes.countdownSec) playSound('countdown_beep');
    pes.countdownSec = curSec;
  } else if (pes.countdownSec > 0) {
    playSound('countdown_go');
    pes.countdownSec = 0;
  }

  // Match over
  if (state.matchOver && !pes.matchOver) playSound('victory');
  pes.matchOver = state.matchOver;
}
```

- [ ] **Step 2: Add to barrel export**

In `src/engine/gameLoop/cosmetics/index.ts`, add:
```typescript
export { detectEntityTransitions, createPrevEntityState } from './entityTransitions';
export type { PrevEntityState } from './entityTransitions';
```

- [ ] **Step 3: Wire into `gameLoop.ts`**

Replace lines 775-822 in `cosmeticStep()`. Change the `prevEntityState` field type to use `PrevEntityState`. Import from the barrel. Replace the inline block with:
```typescript
detectEntityTransitions(this.state, this.prevEntityState, this._boundPlaySound);
```

Remove the comments that were between the blocks (carrot note, thorn note, host-only note) — they now live next to the implementation in the new file or are no longer needed.

- [ ] **Step 4: Verify**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean compile, all tests pass.

- [ ] **Step 5: Commit**

```
git add src/engine/gameLoop/cosmetics/entityTransitions.ts src/engine/gameLoop/cosmetics/index.ts src/engine/gameLoop.ts
git commit -m "refactor: extract entity transition detection to cosmetics/entityTransitions.ts"
```

---

### Task 2: Extract `cosmetics/playerTransitions.ts`

The trickiest cosmetics extraction — transition detection calls multiple side-effect methods.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/playerTransitions.ts`
- Modify: `src/engine/gameLoop/cosmetics/index.ts`
- Modify: `src/engine/gameLoop.ts:566-676`

- [ ] **Step 1: Create `playerTransitions.ts`**

The function receives the player + prev state + a callbacks interface for all side effects. It mutates prev state in place and returns void.

The critical design decision: the transition detection calls `this.spawnKillSplatter(player)`, `this.spawnDustParticles(player, vy)`, and `this.pickupCarrotVFX(x, y)` — these are orchestration methods on GameLoop that connect particles and gibs. Pass them as a callbacks object.

```typescript
// src/engine/gameLoop/cosmetics/playerTransitions.ts
import type { Player, PlayerSlot, PlayerState, MatchState } from '../../types';
import { DUST_LAND_VY_THRESHOLD, SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SCORE_ANIM_DURATION } from '../../constants';
import { audio } from '../../audio';
import { haptics } from '../../haptics';
import type { SfxCooldowns } from './sfx';
import { getOrCreateCooldowns } from './sfx';

/** Previous-frame player state for cosmetic transition detection. */
export interface PrevPlayerCosmeticState {
  state: PlayerState;
  vx: number;
  vy: number;
  score: number;
  sideSquash: number;
  burnTimer: number;
  slowTimer: number;
  fastFalling: boolean;
  invincibleTimer: number;
}

export function snapshotPlayerCosmeticState(player: Player): PrevPlayerCosmeticState {
  return {
    state: player.state, vx: player.vx, vy: player.vy,
    score: player.score, sideSquash: player.sideSquash,
    burnTimer: player.burnTimer, slowTimer: player.slowTimer,
    fastFalling: player.fastFalling, invincibleTimer: player.invincibleTimer,
  };
}

/** Callbacks for side effects that cross module boundaries. */
export interface TransitionCallbacks {
  playSound: (name: string) => void;
  spawnDustParticles: (player: Player, landVy: number) => void;
  spawnKillSplatter: (victim: Player) => void;
  pickupCarrotVFX: (x: number, y: number) => void;
}

/**
 * Detect per-player state transitions and fire sounds/VFX.
 * Must fire even during hitstop (e.g. stomp sound).
 */
export function detectPlayerTransitions(
  player: Player,
  prev: PrevPlayerCosmeticState,
  state: MatchState,
  sfxCooldowns: Map<PlayerSlot, SfxCooldowns>,
  cb: TransitionCallbacks,
): void {
  const wasGrounded = prev.state === 'idle' || prev.state === 'run';
  const wasAirborne = prev.state === 'airborne';
  const isAirborne = player.state === 'airborne';
  const isGrounded = player.state === 'idle' || player.state === 'run';

  // Jump: grounded → airborne
  if (wasGrounded && isAirborne) cb.playSound('jump');

  // Fast-fall start
  if (!prev.fastFalling && player.fastFalling) cb.playSound('fastfall');

  // Landing: airborne → grounded
  if (wasAirborne && isGrounded && Math.abs(prev.vy) >= DUST_LAND_VY_THRESHOLD) {
    const cd = getOrCreateCooldowns(sfxCooldowns, player.id);
    if (cd.land <= 0) {
      cb.playSound('land');
      cd.land = 0.1;
    }
    cb.spawnDustParticles(player, Math.abs(prev.vy));
  }

  // Wall hit: was moving fast horizontally, now stopped
  if (Math.abs(prev.vx) > 100 && Math.abs(player.vx) < 5 && isGrounded) cb.playSound('oof');

  // Stomp: alive → splat (but not disconnect)
  if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat' && !player.disconnected) {
    cb.playSound('stomp');
    audio.playAnimal(player.character.name);
    cb.spawnKillSplatter(player);
    state.shockwaves.push({
      x: player.x + player.width / 2, y: player.y + player.height / 2,
      radius: 0, maxRadius: SHOCKWAVE_MAX_RADIUS, life: SHOCKWAVE_DURATION,
    });
  }

  // Respawn
  if (prev.state === 'respawning' && player.state === 'idle') cb.playSound('land');

  // Push bump (sideSquash === 0.8 is exact collision marker; wall hits set 0.75)
  if (prev.sideSquash >= 0.95 && Math.abs(player.sideSquash - 0.8) < 0.01) {
    cb.playSound('bump');
    if (haptics.isLocal(player.id)) haptics.bump();
  }

  // Burn start
  if (prev.burnTimer <= 0 && player.burnTimer > 0) cb.playSound('oof');

  // Geyser launch
  if (prev.vy - player.vy > 300) cb.playSound('geyser');

  // Score change → score animation + carrot pickup sound
  if (player.score > prev.score) {
    state.scoreAnimations.push({ playerId: player.id, value: player.score - prev.score, timer: SCORE_ANIM_DURATION });
    cb.playSound('crunch');
    audio.playAnimal(player.character.name);
    cb.pickupCarrotVFX(player.x + player.width / 2, player.y);
  }

  // Slow start → thorn/hazard/ghost/lava rock hit sound
  if (prev.slowTimer <= 0 && player.slowTimer > 0) cb.playSound('thornhit');

  // Update prev state
  prev.state = player.state;
  prev.vx = player.vx;
  prev.vy = player.vy;
  prev.score = player.score;
  prev.sideSquash = player.sideSquash;
  prev.burnTimer = player.burnTimer;
  prev.slowTimer = player.slowTimer;
  prev.fastFalling = player.fastFalling;
  prev.invincibleTimer = player.invincibleTimer;
}
```

- [ ] **Step 2: Add to barrel + wire into gameLoop.ts**

Add exports to `cosmetics/index.ts`. In `gameLoop.ts`:
- Import `detectPlayerTransitions`, `snapshotPlayerCosmeticState`, `PrevPlayerCosmeticState`, `TransitionCallbacks`
- Remove the `PrevPlayerCosmeticState` interface (now lives in the module)
- Create a `TransitionCallbacks` object once (cached, not per-frame):
  ```typescript
  private readonly _transitionCallbacks: TransitionCallbacks = {
    playSound: this._boundPlaySound,
    spawnDustParticles: (p, vy) => this.spawnDustParticles(p, vy),
    spawnKillSplatter: (v) => this.spawnKillSplatter(v),
    pickupCarrotVFX: (x, y) => this.pickupCarrotVFX(x, y),
  };
  ```
- Replace the transition detection block (lines 566-676) with:
  ```typescript
  const prev = this.prevCosmeticState.get(player.id);
  if (prev) {
    detectPlayerTransitions(player, prev, this.state, this.sfxCooldowns, this._transitionCallbacks);
  } else {
    this.prevCosmeticState.set(player.id, snapshotPlayerCosmeticState(player));
  }
  ```

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 4: Commit**

```
git commit -m "refactor: extract player transition detection to cosmetics/playerTransitions.ts"
```

---

### Task 3: Extract `cosmetics/playerCosmetics.ts`

Per-player cosmetic updates: animation frames, fire particles, idle anim, afterimages, footsteps, expressions, squash decay, fat wobble.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/playerCosmetics.ts`
- Modify: `src/engine/gameLoop/cosmetics/index.ts`
- Modify: `src/engine/gameLoop.ts:680-771`

- [ ] **Step 1: Create `playerCosmetics.ts`**

This function takes the player, dt, accumulators (afterimage + footstep), and callbacks (emitParticle, playSound). It owns the animation logic, afterimage spawn/decay, footstep timing, expression updates, squash decay, and fat wobble.

The accumulator Maps stay on GameLoop (they're per-player persistent state). Pass them by reference — the function reads/writes entries directly.

```typescript
// src/engine/gameLoop/cosmetics/playerCosmetics.ts
import type { Player, PlayerSlot, Particle } from '../../types';
import {
  ANIM_FRAME_DURATION, RUN_FRAMES, IDLE_ANIM_INTERVAL,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
  SQUASH_DECAY_SPEED,
} from '../../constants';
import { audio } from '../../audio';
import { swapRemove } from '../../themes/utils';
import { fastSin } from '../../fastMath';

const f = Math.fround;

const FIRE_COLORS = ['#FF4400', '#FF8800', '#FFCC00', '#FFAA00'];

/**
 * Update per-player cosmetic state: animation, fire particles, idle anim,
 * afterimages, footstep sounds, expressions, squash decay, fat wobble.
 * Called for each active player that is NOT in hitstop.
 */
export function updatePlayerCosmetics(
  player: Player, dt: number, timeElapsed: number,
  effWalkSpeed: number,
  afterimageAccs: Map<PlayerSlot, number>,
  footstepAccs: Map<PlayerSlot, number>,
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void,
  playSound: (name: string) => void,
): void {
  // Animation frame advance
  player.animTimer += dt;
  if (player.animTimer >= ANIM_FRAME_DURATION) {
    player.animTimer -= ANIM_FRAME_DURATION;
    player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
  }

  // Fire particles while burning
  if (player.burnTimer > 0 && player.state !== 'splat' && player.state !== 'respawning') {
    const cx = player.x + player.width / 2;
    const baseY = player.y + player.height;
    for (let i = 0; i < 2; i++) {
      const fx = cx + (Math.random() - 0.5) * player.width * 0.8;
      const fy = baseY - Math.random() * player.height * 0.6;
      const life = 0.25 + Math.random() * 0.3;
      emitParticle(fx, fy, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, life, 2 + Math.random() * 4, FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]);
    }
  }

  // Idle animation timer
  if (player.state === 'idle') {
    player.idleAnimTimer += dt;
    if (player.idleAnimTimer >= IDLE_ANIM_INTERVAL) player.idleAnimTimer = 0;
  } else {
    player.idleAnimTimer = 0;
  }

  // Afterimages
  const speed = Math.max(Math.abs(player.vx), Math.abs(player.vy));
  const spawnAfterimage = speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0;
  if (spawnAfterimage) {
    let acc = afterimageAccs.get(player.id) || 0;
    acc += dt;
    while (acc >= AFTERIMAGE_INTERVAL) {
      acc -= AFTERIMAGE_INTERVAL;
      if (player.afterimages.length < AFTERIMAGE_MAX) {
        player.afterimages.push({ x: player.x, y: player.y, facing: player.facing, alpha: 1 });
      }
    }
    afterimageAccs.set(player.id, acc);
  } else {
    afterimageAccs.set(player.id, 0);
  }
  for (let i = player.afterimages.length - 1; i >= 0; i--) {
    player.afterimages[i].alpha -= dt * 4;
    if (player.afterimages[i].alpha <= 0) swapRemove(player.afterimages, i);
  }

  // Footstep sounds
  if (player.state === 'run') {
    const runSpeed = Math.abs(player.vx);
    const speedRatio = Math.min(runSpeed / effWalkSpeed, 1);
    const interval = 0.22 - speedRatio * 0.12;
    let fAcc = footstepAccs.get(player.id) || 0;
    fAcc += dt;
    if (fAcc >= interval) {
      fAcc -= interval;
      const playerBottom = player.y + player.height;
      const name = playerBottom > 600 ? 'footstep_grass' : 'footstep_wood';
      audio.setVolume(name, 0.08 + speedRatio * 0.2);
      playSound(name);
    }
    footstepAccs.set(player.id, fAcc);
  } else {
    footstepAccs.set(player.id, 0);
  }

  // Expressions: dizzy (invincible) and scared (fast fall)
  if (player.invincibleTimer > 0) {
    player.expression = 'dizzy';
  } else if (player.vy > 400) {
    player.expression = 'scared';
  }

  // Side squash decay
  if (player.sideSquash !== 1) {
    player.sideSquash = f(player.sideSquash + f(f(1.0 - player.sideSquash) * f(SQUASH_DECAY_SPEED * dt)));
    if (Math.abs(player.sideSquash - 1) < 0.02) player.sideSquash = 1;
  }

  // Fat wobble
  if (player.fatTimer > 0) {
    player.squashScale = f(player.squashScale * f(1 + f(fastSin(f(timeElapsed * 6)) * 0.05)));
  }
}
```

- [ ] **Step 2: Wire into gameLoop.ts**

Replace lines 680-771 with a single call:
```typescript
updatePlayerCosmetics(
  player, dt, this.state.timeElapsed, this.effWalkSpeed,
  this.afterimageAccumulators, this.footstepAccumulators,
  this.emitParticle.bind(this), this._boundPlaySound,
);
```

Wait — `this.emitParticle.bind(this)` in a hot path. Cache it like the others:
```typescript
private readonly _boundEmitParticle = (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void =>
  this.emitParticle(x, y, vx, vy, life, size, color);
```

Then use `this._boundEmitParticle` in the call.

- [ ] **Step 3: Remove `FIRE_COLORS` constant** from gameLoop.ts (it moves to playerCosmetics.ts).

- [ ] **Step 4: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 5: Commit**

```
git commit -m "refactor: extract per-player cosmetic updates to cosmetics/playerCosmetics.ts"
```

---

### Task 4: Extract `gameplay/playerCollisions.ts`

The biggest and trickiest extraction. The per-player collision section (lines 1270-1430) has 5 collision handlers that all follow the same pattern:
1. Call `checkXCollision()` → hit result
2. Apply state changes (timers, knockback, squash)
3. Emit particles at collision point
4. Apply screen effects + haptics (gated by `!_resimulating`)

**Strategy**: Extract functions that do steps 1-2 and return a result struct. Step 3 (particles) stays in GameLoop since it needs `emitParticle`. Step 4 uses a shared helper.

**Files:**
- Create: `src/engine/gameLoop/gameplay/playerCollisions.ts`
- Modify: `src/engine/gameLoop/gameplay/index.ts`
- Modify: `src/engine/gameLoop.ts:1270-1430`

- [ ] **Step 1: Define result types and shared helper**

```typescript
// src/engine/gameLoop/gameplay/playerCollisions.ts
import type { Player, MatchState, Arena, EffectZone, PlayerSlot } from '../../types';
import { SPRING_BOUNCE, THORN_SLOW_DURATION, SPRING_TRAIL_DURATION, HAZARD_HITSTOP_DURATION, CANVAS_HEIGHT } from '../../constants';
import { checkSpringCollision, checkThornCollision, checkHazardZoneCollision, checkGhostCollision, checkLavaRockCollision } from '../../hazardCollision';
import { respawnPlayer } from '../../stomp';

const f = Math.fround;

/** Result of a hazard collision — tells the caller what VFX to emit. */
export interface HazardHitResult {
  type: 'spring' | 'thorn' | 'hazardZone' | 'ghost' | 'lavaRock' | 'fallOff';
  /** Player center at time of hit (for particle emission). */
  px: number;
  py: number;
  /** Secondary position (e.g. thorn location for shrapnel). */
  sx?: number;
  sy?: number;
  /** Hazard zone subtype for coloring particles. */
  hazardType?: string;
  /** Screen effects to apply (caller gates on _resimulating). */
  screenShake?: number;
  screenFlash?: number;
  hitstopZoom?: number;
  /** Haptic feedback type. */
  haptic?: 'hazardHit' | 'spring';
}
```

- [ ] **Step 2: Extract collision handler functions**

Each handler checks the collision, applies state changes to the player, and returns a `HazardHitResult | null`. The particle emission is NOT in these functions — that stays in GameLoop.

```typescript
export function handleSpringCollision(player: Player, state: MatchState): HazardHitResult | null {
  const springHit = checkSpringCollision(player, state.springs);
  if (!springHit) return null;
  const spring = state.springs[springHit.springIndex];
  player.vy = SPRING_BOUNCE;
  player.state = 'airborne';
  spring.bounceTimer = 0.3;
  player.springTrailTimer = SPRING_TRAIL_DURATION;
  return { type: 'spring', px: player.x + player.width / 2, py: player.y, haptic: 'spring' };
}

export function handleThornCollision(player: Player, state: MatchState): HazardHitResult | null {
  const thornHit = checkThornCollision(player, state.thorns);
  if (!thornHit) return null;
  const thorn = state.thorns[thornHit.thornIndex];
  player.slowTimer = THORN_SLOW_DURATION;
  thorn.hit = true;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
  return {
    type: 'thorn',
    px: player.x + player.width / 2, py: player.y + player.height / 2,
    sx: thorn.x + thorn.width / 2, sy: thorn.y,
    screenShake: 0.15, hitstopZoom: HAZARD_HITSTOP_DURATION, haptic: 'hazardHit',
  };
}

export function handleHazardZoneCollision(
  player: Player, arena: Arena,
): HazardHitResult | null {
  if (!arena.hazardZones) return null;
  const hzHit = checkHazardZoneCollision(player, arena.hazardZones);
  if (!hzHit) return null;
  const hz = hzHit.zone;
  player.slowTimer = THORN_SLOW_DURATION;
  if (hz.type === 'lava') player.burnTimer = THORN_SLOW_DURATION;
  player.vx = f(player.vx + hzHit.knockbackDir * 150);
  player.vy = -200;
  player.damageFlashSide = hzHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.4;
  player.squashScale = 0.6;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
  return {
    type: 'hazardZone', hazardType: hz.type,
    px: player.x + player.width / 2, py: player.y + player.height / 2,
    screenShake: 0.25, screenFlash: 0.06, hitstopZoom: HAZARD_HITSTOP_DURATION, haptic: 'hazardHit',
  };
}

export function handleGhostCollision(player: Player, state: MatchState): HazardHitResult | null {
  const ghostHit = checkGhostCollision(player, state.ghosts);
  if (!ghostHit) return null;
  player.slowTimer = THORN_SLOW_DURATION;
  player.vx = f(player.vx + ghostHit.knockbackDir * 180);
  player.vy = -180;
  player.damageFlashSide = ghostHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.4;
  player.squashScale = 0.6;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
  return {
    type: 'ghost',
    px: player.x + player.width / 2, py: player.y + player.height / 2,
    screenShake: 0.2, screenFlash: 0.06, hitstopZoom: HAZARD_HITSTOP_DURATION,
    // no haptic — ghost hit is silent-touch
  };
}

export function handleLavaRockCollision(player: Player, state: MatchState): HazardHitResult | null {
  const rockHit = checkLavaRockCollision(player, state.lavaRocks);
  if (!rockHit) return null;
  const rock = state.lavaRocks[rockHit.rockIndex];
  rock.active = false;
  player.slowTimer = THORN_SLOW_DURATION;
  player.vx = f(player.vx + (rockHit.knockbackDir > 0 ? -120 : 120));
  player.vy = -150;
  player.damageFlashSide = rockHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.3;
  player.squashScale = 0.65;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
  return {
    type: 'lavaRock',
    px: player.x + player.width / 2, py: player.y + player.height / 2,
    screenShake: 0.2, hitstopZoom: HAZARD_HITSTOP_DURATION, haptic: 'hazardHit',
  };
}

export function handleFallOff(
  player: Player, arena: Arena, state: MatchState,
): HazardHitResult | null {
  if (!arena.allowFallOff || player.y <= CANVAS_HEIGHT + 50) return null;
  respawnPlayer(player, arena.spawnPoints, state.players);
  player.invincibleTimer = 1.5;
  player.slowTimer = 2.0;
  return { type: 'fallOff', px: player.x, py: player.y, screenShake: 0.1 };
}
```

- [ ] **Step 3: Create the VFX dispatch helper in `gameLoop.ts`**

Add a private method in GameLoop that takes a `HazardHitResult` and emits the appropriate particles + screen effects:

```typescript
/** Emit VFX for a hazard collision result. */
private applyHazardHitVFX(hit: HazardHitResult): void {
  // Screen effects (gated by _resimulating)
  if (!this._resimulating) {
    if (hit.screenShake) this.state.screenShake = Math.max(this.state.screenShake, hit.screenShake);
    if (hit.screenFlash) this.state.screenFlash = Math.max(this.state.screenFlash, hit.screenFlash);
    if (hit.hitstopZoom) this.state.hitstopZoom = Math.max(this.state.hitstopZoom, hit.hitstopZoom);
    if (hit.haptic === 'hazardHit') haptics.hazardHit();
    if (hit.haptic === 'spring') haptics.spring();
  }
  // Particles by type
  const { px, py, sx, sy } = hit;
  if (hit.type === 'thorn') {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      const life = 0.4 + Math.random() * 0.5;
      this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2.5 + Math.random() * 4, BLOOD_COLOR);
    }
    if (sx !== undefined && sy !== undefined) {
      for (let i = 0; i < 8; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 30 + Math.random() * 80;
        const life = 0.3 + Math.random() * 0.3;
        this.emitParticle(sx, sy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.5 + Math.random() * 2, '#5C3A1E');
      }
    }
  } else if (hit.type === 'hazardZone') {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      const life = 0.4 + Math.random() * 0.6;
      const color = hit.hazardType === 'lava' ? (i % 3 === 0 ? '#FFCC00' : i % 3 === 1 ? '#FF4400' : '#FF8800') : BLOOD_COLOR;
      this.emitParticle(px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 12, Math.cos(angle) * speed, Math.sin(angle) * speed - 100, life, 3 + Math.random() * 5, color);
    }
  } else if (hit.type === 'ghost') {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      const life = 0.4 + Math.random() * 0.5;
      const color = i % 2 === 0 ? '#8855CC' : '#AA77EE';
      this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 3 + Math.random() * 4, color);
    }
  } else if (hit.type === 'lavaRock') {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 150;
      const life = 0.3 + Math.random() * 0.5;
      const color = i % 2 === 0 ? '#FF6600' : '#FFAA00';
      this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 60, life, 2.5 + Math.random() * 4, color);
    }
  }
  // spring and fallOff have no collision particles
}
```

- [ ] **Step 4: Replace collision blocks in fixedUpdate**

Replace lines 1270-1430 with:

```typescript
      // Hazard collisions — pure state changes in submodule, VFX dispatch in GameLoop
      const springHit = handleSpringCollision(player, this.state);
      if (springHit) {
        if (haptics.isLocal(player.id)) this.applyHazardHitVFX(springHit);
        else this.applyHazardHitVFX(springHit);
      }

      const thornHit = handleThornCollision(player, this.state);
      if (thornHit) this.applyHazardHitVFX(thornHit);

      const hzHit = handleHazardZoneCollision(player, this.arena);
      if (hzHit) this.applyHazardHitVFX(hzHit);

      const ghostHit = handleGhostCollision(player, this.state);
      if (ghostHit) this.applyHazardHitVFX(ghostHit);

      const rockHit = handleLavaRockCollision(player, this.state);
      if (rockHit) this.applyHazardHitVFX(rockHit);

      const fallHit = handleFallOff(player, this.arena, this.state);
      if (fallHit && !this._resimulating) this.state.screenShake = Math.max(this.state.screenShake, fallHit.screenShake!);
```

Wait — haptics need `isLocal` check. Let me fix the `applyHazardHitVFX` to take the player for the haptics gate:

```typescript
private applyHazardHitVFX(hit: HazardHitResult, playerId: PlayerSlot): void {
  if (!this._resimulating) {
    if (hit.screenShake) this.state.screenShake = Math.max(this.state.screenShake, hit.screenShake);
    if (hit.screenFlash) this.state.screenFlash = Math.max(this.state.screenFlash, hit.screenFlash);
    if (hit.hitstopZoom) this.state.hitstopZoom = Math.max(this.state.hitstopZoom, hit.hitstopZoom);
    if (hit.haptic && haptics.isLocal(playerId)) {
      if (hit.haptic === 'hazardHit') haptics.hazardHit();
      if (hit.haptic === 'spring') haptics.spring();
    }
  }
  // ... particles ...
}
```

Then in fixedUpdate:
```typescript
      const springHit = handleSpringCollision(player, this.state);
      if (springHit) this.applyHazardHitVFX(springHit, player.id);

      const thornHit = handleThornCollision(player, this.state);
      if (thornHit) this.applyHazardHitVFX(thornHit, player.id);

      const hzHit = handleHazardZoneCollision(player, this.arena);
      if (hzHit) this.applyHazardHitVFX(hzHit, player.id);

      const ghostHit = handleGhostCollision(player, this.state);
      if (ghostHit) this.applyHazardHitVFX(ghostHit, player.id);

      const rockHit = handleLavaRockCollision(player, this.state);
      if (rockHit) this.applyHazardHitVFX(rockHit, player.id);

      const fell = handleFallOff(player, this.arena, this.state);
      if (fell) this.applyHazardHitVFX(fell, player.id);
```

- [ ] **Step 5: Remove now-unused imports from gameLoop.ts**

`checkSpringCollision`, `checkThornCollision`, `checkHazardZoneCollision`, `checkGhostCollision`, `checkLavaRockCollision` can be removed from gameLoop.ts imports (they're now used only in `playerCollisions.ts`). Also `respawnPlayer` if only used in fall-off (check — it's also used in `updateSplatTimers` call but that's already imported separately).

- [ ] **Step 6: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 7: Commit**

```
git commit -m "refactor: extract hazard collision handling to gameplay/playerCollisions.ts"
```

---

### Task 5: Extract `gameplay/stomps.ts`

Stomp processing, kill feed management, stats updates.

**Files:**
- Create: `src/engine/gameLoop/gameplay/stomps.ts`
- Modify: `src/engine/gameLoop/gameplay/index.ts`
- Modify: `src/engine/gameLoop.ts:1508-1562`

- [ ] **Step 1: Create `stomps.ts`**

```typescript
// src/engine/gameLoop/gameplay/stomps.ts
import type { MatchState, MatchSettings, Arena, PlayerSlot } from '../../types';
import { SCREEN_SHAKE_DURATION, HITSTOP_DURATION } from '../../constants';
import { checkStomps, updateSplatTimers, respawnPlayer } from '../../stomp';
import { collidePlayersHorizontal, collidePlatforms } from '../../physics';
import { haptics } from '../../haptics';
import type { SeededRNG } from '../../net/prng';

/**
 * Run stomp detection, process kills (stats, hitstop, damage flash, kill feed),
 * resolve player-player horizontal collisions, and update splat timers.
 */
export function processStompsAndCollisions(
  state: MatchState, arena: Arena, settings: MatchSettings,
  dt: number, resimulating: boolean, rng: SeededRNG | undefined,
): void {
  const { killFeedEntries } = checkStomps(state.players, arena.spawnPoints, state.timeElapsed, settings.mods);

  if (killFeedEntries.length > 0 && !resimulating) {
    state.screenShake = SCREEN_SHAKE_DURATION;
    state.hitstopZoom = HITSTOP_DURATION;
  }

  for (const entry of killFeedEntries) {
    const attacker = state.players.find(p => p.id === entry.attacker);
    if (attacker) {
      attacker.hitstopTimer = Math.max(attacker.hitstopTimer, HITSTOP_DURATION);
      if (haptics.isLocal(attacker.id)) haptics.hitstop();
      attacker.killStreak += 1;
      const aps = state.stats.perPlayer.get(attacker.id);
      if (aps && attacker.killStreak > aps.bestStreak) aps.bestStreak = attacker.killStreak;
    }
    const victim = state.players.find(p => p.id === entry.victim);
    if (victim) {
      victim.hitstopTimer = Math.max(victim.hitstopTimer, HITSTOP_DURATION);
      if (haptics.isLocal(victim.id)) haptics.hitstop();
      if (attacker) {
        victim.damageFlashSide = attacker.x < victim.x ? 'left' : 'right';
      } else {
        victim.damageFlashSide = null;
      }
      victim.damageFlashTimer = 0.3;
      victim.killStreak = 0;
    }
  }
  if (killFeedEntries.length > 0) {
    state.killFeed.push(...killFeedEntries);
    const excess = state.killFeed.length - 10;
    if (excess > 0) {
      state.killFeed.copyWithin(0, excess);
      state.killFeed.length = 10;
    }
  }

  collidePlayersHorizontal(state.players);
  for (const player of state.players) {
    if (!player.active || player.state === 'splat' || player.state === 'respawning') continue;
    collidePlatforms(player, arena.platforms);
  }
  updateSplatTimers(state.players, arena.spawnPoints, dt, rng);
}
```

- [ ] **Step 2: Wire into gameLoop.ts**

Replace lines 1508-1562 with:
```typescript
    processStompsAndCollisions(this.state, this.arena, this.settings, dt, this._resimulating, this.rng);
```

Remove now-unused imports from gameLoop.ts: `checkStomps`, `updateSplatTimers`, `collidePlayersHorizontal`, `collidePlatforms` (verify each is not used elsewhere in the file first — `collidePlatforms` is still used in the per-player physics loop for the initial collision).

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 4: Commit**

```
git commit -m "refactor: extract stomp processing to gameplay/stomps.ts"
```

---

## Post-extraction cleanup

After all 5 tasks, `gameLoop.ts` should be ~1050-1100 lines. The remaining code is:
- Constructor (~220 lines) — player init, AI, caching, state
- `start()`/`stop()` lifecycle (~60 lines)
- Network accessors (~90 lines)
- `loop()` RAF callback (~80 lines)
- `fixedUpdate()` orchestrator (~180 lines — timers, per-player input+physics core, delegate calls)
- `cosmeticStep()` orchestrator (~30 lines — delegate calls)
- `renderFrame()` (~30 lines)
- Private wrappers + `applyHazardHitVFX` + `pickupCarrotVFX` + `spawnKillSplatter` (~80 lines)

This is a reasonable size for the orchestrator class. Further reduction would require Phase 3 (System objects that own their state).
