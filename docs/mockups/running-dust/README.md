# Running dust comparison

Current, Tiny heel puffs, Surface flecks, None. Scripted camera-follow running at 280 logical px/s; shared character motion and terrain scrolling. All 19 characters and eight surface palettes can be reviewed, with pause/scrub, slow motion, game/detail scale and night.

Current freezes full-speed runtime behavior from playerCosmetics.ts: one puff every 100ms, 280ms lifetime and 2.4px size; metal/glass use faster 196ms small sparks, ice uses occasional 168ms 0.6px specks. Particle gravity is 80px/s² and opacity/radius decay follows the existing simple-dot look. The selected terrain determines dust color. Lobby-only spawnFootstepDustParticles is a different emitter and is not the baseline here. Audio and slow-device suppression are not simulated.

Tiny heel puffs emit one small irregular cream cloud every 200ms, clearing in 300ms. Surface flecks emit three tiny inked fragments every 140ms, clearing in 260ms. None removes only visual dust from the comparison; character motion is identical. Terrain is a cropped meadow scene with a surface-colored contact strip, not a full alternate arena.

Build: node docs/mockups/running-dust/build-study.mjs. Verify: node docs/mockups/running-dust/verify.mjs (set TEMP/TMP to this worktree's ignored browser-temp directory on low-space machines). Browser checks passed: common before-run baseline, four distinct cues, 19 characters, eight surfaces, pause/scrub/detail/night, 360px layout, and no runtime errors. Game-size/detail captures inspected. Study tool ESLint passed. This is a docs-only study; production build, Vitest and game E2E not run.

Separate worktree features/running-dust starts at fetched origin/main e68c52a. No gameplay source changed.
