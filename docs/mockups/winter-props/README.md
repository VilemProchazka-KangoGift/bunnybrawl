# Winter Lake props and cover: redesign step 4

The original prop study held the Pearl background and Astra Canvas platforms fixed while comparing decorative art: snowmen, igloo, evergreens, the snowball pile, and two cover bushes. The first study kept the old bush positions at x=350 and x=960; later production passes changed placements and projected the ice cube faces. The fixture uses the production `Renderer`, fixed characters and arena geometry, and matched day and night states. Action art and atmosphere were handled in later [Ink Bell](../winter-actionable/README.md) and [Glacier Teal](../winter-atmosphere/README.md) passes. See the [cross-pass lessons and current selections](../winter-lake/LESSONS.md) for the full decision trail; this gallery's captures precede those two passes.

## Full-scene choices

| Direction | Day | Night | Main design difference |
| --- | --- | --- | --- |
| **Current baseline** | ![Current day](current-day.png) | ![Current night](current-night.png) | Repeated flat triangular evergreens, tiny white snowmen, plain igloo and snowball pile. |
| **Round Grove** | ![Round Grove day](painted-round-day.png) | ![Round Grove night](painted-round-night.png) | Plush wide boughs, generous snow cushions, compact dark-leaf bushes, friendly scarfed snowmen. Closest to the soft storybook mood. |
| **Wind Carved** | ![Wind Carved day](painted-wind-day.png) | ![Wind Carved night](painted-wind-night.png) | Asymmetric swept branches and low drifting bush, calmer blue scarf and rugged snow masses. Gives the level motion without changing gameplay. |
| **Lake Cedar** | ![Lake Cedar day](painted-cedar-day.png) | ![Lake Cedar night](painted-cedar-night.png) | Wide cedar layers with turquoise icy tips and a bright glacial igloo. Has the clearest lake-specific material accent, but the bush is close to reading as a snow-covered ice pile. |

The [source concept sheet](prop-direction-sheet.png) shows each prop at a readable size. A [transparent atlas](prop-atlas-transparent.png) is cropped into the fixed prop positions by the [fixture painter](illustrated.ts). These are **painted mockups**, not the production assets or a commitment to use one atlas for every tiny prop. At 18–30px, fine painting is compressed; a chosen direction will need a separate small-scale treatment for those pieces. The generated snowmen's stick arms are exploratory; their silhouettes must not be mistaken for hazards. All gameplay geometry is unchanged.

### Cover check

In the original painted study, the foreground bushes were drawn in the same layer and at the old ground positions. Each had a continuous opaque dark leaf body under the illustrated cutout, so its painted texture could not expose a hidden player through transparent holes. The historical captures placed Bunny and Wolf behind both bushes. The later Canvas cleanup uses Meadow's selected bush silhouettes and moves the two bushes slightly away from the ice cubes, still drawing them over players.

| Current cover | Round Grove | Wind Carved | Lake Cedar |
| --- | --- | --- | --- |
| ![Current cover](current-cover.png) | ![Round cover](painted-round-cover.png) | ![Wind cover](painted-wind-cover.png) | ![Cedar cover](painted-cedar-cover.png) |

## Original study occupancy and review constraints

| Layer | Positions retained | Review concern |
| --- | --- | --- |
| Background landmarks | Snowman at left x=55; igloo at right x=1080–1260 | Leave spawn areas and the right portal readable. The left snowman shares space with a foreground fir and remains partly obscured, as before. |
| Background trees and figures | Ground x=200, 640, 1200; proportional placements on shelves | Avoid a uniform row of identical trees; keep the central bridge clear around moving characters. |
| Foreground cover and accents | Bushes x=350 and x=960, edge firs x=50 and x=1230, snowball pile x=850 | Keep bushes opaque over players and avoid a foreground glow or gaps. |

These positions describe the original painted study. Subsequent Canvas and painted production passes changed them as described below.

The illustrated variants are stronger than the first directly coded [Canvas sketches](round-grove-day.png), [wind sketch](wind-carved-day.png), and [cedar sketch](lake-cedar-day.png). Those sketches preserved the layout and layering, but their identical small snow ribbons made the trees look mechanical. The painted reference made the missing shape language obvious: thicker irregular snow, distinct bough profiles, texture inside connected masses, and variation between tree types. The sketches remain in the gallery as a record of that failed first pass. At this stage, the next step was to choose or mix the strongest prop shapes, translate them into a production treatment, and check live occlusion and load cost. Round Grove was the first preference for cover and broad tree mass, with occasional Wind Carved trees for variety; Lake Cedar's icy accents needed restraint so they did not compete with playable ice. The production outcome is documented below.

## Round Grove Canvas implementation

The first production translation drew the selected direction with Canvas paths in [`winterLakeRoundGroveProps.ts`](../../../src/engine/arenas/packs/winterLakeRoundGroveProps.ts). At that stage, background props were drawn when the static layer was built; foreground bushes and snowballs were drawn into a cropped transparent `OffscreenCanvas` at 2× resolution and blitted over players each frame. Later passes removed the snowball pile and replaced the bush drawings, while retaining the cropped foreground cache. Arena collision rectangles and landing heights remained unchanged. The original painted sheet and the earlier Canvas sketch remain visible above for comparison.

| New Canvas day | New Canvas night | New Canvas cover |
| --- | --- | --- |
| ![Canvas Round Grove day](canvas-round-day.png) | ![Canvas Round Grove night](canvas-round-night.png) | ![Canvas Round Grove cover](canvas-round-cover.png) |

The first translation still looked mechanical because every fir had four thin, regularly spaced snow ribbons. The second pass removed one tier and kept a deeper dark bough visible beneath each thicker snow mass. A live play review exposed the next problem: the old snowman was behind a foreground tree and shelf; the igloo was hidden by a right shelf; the bushes overlapped ice cubes; many tiny decorations crowded the jump surfaces. The cleanup moved the large shaded snowman to x=485, the igloo into open central ground, and the cover bushes to x=300 and x=990. It removed most decorations from small steps and the foreground bridge tree. The firs gained dark side planes and blue-gray snow shading. The bushes now call the actual Meadow Leafy and Hedge drawings, with light snow caps added afterward. Their silhouettes remain opaque over players.

### Igloo iterations in the cleaned arena

| Blue Brick (provisional game choice) | Snow Stone | Arched Door |
| --- | --- | --- |
| ![Blue Brick igloo](igloo-blue-brick.png) | ![Snow Stone igloo](igloo-snow-stone.png) | ![Arched Door igloo](igloo-arched-door.png) |
| ![Blue Brick igloo at night](igloo-blue-brick-night.png) | ![Snow Stone igloo at night](igloo-snow-stone-night.png) | ![Arched Door igloo at night](igloo-arched-door-night.png) |

The earlier right-side igloo looked like a flat ice tent once a shelf covered its top. These three were rebuilt as curved block domes with offset seams, a shaded roof, and a dark doorway. Blue Brick had the clearest form against the pale lake. Snow Stone was softer but got lost against the snowy banks; Arched Door had a wider, lower body and a side entry. All three use the same new ground interval and keep gameplay geometry unchanged. Blue Brick became the fallback after the painted replacement below.

### Painted bush and igloo replacement

In the live game, the Canvas bushes still looked like Meadow foliage with snow stickers, and the Blue Brick igloo still read as a simplified blue dome. We generated fresh transparent paintings for a broadleaf berry bush, a compact hedge, and a hand-built block igloo. The bushes have a connected dark foliage mass under individually readable leaves, three irregular snow loads, and sparse berries. The igloo has staggered icy blocks, a snow roof, and an offset dark doorway. In that first replacement pass, other props and platforms stayed as they were; the current captures below include the later snowman, layout, and cube-depth changes described further down.

| Day | Night | Cover |
| --- | --- | --- |
| ![Painted replacement day](paint-replacement-day.png) | ![Painted replacement night](paint-replacement-night.png) | ![Painted replacement cover](paint-replacement-cover.png) |

The images above are captures of the **production renderer** with the replacement assets loaded, at 1280 × 720. The original transparent [bush study](snow-bush-paint-study.png) and [igloo study](igloo-paint-study.png) are retained. [`prepare-runtime-art.mjs`](prepare-runtime-art.mjs) crops, downsizes, and WebP-encodes those sources to two 420 × 195 bush files and one 480 × 226 igloo file (about 86 KB combined). This is technical asset preparation; the painting itself is unaltered. [`capture-paint.mjs`](capture-paint.mjs) reproduces the scene captures.

The foreground bushes still render **over** players. A first pass put an oversized green backing shape beneath each painting; that protruded beyond the leaf silhouette and looked like a separate patch. The paintings have dense, connected interior foliage, so the backing was removed and the visible leaves were aligned to the ground. The cover capture shows the characters hidden without the green patch. The selected igloo stays in the cleaned open ground interval. The menu and lobby prefetch the three files with Pearl; each render worker decodes its own copy before drawing Winter Lake. If an image fails, the previous Canvas bush or igloo draws instead. Production build, focused preload tests, Chromium smoke, and Winter Lake browser tests in both worker modes passed for this asset change. Moving gameplay remains part of the [integrated play review](../winter-lake/LESSONS.md#production-and-review-gates).

### Snowman volume and final prop spacing

The first playable painted replacement still left a dense row at ground level: two cover bushes, two trees, a snowball pile, the snowman, the igloo, and ice cubes nearly touched. The final layout keeps the two bushes as cover, one large snowman, and the igloo, but removes the ground trees and snowball pile. The igloo moves left into the open interval before the right ice cube; the right bush moves right so it no longer touches that cube. The small ledges are left empty. Props appear only on the two broad platforms, where trees and snowmen are now large enough to read against the characters without filling the jump lanes.

The snowmen's body and head now use a stronger cool-side gradient, a clipped underside shadow, and a restrained side crescent. The shading stays inside the dark oval outline; it adds volume without making the snow look like blue ice. The [day](paint-replacement-day.png), [night](paint-replacement-night.png), and [cover](paint-replacement-cover.png) captures above reflect this final spacing and shading. This is a composition change only: platform collision, spawn points, hazard placement, and bush draw order are unchanged.

### Ice cube front projection

The two ground ice cubes looked tucked into the same plane as the scenery. Their vector bodies now extend 9 logical pixels below the former ground line, with a narrow cool contact shadow. The snow-capped top edge stays at its original coordinate, and the `iceCube` platform rectangles and collision behavior are unchanged. This creates a modest foreground face without making the landing height misleading. Compare the [previous scene](cube-depth-before-day.png) with the [current day](paint-replacement-day.png) and [night](paint-replacement-night.png) captures; the change applies only to the two upright cubes, not the floating shelves or ground strip.

The older Canvas igloo comparisons are retained as historical captures. Use `capture-paint.mjs` for the current production composition; `capture-round.mjs` was written before the painted replacement and should not be used to regenerate its historical Canvas images from the current pack.

`node docs/mockups/winter-props/benchmark-round.mjs` measures one construction and 500 cached foreground calls in headless Chromium. After the Meadow bush reuse and layout cleanup, one local run measured about 2.8 ms for the static background props, 6.1 ms for the foreground cache build, and 0.003 ms per cached foreground call. These are JavaScript enqueue timings in an isolated fixture, not GPU frame timings or a before/after gameplay benchmark.

## Reproduction

Run Vite from this worktree and set `WINTER_PROPS_URL` to its `/bunnybrawl/` URL. Use `node docs/mockups/winter-props/capture-paint.mjs` to refresh the current production day, night, and cover captures. `node docs/mockups/winter-props/capture.mjs` reproduces the painted and early Canvas study variants through the [`render.ts`](../winter-lake/render.ts) fixture with `?variant=current&props=painted-round|painted-wind|painted-cedar&time=day|night`; add `&cover=1` for hidden players. The historical `current-*.png` and Canvas images came from earlier production states and should remain available for comparison. The [generation prompts](PROMPTS.md) and source sheets are retained so the art direction can be revisited without relying on a temporary server.
