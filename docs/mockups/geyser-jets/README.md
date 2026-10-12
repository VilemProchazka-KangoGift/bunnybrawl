# Geyser jet comparison

Four synchronized options: frozen Current, Foamy spout, Bubble surge and Comic water jet. Uses the production Underwater arena’s actual geyser zone (400 × 660), production renderer and plush roster.

Active/dormant toggle, playback speed, pause/replay, timeline and full-size focus view. Scripted character bobbing is for visual overlap only. Physics, collision and audio are omitted. Underwater’s current interval is 0.1 seconds and duration 9999 seconds, so dormant is a drawing preview rather than a representative gameplay cycle.

Build: `node docs/mockups/geyser-jets/build-study.mjs`. Serve `test-results/geyser-static` at `/bunnybrawl/`. Production is unchanged; selection remains pending.

Round 2 adds an exact combination of Foamy spout tongues and Bubble surge bubbles, plus Broad rolling tongues + big bubbles, Fine ribbons + quick bubbles, and Weaving tongues + bubble lanes. Original four options remain available.

Round 3 retains Broad rolling tongues + big bubbles and adds Shaded rolling tongues, Folded water ribbons, Broken wave crests and Layered flowing scales. All use the same 18 large bubbles at 90px/s; only the broad water surface changes.

Round 4 uses Fine ribbons + quick bubbles as the base: seven narrow streams, 30 small bubbles at 155px/s. Fine shaded ribbons, Fine folded ribbons, Fine wave crests and Fine flowing scales vary the surface shading while preserving that base.
