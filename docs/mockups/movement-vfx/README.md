# Movement effect variations

## Selected implementation

Chosen direction: **Jump — Cloud pop; Fast stomp — Pose echoes; Landing — Side puffs.** These now run in the shared engine. Cloud particles expand with a restrained ink outline; takeoff stays at the previous grounded contact, and landing clouds travel sideways without gravity. Fast stomp uses two translucent cached attack sprites and stops immediately on landing or an upward bounce. Ordinary airborne oval trails and the faint white motion lines were removed so they do not compete with the new effects. Invincibility trails remain outside an active dive.

`live/` contains live-engine captures driven by keyboard input in both supported worker modes. The main-simulation review uses a seeded clear ground position at x=790; default-worker captures use normal movement. Night is captured through the real day-phase setting in main-simulation mode. Foreground foliage is unchanged and still hides effects at covered contacts. These live crops are separate from the scripted study below.

Reproduce with a production preview on port 4199, then `node docs/mockups/movement-vfx/capture.mjs`. An optional first argument supplies another preview URL, including its `/bunnybrawl/` path. The script pauses briefly for each crop, settles the initial spawn before recording, and checks the expected worker mode and browser errors.

Validation of the isolated VFX patch: production build (`tsc -b && vite build`) passed, and the full Vitest run passed 3,063 tests across 163 files. Targeted Playwright checks cover fast stomp, match flow, and arena switching in both worker modes; the existing `@flaky` lobby ready-zone test is excluded. The complete E2E suite was not run.

## Standalone alternatives

Open `index.html` in a browser. It is self-contained and uses the current playable Bunny atlas and painted Meadow backdrop embedded from the repository.

These are **animation studies with scripted motion**, rather than a production renderer or live physics simulation. Night in this gallery is an approximate contrast check; it does not reproduce the game's lighting stack. The old-style reference illustrates the earlier dust, airborne lines, and fast-fall smear approximately, with deterministic particles for comparison. It omits other overlapping cosmetics such as speed afterimages and surface cracks.

| Effect | Variation | Design question |
| --- | --- | --- |
| Jump | Cloud pop | Can one compact, outlined cloud sell takeoff without lingering? |
| Jump | Dust fans | Do separated directional puffs communicate the force more clearly? |
| Jump | Boing ticks | Can three ink accents replace dust entirely and let the pose lead? |
| Fast stomp | Ink streaks | Do crisp tapered strokes clearly communicate downward speed? |
| Fast stomp | Broken chevrons | Is an explicit downward graphic more readable or too symbolic? |
| Fast stomp | Pose echoes | Do short authored-pose echoes add energy without confusing player location? |
| Landing | Side puffs | Does horizontal displacement ground the impact without hiding the body? |
| Landing | Impact crown | Can a short angular impact contrast with the soft character art? |
| Landing | Dust skid | Is a low brush-like reaction enough for frequent landings? |

Select a variation in each row to preview the combination. All panels share a movement clock. Pause and scrub to inspect individual frames; compare normal speed, slow motion, game-size art, 2× detail, and night. Defaults are the selected Cloud pop, Pose echoes, and Side puffs.

Browser verification: Chromium loaded all ten canvases with no JavaScript errors; pause/scrub, zoom, night, baseline toggle, and selection updates worked. The layout had no horizontal overflow at a 360px viewport. Jump, fast-stomp, and landing screenshots were inspected at game size or 2× detail.

The implementation preserves gameplay physics and authored pose selection. Worker shape transport has a dedicated round-trip regression; render tests check that echoes stop on upward bounces, ground contact, and splat. Live desktop movement captures and the targeted browser gate are complete. Physical device performance, live spring-bounce captures, and the full browser suite remain outside this validation.

### Playtest refinement

Pose echoes now appear immediately at 0.6/0.36 opacity with wider separation. Fast-stomp ground landings replace side puffs with a small irregular inked Impact crown with a warm inset and detached flecks (0.16 seconds); ordinary landings retain side puffs. Refreshed live captures show these changes in both worker modes and at night. Production build, 45 focused Vitest tests, and both Playwright fast-stomp checks pass.

Final playtest revision keeps jagged edges, a warm inset, and detached flecks; rounded lobes were superseded. Contact transitions run every simulation tick to avoid the half-rate cosmetic delay.
