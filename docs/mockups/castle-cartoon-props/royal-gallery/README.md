# Castle royal gallery: replacing the false platforms

**Historical study:** the portraits shown below were rejected and removed from the playable arena. See the [wall prop alternatives](../armory-study/README.md) for the portrait-free baseline and new mockups.

The freestanding columns in the previous layout looked like playable ledges even though they had no collision. This pass removes them in both the illustrated and fallback paths. It fills the room with two recessed royal portraits, sparse cobwebs and worn plaster. The long upper platform gets a runner flush with its top and shallow relief on its front face. The experimental gargoyle carvings above the arches were removed after they failed to read well at game size. Existing windows, platform geometry, collision, guards, sconces, chandelier, banners, and spring positions are unchanged.

| Previous clear-bays layout | Royal gallery, default worker | Royal gallery, `simWorker=off` |
| --- | --- | --- |
| ![Previous Castle](../layout/clear-bays-default.png) | ![Royal gallery](live-default.png) | ![Royal gallery with simulation on main thread](live-simWorker-off.png) |

The first rabbit duchess and hedgehog king portraits were too painterly for the game's cartoon props. They remain as [original duchess](duchess-source.png) and [original king](king-source.png) references. The later [cartoon duchess](duchess-cartoon-source.png) and [cartoon king](king-cartoon-source.png) kept the expressions and costumes but used thicker dark contours, simpler faces and fur, broad cel-shaded color planes and chunkier frames. [preparePortraits.mjs](preparePortraits.mjs) records how those sources were alpha-cropped and graded into transparent 276-pixel-high WebP assets. The game briefly displayed them at 91 pixels high and preloaded the 43,440-byte pair with Castle's fixed art; both runtime portraits are now removed. The small wall, web, runner and frieze shapes remain Canvas paths in the arena's cached background pass, not every frame.

The portrait revision used each original as a character and composition reference; the king also used the revised duchess as a matching style reference. The prompts specified clean game art, bold near-black outlines, chunky rounded shapes, two or three broad shading values, simplified carved frames, transparent surroundings, no text, and no painterly texture. The sources were cropped by nontransparent pixels and graded at 72% saturation, 90% brightness, 104% contrast to sit behind the characters.

The keystone experiment failed in three forms: the first 34-pixel face read as a floating emoji, an angular redraw read as a mask, and a cropped Guardian spring still looked pasted above the arch. The final scene removes those carvings. A small decorative figure should earn its space at match size; reusing a better source cannot fix a bad placement.

Production preview checks loaded the six fetched Castle/Guardian assets plus the inline sconce, rendered direct Castle entry and Meadow-to-Castle switching without page errors in both simulation modes. The build, focused backdrop asset tests, and changed-file lint pass. The live captures are after the countdown at 1280 × 720; they establish layout and loading, not every moving-player overlap.
