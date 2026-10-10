# Directional damage flash comparisons

Source: main 1fd3eb52. Selected Red silhouette flash is implemented.

Five options: Current red strip, Comic ink swipe, Brief silhouette flash, Red silhouette flash, No extra overlay. The study freezes the original renderer block rather than redrawing an approximation. Current uses a four-pixel red strip on the world hit side, with alpha min(0.5, remainingTimer * 3). Hazard and ghost collisions use 0.4 seconds; rocks and stomp victims use 0.3 seconds. Burning suppresses this overlay.

The swipe is an uneven inked coral accent on the hit side. The silhouette flash uses a pale, alpha-masked copy of the real pose. Both start on contact and expire with the original timer. No extra overlay retains the base sprite and any enabled shared cues.

Controls include all 19 characters, idle/run/jump, facing independently from hit side, both durations, night, native/2x scale, slowdown overlap, burn overlap, timeline and slow motion. Scripted hit starts at 0.3 seconds and loops every 1.5 seconds. Reduced-motion preference starts paused.

Optional slowdown uses the selected warm wash and comic burst plus original body opacity modulation. Burn overlap uses the frozen production gradient fallback and wisps. These layers are frozen for reproducible comparisons. The scene omits gameplay physics, recoil, death poses, initial hit particles, camera feedback, environmental lighting and cached fire art; it is an art comparison, not a live combat test.

Build: `node docs/mockups/damage-flash/build-study.mjs`.
Verify: `node docs/mockups/damage-flash/verify.mjs` with the gallery served on port 49051. Verification compares current pixels at multiple remaining timer values, both hit sides and burn states, then checks all characters and poses, both durations, activation/expiry, slowdown/burn priority, mobile layout and browser errors.

Red silhouette flash retains the pale flash timing and opacity, with coral red #F04435 replacing the cream mask. Both versions remain available for comparison.

Production masks the cached sprite with coral red and follows its facing/pose/body transforms. Burning and missing hit direction suppress it; masks share sprite-cache lifetime. The generic splat body gets the same red flash while the existing white hitstop flash remains on top. Authored flying corpses and blood particles retain their existing rendering.
