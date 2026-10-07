# Leafy Dark Briar thorns

Approved direction: tall D4 ochre points, dark intertwined olive vines, curled end,
and three attached leaves. `approved-concept.png` is the selected illustration.
The final approved lower-leaf placement is shown in
`leaf-position-revision-2.png`: it sits left and slightly lower on the descending
front vine, with a visible gap from the upper-right leaf. This placement is
implemented in `thornArt.ts`; earlier revision captures predate this adjustment.
The first implementation in `production-study.png` was rejected: its stretched
silhouette, heavy outline, narrow vines, and flat triangular points did not match
the illustration.

The current revision is in `production-revision-study.png` at 16x, 8x, and 1x.
`production-revision-1x.png` and `production-revision-8x.png` are transparent
exports of the actual drawing. These are renderer studies, not in-game captures.
Run `node docs/mockups/thorn-briar/render-study.mjs` with Vite on port 5186 to
regenerate them. The 16x study enlarges the production 8x cache, so its slight
softness is intentional evidence of the delivered renderer.

The revised paths follow the reference's wide proportions, thick rounded curl,
intertwined vines, raised thorn collars, curved golden tapers and broad leaves.
They use irregular shaded planes instead of gradients. A transparent 240 x 136
OffscreenCanvas is baked lazily once per renderer realm (about 128 KiB decoded),
then rendered in one blit. When OffscreenCanvas is unavailable, the same cached
Path2D geometry draws synchronously. There are no external asset requests.

Implementation: `src/engine/rendering/thornArt.ts`, called by the shared default
thorn renderer in `collectibles.ts`. Arena-specific custom hazards remain intact.
Artwork is approximately 28 x 14.5 logical pixels, matching the concept's roughly
1.95:1 aspect ratio; the collision box remains 28 x 12. The rejected version was
28 x 22, which stretched the plant vertically.
The growth pivot, fade, spawn timing, slow effect, removal and networking are unchanged.
The old art also extended above its collision box; the new visual tips do not add
collision reach.

Earlier implementation's live captures: `meadow-worker-on.png` and `meadow-worker-off.png` show naturally
spawned thorns in both supported worker modes. `meadow-day.png` and
`meadow-night.png` pin the same thorn position and day phase with the simulator on
the main thread and the renderer in its worker. Their crop files show native-size
detail. All captures use a 1280 x 720 viewport at 1x device scale.

Earlier implementation's validation: production build (`tsc -b` and Vite) and 129 Vitest simulator/gameplay
and browser-import boundary checks passed. Both live worker modes had no page errors.
Playwright smoke passed all 9 menu/lobby/loading/arena-switch checks, covering both
worker modes. The first run accidentally included the already tagged `@flaky`
lobby walk-to-ready test, which timed out; the final run explicitly excluded it.
The full Vitest and Playwright suites were not run.

Revision validation: `npx tsc -b` passed. Chromium pixel comparisons at the cache's
8x resolution found identical output from cached and OffscreenCanvas-unavailable
paths, and from the full shared `drawThorn` wrapper with a fully grown thorn.
The cache's outer pixel border is fully transparent, confirming ink is not
clipped.

Parent integration verification: production build (`tsc -b` and Vite), 129 targeted
Vitest gameplay/browser-boundary tests, and 9 Playwright smoke checks passed.
The tagged flaky lobby walk test was excluded; full suites were not run.
`revision-meadow-worker-on.png` and `revision-meadow-worker-off.png` capture naturally
spawned revised thorns in both modes, without page errors. Matched revised day/night
captures and native-size crops use the `revision-meadow-day` / `revision-meadow-night`
filenames. These were inspected against the approved concept and the rejected art.
