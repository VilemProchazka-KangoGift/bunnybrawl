# Thorn slowdown tint comparisons

Options: Current red pulse, Warm ink wash, Subdued pulse, No tint.

Thorn slowdown lasts five seconds. Production has two visual layers: sprite opacity is multiplied by 0.7 + sin(slowTimer * 8) * 0.15, and a collider-sized red oval pulses over the body at abs(sin(slowTimer * 8)) * 0.3. This gallery freezes both separately. Existing opacity pulse is independently toggleable; No tint removes the color overlay only.

The warm wash follows the real atlas silhouette through an alpha mask. The subdued pulse retains the collider oval with a muted color, lower opacity and slower phase. All four options retain the same character pose and scripted slowdown interval (0.3–5.3 seconds), regardless of the opacity checkbox.

Burn overlap suppresses every thorn color option, preserving the production branch priority. It uses the frozen fire-gradient fallback and persistent burn wisps; the cached-gradient path, initial Ember cough burst, damage-flash stripe and gameplay physics are omitted. The burn timer is scripted to overlap the full slowdown interval. Environmental lighting and body lean/squash transforms are also omitted.

All 19 real plush atlases can be reviewed in idle/run/jump, left facing, day/night, native or 2x, slow motion and timeline scrubbing. Source comes from main 43671a41. The original production drawing remains frozen for comparison.

Build: `node docs/mockups/thorn-slow-tint/build-study.mjs`. Frozen snapshots survive rebuilds. Browser verification: `node docs/mockups/thorn-slow-tint/verify.mjs` on port 4253. Captures include native/detail/night/mobile, all pose controls, roster examples, opacity isolation and burn overlap.

## Wash plus exaggerated pulse

The second comparison section combines the warm silhouette wash with the original pulse frequency and peak fill opacity. Four combinations: Wash + original pulse, Wash + ruffled cloud, Wash + comic burst, Wash + thorn petals. New contours have irregular silhouettes, restrained pulsing ink outlines and small edge highlights. Original four options stay unchanged. Burn overlap suppresses both wash and shaped pulse, and all combinations expire with the same slowdown timer.

## Selected: Wash + comic burst

Production now uses the warm silhouette wash and uneven comic burst, preserving the five-second slowdown, original opacity and pulse phase, and burn priority. The wash is cached per sprite so pose, facing, helmet and render-scale changes follow the sprite cache. Its opacity retains protection blinking and fast-stomp echo attenuation.
