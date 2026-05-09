# Testing Skill

Use when writing or debugging tests (Vitest unit/integration, Playwright E2E) or investigating a flaky/failing test.

## Test Commands

```bash
npm test          # Unit/integration tests (~2000 tests, Vitest)
npm run test:e2e  # E2E tests (~120 tests, Playwright; runs build first)
```

## Where Tests Belong

**Default to Simulator-level tests** with `CapturedEvents`, NOT GameLoop. Sim tests need no audio/renderer/howler/canvas mocks and run ~10× faster.

```ts
// New gameplay tests → src/engine/__tests__/simulator-gameplay.test.ts
import { Simulator } from '../simulator';
import { CapturedEvents } from './helpers/eventSink';
import { FIXED_TIMESTEP } from '../constants';

const events = new CapturedEvents();
const sim = new Simulator({ arena, settings, activePlayers, events });
sim.fixedUpdate(FIXED_TIMESTEP);
expect(events.sfx).toContain('stomp');
expect(sim.getState().players[0].score).toBe(1);
```

**Reach for `gameLoop.test.ts` only** for adapter behavior:
- RAF lifecycle, debug-key handler, render-scale subscription
- Browser-API integration (`audio.stopAllGameSounds`)
- Anything requiring `loop.particleSystem` / `loop.cosmeticStep` wiring (gibs, particle pool, footstep `audio.play` mock, score animations, shockwaves)

These tests need the audio/renderer/howler/canvas mock prelude at the top of `gameLoop.test.ts`. Always call `loop.stop()` in `afterEach` to prevent keydown listener leaks.

## Cosmetic Transition Tests

Cosmetic transitions don't fire from a single `fixedUpdate`. `tickCosmetic` accumulates dt and only forwards once per `COSMETIC_INTERVAL` (2× `FIXED_TIMESTEP`).

Call `loop.cosmeticStep(FIXED_TIMESTEP)` directly with a prev-then-curr state pair (e.g. set airborne → tick → set idle → tick).

## Locale & Theme Conventions

- Tests force `i18n.changeLanguage('en')` so string assertions work regardless of default language.
- Import `getTheme(arenaId)` from `./arenas` rather than hardcoding hex literals. Default test arena uses `themeId: 'meadow'`.

## Mocking Patterns

**Audio singleton timing**: `AudioManager` creates `menuMusicHowl` at field init time (before tests run). The `Howl` mock must be a real constructor function (not arrow), and tracking instances requires `globalThis` (vi.mock factories run before `const` declarations).

**Vitest mock constructors**: `vi.fn(() => instance)` fails with `new`. Use:
```ts
class MockX {
  constructor() { Object.assign(this, mockInstance); }
}
```

**Vitest partial mocks**: `vi.mock('./mod', async (importOriginal) => ({ ...(await importOriginal()), fn: vi.fn() }))` preserves un-mocked exports. Access mocked fns via `const mod = await import('./mod'); vi.mocked(mod.fn)`.

## Registry Quirks

Character/arena registries use module-scoped Maps with no `clear()`. Use **unique pack names** per test to avoid collisions. Count-based assertions should use `toBeGreaterThanOrEqual`, not exact counts.

**Character pack names are capitalized** — `getCharacterPack('Bunny')` not `'bunny'`.

**Arena IDs are snake_case** in URL params and registry: `space_station`, `candy_land`, `haunted_graveyard`.

**Nav data tests** must call `registerArena()` with `navData` — `getArenaNav(id)` reads from the registry Map, not from the arena object.

## Player Mocks

When adding new `Player` fields:
1. Update `makePlayer()` in `src/engine/__tests__/testHelpers.ts`
2. Update mock players in `VictoryScreen.test.tsx`

## E2E Tests

**Auto-start shortcut** (skips lobby): `/?arena=meadow&bots=2&killLimit=4`. Requires `arena` param to trigger.

**Diagnostic surface**: `window.__bunnyTest` (typed `BunnyTestSnapshot` from `src/components/bunnyTestShim.ts`) is the single typed entry point.
- `state()` — MatchState
- `diagnostics()`, `autoSlowFlipped()`
- `gameStore()` — Zustand store (mounted from menu/lobby)
- `netMatch()`, `netStats()`, `latestSnapshotFrame()` — online diagnostics
- `gameLoop()` — escape hatch for raw GameLoop methods (e.g. `stop()`)

**Prefer `waitForFunction` over hardcoded waits**:
```ts
await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0);
// NOT: await page.waitForTimeout(4000);
```

**Online E2E diagnostics**: `?simLatency=80&simJitter=20` simulates network conditions; `?debug=net` shows overlay.

**Online tests are inherently flaky** (`@online` tag) due to Trystero MQTT signaling. Use auto-start + polling, never hardcoded waits.

**E2E tests require `npm install`** — `@trystero-p2p/mqtt` types must be installed for `tsc -b && vite build` to succeed.

## Known Pre-Existing Failures

Reproduce against `HEAD~` before assuming a new regression:
- `MainMenu.test.tsx` — logo.png import denied by Vite test transform
- `VictoryScreen.test.tsx` — same
- `switchArena.test.ts > respawns players at new arena spawn points` — flaky
- `integration.test.ts > network mode round-trip > fixedUpdate with explicit inputMap drives both players` — P2 wrap-around at the seam
- The lobby walk-to-zone E2E test is inherently flaky (random NPC placement). Tagged `@flaky`, uses retries.

## Interpolation Tests

Snapshots pushed in rapid succession have near-identical frame numbers relative to delay. Assert value **ranges**, not exact lerp results.

## Coverage Config

`vitest.config.ts` excludes `arenas/packs/**` and `characters/packs/**` — canvas drawing code, not meaningful to unit test.

## Vitest CRLF Churn on Windows

`npm test` / `vitest run` rewrites snapshot files (`__snapshots__/*.snap`) with platform-native line endings. They show up in `git status` as modified but `git diff --shortstat` reports 0 line changes.

**Always check with `git diff --stat` before committing.** If only LF→CRLF, revert via `git checkout -- <file>` to keep commits clean.
