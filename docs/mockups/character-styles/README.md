# Character style prototypes — plush directions

The first Storybook and Cartoon studies were rejected. This set keeps the original **Soft toys** prototype and explores three stronger plush directions. Pocket Plush Bunny can now be played in a local match through an opt-in URL flag. The default Bunny, hitboxes, and foreground cover remain unchanged.

The upper half of each capture is the production Meadow renderer at 1280 × 720. The lower strip enlarges the same five study characters: Bunny, Fox, Frog, Bear, and Owl. Positions, lighting phase, and random seed are fixed. Frog stands on the middle platform to keep all five visible outside deliberate bush cover. The source concept sheets are transparent and appear below the comparisons.

| Direction | Day at match scale | Night at match scale | Design question |
| --- | --- | --- | --- |
| **Current** | ![Current characters, day](current-day.png) | ![Current characters, night](current-night.png) | Baseline for silhouette and lighting. |
| **Original Soft toys** | ![Original Soft toys, day](plush-day.png) | ![Original Soft toys, night](plush-night.png) | The retained Canvas prototype: small fabric patches, seams, and button-like eyes. |
| **Pocket plush** | ![Pocket plush, day](pocket-plush-day.png) | ![Pocket plush, night](pocket-plush-night.png) | Compact padded heads, clear face panels, and distinct tails and wings. |
| **Floppy beanbags** | ![Floppy beanbags, day](floppy-beanbags-day.png) | ![Floppy beanbags, night](floppy-beanbags-night.png) | Relaxed, bottom-heavy masses and asymmetrical appendages. |
| **Layered felt** | ![Layered felt, day](layered-felt-day.png) | ![Layered felt, night](layered-felt-night.png) | Broader flat shapes and overlapping felt pieces closer to Meadow's drawn props. |

## Pocket Plush Bunny motion test

### Play it in the game

Start the dev server with `npx vite --host 127.0.0.1 --port 4193`, then open [Meadow with Pocket Plush Bunny](http://127.0.0.1:4193/bunnybrawl/?arena=meadow&bots=1&pocketBunny=1). P1 controls are **A/D** to move, **W** to jump, and **S** to fall quickly. The URL starts a real match with one bot. Remove `pocketBunny=1` to return to the original Bunny. The alternate renderer worker mode is available by adding `&simWorker=off`.

![Pocket Plush Bunny in a live Meadow match](pocket-bunny-playable-day.png)

The image above was captured from a running match. Browser tests verify that P1 moves in both worker modes. The authored Bunny pose atlas loads only with the opt-in flag. The packed game atlas is 381 KB; the larger source paintings remain in this study folder.

### Motion study

![Bunny run, jump, fast stomp, landing, blink, and sit in Meadow](pocket-bunny-motion.gif)

| Day, with idle, sit, walk, jump, fast stomp, and impact poses | Night, same renderer and lighting |
| --- | --- |
| ![Pocket Plush Bunny motion rig, day](pocket-bunny-rig-day.png) | ![Pocket Plush Bunny motion rig, night](pocket-bunny-rig-night.png) |

This revision uses [11 authored poses in a compact atlas](v4/pocket-bunny-game-atlas.png): attentive idle, blink, three walk shapes, jump, fast stomp, landing impact, half-sit, and seated. The four-frame walk cycle repeats the passing shape. The original source art is retained in [v4](v4/); `packPocketBunnyAtlas.mjs` crops and packs the production-size sheet with a dark edge built at 4× game resolution. The generic outline, lean, run bounce, fast-fall stretch, landing squash, and transform-based idle actions are disabled for this Bunny only. Sprite caching, facing flip, gameplay physics, and foreground bush cover remain. Other animals retain their static Pocket Plush concepts for comparison. The GIF's path is manually keyed; it does not show live physics or input.

### Performance and audio check

Headless Chromium on this development machine, three fresh browser contexts per variant, production preview, Meadow with one bot:

| Mode | Original Bunny: median arena ready | Pocket Bunny: median arena ready | Frame median and p95 |
| --- | ---: | ---: | --- |
| Default simulation worker | 1467 ms | 1531 ms | 16.66 / 16.67 ms for both |
| `simWorker=off` | 1073 ms | 1129 ms | 16.66 / 16.67 ms for both |

The prototype adds about **56–64 ms** to cold arena entry here, while neither variant missed the browser's 60 fps cadence during the two-second frame sample. A separate warmed full-renderer probe measured **0.348 ms** for the current procedural roster, **0.278 ms** for static Pocket Plush, and **0.263 ms** for the authored Bunny with the other four Pocket Plush concepts. The full-renderer styles change other characters too, so that probe is indicative only. These short local runs do not establish performance on slower devices or explain every aspect of perceived movement speed. The packed atlas transfers 381,323 bytes instead of the old 1.50 MB source sheet. Reproduce with `benchmarkPocketBunny.mjs` against a production preview and `captureBunnyMotion.mjs` against a dev server.

Direct arena entry can finish loading without browser user activation. If autoplay rejects the arena MP3, the first gameplay key, pointer, or touch now retries playback; pause/unpause is no longer required. A browser test forces that rejection and checks that the retry does not create a second track.

## Full-size concept art

| Pocket plush | Floppy beanbags | Layered felt |
| --- | --- | --- |
| ![Pocket plush concept sheet](v2/pocket-plush-concept.png) | ![Floppy beanbags concept sheet](v2/floppy-beanbags-concept.png) | ![Layered felt concept sheet](v2/layered-felt-concept.png) |

These high-resolution concepts were generated from art briefs. The match-scale previews crop and draw them as static raster sprites through the production renderer. The original Soft toys prototype remains procedural Canvas art. At match scale the three new directions gain recognizable silhouettes; fine felt and fabric texture largely disappears. Night still dims Bear and Owl considerably, so their pale face and chest areas need further tuning if either direction is selected.

## Animation and rendering feasibility

- The static previews prove that the designs can be placed and sprite-cached in the current renderer. The 11-pose Bunny atlas runs in a real match in both worker modes; slower devices remain unmeasured.
- The original flattened concept could not produce clean joints: moving cutouts exposed missing art and scarred the forehead. Authored whole-body poses solve that for Bunny. Other characters still need their own pose art if selected.
- Keep large source sheets out of the runtime bundle. Pack at game scale and benchmark both arena entry and live frame pacing.
- Keep opaque foreground bushes over players. Any character outline, face highlight, or moving appendage must remain inside the player layer so cover still hides it.

The next decision is a longer hands-on gameplay review of pose timing, occlusion, and input feel before expanding to Fox or the full roster.

## Reproduce

Run `npx vite --host 127.0.0.1 --port 4193` from the repository root, then `node docs/mockups/character-styles/capture.mjs` for the style gallery and `node docs/mockups/character-styles/captureBunnyMotion.mjs` for the Bunny captures, GIF, and warmed-frame timing. Captures use a fixed viewport and fail on browser page errors. The PNGs and GIF are committed so no local server is needed for review.
