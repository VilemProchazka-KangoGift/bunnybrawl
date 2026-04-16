# GameLoop Phase 3: System Object Refactor

## Goal

Convert the 16 pure-function submodules extracted in Phases 1-2 into System classes that own their state. GameLoop becomes a thin orchestrator that iterates `gameplaySystems` and `cosmeticSystems` arrays, delegating to `fixedUpdate(dt)` / `cosmeticUpdate(dt)` / `init()` / `cleanup()` methods.

Target: gameLoop.ts drops from ~1,232 lines to ~600-700 lines by moving state ownership (Maps, arrays, caches, flags) from GameLoop fields into the System classes that actually use them.

## Interfaces

```typescript
// src/engine/gameLoop/types.ts (NEW)

interface GameplaySystem {
  init(state: MatchState): void;
  fixedUpdate(dt: number): void;
  cleanup(): void;
}

interface CosmeticSystem {
  init(state: MatchState): void;
  cosmeticUpdate(dt: number): void;
  cleanup(): void;
}
```

Both interfaces follow the same lifecycle: `init()` at match start (called from `GameLoop.start()`), `update()` every tick/frame, `cleanup()` at match end (called from `GameLoop.stop()`).

Systems receive shared state (MatchState, Arena, ThemeConfig, MatchSettings) via constructor and hold references. No context objects, no event bus.

## System Inventory

### Gameplay Systems (called from fixedUpdate in order)

**1. HazardSystem** — owns: `floatingPlatforms` cache
- `init`: compute floatingPlatforms from arena
- `fixedUpdate`: tick spawn timers, call spawnSpring/spawnThorn, update hazard lifetimes
- `cleanup`: no-op
- Absorbs: `hazards.ts` functions + the spawn timer management currently in fixedUpdate

**2. CarrotSystem** — owns: nothing extra (timer is on MatchState)
- `fixedUpdate`: tick carrot timer, call spawnCarrot, spawn VFX on new carrot
- Needs: reference to ParticleSystem for spawnCarrotVFX (or receives it via constructor)
- Absorbs: `carrots.ts` + the carrot timer block + carrot VFX emission

**3. ArenaEntitySystem** — owns: `cachedGeyserZones`, `geyserIndexMap`
- `init`: compute cached zone arrays from arena
- `fixedUpdate`: updateLavaRocks, updateGhosts, updateGeyserTimers, updatePigeonFlocks
- Absorbs: `arenaEntities.ts`

**4. EffectZoneSystem** — owns: `cachedZeroGZones`, `zeroGSoundPlaying`
- `init`: compute cachedZeroGZones from arena
- `applyToPlayer(player, justLanded, wasAirborne, prevVy, dt)`: per-player effect zone interactions (called from GameLoop's player loop)
- `fixedUpdate`: updateZeroGSound (post-loop)
- Absorbs: `effectZones.ts`

**5. PlayerCollisionSystem** — owns: nothing (stateless, but holds ParticleSystem reference for VFX)
- `checkCollisions(player)`: run 6 collision handlers + emit VFX via ParticleSystem (called from GameLoop's player loop)
- `fixedUpdate`: no-op (all work is per-player via checkCollisions)
- Needs: reference to ParticleSystem for collision VFX emission
- Absorbs: `playerCollisions.ts` + `applyHazardHitVFX` from GameLoop

Note: Systems 4 and 5 have per-player methods called from inside GameLoop's player loop. Their `fixedUpdate()` handles only post-loop work. GameLoop holds direct references to these systems to call their per-player methods.

**6. StompSystem** — owns: nothing (stateless)
- `fixedUpdate`: processStompsAndCollisions
- Absorbs: `stomps.ts`

**7. MatchSystem** — owns: `crowdStarted`, `periodicAmbientTimers`, `activeAmbientLoops`
- `init`: start ambient loops, init periodic timers
- `fixedUpdate`: updateCrowdCheering, tickPeriodicAmbient, checkMatchEnd
- `cleanup`: stop ambient loops
- Absorbs: `match.ts` + `sfx.ts` crowd/ambient functions + ambient loop lifecycle from start()/stop()

### Cosmetic Systems (called from cosmeticStep in order)

**8. PlayerTransitionSystem** — owns: `prevCosmeticState` Map, `sfxCooldowns` Map
- `init`: populate prevCosmeticState for all players
- `cosmeticUpdate`: per-player SFX cooldown decay, transition detection, cosmetic timer decay
- Absorbs: `playerTransitions.ts` + `sfx.ts` cooldown functions + the per-player transition block

**9. PlayerCosmeticSystem** — owns: `afterimageAccumulators`, `footstepAccumulators`
- `cosmeticUpdate`: per-player animation, fire particles, afterimages, footsteps, expressions, squash decay
- Needs: reference to ParticleSystem for fire particle emission
- Absorbs: `playerCosmetics.ts`

**10. EntityTransitionSystem** — owns: `prevEntityState`
- `init`: populate prevEntityState
- `cosmeticUpdate`: detectEntityTransitions
- Absorbs: `entityTransitions.ts`

**11. ParticleSystem** — owns: `particles[]`, `particleFreeList[]`, `newBloodDripsSinceRender[]`, `newGroundedGibsSinceRender[]`, `fireworkTimer`
- `init`: no-op (arrays start empty)
- `cosmeticUpdate`: updateWeather, updateParticles, updateGibs, updateConfetti
- `cleanup`: no-op
- Provides: `emitParticle()`, `spawnDustParticles()`, `spawnGoreParticles()`, `spawnConfetti()`, `spawnCarrotVFX()`, `spawnFirework()`, `launchGib()`, `spawnGibs()`, `spawnKillSplatter()`, `pickupCarrotVFX()`
- Absorbs: `particles.ts` + `gibs.ts` + the orchestration glue (spawnKillSplatter, pickupCarrotVFX) currently in GameLoop
- Note: other systems call methods on ParticleSystem directly (e.g. `this.particleSystem.emitParticle(...)`)

**12. EnvironmentSystem** — owns: nothing (reads state arrays)
- `cosmeticUpdate`: updateWildlife, updateFog, updatePollen, updateShootingStars, updateShockwaves, updateScoreAnimations, updateBouncyWobble, updatePigeonScatterParticles
- Absorbs: `environment.ts`

## Cross-System References

Some systems need to call methods on other systems:
- **CarrotSystem** → ParticleSystem (spawnCarrotVFX on new carrot)
- **PlayerCollisionSystem** → ParticleSystem (collision VFX via emitParticle)
- **PlayerCosmeticSystem** → ParticleSystem (fire particles via emitParticle)
- **PlayerTransitionSystem** → ParticleSystem (spawnDustParticles, spawnKillSplatter, pickupCarrotVFX)

These are constructor-injected references. ParticleSystem is created first, then passed to systems that need it.

## GameLoop After Refactor (~600-700 lines)

```typescript
class GameLoop {
  // Core references
  private state: MatchState;
  private arena: Arena;
  private settings: MatchSettings;
  private renderer: Renderer;
  private input: InputManager;
  
  // System arrays
  private gameplaySystems: GameplaySystem[];
  private cosmeticSystems: CosmeticSystem[];
  
  // Direct system references (for per-player calls)
  private effectZoneSystem: EffectZoneSystem;
  private particleSystem: ParticleSystem;
  
  // Physics config
  private effGravity, effFriction, effWalkSpeed, effJumpImpulse, effMaxFallSpeed: number;
  
  // Timing
  private lastTime, accumulator, rafId: number;
  private running, stopped, paused: boolean;
  
  // Network
  private _networkMode, _audioEnabled, _resimulating: boolean;
  private _networkInputs?: Map<string, InputState>;
  
  // AI + Input
  private aiControllers: Map<string, AIController>;
  private touchInput: TouchInputManager | null;
  private touchSlot: PlayerSlot | null;
  
  constructor(...) {
    // Build state, create systems, wire cross-references
  }
  
  start() {
    for (const sys of [...this.gameplaySystems, ...this.cosmeticSystems]) sys.init(this.state);
    // ... input attach, RAF start ...
  }
  
  fixedUpdate(dt) {
    // countdown, day/night, status timer decay (stays — per-player loop)
    // per-player physics loop (stays — core orchestration)
    for (const sys of this.gameplaySystems) sys.fixedUpdate(dt);
  }
  
  cosmeticStep(dt) {
    for (const sys of this.cosmeticSystems) sys.cosmeticUpdate(dt);
  }
  
  stop() {
    for (const sys of [...this.gameplaySystems, ...this.cosmeticSystems]) sys.cleanup();
    // ... input detach, RAF cancel ...
  }
}
```

### What stays in GameLoop

- Constructor (player creation, AI setup, physics config — shrinks since system init moves out)
- `start()` / `stop()` / `pause()` / `resume()` (calls sys.init/cleanup)
- `loop()` — RAF callback with accumulator
- Per-player physics loop in `fixedUpdate()` — input, gravity, movement, collision, squash/stretch, stats, angry expression (~180 lines of irreducible orchestration)
- `renderFrame()` — delegates to renderer
- Network accessors (setRng, setNetworkMode, etc.)
- State accessors (getState, etc.)

### What moves OUT of GameLoop

- All Map/array state: particles, particleFreeList, afterimageAccs, footstepAccs, sfxCooldowns, prevCosmeticState, prevEntityState, floatingPlatforms, cachedGeyserZones, cachedZeroGZones, geyserIndexMap, crowdStarted, zeroGSoundPlaying, activeAmbientLoops, periodicAmbientTimers, newBloodDrips, newGroundedGibs, fireworkTimer
- applyHazardHitVFX method
- spawnKillSplatter, pickupCarrotVFX orchestration
- All `_bound*` callback fields (systems call their own methods directly)
- The _transitionCallbacks object

## Existing Pure Function Modules

The `.ts` files in `cosmetics/` and `gameplay/` that currently export pure functions will be **consumed by** the System classes, not replaced. Each System class imports the functions it needs and calls them from its methods. The pure functions remain testable independently.

## File Structure After Phase 3

```
src/engine/gameLoop/
  types.ts                   (NEW — GameplaySystem + CosmeticSystem interfaces)
  GameLoop.ts                (RENAMED from ../gameLoop.ts, ~600-700 lines)
  index.ts                   (barrel — exports GameLoop + types)
  cosmetics/
    particles.ts             (unchanged — pure functions)
    gibs.ts                  (unchanged — pure functions)
    environment.ts           (unchanged — pure functions)
    sfx.ts                   (unchanged — pure functions)
    entityTransitions.ts     (unchanged — pure functions)
    playerTransitions.ts     (unchanged — pure functions)
    playerCosmetics.ts       (unchanged — pure functions)
    ParticleSystem.ts        (NEW — class, owns particle/gib state)
    PlayerTransitionSystem.ts (NEW — class, owns prevCosmeticState + sfxCooldowns)
    PlayerCosmeticSystem.ts  (NEW — class, owns afterimage/footstep accumulators)
    EntityTransitionSystem.ts (NEW — class, owns prevEntityState)
    EnvironmentSystem.ts     (NEW — class, thin wrapper)
    index.ts                 (updated barrel)
  gameplay/
    hazards.ts               (unchanged — pure functions)
    carrots.ts               (unchanged — pure functions)
    arenaEntities.ts         (unchanged — pure functions)
    effectZones.ts           (unchanged — pure functions)
    playerCollisions.ts      (unchanged — pure functions)
    stomps.ts                (unchanged — pure functions)
    match.ts                 (unchanged — pure functions)
    HazardSystem.ts          (NEW — class, owns floatingPlatforms)
    CarrotSystem.ts          (NEW — class)
    ArenaEntitySystem.ts     (NEW — class, owns cached zones)
    EffectZoneSystem.ts      (NEW — class, owns zeroG state)
    PlayerCollisionSystem.ts (NEW — class, owns applyHazardHitVFX)
    StompSystem.ts           (NEW — class, thin wrapper)
    MatchSystem.ts           (NEW — class, owns ambient/crowd state)
    index.ts                 (updated barrel)
```

## Testing

- All existing tests continue to pass (pure function modules unchanged)
- System classes are testable by constructing with mock MatchState/Arena
- GameLoop integration tested via existing E2E tests + manual play
- No new test files required for Phase 3 (systems delegate to already-tested pure functions)

## Migration Strategy

Convert one system at a time. Each step:
1. Create the System class file
2. Move state fields from GameLoop → System constructor
3. Replace GameLoop inline code with system method calls
4. Wire system into gameplaySystems/cosmeticSystems array
5. Verify tsc + tests pass
6. Commit

Order: start with the simplest systems (EnvironmentSystem, EntityTransitionSystem, StompSystem) and build toward the most complex (ParticleSystem, PlayerCollisionSystem).
