# CosmeticStep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify host and guest cosmetic code into a single `cosmeticStep(dt)` method on GameLoop, eliminating the duplicated guest-side reimplementations (GuestSFX, timer decay, tickEnvironment, afterimage generation).

**Architecture:** Extract all cosmetic logic from `fixedUpdate()` into a new `cosmeticStep(dt)` method that uses state-transition detection (comparing current vs. previous frame state) to trigger sounds, particles, and visual effects. Both host and guest call `cosmeticStep()` after their respective state updates. The host calls `fixedUpdate()` then `cosmeticStep()`. The guest calls `applySnapshot()` then `cosmeticStep()`.

**Tech Stack:** TypeScript, Vitest, existing GameLoop/AudioManager/Renderer infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-16-cosmetic-step-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/engine/gameLoop.ts` | Modify | Add `cosmeticStep(dt)` with prev-state tracking, transition detection, per-tick cosmetic systems. Remove cosmetic triggers from `fixedUpdate()`. Remove `tickCosmetics()`, `tickEnvironment()`, public VFX methods. |
| `src/engine/net/netMatch.ts` | Modify | Guest loop: replace GuestSFX + timer decay + afterimage + tickCosmetics with `cosmeticStep(dt)`. Host loop: add `cosmeticStep(dt)` after fixedUpdate. |
| `src/engine/net/guestSfx.ts` | Delete | Replaced by shared cosmeticStep |
| `src/engine/net/guestSfx.test.ts` | Delete | Replaced by cosmeticStep tests |
| `src/engine/net/index.ts` | Modify | Remove GuestSFX export |
| `src/engine/gameLoop.test.ts` | Modify | Add cosmeticStep transition detection tests |

---

### Task 1: Add prev-state tracking infrastructure to GameLoop

**Files:**
- Modify: `src/engine/gameLoop.ts`

This task adds the `PrevPlayerCosmeticState` type and the `prevCosmeticState` Map that `cosmeticStep` will use for transition detection. No behavior change yet.

- [ ] **Step 1: Add prev-state type and storage**

Add after the existing private field declarations (around line 87, near `footstepAccumulators`):

```typescript
/** Previous-frame player state for cosmetic transition detection. */
interface PrevPlayerCosmeticState {
  state: PlayerState;
  vx: number;
  vy: number;
  score: number;
  sideSquash: number;
  burnTimer: number;
  fastFalling: boolean;
  invincibleTimer: number;
}

// In the class body, add field:
private prevCosmeticState: Map<PlayerSlot, PrevPlayerCosmeticState> = new Map();
```

- [ ] **Step 2: Verify build**

Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/engine/gameLoop.ts
git commit -m "refactor: add prev-state tracking for cosmeticStep"
```

---

### Task 2: Create cosmeticStep skeleton with environment systems

**Files:**
- Modify: `src/engine/gameLoop.ts`

Move `tickEnvironment()` and `tickCosmetics()` content into the new `cosmeticStep(dt)`. This is the safest starting point — environment systems have no transition detection, they just tick every frame.

- [ ] **Step 1: Create cosmeticStep method**

Add new public method (replacing `tickCosmetics` and `tickEnvironment`):

```typescript
/**
 * Tick all cosmetic systems — sounds, particles, VFX, environment.
 * Called by BOTH host (after fixedUpdate) and guest (after snapshot apply).
 * Uses prev-state comparison for transition-triggered effects.
 */
cosmeticStep(dt: number): void {
  // --- Per-tick cosmetic systems (no transition detection needed) ---
  this.updateWeather(dt);
  this.updateParticles(dt);
  this.updateGibs(dt);
  this.updateConfetti(dt);

  // Environment: wildlife, fog, pollen, shooting stars
  // (moved from tickEnvironment)
  for (const w of this.state.wildlife) {
    w.wingPhase += dt * 8;
    if (w.type === 'butterfly') {
      w.x += w.vx * dt;
      w.vy = Math.sin(w.wingPhase * 0.5) * 20;
      w.y += w.vy * dt;
      if (w.x > CANVAS_WIDTH + 20) w.x = -20;
      if (w.x < -20) w.x = CANVAS_WIDTH + 20;
      if (w.y < -20) w.y = CANVAS_HEIGHT * 0.6;
      if (w.y > CANVAS_HEIGHT * 0.6) w.y = 0;
    } else {
      w.x += w.vx * dt;
      w.y += Math.sin(w.wingPhase * 0.3) * 5 * dt;
      if (w.x > CANVAS_WIDTH + 50) {
        w.x = -50 - Math.random() * 100;
        w.y = Math.random() * CANVAS_HEIGHT * 0.4;
        w.vx = 40 + Math.random() * 40;
      }
    }
  }
  for (const f of this.state.fogParticles) {
    f.x += f.vx * dt;
    if (f.x > CANVAS_WIDTH + 30) f.x = -30;
  }
  for (const p of this.state.pollenParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -10) {
      p.y = CANVAS_HEIGHT + 10;
      p.x = Math.random() * CANVAS_WIDTH;
    }
  }
  if (this.theme.dayNight.showShootingStars && this.state.dayPhase > 0.4 && Math.random() < 0.005) {
    const svx = 300 + Math.random() * 200;
    const svy = 50 + Math.random() * 50;
    this.state.shootingStars.push({
      x: Math.random() * CANVAS_WIDTH * 0.5,
      y: Math.random() * CANVAS_HEIGHT * 0.3,
      vx: svx, vy: svy, life: 0.4,
      tailLen: Math.min(40, Math.sqrt(svx * svx + svy * svy) * 0.1),
    });
  }
  for (let i = this.state.shootingStars.length - 1; i >= 0; i--) {
    const star = this.state.shootingStars[i];
    star.x += star.vx * dt;
    star.y += star.vy * dt;
    star.life -= dt;
    if (star.life <= 0) swapRemove(this.state.shootingStars, i);
  }

  // Shockwave decay
  for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
    const sw = this.state.shockwaves[i];
    sw.radius += (sw.maxRadius / SHOCKWAVE_DURATION) * dt;
    sw.life -= dt;
    if (sw.life <= 0) swapRemove(this.state.shockwaves, i);
  }

  // Score animation decay
  for (let i = this.state.scoreAnimations.length - 1; i >= 0; i--) {
    this.state.scoreAnimations[i].timer -= dt;
    if (this.state.scoreAnimations[i].timer <= 0) {
      swapRemove(this.state.scoreAnimations, i);
    }
  }

  // Bouncy wobble decay
  for (const [bi, timer] of this.state.bouncyWobble) {
    const next = timer - dt;
    if (next <= 0) this.state.bouncyWobble.delete(bi);
    else this.state.bouncyWobble.set(bi, next);
  }
}
```

- [ ] **Step 2: Remove tickCosmetics and tickEnvironment**

Delete the `tickCosmetics()` and `tickEnvironment()` methods entirely. They're now inlined in `cosmeticStep()`.

- [ ] **Step 3: Update host loop() to call cosmeticStep**

In the host's `loop()` method (gameLoop.ts ~line 695), the `while` accumulator loop calls `fixedUpdate()`. After the while loop, add `this.cosmeticStep(FIXED_TIMESTEP)` — but ONLY when not in network mode (netMatch handles its own calls):

Actually, for local play the host's `loop()` should call `cosmeticStep`. For online play, `netMatch.ts` will call it. So guard with `!this._networkMode`:

```typescript
// After the accumulator while loop, before timer decay:
if (!this._networkMode) {
  this.cosmeticStep(FIXED_TIMESTEP);
}
```

- [ ] **Step 4: Update netMatch host loop to call cosmeticStep**

In `netMatch.ts` `startHostLoop()`, after `this.hostAuthority!.consumeGuestJumps()` and before `accumulator -= FIXED_DT`, add:

```typescript
this.gameLoop.cosmeticStep(FIXED_DT);
```

- [ ] **Step 5: Update netMatch guest loop to call cosmeticStep**

In `netMatch.ts` `startGuestLoop()`, replace the timer decay block, the `tickCosmetics(dt)` call, and the afterimage generation with a single:

```typescript
this.gameLoop.cosmeticStep(dt);
```

Remove lines for:
- Per-player timer decay (invincible, slow, splat, respawn, burn, damageFlash, hitstop, springTrail)
- Per-player idleAnimTimer advance
- Per-player afterimage generation + decay
- screenShake decay
- `this.gameLoop.tickCosmetics(dt)` call

- [ ] **Step 6: Verify build and tests**

Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Run: `npm test`
Expected: All tests pass. Guest loop now calls `cosmeticStep(dt)` which handles environment + particles.

Note: At this point, event-triggered effects (sounds, particles from stomps/landings) are STILL in fixedUpdate AND still in GuestSFX. Both paths still work. The next tasks will migrate them.

- [ ] **Step 7: Commit**

```bash
git add src/engine/gameLoop.ts src/engine/net/netMatch.ts
git commit -m "refactor: create cosmeticStep with environment systems, wire host+guest"
```

---

### Task 3: Move per-player cosmetic timers and systems to cosmeticStep

**Files:**
- Modify: `src/engine/gameLoop.ts`

Move squash/stretch decay, idle animation, afterimage management, footstep accumulators, SFX cooldown decay, and visual timer decay from fixedUpdate's per-player loop into cosmeticStep.

- [ ] **Step 1: Add per-player cosmetic loop to cosmeticStep**

At the top of `cosmeticStep(dt)`, before the environment systems, add:

```typescript
// --- Per-player cosmetic systems ---
for (const player of this.state.players) {
  if (!player.active) continue;

  // Visual timer decay (smooth between snapshots on guest)
  if (player.damageFlashTimer > 0) player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
  if (player.hitstopTimer > 0) player.hitstopTimer = Math.max(0, player.hitstopTimer - dt);
  if (player.springTrailTimer > 0) player.springTrailTimer = Math.max(0, player.springTrailTimer - dt);
  if (player.invincibleTimer > 0) player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);
  if (player.slowTimer > 0) player.slowTimer = Math.max(0, player.slowTimer - dt);
  if (player.splatTimer > 0) player.splatTimer = Math.max(0, player.splatTimer - dt);
  if (player.respawnTimer > 0) player.respawnTimer = Math.max(0, player.respawnTimer - dt);
  if (player.burnTimer > 0) player.burnTimer = Math.max(0, player.burnTimer - dt);

  // SFX cooldown decay
  const landCD = this.landCooldowns?.get(player.id);
  if (landCD !== undefined && landCD > 0) this.landCooldowns.set(player.id, landCD - dt);
  const bonkCD = this.headbonkCooldowns?.get(player.id);
  if (bonkCD !== undefined && bonkCD > 0) this.headbonkCooldowns.set(player.id, bonkCD - dt);
  const crouchCD = this.crouchCooldowns?.get(player.id);
  if (crouchCD !== undefined && crouchCD > 0) this.crouchCooldowns.set(player.id, crouchCD - dt);

  // Squash/stretch decay
  if (player.squashTimer > 0) {
    player.squashTimer -= dt;
    if (player.squashTimer <= 0) {
      player.squashScale = 1;
      player.squashTimer = 0;
    } else {
      player.squashScale += (1 - player.squashScale) * Math.min(1, dt * 12);
    }
  }
  if (player.sideSquash !== 1) {
    player.sideSquash += (1 - player.sideSquash) * Math.min(1, dt * 8);
    if (Math.abs(player.sideSquash - 1) < 0.01) player.sideSquash = 1;
  }
  // Fat wobble
  if (player.fatTimer > 0) {
    player.squashScale = 1 + Math.sin(player.fatTimer * 8) * 0.03;
  }

  // Idle animation timer
  if (player.state === 'idle') {
    player.idleAnimTimer += dt;
  } else {
    player.idleAnimTimer = 0;
  }

  // Run animation frame advance
  if (player.state === 'run') {
    player.animTimer += dt;
    if (player.animTimer >= ANIM_FRAME_DURATION) {
      player.animFrame = (player.animFrame + 1) % 4;
      player.animTimer -= ANIM_FRAME_DURATION;
    }
  }

  // Afterimage management
  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  if ((speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0)
      && player.state !== 'splat' && player.state !== 'respawning') {
    let acc = this.afterimageAccumulators?.get(player.id) ?? 0;
    acc += dt;
    if (acc >= AFTERIMAGE_INTERVAL) {
      acc -= AFTERIMAGE_INTERVAL;
      player.afterimages.push({ x: player.x, y: player.y, alpha: 0.5, facing: player.facing });
    }
    this.afterimageAccumulators?.set(player.id, acc);
  } else {
    this.afterimageAccumulators?.set(player.id, 0);
  }
  for (let ai = player.afterimages.length - 1; ai >= 0; ai--) {
    player.afterimages[ai].alpha -= dt * 4;
    if (player.afterimages[ai].alpha <= 0) swapRemove(player.afterimages, ai);
  }

  // Footstep sounds
  if (player.state === 'run') {
    const spd = Math.abs(player.vx);
    const speedRatio = Math.min(spd / this.effWalkSpeed, 1);
    const interval = 0.22 - speedRatio * 0.12;
    let fAcc = this.footstepAccumulators.get(player.id) || 0;
    fAcc += dt;
    if (fAcc >= interval) {
      fAcc -= interval;
      const playerBottom = player.y + player.height;
      const name = playerBottom > 600 ? 'footstep_grass' : 'footstep_wood';
      const vol = 0.08 + speedRatio * 0.2;
      audio.setVolume(name, vol);
      this.playSound(name);
    }
    this.footstepAccumulators.set(player.id, fAcc);
  } else {
    this.footstepAccumulators.set(player.id, 0);
  }

  // Expressions
  if (player.invincibleTimer > 0) {
    player.expression = 'dizzy';
  } else if (player.vy > 400) {
    player.expression = 'scared';
  }
  // (angry expression from proximity — keep in fixedUpdate since it needs other player positions)

  // Fire particles while burning
  if (player.burnTimer > 0 && player.state !== 'splat' && player.state !== 'respawning') {
    // Emit fire particle (same as in fixedUpdate)
    const fx = player.x + player.width / 2 + (Math.random() - 0.5) * player.width * 0.6;
    const fy = player.y + (Math.random() * player.height * 0.4);
    this.emitParticle(fx, fy, (Math.random() - 0.5) * 40, -60 - Math.random() * 80,
      0.2 + Math.random() * 0.3, 2 + Math.random() * 4,
      FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]);
  }
}

// Screen shake decay
if (this.state.screenShake > 0) {
  this.state.screenShake = Math.max(0, this.state.screenShake - dt);
}
```

- [ ] **Step 2: Remove the duplicated code from fixedUpdate**

Remove from fixedUpdate's per-player loop:
- SFX cooldown decay (lines ~1468–1473)
- Squash/stretch decay (lines ~1575–1593)
- Idle animation timer (lines ~1612–1620)
- Afterimage management (lines ~1622–1644)
- Footstep sounds (lines ~1646–1664)
- Run animation frame advance (lines ~1435–1439)
- Fire particle emission during burn (lines ~1452–1455)
- Expression updates for dizzy/scared (lines ~1597–1601, keep angry proximity check)

Remove from fixedUpdate post-player-loop:
- Screen shake decay (line ~1285)
- Shockwave decay (lines ~2056–2062 — already in cosmeticStep from Task 2)
- Score animation decay (lines ~2068–2073 — already in cosmeticStep)
- Bouncy wobble decay (lines ~1416–1420 — already in cosmeticStep)
- Wildlife/fog/pollen/shooting stars (lines ~2079–2136 — already in cosmeticStep)

Remove from fixedUpdate post-player-loop:
- Pigeon scatter particle decay (lines ~1402–1412 — add to cosmeticStep)

**Important: keep all timer DECREMENTS that affect gameplay** (invincibleTimer decrement in fixedUpdate is used by stomp immunity check, splatTimer decrement drives respawn, etc.). The cosmeticStep timer decay handles smooth visual interpolation; fixedUpdate timer decay handles gameplay progression. On the host BOTH run (fixedUpdate decrements for gameplay, cosmeticStep provides smooth visual). On the guest only cosmeticStep runs (snapshot provides gameplay values).

Wait — this is a problem. If both fixedUpdate AND cosmeticStep decrement invincibleTimer on the host, it decrements TWICE. The solution: **cosmeticStep does NOT decrement gameplay-affecting timers on the host.** Only on the guest (where fixedUpdate doesn't run).

Add a flag: `cosmeticStep(dt: number, isGuest = false)`:
- When `isGuest=true`: decay ALL timers (invincible, slow, splat, respawn, burn, damageFlash, hitstop, springTrail)
- When `isGuest=false` (host): decay ONLY visual-only timers (damageFlash, hitstop, springTrail) — gameplay timers are handled by fixedUpdate

Actually, simpler: don't decay any timers in cosmeticStep at all. Let fixedUpdate handle all timer decay on the host, and on the guest the snapshot provides the correct timer values. The cosmeticStep only needs to READ timers for effect triggering (e.g., burnTimer > 0 → fire particles), not WRITE them.

But the guest needs smooth timer decay between snapshots for visual effects (invincible flashing, damage flash fading). So the guest loop should keep its own timer decay, separate from cosmeticStep. OR: cosmeticStep skips timer decay, and the guest loop keeps just the timer decay lines.

Let me rethink. The cleanest split:

**cosmeticStep** handles: transition detection, sound triggers, particle spawns, per-tick cosmetic systems (afterimages, footsteps, idle anim, squash decay, expressions, fire particles, environment).

**Timer decay** stays where it is:
- Host: in fixedUpdate (handles gameplay timers) — ALREADY THERE, no change needed
- Guest: in the guest loop's existing timer decay block — KEEP as-is

This means we DON'T move timer decay into cosmeticStep. We only move the cosmetic EFFECTS and SYSTEMS. The timer decay on the guest is simple (~10 lines) and doesn't create duplication issues since it's just `Math.max(0, timer - dt)` lines.

- [ ] **Step 3: Verify build and tests**

Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add src/engine/gameLoop.ts
git commit -m "refactor: move per-player cosmetic systems to cosmeticStep"
```

---

### Task 4: Move event-triggered sound effects to cosmeticStep

**Files:**
- Modify: `src/engine/gameLoop.ts`

Add transition detection to cosmeticStep for player state changes. Remove the corresponding sound triggers from fixedUpdate.

- [ ] **Step 1: Add transition detection + sound triggers to cosmeticStep**

In the per-player loop inside cosmeticStep, after the per-tick systems, add:

```typescript
  // --- Transition detection for event-triggered effects ---
  const prev = this.prevCosmeticState.get(player.id);
  if (prev) {
    const wasGrounded = prev.state === 'idle' || prev.state === 'run';
    const wasAirborne = prev.state === 'airborne';
    const isGrounded = player.state === 'idle' || player.state === 'run';
    const isAirborne = player.state === 'airborne';

    // Jump: grounded → airborne
    if (wasGrounded && isAirborne) {
      this.playSound('jump');
      player.squashScale = STRETCH_ON_JUMP;
      player.squashTimer = 0.15;
    }

    // Fast-fall start
    if (!prev.fastFalling && player.fastFalling) {
      this.playSound('fastfall');
    }

    // Landing: airborne → grounded
    if (wasAirborne && isGrounded) {
      if (Math.abs(prev.vy) >= DUST_LAND_VY_THRESHOLD) {
        const landCD = this.landCooldowns.get(player.id) ?? 0;
        if (landCD <= 0) {
          this.playSound('land');
          this.landCooldowns.set(player.id, 0.1);
        }
        this.spawnDustParticles(player as Player, Math.abs(prev.vy));
      }
      // Landing squash
      player.squashScale = SQUASH_ON_LAND;
      player.squashTimer = 0.15;
    }

    // Headbonk: was going up fast, now vy=0 but still airborne
    if (wasAirborne && isAirborne && prev.vy < -10 && Math.abs(player.vy) < 1) {
      const bonkCD = this.headbonkCooldowns.get(player.id) ?? 0;
      if (bonkCD <= 0) {
        this.playSound('headbonk');
        this.headbonkCooldowns.set(player.id, 0.15);
      }
    }

    // Wall hit: was moving fast horizontally, now stopped
    if (Math.abs(prev.vx) > 100 && Math.abs(player.vx) < 1 && prev.vx !== 0) {
      this.playSound('oof');
      player.squashScale = 1.3;
      player.squashTimer = 0.12;
    }

    // Stomp: alive → splat
    if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat') {
      this.playSound('stomp');
      audio.playAnimal(player.character.name);
      this.spawnKillSplatter(player as Player);
      this.state.shockwaves.push({
        x: player.x + player.width / 2,
        y: player.y + player.height / 2,
        radius: 0,
        maxRadius: SHOCKWAVE_MAX_RADIUS,
        life: SHOCKWAVE_DURATION,
      });
    }

    // Respawn: respawning → idle
    if (prev.state === 'respawning' && player.state === 'idle') {
      this.playSound('land');
    }

    // Push bump: sideSquash dropped to 0.8 (push marker)
    if (prev.sideSquash >= 0.95 && player.sideSquash < 0.85) {
      this.playSound('bump');
    }

    // Burn start: burnTimer went from 0 to > 0
    if (prev.burnTimer <= 0 && player.burnTimer > 0) {
      this.playSound('oof');
    }

    // Geyser launch: sudden upward impulse
    if (prev.vy - player.vy > 300) {
      this.playSound('geyser');
    }

    // Score change → score animation
    if (player.score > prev.score) {
      this.state.scoreAnimations.push({
        playerId: player.id,
        value: player.score - prev.score,
        timer: 1.0,
      });
    }
  }

  // Update prev state for next frame
  if (prev) {
    prev.state = player.state;
    prev.vx = player.vx;
    prev.vy = player.vy;
    prev.score = player.score;
    prev.sideSquash = player.sideSquash;
    prev.burnTimer = player.burnTimer;
    prev.fastFalling = player.fastFalling;
    prev.invincibleTimer = player.invincibleTimer;
  } else {
    this.prevCosmeticState.set(player.id, {
      state: player.state, vx: player.vx, vy: player.vy,
      score: player.score, sideSquash: player.sideSquash,
      burnTimer: player.burnTimer, fastFalling: player.fastFalling,
      invincibleTimer: player.invincibleTimer,
    });
  }
```

- [ ] **Step 2: Add entity-level transition detection**

After the per-player loop in cosmeticStep, add:

```typescript
// --- Entity transition detection ---
// Carrots: active → inactive = pickup
for (let i = 0; i < this.state.carrots.length; i++) {
  const prev = this._prevCarrotActives[i];
  const cur = this.state.carrots[i].active;
  if (prev && !cur) {
    this.playSound('crunch');
    this.spawnCarrotVFX(this.state.carrots[i].x, this.state.carrots[i].y);
  }
  this._prevCarrotActives[i] = cur;
}
this._prevCarrotActives.length = this.state.carrots.length;

// Springs: bounceTimer 0 → >0
for (let i = 0; i < this.state.springs.length; i++) {
  const prev = this._prevSpringBounces[i] ?? 0;
  const cur = this.state.springs[i].bounceTimer;
  if (prev <= 0 && cur > 0) {
    this.playSound('spring');
    // Set springTrailTimer on nearest player
    const sx = this.state.springs[i].x;
    const sy = this.state.springs[i].y;
    let closest: Player | null = null;
    let minDist = 60;
    for (const p of this.state.players) {
      if (!p.active || p.state === 'splat') continue;
      const dist = Math.sqrt((p.x + p.width / 2 - sx) ** 2 + (p.y + p.height - sy) ** 2);
      if (dist < minDist) { minDist = dist; closest = p; }
    }
    if (closest) closest.springTrailTimer = SPRING_TRAIL_DURATION;
  }
  this._prevSpringBounces[i] = cur;
}
this._prevSpringBounces.length = this.state.springs.length;

// Thorns: hit false → true
for (let i = 0; i < this.state.thorns.length; i++) {
  const prev = this._prevThornHits[i] ?? false;
  const cur = this.state.thorns[i].hit;
  if (!prev && cur) {
    this.playSound('thornhit');
  }
  this._prevThornHits[i] = cur;
}
this._prevThornHits.length = this.state.thorns.length;

// Countdown
if (this.state.countdown > 0) {
  const curSec = Math.ceil(this.state.countdown);
  if (curSec < this._prevCountdown) {
    this.playSound('countdown_beep');
  }
  this._prevCountdown = curSec;
} else if (this._prevCountdown > 0) {
  this.playSound('countdown_go');
  this._prevCountdown = 0;
}

// Match over
if (this.state.matchOver && !this._prevMatchOver) {
  this.playSound('victory');
}
this._prevMatchOver = this.state.matchOver;
```

Add the tracking arrays as class fields:
```typescript
private _prevCarrotActives: boolean[] = [];
private _prevSpringBounces: number[] = [];
private _prevThornHits: boolean[] = [];
private _prevCountdown = 4;
private _prevMatchOver = false;
```

- [ ] **Step 3: Remove corresponding sound triggers from fixedUpdate**

Remove from fixedUpdate:
- All `this.playSound()` calls that are now handled by transition detection in cosmeticStep
- The particle spawns that accompany those sounds (landing dust, wall impact dust, kill splatter, shockwave push, carrot VFX)
- Keep gameplay state changes (score increments, timer sets, entity removal)

This is the largest edit — go through each of the 28 playSound sites in fixedUpdate and remove the cosmetic trigger while keeping the simulation logic.

- [ ] **Step 4: Verify build and tests**

Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/engine/gameLoop.ts
git commit -m "refactor: move event-triggered cosmetics to cosmeticStep transition detection"
```

---

### Task 5: Delete GuestSFX and clean up guest loop

**Files:**
- Delete: `src/engine/net/guestSfx.ts`
- Delete: `src/engine/net/guestSfx.test.ts`
- Modify: `src/engine/net/netMatch.ts`
- Modify: `src/engine/net/index.ts`

- [ ] **Step 1: Remove GuestSFX from netMatch.ts**

In `netMatch.ts`:
- Remove `import { GuestSFX } from './guestSfx'`
- Remove the `guestSfx` field declaration
- Remove `this.guestSfx = new GuestSFX(this.gameLoop)` from `initGuest()`
- The guest loop's GuestSFX `update()` call should already be gone (replaced by cosmeticStep in Task 2)

- [ ] **Step 2: Clean up guest loop**

The guest loop in `startGuestLoop()` should now be:
```typescript
// 2. Apply interpolated host snapshot to state
if (this.interpolation) { ... }

// 3. Tick all cosmetics (sounds, particles, VFX, environment)
this.gameLoop.cosmeticStep(dt);

// 4. Apply input echo for local player visual responsiveness
if (this.inputEcho) { ... }

// 5. Timer decay for smooth visual interpolation between snapshots
const state = this.gameLoop.getState();
for (const p of state.players) {
  if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
  if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
  // ... (keep the existing timer decay block — these are for smooth guest visuals)
}
if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt);

// 6. Stall detection
// 7. Render
```

- [ ] **Step 3: Delete GuestSFX files**

```bash
git rm src/engine/net/guestSfx.ts src/engine/net/guestSfx.test.ts
```

- [ ] **Step 4: Remove GuestSFX from barrel export**

In `src/engine/net/index.ts`, remove any GuestSFX export.

- [ ] **Step 5: Remove public VFX methods from GameLoop**

Delete `spawnStompVfxPublic`, `spawnGibsPublic`, `spawnDustPublic`, `spawnCarrotVfxPublic`, `emitParticlePublic` — these were only needed by GuestSFX. cosmeticStep calls the private methods directly.

- [ ] **Step 6: Verify build and tests**

Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Run: `npm test`
Expected: All tests pass. GuestSFX tests are gone; cosmeticStep handles everything.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete GuestSFX — cosmeticStep handles all cosmetics for both host and guest"
```

---

### Task 6: Write cosmeticStep transition detection tests

**Files:**
- Create: `src/engine/net/cosmeticStep.test.ts` (or add to gameLoop.test.ts)

- [ ] **Step 1: Write tests for key transitions**

Test that cosmeticStep fires the correct sounds/effects when state changes:

```typescript
describe('cosmeticStep transition detection', () => {
  it('plays jump sound when player goes from idle to airborne', ...);
  it('plays land sound when player goes from airborne to idle with high vy', ...);
  it('plays stomp sound when player goes from run to splat', ...);
  it('spawns shockwave on stomp', ...);
  it('plays spring sound when bounceTimer goes from 0 to >0', ...);
  it('plays bump sound when sideSquash drops to 0.8', ...);
  it('does not play sounds on first frame (no previous state)', ...);
  it('plays footstep sounds at speed-dependent intervals', ...);
  it('advances idle animation timer when idle', ...);
  it('generates afterimages at high speed', ...);
});
```

Each test: create a GameLoop (with mocked audio/canvas), set state, call cosmeticStep, verify audio.play was called with the right argument.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All new tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/engine/net/cosmeticStep.test.ts
git commit -m "test: add cosmeticStep transition detection tests"
```

---

### Task 7: Final cleanup and verification

**Files:**
- Modify: `src/engine/gameLoop.ts` (remove any dead code)
- Modify: `src/engine/CLAUDE.md` (update documentation)

- [ ] **Step 1: Search for dead code**

Grep for references to removed methods/classes:
```bash
grep -rn "GuestSFX\|guestSfx\|tickCosmetics\|tickEnvironment\|spawnStompVfxPublic\|spawnGibsPublic\|spawnDustPublic\|spawnCarrotVfxPublic\|emitParticlePublic" src/
```

Fix any remaining references.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Run: `npx tsc -b --noEmit 2>&1 | grep -v trystero`
Expected: All tests pass, no type errors.

- [ ] **Step 3: Update CLAUDE.md**

In `src/engine/CLAUDE.md`, update the Network Multiplayer section to document the new architecture:
- Remove references to GuestSFX
- Document `cosmeticStep(dt)` as the shared cosmetic code path
- Note that timer decay stays in the guest loop for smooth visual interpolation

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete cosmeticStep migration — one cosmetic code path for host and guest"
```
