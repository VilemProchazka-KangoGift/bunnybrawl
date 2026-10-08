# Winter Lake redesign: decisions and reusable lessons

This case study records the Winter Lake work through the Pearl background, Canvas ice platforms, painted cover bushes and igloo, decluttered props, and deeper ice-cube faces. “Current” below refers to the playable local `features/winter-lake-props` worktree; the prop and cube changes have not been published to main. The [visual style guide](../../../.claude/skills/visual-style/SKILL.md#arena-redesign-sequence) is the generic procedure. The [background](README.md), [platform](../winter-platforms/README.md), and [prop](../winter-props/README.md) galleries preserve the actual comparisons, including rejected versions. Treat each gallery's early conclusions as history; the current local selection is listed below.

## Current playable choices and fixed contracts

| Element | Current treatment | Contract that guided the choice |
| --- | --- | --- |
| Distant scenery | Subtle Pearl Painted image plate over the existing sky, with a procedural fallback | Give pale, dark, warm, and green characters contrast; keep the upper lanes open and the lake recognizable. |
| Playable ice | Canvas-drawn snow caps and faceted ice, with a darker right return | Keep every landing top, collision rectangle, slippery surface, and body-cover layer in place. |
| Ground ice cubes | Same Canvas material with 9 logical pixels more visible front-face depth and a contact shadow | The top and hitbox stay fixed; depth is a drawing adjustment. |
| Props | Canvas firs and shaded snowmen; compact painted igloo; two painted snowy bushes | Leave spawn and jump lanes clear. Bushes draw over players as intentional hiding cover. |

The current renderer is visible in the [day](../winter-props/paint-replacement-day.png), [night](../winter-props/paint-replacement-night.png), and [cover](../winter-props/paint-replacement-cover.png) captures. Those are matched stills from the production `Renderer`, not proof of moving play at every display size. The art pass has not yet finished arena-specific hazards, springs, pickups, weather, or a full motion review.

## Background: find a place, then quiet it for play

1. **Start with a real baseline.** The old distant triangles and decorated pines said “winter,” but did not clearly establish a frozen lake. Fixed characters and identical noon/night phases made changes comparable. The first concepts varied shoreline, enclosure, and color rather than only texture.
2. **Use composition to protect movement.** Polar Gap supplied a strong center opening, but its pointy cliffs felt aggressive near outer lanes. Open Pass widened that opening; rounded Soft Shoulders made it friendlier. Two mirrored hills then looked synthetic, so later banks had independent crests and unequal heights.
3. **Separate snow, hills, and water by value and hue.** Dark hills distracted from players. Soft Shoulders' lens-shaped lake and repeated top waves looked constructed. Wind Carved reduced those waves and varied its shoreline, but its major layers sat too close in color. Silver Banks separated neutral snow from bluer ice; its sharp left-bank corner needed a broad, continuous curve. Richer frost texture helped only while it stayed behind characters and landing edges.
4. **Use painting where atmosphere matters.** Extra vector hatching and gouache marks still read as simple procedural scenery. The painted study added believable snow and ice texture, but its first high banks occupied too much play space. A lower, paler Pearl plate kept the illustrated surface while leaving open sky and quieter lower slopes. It became the selected background after a matched day/night comparison.
5. **Integrate the plate as scenery, not a screenshot.** A generated full-scene concept can move characters or platform edges. Use a clean background-only plate beneath the real platforms, animated sky, characters, and opaque foreground cover. Winter Lake's optimized 1280 × 720 WebP is about 76 KB, compared with about 1.87 MB for its source PNG. It is baked into the static background, prefetched by menu/lobby flows, decoded in each canvas-owning worker, and backed by the procedural scene if loading fails. The [background study](README.md#production-adoption-and-platform-contrast-handoff) records the integration and the remaining lower-platform contrast issue that led to the next pass.

**Transferable rule:** Select the quietest backdrop that still establishes the place. A strong standalone painting can be a poor game background when pale characters or snowy landing caps cross it.

## Platforms: translate the reference's structure before its texture

The pale Pearl banks made the old white caps on lower shelves lose separation. Early Ink Rim and Glacial Ceramic versions improved hue and outline but still had a thin snow cap over a smooth plastic-looking face. Adding speckles, bubbles, or stripes did not supply the broad ice and snow masses visible in the painted target. The turning point was comparing the weak Canvas result with the painted target **at game scale**, naming the missing shapes, and asking for a structural redraw rather than a generic “more cartoon” pass. That instruction specified thick irregular snow overhang, one continuous inked silhouette, interlocking blue facets, a darker right return, branching cracks, and localized frost. The [platform gallery](../winter-platforms/README.md) and [Canvas implementation](../../../src/engine/arenas/packs/winterLakeVectorPlatforms.ts) retain the comparison.

The painted platform prototype was useful because it revealed the target at match scale, but whole-image stretching blurred small platforms and broke their outlines. Fixed painted end caps plus a continuous resizable center solved large shelf resizing; a repeated center tile made the ground look mechanical. Nine-slice treatment worked for a block. At roughly 40–65 px, the painted source still became noisy and exposed slice gaps, so a dedicated small silhouette was needed. Two online vectorizations clarified the tradeoff: the sparse trace flattened the brushwork and included an opaque white background; the detailed trace kept the texture but had roughly 4,272 paths and a 1 MB payload. SVG `drawImage` still rasterizes before Canvas compositing. The selected Canvas drawing keeps the material hierarchy and scales with platform geometry without importing those retained painted platform files at startup.

For future surfaces:

- Lock collision tops, bounds, friction, and the foreground body-cover pass before changing the picture. Use a separate collision-guide size study for tiny, ordinary, wide, ground, and block platforms.
- Draw connected large silhouettes and value planes first. Vary facet size by platform class and seed variation from stable geometry. Add small scratches only inside a few facets.
- Give the ground long quiet spans. Repeated snow teeth, facets, or icicles across the full width can become the scene's loudest stripe.
- A cube that looks recessed can project its **front face** slightly below the old ground line. Winter Lake used 9 pixels and a restrained contact shadow; its snow landing edge and hitbox did not move. Compare [before](../winter-props/cube-depth-before-day.png) and [after](../winter-props/paint-replacement-day.png).

## Props and cover: the whole layout decides whether art succeeds

Round Grove's painted concept had the strongest broad firs and friendly snow shapes. The first Canvas translation made four evenly spaced snow ribbons per fir and looked mechanical. Fewer, thicker snow pillows with dark boughs between them worked better. The first bush was an undifferentiated dark mound; reusing Meadow's Leafy and Hedge shapes repaired its botanical silhouette, but the snow caps still looked pasted onto a Meadow prop. The first Canvas igloo variants improved the dome and doorway yet still read as a simple blue shape beside the textured platforms. A painted **broadleaf bush, hedge, and block igloo** finally carried the intended detail at their fixed game sizes. The three optimized runtime WebPs total about 86 KB; their transparent source studies remain in the [prop gallery](../winter-props/README.md#painted-bush-and-igloo-replacement).

The bush is a gameplay object as well as decoration: it must hide a character. We initially put a solid green silhouette under each transparent painting to guarantee opacity. It protruded beyond the leaves as a visible green patch. The final paintings have dense, connected interior foliage, so we removed that backing and aligned the **visible leaves**, rather than the source image's transparent padding, with the ground. A matched cover capture checks the result. If another painted cover asset has actual holes, repair or mask only those holes inside the painted outline; a broad backing is not a safe shortcut.

Asset placement needed its own iteration. The old large snowman was obscured by a tree or shelf, the igloo by a right shelf, bushes touched ice cubes, and tiny firs and snowmen occupied too many jump surfaces. Moving the landmarks to open ground intervals exposed them, but the ground still held two bushes, two trees, a snowball pile, snowman, igloo, and cubes in one row. We removed the ground trees and pile, moved the igloo left and the right bush clear of the cube, emptied narrow ledges, and made the firs and snowmen on the two broad platforms larger. The snowmen gained a cool-side gradient, clipped underside shade, and restrained side crescent so they read as round snow rather than white circles. The current [full-scene capture](../winter-props/paint-replacement-day.png) is the placement check.

**Transferable rule:** Map every cube, cover bush, spawn, landmark, platform edge, and movement lane before adding small decoration. When the scene feels busy, remove repeated props and increase the scale of the few that matter. Detail on a hidden or tiny prop does not solve its placement.

## Production and review gates

| Gate | What it can establish | What it cannot establish alone |
| --- | --- | --- |
| Matched renderer stills at day, night, and with characters in bushes | Composition, color separation, landing cues, and cover at a known frame | Motion, all roster poses, sunset, small screens, or frame pacing |
| Size/collision study | Whether art scales and visual tops follow authored platform rectangles | How the whole level reads during play |
| Build and focused Vitest | Type correctness and tested pack/loading behavior | Appearance or worker-specific browser behavior |
| Winter Lake Playwright in default and `?simWorker=off` modes | Preload and match/arena-switch behavior in both supported worker modes | Subjective visual quality or a complete performance benchmark |
| One-time construction and cached foreground timings | Whether expensive prop drawing is kept out of the per-frame path | GPU frame time or device-wide load time |

For this arena, Pearl and the small prop WebPs use the existing speculative prefetch plus render-realm decode path. The complex Canvas platforms are drawn in the static background or cached overlay; the foreground bushes are cached in a cropped 2× transparent region and blitted over players. Keep the procedural/Canvas fallbacks for failed optional image loads. Measure new image bytes and one-time construction separately from per-frame work. The [prop study](../winter-props/README.md) records the limited scope of the earlier timings.

The platform study measured roughly 3.58 ms for six Canvas platforms versus 0.07 ms for decoded WebPs in one warmed Chromium drawing-call benchmark; static background construction pays that cost on arena load, not every frame. An earlier prop microbenchmark measured roughly 2.8 ms for background props, 6.1 ms to build the cropped foreground cache, and 0.003 ms per cached foreground call. These are isolated JavaScript drawing measurements from earlier implementations, not a current GPU frame-time or loading benchmark. They justify caching and small asset payloads, but do not prove performance on every device.

The repeatable order remains: audit → background → playable surfaces → props and cover → actionable objects and atmosphere → integrated play review. At each step, retain a real baseline and meaningfully different candidates, compare native-size full scenes before enlarged detail, and carry forward a selected visual contract. Winter Lake is through the prop and cube-depth work; actionable objects, atmosphere, full motion review, sunset, and smaller-screen checks remain for the next passes.
