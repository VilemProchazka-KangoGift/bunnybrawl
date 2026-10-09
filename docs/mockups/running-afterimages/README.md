# Running speed trail comparison

Current, Faint pose echoes, Short motion ticks, None. Every panel retains the selected Tiny heel puffs. This is scripted camera-follow motion over the same Meadow crop and surface-colored contact strip; it is a study, not a runtime override.

Current freezes playerCosmetics.ts and renderer.ts at the heel-puff implementation: speed strictly above 200 px/s, a 30 ms accumulator advanced at 30 Hz, maximum five entries, alpha decay 4/s, swap-remove expiry, and body ovals with the character's hue shifted by up to -18 degrees. Body dimensions are 32×32; the character artwork uses the roster's individual authored size and 120 ms walking pose cadence. baseline.mjs stays independent of future production changes.

Faint pose echoes uses up to two translucent authored walking poses every 100 ms, fading over 180 ms at 24% peak opacity. Short motion ticks uses three curved ink marks every 120 ms, fading over 140 ms. None removes only ordinary speed trails. All candidates require speed above 200 px/s. The Invincible switch shows the original blue status trail identically across all options, including None; respawn blinking and protection duration are outside this study.

Controls: all 19 characters, full/threshold/slow run speed, left/right direction, eight contact palettes, normal/slow playback, pause/scrub, game size/2× detail, and night background. Night is a contrast preview rather than the complete engine lighting pipeline. No choice is selected by default.

Build: `node docs/mockups/running-afterimages/prepare.mjs` then `node docs/mockups/running-afterimages/build-study.mjs`. Browser check: `node docs/mockups/running-afterimages/verify.mjs` with Vite on port 4231. Use a matching installed Playwright browser and a per-run TEMP directory. Verification checks four distinct candidates at full speed, identical pre-run and <=200 px/s frames, identical invincibility trails, all 19 characters, eight surface controls, left/night/2×/360 px layout and no page errors. Game-size and detail captures inspected. Tool ESLint passed. Production source unchanged; build, Vitest and game E2E not rerun for this docs-only study.

Separate worktree: features/running-afterimages, synchronized to merged main bc851df before committing the study. Tiny heel puffs merged through PR #80 with all four CI gates passing.
