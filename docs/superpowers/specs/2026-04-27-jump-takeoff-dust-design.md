# Jump takeoff dust — design

**Date:** 2026-04-27
**Phase 3 feature:** E4 — first slice of Pillar E (polish & readability) from `2026-04-24-arena-platforms-design.md`

## Summary

A small dust puff at the player's feet when they intentionally jump. Mirrors the existing landing-dust language but is shorter, narrower, and quieter — the takeoff is a lower-energy event than the impact of a landing.

This is the first feature of Phase 3. More features (drop shadows, sunset/dawn, foliage sway, etc.) will land as separate small specs rather than one large Phase 3 push.

## Trigger

Fires only on **player-initiated jumps** — not on spring launches, geyser blasts, or any other involuntary takeoff. Springs already have their own bouncy overlay/sound; layering takeoff dust on top muddies the visual language.

The transition seam is `playerTransitions.ts` (next to the existing `cb.playSound('jump')` line). Implementation chose the **snapshot-derivable path**: at the grounded→airborne edge, a player whose `springTrailTimer` rose this tick (was 0, is now > 0) is a spring launch; otherwise it's an input jump. `springTrailTimer` is already in snapshots, so this works on guest without extra wire format. No `Player` field added, no protocol bump.

A geyser exclusion was originally proposed via `prev.vy - player.vy > 300`, but TDD surfaced that this also fires for normal jumps from rest (`JUMP_IMPULSE = -560` → delta 560 > 300, indistinguishable from geyser strength `-550`). The geyser branch was dropped: jump dust on a rare geyser launch is harmless, and the user's product choice was "input.jump only" with springs as the named exclusion.

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
PlayerTransitionSystem.cosmeticStep
        └── playerTransitions.ts: detectPlayerTransitions()
                ├── existing: wasGrounded && isAirborne → cb.playSound('jump')
                └── added: same gate + !sprangThisTick → cb.spawnJumpDustParticles(player)
                                                              │
                                                              ▼
                            ParticleSystem.spawnJumpDustParticles(player)
                                                              │
                                                              ▼
                                particles.ts: spawnJumpDustParticles()
```

`sprangThisTick = prev.springTrailTimer === 0 && player.springTrailTimer > 0` — rising edge protects against false-positives during the 0.6s spring-trail decay window (a player input-jumping with a still-decaying trail correctly gets dust).

Cosmetic-only — no gameplay impact. Runs at half-rate (~30Hz) via `tickCosmetic`. Single-tick rising-edge event, so half-rate is fine.

## Network behavior

Inherits the existing cosmeticStep architecture. Both host and guest run the trigger after their respective tick paths (host after `fixedUpdate`, guest after `applySnapshotToState`). Detection uses already-snapshotted `springTrailTimer` and `player.state` — no new wire field, no protocol bump.

## Out of scope

- **Surface-aware dust** (snow vs dirt vs metal): deferred to E3 (richer landing dust). When E3 lands and adds material variation, jump dust adopts the same material lookup.
- **Gore-mode toggle:** dust is neutral (not gore). Always on, like landing dust.
- **Performance budget:** 5 particles per jump, ~one jump per 0.5–1s per player, max 5 players → trivial against the 300-particle pool cap. No new perf work.
- **Jump-from-spring dust:** excluded via `springTrailTimer` rising edge.
- **Jump-from-geyser dust:** intentionally NOT special-cased — vy heuristic can't distinguish jumps from geysers cleanly (`JUMP_IMPULSE = -560` vs geyser strength `-550`), and the case is rare enough that puff-on-geyser is harmless.

## Testing

- **Unit:** 3 tests in `cosmeticStep.test.ts` — positive (input jump fires dust), negative (spring rising-edge suppresses), nuance (decaying spring trail still fires dust on a real input jump).
- **Snapshot:** full suite green with no snapshot regen needed (cosmeticStep is not in the audio-trace or determinism snapshots).
- **Manual:** dev-run with `?arena=meadow&bots=2`, confirm puffs appear on jump but not on spring launches.

## Followups

After this ships, candidate next features (any order):

- **D4** — Character drop shadows (low risk, big readability win)
- **B1** — Platform breathing on floating platforms
- **D1** — Sunset/dawn time-of-day phases
- **E3** — Richer landing dust with material variation (closes the loop on E4's surface-awareness deferral)

Each gets its own short spec following the same preview-first pattern.
