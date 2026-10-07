# Meadow illustrated-background experiment

This applies the same cartoon-versus-procedural experiment as the Winter Lake study to the **existing Meadow** arena. It is a style study, not a game-art change. The matched captures below use the real production renderer, platform geometry, props, opaque hiding bushes, five character sprites, HUD, clouds, and day/night treatment. Only the distant background plate changes. The frozen state, camera, and 1280 × 720 output are identical.

| Background | Day | Night | Reading at game size |
| --- | --- | --- | --- |
| **Current production** | ![Production Meadow day](reference-day.png) | ![Production Meadow night](reference-night.png) | Clearest play space; restrained hills and texture. |
| **Painted valley** | ![Painted valley day](painted-day.png) | ![Painted valley night](painted-night.png) | Strong storybook setting, but hills climb behind too many platforms and the tree/detail density competes with gameplay. |
| **Low painted valley** | ![Low painted valley day](low-valley-day.png) | ![Low painted valley night](low-valley-night.png) | Keeps open blue sky behind upper play lanes while adding soft layered hills and a hand-painted texture below. Best direction of these two composites. |

The low valley is promising, especially in daylight, but the background and unchanged foreground props still have different mark-making styles. Its blue sky texture is more visible than the current gradient, and the hill color can be quieted further. It should be treated as a reference for drawing a procedural or hand-authored Meadow backdrop, not as a production-ready texture. A static full-screen image also needs a memory/performance and resolution check before integration.

## Full-scene style concepts

These image-generation paintovers explored art direction before extracting the clean plate. **They are not matched gameplay captures**: the generator repainted characters, bushes, flowers, platforms, and HUD, changing their shapes and details. They must not be used as arena art or as evidence that gameplay cover is preserved.

| Gouache storybook | Inked cartoon storybook |
| --- | --- |
| ![Gouache Meadow concept](gouache-concept.png) | ![Inked Meadow concept](inked-concept.png) |

The gouache version gives the meadow a warm illustrated finish, but its soft edges stray from the current outlined props. The inked version relates more closely to the stage's existing silhouettes. The two clean background plates are [painted valley](landscape-plate.png) and [low valley](low-valley-plate.png).

## Reproduction and source

All four generated images were made with the built-in image generator. The gouache and inked concepts each used the [production Meadow day capture](../meadow-backgrounds/production-day.png) as an image reference. The first prompt requested painted storybook texture, rounded layered hills, a morning-blue sky, and readable character lanes. The second requested expressive uneven ink contours and simpler cel-shaded hills. The painted valley plate was edited from the inked concept with all platforms, ground, characters, props, bushes, HUD, clouds and sun removed. The low valley plate was edited from that clean plate, moving the ridge lower and reducing trees and detail. The generated source images are saved in this folder; [the fixture override](../meadow-backgrounds/render.ts) draws either plate at 76% opacity over the game's sky gradient, before real platforms and game objects. The real day/night overlay remains in charge of lighting.

To reproduce the matched captures, start Vite from the repository root with `npx vite --host 127.0.0.1 --port 4223`, then run `node docs/mockups/meadow-painted/capture.mjs`. The script fails on browser page errors. Direct fixture URLs can be used for live inspection: `?variant=production`, `?variant=painted-landscape`, or `?variant=painted-low-valley`, each with `&time=day` or `&time=night` at `/bunnybrawl/docs/mockups/meadow-backgrounds/render.html`.
