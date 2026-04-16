# Shared CosmeticStep — Unifying Host and Guest Cosmetic Code

## Problem

The guest's online experience reimplements cosmetic logic that the host runs inside `fixedUpdate()`. This creates two parallel codebases:

| Guest reimplementation | Host original | Lines |
|---|---|---|
| `GuestSFX` class | Inline `playSound()` calls in fixedUpdate | ~130 vs ~28 calls |
| Guest loop timer decay | Timer decay in fixedUpdate | ~10 vs ~12 lines |
| `tickEnvironment()` | Wildlife/fog/pollen in fixedUpdate | ~40 vs ~50 lines |
| Afterimage generation in guest loop | Afterimage logic in fixedUpdate | ~12 vs ~22 lines |
| Shockwave generation in guestSfx | Shockwave push in fixedUpdate | ~6 vs ~7 lines |
| Footstep reimplementation in guestSfx | Footstep accumulators in fixedUpdate | ~12 vs ~18 lines |

When new effects are added to fixedUpdate, they must also be added to the guest code. This has already caused bugs (missing gibs, missing footsteps, frozen wildlife, missing shockwaves, wrong footstep frequency).

## Solution

A new `cosmeticStep(dt)` method on `GameLoop` that handles ALL cosmetic logic. Both host and guest call it. No duplication.

### Architecture

**Host flow:**
```
fixedUpdate(dt, inputs)  // physics, collision, scoring ONLY
cosmeticStep(dt)         // sounds, particles, VFX, environment
```

**Guest flow:**
```
applySnapshot(snap)      // host state applied
cosmeticStep(dt)         // SAME cosmetic code as host
inputEcho.apply(...)     // visual echo (guest-only, stays)
```

### CosmeticStep responsibilities

#### 1. State transition detection

Stores `prevPlayers: Map<PlayerSlot, PrevPlayerState>` with fields:
- `state`, `vx`, `vy`, `score`, `sideSquash`, `burnTimer`, `fastFalling`, `invincibleTimer`

Each call compares current to previous and detects:

| Transition | Detection | Effect |
|---|---|---|
| Jump | prev.state grounded, now airborne | `jump` sound, squash stretch |
| Landing | prev.state airborne, now grounded | `land` sound (if prevVy > threshold), dust particles, squash |
| Fast-fall start | prev.fastFalling=false, now true | `fastfall` sound |
| Stomp (victim) | prev.state alive, now splat | `stomp` sound, animal sound, gibs, shockwave, kill splatter |
| Headbonk | prev.vy < -10, now vy=0, still airborne | `headbonk` sound, impact dust |
| Wall hit | abs(prev.vx) > 100, now vx=0 | `oof` sound, impact dust, squash |
| Respawn | prev.state respawning, now idle | `land` sound |
| Push bump | sideSquash === 0.8 (collision marker) | `bump` sound |
| Burn start | prev.burnTimer=0, now >0 | `oof` sound |
| Geyser launch | prev.vy - vy > 300 | `geyser` sound |
| Carrot pickup | carrot was active, now inactive | `crunch` sound, animal sound, carrot VFX, score animation |
| Spring bounce | spring bounceTimer was 0, now >0 | `spring` sound, set springTrailTimer on nearest player |
| Thorn hit | thorn.hit was false, now true | `thornhit` sound |
| Countdown tick | ceil(countdown) decreased | `countdown_beep` / `countdown_go` sound |
| Match over | matchOver was false, now true | `victory` sound |
| Score change | player.score increased | Score animation popup |

#### 2. Per-tick cosmetic systems

These run every call regardless of transitions:

- **Squash/stretch decay**: `squashTimer`, `squashScale` lerp toward 1.0, `sideSquash` decay
- **Expression updates**: dizzy (invincible), scared (fast fall), angry (enemy nearby)
- **Idle animation timer**: advance when idle, reset otherwise
- **Afterimage management**: spawn from velocity, alpha decay, removal
- **Footstep accumulators**: speed-scaled interval, surface detection (grass/wood)
- **SFX cooldowns**: land, headbonk, crouch, bump cooldown timers
- **Visual timer decay**: damageFlashTimer, hitstopTimer, springTrailTimer
- **Fire particles**: emit while burnTimer > 0

#### 3. Environment systems

- **Wildlife**: butterfly/bird position + wing animation
- **Fog particles**: horizontal drift + wrap
- **Pollen particles**: drift + vertical wrap
- **Shooting stars**: spawn (night phase) + position + life decay
- **Shockwave decay**: radius growth + life countdown
- **Score animation decay**: timer countdown + removal
- **Bouncy wobble decay**: Map timer decay

#### 4. Ambient sound management

- **Crowd cheering**: volume ramp near kill limit
- **Periodic ambient**: random interval one-shots from arena config
- **Zero-G loop**: start/stop based on player zone occupancy

### What gets removed from fixedUpdate

All 28 `this.playSound()` calls and their surrounding cosmetic code. All particle spawns triggered by game events. All afterimage/shockwave/scoreAnimation creation. All environment updates (wildlife, fog, pollen, shooting stars). All cosmetic timer management (squash, idle, footstep, SFX cooldowns).

What STAYS in fixedUpdate: physics, collision, stomps, scoring, entity spawning/despawning, timer decrements that affect gameplay (invincibleTimer for stomp immunity, splatTimer for respawn timing, fatTimer for size change physics, etc.).

### Borderline cases

| Field | Simulation or Cosmetic? | Decision |
|---|---|---|
| `screenShake` | In snapshot, affects rendering | **Simulation** sets it, **cosmetic** decays it. Set by fixedUpdate on stomp/collision, decay in cosmeticStep. |
| `slowMotion` | In snapshot, affects rendering | Same pattern as screenShake. |
| `screenFlash` | In snapshot, affects rendering | Same pattern. |
| `hitstopZoom` | In snapshot, affects rendering | Same pattern. |
| `squashScale` | In snapshot, visual only | **Cosmetic**. Set and decayed entirely in cosmeticStep. |
| `damageFlashTimer` | In snapshot, visual only | **Cosmetic**. Set and decayed in cosmeticStep. |
| `expression` | In snapshot, visual only | **Cosmetic**. Set in cosmeticStep based on state. |
| `animFrame` | In snapshot, visual only | **Cosmetic**. Advanced in cosmeticStep run cycle. |

For screen effects (shake, flash, zoom, slowMotion): fixedUpdate sets the initial value on events (stomp, collision), cosmeticStep decays them. On the guest, the snapshot brings the set value, and cosmeticStep decays it locally for smooth rendering. This matches the current timer decay pattern.

### What stays guest-only

- `InputEcho` — local input to visual feedback, fundamentally client-side
- `applySnapshotToState()` — network state application
- Stall detection / reconnection — network concern
- Input sending — network concern

### What gets deleted

- `src/engine/net/guestSfx.ts` — entire file
- `src/engine/net/guestSfx.test.ts` — entire file
- Guest loop timer decay block in `netMatch.ts`
- Guest loop afterimage/shockwave generation in `netMatch.ts`
- `tickEnvironment()` private method in gameLoop.ts
- `tickCosmetics()` method — replaced by `cosmeticStep()`
- Guest-specific `spawnStompVfxPublic`, `spawnGibsPublic`, `spawnDustPublic`, `spawnCarrotVfxPublic` — cosmeticStep calls the private methods directly

### File changes

| File | Change |
|---|---|
| `src/engine/gameLoop.ts` | Add `cosmeticStep(dt)`, remove cosmetic code from `fixedUpdate()`, remove `tickCosmetics()`, `tickEnvironment()`, public VFX methods |
| `src/engine/net/netMatch.ts` | Guest loop: replace GuestSFX + timer decay + afterimage gen + tickCosmetics with single `cosmeticStep(dt)` call. Host loop: add `cosmeticStep(dt)` after fixedUpdate. |
| `src/engine/net/guestSfx.ts` | Delete |
| `src/engine/net/guestSfx.test.ts` | Delete |
| `src/engine/net/index.ts` | Remove GuestSFX export |
| `src/engine/gameLoop.test.ts` | Update tests for new cosmeticStep |

### Testing strategy

- Existing unit tests for gameLoop must pass (simulation behavior unchanged)
- New unit tests for cosmeticStep: transition detection for each event type
- Manual test: host local play — all sounds, particles, effects identical to before
- Manual test: guest online play — all sounds, particles, effects match host
- Manual test: `?noecho` — verify cosmeticStep works without InputEcho

### Risk mitigation

- The refactor is large (~200 lines moved from fixedUpdate to cosmeticStep)
- Commit the extraction in small steps: environment first, then timer systems, then event triggers
- Run tests after each step
- Keep a rollback point before starting
