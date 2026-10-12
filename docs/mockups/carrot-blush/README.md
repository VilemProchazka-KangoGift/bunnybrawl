# Carrot proximity blush comparisons

Four options: Current cheek dots, Warm cheek wash, Tiny anticipation accents, No extra overlay.

The renderer marks a player near a carrot when the squared distance from the player's collision-body center to any active carrot is less than 10000 (100px). Inactive and respawning players are skipped, and the blush is suppressed for splats. This is a proximity cue, not the pickup burst or powerup animation.

The current reference freezes the two pink ellipses in players.ts at collider-relative coordinates, including their original opacity and world orientation. The warm wash uses study eye anchors for all 19 characters and four atlas cells to put a small coral wash below the visible eye. Anticipation accents sit above the head. These are art alternatives; Selected No extra overlay removes the generic cheek dots.

The schematic carrot enters proximity at 0.3s and leaves at 2.4s, in a three-second loop. Controls cover idle/run/jump, full roster, facing, cue enabled, night, native/2x scale, slow motion and scrubbing. This study omits body lean/squash, environmental lighting, pickup effects and gameplay physics; its timing is illustrative, while production proximity is computed every rendered frame.

Build: `node docs/mockups/carrot-blush/build-study.mjs`.
Verify: `node docs/mockups/carrot-blush/verify.mjs` with the gallery served on port 49053. Checks include frozen source parity, all 19 characters and poses, enabled/disabled and pre/post cue frames, facing, night and mobile layout.

Worktree synced with main a7a8d904 after the Red silhouette flash merge. The proximity-blush production block is unchanged.

Selected No extra overlay: removed the blush drawing and renderer proximity scan. Carrot collection, pickup effects, AI targeting and powerups are unchanged. The old drawing remains frozen in this gallery.
