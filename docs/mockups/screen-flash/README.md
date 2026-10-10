# Full-screen hit flash comparisons

Four options: Current white flash, Soft edge flash, Comic corner accents, No screen flash. Production is unchanged. Fresh worktree based on main 9251b3c0.

Current fills the entire logical 1280×720 canvas with white at min(1, screenFlash / 0.15), including the HUD. Hazard-zone and ghost collisions initialize screenFlash to 0.06 seconds, so peak opacity is 0.4. Match end initializes it to 0.15 seconds, for a full-white peak. The same overlay math is used in match and lobby paths. The gallery freezes the exact match block.

Soft edge flash uses cream gradients along four screen edges, with a clear center. Comic corner accents use irregular cream/ink corner shapes. Both use the same timer phase as Current. No screen flash adds no overlay. These are alternatives for the global screen layer, separate from red damage silhouettes, Pain jolt, burn effects and death poses.

All four cards use identical static 1280×720 screenshots from the actual renderer, with Meadow/Castle in day/night. Screenshots were captured from the selected no-blush game build in simWorker=off, forcing dayPhase and clearing screen flash/shake solely for scene capture. Characters, terrain and HUD are real, but the study does not animate physics, impact poses, shake, zoom, firework or other simultaneous effects. The final-kill option shows timing strength over a gameplay scene, rather than a complete victory sequence.

Impact is scripted at 0.5 seconds, loop length 1.5 seconds. Controls include event strength, scene, normal/slow motion, replay, timeline and focused arena view. Current remains intentionally white at the first frame of the final-kill flash. Reduced-motion preference starts paused.

Build: `node docs/mockups/screen-flash/build-study.mjs`.
Verify: `node docs/mockups/screen-flash/verify.mjs`, served on port 49055. Checks exact source/pixel parity, all four scenes and both strengths, activation/expiry, center preservation, focused views and mobile layout. This art study does not change or validate production worker behavior.
