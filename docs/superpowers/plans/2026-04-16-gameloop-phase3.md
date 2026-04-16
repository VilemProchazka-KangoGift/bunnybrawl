# GameLoop Phase 3: System Object Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 16 pure-function submodules into 12 System classes with init/update/cleanup lifecycle, moving state ownership from GameLoop into the systems. Target: gameLoop.ts drops from ~1,232 to ~600-700 lines.

**Architecture:** Two interfaces (`GameplaySystem` with `fixedUpdate(dt)`, `CosmeticSystem` with `cosmeticUpdate(dt)`) — both also have `init(state)` and `cleanup()`. Systems receive shared state via constructor. GameLoop iterates system arrays. Pure function modules preserved — systems wrap them.

**Tech Stack:** TypeScript, existing gameLoop submodules.

**Critical ordering constraint:** ParticleSystem must be created before systems that reference it (CarrotSystem, PlayerCollisionSystem, PlayerCosmeticSystem, PlayerTransitionSystem).

---

### Task 1: Create System Interfaces + Move GameLoop.ts

**Files:**
- Create: `src/engine/gameLoop/types.ts`
- Rename: `src/engine/gameLoop.ts` → `src/engine/gameLoop/GameLoop.ts`
- Create: `src/engine/gameLoop/index.ts`
- Modify: `src/engine/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
// src/engine/gameLoop/types.ts
import type { MatchState } from '../types';

export interface GameplaySystem {
  init(state: MatchState): void;
  fixedUpdate(dt: number): void;
  cleanup(): void;
}

export interface CosmeticSystem {
  init(state: MatchState): void;
  cosmeticUpdate(dt: number): void;
  cleanup(): void;
}
```

- [ ] **Step 2: Move `gameLoop.ts` to `gameLoop/GameLoop.ts`**

```bash
git mv src/engine/gameLoop.ts src/engine/gameLoop/GameLoop.ts
```

Fix all relative imports inside GameLoop.ts — they currently use `./types`, `./physics`, etc. After the move, they become `../types`, `../physics`, etc. The submodule imports (`./gameLoop/cosmetics/...`) become `./cosmetics/...`.

- [ ] **Step 3: Create barrel `index.ts`**

```typescript
// src/engine/gameLoop/index.ts
export { GameLoop } from './GameLoop';
export type { MatchEndCallback } from './GameLoop';
export type { GameplaySystem, CosmeticSystem } from './types';
```

- [ ] **Step 4: Update engine barrel**

In `src/engine/index.ts`, change:
```typescript
export { GameLoop } from './gameLoop';
export type { MatchEndCallback } from './gameLoop';
```
This path still resolves (directory with index.ts).

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 6: Commit**

```
git commit -m "refactor: create System interfaces, move GameLoop.ts into gameLoop/ directory"
```

---

### Task 2: EnvironmentSystem + EntityTransitionSystem

Simplest systems — no cross-system references. Establishes the pattern.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/EnvironmentSystem.ts`
- Create: `src/engine/gameLoop/cosmetics/EntityTransitionSystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create EnvironmentSystem**

```typescript
// src/engine/gameLoop/cosmetics/EnvironmentSystem.ts
import type { MatchState } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import { updateWildlife, updateFog, updatePollen, updateShootingStars, updateShockwaves, updateScoreAnimations, updateBouncyWobble, updatePigeonScatterParticles } from './environment';

export class EnvironmentSystem implements CosmeticSystem {
  constructor(private state: MatchState, private theme: ThemeConfig) {}
  init(): void {}
  cosmeticUpdate(dt: number): void {
    updateWildlife(this.state, dt);
    updateFog(this.state, dt);
    updatePollen(this.state, dt);
    updateShootingStars(this.state, this.theme, dt);
    updateShockwaves(this.state, dt);
    updateScoreAnimations(this.state, dt);
    updateBouncyWobble(this.state, dt);
    updatePigeonScatterParticles(this.state, dt);
  }
  cleanup(): void {}
}
```

- [ ] **Step 2: Create EntityTransitionSystem**

```typescript
// src/engine/gameLoop/cosmetics/EntityTransitionSystem.ts
import type { MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import type { PrevEntityState } from './entityTransitions';
import { detectEntityTransitions } from './entityTransitions';

export class EntityTransitionSystem implements CosmeticSystem {
  private prevEntityState: PrevEntityState = {
    springBounces: [],
    countdownSec: 4,
    matchOver: false,
  };

  constructor(private state: MatchState, private playSound: (name: string) => void) {}

  init(): void {
    this.prevEntityState.springBounces = this.state.springs.map(s => s.bounceTimer);
    this.prevEntityState.countdownSec = Math.ceil(this.state.countdown);
    this.prevEntityState.matchOver = this.state.matchOver;
  }

  cosmeticUpdate(): void {
    detectEntityTransitions(this.state, this.prevEntityState, this.playSound);
  }

  cleanup(): void {}
}
```

- [ ] **Step 3: Wire into GameLoop**

In GameLoop.ts:
1. Import both systems.
2. Add fields: `private environmentSystem!: EnvironmentSystem;` and `private entityTransitionSystem!: EntityTransitionSystem;`
3. In constructor (after state is created), instantiate them:
   ```typescript
   this.environmentSystem = new EnvironmentSystem(this.state, this.theme);
   this.entityTransitionSystem = new EntityTransitionSystem(this.state, this._boundPlaySound);
   ```
4. In `start()` (or constructor), call `this.entityTransitionSystem.init();`
5. In `cosmeticStep()`, replace:
   ```typescript
   // OLD:
   detectEntityTransitions(this.state, this.prevEntityState, this._boundPlaySound);
   // ... environment calls ...
   updateWildlife(this.state, dt);
   updateFog(this.state, dt);
   updatePollen(this.state, dt);
   updateShootingStars(this.state, this.theme, dt);
   updateShockwaves(this.state, dt);
   updateScoreAnimations(this.state, dt);
   updateBouncyWobble(this.state, dt);
   updatePigeonScatterParticles(this.state, dt);
   
   // NEW:
   this.entityTransitionSystem.cosmeticUpdate(dt);
   this.environmentSystem.cosmeticUpdate(dt);
   ```
6. Remove `prevEntityState` field and its init lines from GameLoop constructor.
7. Remove now-unused imports for the replaced function calls.

- [ ] **Step 4: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 5: Commit**

```
git commit -m "refactor: create EnvironmentSystem + EntityTransitionSystem"
```

---

### Task 3: ParticleSystem

The biggest system — owns particles[], particleFreeList[], newBloodDrips[], newGroundedGibs[], fireworkTimer. Also absorbs spawnKillSplatter, pickupCarrotVFX, and applyHazardHitVFX. Other systems will reference it.

**Files:**
- Create: `src/engine/gameLoop/cosmetics/ParticleSystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create ParticleSystem**

The class owns all particle/gib state and provides public methods for VFX emission. It imports from the `particles.ts` and `gibs.ts` pure function modules.

Key public methods:
- `emitParticle(x, y, vx, vy, life, size, color)` — particle pool emission
- `spawnDustParticles(player, landVy)` — landing dust
- `spawnGoreParticles(victim, extremeGore)` — blood
- `spawnConfetti(victim)` — confetti
- `spawnCarrotVFX(x, y)` — carrot spawn sparkle
- `pickupCarrotVFX(x, y)` — carrot pickup VFX (particles + gibs)
- `spawnKillSplatter(victim, settings)` — gore/gibs/confetti orchestration
- `spawnFirework()` — victory fireworks
- `applyHazardHitVFX(hit, playerId, state, resimulating)` — collision VFX dispatch
- `cosmeticUpdate(dt)` — update weather, particles, gibs, confetti + fireworks
- `bakeToRenderer(renderer)` — flush settled gibs and blood drips to renderer

The class is ~150-200 lines. It consolidates the `_boundEmitParticle`, particle arrays, gib arrays, blood drip buffer, grounded gib buffer, and firework timer currently on GameLoop. The `applyHazardHitVFX` method (currently ~70 lines on GameLoop) moves here since it's purely about particle emission.

Move the `CARROT_PICKUP_COLORS` constant into this file.

- [ ] **Step 2: Wire into GameLoop**

1. Add field: `private particleSystem!: ParticleSystem;`
2. Instantiate in constructor (after state + theme): `this.particleSystem = new ParticleSystem(this.state, this.arena, this.theme, this.settings);`
3. Replace all particle-related calls:
   - `this.emitParticle(...)` → `this.particleSystem.emitParticle(...)`
   - `this.spawnDustParticles(p, vy)` → `this.particleSystem.spawnDustParticles(p, vy)`
   - `this.spawnKillSplatter(v)` → `this.particleSystem.spawnKillSplatter(v, this.settings)`
   - `this.pickupCarrotVFX(x, y)` → `this.particleSystem.pickupCarrotVFX(x, y)`
   - `this.spawnFirework()` → `this.particleSystem.spawnFirework()`
   - `this.applyHazardHitVFX(hit, id)` → `this.particleSystem.applyHazardHitVFX(hit, id, this.state, this._resimulating)`
   - `this._updateParticles(dt)` → `this.particleSystem.updateParticles(dt)`
   - `this._updateGibs(dt)` → `this.particleSystem.updateGibs(dt)`
   - `this._updateConfetti(dt)` → `this.particleSystem.updateConfetti(dt)`
   - `this._updateWeather(dt)` → `this.particleSystem.updateWeather(dt)`
4. In cosmeticStep, replace particle system calls with `this.particleSystem.cosmeticUpdate(dt)`
5. In `renderFrame()` and `loop()`, replace gib/blood bake logic with `this.particleSystem.bakeToRenderer(this.renderer)`
6. Remove from GameLoop: `particles`, `particleFreeList`, `newBloodDripsSinceRender`, `newGroundedGibsSinceRender`, `fireworkTimer`, `emitParticle` method, `spawnDustParticles` method, `spawnKillSplatter` method, `pickupCarrotVFX` method, `spawnFirework` method, `applyHazardHitVFX` method, `_updateParticles/Gibs/Confetti/Weather` methods, `_boundEmitParticle` field, `CARROT_PICKUP_COLORS` constant
7. Update `_transitionCallbacks` to reference particleSystem methods:
   ```typescript
   spawnDustParticles: (p, vy) => this.particleSystem.spawnDustParticles(p, vy),
   spawnKillSplatter: (v) => this.particleSystem.spawnKillSplatter(v, this.settings),
   pickupCarrotVFX: (x, y) => this.particleSystem.pickupCarrotVFX(x, y),
   ```
8. The `particles` array is still needed by renderer (`renderFrame` passes `this.particles`). ParticleSystem should expose `getParticles()` for this, or GameLoop reads `this.particleSystem.particles` directly.

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 4: Commit**

```
git commit -m "refactor: create ParticleSystem — owns all particle/gib/VFX state"
```

---

### Task 4: PlayerTransitionSystem + PlayerCosmeticSystem

Both are per-player cosmetic systems. PlayerTransitionSystem needs ParticleSystem ref (for transition VFX callbacks).

**Files:**
- Create: `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts`
- Create: `src/engine/gameLoop/cosmetics/PlayerCosmeticSystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create PlayerTransitionSystem**

Owns: `prevCosmeticState` Map, `sfxCooldowns` Map. Handles per-player SFX cooldown decay + transition detection + cosmetic timer decay (damageFlash, springTrail).

Constructor takes: `state`, `playSound`, `playAnimal`, `audioEnabled` getter, `particleSystem` ref.
Builds the `TransitionCallbacks` internally.

```typescript
init(state: MatchState): void {
  for (const p of state.players) {
    this.prevCosmeticState.set(p.id, snapshotPlayerCosmeticState(p));
  }
}

cosmeticUpdate(dt: number): void {
  for (const player of this.state.players) {
    if (!player.active) continue;
    decaySfxCooldowns(this.sfxCooldowns, player.id, dt);
    if (player.damageFlashTimer > 0) player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
    if (player.springTrailTimer > 0) player.springTrailTimer = Math.max(0, player.springTrailTimer - dt);
    const prev = this.prevCosmeticState.get(player.id);
    if (prev) {
      detectPlayerTransitions(player, prev, this.state, this.sfxCooldowns, this.callbacks);
    } else {
      this.prevCosmeticState.set(player.id, snapshotPlayerCosmeticState(player));
    }
  }
}
```

Exposes: `getSfxCooldowns()` for GameLoop's fixedUpdate (headbonk/crouch cooldowns).

- [ ] **Step 2: Create PlayerCosmeticSystem**

Owns: `afterimageAccumulators`, `footstepAccumulators`. Calls `updatePlayerCosmetics` per active non-hitstop player.

Constructor takes: `state`, `effWalkSpeed`, `particleSystem` ref, `playSound`.

```typescript
cosmeticUpdate(dt: number): void {
  for (const player of this.state.players) {
    if (!player.active || player.hitstopTimer > 0) continue;
    updatePlayerCosmetics(
      player, dt, this.state.timeElapsed, this.effWalkSpeed,
      this.afterimageAccs, this.footstepAccs,
      (x, y, vx, vy, life, size, color) => this.particleSystem.emitParticle(x, y, vx, vy, life, size, color),
      this.playSound,
    );
  }
}
```

- [ ] **Step 3: Wire into GameLoop**

1. Instantiate both systems in constructor.
2. In `cosmeticStep()`, replace the per-player loop (SFX decay + transition detection + hitstop continue + cosmetics) with:
   ```typescript
   this.playerTransitionSystem.cosmeticUpdate(dt);
   this.playerCosmeticSystem.cosmeticUpdate(dt);
   ```
3. Remove from GameLoop: `prevCosmeticState`, `sfxCooldowns`, `afterimageAccumulators`, `footstepAccumulators`, `_transitionCallbacks`.
4. Where `sfxCooldowns` is referenced in fixedUpdate (headbonk/crouch cooldowns), use `this.playerTransitionSystem.getSfxCooldowns()`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 5: Commit**

```
git commit -m "refactor: create PlayerTransitionSystem + PlayerCosmeticSystem"
```

---

### Task 5: HazardSystem + CarrotSystem + ArenaEntitySystem

Gameplay spawner systems.

**Files:**
- Create: `src/engine/gameLoop/gameplay/HazardSystem.ts`
- Create: `src/engine/gameLoop/gameplay/CarrotSystem.ts`
- Create: `src/engine/gameLoop/gameplay/ArenaEntitySystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create HazardSystem**

Owns: `floatingPlatforms` cache. Handles spawn timers + hazard lifetime updates.

Constructor takes: `state`, `arena`, `gameRandom`.

```typescript
init(): void {
  // Compute floatingPlatforms from arena (move from GameLoop constructor)
}

fixedUpdate(dt: number): void {
  const f = Math.fround;
  this.state.springSpawnTimer = f(this.state.springSpawnTimer - dt);
  if (this.state.springSpawnTimer <= 0) {
    spawnSpring(this.state, this.floatingPlatforms, this.arena.platforms, this.arena.noSprings, this.gameRandom);
    this.state.springSpawnTimer = SPRING_SPAWN_INTERVAL;
  }
  this.state.thornSpawnTimer = f(this.state.thornSpawnTimer - dt);
  if (this.state.thornSpawnTimer <= 0) {
    spawnThorn(this.state, this.floatingPlatforms, this.gameRandom);
    this.state.thornSpawnTimer = THORN_SPAWN_INTERVAL;
  }
  updateHazardLifetimes(this.state, dt);
}
```

- [ ] **Step 2: Create CarrotSystem**

Stateless (timer on MatchState). Needs ParticleSystem ref for spawn VFX.

```typescript
fixedUpdate(dt: number): void {
  const f = Math.fround;
  this.state.carrotTimer = f(this.state.carrotTimer - dt);
  if (this.state.carrotTimer <= 0) {
    const prevCount = this.state.carrots.length;
    spawnCarrot(this.state, this.arena, this.cachedZeroGZones, this.gameRandom);
    if (this.state.carrots.length > prevCount) {
      const c = this.state.carrots[this.state.carrots.length - 1];
      this.particleSystem.spawnCarrotVFX(c.x, c.y);
    }
    this.state.carrotTimer = this.settings.mods.carrotChase ? CARROT_CHASE_SPAWN_INTERVAL : CARROT_SPAWN_INTERVAL;
  }
}
```

- [ ] **Step 3: Create ArenaEntitySystem**

Owns: `cachedGeyserZones`, `geyserIndexMap`. Updates lava rocks, ghosts, geysers, pigeons.

Constructor takes: `state`, `arena`, `theme`, `gameRandom`.

```typescript
init(): void {
  this.cachedGeyserZones = (this.arena.effectZones || []).filter(z => z.type === 'geyser');
  this.geyserIndexMap = new Map(this.cachedGeyserZones.map((z, i) => [z, i]));
  // Ghost initialization also moves here from GameLoop constructor
}

fixedUpdate(dt: number): void {
  updateLavaRocks(this.state, this.theme, dt, this.gameRandom);
  updateGhosts(this.state, dt);
  updateGeyserTimers(this.state, this.cachedGeyserZones, dt);
  updatePigeonFlocks(this.state, dt);
}
```

Exposes: `getCachedGeyserZones()`, `getGeyserIndexMap()` for EffectZoneSystem + PlayerCollisionSystem (gib effect zones).

- [ ] **Step 4: Wire all three into GameLoop**

1. Instantiate in constructor.
2. In `fixedUpdate()`, replace the hazard timer block, carrot timer block, and arena entity update block with system calls.
3. Move `floatingPlatforms` computation from GameLoop constructor to HazardSystem.init().
4. Move ghost initialization from GameLoop constructor to ArenaEntitySystem.init().
5. Move `cachedGeyserZones`/`geyserIndexMap` from GameLoop to ArenaEntitySystem.
6. Remove from GameLoop: `floatingPlatforms`, `cachedGeyserZones`, `geyserIndexMap`, `_spawnSpring`, `_spawnThorn`, `_spawnCarrot`, `createWeatherParticle` wrapper.

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 6: Commit**

```
git commit -m "refactor: create HazardSystem + CarrotSystem + ArenaEntitySystem"
```

---

### Task 6: EffectZoneSystem + PlayerCollisionSystem + StompSystem

Per-player gameplay systems. EffectZoneSystem and PlayerCollisionSystem have per-player methods called from GameLoop's player loop.

**Files:**
- Create: `src/engine/gameLoop/gameplay/EffectZoneSystem.ts`
- Create: `src/engine/gameLoop/gameplay/PlayerCollisionSystem.ts`
- Create: `src/engine/gameLoop/gameplay/StompSystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create EffectZoneSystem**

Owns: `cachedZeroGZones`, `zeroGSoundPlaying`.

```typescript
applyToPlayer(player: Player, justLanded: boolean, wasAirborne: boolean, prevVy: number, dt: number): void {
  if (!this.arena.effectZones) return;
  applyEffectZones(player, this.arena.effectZones, this.arenaEntitySystem.getGeyserIndexMap(),
    this.state.geyserStates, justLanded, wasAirborne, prevVy,
    this.playerTransitionSystem.getSfxCooldowns(), this.playSound, dt);
}

fixedUpdate(): void {
  this.zeroGSoundPlaying = updateZeroGSound(
    this.state.players, this.cachedZeroGZones, this.zeroGSoundPlaying, this.playSound);
}
```

- [ ] **Step 2: Create PlayerCollisionSystem**

Stateless but holds ParticleSystem ref. Provides `checkCollisions(player)` called from GameLoop's player loop.

```typescript
checkCollisions(player: Player): void {
  const springHit = handleSpringCollision(player, this.state);
  if (springHit) this.particleSystem.applyHazardHitVFX(springHit, player.id, this.state, this.resimulating);

  const thornHit = handleThornCollision(player, this.state);
  if (thornHit) this.particleSystem.applyHazardHitVFX(thornHit, player.id, this.state, this.resimulating);

  const hzHit = handleHazardZoneCollision(player, this.arena);
  if (hzHit) this.particleSystem.applyHazardHitVFX(hzHit, player.id, this.state, this.resimulating);

  const ghostHit = handleGhostCollision(player, this.state);
  if (ghostHit) this.particleSystem.applyHazardHitVFX(ghostHit, player.id, this.state, this.resimulating);

  const rockHit = handleLavaRockCollision(player, this.state);
  if (rockHit) this.particleSystem.applyHazardHitVFX(rockHit, player.id, this.state, this.resimulating);

  const fell = handleFallOff(player, this.arena, this.state);
  if (fell) this.particleSystem.applyHazardHitVFX(fell, player.id, this.state, this.resimulating);
}
```

Constructor takes: `state`, `arena`, `particleSystem`, `resimulatingGetter: () => boolean`.

- [ ] **Step 3: Create StompSystem**

Thin wrapper around `processStompsAndCollisions`.

```typescript
fixedUpdate(dt: number): void {
  processStompsAndCollisions(this.state, this.arena, this.settings, dt, this.resimulating, this.rng);
}
```

Constructor takes: `state`, `arena`, `settings`, `resimulatingGetter`, `rngGetter`.

- [ ] **Step 4: Wire into GameLoop**

1. Instantiate all three in constructor.
2. In the per-player physics loop in `fixedUpdate()`:
   - Replace inline collision handler calls with `this.playerCollisionSystem.checkCollisions(player)`
   - Replace effect zone block with `this.effectZoneSystem.applyToPlayer(player, justLanded, wasAirborne, prevVy, dt)`
3. After the per-player loop:
   - Replace `updateZeroGSound(...)` with `this.effectZoneSystem.fixedUpdate(dt)`
   - Replace `processStompsAndCollisions(...)` with `this.stompSystem.fixedUpdate(dt)`
4. Remove from GameLoop: `cachedZeroGZones`, `zeroGSoundPlaying`, `applyHazardHitVFX` (already moved to ParticleSystem in Task 3).
5. Remove collision handler imports from GameLoop (they're now imported by PlayerCollisionSystem).

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 6: Commit**

```
git commit -m "refactor: create EffectZoneSystem + PlayerCollisionSystem + StompSystem"
```

---

### Task 7: MatchSystem + Final Wiring

MatchSystem absorbs ambient sound lifecycle, crowd cheering, periodic ambient, and match end checking. Then wire all systems into ordered arrays and clean up.

**Files:**
- Create: `src/engine/gameLoop/gameplay/MatchSystem.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Create MatchSystem**

Owns: `crowdStarted`, `activeAmbientLoops`, `periodicAmbientTimers`.

```typescript
init(): void {
  // Start theme ambient loops (moved from GameLoop.start())
  const ambConfig = this.theme.ambientSoundConfig;
  if (ambConfig?.loops) {
    for (const loop of ambConfig.loops) {
      this.playSound(loop);
      this.activeAmbientLoops.push(loop);
    }
  }
  if (ambConfig?.periodic) {
    for (const p of ambConfig.periodic) {
      const delay = p.intervalRange[0] + Math.random() * (p.intervalRange[1] - p.intervalRange[0]);
      this.periodicAmbientTimers.set(p.sound, delay);
    }
  }
}

fixedUpdate(dt: number): void {
  if (!this.resimulating()) {
    this.crowdStarted = updateCrowdCheering(this.state, this.settings, this.crowdStarted, this.playSound);
    tickPeriodicAmbient(this.theme, this.periodicAmbientTimers, dt, this.playSound);
  }
  // Match end check
  const winner = checkMatchEnd(this.state, this.settings);
  if (winner !== null) {
    this.state.slowMotion = SLOW_MO_DURATION;
    this.onMatchEnd(winner);
  }
}

cleanup(): void {
  // Stop all ambient loops (moved from GameLoop.stop())
  audio.stopAllGameSounds();
  this.activeAmbientLoops = [];
  this.periodicAmbientTimers.clear();
}
```

- [ ] **Step 2: Wire into GameLoop and create system arrays**

Add system array fields:
```typescript
private gameplaySystems: GameplaySystem[] = [];
private cosmeticSystems: CosmeticSystem[] = [];
```

In the constructor, after all systems are instantiated, build the ordered arrays:
```typescript
// Gameplay systems (order matters — hazards before collisions before stomps)
this.gameplaySystems = [
  this.hazardSystem,
  this.carrotSystem,
  this.arenaEntitySystem,
  // Note: effectZoneSystem and playerCollisionSystem have per-player methods
  // called from the player loop, not from the system array
  this.stompSystem,
  this.matchSystem,
];

// Cosmetic systems (order matters — transitions before cosmetics before environment)
this.cosmeticSystems = [
  this.playerTransitionSystem,
  this.playerCosmeticSystem,
  this.entityTransitionSystem,
  this.particleSystem,
  this.environmentSystem,
];
```

In `start()`:
```typescript
for (const sys of [...this.gameplaySystems, ...this.cosmeticSystems]) sys.init(this.state);
// effectZoneSystem and playerCollisionSystem also need init:
this.effectZoneSystem.init(this.state);
this.playerCollisionSystem.init(this.state);
```

In `fixedUpdate()`, after the per-player loop, replace individual system calls with:
```typescript
for (const sys of this.gameplaySystems) sys.fixedUpdate(dt);
```

But WAIT — the per-player loop interleaves GameLoop physics with system calls (effectZoneSystem.applyToPlayer, playerCollisionSystem.checkCollisions, bouncy platforms, pigeon scatter, carrot pickup). These per-player calls stay inline. The system array drives only the pre/post-loop work.

Revised fixedUpdate structure:
```typescript
fixedUpdate(dt) {
  // Countdown, day/night, screen shake — stays
  
  // Pre-player-loop systems
  this.hazardSystem.fixedUpdate(dt);
  this.carrotSystem.fixedUpdate(dt);
  this.arenaEntitySystem.fixedUpdate(dt);
  // Status timer decay — stays (per-player)
  
  // Per-player loop — stays (physics + inline system calls)
  for (const player of this.state.players) {
    // ... physics, squash/stretch, stats ...
    this.playerCollisionSystem.checkCollisions(player);
    this.effectZoneSystem.applyToPlayer(player, ...);
    // ... bouncy, pigeon, carrot pickup ...
  }
  
  // Post-player-loop systems
  // Carrot cleanup — stays
  this.effectZoneSystem.fixedUpdate(dt);  // zero-G sound
  this.stompSystem.fixedUpdate(dt);
  this.matchSystem.fixedUpdate(dt);  // crowd, ambient, match end
}
```

In `cosmeticStep()`:
```typescript
cosmeticStep(dt) {
  for (const sys of this.cosmeticSystems) sys.cosmeticUpdate(dt);
}
```

In `stop()`:
```typescript
for (const sys of [...this.gameplaySystems, ...this.cosmeticSystems]) sys.cleanup();
this.effectZoneSystem.cleanup();
this.playerCollisionSystem.cleanup();
```

- [ ] **Step 3: Remove from GameLoop**

Remove all state that's been moved to systems:
- `crowdStarted`, `activeAmbientLoops`, `periodicAmbientTimers`
- Ambient loop start/stop code from `start()`/`stop()`
- `checkMatchEnd()` private method and `endMatch()` — MatchSystem handles this (MatchSystem calls `onMatchEnd` callback directly)
- All `_bound*` callback fields that are no longer needed (systems use their own references)

- [ ] **Step 4: Remove unused imports**

Clean up gameLoop.ts imports — many submodule imports are now only used inside System classes. Remove any that have no remaining references in GameLoop.ts.

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit && npm test`

- [ ] **Step 6: Final line count check**

Run: `wc -l src/engine/gameLoop/GameLoop.ts`
Target: 600-700 lines.

- [ ] **Step 7: Commit**

```
git commit -m "refactor: create MatchSystem, wire system arrays, complete Phase 3"
```

---

## Verification

After all tasks:
1. `npx tsc -b --noEmit` — clean
2. `npm test` — all ~2069 tests pass
3. `npm run dev` — manual play on meadow, volcano, underwater, space_station, haunted_graveyard
4. Verify: springs/thorns, carrots, lava rocks, ghosts, geysers, particles, gibs, weather, wildlife, crowd cheering, match end
5. Online multiplayer: host + guest to verify network contract
