# Meadow prop art studies

Two experimental redraws of Meadow's decorative objects, compared with the current Morning blue arena. These are renderer-backed stills, not a game art change. They use the production arena layout, characters, background, HUD, and night treatment. Only bushes, flowers, mushrooms, platforms, and stumps are redrawn.

## At gameplay size

| Current | Garden storybook | Field-guide woodcut |
| --- | --- | --- |
| ![Current day](current-day.png) | ![Garden storybook day](storybook-day.png) | ![Field-guide woodcut day](woodcut-day.png) |
| ![Current night](current-night.png) | ![Garden storybook night](storybook-night.png) | ![Field-guide woodcut night](woodcut-night.png) |

## Prop details

![Enlarged bush, platform, stump, flower, and mushroom comparison](details.png)

The foreground bushes remain opaque and cover the rabbit in the same scene position. Their footprint and stacking role are preserved. Platform landing height and arena geometry also stay fixed. Night images check how each style behaves under the existing tint.

**Garden storybook:** broader leaf clusters, sage greens, coral berries, warmer soil and softer stump grain. It has the clearest shape at gameplay size.

**Field-guide woodcut:** olive and ochre colors with carved leaf veins, dark outlines and visible platform strata. Its fine marks read well up close but become busier at native play size.

These images are a static art direction test. They do not evaluate motion, gameplay readability during a match, rendering cost, or concealment from every possible character position. Before adopting any style, implement it as a separate change and verify both worker modes in browser play.

## Reproduce

From the repository root, start `npm run dev -- --host 127.0.0.1 --port 4190`, then run `node docs/mockups/meadow-props/capture.mjs`. The fixture is at `/bunnybrawl/docs/mockups/meadow-props/render.html` with `variant=current|storybook|woodcut` and `time=day|night` query parameters. The capture script writes the seven PNGs in this directory. It uses seeded randomness and fixed player positions for stable comparisons.
