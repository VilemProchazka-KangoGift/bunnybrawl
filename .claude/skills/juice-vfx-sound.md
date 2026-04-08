# Juice, VFX & Sound Skill

Use when adding game feel: visual effects, sound effects, screen feedback (hitstop, shake, zoom), particle bursts, or pickup/impact juice.

## Sound Effects

### Adding a New Sound

1. Add name to `SoundName` union in `audio.ts` (line ~4)
2. Add `this.sounds.set('name', new Howl({ src: [generateXxxSound()], volume: N }))` in `init()`
3. Write the generator function — patterns:
   - **Simple tone**: `generateToneBuffer(freq, duration, oscType, vol, freqEnd?)` — single oscillator with envelope
   - **Noise burst** (crunch, footstep): fill buffer with `Math.random() * 2 - 1`, shape with envelope
   - **Layered** (crunch with body): combine noise + low tone + high click transient
   - **Multi-segment** (complex animal): use `generateMultiSegmentTone(segments, vol)` with `ToneSegment[]`
4. Call `audio.play('name')` in `gameLoop.ts` where needed

### Sound Design Patterns

- **Crunch/impact**: noise burst (0.6 weight) + low tone 200-400Hz (0.3) + high click 1500-2500Hz transient at start (0.4, first 5% only). Duration 0.1-0.15s. Sharp attack (10% ramp), quick decay.
- **Footstep**: very short (0.05s), noise only, fast 3x decay envelope, low volume (0.15).
- **UI blip**: `generateToneBuffer` with square wave, 0.08s, freq sweep (e.g. 440→880).
- **Impact/oof**: low freq 150→100Hz sine + noise burst at start. Duration 0.15s.

### Volume Guidelines

| Category | Volume | Examples |
|----------|--------|---------|
| UI | 0.3 | select, countdown_beep |
| Impact | 0.4-0.5 | stomp, thornhit, crunch |
| Ambient | 0.12-0.2 | ambient, waterfall, splash |
| Animal | 0.4 | all character sounds |
| Footstep | 0.15 | footstep_grass, footstep_wood |

## Visual Effects

### Particle Burst (Short-Lived)

Use `this.emitParticle(x, y, vx, vy, life, size, color)` — pooled via free-list, auto-cleaned.
- Good for: instant feedback, sparkles, confetti, dust
- Life: 0.2-0.6s typical
- Affected by gravity (vy increases over time)
- Off-screen culled automatically

### Gib-Style Debris (Persistent)

Use `this.launchGib(cx, cy, spread, angleMin, angleMax, speedMin, speedMax, w, h, color, darkColor, lightColor, characterName, gibType)` for pieces that bounce off platforms and settle on the ground.
- Good for: destruction debris, food chunks, any "stuff flies out and lands"
- `gibType: 'body'` renders as generic colored ellipse — no need for new types for simple colored chunks
- `characterName: ''` (empty string) for non-character gibs
- Pieces bounce once (0.3 velocity retention), then settle permanently on the platform
- Settled gibs are baked to the background canvas (persist for the match)
- Automatically interact with effect zones (zero-G, geysers, currents)
- Launch angles: 0.15-0.85 (upward fan), speeds vary by weight/drama

### Combining Both for Maximum Juice

Best pickup/impact effects layer BOTH systems:
1. **Gib debris** (4-6 pieces) — persistent ground litter, satisfying physics
2. **Particle burst** (12-20 particles) — instant flash of color, fades quickly
3. **Upward sparkle ring** (6-8 particles) — gold/white, signals "got something good"

Example (carrot pickup):
```ts
// Gibs: 4 orange chunks + 2 green leaf pieces
for (let i = 0; i < 4; i++) {
  const s = 4 + Math.random() * 3;
  this.launchGib(cx, cy, 10, 0.15, 0.85, 80, 200, s, s,
    '#FF8C00', '#CC6600', '#FFB040', '', 'body');
}
for (let i = 0; i < 2; i++) {
  this.launchGib(cx, cy, 8, 0.2, 0.8, 60, 160, 5, 3,
    '#4CAF50', '#2E7D32', '#81C784', '', 'body');
}
// Particles: 16 burst + 8 sparkle ring
for (let i = 0; i < 16; i++) { ... emitParticle ... }
for (let i = 0; i < 8; i++) { ... emitParticle upward ... }
```

### Gib Launch Parameters Guide

| Param | Meaning | Light (pickup) | Heavy (kill) |
|-------|---------|----------------|--------------|
| spread | Random offset from center | 8-12 | 20-30 |
| angleMin/Max | Launch arc (0-1, in π) | 0.15-0.85 | 0.05-0.95 |
| speedMin/Max | Launch velocity px/s | 60-200 | 120-350 |
| w, h | Piece size px | 3-7 | 6-14 |

## Screen Feedback (Hitstop, Shake, Zoom)

### Hitstop

Freezes player physics for a brief moment on impactful events. Two components:
- **Per-player freeze**: `player.hitstopTimer = HITSTOP_DURATION` — that player's physics skip in `fixedUpdate`
- **Camera zoom punch**: `this.state.hitstopZoom = HITSTOP_DURATION` — slight zoom-in that eases out

Full kill hitstop: `HITSTOP_DURATION` (0.12s, ~7 frames). Applied to both attacker and victim.

**Scaling hitstop for lighter events**: use a fraction of `HITSTOP_DURATION`:
- Kill: `HITSTOP_DURATION` (1.0x) — full freeze, both players
- Pickup: `HITSTOP_DURATION * 0.5` (~3-4 frames) — just the eating player + camera zoom
- Light hit: `HITSTOP_DURATION * 0.3` — barely perceptible pause

Always apply to both `player.hitstopTimer` AND `this.state.hitstopZoom` for the combined feel. Use `Math.max()` to avoid shortening an existing longer hitstop:
```ts
player.hitstopTimer = Math.max(player.hitstopTimer, HITSTOP_DURATION * 0.5);
this.state.hitstopZoom = HITSTOP_DURATION * 0.5;
```

### Screen Shake

`this.state.screenShake = SCREEN_SHAKE_DURATION` — camera jitters. Used for kills. Decays in `loop()`.

### Slow Motion

`this.state.slowMotion = SLOW_MO_DURATION` — time scale reduction. Used for dramatic kills (multi-kills, streaks).

## Layering Feedback for Different Events

| Event | Particles | Gibs | Hitstop | Shake | Sound |
|-------|-----------|------|---------|-------|-------|
| Kill (stomp) | Blood/confetti | Body parts + chunks | Full (both players) | Yes | stomp + animal |
| Carrot pickup | 16 burst + 8 sparkle | 4 orange + 2 green | Half (eater only) | No | crunch + animal |
| Thorn hit | Red flash particles | No | No | No | thornhit |
| Spring bounce | No | No | No | No | (spring sound) |

## Key Gotchas

- **Gibs are NOT gore-gated** — `updateGibs()` and `drawGibs()` process all gibs regardless of gore mode. Only the character body-part spawning in `spawnGibs()` is gore-gated. Non-gore gibs (carrot chunks) always appear.
- **emitParticle uses a pool** — never `this.particles.push({...})` directly. Always use `this.emitParticle()`.
- **Hitstop timer uses `Math.max()`** — don't overwrite a longer existing hitstop with a shorter one.
- **`HITSTOP_DURATION` is imported from constants** — already available in gameLoop.ts. Don't hardcode frame counts.
- **Sound volume stacking** — if multiple sounds play on same frame (e.g. crunch + animal), keep individual volumes moderate (0.3-0.4) to avoid clipping.
