# Character style prototypes — plush directions

The first Storybook and Cartoon studies were rejected. This set keeps the original **Soft toys** prototype and explores three stronger plush directions. It is **visual exploration only**: playable character packs, hitboxes, foreground cover, and match animation remain unchanged.

The upper half of each capture is the production Meadow renderer at 1280 × 720. The lower strip enlarges the same five study characters: Bunny, Fox, Frog, Bear, and Owl. Positions, lighting phase, and random seed are fixed. Frog stands on the middle platform to keep all five visible outside deliberate bush cover. The source concept sheets are transparent and appear below the comparisons.

| Direction | Day at match scale | Night at match scale | Design question |
| --- | --- | --- | --- |
| **Current** | ![Current characters, day](current-day.png) | ![Current characters, night](current-night.png) | Baseline for silhouette and lighting. |
| **Original Soft toys** | ![Original Soft toys, day](plush-day.png) | ![Original Soft toys, night](plush-night.png) | The retained Canvas prototype: small fabric patches, seams, and button-like eyes. |
| **Pocket plush** | ![Pocket plush, day](pocket-plush-day.png) | ![Pocket plush, night](pocket-plush-night.png) | Compact padded heads, clear face panels, and distinct tails and wings. |
| **Floppy beanbags** | ![Floppy beanbags, day](floppy-beanbags-day.png) | ![Floppy beanbags, night](floppy-beanbags-night.png) | Relaxed, bottom-heavy masses and asymmetrical appendages. |
| **Layered felt** | ![Layered felt, day](layered-felt-day.png) | ![Layered felt, night](layered-felt-night.png) | Broader flat shapes and overlapping felt pieces closer to Meadow's drawn props. |

## Full-size concept art

| Pocket plush | Floppy beanbags | Layered felt |
| --- | --- | --- |
| ![Pocket plush concept sheet](v2/pocket-plush-concept.png) | ![Floppy beanbags concept sheet](v2/floppy-beanbags-concept.png) | ![Layered felt concept sheet](v2/layered-felt-concept.png) |

These high-resolution concepts were generated from art briefs. The match-scale previews crop and draw them as static raster sprites through the production renderer. The original Soft toys prototype remains procedural Canvas art. At match scale the three new directions gain recognizable silhouettes; fine felt and fabric texture largely disappears. Night still dims Bear and Owl considerably, so their pale face and chest areas need further tuning if either direction is selected.

## Animation and rendering feasibility

- The previews prove that the static designs can be placed and sprite-cached in the current renderer. They do **not** prove expressive animation, loading size, or frame-rate cost in a live match.
- Whole-sprite lean, squash, stretch, and bounce can use existing transforms. For convincing floppy ears, fox tail, owl wings, and character-specific run and air poses, the selected design needs separated layers or a small authored pose atlas. The generated sheets have no independent body parts.
- The three source sheets total about 4.8 MB and are unsuitable as production assets. A production pass should export compact per-character sprites or an atlas at the actual display scale, then measure loading budget and the default and `simWorker=off` modes.
- Keep opaque foreground bushes over players. Any character outline, face highlight, or moving appendage must remain inside the player layer so cover still hides it.

The next useful experiment is to choose one direction, build **Bunny and Fox** with idle, run, jump, and fast-fall poses, and record a short live gameplay clip at native and reduced display sizes. That will test whether the art can move convincingly before extending it to all 19 characters.

## Reproduce

Run `npx vite --host 127.0.0.1 --port 4193` from the repository root, then `node docs/mockups/character-styles/capture.mjs`. The script captures both day and night at a fixed viewport and fails on browser page errors. The PNGs are committed so no local server is needed for review.
