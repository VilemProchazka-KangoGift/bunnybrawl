# Running speed trail comparison

Round two: Current, Tight fade, Spaced ovals, Stretched ovals, Tapered ovals. The user preferred Current; round-one.html preserves the earlier four-way study. Every panel retains the selected Tiny heel puffs. This is scripted camera-follow motion over the same Meadow crop and surface-colored contact strip; it is a study, not a runtime override.

Current freezes playerCosmetics.ts and renderer.ts at the heel-puff implementation: speed strictly above 200 px/s, a 30 ms accumulator advanced at 30 Hz, maximum five entries, alpha decay 4/s, swap-remove expiry, and body ovals with the character's hue shifted by up to -18 degrees. Body dimensions are 32×32; the character artwork uses the roster's individual authored size and 120 ms walking pose cadence. baseline.mjs stays independent of future production changes.

Tight fade keeps the 30 ms cadence and original oval dimensions but expires at 150 ms, with 90% peak opacity. Spaced ovals keeps the original oval and fade but emits every 55 ms. Stretched ovals keeps original timing, widens horizontal radius to 17.6 px and reduces vertical radius to 8.3 px, at 85% opacity. Tapered ovals shrinks older silhouettes toward 35% of original size, at 90% opacity. All candidates require speed above 200 px/s. The Invincible switch shows the original blue status trail identically across all options; respawn blinking and protection duration are outside this study.

Controls: all 19 characters, full/threshold/slow run speed, left/right direction, eight contact palettes, normal/slow playback, pause/scrub, game size/2× detail, and night background. Night is a contrast preview rather than the complete engine lighting pipeline. No choice is selected by default.

Build: `node docs/mockups/running-afterimages/prepare.mjs` then `node docs/mockups/running-afterimages/build-study.mjs`. Browser check: `node docs/mockups/running-afterimages/verify.mjs` with Vite on port 4231. Use a matching installed Playwright browser and a per-run TEMP directory. Verification checks five distinct candidates at full speed, pixel-identical Current against round-one.html, identical pre-run and <=200 px/s frames, identical invincibility trails, all 19 characters, eight surface controls, left/night/2×/360 px layout and no page errors. Game-size and detail captures inspected. Tool ESLint passed. Production source unchanged; build, Vitest and game E2E not rerun for this docs-only study.

Separate worktree: features/running-afterimages, synchronized to merged main bc851df before committing the study. Tiny heel puffs merged through PR #80 with all four CI gates passing.

Additional variation: Drooping tapered ovals uses the same timing, shrink and opacity as Tapered ovals; each circle descends by up to 10 logical px as its alpha decays. Current and all five earlier panels remain unchanged. Browser verification covers six distinct variants and the retained reference.

Shape round: Squash blobs, Bean shapes, Wispy teardrops, and Irregular clouds vary only the filled silhouette. They use the original 30 ms cadence, five-entry cap, 4/s fade, hue shifts and body-center placement. Small deterministic alternating tilt varies beans and tear tips without frame-to-frame random jitter. Original and prior oval studies remain alongside them. Browser checks cover ten distinct variants and the unchanged reference.
