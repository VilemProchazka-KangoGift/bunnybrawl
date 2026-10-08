# Victory celebration comparisons

Current fireworks, Confetti cannon, Winner bounce, Carrot shower. Review index.html with all 19 characters, normal/slow speed, pause/scrub, game/detail scale and night.

The frozen fireworks study preserves runtime burst cadence (300ms), 20-30 particles, original palette, velocity/lifetime/size ranges and gravity. Positions are framed within a cropped review scene rather than the full 1280x720 arena. Alternatives are scripted prototypes, not production effects. Winner bounce repeats every 1.35s; confetti and carrot shower emphasize the opening burst.

Build: node docs/mockups/victory-celebration/build-study.mjs [optional-inline-path]. Verify: node docs/mockups/victory-celebration/verify.mjs. Browser checks passed: common before-event baseline, four distinct cues, all 19 characters, controls, detail/night, 360px layout and no runtime errors. Game-size capture inspected. No gameplay source changed; build, Vitest and game E2E not run.

Separate features/victory-celebration worktree starts from origin/main 3aaad95.
