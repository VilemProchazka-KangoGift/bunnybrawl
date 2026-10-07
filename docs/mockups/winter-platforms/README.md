# Winter Lake platform pass: shape and contrast studies

Pearl Painted is the approved backdrop. This is **arena redesign step 3**: compare playable snow shelves, ground, and the two jumpable ice cubes in the full scene before choosing a production treatment. Geometry, landing heights, slippery friction, character placements, props, foreground cover, and time of day remain identical across captures. These are fixture overrides, not changes to the playable platform art.

## Full-scene comparison

| Treatment | Noon | Midnight | Design question |
| --- | --- | --- | --- |
| **Current** | ![Current platforms at noon](current-day.png) | ![Current platforms at midnight](current-night.png) | White caps and blue front faces against the new pale banks. |
| **Ink Rim** | ![Ink Rim at noon](ink-rim-day.png) | ![Ink Rim at midnight](ink-rim-night.png) | Can a continuous cool-slate cap edge and sparse brush marks solve the contrast problem without a major material change? |
| **Ice Strata** | ![Ice Strata at noon](ice-strata-day.png) | ![Ice Strata at midnight](ice-strata-night.png) | Can banded blue ice below the snow give the shelves a distinct material and separate their lower faces from snowy banks? |
| **Snow Crust** | ![Snow Crust at noon](snow-crust-day.png) | ![Snow Crust at midnight](snow-crust-night.png) | Would a chunkier snow apron over a dark slate core read better, or would its repeating edge become too loud? |

**First assessment:** Ice Strata gives the strongest separation of the lower side shelves from Pearl's snowy banks while keeping the white landing surface and existing fake 3D fold. Ink Rim is restrained, but at full match size its change is small. Snow Crust reads clearly yet the scalloped dark line repeats across every platform and along the entire ground, drawing attention away from play. The outlined ice cubes in the studies remain translucent, but they are easier to find against the painted lake. These are directions to discuss, not a locked implementation.

## Constraints for the chosen treatment

- Keep the exact platform rectangles, collision tops, front-face player-cover overlay, fake 3D right side, and current slippery movement. A stronger outline must follow the actual wavy cap edge without shifting the landing plane.
- Check the lower left shelves around x=40–360 and lower right shelves around x=920–1230 over Pearl's pale banks. Compare white cap, blue body, and cube silhouette separately at native size and on a smaller screen.
- Keep the highest shelves readable against open sky and avoid turning every floating platform into a dark bar. The ground edge should support play without becoming the strongest line across the scene.
- Preserve the two jumpable ice cube obstacles and their top-edge cues. Any change to their apparent size needs a collision check.
- Review noon, sunset, and night with pale, green, warm, and dark characters before production adoption. Bushes and other deliberate foreground cover remain opaque.

## Reproduction

The [fixture](../winter-lake/render.ts) uses the production `Renderer` and Winter Lake pack with the selected Pearl WebP decoded before the first frame. It overrides only `drawPlatform` and `drawPlatformOverlay` with the three [platform studies](variants.ts); the real game art stays unchanged. Run Vite from the repo root on port 4225, then `node docs/mockups/winter-platforms/capture.mjs`. Direct fixture URLs use `/bunnybrawl/docs/mockups/winter-lake/render.html?variant=current&platform=ice-strata&time=day`, with `platform=current|ink-rim|ice-strata|snow-crust` and `time=day|night`.
