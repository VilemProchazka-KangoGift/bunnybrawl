# Morning blue in live Meadow gameplay

These screenshots come from the production preview with one human slot and four moving bots (`?arena=meadow&bots=4&difficulty=easy&killLimit=99`). They show the selected palette at approximately noon (`dayPhase` 0.03), sunset (0.22), and night (0.47). Each phase was captured in both the default simulation-worker mode and `?simWorker=off` (simulation on the main thread, renderer still in a worker).

| Phase | Default worker mode | `?simWorker=off` |
|---|---|---|
| Noon | [Screenshot](default-noon.png) | [Screenshot](simWorker-off-noon.png) |
| Sunset | [Screenshot](default-sunset.png) | [Screenshot](simWorker-off-sunset.png) |
| Night | [Screenshot](default-night.png) | [Screenshot](simWorker-off-night.png) |

These are live, moving matches; player positions and effects differ between screenshots. Both modes rendered five players and advanced through the phases without browser errors. The bushes retain their original position, draw order, and colours, so players can still hide inside them. The fixed-position current-versus-proposed comparison lives in the separate design [PR #53](https://github.com/VilemProchazka-KangoGift/bunnybrawl/pull/53).
