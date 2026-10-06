# Storybook carrot pickup studies

The shared carrot pickup now reads as a small rooted vegetable instead of a sideways orange oval. Its broader shoulders taper to a slightly uneven tip. Three connected leaves, a dark ink edge, two warm color planes, and sparse root creases follow the Meadow prop language. The bob, brief spawn ring, and single glint still distinguish it from static foliage. After the upright first pass, the four studies below vary the lean, body proportions, and pointing direction. **Long root (C) is the selected in-game design.**

## Angled variations

Each crop comes from the actual Meadow renderer at game scale, not a full-size concept illustration. Click the day or night view to see how the same shape sits among platforms and foliage.

| Variation | Match-scale crop | What it tests | Full scene |
| --- | --- | --- | --- |
| **A · Gentle lean** | <img src="gentle-lean-detail.png" width="200" alt="Gently angled carrot"> | Small tilt, balanced root and leaf mass. Closest to the upright redesign. | [Day](gentle-lean-day.png) · [Night](gentle-lean-night.png) |
| **B · Chunky diagonal** | <img src="chunky-diagonal-detail.png" width="200" alt="Plump carrot angled down to the right"> | Broader shoulders, shorter root, and a clearer diagonal. Feels playful and substantial. | [Day](chunky-diagonal-day.png) · [Night](chunky-diagonal-night.png) |
| **C · Long root — selected** | <img src="long-root-detail.png" width="200" alt="Slender carrot angled down to the right"> | A narrower, longer taper with a clear diagonal. Its root and attached leaves remain legible in the game-scale captures. | [Day](long-root-day.png) · [Night](long-root-night.png) |
| **D · Reverse lean** | <img src="reverse-lean-detail.png" width="200" alt="Carrot leaning in the opposite direction"> | Similar scale to A, but the leaves point right and the tip points left. Tests orientation separately from proportions. | [Day](reverse-lean-day.png) · [Night](reverse-lean-night.png) |

The script in [`captureVariants.mjs`](captureVariants.mjs) temporarily applies each geometry setting, captures it in the game, then restores the source. The other studies remain as comparisons; the current build uses C.

## Before and after

| Original pickup | Selected long-root design |
| --- | --- |
| ![Current carrot in Meadow by day](before-day.png) | ![Redesigned carrot in Meadow by day](after-day.png) |
| ![Current carrot in Meadow at night](before-night.png) | ![Redesigned carrot in Meadow at night](after-night.png) |

These are captures from running matches with three carrots placed at fixed coordinates and the Meadow day phase set to noon or midnight. Both versions use the same arena art and camera; wildlife and other match details may vary between captures. Inspect the whole scene at normal size: the pickup must remain recognizable near flowers, bushes, and platform edges. Foreground cover still draws over it.

![Redesigned carrot against Volcano's warm, dark scenery](after-volcano-day.png)

Volcano supplies a second palette check: the warm root still has a separate dark silhouette against lava-colored scenery. This arena does not use Meadow's day/night cycle.

`CARROT_SIZE` and the pickup collision box are unchanged. The art uses a handful of solid Canvas paths; it adds no bitmap download, blur, or per-frame gradient. The new drawing is shared across arenas, so other arena palettes remain follow-up visual checks during play.

To recapture either version from a running Vite server:

```bash
node docs/mockups/carrot-pickup/capture.mjs http://127.0.0.1:4196/bunnybrawl/ docs/mockups/carrot-pickup/after
```

The capture uses `?simWorker=off` so it can place carrots through the diagnostic match state, then saves day and night PNGs. Use the version of the code being compared for each capture.
Pass an arena ID as a third argument to inspect another setting.
