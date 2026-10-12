# Castle atmosphere study

## Selected production treatment: Balanced Silver, quieter

The quieter Balanced Silver is now used by the playable Castle. The painted wall has the selected restrained lift and broad moonlight pools baked into a new WebP. The guard, sconces, chandelier, edge columns, and both Guardian spring poses have matching silver WebPs. Limestone platform caps, faces, rims, and material marks use a warmer gray silver palette; the cool weather motes match the blue flames. Characters keep their own colors, and collision geometry, draw order, and Guardian contact behavior are unchanged. The scene uses no per-frame image filter or pixel remap.

The original artwork remains as editable/source references. Run [bakeBalancedSilver.mjs](bakeBalancedSilver.mjs) with `CASTLE_PROPS_BROWSER` pointing to a local Chromium or Edge binary to regenerate the seven runtime WebPs from those masters. This is an offline bake; the arena preload loads only the selected variants. The seven files total 101,428 bytes before bundling, and Vite inlines the small sconce.

| Default simulation worker | `simWorker=off` |
| --- | --- |
| ![Playable Castle with Balanced Silver](live-balanced-default.png) | ![Playable Castle with Balanced Silver and simulation on the main thread](live-balanced-simWorker-off.png) |

These are 1280 × 720 production-preview captures after countdown. Direct Castle entry and Meadow-to-Castle switching loaded the selected art without page errors in both worker modes. The production build and 26 focused Vitest tests passed. The stills establish the integrated palette; character movement, banners, flames, and Guardian compression should also be judged in live play.

## Silver Moon follow-up

The first Silver Moon lifted only the background and made the room too pale. Its platform faces, Guardian, chandelier, and other foreground props kept the old blue-gray treatment, so they appeared pasted onto a brighter room. The follow-up below reduces the lift and grades those Castle draw calls as well. Character sprites retain their original colors for gameplay contrast. All captures use the same scene and 28 × 12 thorn samples. Balanced Silver's background lift was then reduced to about **55% of the prior adjustment** at the user's request; its prop and platform-face treatment stays the same. Deep Silver keeps more night depth, while Pewter is an intentionally less blue option.

| Direction | Matched full scene | Read at game size |
| --- | --- | --- |
| Original Silver Moon | ![Original pale Silver Moon](atmo-silver.png) | Too pale; foreground material remains blue. |
| Balanced Silver, previous | ![Previous Balanced Silver Castle](atmo-silver-balanced-before.png) | Coherent materials, but the background still lifted too far. |
| Balanced Silver, quieter | ![Quieter Balanced Silver Castle](atmo-silver-balanced.png) | Reduced background lift with the same silvered Guardian and platform faces. |
| Deep Silver | ![Deep Silver Castle](atmo-silver-deep.png) | Deeper blue shadows and slightly stronger moon focus. |
| Pewter Moon | ![Pewter Castle](atmo-silver-pewter.png) | Desaturated stone and props; coherent, but loses some Castle color character. |

The mockup uses a static background pixel remap and filtered draw calls for platform faces, Castle props, Guardian and thorns. **Those are study tools, not the intended runtime implementation.** A selected grade should be baked into the painted plate and expressed in the Canvas art palettes or pre-rendered assets, so there is no per-frame screen filter or pixel loop. Reactive banners, blue flames, and moving effects still need a live motion review before shipping a selection.

## Initial palette exploration

Castle is a fixed moonlit interior, with a painted window wall, pale limestone platforms, blue sconces, and the approved Guardian spring. This pass tests **three distinct color and light directions** in a matched 1280 × 720 renderer scene. Character sprites and foreground props retain their colors so their readability can be judged against each room treatment. The prior thorn samples are only comparison fixtures; no thorn art, collision, or placement changes are proposed here.

| Direction | Scene | Effect and tradeoff |
| --- | --- | --- |
| Current | ![Current Castle scene](atmo-current.png) | Restrained blue-gray, but the back wall, platforms, and guardian share a narrow range. |
| A · Silver Moon | ![Pale silver Castle](atmo-silver.png) | Pale blue wall and a broader moon glow; cleanest separation for dark props, though the room loses some depth. |
| B · Violet Vigil | ![Purple Castle](atmo-violet.png) | Deliberately theatrical violet shadows and lavender moon; distinct mood, but the purple platform tops compete with banners. |
| C · Ember Hall | ![Warm Castle](atmo-ember.png) | Warm stone and sconce pools against cool prop silhouettes; strong color contrast, but the existing blue flames would need a coordinated color change. |

The original Silver Moon motivated the follow-up above. Ember Hall is the bolder option if Castle should feel warmer; Violet Vigil shows the upper limit of saturation rather than a recommended production grade. The [gallery](index.html) presents all scenes at matching size.

The [grade study source](grades.ts) remaps static background pixels and adds broad radial light pools. This is a fast way to explore palettes **in the mockup**, not a proposed runtime pixel loop. If one direction is approved, implement it by changing the baked painted plate and static Canvas palette, and coordinate emitter colors separately. Keep player sprites, thorn silhouettes, collision, and background/foreground draw order intact. Then verify the production scene and moving effects in both worker modes.
