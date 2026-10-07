# Winter Lake redesign: step 1, baseline and identity

This is the audit before changing the arena artwork. The game calls this arena **Winter Lake** (`winter_lake`); the redesign brief also calls it Frozen Lake. The [generic arena redesign sequence](../../../.claude/skills/visual-style/SKILL.md#arena-redesign-sequence) governs the following passes.

## Current production scene

| Noon | Midnight |
| --- | --- |
| ![Current Winter Lake at noon](live-current-day.png) | ![Current Winter Lake at midnight](live-current-night.png) |

These are 1280 × 720 captures from the live Vite match renderer at the same camera and fixed positions. Bunny, Frog, Fox, Wolf, and Panda sample pale, green, warm, dark, and black-and-white character palettes. The HUD is hidden because its preselected bot names do not follow this capture's temporary character substitutions. Spawned carrots, springs, and thorns are cleared for a stable art comparison; their arena-specific artwork remains in scope for a later pass. The game loop is paused after placement, so noon and night compare the same poses and positions. Weather and aurora still animate in the renderer.

Reproduce with `npx vite --host 127.0.0.1 --port 4222` from the repo root, then `node docs/mockups/winter-lake/capture-baseline.mjs`. The script uses `?arena=winter_lake&bots=4&simWorker=off` so the browser test hook can pin the local simulation state. The images are a design baseline, not a worker-mode regression result.

## What the current design communicates

- The snow caps, blue platform bodies, hanging icicles, and translucent ice cubes give a recognizable winter material language. Platform tops and solid obstacles remain visible.
- The repeated decorated trees and tiny snowmen read as a Christmas scene. They compete for attention with characters, pickups, and the small landing platforms. At 1280 × 720, the same two motifs repeat on most platforms.
- The distant peaks are regular sharp triangles, and the lower scene has no broad, legible lake surface or shoreline. The title promises a frozen lake, but the arena reads more like floating snow shelves in front of mountains.
- The day sky is already deep blue. White platforms pop, but pale Bunny and Panda are weak against snow, while Frog and the dark Wolf become hard to pick out around dark green pines or at midnight. Character contrast needs checking in the full scene, including motion.
- The large night aurora is a distinctive asset. Its long ribbons and the field of sparkles add mood, but they should remain behind clear movement lanes and not become the strongest shape in the scene.
- Foreground pines, bushes, and the snowball pile draw over players. The two bushes at ground level are deliberate cover; preserve their opacity and draw order while redesigning their shape.

## Chosen identity for exploration

**A storybook alpine lake in winter.** Make the frozen lake a readable geographical feature: a broad, calm frozen plane or shoreline behind the lower playfield, with irregular distant slopes and a few grounded pines. Use cool muted blue, slate, and violet in the distance; reserve crisp snowy whites and darker ink for the playable foreground. Let a restrained aurora become the night signature. Keep the scene playful through snow sculpture and small details, but reduce the Christmas-tree/ornament rhythm so the arena looks like a place rather than a holiday display.

This is an art direction for mockups, not approval to remove any specific existing prop. In the background pass, compare at least a quiet alpine shoreline and a more dramatic glacial-basin composition against the current scene. The next pass should decide sky and land shapes before spending effort on new platform or prop drawings.

## Step 2: background studies

The following images use the same production `Renderer`, Winter Lake platforms, props, plush characters, clouds, and night treatment. Only the sky gradient, configured hills, and `drawFarBackground` differ. Fixed player positions, a seeded initial cloud layout, and a single frozen animation time make the four directions directly comparable. The HUD and spawned items are hidden. These are design fixtures, not evidence of in-game integration or animated-cloud behavior.

| Direction | Noon | Midnight | What it tests |
| --- | --- | --- | --- |
| **Current, matched fixture** | ![Current Winter Lake, noon](current-day.png) | ![Current Winter Lake, midnight](current-night.png) | Existing triangular mountains and indistinct lower ground. |
| **Quiet shore** | ![Quiet shore, noon](quiet-shore-day.png) | ![Quiet shore, midnight](quiet-shore-night.png) | A broad horizontal ice sheet, low rolling distant shore, and the calmest space around players. |
| **Glacial basin** | ![Glacial basin, noon](glacial-basin-day.png) | ![Glacial basin, midnight](glacial-basin-night.png) | Taller asymmetric snow walls framing a central opening and stronger sense of enclosure. |
| **Violet inlet** | ![Violet inlet, noon](violet-inlet-day.png) | ![Violet inlet, midnight](violet-inlet-night.png) | A winding frozen inlet and violet distance that separate warm characters and add a more distinctive mood. |

**First-round assessment:** Quiet shore best establishes the lake without crowding the platforms, though its landscape may need a stronger landmark. Glacial basin has more scale, but its side walls approach the outer jump lanes and the broad snow curves could read as hills rather than cliffs. Violet inlet has the most character; its diagonal shore leads the eye toward the center, but the pale ice is close in value to the current snow platforms.

### Second round: stronger compositions

The first round was useful for value and shoreline studies, but the options shared too much of one layered-hill structure. The second round changes the lake's prominence, shoreline vegetation, lighting palette, and frame shape more decisively. Everything outside the backdrop is still identical to the matched fixture above.

| Direction | Noon | Midnight | What it tests |
| --- | --- | --- | --- |
| **Mirror Ice** | ![Mirror Ice, noon](mirror-ice-day.png) | ![Mirror Ice, midnight](mirror-ice-night.png) | A larger turquoise ice sheet and broad faceted glacier shoulders; the lake becomes the main shape. |
| **Fir Shore** | ![Fir Shore, noon](fir-shore-day.png) | ![Fir Shore, midnight](fir-shore-night.png) | A connected, dark fir belt behind the playfield, with pale ice below it. |
| **Rose Dawn** | ![Rose Dawn, noon](rose-dawn-day.png) | ![Rose Dawn, midnight](rose-dawn-night.png) | A mauve and peach sky against cold blue ice, moving the arena away from monochrome winter blue. |
| **Polar Gap** | ![Polar Gap, noon](polar-gap-day.png) | ![Polar Gap, midnight](polar-gap-night.png) | Angular ice cliffs on both sides and an opening through the center. |

**Second-round assessment:** Mirror Ice most clearly reads as a frozen lake, and its cool ice plane separates the dark Wolf well. The stronger cyan area may need softening if it competes with effects or pickups during play. Fir Shore gives the place a believable edge, but dark characters could disappear against the tree belt while jumping. Rose Dawn provides the most distinctive mood without changing geometry; its warm sky should be checked with orange and pale roster members in motion. Polar Gap has the strongest frame, but the cliff edges sit close to outer platforms and could make those lanes busy. None of these is selected production art yet. The old decorated trees and snowmen remain visible in every variant and will be reviewed in the prop pass.

### Polar Gap follow-ups

These keep the gap and frozen lake concept while varying the width of the opening, cliff construction, asymmetry, and warmth of the snow. The original Polar Gap row above is the reference; every capture uses the same characters, platforms, props, and lighting phase.

| Direction | Noon | Midnight | What changes |
| --- | --- | --- | --- |
| **Open Pass** | ![Polar Open Pass, noon](polar-open-day.png) | ![Polar Open Pass, midnight](polar-open-night.png) | Lower, more distant cliffs and a wider lake opening. |
| **Stepped Ice** | ![Polar Stepped Ice, noon](polar-stepped-day.png) | ![Polar Stepped Ice, midnight](polar-stepped-night.png) | Tiered glacier faces, stronger ledges, and a sheltered center. |
| **Offset Channel** | ![Polar Offset Channel, noon](polar-offset-day.png) | ![Polar Offset Channel, midnight](polar-offset-night.png) | One dominant left wall and a lower right bank lead into a diagonal channel. |
| **Alpenglow** | ![Polar Alpenglow, noon](polar-alpenglow-day.png) | ![Polar Alpenglow, midnight](polar-alpenglow-night.png) | Angular original-style cliffs with warm light on their snowy caps. |

**Tradeoffs:** Open Pass protects the outer jump lanes best, but gives up some of the original's imposing scale. Stepped Ice reads clearly as carved ice; the straight ledges also risk looking like a constructed fortress. Offset Channel has the boldest asymmetry, though its dark left wall dominates the lower-left play space. Alpenglow is a palette study that can combine with another shape; its warm sky needs a live check with pale and orange characters. Open Pass is my strongest shape candidate for gameplay clarity, while the original Polar Gap has more drama. This remains a mockup decision: no production backdrop has been selected or integrated.

### Open Pass with rounded hills

These retain Open Pass's broad central lake and replace its pointed cliff contours with continuous, rounded banks. The [Open Pass noon](polar-open-day.png) and [midnight](polar-open-night.png) captures above are the direct shape comparison. The arena geometry, foreground art, characters, and lighting phases are the same in each image.

| Direction | Noon | Midnight | What changes |
| --- | --- | --- | --- |
| **Soft Shoulders** | ![Soft Shoulders, noon](polar-soft-shoulders-day.png) | ![Soft Shoulders, midnight](polar-soft-shoulders-night.png) | Low, wide banks make the center feel most open and keep the outer play lanes quiet. |
| **High Bluffs** | ![High Bluffs, noon](polar-high-bluffs-day.png) | ![High Bluffs, midnight](polar-high-bluffs-night.png) | Taller, broad hills restore some scale without sharp peaks; the opening stays wide. |
| **Uneven Shore** | ![Uneven Shore, noon](polar-uneven-shore-day.png) | ![Uneven Shore, midnight](polar-uneven-shore-night.png) | A higher left hill and lower right bank give the pass a gentle asymmetry. |

**Assessment:** High Bluffs is the strongest balance of lake identity and softer contours. Soft Shoulders leaves the most visual space around the platforms but risks feeling too flat. Uneven Shore has a natural composition, though its left bank is visually heavier. At midnight, all three stay behind the playable platforms and the foreground cover. These are background mockups only; compare them in motion before selecting one for production.

### Lighter, less symmetrical Soft Shoulders

Soft Shoulders is the preferred direction, but its mirrored banks and dark lower faces draw too much attention. Its lake also reads as a regular lens with geometric markings. These studies keep the same sky and open central composition while drawing each bank separately in paler colors. Each lake has its own uneven shore, interrupted snow rim, scattered frozen patches, and curved surface seams in place of the original triangular reflections. The [original Soft Shoulders at noon](polar-soft-shoulders-day.png) and [midnight](polar-soft-shoulders-night.png) remain the comparison.

| Direction | Noon | Midnight | Surface character |
| --- | --- | --- | --- |
| **Powder Bank** | ![Powder Bank, noon](polar-powder-bank-day.png) | ![Powder Bank, midnight](polar-powder-bank-night.png) | Two uneven, pale mounds with fine powder specks; lake ice has lightly snowed patches. |
| **Wind Carved** | ![Wind Carved, noon](polar-wind-carved-day.png) | ![Wind Carved, midnight](polar-wind-carved-night.png) | Low, unequal banks with thin wind lines; the lake's shoreline and frost seams bend independently. |
| **Frost Shelves** | ![Frost Shelves, noon](polar-frost-shelves-day.png) | ![Frost Shelves, midnight](polar-frost-shelves-night.png) | Rounded layered snow and pale ice, with more visible seams and an irregular lake edge. |
| **Pearl Shore** | ![Pearl Shore, noon](polar-pearl-shore-day.png) | ![Pearl Shore, midnight](polar-pearl-shore-night.png) | Slightly warmer, creamy snow with sparse soft patches and the quietest lake markings. |

**Assessment:** Wind Carved best preserves readable shore and lake shapes while taking the dark mass out of the banks. Pearl Shore is the calmest but its pale surfaces may blend together at noon. Frost Shelves shows the most texture; its repeated horizontal marks may need further reduction for play. Powder Bank is an understated middle ground. The midnight overlay compresses their differences, so any final choice needs a moving in-game check at multiple times of day. None is integrated into the production arena.

### Wind Carved color and shoreline studies

The [original Wind Carved at noon](polar-wind-carved-day.png) and [midnight](polar-wind-carved-night.png) has two noticeable rises along the lake's far edge, and the banks, distant shore, and frozen water sit close together in color. These four studies keep its wind-swept texture, lower those rises to a shallow meander, and separate snow from ice through hue and value. Each also adjusts the two banks independently. Sky, platforms, characters, and day-night treatment are held constant.

| Direction | Noon | Midnight | Color and shape change |
| --- | --- | --- | --- |
| **Silver Banks** | ![Silver Banks, noon](polar-silver-banks-day.png) | ![Silver Banks, midnight](polar-silver-banks-night.png) | Neutral silver snow against a bluer lake; the left shoulder rolls twice while the right descends gradually. |
| **Lilac Snow** | ![Lilac Snow, noon](polar-lilac-snow-day.png) | ![Lilac Snow, midnight](polar-lilac-snow-night.png) | Muted violet banks against turquoise ice; the right bank has a separate low crest. |
| **Deep Ice** | ![Deep Ice, noon](polar-deep-ice-day.png) | ![Deep Ice, midnight](polar-deep-ice-night.png) | Low neutral banks leave a stronger blue lake as the main landscape feature. |
| **Warm Drift** | ![Warm Drift, noon](polar-warm-drift-day.png) | ![Warm Drift, midnight](polar-warm-drift-night.png) | Ivory snow contrasts with cool ice; both banks remain broad but have different crests. |

**Assessment:** Lilac Snow makes the snow and ice easiest to distinguish without making either bank dark. Silver Banks is the most restrained option and may fit the existing platform palette best. Deep Ice identifies the lake quickly but its blue area deserves a motion check for pickup and player contrast. Warm Drift has a pleasant warm-cool split, though its beige snow may feel less wintry. The calmer lake edge is shared across this round; no production choice has been made.

The fixture and variant functions are in [`render.ts`](render.ts) and [`variants.ts`](variants.ts). To reproduce, run Vite on port 4222 and then `node docs/mockups/winter-lake/capture-variants.mjs`. The earlier live-match baseline above remains available to compare the fixture with the game.

## Gameplay and render constraints

Preserve platform and spawn positions, the `friction: 0.15` slippery movement, the two jumpable ice cube obstacles, hazard locations, and the foreground cover order. Keep landing tops and the front-face overlay aligned with collision. The arena already has custom ice-crystal thorns and a themed spring skin; review their visual clarity in the actionable-object pass. Check noon, sunset, and night after integration, including pale and dark characters, both simulation-worker modes, and match-scale legibility.
