# Thorn hit comparisons

Scripted comparison using all 19 actual plush character atlases, current briar artwork and Meadow backdrop. This is a visual study, not a simulator or audio replay. All variants approach the same thorn and slow their travel at contact.

Current response includes the source formulas for five-second opacity/red pulse, 150 ms scene shake, 180 ms flash, 18 blood streaks, 14 wood shards and one drip. Particle directions are deterministic representative samples rather than a recording of runtime RNG. The game also applies hitstop and plays thornhit sound; those are not replayed here.

- Short flinch: five-pixel backward pose displacement, two-pixel lift and small body lean, smoothly recovering over 280 ms.
- Thorn burst: seven cream-and-ink barb accents around the foot contact, clearing in 280 ms.
- Brief shake: two damped body oscillations over 300 ms, affecting only the hit character.

Alternatives replace the current red tint, blood/wood spray and global flash/shake in this comparison. All keep the illustrated post-contact slowdown. Actual slow-state persistence will be considered with the selected effect. No runtime behavior changed yet.

Build: node docs/mockups/thorn-hit/build-study.mjs [absolute-inline-fragment-path]. Verify: node docs/mockups/thorn-hit/verify.mjs.

Revision: first alternatives were rejected as too subtle. Pain jolt now combines a 13-pixel recoil and eight-pixel lift with red/cream impact ink and 14 chips. Briar blast uses a 56-pixel irregular red-and-cream impact and 26 barbs. Comic crunch uses a 64-pixel inked burst, 22 percent pose compression and two strong damped body shakes. All preserve the current flash/scene shake and ongoing red slow-state cue; the unchanged current response remains the benchmark. These sizes are study parameters, not collision or knockback changes.

Selected: Pain jolt with the two side lightning bolts removed. Implemented as a stationary thornJolt particle containing the inked burst and fourteen chips, plus render-only recoil based on the fresh impact particle and slow-timer onset/refresh. Particle source is required because consumed thorns are removed immediately. Both particle transport paths preserve the effect; SAB uses shape code 7. Runtime retains existing red tint/slowdown, flash, shake, hitstop, sound. Production build and focused Vitest/browser checks passed; full suites not run. Practice: docs/mockups/thorn-hit/playtest.html, hold D to hit the briar.
