# Bouncy platform overlays

Compare current jelly overlay, candy rim, bounce chevrons, and bounce-only accents on the actual Candy Land background and platform geometry. All cards use identical scripted wobble timers. Physics, collision and audio are omitted; production is unchanged.

Build with `node docs/mockups/bouncy-platform-cues/build-study.mjs` and serve `test-results/bounce-static` with Vite preview.

Composite every renderer surface into the same explicit 1280×720 destination: backing stores grow with device pixel ratio. Draw comparison cues above the platform foreground so its cached cap does not hide the alternatives. These studies demonstrate the overlay appearance; final implementation must account for the production platform occlusion layer.
