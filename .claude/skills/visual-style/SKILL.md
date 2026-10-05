---
name: carrot-royale-visual-style
description: Use for Carrot Royale arena or character visual redesigns, procedural Canvas art, background palettes, foliage, platforms, and visual mockups. Keep characters readable against backgrounds while preserving intentional foreground hiding.
---

# Carrot Royale visual style

Use the [mixed Meadow day](../../../docs/mockups/meadow-mixed-props/production-day.png) and [night](../../../docs/mockups/meadow-mixed-props/production-night.png) captures as the current art reference. They show the production renderer, not isolated asset drawings. Apply the visual language to other arenas without copying Meadow's green palette or plant motifs into every setting.

## Visual hierarchy

1. Characters, hazards, pickups, and landing surfaces must be recognizable immediately at the game's 1280 × 720 logical size and when displayed smaller.
2. Playable platforms have clear tops, visible depth, and a distinct boundary against the scenery.
3. Foreground cover may hide characters where the game deliberately uses it as cover. This is a gameplay exception to character visibility, not a reason to make the whole background blend with players.
4. Distant scenery supplies atmosphere with broad, quiet shapes and less contrast and detail than the playfield.

## Drawing language

- Aim for a hand-drawn storybook look: rounded but irregular silhouettes, restrained dark outlines, layered color, and a few intentional interior marks. Avoid uniform circles, airbrushed gradients, and texture everywhere.
- Give every large prop a coherent mass. Attach leaves and blossoms to that mass so a bush reads as a living plant rather than a rock or a loose pile of leaves. Keep the outline uneven and botanical.
- Vary silhouettes and detail density. A dense hedge, an open leafy bush, and a flowered thicket should be distinguishable at a glance, even when their colors are similar.
- Keep highlights and tiny details secondary to the silhouette. At match scale, the shape must still work after petals, veins, or pebbles become too small to see.
- Meadow's olive ink (`#334937`), greens (`#31523c`, `#6d8c4c`, `#a3b966`), warm earth (`#ad7953`), and pale yellow blossoms (`#f1d56e`) are references for their *roles*. Choose equivalent colors that suit each new arena.

## Backgrounds: contrast with characters

- Design sky, hills, distant trees, and other backdrops around the character roster, not as standalone illustrations. Aim for a clear difference in value, hue, or both behind each character. Check light, dark, warm, and green characters; a palette that suits Bunny may lose Frog.
- Prefer muted, cooler, lower-detail distance layers behind saturated character colors and crisp foreground outlines. Meadow's morning-blue sky and softened hills are one example, not a universal background color.
- Keep the busiest background edges away from common movement lanes, spawn points, and platform tops. Use broad shapes and atmospheric separation so moving characters remain easy to track.
- Check noon, sunset, and night. A night tint must retain enough separation for dark characters and platform edges; bright sky or lighting effects must not wash out pale characters. If a character disappears, first adjust the backdrop's value, saturation, or local detail.
- Judge contrast in the full scene at native size and at a smaller display size. A quick grayscale or squint check exposes value collisions that hue alone can hide. Review moving gameplay as well as still screenshots.
- **Keep deliberate cover opaque.** Foreground bushes render over players and are supposed to hide them. Improve readability of the rest of the scene without thinning, fading, or moving those bushes solely to expose characters.

## Meadow reference props

| Prop | What to preserve |
| --- | --- |
| Leafy bush | An irregular crown with visible attached leaves and small warm accents. |
| Hedge bush | A denser, continuous foliage silhouette with clustered leaf texture. |
| Flower thicket | The former Berry shape, with pale yellow five-petal blossoms in place of its berries; no exposed branch structure. |
| Flowers and mushrooms | Simple readable storybook shapes, sized in proportion to 32 × 32 characters. Use accents sparingly. |
| Platforms and stumps | A visible top cap, warm front face, darker side face, inked edge, and enough irregularity to feel organic. Preserve the fake 3D depth. |

The three bush styles coexist in Meadow. Their current placement and drawing live in [`meadowSelectedArt.ts`](../../../src/engine/arenas/packs/meadowSelectedArt.ts), with background and foreground positions in [`meadow.ts`](../../../src/engine/arenas/packs/meadow.ts). Background bushes sit behind players; opaque foreground bushes draw over them. Platform front-face overlays also draw after players, preserving the sense of moving behind the terrain. Art changes must preserve the collision plane and these layer relationships.

## Redesign and review loop

1. Start with several materially different shapes or compositions, rendered in the actual arena and renderer. Show the current scene alongside candidates at identical camera, character positions, and time of day.
2. Inspect the whole arena before polishing a single prop. Check character contrast, landing-surface clarity, cover behavior, and whether repeated decorations become clutter.
3. Compare day and night, then watch live gameplay with different characters. Check the default simulation worker and `?simWorker=off` when integrating changes that touch arena rendering.
4. Keep detailed static scenery in the background and foreground caches. Avoid expensive gradients, shadows, or large numbers of new paths in the per-frame draw path; see [`performance.md`](../performance.md).
5. Save reviewable captures with the change. If the Meadow composition changes intentionally, refresh and rerun the visual baseline in `e2e/lighting-baseline.spec.ts`.

For arena geometry and draw-layer contracts, also read [`level-design.md`](../level-design.md). For character silhouette and sprite-caching rules, read [`character-sprites.md`](../character-sprites.md).
