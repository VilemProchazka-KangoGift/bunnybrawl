# Winter Lake props and cover: redesign step 4

The selected Pearl background and Astra Canvas platforms are held fixed in every capture. This pass explores decorative props only: the large snowman and igloo, ground and shelf evergreens, smaller snowmen, the foreground snowball pile, and the two ground bushes at x=350 and x=960. The fixture uses the production `Renderer`, the same fixed characters and arena geometry, and matched day and night states. Hazards, pickups, physics, landing heights, and animated weather belong to later work.

## Full-scene choices

| Direction | Day | Night | Main design difference |
| --- | --- | --- | --- |
| **Current baseline** | ![Current day](current-day.png) | ![Current night](current-night.png) | Repeated flat triangular evergreens, tiny white snowmen, plain igloo and snowball pile. |
| **Round Grove** | ![Round Grove day](painted-round-day.png) | ![Round Grove night](painted-round-night.png) | Plush wide boughs, generous snow cushions, compact dark-leaf bushes, friendly scarfed snowmen. Closest to the soft storybook mood. |
| **Wind Carved** | ![Wind Carved day](painted-wind-day.png) | ![Wind Carved night](painted-wind-night.png) | Asymmetric swept branches and low drifting bush, calmer blue scarf and rugged snow masses. Gives the level motion without changing gameplay. |
| **Lake Cedar** | ![Lake Cedar day](painted-cedar-day.png) | ![Lake Cedar night](painted-cedar-night.png) | Wide cedar layers with turquoise icy tips and a bright glacial igloo. Has the clearest lake-specific material accent, but the bush is close to reading as a snow-covered ice pile. |

The [source concept sheet](prop-direction-sheet.png) shows each prop at a readable size. A [transparent atlas](prop-atlas-transparent.png) is cropped into the fixed prop positions by the [fixture painter](illustrated.ts). These are **painted mockups**, not the production assets or a commitment to use one atlas for every tiny prop. At 18–30px, fine painting is compressed; a chosen direction will need a separate small-scale treatment for those pieces. The generated snowmen's stick arms are exploratory; their silhouettes must not be mistaken for hazards. All gameplay geometry is unchanged.

### Cover check

The foreground bushes are drawn in the same layer and at the same ground positions as the current bushes. Each has a continuous opaque dark leaf body under the illustrated cutout, so its painted texture cannot expose a hidden player through transparent holes. The captures place Bunny and Wolf behind both bushes, with the foreground draw order intact. Their upper features may still peek above the bush because the bushes retain roughly the existing height; the body is occluded as intended.

| Current cover | Round Grove | Wind Carved | Lake Cedar |
| --- | --- | --- | --- |
| ![Current cover](current-cover.png) | ![Round cover](painted-round-cover.png) | ![Wind cover](painted-wind-cover.png) | ![Cedar cover](painted-cedar-cover.png) |

## Occupancy and review constraints

| Layer | Positions retained | Review concern |
| --- | --- | --- |
| Background landmarks | Snowman at left x=55; igloo at right x=1080–1260 | Leave spawn areas and the right portal readable. The left snowman shares space with a foreground fir and remains partly obscured, as before. |
| Background trees and figures | Ground x=200, 640, 1200; proportional placements on shelves | Avoid a uniform row of identical trees; keep the central bridge clear around moving characters. |
| Foreground cover and accents | Bushes x=350 and x=960, edge firs x=50 and x=1230, snowball pile x=850 | Keep bushes opaque over players and avoid a foreground glow or gaps. |

The illustrated variants are stronger than the first directly coded [Canvas sketches](round-grove-day.png), [wind sketch](wind-carved-day.png), and [cedar sketch](lake-cedar-day.png). Those sketches preserved the layout and layering, but their identical small snow ribbons made the trees look mechanical. The painted reference made the missing shape language obvious: thicker irregular snow, distinct bough profiles, texture inside connected masses, and variation between tree types. The sketches remain in the gallery as a record of that failed first pass. The next step is to choose or mix the strongest prop shapes, then translate them into a production treatment and check live occlusion and load cost. The first preference from the full scene is Round Grove for cover and broad tree mass, with occasional Wind Carved trees for variety; Lake Cedar's icy accents should be used sparingly so they do not compete with playable ice.

## Reproduction

Run Vite from this worktree and set `WINTER_PROPS_URL` to its `/bunnybrawl/` URL, then run `node docs/mockups/winter-props/capture.mjs`. The fixture is [`render.ts`](../winter-lake/render.ts) with `?variant=current&props=painted-round|painted-wind|painted-cedar&time=day|night`. Add `&cover=1` to see players behind the two bushes. The [generation prompts](PROMPTS.md) and original sheet are retained so the art direction can be revisited without relying on a temporary server.
