# Storybook sky

The shared cloud silhouette now uses connected asymmetric billows. Meadow adds
a broad cool underside and a restrained cream highlight. The sun uses warm flat
layers, short uneven rays, and the existing sunset color transition. The moon
uses a closed ivory crescent over a cool disc, with two quiet crater marks.
The sun and moon are 70% larger, with their arcs lowered 20 logical pixels to keep the larger halos inside the canvas. `drawSkyCycle` paints distant sky art before animated scenery and clouds; foreground fireflies retain their post-gameplay layer. Day-cycle timing and gameplay are unchanged.

Production-preview captures from `e2e/sky-art.spec.ts`:

- [Day, default simulation worker](meadow-day-default.png)
- [Day, renderer worker](meadow-day-simWorker=off.png)
- [Sunset, renderer worker](meadow-sunset-simWorker=off.png)
- [Night, renderer worker](meadow-night-simWorker=off.png)

The default simulation worker owns its phase; the host snapshot cannot change
it. Fixed sunset/night captures therefore use `simWorker=off`, while both modes
are checked for successful rendering and continued simulation.

Validation: production build passed, renderer Vitest suite passed 66/66, and
12 Playwright sky, game-flow, arena-switch, and lighting-baseline checks passed.
The repository's marked `@flaky` lobby-start test timed out in the initial run
and was excluded from the final smoke run. The full test suite and frame-time
profiling were not run.

Layer-order and size follow-up: production build and 66 renderer tests passed;
five Playwright sky, arena-switch, and lighting-baseline checks passed across
both worker modes. The renderer test now asserts sky before clouds and nighttime
foreground effects after clouds. The captures above show this revision.
