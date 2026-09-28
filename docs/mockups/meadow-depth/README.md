# Meadow colour and depth studies

Open `index.html` in a browser. It uses the checked-in PNGs and works without a server. The full-size comparison has three candidates, daylight/midnight toggles, and a before/after divider.

## Reproduce

From the repo root, start Vite:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4190 --strictPort
```

In a second terminal:

```sh
node docs/mockups/meadow-depth/capture.mjs
```

The fixture imports the actual Meadow pack, character packs, and Canvas renderer. The baseline is the unmodified theme from main commit `3ef5d8042c95619145a8d0d46237e84875628a26`. It is a fixed design scene, not a screenshot of a running match. Five characters, seeds, noon/midnight phases, and visual timers are held constant. Reactive decorations are drawn; simulation, audio, worker transport, transient particles, and wildlife updates are not running.

Only sky gradient, hills, distant treeline, and cloud colours vary. The harness wraps the original distant drawing function to recolour its existing paths. Foreground artwork, platform geometry, character drawing, HUD, and lighting are retained. No image filters or generated replacement artwork are used.

`render.ts` is an isolated design fixture, outside the application's TypeScript build and production entry graph. Its seeded randomness and timer overrides must not be moved into game code. Regeneration uses a local Chromium browser, checks page errors and image loading, and verifies the comparison controls. Screenshots were visually reviewed; moving gameplay, performance, and worker modes have not been validated for these studies.
