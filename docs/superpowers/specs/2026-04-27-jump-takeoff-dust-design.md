# Jump takeoff dust — design

**Date:** 2026-04-27
**Phase 3 feature:** E4 — first slice of Pillar E (polish & readability) from `2026-04-24-arena-platforms-design.md`

## Summary

A small dust puff at the player's feet when they intentionally jump. Mirrors the existing landing-dust language but is shorter, narrower, and quieter — the takeoff is a lower-energy event than the impact of a landing.

This is the first feature of Phase 3. More features (drop shadows, sunset/dawn, foliage sway, etc.) will land as separate small specs rather than one large Phase 3 push.

## Trigger

Fires only on **player-initiated jumps** — not on spring launches, geyser blasts, or any other involuntary takeoff. Springs already have their own bouncy overlay/sound; layering takeoff dust on top muddies the visual language.

The transition seam is `playerTransitions.ts` (next to the existing `cb.playSound('jump')` line). Two implementation paths, decide in plan:

- **Flag path:** physics sets a transient `Player.jumpedThisTick` boolean when `input.jump` causes a jump. Transition detection reads it. Cleared per-tick. Not in network snapshots — guests detect via the alternate path below.
- **Snapshot-derivable path:** at the grounded→airborne edge, a player whose `bounceTimer` rose this tick (was 0, is now > 0) is a spring launch; otherwise it's an input jump. `bounceTimer` is already in snapshots, so this works on guest without extra wire format.

A combined approach is fine: flag on host, derived check on guest. Plan picks the cleanest unified mechanism.

## Visual parameters

Approved values (from interactive preview):

| Parameter | Value | Notes |
|---|---|---|
| Count | 5 particles | vs 8–26 for landing |
| Spread | `± 0.2 × player.width` | narrower than landing's `± 0.75 × w` |
| Outward vx | `(rand-0.5) × 160` | gentler than landing |
| Up vy | `-rand × 70 - 30` (range `-30` to `-100`) | brief upward arc |
| Life | `0.35s × (0.7 + rand × 0.3)` | shorter than landing's 0.3–0.7s |
| Size | `1.5 + rand × 1.5` (1.5–3px) | smaller than landing's 2–14px |
| Color | `#C8B896` | matches landing dust palette |

The particle pool's existing gravity decay applies — the upward arc settles back toward the ground as the player rises, framing the takeoff as "left something behind".

## Architecture

```
physics.ts (sets transient jumpedThisTick on input.jump grounded→airborne)
        │
        ▼
Simulator.fixedUpdate (existing flow)
        │
        ▼
PlayerTransitionSystem.cosmeticStep
        └── playerTransitions.ts: detectPlayerTransitions()
                ├── existing: wasGrounded && isAirborne → cb.playSound('jump')
                └── NEW: same gate + isInputJump → cb.spawnJumpDustParticles(player)
                                                       │
                                                       ▼
                            ParticleSystem.spawnJumpDustParticles(player)
                                                       │
                                                       ▼
                                particles.ts: spawnJumpDustParticles()
                                  (new pure function alongside spawnDustParticles)
```

Cosmetic-only — no gameplay impact. Runs at half-rate (~30Hz) via `tickCosmetic`. Single-tick rising-edge event, so half-rate is fine.

## Network behavior

Inherits the existing cosmeticStep architecture:

- **Host:** runs full path, sees its own input flag.
- **Guest:** detects via the bounceTimer rising-edge rule on snapshot prev/curr comparison. No new wire format, no protocol bump.

## Out of scope

- **Surface-aware dust** (snow vs dirt vs metal): deferred to E3 (richer landing dust). When E3 lands and adds material variation, jump dust adopts the same material lookup.
- **Gore-mode toggle:** dust is neutral (not gore). Always on, like landing dust.
- **Performance budget:** 5 particles per jump, ~one jump per 0.5–1s per player, max 5 players → trivial against the 300-particle pool cap. No new perf work.
- **Jump-from-trampoline / spring / geyser dust:** explicitly excluded per Q1.

## Testing

- **Unit:** add a transition test in `playerTransitions.test.ts` mirroring the existing landing-dust test — verify `cb.spawnJumpDustParticles` is called on grounded→airborne when input-jump path, and NOT called on spring launch.
- **Snapshot:** run the full suite to confirm no regression in audio-trace or determinism snapshots (the current branch already has 3 modified snapshot files; new transitions may add lines — review carefully).
- **Manual:** dev-run with `?arena=meadow&bots=2`, confirm puffs appear on jump but not on spring landings.

## Open implementation questions for the plan

These are deferred to `writing-plans`:

1. Flag-path vs snapshot-derived-only: pick one mechanism for both host and guest, or use the host-flag/guest-derived split. The unified approach is simpler to reason about; the split is one less field on `Player`.
2. Whether `Player.jumpedThisTick` (if used) needs initialization in `testHelpers.ts`'s `makePlayer()` and the various mock players.
3. Where to clear the transient flag: end of physics, end of fixedUpdate, or start of next tick.

## Followups

After this ships, candidate next features (any order):

- **D4** — Character drop shadows (low risk, big readability win)
- **B1** — Platform breathing on floating platforms
- **D1** — Sunset/dawn time-of-day phases
- **E3** — Richer landing dust with material variation (closes the loop on E4's surface-awareness deferral)

Each gets its own short spec following the same preview-first pattern.
