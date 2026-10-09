# Lava-entry ripple comparisons

Options: Current rings, Broken ink ripples, Small lava splash, No ripple.

Run `node docs/mockups/lava-ripples/build-study.mjs` to rebuild. The original surface-impact and burn renderers are frozen in baseline files; rebuilding does not replace them. Serve through Vite and open `/bunnybrawl/docs/mockups/lava-ripples/index.html`.

The current ripple lasts 0.6 seconds with three staggered rings and a maximum radius of 60. Its stroke alpha and context alpha both contribute to fading. Broken ink ripples keep the timing and radius but use interrupted paths and opaque stroke colors before context fading. Small lava splash uses a compact crown and three droplets. No ripple retains the shared burn reaction.

Entry occurs at 0.4 seconds in a scripted two-second loop. Ember cough and smoke can be disabled to inspect the surface reaction alone. Character motion, lava surface and background are schematic; this is not a gameplay simulation. Lighting, burn tint, screen shake and foreground cover are omitted. The current ripple and burn drawings come from production.

Validation: Playwright checked exact current-renderer pixels at seven ages, all 19 characters, distinct active options, identical pre-entry/expired scenes, shared and isolated effects, lava edge, left-facing, night, native/2x and mobile layouts, and no browser errors. ESLint passed for the builder and verifier. Production build, Vitest and game E2E were not run for this docs-only comparison.

Additional splash options: Rolling lava lobes (low rounded mass), Forked splash (two outward curls), Pointed lava fan (tall uneven fingers), and Molten droplets (detached drops with small surface lip). All share the existing 0.6-second window.

Combined splash study: Rolling lobes + droplets preserves the selected lobe silhouette with seven full-sized molten drops; Wide rolling wave, Curling wings and Rounded crown explore different splash silhouettes with the same drop count and lifetime. Originals remain above the combined section.

Selected for production: Wide rolling wave + droplets. Lava now uses the chosen drawing; water rings, emission conditions, lifetime, slow-device suppression and shared Ember cough remain unchanged. The gallery keeps the original frozen Current and checks selected-production pixel equality.

Live verification: default simulation-worker mode observed the selected wave path on the actual worker canvas during a natural Volcano entry. In simWorker=off, the fixture waits for countdown completion, places Bunny above the lava with downward velocity, then observes a real emitted lava packet and captures the full scene. Cosmetic packets are omitted from the engine-worker main-thread mirror; do not assert ripple presence on that mirror.
