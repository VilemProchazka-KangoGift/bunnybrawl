# Dizzy-star comparisons

Current stars, Chunky comic stars, Stars + broken orbit swoosh, and No overlay.

The production Simulator sets dizzy during respawn protection (`invincibleTimer > 0`), not a standalone timed stun. This study uses a 0.3-second start followed by the existing 1.5-second protection window. All four options share the same idle pose; the existing 0.5-alpha blink and Small shield sparks can be switched off to inspect stars alone.

Current stars are frozen from drawExpression in players.ts; protection sparks are frozen from protectionEffects.ts. Rebuilding preserves both snapshots. Comic options use uneven outlined stars with a warm highlight, keeping the current three-star orbit and angular speed. The swoosh adds three interrupted orbit arcs. No overlay removes only the stars.

Controls cover all 19 characters, direction, day/night, native/2x, normal/slow speed, pause, replay and scrubbing. The platform and backdrop are schematic. Gameplay physics, entrance clouds, squash and lighting are omitted.

Rebuild with `node docs/mockups/dizzy-stars/build-study.mjs`. Serve via Vite and open `/bunnybrawl/docs/mockups/dizzy-stars/index.html`. Verify with `node docs/mockups/dizzy-stars/verify.mjs` against port 4245.

Validation: browser checks passed for exact production baseline at seven times, all 19 characters, four distinct active options, identical pre/post-protection scenes, shared/isolated protection, left, night, native/2x and 360px mobile without overflow or page errors. Builder/verifier ESLint passed. The first navigation timed out during cold Vite startup; the readiness-based retry passed. Production build, Vitest and game E2E were not run for this docs-only study.

Created on features/dizzy-stars from origin/main at 3d25a114. Production source is unchanged.
