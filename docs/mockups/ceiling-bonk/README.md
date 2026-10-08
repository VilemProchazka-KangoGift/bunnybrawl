# Ceiling bonk studies

Current response is the visual reference: stop upward motion and fall, without added graphics. The real game also plays its existing headbonk sound. All panels use the same scripted jump and contact plane; these studies do not replay the simulator or audio.

- Head squash: 12 percent pose compression and 6 percent widening, starting 50 ms earlier, easing into compression over 60 ms and releasing over 220 ms (280 ms total).
- Tiny stars: three small irregular cream-and-ink stars with warm centers, fading over 0.20 seconds.
- Ear wobble: a damped shear of the cached upper silhouette for 0.24 seconds, keeping its join continuous. This is an illustrative Bunny-specific study; implementation must adapt to other characters' head features.

Actual Bunny sprite and Meadow backdrop assets are embedded; the ceiling drawing is illustrative. Runtime movement, collision, and sound are unchanged until a variant is chosen. Comparison supports pause, scrub, slow motion, game/detail scale, night, and saved selection.

Build: `node docs/mockups/ceiling-bonk/build-study.mjs [absolute-inline-fragment-path]`.
Browser verification: `node docs/mockups/ceiling-bonk/verify.mjs`.
Four panels, controls, saved selection and 360px layout passed without browser errors. Game/detail captures were visually inspected. No application build or full runtime suite was needed for these docs-only studies.

Character picker: all 19 current plush character atlases, embedded for standalone comparison. Switching characters preserves effect selection and timing. The study uses the idle pose consistently across all four panels.

Selected: gentle Head squash. Runtime CeilingSquash begins within eight scaled logical pixels of a solid platform underside, respecting collision insets. Smoothstep attack 60 ms, release 220 ms; 12 percent compression and 6 percent widening at the head anchor. Renderer-owned contact tracking supports both worker modes, clears inactive/dead players, and avoids held-contact retriggers. Focused Vitest: 197 distinct tests passed across renderer, gameplay and cosmetic modules. Playwright script: both simulation modes reached playing and rendered; actual keyboard ceiling contact captured in main-simulation / renderer-worker practice with no page errors. Full Vitest and full E2E suites not run. Practice: docs/mockups/ceiling-bonk/playtest.html (W to jump).
