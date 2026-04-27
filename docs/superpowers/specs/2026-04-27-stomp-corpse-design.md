# Stomp Corpse — Design

## Problem

When a player is stomped, today's effect freezes the victim in place (`vx=0, vy=0`), forces `state='splat'`, and the renderer draws a static pancake silhouette at the frozen position for `SPLAT_DURATION = 0.4s`. If the victim was airborne at the moment of stomp, the pancake hangs in mid-air defying gravity, never animates, then disappears at respawn. It looks weird.

## Goal

Replace the frozen mid-air pancake with a flat "corpse" that physics-falls, settles, and bakes onto the static background — leaving a small trophy pile over the course of a match. **Decouple body visuals from the player's death state entirely**: respawn timing stays exactly as today; the body is a purely cosmetic gib.

## Non-goals

- No change to gameplay timing (`SPLAT_DURATION`, respawn delay, scoring).
- No change to network protocol / wire format.
- No new mechanic (the corpse is non-interactive — no collision with players or hazards beyond what existing gib physics provides).

## Design

### Architecture

The "corpse" is a new gib type, reusing the existing gib pipeline:

1. `StompSystem.handleStomp` continues to set `victim.state='splat'` and the splat timer as today. The respawn flow (`updateSplatTimers` → `respawnPlayer`) is unchanged.
2. At the moment of stomp, the StompSystem fires a new `onCorpseSpawn` event via `SimulatorEvents`. The host's GameLoop subscribes and pushes a corpse gib to `state.gibs`. The guest's `cosmeticStep` detects the same transition (`prevState !== 'splat' && curr.state === 'splat'`) and spawns its own corpse — same approach as today's stomp SFX. No snapshot field added.
3. The corpse is one item in `state.gibs` with a new `gibType: 'corpse'` discriminator. It uses the existing `updateGibs` physics (gravity, platform collision, off-screen culling) and existing bake path (`newGroundedGibsSinceRender` → `renderer.bakeGibs`).
4. The renderer's player-draw path checks: if `state==='splat'`, skip the existing `drawSplatCharacter` call. Optional brief death flash (≤0.15s) at the frozen position is fine; the corpse handles the persistent visual.

### Corpse appearance

A pre-flattened character pancake — reuse today's `drawSplatCharacter` shape (character `color` + `darkColor` shadow + simple X-eye splat outline) drawn as a single sprite-cached gib. Established silhouette in the game's visual language; reads as "deceased" at a glance.

Subtle tumble while falling (slow rotation, ≤45° amplitude). On landing thud: small dust puff (existing `puff` particle) + ~0.1s squish-stretch settle on the corpse before it freezes and bakes.

### Initial state at spawn

- **x, y:** corpse centered on victim's bounding-box center at the moment of stomp.
- **vx:** `victim.vx` (preserved) + small horizontal flick toward the attacker's stomp direction (`±60` px/s based on attacker-vs-victim x-offset). Glancing stomps punt the body sideways.
- **vy:** `+200` (downward "smashed" velocity, exaggerating the stomp direction). Strong enough that high-up stomps drop the body quickly without the cycle dragging.
- **rotationSpeed:** small randomized (`±2 rad/s`) so the tumble looks organic.

### Gore mode

| Mode | Body | Splat blood mark |
|---|---|---|
| Gore ON | Pancake corpse falls + bakes onto bg | Spawned at corpse's **landing** position when it grounds (not stomp position) |
| Gore OFF | Pancake corpse falls + bakes onto bg (flat character, no blood) | None — confetti puff at stomp moment as today |

The corpse stays in both modes — it's character silhouette, not gore. Splat marks (red blood circles) remain gore-gated.

### Splat mark relocation

Today, `createSplatMark` runs in `StompSystem.handleStomp` and is pushed to `state.splatMarks` immediately. With this design, the splat mark is deferred until the corpse grounds — fired from the same `onCorpseGrounded` cosmetic signal. Means a kill near the top of an arena leaves its bloodstain at the bottom (where the body landed). This is a visible change from today, but it's the consistent reading: blood pools where the body ends up.

### Edge cases

- **Stomped over a fall-off gap:** corpse falls offscreen, never grounds. Existing off-screen culling in `updateGibs` cleans it up. No splat mark is left behind (gore-on case). Acceptable — the kill happened over the void.
- **Stomped onto lava / thorns:** corpse passes through hazard zones (gibs already ignore hazards). No special-case sizzle SFX in v1; defer.
- **Stomped onto a moving floating platform:** corpse rides the platform once grounded. Bake fires once and the corpse is stamped at the platform's position at bake time. If the platform later moves, the baked corpse stays where it was stamped, no longer attached. Acceptable cosmetic drift; corpses on moving platforms are rare and the staleness reads as "old splat mark."
- **Match ends mid-fall:** `bakeGibs` runs from the cosmeticStep path which continues during match-over. Corpses still grounding will bake; corpses still mid-air at match-over freeze when the renderer takes over for the victory screen. Acceptable.
- **Arena switch:** bg canvas is regenerated by `Renderer.setArena`; all baked corpses wiped. No additional cleanup needed.
- **Many corpses pile up over a long match:** zero render cost (baked into bg). Memory cost is the bg canvas itself (already exists). The pile is intentional flavor — Jump'n'Bump trophy room.

### Files touched (estimate)

- `src/engine/types.ts` — extend `GibType` union with `'corpse'`; verify `Gib` has the rotation/scale fields needed (planner to confirm).
- `src/engine/simulator/types.ts` — add `onCorpseSpawn(victim, attacker)` to `SimulatorEvents`.
- `src/engine/gameLoop/gameplay/StompSystem.ts` / `stomps.ts` — fire `onCorpseSpawn`; defer splat-mark creation.
- `src/engine/gameLoop/cosmetics/gibs.ts` — extend `updateGibs` to handle corpse type (rotation + landing thud + on-ground signal).
- `src/engine/gameLoop/cosmetics/ParticleSystem.ts` — add `spawnCorpse(victim, attacker)`; on bake, fire splat-mark spawn for grounded corpses (gore-on).
- `src/engine/gameLoop/cosmetics/EntityTransitionSystem.ts` (or PlayerTransitionSystem) — guest-side: detect victim state→splat rising edge, spawn corpse client-side.
- `src/engine/rendering/players.ts` — skip `drawSplatCharacter` when `state==='splat'`.
- `src/engine/rendering/particles.ts` (or new `gibs.ts` in rendering/) — add corpse draw function (flat pancake using character colors + X-eye outline).
- `src/engine/renderer.ts` — `bakeGibs` already routes by type; extend to handle corpse.
- Tests — `stomp.test.ts` (verify gameplay state unchanged), new `corpse.test.ts` (verify corpse spawn/fall/bake lifecycle).

## Open questions resolved during brainstorming

1. **Pancake corpse vs. live-sprite ragdoll** → pancake. Live-sprite reads as "ragdolling" which conflicts with parallel respawn-elsewhere.
2. **Splat mark at stomp point vs. landing point** → landing point. The bloodstain follows the body.
3. **Network sync** → no wire-format change; spawn from cosmetic transition detection on guests, same as stomp SFX.

## Out of scope

- Corpse interaction with hazards (sizzle in lava, etc.).
- Per-character corpse art variants (use the existing splat-shape from each pack — no new art).
- Configurable max-corpses-per-match cap (none needed; bake = free).
- Corpse-stuck-to-moving-platform attachment (drift is acceptable).
