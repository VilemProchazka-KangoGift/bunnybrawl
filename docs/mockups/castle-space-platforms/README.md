# Castle and Space Station platform release

This extraction publishes only the approved aged limestone and high-contrast alloy platform art. The other arena iterations remain in the original working tree. Gameplay geometry, collision insets, surface behavior and deliberate foreground occlusion are preserved. Both cached passes replay identical dimension-seeded drawing.

The dedicated castleStationPlatforms.ts and castleStationMaterials.ts contain only these two materials. The renderer fixture supports arena=castle or arena=space_station and time=day, sunset or night; sizes compares both materials at narrow, shelf, bridge and block sizes.

Validation on the isolated branch from origin/main: TypeScript, affected-file ESLint and production build passed. Full Vitest: 174 files, 3,125 tests passed with two workers after two initial concurrent-run import timeouts. Targeted Chromium Playwright: four Castle/Space Station direct-entry and switch tests passed across default and simWorker=off. Extraction equivalence: 96 complete Canvas command streams match the approved original, including command count; pack gameplay fields are unchanged. The review images are matched day/sunset/night renderer captures; both worker modes were verified by the browser tests. Full Playwright suite was not run.
