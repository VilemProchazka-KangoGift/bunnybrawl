# Character style prototypes — plush directions

The first Storybook and Cartoon studies were rejected. This set keeps the original **Soft toys** prototype and explores three stronger plush directions. The Pocket Plush Bunny now has a **mockup-only motion rig**. Playable character packs, hitboxes, foreground cover, and match animation remain unchanged.

The upper half of each capture is the production Meadow renderer at 1280 × 720. The lower strip enlarges the same five study characters: Bunny, Fox, Frog, Bear, and Owl. Positions, lighting phase, and random seed are fixed. Frog stands on the middle platform to keep all five visible outside deliberate bush cover. The source concept sheets are transparent and appear below the comparisons.

| Direction | Day at match scale | Night at match scale | Design question |
| --- | --- | --- | --- |
| **Current** | ![Current characters, day](current-day.png) | ![Current characters, night](current-night.png) | Baseline for silhouette and lighting. |
| **Original Soft toys** | ![Original Soft toys, day](plush-day.png) | ![Original Soft toys, night](plush-night.png) | The retained Canvas prototype: small fabric patches, seams, and button-like eyes. |
| **Pocket plush** | ![Pocket plush, day](pocket-plush-day.png) | ![Pocket plush, night](pocket-plush-night.png) | Compact padded heads, clear face panels, and distinct tails and wings. |
| **Floppy beanbags** | ![Floppy beanbags, day](floppy-beanbags-day.png) | ![Floppy beanbags, night](floppy-beanbags-night.png) | Relaxed, bottom-heavy masses and asymmetrical appendages. |
| **Layered felt** | ![Layered felt, day](layered-felt-day.png) | ![Layered felt, night](layered-felt-night.png) | Broader flat shapes and overlapping felt pieces closer to Meadow's drawn props. |

## Pocket Plush Bunny motion test

![Bunny run, jump, and fast fall in Meadow](pocket-bunny-motion.gif)

| Day, with idle/run/jump/fast fall poses | Night, same renderer and lighting |
| --- | --- |
| ![Pocket Plush Bunny motion rig, day](pocket-bunny-rig-day.png) | ![Pocket Plush Bunny motion rig, night](pocket-bunny-rig-night.png) |

The Bunny's ears and feet are masked into separate layers from the existing concept sheet. The four-frame run cycle rotates them around fixed pivots; jump tucks the feet and sweeps the ears. The production renderer applies its existing bounce, fast fall squash, lighting, outline, and sprite cache. Other animals retain their static Pocket Plush concepts for a like-for-like comparison. The GIF's path is manually keyed for the mockup; it does not show live physics or input.

In a local headless Chromium run, the full Meadow frame measured **0.349 ms** with static Pocket Plush and **0.316 ms** with the Bunny rig (median of five samples, 400 warmed frames per sample, same run pose). The rig did not increase steady-state render time in this probe. It does **not** establish cold load cost or performance across devices. The source sheet still weighs 1.82 MB and needs a compact Bunny-only export before shipping. At game scale the motion reads, though the limb movement is subtle and could use authored poses if we want a more elastic look.

## Full-size concept art

| Pocket plush | Floppy beanbags | Layered felt |
| --- | --- | --- |
| ![Pocket plush concept sheet](v2/pocket-plush-concept.png) | ![Floppy beanbags concept sheet](v2/floppy-beanbags-concept.png) | ![Layered felt concept sheet](v2/layered-felt-concept.png) |

These high-resolution concepts were generated from art briefs. The match-scale previews crop and draw them as static raster sprites through the production renderer. The original Soft toys prototype remains procedural Canvas art. At match scale the three new directions gain recognizable silhouettes; fine felt and fabric texture largely disappears. Night still dims Bear and Owl considerably, so their pale face and chest areas need further tuning if either direction is selected.

## Animation and rendering feasibility

- The static previews prove that the designs can be placed and sprite-cached in the current renderer. The Bunny rig additionally tests simple cutout animation and steady-state render cost, but not live-match performance or loading size.
- Whole-sprite lean, squash, stretch, and bounce can use existing transforms. For convincing floppy ears, fox tail, owl wings, and character-specific run and air poses, the selected design needs separated layers or a small authored pose atlas. The generated sheets have no independent body parts.
- The three source sheets total about 4.8 MB and are unsuitable as production assets. A production pass should export compact per-character sprites or an atlas at the actual display scale, then measure loading budget and the default and `simWorker=off` modes.
- Keep opaque foreground bushes over players. Any character outline, face highlight, or moving appendage must remain inside the player layer so cover still hides it.

If this Bunny motion direction works visually, the next step is a compact Bunny-only asset and a temporary playable pack tested in both worker modes. That would verify live input, jump timing, occlusion, and loading budget before expanding to Fox or the full roster.

## Reproduce

Run `npx vite --host 127.0.0.1 --port 4193` from the repository root, then `node docs/mockups/character-styles/capture.mjs` for the style gallery and `node docs/mockups/character-styles/captureBunnyMotion.mjs` for the Bunny captures, GIF, and warmed-frame timing. Captures use a fixed viewport and fail on browser page errors. The PNGs and GIF are committed so no local server is needed for review.
