# Meadow background studies

These are **mockups**, not changes to the game. They use the production Meadow arena, platforms, props, characters, renderer, sky gradient, sun, and day/night treatment at 1280 × 720. The five players have the same fixed positions in every capture. Only the distant landscape or cloud shapes vary.

The current day capture matches the [approved production scene](../meadow-mixed-props/all-assets-day.png) pixel for pixel. Night captures use the same lighting but can differ in ambient particle placement.

| Direction | Day | Night | What it tests |
| --- | --- | --- | --- |
| **Current** | ![Current Meadow, day](current-day.png) | ![Current Meadow, night](current-night.png) | Existing round hills, sharp distant treeline, and round cloud clusters. |
| **Wooded valley** | ![Wooded valley, day](wooded-valley-day.png) | ![Wooded valley, night](wooded-valley-night.png) | Broad rolling hills and small, quiet distant trees instead of the zigzag treeline. |
| **Countryside** | ![Countryside, day](countryside-day.png) | ![Countryside, night](countryside-night.png) | Field contours, a sparse orchard, and one small cottage as a distant landmark. |
| **Storybook clouds** | ![Storybook clouds, day](storybook-clouds-day.png) | ![Storybook clouds, night](storybook-clouds-night.png) | Longer, irregular cloud silhouettes with a subdued underside. The landscape stays current. |
| **Valley + clouds** | ![Wooded valley and storybook clouds, day](valley-and-clouds-day.png) | ![Wooded valley and storybook clouds, night](valley-and-clouds-night.png) | The calmer landscape and clouds together. |

The wooded valley leaves the clearest open space around jumping characters. Countryside has more sense of place but also more visual information near the lower lanes. The cloud treatment can be combined with either landscape. The woodland frame experiment was dropped after inspection because its side canopies crowded the outer platforms.

To reproduce the images, run Vite on port 4192 from the repo root with `npx vite --host 127.0.0.1 --port 4192`, then run `node docs/mockups/meadow-backgrounds/capture.mjs`. The [fixture](render.ts) swaps background drawing only. It freezes cloud positions for fair comparisons; if a cloud direction is chosen, its production implementation would need to preserve the game's cloud animation.
