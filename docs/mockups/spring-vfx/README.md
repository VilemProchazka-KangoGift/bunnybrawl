# Spring bounce variations

Selected: **Boing accents**. Three alternatives: **Coiled ink trail**, **Cloud burst**, and **Boing accents**.
Open `index.html` to compare at game size or 2x, normal speed or slow motion. Pause and scrub around launch; toggle the previous effect to compare the existing yellow energy column and rings. Night is a palette approximation.

The Bunny atlas and painted Meadow background are actual game assets. The mushroom and baseline spring trail are taken from the current engine drawing functions. The flight is scripted for comparison, not a live simulation; the comparison remains a scripted study. The selected Boing accents are now integrated into the live renderer.

Coil opens once over 0.26 seconds. Cloud burst separates three irregular puffs over 0.22 seconds. Boing accents use short irregular inked marks for 0.18 seconds. All start at the cap immediately and retain a clear player silhouette.

This batch lives on `features/spring-vfx-variations` in its own worktree. The shared spring renderer uses five cream-and-ink accents for 0.18 seconds, anchored to the mushroom cap. It preserves the existing launch timer and worker transport. The old yellow spike burst was removed.

Rebuild with `node docs/mockups/spring-vfx/build-study.mjs`; verify with `node docs/mockups/spring-vfx/verify.mjs`. Chromium verified pause/scrub, zoom, night, baseline, selection, and a 360px layout without JavaScript errors. Day and night comparisons were visually inspected.

Playtest server: port 4201. `playtest.html` runs the real match with a seeded spring and landing in main-simulation / renderer-worker mode; Back to spring repeats the real collision. Use the ordinary match URL for the default simulation-worker mode. `capture-live.mjs` verifies the real collision and captures day/night; those crops were inspected. Production build, 160 focused Vitest tests, and four Playwright fast-stomp/arena-switch checks in both worker modes passed. The full Vitest and E2E suites were not rerun for this spring batch.
