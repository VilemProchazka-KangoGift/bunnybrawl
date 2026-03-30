# BunnyBrawl — Progress Log

## Session 2 — 2026-03-30

### New Features
- Fast-fall: press down for instant downward snap (500px/s) + 2.67x gravity
- Jump'n'Bump style lobby: walk characters right to join, countdown starts
- Nature decorations: trees, bushes, flowers, mushrooms on ground and platforms
- Animated clouds drifting across the sky
- Dust particles: landing impacts (scales with speed), running trails, wall/ceiling bumps
- Player-player collision: rabbits push each other horizontally
- Pause menu: ESC during match shows Resume/Quit overlay
- Down key bindings: P1=S, P2=ArrowDown, P3=K, P4=G

## Session 1 — 2026-03-30

### Initial Build — COMPLETE
- [x] Vite + React + TypeScript project
- [x] Game engine: physics, AABB collision, horizontal wrapping
- [x] 4 characters: Bunny, Fox, Frog, Bear with procedural sprites
- [x] Meadow arena with 9 platforms
- [x] Stomp/splat system with persistent marks
- [x] Match management (kill/time limits, scoring, kill feed)
- [x] All screens: Menu, Lobby, Match, Victory
- [x] Procedural audio: jump, stomp, victory SFX + music loop
- [x] 90 unit/integration tests + 6 E2E tests (96 total)

### Architecture
```
src/engine/  — Pure game logic (physics, stomp, input, arena, characters, renderer, audio, gameLoop)
src/components/ — React screens (MainMenu, CharacterSelect/Lobby, Match, VictoryScreen)
src/store/   — Zustand game store
e2e/         — Playwright E2E tests
```
