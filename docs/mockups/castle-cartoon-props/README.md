# Castle cartoon props

The approved Moonlit props use simplified storybook silhouettes and broad light/shadow planes. The guard, sconce, chandelier, and edge column were traced to editable [SVG masters](svg/) and rendered as transparent WebP files for the game. A browser probe found that `createImageBitmap` could not decode the SVG Blob in Edge, while the WebP files loaded in both canvas-owning worker modes. Run `node docs/mockups/castle-cartoon-props/rasterize.mjs` with `CASTLE_PROPS_BROWSER` set to a local Chromium or Edge binary to regenerate the runtime files from the SVGs.

The four WebP files total 40,972 bytes. The small sconce is inlined by Vite; the other three are fetched with the arena backdrop. All four must decode before the new prop set renders. A missing image falls back to the old complete Canvas scene. Guards and sconces sit behind players; the chandelier and edge columns are foreground. The five warm wall torches are replaced by four cool sconces, and sparse Moonlit banners retain their reactive sway. Gameplay geometry and hazard collision are unchanged.

| Default simulation worker | `simWorker=off` |
| --- | --- |
| ![Live castle, default worker](live-default.png) | ![Live castle, renderer worker](live-simWorker-off.png) |

Both captures are from the production preview after countdown. Focused tests, the production build, and direct-entry and Meadow-to-Castle switching in both worker modes passed. The deterministic initial-bundle budget passed at 158,350 / 163,840 gzip bytes. The optional constrained-browser loading probe could not launch because the bundled Playwright Chromium is absent on this machine; live captures used installed Edge.

## Cartoon gargoyle spring redraw

The first actionable study below failed the gargoyle test: its springs looked like masks, bells, or helmets at game size. A recognizable gargoyle needs a complete crouching creature, so the next pass deliberately gives every variant a **head and expression, horns, chest, wings, front paws, and stone base**. The variants change personality rather than only palette. All scenes use the same castle camera, characters, thorn art, props, and lighting. The spring appears at rest and compressed after contact; an additional copy sits on an upper ledge. **These are mockups, not runtime spring replacements.**

| Direction | Full 1280 × 720 scene | 1:1 action-lane crop | Character |
| --- | --- | --- | --- |
| Current | [Open](actionables/actionable-current.png) | [Open](actionables/detail-actionable-current.png) | Small angular original. |
| A · Grinning Imp | [Open](gargoyles/gargoyle-imp.png) | [Open](gargoyles/detail-gargoyle-imp.png) | Round head, curled horns, a wide fanged grin, broad bat wings, little paws. |
| B · Stone Bulldog | [Open](gargoyles/gargoyle-bulldog.png) | [Open](gargoyles/detail-gargoyle-bulldog.png) | Heavy brow, jowls, underbite, short wings, wide paws. |
| C · Little Dragon | [Open](gargoyles/gargoyle-dragon.png) | [Open](gargoyles/detail-gargoyle-dragon.png) | Longer snout, swept wings, curled tail, mischievous face. |

The [Canvas source](gargoyles/gargoyleVariants.ts) keeps the shapes editable and shows the rest and compression drawing. These larger silhouettes extend beyond the existing 20 × 20 spring collision square; the contact point and perceived hit area need a live gameplay check before implementation. The body stays rooted on the platform while the head lowers and wings open on compression.

## Earlier study: iron thorns and spring

These are visual proposals rendered by the game `Renderer` at 1280 × 720 with the approved castle platforms, background, props, and fixed character positions. The thorn samples use the current 28 × 12 collision dimensions. The spring appears at rest, compressed after contact, and on an upper ledge. Only the thorn and spring drawing callbacks change between scenes. The variants are **not used by the game** pending selection.

| Direction | Whole scene | Native-size action-lane crop | Read at game size |
| --- | --- | --- | --- |
| Current | [Open](actionables/actionable-current.png) | [Open](actionables/detail-actionable-current.png) | Angular gargoyle and small iron spikes. |
| A · Iron Fangs | [Open](actionables/actionable-iron-fangs.png) | [Open](actionables/detail-actionable-iron-fangs.png) | Broad staggered teeth; round horned gargoyle with opened wings. |
| B · Bat Wing | [Open](actionables/actionable-bat-wing.png) | [Open](actionables/detail-actionable-bat-wing.png) | Low bat-shaped thorns; pointed ears and spread wings. |
| C · Moon Sentinel | [Open](actionables/actionable-moon-bell.png) | [Open](actionables/detail-actionable-moon-bell.png) | Low crown thorns; squat horned gargoyle. |

The [Canvas prototype](actionables/actionableVariants.ts) records the shapes and palette. Its tiny rendering size caused the spring to lose its gargoyle anatomy. Retain these as a rejected scale study; use the cartoon redraw above for spring selection. The thorn options remain available for a separate decision.
