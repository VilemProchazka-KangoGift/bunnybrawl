# Victory celebration comparisons

Current fireworks, Confetti cannon, Winner bounce, Carrot shower. Review index.html with all 19 characters, normal/slow speed, pause/scrub, game/detail scale and night.

The frozen fireworks study preserves runtime burst cadence (300ms), 20-30 particles, original palette, velocity/lifetime/size ranges and gravity. Positions are framed within a cropped review scene rather than the full 1280x720 arena. Alternatives are scripted prototypes, not production effects. Winner bounce repeats every 1.35s; confetti and carrot shower emphasize the opening burst.

Build: node docs/mockups/victory-celebration/build-study.mjs [optional-inline-path]. Verify: node docs/mockups/victory-celebration/verify.mjs. Browser checks passed: common before-event baseline, four distinct cues, all 19 characters, controls, detail/night, 360px layout and no runtime errors. Game-size capture inspected. No gameplay source changed; build, Vitest and game E2E not run.

Separate features/victory-celebration worktree starts from origin/main 3aaad95.

Winner zoom revision: second panel now compares original fireworks with the same seeded fireworks plus a whole-scene zoom. Smoothstep eases from 1x to 2.2x over three seconds after victory; pivot is the winner body center. Original remains the first panel, Winner bounce and Carrot shower remain for reference. Zoom endpoint and existing browser checks pass; endpoint screenshot inspected. This remains a scripted review prototype; production camera is unchanged.

Camera framing: target the winner body center at viewport center. Clamp translation to visible scene bounds, placing an edge-adjacent winner as close to center as the bounds permit. The gallery uses cropped scene boundaries as a stand-in for actual arena boundaries; production implementation must clamp against full arena extents. Endpoint browser regression checks the bottom-edge clamp.

Implemented existing fireworks plus 2.2x centered/clamped winner zoom over three seconds, 4.5-second natural result transition, fixed HUD and aligned background/foreground/light canvases. TypeScript and production Vite build, ESLint, 74 focused Vitest tests, 9 production smoke tests and 2 actual victory browser tests passed. Captures inspected in both worker modes. Full Vitest/E2E and online browser checks not run. Diagnostic-based checks initially failed against placeholder worker proxies; actual frame/timing checks passed.

