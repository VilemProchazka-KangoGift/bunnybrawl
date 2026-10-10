# Angry-face cue comparison

Options: Current face art, Comic anger mark, Eye glint, No extra overlay.

Current and No extra overlay intentionally match. Every production plush pack sets authoredAngryBrows, so drawExpression returns without painting the generic red eyebrows. Expression alone does not change the atlas pose. The current expression function is frozen from main 1b8cffc3; the study supplies the same authored-brow flag and uses real plush atlases and roster sizes. Classic procedural characters are outside this study.

Production sets angry when another active, living player is within 80px horizontally and 60px vertically, provided the player is not protected and downward velocity is at most 400. This gallery forces a cue interval from 0.3 to 2.4 seconds and does not simulate opponents or combat.

Controls include all 19 characters, idle/run/jump, facing, day/night background, native/2x scale, slow motion, cue on/off and timeline scrubbing. Eye-glint positions use study anchors for each character's idle, walk A, walk B and jump atlas cells, reviewed from the source art. They are comparison coordinates, not new production metadata. Body transforms, lighting and gameplay physics are omitted.

Build: `node docs/mockups/angry-cue/build-study.mjs`. The frozen baseline survives rebuilds. Browser verification: `node docs/mockups/angry-cue/verify.mjs` against port 4251. It checks source parity, all 19 characters in all three pose modes, the intentional Current/No-overlay match, activation/disable controls, facing, night and mobile layout. Captures include roster examples. No production changes are included.
Selected: No extra overlay. This intentionally matches current production plush rendering, so no production change is needed. Preserve the authoredAngryBrows guard, authored faces, angry state and proximity trigger. The alternatives remain available as a historical comparison.
