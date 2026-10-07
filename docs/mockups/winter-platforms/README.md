# Winter Lake platform pass: shape and contrast studies

Pearl Painted is the approved backdrop. This is **arena redesign step 3**: compare playable snow shelves, ground, and the two jumpable ice cubes in the full scene before choosing a production treatment. Geometry, landing heights, slippery friction, character placements, props, foreground cover, and time of day remain identical across captures. These are fixture overrides, not changes to the playable platform art.

## Ink Rim follow-up: illustrated shelf studies

Ink Rim was the preferred first treatment, but its translucent stroke and speckles left the original airbrushed rectangle intact. With Astra art-direction review, the follow-up studies replace the visible cap and front-face material with larger connected forms. The front face still renders over players, the snow cap stays centered on the original landing height, and the right face retains its fake 3D fold. The ice cubes get a clearer frosted top, tinted side, and internal highlights without changing their hitboxes.

| Treatment | Noon | Midnight | What changes from Ink Rim |
| --- | --- | --- | --- |
| **Ink Rim reference** | ![Ink Rim reference at noon](ink-rim-day.png) | ![Ink Rim reference at midnight](ink-rim-night.png) | Thin edge treatment on the existing plain shelf. |
| **Snow Pillow** | ![Snow Pillow at noon](snow-pillow-day.png) | ![Snow Pillow at midnight](snow-pillow-night.png) | Warm pearl snow with an uneven rolled lip, lavender under-shadow, and sparse broad frost patches. The closest continuation of Ink Rim and the strongest of this set. |
| **Glacial Ceramic** | ![Glacial Ceramic at noon](glacial-ceramic-day.png) | ![Glacial Ceramic at midnight](glacial-ceramic-night.png) | A thinner cap over a more solid blue-green ice face, curved facets, and a localized polished mark. Clearer ice identity, but brighter and more toy-like. |
| **Layered Snowbank** | ![Layered Snowbank at noon](layered-snowbank-day.png) | ![Layered Snowbank at midnight](layered-snowbank-night.png) | Compressed snow and blue lower bed. This version still looks striped on the narrow shelves, so it is the weakest of the three. |

The first capture pass made the full-width ground into a repeated patterned ribbon. The revised captures give the ground only four small uneven ice pockets with long quiet spans; they are the files shown above. Original Winter Lake icicles and props still appear in all scenes because they belong to the later prop pass. Their regular spacing is now the clearest remaining mismatch with the new shelf language. The upper tiny shelves also have too little front-face height for elaborate texture; they rely on cap volume and silhouette.

## Full-scene comparison

| Treatment | Noon | Midnight | Design question |
| --- | --- | --- | --- |
| **Current** | ![Current platforms at noon](current-day.png) | ![Current platforms at midnight](current-night.png) | White caps and blue front faces against the new pale banks. |
| **Ink Rim** | ![Ink Rim at noon](ink-rim-day.png) | ![Ink Rim at midnight](ink-rim-night.png) | Can a continuous cool-slate cap edge and sparse brush marks solve the contrast problem without a major material change? |
| **Ice Strata** | ![Ice Strata at noon](ice-strata-day.png) | ![Ice Strata at midnight](ice-strata-night.png) | Can banded blue ice below the snow give the shelves a distinct material and separate their lower faces from snowy banks? |
| **Snow Crust** | ![Snow Crust at noon](snow-crust-day.png) | ![Snow Crust at midnight](snow-crust-night.png) | Would a chunkier snow apron over a dark slate core read better, or would its repeating edge become too loud? |

**Initial assessment, before the Ink Rim follow-up:** Ice Strata gave the strongest separation of the lower side shelves from Pearl's snowy banks. Ink Rim was restrained, but at full match size its change was small. Snow Crust's repeating edge drew attention away from play. Ink Rim was chosen as the base for the richer studies above; the initial assessment is retained as iteration history.

## Constraints for the chosen treatment

- Keep the exact platform rectangles, collision tops, front-face player-cover overlay, fake 3D right side, and current slippery movement. A stronger outline must follow the actual wavy cap edge without shifting the landing plane.
- Check the lower left shelves around x=40–360 and lower right shelves around x=920–1230 over Pearl's pale banks. Compare white cap, blue body, and cube silhouette separately at native size and on a smaller screen.
- Keep the highest shelves readable against open sky and avoid turning every floating platform into a dark bar. The ground edge should support play without becoming the strongest line across the scene.
- Preserve the two jumpable ice cube obstacles and their top-edge cues. Any change to their apparent size needs a collision check.
- Review noon, sunset, and night with pale, green, warm, and dark characters before production adoption. Bushes and other deliberate foreground cover remain opaque.

## Reproduction

The [fixture](../winter-lake/render.ts) uses the production `Renderer` and Winter Lake pack with the selected Pearl WebP decoded before the first frame. It overrides only `drawPlatform` and `drawPlatformOverlay` with the [platform studies](variants.ts); the real game art stays unchanged. Run Vite from the repo root on port 4225, then `node docs/mockups/winter-platforms/capture.mjs` to recapture Ink Rim and the three follow-up studies. Direct fixture URLs use `/bunnybrawl/docs/mockups/winter-lake/render.html?variant=current&platform=snow-pillow&time=day`, with `platform=current|ink-rim|ice-strata|snow-crust|snow-pillow|glacial-ceramic|layered-snowbank` and `time=day|night`.
