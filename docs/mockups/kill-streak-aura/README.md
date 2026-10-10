# Kill-streak aura comparisons

Options: Current flames, Chunky comic flame, Small crown flames, No aura.

The gameplay cue starts at three kills. Production draws four moving translucent circles behind the sprite and suppresses them on slow devices. This study freezes that geometry and palette, bypasses only the activation/device gate, and applies a scripted active interval from 0.3 to 2.4 seconds. Losing a streak is represented by the effect switching off; the study does not simulate combat.

Controls cover all 19 real plush atlases, idle/run/jump poses, left facing, day/night backgrounds, native or 2x scale, aura on/off, timeline scrubbing and slow motion. Character sizing follows the roster. The crown is anchored to the atlas size; current flames retain the 32px collider anchor. All aura variants are drawn behind the character. Body transforms, lighting and gameplay physics are omitted.

`node docs/mockups/kill-streak-aura/build-study.mjs` rebuilds the gallery while preserving its frozen baseline. `node docs/mockups/kill-streak-aura/verify.mjs` checks source parity with production and browser behavior on port 4249, generating review captures. No production aura changes are included.
