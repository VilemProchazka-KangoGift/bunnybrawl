# Pocket Plush roster · remaining character studies

This gallery completes **visual pose studies for all 19 built-in characters**. Bunny is the playable prototype; [batch 1](../character-roster-batch-1/README.md) covers Fox and Frog, [batch 2](../character-roster-batch-2/README.md) covers Bear, Owl, and Cat, and this page covers the other 13. The new animals here are **review previews**, not live gameplay replacements.

The [expressive roster pass](../character-roster-expressive/README.md) revisits **all 19** with more varied body shapes, personalities, and trait-driven walk, sit, stomp, and landing poses. Use that newer gallery when choosing a direction for playable integration; this page preserves the first full-roster comparison.

Each board puts the current procedural character above ten proposed authored poses: resting idle, three walk phases, jump, attentive idle, blink, sit, angry fast stomp, and landing impact. A small pair at the foot of every tile shows match scale. The original has no separate authored drawing for every listed beat, so its closest existing state is shown repeatedly. The boards compare art and acting vocabulary, not animation timing or responsiveness.

## Tailed and compact animals

### Wolf

![Wolf original and proposed poses](wolf-comparison.png)

Pointed ears, shaggy cheeks, gray coat, and a broad tail separate Wolf from Fox. The walk pushes its feet forward while the angry pose keeps the cheeks and body volume.

### Panda

![Panda original and proposed poses](panda-comparison.png)

Black ears, eye patches, and legs define the soft round shape. Its dark markings need the pale facial plane to stay readable at night.

### Pig

![Pig original and proposed poses](pig-comparison.png)

The round snout, floppy ears, and short hooves carry its identity. Its stomp uses the face and a planted foot rather than generic squash.

### Cow

![Cow original and proposed poses](cow-comparison.png)

The black patches, small horns, wide ears, pink muzzle, and hooves remain attached through movement. Check patch placement when the art is mirrored for facing direction.

### Goat

![Goat original and proposed poses](goat-comparison.png)

Curled horns, floppy ears, a little beard, and narrow hooves distinguish Goat from Cow and Sheep. The head details should not become the only recognition cue at match scale.

## Hooves, wool, and energetic tails

### Horse

![Horse original and proposed poses](horse-comparison.png)

Its longer muzzle, mane, and tail give Horse a taller outline than the other hoofed animals. The walk has alternating hoof contacts rather than a translated idle drawing.

### Sheep

![Sheep original and proposed poses](sheep-comparison.png)

A connected wool silhouette and dark hooves set Sheep apart from Goat. The wool still needs to read as one body when the limbs move.

### Monkey

![Monkey original and proposed poses](monkey-comparison.png)

The face mask, broad ears, hand gestures, and curling tail make an agile silhouette. Its tail is a secondary acting feature, not a separate floating ornament.

### Tiger

![Tiger original and proposed poses](tiger-comparison.png)

Orange-and-black stripes, round ears, cheek shape, and ringed tail keep Tiger apart from Cat. The dark stripes must hold together at native size and at night.

### Rhino

![Rhino original and proposed poses](rhino-comparison.png)

Rhino keeps a heavy rounded mass with a clear forehead horn. The horn and short legs remain visible in the small walk and stomp poses.

## Small and unusual silhouettes

### Hedgehog

![Hedgehog original and proposed poses](hedgehog-comparison.png)

Its continuous quill crown and back, pale face, and short limbs make a compact silhouette. Quills stay attached during the attack and landing.

### Chick

![Chick original and proposed poses](chick-comparison.png)

Wings and orange three-toed feet do the acting; Chick does not borrow mammal arms. The brighter yellow stays distinct from Meadow foliage, while its black outline carries the night read.

### Axolotl

![Axolotl original and proposed poses](axolotl-comparison.png)

Three feathery gill branches on each side, webbed feet, and a broad aquatic tail define the shape. The gills have enough source padding to remain whole in every cropped pose.

## Meadow comparisons

Each pair below uses the production Meadow renderer, with the **same five characters, positions, arena, and time of day**. The preview uses the source-sheet packs only for this page. Opaque foreground bushes still hide players as intended.

| Group A: Wolf, Panda, Pig, Cow, Goat | Original | Pocket Plush preview |
| --- | --- | --- |
| Day | ![Group A originals in Meadow by day](meadow-a-original-day.png) | ![Group A previews in Meadow by day](meadow-a-preview-day.png) |
| Night | ![Group A originals in Meadow at night](meadow-a-original-night.png) | ![Group A previews in Meadow at night](meadow-a-preview-night.png) |

| Group B: Horse, Sheep, Monkey, Tiger, Rhino | Original | Pocket Plush preview |
| --- | --- | --- |
| Day | ![Group B originals in Meadow by day](meadow-b-original-day.png) | ![Group B previews in Meadow by day](meadow-b-preview-day.png) |
| Night | ![Group B originals in Meadow at night](meadow-b-original-night.png) | ![Group B previews in Meadow at night](meadow-b-preview-night.png) |

| Group C: Hedgehog, Chick, Axolotl, Bunny, Fox | Original | Pocket Plush preview |
| --- | --- | --- |
| Day | ![Group C originals in Meadow by day](meadow-c-original-day.png) | ![Group C previews in Meadow by day](meadow-c-preview-day.png) |
| Night | ![Group C originals in Meadow at night](meadow-c-original-night.png) | ![Group C previews in Meadow at night](meadow-c-preview-night.png) |

## Source and reproduction

Every animal has a `*-poses-source.png` original and a `*-poses-atlas.png` normalized review atlas in this folder. Generated source poses did not sit on exact grid boundaries; the [atlas preparation script](prepare_atlases.py) finds the transparent gaps and centers each pose in its own cell. This prevents tails, gills, and other appendages from being clipped or leaking into the next preview. The script requires Pillow and NumPy. The [comparison renderer](render.ts), [preview packs](previewPacks.ts), and [capture script](capture.mjs) reproduce the PNGs from a running Vite server:

```text
python docs/mockups/character-roster-completion/prepare_atlases.py
node docs/mockups/character-roster-completion/capture.mjs <running-vite-base-url>
```

The base URL includes `/bunnybrawl/` and a trailing slash. The capture waits for the renderer and fails on browser errors. These review atlases are not optimized runtime assets. Before a character becomes playable, it needs tested pose timing, transitions, both facing directions, lobby presentation, status expressions, and cold-load/frame-time measurement. Gameplay hitboxes and the Meadow arena are unchanged here.
