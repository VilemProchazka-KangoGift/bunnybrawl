# Carrot Royale — Claude Development Guide

Carrot Royale is a local-multiplayer party game inspired by Jump'n'Bump (1998). Up to 5 players share one keyboard, controlling cartoon animals on a 2D platformer arena. Goal: land on opponents' heads to splat them.

**Tech stack**: React 19 + Vite 8 + TypeScript + HTML5 Canvas + Howler.js + Zustand + i18next

## Top-Level Source Layout

```
src/
  engine/         # Pure game logic — NO React, NO DOM
    simulator/    # Pure simulation core (Node-safe, no browser/audio imports)
    gameLoop/     # Browser adapter: orchestrator + 7 gameplay + 5 cosmetic systems
    rendering/    # Canvas 2D modules (delegated from renderer.ts)
    audio/        # AudioManager + MusicManager + soundRegistry + synthesis/
    arenas/       # Arena pack registry (one file per arena in packs/)
    characters/   # Character pack registry (one file per character in packs/)
    themes/       # Shared drawing primitives + ThemeConfig types
    ai/           # Utility-scoring bots + nav graph
    input/        # PlayerInput abstraction (keyboard, AI, remote, random)
    headless/     # Node ML pipeline: HeadlessRunner + observation + reward + recording
    net/          # Trystero host-authoritative multiplayer (core/ + netMatch/)
  components/     # React components (menus / HUD only — canvas is imperative)
  store/          # Zustand store
  hooks/          # useScaler, useCanvasRenderScale
  locales/        # en, cs, hi, fil
```

The repo is large; most subsystems have their own skill in `.claude/skills/` — reach for those before grepping. Plans and design docs live in `docs/superpowers/`.

## Core Design Decisions

- **Two-layer canvas**: background (static terrain + splat marks) redrawn only on splat; foreground (players, particles, HUD) every frame.
- **Fixed 60fps timestep** with accumulator pattern decouples physics from rendering.
- **Procedural sprites** — no sprite sheets. Canvas 2D primitives, sprite-cached to OffscreenCanvas.
- **React for menus only** — game and lobby canvases use imperative `requestAnimationFrame` loops. Canvas text uses `i18n.t()` directly, not the React hook.
- **CSS transform scaling** — fixed 1280×720 logical resolution, `GameScaler` scales to viewport. High-DPI backing stores at `1280×720 × min(devicePixelRatio, 2)` on desktop, 1× on touch. New canvases must use `useCanvasRenderScale(ref)` (React) or `applyRenderScaleToCanvas(canvas, ctx, scale)` (engine).
- **Pack registries** — characters, arenas. `registerBuiltinX()` at startup; renderer/sim look up via `getX(name)`. Packs bundle data + drawing + translations + audio.
- **Hexagonal Simulator** — `Simulator` (in `src/engine/simulator/`) is the pure simulation core (zero browser/DOM/audio imports — verified by `regression-no-browser-apis.test.ts`). Side effects flow through `SimulatorEvents` + `ParticleEmitter` interfaces. `GameLoop` is a thin browser adapter that owns Renderer / RAF / KeyboardManager / TouchInputManager / particle + cosmetic systems.
- **PlayerInput abstraction** — keyboard, rule-based AI, remote (network), touch, ML policy, synthetic random all implement `{ slot, getAction(state, ctx?) → InputState }`. `Simulator` holds `Map<PlayerSlot, PlayerInput>` — that map is the single source of truth (no inline branching).
- **Host-authoritative netcode** — Trystero MQTT signaling + WebRTC. Host runs full simulation, broadcasts binary snapshots; guests interpolate + send inputs. No determinism requirements. See `network-multiplayer.md` skill.

## Build & Run

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (tsc + vite)
npm test          # Vitest (~2000 tests)
npm run test:e2e  # Playwright (~120 tests, builds first)
npx vite-node scripts/generateNavData.ts                    # Regenerate AI nav data after arena/physics changes
npx vite-node scripts/selfPlay.ts -- --episodes 5 --arena meadow --out data/run.ndjson
```

**Dev URL shortcuts** (skip lobby — requires `arena` param):

```
http://localhost:5173/bunnybrawl/?arena=rooftops&bots=2&difficulty=hard
http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&debug=nav    # nav overlay (` to toggle)
http://localhost:5173/bunnybrawl/?mobile&arena=meadow&bots=2       # force touch mode
```

## Workflow Rules

- **PlayerSlot = CharacterSlot | BotSlot** — human P1-P5, bot B1-B5. Use `isBotSlot(slot)`, `getCharacterForSlot(slot)`.
- **Bot characters** live in `BOT_CHARACTERS` Map — populated by `assignBotCharacters()`, NOT in `CHARACTERS` record.
- **localStorage**: use `safeStorage.{get,set,remove}` from `src/storage.ts`. Handles Safari private mode / sandboxed iframes. Never inline `try { localStorage.* } catch {}`.
- **Verify with `tsc -b`** locally before pushing — CI uses `tsc -b && vite build`, which is stricter than `--noEmit`.
- **Default to Simulator-level tests** with `CapturedEvents`, NOT GameLoop. Sim tests need no mocks and run ~10× faster. See `testing.md`.
- **Vitest CRLF churn on Windows**: `npm test` rewrites `__snapshots__/*.snap` with platform line endings. Always check `git diff --stat` before committing — if only LF→CRLF, revert.
- **Document lessons in `.claude/skills/*.md`** after completing features.

## Skills Index

For deeper context, invoke the relevant skill:

| Skill | When to use |
|-------|-------------|
| `character-sprites.md` | Character pack creation, sprite/leg rendering, body shading |
| `level-design.md` | Arena pack creation, theme drawing, reactive decorations, wildlife |
| `juice-vfx-sound.md` | Particles, gibs, hitstop, screen shake, sound generation, ambient |
| `game-feel.md` | Per-player vs global effects, hitstop tuning, screen-effect layering |
| `network-multiplayer.md` | Trystero host-auth, snapshots, NetMatch, online lobby flows |
| `performance.md` | Hot-path canvas rules, sprite caching, OffscreenCanvas patterns |
| `canvas-2d-game-performance` | Measurement protocol + recurring optimization patterns |
| `testing.md` | Sim vs GameLoop tests, mock patterns, E2E diagnostics, known failures |
| `i18n.md` | Adding languages, canvas vs React text, translation style |
