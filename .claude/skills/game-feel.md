# Game Feel / Juice Skill

Use when adding visual effects, screen effects, hit feedback, or "juice" to make gameplay feel more satisfying.

## Per-Player vs Global Effects

Carrot Royale supports up to 10 concurrent players. Effects that freeze or slow physics must be **per-player**, not global, to avoid disrupting uninvolved players.

| Effect scope | When to use | Example |
|-------------|-------------|---------|
| **Per-player** (`Player.xxxTimer`) | Affects movement/physics of specific players | Hitstop, slow, stun, burn |
| **Global** (`MatchState.xxx`) | Camera/screen effects visible to everyone | Screen shake, zoom, flash, slow-mo |

**Hitstop pattern**: Per-player `hitstopTimer` freezes only attacker+victim. Global `hitstopZoom` triggers camera zoom for everyone. Both set on the same kill event.

## Hitstop Implementation Pattern

The hitstop system freezes individual players while the rest of the game continues:

1. **Animation timer loop** (gameLoop.ts ~1067): `if (player.hitstopTimer > 0) { decay; continue; }` — skips animFrame advance so the player appears frozen
2. **Input + physics loop** (gameLoop.ts ~1104): `if (player.hitstopTimer > 0) continue;` — skips input, gravity, movement, collision
3. **Visual timers still tick during hitstop**: `damageFlashTimer` and `burnTimer` decay so overlay effects fade naturally
4. **Camera zoom** is global on `MatchState.hitstopZoom`, decayed in `loop()` real-time block

### Multi-kill handling

Use `Math.max(player.hitstopTimer, HITSTOP_DURATION)` — never `+=`. Stacking hitstop feels sluggish and broken. A double-kill should produce one clean pause, not 14 frames of freeze.

### Respawn reset

`respawnPlayer()` in `stomp.ts` must reset `hitstopTimer = 0`. Any new per-player timer added to the hitstop/freeze family must also be reset there.

## Tuning Lessons

### Duration
- **0.067s (4 frames)**: Too subtle — players didn't notice the effect at all
- **0.12s (7 frames)**: Noticeable and punchy without feeling like lag. Current sweet spot.
- **0.2s+ (12+ frames)**: Would feel like a stutter or bug in a fast-paced party game

### Zoom punch
- **1.5%**: Imperceptible during fast gameplay
- **3%**: Clearly visible, sells impact. Current value.
- **5%+**: Would feel disorienting with frequent kills

### White flash on victim
- Flash the **splat shape**, not the standing character bounds — victim is already a pancake by the time the flash renders
- Use the splat ellipse dimensions: `ctx.ellipse(cx, y + height - 4, width * 0.6, 6, ...)` matching `drawSplatCharacter`
- Alpha 0.85 → 0 over the hitstop duration for a clean fade

## Adding New Per-Player Effects

When adding a new per-player timer that gates physics:

1. Add field to `Player` interface in `types.ts`
2. Init to 0 in `gameLoop.ts` player construction (~line 132)
3. Gate in animation timer loop AND input+physics loop
4. Reset in `respawnPlayer()` in `stomp.ts`
5. Update `makePlayer()` in ALL test files:
   - `physics.test.ts`
   - `stomp.test.ts`
   - `ai/__tests__/aiController.test.ts`

## Adding New Global Screen Effects

When adding a new global screen effect timer:

1. Add field to `MatchState` interface in `types.ts`
2. Init to 0 in `gameLoop.ts` MatchState construction (~line 217)
3. Decay in `loop()` real-time timer block (not in `fixedUpdate` — real-time timers survive matchOver)
4. Render in `renderer.ts` `renderFrame()` — apply before screen shake for transform effects, after everything for overlays
5. Update `makeState()` in `ai/__tests__/aiController.test.ts`
6. Import constants in both `gameLoop.ts` and `renderer.ts`

## Screen Effect Layering Order

Applied in `renderFrame()` from first to last:

1. **Zoom punch** (`hitstopZoom`) — canvas scale transform, before shake
2. **Screen shake** (`screenShake`) — canvas translate, random offset
3. _(all game content renders here)_
4. **Screen flash** (`screenFlash`) — white overlay, drawn last

Transform effects (zoom, shake) are applied early via `ctx.translate/scale` so they affect all content. Overlay effects (flash) are drawn last so they sit on top.

## Easing Functions for Effects

- **Zoom punch**: Quadratic ease-out (`t * t` where t goes 1→0) — snaps in hard, relaxes slowly
- **Screen shake**: Linear decay with random noise — chaotic vibration that fades
- **Screen flash**: Linear alpha decay — clean uniform fade
- **Shockwave**: Linear radius expansion — constant growth speed

## Constants Location

All effect duration/intensity constants live in `constants.ts` under the `// Screen effects` section. Keep them there for easy tuning:

```
SCREEN_SHAKE_DURATION, SCREEN_SHAKE_INTENSITY
SLOW_MO_DURATION, SLOW_MO_FACTOR
HITSTOP_DURATION, HITSTOP_ZOOM
SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION
SCREEN_FLASH_DURATION
```
