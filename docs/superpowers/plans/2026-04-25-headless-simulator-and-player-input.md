# Headless Simulator + PlayerInput Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a headless self-play runner for ML data collection without forking the simulation, by extracting a `Simulator` core from `GameLoop` and unifying all input sources (keyboard, AI, network, ML, random) behind a single `PlayerInput` interface.

**Architecture:** Hexagonal / ports-and-adapters. `Simulator` **owns** `MatchState`, `Player[]`, all gameplay systems, and the seeded RNG. Its public surface is `step(inputs, dt)`, `setPhase(phase)`, `switchArena(...)`, `getState()`, `setOnPhaseChange(cb)`. It has no rendering, audio, input-source, scheduler, or browser dependencies — gameplay systems' audio side-effects are routed through an injected `playSound` callback (no-op by default). Adapters compose it: `GameLoop` (the existing class, slimmed — owns Renderer, cosmetic systems, audio orchestration, rAF, keyboard, and delegates simulation to a held `Simulator`) and `HeadlessRunner` (constructs a `Simulator` directly — no Renderer, no cosmetic systems, no audio). The existing host-authority code (`net/hostAuthority.ts`) is already structurally a third adapter. `PlayerInput` interface (`getAction(state) → InputState`) unifies keyboard, rule-based bot, ML policy, network remote, and synthetic random sources. The adapter calls `getAction()` on each input each tick and hands the resulting `Map<PlayerSlot, InputState>` to `Simulator.step(inputs, dt)`.

---

## Pre-flight context (read before starting)

- **`erasableSyntaxOnly: true`** — no constructor parameter properties; declare fields explicitly + assign in constructor body.
- **`.bind(this)` is banned in hot paths** — use `private readonly _boundFn = (): T => this.fn()`.
- **`Math.fround` (aliased `f`) is used pervasively** for cross-architecture determinism. Any new arithmetic that flows into `MatchState` must be wrapped: `f(a + f(b * c))`.
- **`audio.play()` is already lazy at init** — `AudioManager.init()` is only called when `play()`/`playMusic()` is first invoked. The `_audioEnabled` flag on `GameLoop` already short-circuits audio for rollback resimulation; we reuse it for headless.
- **`fixedUpdate` is public** and accepts an injected `networkInputs?: Map<string, InputState>` — the input-injection seam already exists, we're just unifying its callers.
- **Cosmetic systems are already separate** from gameplay via `cosmeticStep(dt)` (called separately from `fixedUpdate`). They early-return when `phase === 'loading'`. Solution C step that "extracts cosmetics from sim" is therefore mostly a relocation, not a redesign.
- **Mock maintenance** — `netMatch.test.ts` and others mock `GameLoop` via `Object.assign`. When you add public methods, update those mocks or unhandled `TypeError`s mask real failures.
- **`PROTOCOL_VERSION` (currently 8)** in `net/core/protocol.ts` — bump only if the wire format changes. This refactor should NOT change wire format.

---

## File Structure

**New files:**
```
src/engine/
  simulator/
    Simulator.ts          # Owns state + gameplay systems + seeded RNG; public step/setPhase/switchArena/getState
    types.ts              # SimulatorConfig
    index.ts              # Barrel
  input/
    PlayerInput.ts        # Interface
    KeyboardManager.ts    # Owns window listeners (extracted from InputManager)
    KeyboardInput.ts      # Per-slot PlayerInput wrapping KeyboardManager
    RuleBasedBot.ts       # PlayerInput wrapping AIController
    RemoteInput.ts        # PlayerInput wrapping host-authority input buffer
    RandomInput.ts        # Synthetic weighted-random PlayerInput (testing/perf)
    index.ts              # Barrel
  headless/
    HeadlessRunner.ts     # Composes Simulator directly — no GameLoop, no Renderer
    observation.ts        # Pure: extract Float32Array obs from state
    reward.ts             # Pure: derive scalar reward from state delta
    batchedPolicy.ts      # BatchedPolicy interface + selectActionsBatched harness helper
    MatchRecorder.ts      # Training-data accumulator — (obs, action, reward, done) → NDJSON
    types.ts
    index.ts
  __tests__/
    regression-determinism.test.ts             # Lock match outcome given seed + inputs (against GameLoop)
    regression-audio-trace.test.ts             # Lock SFX call sequence
    regression-node-import.test.ts             # Lock pure-module Node-importability
    regression-simulator-determinism.test.ts   # Same fingerprint as GameLoop's determinism test, but via Simulator

scripts/
  headless-self-play.mjs  # Example entry point — runs N episodes, dumps NDJSON
```

**Modified files:**
```
src/engine/
  debugFlags.ts             # Lazy URL parse (move out of module-load)
  audio/AudioManager.ts     # Audit only — confirm no module-load Howls
  audio/MusicManager.ts     # Move any field-init Howl into init()
  gameLoop/GameLoop.ts      # Holds a Simulator; owns renderer/cosmetics/audio/rAF/keyboard; delegates simulation
  gameLoop/initialState.ts  # No code change — Simulator imports from here
  gameLoop/gameplay/MatchSystem.ts          # Take playSound callback instead of importing audio
  gameLoop/gameplay/EffectZoneSystem.ts     # Same
  gameLoop/gameplay/HazardSystem.ts         # Same (audit — may already use callback)
  gameLoop/gameplay/CarrotSystem.ts         # Same (audit)
  gameLoop/gameplay/StompSystem.ts          # Same (audit)
  gameLoop/gameplay/PlayerCollisionSystem.ts # Same (audit)
  gameLoop/gameplay/ArenaEntitySystem.ts    # Same (audit)
  ai/aiController.ts        # No change — wrapped externally as RuleBasedBot
  net/hostAuthority.ts      # No change — already adapter-shaped
  net/netMatch.ts           # No change — already calls fixedUpdate via host loop
  index.ts                  # Export Simulator, PlayerInput, HeadlessRunner
  CLAUDE.md                 # Document new architecture seams

src/components/
  Match.tsx                 # No change required (GameLoop public API preserved)
```

---

# Phase 0: Worktree + Regression Tests

Lock down current behavior with characterization tests that fail loudly if the refactor changes anything observable.

### Task 0.1: Create worktree

**Files:**
- Bash only

- [ ] **Step 1: Create the worktree from current main**

```bash
git -C P:/projects/rabbits worktree add -b feat/headless-simulator .worktrees/headless-simulator main
```

- [ ] **Step 2: Verify clean checkout**

```bash
git -C P:/projects/rabbits/.worktrees/headless-simulator status
```

Expected: `working tree clean`, branch `feat/headless-simulator`.

- [ ] **Step 3: Install deps in the worktree**

```bash
cd P:/projects/rabbits/.worktrees/headless-simulator && npm install
```

Expected: install completes; node_modules present.

- [ ] **Step 4: Run baseline test suite**

```bash
cd P:/projects/rabbits/.worktrees/headless-simulator && npm test -- --run
```

Expected: existing test suite passes. Record pass/fail counts in your notes — you'll compare after each phase.

- [ ] **Step 5: Verify build**

```bash
cd P:/projects/rabbits/.worktrees/headless-simulator && npm run build
```

Expected: `tsc -b` clean, `vite build` produces dist/.

---

### Task 0.2: Determinism characterization test

Captures the keystone regression signal: identical seed + inputs → identical state.

**Files:**
- Create: `src/engine/__tests__/regression-determinism.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/__tests__/regression-determinism.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameLoop } from '../gameLoop';
import { registerBuiltinCharacters } from '../characters/builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import type { InputState, MatchSettings, PlayerSlot } from '../types';
import { FIXED_TIMESTEP } from '../constants';

// Mock browser APIs that GameLoop touches at construction.
vi.mock('howler', () => ({
  Howl: vi.fn(function (this: { play: () => void; stop: () => void; volume: () => void; unload: () => void; on: () => void; once: () => void; playing: () => boolean }) {
    this.play = vi.fn();
    this.stop = vi.fn();
    this.volume = vi.fn();
    this.unload = vi.fn();
    this.on = vi.fn();
    this.once = vi.fn();
    this.playing = vi.fn(() => false);
    return this;
  }),
  Howler: { mute: vi.fn() },
}));

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

/** Step `count` ticks with `getInput(frame, slot)` producing inputs per slot per frame. */
function runScenario(opts: {
  seed: number;
  arenaId: string;
  players: PlayerSlot[];
  count: number;
  getInput: (frame: number, slot: PlayerSlot) => InputState;
}): { kills: number; positions: Array<{ slot: PlayerSlot; x: number; y: number }>; phase: string } {
  const settings: MatchSettings = {
    activePlayers: opts.players,
    arenaId: opts.arenaId,
    killLimit: 16,
    botDifficulty: 'medium',
    mods: {} as MatchSettings['mods'],
  };

  // Mock canvas for GameLoop construction (it touches getContext).
  const mockCanvas = (): HTMLCanvasElement => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      strokeRect: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      setTransform: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillText: vi.fn(), measureText: vi.fn(() => ({ width: 0 })),
      setLineDash: vi.fn(), quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(),
      ellipse: vi.fn(), strokeText: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
      font: '', textAlign: '', textBaseline: '', globalAlpha: 1, globalCompositeOperation: '',
    };
    return {
      width: 1280, height: 720,
      getContext: vi.fn(() => ctx),
      style: {},
    } as unknown as HTMLCanvasElement;
  };

  const loop = new GameLoop(
    mockCanvas(),
    mockCanvas(),
    settings,
    () => {}, // onMatchEnd
    undefined, // hudCanvas
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), // seed bytes (deterministic)
  );

  // Network mode: tells fixedUpdate to use the explicit `networkInputs` arg
  // instead of reading from its internal InputManager (which has no listeners attached in Node).
  loop.setNetworkMode(true);
  // Directly drive fixedUpdate. Set phase to 'playing' (test default is 'loading').
  (loop as unknown as { state: { phase: string } }).state.phase = 'playing';

  for (let f = 0; f < opts.count; f++) {
    const inputs = new Map<string, InputState>();
    for (const slot of opts.players) {
      inputs.set(slot, opts.getInput(f, slot));
    }
    loop.fixedUpdate(FIXED_TIMESTEP, inputs);
  }

  const state = (loop as unknown as { state: { players: Array<{ id: PlayerSlot; x: number; y: number }>; killFeed: unknown[]; phase: string } }).state;
  return {
    kills: state.killFeed.length,
    positions: state.players.map((p) => ({ slot: p.id, x: p.x, y: p.y })),
    phase: state.phase,
  };
}

describe('regression: determinism', () => {
  it('identical seed + inputs produce identical outcome (smoke)', () => {
    const scenario = {
      seed: 42,
      arenaId: 'meadow',
      players: ['P1', 'P2'] as PlayerSlot[],
      count: 600, // 10 seconds at 60Hz
      getInput: (frame: number, slot: PlayerSlot): InputState => {
        // P1 walks right, jumps every 30 frames.
        // P2 walks left, jumps every 45 frames (offset).
        if (slot === 'P1') {
          return { left: false, right: true, jump: frame % 30 === 0, down: false };
        }
        return { left: true, right: false, jump: frame % 45 === 0, down: false };
      },
    };

    const a = runScenario(scenario);
    const b = runScenario(scenario);

    expect(b).toEqual(a);
  });

  it('locks the deterministic-scenario fingerprint (refactor regression)', () => {
    const result = runScenario({
      seed: 42,
      arenaId: 'meadow',
      players: ['P1', 'P2'],
      count: 600,
      getInput: (frame, slot) => {
        if (slot === 'P1') return { left: false, right: true, jump: frame % 30 === 0, down: false };
        return { left: true, right: false, jump: frame % 45 === 0, down: false };
      },
    });

    // Lock-in fixture: this snapshot is the regression baseline.
    // If this test fails after a refactor, INVESTIGATE before updating —
    // any change here means observable simulation behavior changed.
    expect(result).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to capture the fixture**

```bash
npx vitest run src/engine/__tests__/regression-determinism.test.ts
```

Expected: both tests pass; the `toMatchSnapshot()` call creates `__snapshots__/regression-determinism.test.ts.snap`.

- [ ] **Step 3: Verify rerun is stable**

```bash
npx vitest run src/engine/__tests__/regression-determinism.test.ts
```

Expected: passes again with no snapshot diff. If it diffs, the scenario isn't deterministic — fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/engine/__tests__/regression-determinism.test.ts src/engine/__tests__/__snapshots__/
git commit -m "test(regression): lock deterministic match fingerprint"
```

---

### Task 0.3: Audio call trace test

Catches refactors that drop, duplicate, or reorder SFX.

**Files:**
- Create: `src/engine/__tests__/regression-audio-trace.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/__tests__/regression-audio-trace.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameLoop } from '../gameLoop';
import { audio } from '../audio';
import { registerBuiltinCharacters } from '../characters/builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import type { InputState, MatchSettings, PlayerSlot } from '../types';
import { FIXED_TIMESTEP } from '../constants';

vi.mock('howler', () => ({
  Howl: vi.fn(function (this: Record<string, unknown>) {
    this.play = vi.fn();
    this.stop = vi.fn();
    this.volume = vi.fn();
    this.unload = vi.fn();
    this.on = vi.fn();
    this.once = vi.fn();
    this.playing = vi.fn(() => false);
    return this;
  }),
  Howler: { mute: vi.fn() },
}));

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

function mockCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({}, { get: () => vi.fn() });
  return { width: 1280, height: 720, getContext: vi.fn(() => ctx), style: {} } as unknown as HTMLCanvasElement;
}

describe('regression: audio call trace', () => {
  it('records SFX sequence for a 5-second match (P1 stomps P2)', () => {
    const playSpy = vi.spyOn(audio, 'play');
    const settings: MatchSettings = {
      activePlayers: ['P1', 'P2'],
      arenaId: 'meadow',
      killLimit: 16,
      botDifficulty: 'medium',
      mods: {} as MatchSettings['mods'],
    };

    const loop = new GameLoop(
      mockCanvas(), mockCanvas(),
      settings, () => {}, undefined,
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    );
    loop.setNetworkMode(true);
    (loop as unknown as { state: { phase: string } }).state.phase = 'playing';

    // Drive 300 frames (5 seconds): P1 jumps repeatedly, P2 stays still under P1's path.
    for (let f = 0; f < 300; f++) {
      const inputs = new Map<string, InputState>([
        ['P1', { left: false, right: f < 60, jump: f % 20 === 0, down: false }],
        ['P2', { left: false, right: false, jump: false, down: false }],
      ]);
      loop.fixedUpdate(FIXED_TIMESTEP, inputs);
      loop.cosmeticStep(FIXED_TIMESTEP); // SFX fire from cosmetic systems
    }

    const calls = playSpy.mock.calls.map(([name]) => name).filter(Boolean);
    expect(calls).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/engine/__tests__/regression-audio-trace.test.ts
```

Expected: passes; snapshot created.

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/regression-audio-trace.test.ts src/engine/__tests__/__snapshots__/regression-audio-trace.test.ts.snap
git commit -m "test(regression): lock SFX call trace for 5s scenario"
```

---

### Task 0.4: Node-importability smoke test

Catches new module-load DOM dependencies the moment they appear.

**Files:**
- Create: `src/engine/__tests__/regression-node-import.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/__tests__/regression-node-import.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';

describe('regression: pure modules import in Node env without DOM', () => {
  it('physics is importable', async () => {
    const mod = await import('../physics');
    expect(typeof mod.applyInput).toBe('function');
  });

  it('stomp is importable', async () => {
    const mod = await import('../stomp');
    expect(mod).toBeDefined();
  });

  it('hazardCollision is importable', async () => {
    const mod = await import('../hazardCollision');
    expect(mod).toBeDefined();
  });

  it('constants is importable', async () => {
    const mod = await import('../constants');
    expect(typeof mod.FIXED_TIMESTEP).toBe('number');
  });

  it('types module side-effect free', async () => {
    const mod = await import('../types');
    expect(typeof mod.isBotSlot).toBe('function');
  });

  it('ai modules importable', async () => {
    const mod = await import('../ai');
    expect(mod).toBeDefined();
  });

  it('net/prng is importable', async () => {
    const mod = await import('../net/prng');
    expect(mod.SeededRNG).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/engine/__tests__/regression-node-import.test.ts
```

Expected: all pass. (If any fail, you've found pre-existing module-load DOM coupling — note it; we'll fix in Phase 1.)

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/regression-node-import.test.ts
git commit -m "test(regression): pin Node-importability of pure engine modules"
```

---

### Task 0.5: Static guard — no browser APIs in pure modules

Stronger than the runtime import smoke: static scan that fails if forbidden patterns (`window.`, `document.`, `requestAnimationFrame`, etc.) appear anywhere in the source of pure modules — even in code paths the runtime test never exercises. This locks the "pure" invariant at code-review time.

**Files:**
- Create: `src/engine/__tests__/regression-no-browser-apis.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/__tests__/regression-no-browser-apis.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Files / directories that MUST stay free of browser APIs. Paths are relative to repo root.
 * If a path doesn't exist yet (e.g., simulator/ before Phase 3), it's silently skipped —
 * the test re-activates as soon as the directory is created.
 */
const PURE_PATHS = [
  'src/engine/simulator',
  'src/engine/headless',
  'src/engine/physics.ts',
  'src/engine/stomp.ts',
  'src/engine/hazardCollision.ts',
  'src/engine/constants.ts',
  'src/engine/fastMath.ts',
  'src/engine/gameLoop/initialState.ts',
  'src/engine/gameLoop/gameplay',
  'src/engine/ai',
];

/** Forbidden patterns. Each match is reported with file:line for diagnosis. */
const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bwindow\./, reason: 'window.* — browser global' },
  { pattern: /\bdocument\./, reason: 'document.* — browser global' },
  { pattern: /\bnavigator\./, reason: 'navigator.* — browser global' },
  { pattern: /\blocalStorage\b/, reason: 'localStorage — browser-only' },
  { pattern: /\bsessionStorage\b/, reason: 'sessionStorage — browser-only' },
  { pattern: /\brequestAnimationFrame\b/, reason: 'rAF — scheduler concern, belongs in adapter' },
  { pattern: /\bcancelAnimationFrame\b/, reason: 'cAF — scheduler concern, belongs in adapter' },
  { pattern: /\bnew\s+Audio\s*\(/, reason: 'new Audio() — browser-only' },
  { pattern: /\bnew\s+Image\s*\(/, reason: 'new Image() — browser-only' },
  { pattern: /\bHTMLCanvasElement\b/, reason: 'HTMLCanvasElement — DOM type, belongs in adapter' },
  { pattern: /\bHTMLElement\b/, reason: 'HTMLElement — DOM type, belongs in adapter' },
  { pattern: /\bCanvasRenderingContext2D\b/, reason: 'Canvas API — belongs in renderer/adapter' },
  { pattern: /\bOffscreenCanvas\b/, reason: 'OffscreenCanvas — belongs in renderer/adapter' },
  { pattern: /\.getContext\s*\(\s*['"]2d['"]/, reason: 'canvas.getContext — DOM API' },
  { pattern: /from\s+['"]howler['"]/, reason: 'Howler import — audio belongs behind playSound callback' },
];

function* walkTs(path: string): Generator<string> {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('__tests__')) yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    yield* walkTs(join(path, entry));
  }
}

interface Violation {
  file: string;
  line: number;
  match: string;
  reason: string;
}

function scanFile(path: string): Violation[] {
  const violations: Violation[] = [];
  const text = readFileSync(path, 'utf-8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip pure-comment lines so /** … window … */ docs don't trigger
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    // Strip inline trailing comment so `code; // window stuff` doesn't trigger
    const code = line.split('//')[0];
    for (const { pattern, reason } of FORBIDDEN) {
      const m = code.match(pattern);
      if (m) violations.push({ file: relative(process.cwd(), path).split(sep).join('/'), line: i + 1, match: m[0], reason });
    }
  }
  return violations;
}

describe('regression: no browser APIs in pure modules', () => {
  for (const target of PURE_PATHS) {
    it(`${target} — clean`, () => {
      if (!existsSync(target)) {
        // Path doesn't exist yet — test re-activates once it's created.
        return;
      }
      const all: Violation[] = [];
      for (const file of walkTs(target)) {
        all.push(...scanFile(file));
      }
      if (all.length > 0) {
        const msg = all.map((v) => `  ${v.file}:${v.line} — ${v.match} (${v.reason})`).join('\n');
        throw new Error(`Found ${all.length} forbidden browser-API references in ${target}:\n${msg}\n\nPure modules must not reference browser globals. Move the side-effect to an adapter (BrowserGameLoop, HeadlessRunner, etc.) or inject it as a callback.`);
      }
      expect(all).toHaveLength(0);
    });
  }
});
```

- [ ] **Step 2: Run on current main**

```bash
npx vitest run src/engine/__tests__/regression-no-browser-apis.test.ts
```

Expected: all pass for pure dirs that exist (`physics.ts`, `stomp.ts`, `hazardCollision.ts`, `constants.ts`, `fastMath.ts`, `gameLoop/initialState.ts`, `gameLoop/gameplay`, `ai`). The `simulator/` and `headless/` paths are skipped because they don't exist yet — they reactivate after Phase 3 / 4.

If the test FAILS on current main, you've found pre-existing browser-API leakage in a "pure" module. Either:
- Fix it now (out of scope but trivial)
- Drop the offending path from `PURE_PATHS` and file a follow-up

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/regression-no-browser-apis.test.ts
git commit -m "test(regression): static guard — no browser APIs in pure engine modules"
```

---

# Phase 1: Node-Safe Module Imports

The only known module-load DOM dependency is `debugFlags.ts:3` reading `window.location.search`. Audit + fix.

### Task 1.1: Lazy debugFlags initialization

**Files:**
- Modify: `src/engine/debugFlags.ts`
- Test: `src/engine/debugFlags.test.ts` (already exists — extend if needed)

- [ ] **Step 1: Write a test for the new shape**

Create or extend `src/engine/debugFlags.test.ts`:

```typescript
// src/engine/debugFlags.test.ts (add or replace)
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';

describe('debugFlags lazy init', () => {
  beforeEach(async () => {
    // Force fresh module evaluation per test
    vi.resetModules();
  });

  it('module imports cleanly in Node env (no window)', async () => {
    const mod = await import('./debugFlags');
    expect(mod.debugFlags).toBeDefined();
    // All flags default to false when initDebugFlags() not called
    expect(mod.debugFlags.navDebugAllowed).toBe(false);
    expect(mod.debugFlags.netDebugAllowed).toBe(false);
    expect(mod.debugFlags.fpsAllowed).toBe(false);
    expect(mod.debugFlags.perfEnabled).toBe(false);
  });

  it('initDebugFlags(searchString) parses params', async () => {
    const { debugFlags, initDebugFlags } = await import('./debugFlags');
    initDebugFlags('?debug=nav,net,perf');
    expect(debugFlags.navDebugAllowed).toBe(true);
    expect(debugFlags.netDebugAllowed).toBe(true);
    expect(debugFlags.perfEnabled).toBe(true);
    expect(debugFlags.fpsAllowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/engine/debugFlags.test.ts
```

Expected: FAIL — `initDebugFlags` is not a function (or all flags evaluate against undefined window).

- [ ] **Step 3: Refactor debugFlags.ts to lazy init**

Replace `src/engine/debugFlags.ts` with:

```typescript
// Dev-only debug flags — explicitly initialized via initDebugFlags(searchString).
// Defaults to all false so this module is safe to import in Node (no `window` access).
// In the browser, call initDebugFlags(window.location.search) once at app start.

export const debugFlags = {
  navDebugAllowed: false,
  navDebugEnabled: false,
  netDebugAllowed: false,
  netDebugEnabled: false,
  fpsAllowed: false,
  fpsEnabled: false,
  perfEnabled: false,
};

export function initDebugFlags(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const debugParam = params.get('debug') ?? '';
  debugFlags.navDebugAllowed = debugParam.includes('nav');
  debugFlags.navDebugEnabled = debugParam.includes('nav');
  debugFlags.netDebugAllowed = debugParam.includes('net');
  debugFlags.netDebugEnabled = debugParam.includes('net');
  debugFlags.fpsAllowed = debugParam.includes('fps');
  debugFlags.fpsEnabled = debugParam.includes('fps');
  debugFlags.perfEnabled = debugParam.includes('perf');
}

export function toggleNavDebug(): void {
  if (debugFlags.navDebugAllowed) debugFlags.navDebugEnabled = !debugFlags.navDebugEnabled;
}
export function toggleNetDebug(): void {
  if (debugFlags.netDebugAllowed) debugFlags.netDebugEnabled = !debugFlags.netDebugEnabled;
}
export function toggleFpsDebug(): void {
  if (debugFlags.fpsAllowed) debugFlags.fpsEnabled = !debugFlags.fpsEnabled;
}
```

- [ ] **Step 4: Wire initDebugFlags into the browser entry point**

Find the app entry. Open `src/main.tsx` (or whichever file mounts React):

```bash
ls P:/projects/rabbits/.worktrees/headless-simulator/src/main.tsx
```

Edit it to call `initDebugFlags` before rendering. Add at top of `main.tsx` (after existing imports):

```typescript
import { initDebugFlags } from './engine/debugFlags';
initDebugFlags(window.location.search);
```

- [ ] **Step 5: Also wire perfTrace if it captures debugFlags at module init**

Open `src/engine/perfTrace.ts`. Find the line `enabled: debugFlags.perfEnabled` (captured at module init in current code). Change it to a getter so it reads the current flag value:

```typescript
// Replace the field
//   enabled: debugFlags.perfEnabled,
// With a getter:
get enabled() { return debugFlags.perfEnabled; },
```

- [ ] **Step 6: Run the new test + full test suite**

```bash
npx vitest run src/engine/debugFlags.test.ts
npx vitest run src/engine/__tests__/regression-node-import.test.ts
npm test -- --run
```

Expected: debugFlags test passes; node-import test passes; full suite still green.

- [ ] **Step 7: Build to verify**

```bash
npm run build
```

Expected: tsc clean, vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/engine/debugFlags.ts src/engine/debugFlags.test.ts src/engine/perfTrace.ts src/main.tsx
git commit -m "refactor(debugFlags): lazy URL parse via initDebugFlags() — Node-safe at import"
```

---

### Task 1.2: Audit MusicManager for module-load Howl creation

**Files:**
- Read: `src/engine/audio/MusicManager.ts`
- Possibly modify: `src/engine/audio/MusicManager.ts`

- [ ] **Step 1: Audit MusicManager**

Read the file:

```bash
cat src/engine/audio/MusicManager.ts | head -80
```

Look for any `new Howl(...)` at field-init scope (i.e., a class field whose initializer calls `new Howl`). Per CLAUDE.md, `menuMusicHowl` is preloaded in `init()`, but verify nothing is created at field init.

- [ ] **Step 2: If a field-init `new Howl` is found, move it into `init()`**

Pattern to apply if found:

```typescript
// Before:
class MusicManager {
  private menuMusicHowl: Howl = new Howl({ src: 'menu.mp3' });
}

// After:
class MusicManager {
  private menuMusicHowl: Howl | null = null;
  init(): void {
    if (this.menuMusicHowl) return;
    this.menuMusicHowl = new Howl({ src: 'menu.mp3' });
  }
}
```

If no field-init Howl exists, skip this step.

- [ ] **Step 3: Run audio tests + node-import test**

```bash
npx vitest run src/engine/audio.test.ts src/engine/__tests__/regression-node-import.test.ts
```

Expected: pass.

- [ ] **Step 4: Add audio/AudioManager to the node-import smoke test**

Open `src/engine/__tests__/regression-node-import.test.ts` and add:

```typescript
it('audio module is importable in Node (does not call new Howl at import)', async () => {
  const mod = await import('../audio');
  expect(mod.audio).toBeDefined();
  // audio.init() is NOT called automatically — importing should be inert
});
```

- [ ] **Step 5: Run the extended test**

```bash
npx vitest run src/engine/__tests__/regression-node-import.test.ts
```

Expected: all pass. If audio import fails in Node env, the field-init Howl audit missed something — go back to Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/engine/audio/MusicManager.ts src/engine/__tests__/regression-node-import.test.ts
git commit -m "audit(audio): confirm no module-load Howl creation; extend node-import test"
```

---

# Phase 2: PlayerInput Abstraction

Unify keyboard, AI, network, and synthetic input sources behind one interface. The adapter (today's `GameLoop`) calls `getAction()` per tick and hands resulting `Map<PlayerSlot, InputState>` to `fixedUpdate`.

### Task 2.1: Define PlayerInput interface

**Files:**
- Create: `src/engine/input/PlayerInput.ts`
- Create: `src/engine/input/index.ts`
- Test: `src/engine/input/__tests__/PlayerInput.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/input/__tests__/PlayerInput.test.ts
import { describe, it, expect } from 'vitest';
import type { PlayerInput } from '../PlayerInput';
import type { MatchState, PlayerSlot, InputState } from '../../types';

describe('PlayerInput contract', () => {
  it('is a structural type implementable by any object', () => {
    const stub: PlayerInput = {
      slot: 'P1',
      getAction: (_state: Readonly<MatchState>): InputState => ({
        left: false, right: false, jump: false, down: false,
      }),
      dispose: () => {},
    };
    expect(stub.slot).toBe('P1');
    const action = stub.getAction({} as MatchState);
    expect(action).toEqual({ left: false, right: false, jump: false, down: false });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails (no PlayerInput.ts yet)**

```bash
npx vitest run src/engine/input/__tests__/PlayerInput.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create PlayerInput.ts**

```typescript
// src/engine/input/PlayerInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';

/**
 * Unified action source. Implementations: keyboard, rule-based AI, network remote,
 * ML policy, synthetic random. Adapters (BrowserGameLoop, HeadlessRunner, host)
 * own a list of PlayerInput and call getAction() per tick before stepping the simulator.
 *
 * The interface is intentionally synchronous — async (e.g. remote model inference)
 * must be handled inside the impl by buffering predictions; the loop must not block.
 */
export interface PlayerInput {
  /** The player slot this input controls. */
  readonly slot: PlayerSlot;

  /**
   * Produce the input for this tick. Receives a readonly snapshot of state so AI/ML
   * impls can sense the world. Must NOT mutate state.
   */
  getAction(state: Readonly<MatchState>): InputState;

  /**
   * Release any resources (event listeners, timers, network handles).
   * Adapters call this when ending a match.
   */
  dispose?(): void;
}

/** Helper for impls that don't need state — keyboard, random, etc. */
export type StatelessInputFn = () => InputState;
```

- [ ] **Step 4: Create the barrel**

```typescript
// src/engine/input/index.ts
export type { PlayerInput, StatelessInputFn } from './PlayerInput';
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/engine/input/__tests__/PlayerInput.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/input/PlayerInput.ts src/engine/input/index.ts src/engine/input/__tests__/PlayerInput.test.ts
git commit -m "feat(input): add PlayerInput interface — unified action source"
```

---

### Task 2.2: KeyboardManager + KeyboardInput

Refactor the existing `InputManager` into a `KeyboardManager` (owns `window` listeners) plus per-slot `KeyboardInput` views (PlayerInput impl).

**Files:**
- Create: `src/engine/input/KeyboardManager.ts`
- Create: `src/engine/input/KeyboardInput.ts`
- Test: `src/engine/input/__tests__/KeyboardInput.test.ts`
- Modify: `src/engine/input/index.ts`
- Modify: `src/engine/input.ts` (DEPRECATED — re-export shim during transition)

- [ ] **Step 1: Write the test**

```typescript
// src/engine/input/__tests__/KeyboardInput.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyboardManager } from '../KeyboardManager';
import { KeyboardInput } from '../KeyboardInput';
import type { MatchState } from '../../types';

const fakeState = {} as MatchState;

describe('KeyboardManager + KeyboardInput', () => {
  let mgr: KeyboardManager;

  beforeEach(() => {
    mgr = new KeyboardManager();
    mgr.attach();
  });

  afterEach(() => {
    mgr.detach();
  });

  it('maps P1 keys (a/d/w/s) to left/right/jump/down', () => {
    const input = new KeyboardInput('P1', mgr);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    expect(input.getAction(fakeState)).toEqual({ left: false, right: true, jump: false, down: false });

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(input.getAction(fakeState).jump).toBe(true);
    // Jump only fires once per press
    expect(input.getAction(fakeState).jump).toBe(false);
  });

  it('detach clears state and listeners', () => {
    const input = new KeyboardInput('P2', mgr);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(input.getAction(fakeState).right).toBe(true);
    mgr.detach();
    // After detach, keys are cleared
    expect(input.getAction(fakeState).right).toBe(false);
  });

  it('two KeyboardInputs for different slots are independent', () => {
    const p1 = new KeyboardInput('P1', mgr);
    const p2 = new KeyboardInput('P2', mgr);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));        // P1 right
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); // P2 left

    expect(p1.getAction(fakeState).right).toBe(true);
    expect(p2.getAction(fakeState).left).toBe(true);
  });
});
```

- [ ] **Step 2: Create KeyboardManager**

```typescript
// src/engine/input/KeyboardManager.ts
import type { CharacterSlot, KeyBindings } from '../types';

export const KEY_BINDINGS: Record<CharacterSlot, KeyBindings> = {
  P1: { left: 'a', right: 'd', jump: 'w', down: 's' },
  P2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown' },
  P3: { left: 'j', right: 'l', jump: 'i', down: 'k' },
  P4: { left: 'f', right: 'h', jump: 't', down: 'g' },
  P5: { left: '4', right: '6', jump: '8', down: '5' },
};

/**
 * Owns window keyboard listeners and pressed-key state.
 * Per-slot KeyboardInput instances share one KeyboardManager.
 */
export class KeyboardManager {
  private keys: Set<string> = new Set();
  private jumpPressed: Map<CharacterSlot, boolean> = new Map();

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    e.preventDefault();
    this.keys.add(this.normalizeKey(e.key));
  };

  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    e.preventDefault();
    const key = this.normalizeKey(e.key);
    this.keys.delete(key);
    for (const [slot, b] of Object.entries(KEY_BINDINGS)) {
      if (key === b.jump) this.jumpPressed.set(slot as CharacterSlot, false);
    }
  };

  attach(): void {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.jumpPressed.clear();
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  isAnyKeyDown(): boolean {
    return this.keys.size > 0;
  }

  /** Read pressed-key state for a slot. Used by KeyboardInput.getAction(). */
  readSlot(slot: CharacterSlot): { left: boolean; right: boolean; jump: boolean; down: boolean } {
    const b = KEY_BINDINGS[slot];
    const jumpHeld = this.keys.has(b.jump);
    const jumpEdge = jumpHeld && !this.jumpPressed.get(slot);
    if (jumpEdge) this.jumpPressed.set(slot, true);
    return {
      left: this.keys.has(b.left),
      right: this.keys.has(b.right),
      jump: jumpEdge,
      down: this.keys.has(b.down),
    };
  }

  /** Read input from ALL key bindings merged (for online play — any keys work). */
  readAny(): { left: boolean; right: boolean; jump: boolean; down: boolean } {
    let left = false, right = false, jump = false, down = false;
    for (const [slot, b] of Object.entries(KEY_BINDINGS)) {
      if (this.keys.has(b.left)) left = true;
      if (this.keys.has(b.right)) right = true;
      if (this.keys.has(b.down)) down = true;
      if (this.keys.has(b.jump) && !this.jumpPressed.get(slot as CharacterSlot)) {
        jump = true;
        this.jumpPressed.set(slot as CharacterSlot, true);
      }
    }
    return { left, right, jump, down };
  }

  private normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
```

- [ ] **Step 3: Create KeyboardInput**

```typescript
// src/engine/input/KeyboardInput.ts
import type { InputState, MatchState, PlayerSlot, CharacterSlot } from '../types';
import type { PlayerInput } from './PlayerInput';
import type { KeyboardManager } from './KeyboardManager';

/** PlayerInput backed by a slot's keyboard bindings. */
export class KeyboardInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly mgr: KeyboardManager;
  private readonly characterSlot: CharacterSlot;

  constructor(slot: CharacterSlot, mgr: KeyboardManager) {
    this.slot = slot;
    this.characterSlot = slot;
    this.mgr = mgr;
  }

  getAction(_state: Readonly<MatchState>): InputState {
    return this.mgr.readSlot(this.characterSlot);
  }
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/input/index.ts
export type { PlayerInput, StatelessInputFn } from './PlayerInput';
export { KeyboardManager, KEY_BINDINGS } from './KeyboardManager';
export { KeyboardInput } from './KeyboardInput';
```

- [ ] **Step 5: Make `src/engine/input.ts` a backward-compat re-export shim**

Replace `src/engine/input.ts` with:

```typescript
// Backward-compat shim — new code should import from './input/'.
// InputManager kept as a tiny adapter over KeyboardManager so existing call sites compile.

import type { CharacterSlot, InputState } from './types';
import { KeyboardManager, KEY_BINDINGS } from './input/KeyboardManager';

export { KEY_BINDINGS };

/** @deprecated Use KeyboardManager + KeyboardInput from './input/' instead. */
export class InputManager {
  private mgr = new KeyboardManager();

  attach(): void { this.mgr.attach(); }
  detach(): void { this.mgr.detach(); }

  getInput(slot: CharacterSlot): InputState {
    return this.mgr.readSlot(slot);
  }

  getInputAny(): InputState {
    return this.mgr.readAny();
  }

  isKeyDown(key: string): boolean { return this.mgr.isKeyDown(key); }
  isAnyKeyDown(): boolean { return this.mgr.isAnyKeyDown(); }
}
```

- [ ] **Step 6: Run KeyboardInput test + full suite**

```bash
npx vitest run src/engine/input/__tests__/KeyboardInput.test.ts
npm test -- --run
```

Expected: KeyboardInput passes; full suite still green (input.ts shim preserves InputManager API).

- [ ] **Step 7: Commit**

```bash
git add src/engine/input/ src/engine/input.ts
git commit -m "feat(input): KeyboardManager + KeyboardInput; deprecate InputManager"
```

---

### Task 2.3: RuleBasedBot wrapping AIController

**Files:**
- Create: `src/engine/input/RuleBasedBot.ts`
- Test: `src/engine/input/__tests__/RuleBasedBot.test.ts`
- Modify: `src/engine/input/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/input/__tests__/RuleBasedBot.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RuleBasedBot } from '../RuleBasedBot';
import type { MatchState } from '../../types';

describe('RuleBasedBot', () => {
  it('delegates to AIController.getInput()', () => {
    const fakeController = {
      getInput: vi.fn(() => ({ left: true, right: false, jump: false, down: false })),
    };
    const bot = new RuleBasedBot('B1', fakeController as never);
    const input = bot.getAction({} as MatchState);
    expect(input).toEqual({ left: true, right: false, jump: false, down: false });
    expect(fakeController.getInput).toHaveBeenCalledOnce();
  });

  it('passes state to controller', () => {
    const fakeController = {
      getInput: vi.fn(() => ({ left: false, right: false, jump: false, down: false })),
    };
    const bot = new RuleBasedBot('B2', fakeController as never);
    const state = { foo: 'bar' } as unknown as MatchState;
    bot.getAction(state);
    expect(fakeController.getInput).toHaveBeenCalledWith(state);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/engine/input/__tests__/RuleBasedBot.test.ts
```

Expected: FAIL — RuleBasedBot not found.

- [ ] **Step 3: Create RuleBasedBot**

First, audit `src/engine/ai/aiController.ts` to confirm the AIController.getInput signature:

```bash
grep -n "getInput" src/engine/ai/aiController.ts
```

If `AIController.getInput(state)` exists, proceed. If the existing method is named differently (e.g. `decide()`), substitute the actual name.

```typescript
// src/engine/input/RuleBasedBot.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput } from './PlayerInput';
import type { AIController } from '../ai';

/** PlayerInput wrapping the existing utility-based AIController. */
export class RuleBasedBot implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly controller: AIController;

  constructor(slot: PlayerSlot, controller: AIController) {
    this.slot = slot;
    this.controller = controller;
  }

  getAction(state: Readonly<MatchState>): InputState {
    return this.controller.getInput(state);
  }
}
```

If `AIController.getInput` actually takes more args (verified via grep in step 3), replicate them — e.g. if it takes `(state, arena, slot)`, expose those fields.

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/input/index.ts (add line)
export { RuleBasedBot } from './RuleBasedBot';
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/engine/input/__tests__/RuleBasedBot.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/input/RuleBasedBot.ts src/engine/input/__tests__/RuleBasedBot.test.ts src/engine/input/index.ts
git commit -m "feat(input): RuleBasedBot wraps AIController as PlayerInput"
```

---

### Task 2.4: RemoteInput for network play

**Files:**
- Create: `src/engine/input/RemoteInput.ts`
- Test: `src/engine/input/__tests__/RemoteInput.test.ts`
- Modify: `src/engine/input/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/input/__tests__/RemoteInput.test.ts
import { describe, it, expect } from 'vitest';
import { RemoteInput } from '../RemoteInput';
import type { MatchState } from '../../types';

describe('RemoteInput', () => {
  it('returns the most recently set input', () => {
    const input = new RemoteInput('P2');
    expect(input.getAction({} as MatchState)).toEqual({ left: false, right: false, jump: false, down: false });

    input.setInput({ left: true, right: false, jump: false, down: false });
    expect(input.getAction({} as MatchState)).toEqual({ left: true, right: false, jump: false, down: false });
  });

  it('jump is consumed once (latched edge)', () => {
    const input = new RemoteInput('P2');
    input.setInput({ left: false, right: false, jump: true, down: false });
    expect(input.getAction({} as MatchState).jump).toBe(true);
    // Subsequent reads with the same buffered input return jump=false until setInput refreshes
    expect(input.getAction({} as MatchState).jump).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/input/__tests__/RemoteInput.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create RemoteInput**

```typescript
// src/engine/input/RemoteInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput } from './PlayerInput';

/**
 * PlayerInput fed by an external source (typically network — host buffers guest inputs).
 * Caller owns input lifecycle: calls setInput(...) when fresh data arrives;
 * getAction() returns the most recent input. Jump is latched (one-shot) per setInput call.
 */
export class RemoteInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private buffered: InputState = { left: false, right: false, jump: false, down: false };
  private jumpConsumed = false;

  constructor(slot: PlayerSlot) {
    this.slot = slot;
  }

  /** Update the buffered input. Resets jump-consumed latch. */
  setInput(input: InputState): void {
    this.buffered = input;
    this.jumpConsumed = false;
  }

  getAction(_state: Readonly<MatchState>): InputState {
    if (this.jumpConsumed) {
      return { ...this.buffered, jump: false };
    }
    if (this.buffered.jump) this.jumpConsumed = true;
    return this.buffered;
  }
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/input/index.ts (add line)
export { RemoteInput } from './RemoteInput';
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/engine/input/__tests__/RemoteInput.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/input/RemoteInput.ts src/engine/input/__tests__/RemoteInput.test.ts src/engine/input/index.ts
git commit -m "feat(input): RemoteInput buffers network-supplied actions"
```

---

### Task 2.5: RandomInput for synthetic / perf testing

**Files:**
- Create: `src/engine/input/RandomInput.ts`
- Test: `src/engine/input/__tests__/RandomInput.test.ts`
- Modify: `src/engine/input/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/input/__tests__/RandomInput.test.ts
import { describe, it, expect } from 'vitest';
import { RandomInput } from '../RandomInput';
import { SeededRNG } from '../../net/prng';
import type { MatchState } from '../../types';

describe('RandomInput', () => {
  it('produces deterministic sequence given the same seed', () => {
    const rng1 = new SeededRNG(new Uint8Array([1, 2, 3, 4]));
    const rng2 = new SeededRNG(new Uint8Array([1, 2, 3, 4]));
    const a = new RandomInput('P1', () => rng1.random());
    const b = new RandomInput('P1', () => rng2.random());

    for (let i = 0; i < 100; i++) {
      expect(a.getAction({} as MatchState)).toEqual(b.getAction({} as MatchState));
    }
  });

  it('produces all four action types over time (smoke)', () => {
    const rng = new SeededRNG(new Uint8Array([42]));
    const input = new RandomInput('P1', () => rng.random());
    const seen = { left: 0, right: 0, jump: 0, down: 0 };
    for (let i = 0; i < 1000; i++) {
      const a = input.getAction({} as MatchState);
      if (a.left) seen.left++;
      if (a.right) seen.right++;
      if (a.jump) seen.jump++;
      if (a.down) seen.down++;
    }
    expect(seen.left).toBeGreaterThan(0);
    expect(seen.right).toBeGreaterThan(0);
    expect(seen.jump).toBeGreaterThan(0);
    expect(seen.down).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/input/__tests__/RandomInput.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create RandomInput**

```typescript
// src/engine/input/RandomInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput } from './PlayerInput';

/**
 * Synthetic input — weighted random keys, deterministic if rng is seeded.
 * Used for perf benchmarks (vsync-uncapped E2E run) and ML self-play warmup.
 *
 * Default weights match the perf-profiling spec: 35% left, 35% right, 20% jump, 10% down.
 */
export class RandomInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly rng: () => number;
  private readonly weights: { left: number; right: number; jump: number; down: number };

  constructor(
    slot: PlayerSlot,
    rng: () => number = Math.random,
    weights: { left: number; right: number; jump: number; down: number } = { left: 0.35, right: 0.35, jump: 0.20, down: 0.10 },
  ) {
    this.slot = slot;
    this.rng = rng;
    this.weights = weights;
  }

  getAction(_state: Readonly<MatchState>): InputState {
    return {
      left: this.rng() < this.weights.left,
      right: this.rng() < this.weights.right,
      jump: this.rng() < this.weights.jump,
      down: this.rng() < this.weights.down,
    };
  }
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/input/index.ts (add line)
export { RandomInput } from './RandomInput';
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/engine/input/__tests__/RandomInput.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/input/RandomInput.ts src/engine/input/__tests__/RandomInput.test.ts src/engine/input/index.ts
git commit -m "feat(input): RandomInput — weighted-random PlayerInput for perf/ML"
```

---

### Task 2.6: Wire PlayerInput into GameLoop

`GameLoop` currently constructs its own `InputManager` and uses internal `aiControllers` for bots. This task adds a `setPlayerInputs(inputs: PlayerInput[])` method; the existing internal logic stays as a fallback so we can roll out incrementally without breaking call sites.

**Files:**
- Modify: `src/engine/gameLoop/GameLoop.ts`
- Test: `src/engine/gameLoop/__tests__/playerInputs.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/gameLoop/__tests__/playerInputs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameLoop } from '../GameLoop';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { registerBuiltinArenas } from '../../arenas/builtin';
import type { PlayerInput } from '../../input';
import type { InputState, MatchSettings, MatchState, PlayerSlot } from '../../types';
import { FIXED_TIMESTEP } from '../../constants';

vi.mock('howler', () => ({
  Howl: vi.fn(function (this: Record<string, unknown>) {
    this.play = vi.fn(); this.stop = vi.fn(); this.volume = vi.fn();
    this.unload = vi.fn(); this.on = vi.fn(); this.once = vi.fn();
    this.playing = vi.fn(() => false);
    return this;
  }),
  Howler: { mute: vi.fn() },
}));

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

function mockCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({}, { get: () => vi.fn() });
  return { width: 1280, height: 720, getContext: vi.fn(() => ctx), style: {} } as unknown as HTMLCanvasElement;
}

class StubInput implements PlayerInput {
  readonly slot: PlayerSlot;
  public callCount = 0;
  constructor(slot: PlayerSlot, private readonly action: InputState) {
    this.slot = slot;
  }
  getAction(_state: Readonly<MatchState>): InputState {
    this.callCount++;
    return this.action;
  }
}

describe('GameLoop.setPlayerInputs', () => {
  it('uses provided inputs in fixedUpdate when set', () => {
    const settings: MatchSettings = {
      activePlayers: ['P1', 'P2'],
      arenaId: 'meadow',
      killLimit: 16,
      botDifficulty: 'medium',
      mods: {} as MatchSettings['mods'],
    };

    const loop = new GameLoop(mockCanvas(), mockCanvas(), settings, () => {}, undefined, new Uint8Array([1, 2, 3, 4]));
    loop.setNetworkMode(true);
    (loop as unknown as { state: { phase: string } }).state.phase = 'playing';

    const p1 = new StubInput('P1', { left: false, right: true, jump: false, down: false });
    const p2 = new StubInput('P2', { left: true, right: false, jump: false, down: false });
    loop.setPlayerInputs([p1, p2]);

    loop.fixedUpdate(FIXED_TIMESTEP);
    expect(p1.callCount).toBeGreaterThanOrEqual(1);
    expect(p2.callCount).toBeGreaterThanOrEqual(1);

    // Effect on state: P1 should have positive vx, P2 negative
    const state = (loop as unknown as { state: { players: Array<{ id: PlayerSlot; vx: number }> } }).state;
    const p1State = state.players.find((p) => p.id === 'P1')!;
    const p2State = state.players.find((p) => p.id === 'P2')!;
    expect(p1State.vx).toBeGreaterThan(0);
    expect(p2State.vx).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/gameLoop/__tests__/playerInputs.test.ts
```

Expected: FAIL — `setPlayerInputs` not a function.

- [ ] **Step 3: Add setPlayerInputs to GameLoop**

In `src/engine/gameLoop/GameLoop.ts`:

a) Add import:
```typescript
import type { PlayerInput } from '../input';
```

b) Add field declaration (near other private fields, before constructor):
```typescript
private playerInputs: PlayerInput[] = [];
```

c) Add public method (place near `setNetworkMode`). Note this also flips `_networkMode = true` so the existing input-reading code path (used by netcode) picks up the PlayerInput-derived `_networkInputs` map without further changes:
```typescript
/** Set the input sources for this match. Each tick, getAction() is called per
 *  PlayerInput and the result is fed to fixedUpdate as networkInputs.
 *  Setting non-empty inputs implicitly enables network mode — "external code
 *  drives the loop" semantics, which is what we want here. */
setPlayerInputs(inputs: PlayerInput[]): void {
  this.playerInputs = inputs;
  if (inputs.length > 0) this._networkMode = true;
}
```

d) In `fixedUpdate`, build the inputs map from PlayerInput[] before the existing logic uses `_networkInputs`. Find the existing line `this._networkInputs = networkInputs;` and replace it with:

```typescript
if (networkInputs) {
  this._networkInputs = networkInputs;
} else if (this.playerInputs.length > 0) {
  const map = new Map<string, InputState>();
  for (const inp of this.playerInputs) {
    map.set(inp.slot, inp.getAction(this.state));
  }
  this._networkInputs = map;
} else {
  this._networkInputs = undefined;
}
```

Precedence: explicit `networkInputs` (host-authority, rollback) wins; otherwise PlayerInputs are queried; otherwise the keyboard/AI default path runs (unchanged).

- [ ] **Step 4: Run the test + full suite**

```bash
npx vitest run src/engine/gameLoop/__tests__/playerInputs.test.ts
npm test -- --run
```

Expected: new test passes; full suite green (existing keyboard/AI path is unchanged because `playerInputs` defaults to empty).

- [ ] **Step 5: Run regression tests**

```bash
npx vitest run src/engine/__tests__/regression-determinism.test.ts src/engine/__tests__/regression-audio-trace.test.ts
```

Expected: pass with no snapshot diff (this change should have zero behavioral impact on existing call paths).

- [ ] **Step 6: Commit**

```bash
git add src/engine/gameLoop/GameLoop.ts src/engine/gameLoop/__tests__/playerInputs.test.ts
git commit -m "feat(gameLoop): accept PlayerInput[] via setPlayerInputs() — opt-in"
```

---

# Phase 3: Simulator Extraction

Move state ownership, gameplay systems, and the simulation step out of `GameLoop` into a new `Simulator` class. `GameLoop` becomes a thin adapter that holds a `Simulator`, owns browser-only concerns (Renderer, cosmetic systems, audio orchestration, rAF, keyboard), and delegates simulation work.

### Task 3.1: Simulator scaffold (skeleton + public API surface)

Empty class with the public methods stubbed. Tests verify the API exists. This pins the contract before implementation.

**Files:**
- Create: `src/engine/simulator/types.ts`
- Create: `src/engine/simulator/Simulator.ts`
- Create: `src/engine/simulator/index.ts`
- Create: `src/engine/simulator/__tests__/Simulator.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/engine/simulator/types.ts
import type { MatchSettings } from '../types';

export interface SimulatorConfig {
  settings: MatchSettings;
  /** 8-byte seed for the SeededRNG (gameplay + AI streams). */
  seed: Uint8Array;
  /**
   * Callback fired by gameplay systems for SFX. Default is a no-op (headless).
   * Browser adapter passes the audio module's play function (gated by GameLoop's _audioEnabled).
   */
  playSound?: (name: string) => void;
  /** Same shape for character/animal sounds (e.g. stomp character grunt). */
  playAnimal?: (characterName: string) => void;
}
```

- [ ] **Step 2: Write the API-surface test**

```typescript
// src/engine/simulator/__tests__/Simulator.test.ts
import { describe, it, expect } from 'vitest';
import { Simulator } from '../Simulator';
import type { SimulatorConfig } from '../types';
import type { MatchSettings } from '../../types';

describe('Simulator API surface', () => {
  it('class is exported', () => {
    expect(typeof Simulator).toBe('function');
  });

  it('SimulatorConfig type compiles', () => {
    const config: SimulatorConfig = {
      settings: { activePlayers: ['P1'], arenaId: 'meadow', killLimit: 16, botDifficulty: 'medium', mods: {} as MatchSettings['mods'] },
      seed: new Uint8Array([1, 2, 3, 4]),
    };
    expect(config).toBeDefined();
  });

  it('declares the public method surface (compile-time check)', () => {
    type SimMethods = keyof Simulator;
    const required: SimMethods[] = ['step', 'setPhase', 'setOnPhaseChange', 'switchArena', 'getState', 'getPlayers', 'isMatchOver', 'getParticleSystem', 'getArena', 'getOriginalArena', 'getTheme'];
    expect(required.length).toBe(11);
  });
});
```

- [ ] **Step 3: Create stub Simulator**

```typescript
// src/engine/simulator/Simulator.ts
import type { InputState, MatchPhase, MatchState, Player, Arena } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { ParticleSystem } from '../gameLoop/cosmetics/ParticleSystem';
import type { SimulatorConfig } from './types';

/**
 * Pure simulation core. Owns MatchState, Player[], all gameplay systems, the seeded RNG.
 * Knows nothing about rendering, audio (beyond an injected playSound callback), input
 * sources, schedulers, or browser APIs.
 *
 * Adapters (GameLoop for browser, HeadlessRunner for ML, host-authority for net) compose
 * this with the rest of the world.
 */
export class Simulator {
  constructor(_config: SimulatorConfig) {
    throw new Error('Simulator: not implemented (Task 3.2)');
  }

  step(_inputs: Map<string, InputState>, _dt: number): void { throw new Error('not implemented'); }
  setPhase(_phase: MatchPhase): void { throw new Error('not implemented'); }
  setOnPhaseChange(_cb: (phase: MatchPhase) => void): void { throw new Error('not implemented'); }
  switchArena(_arenaId: string): void { throw new Error('not implemented'); }
  getState(): Readonly<MatchState> { throw new Error('not implemented'); }
  getPlayers(): readonly Player[] { throw new Error('not implemented'); }
  isMatchOver(): boolean { throw new Error('not implemented'); }
  getParticleSystem(): ParticleSystem { throw new Error('not implemented'); }
  getArena(): Arena { throw new Error('not implemented'); }
  getOriginalArena(): Arena { throw new Error('not implemented'); }
  getTheme(): ThemeConfig { throw new Error('not implemented'); }
}
```

- [ ] **Step 4: Create the barrel**

```typescript
// src/engine/simulator/index.ts
export { Simulator } from './Simulator';
export type { SimulatorConfig } from './types';
```

- [ ] **Step 5: Run the test + build**

```bash
npx vitest run src/engine/simulator/__tests__/Simulator.test.ts
npm run build
```

Expected: tests pass (compile-time + structural only); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/simulator/
git commit -m "feat(simulator): empty scaffold — public API surface"
```

---

### Task 3.2: Move state, RNG, and gameplay systems into Simulator

The big task. Bulk-moves simulation construction logic from `GameLoop` into `Simulator`, then makes `GameLoop` hold and delegate to a `Simulator` instance. Each step is localizable so failures are easy to bisect.

**Files:**
- Modify: `src/engine/simulator/Simulator.ts`
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Audit gameplay system constructor signatures**

Before moving anything, read each gameplay system's constructor to know exactly what arguments it takes:

```bash
grep -n "constructor" src/engine/gameLoop/gameplay/HazardSystem.ts src/engine/gameLoop/gameplay/CarrotSystem.ts src/engine/gameLoop/gameplay/ArenaEntitySystem.ts src/engine/gameLoop/gameplay/EffectZoneSystem.ts src/engine/gameLoop/gameplay/PlayerCollisionSystem.ts src/engine/gameLoop/gameplay/StompSystem.ts src/engine/gameLoop/gameplay/MatchSystem.ts src/engine/gameLoop/cosmetics/ParticleSystem.ts
```

Note each constructor signature in your scratch buffer — Step 3 calls them.

- [ ] **Step 2: Add Simulator's private fields**

In `src/engine/simulator/Simulator.ts`, replace the stub class body with field declarations matching what GameLoop currently owns simulation-side. (`erasableSyntaxOnly` requires explicit fields.)

Replace the imports block at the top with:

```typescript
import type { MatchState, MatchSettings, Arena, MatchPhase, InputState, Player } from '../types';
import type { ThemeConfig } from '../themes/types';
import { SeededRNG } from '../net/prng';
import { getArena, getTheme, mirrorArena } from '../arenas';
import { computeEffectivePhysics, createInitialPlayers, createInitialMatchState } from '../gameLoop/initialState';
import { ParticleSystem } from '../gameLoop/cosmetics/ParticleSystem';
import { HazardSystem } from '../gameLoop/gameplay/HazardSystem';
import { CarrotSystem } from '../gameLoop/gameplay/CarrotSystem';
import { ArenaEntitySystem } from '../gameLoop/gameplay/ArenaEntitySystem';
import { EffectZoneSystem } from '../gameLoop/gameplay/EffectZoneSystem';
import { PlayerCollisionSystem } from '../gameLoop/gameplay/PlayerCollisionSystem';
import { StompSystem } from '../gameLoop/gameplay/StompSystem';
import { MatchSystem } from '../gameLoop/gameplay/MatchSystem';
import type { SimulatorConfig } from './types';
```

Replace the class body with:

```typescript
export class Simulator {
  private state!: MatchState;
  private arena!: Arena;
  private originalArena!: Arena;
  private theme!: ThemeConfig;
  private settings: MatchSettings;

  // Effective physics (base constant * theme/mod modifier)
  private effGravity!: number;
  private effFriction!: number;
  private effWalkSpeed!: number;
  private effJumpImpulse!: number;
  private effMaxFallSpeed!: number;

  // PRNG streams — split so AI conditional calls can't desync gameplay RNG
  private rng!: SeededRNG;
  private aiRng!: SeededRNG;

  // Gameplay systems
  particleSystem!: ParticleSystem;
  private hazardSystem!: HazardSystem;
  private carrotSystem!: CarrotSystem;
  private arenaEntitySystem!: ArenaEntitySystem;
  private effectZoneSystem!: EffectZoneSystem;
  private playerCollisionSystem!: PlayerCollisionSystem;
  private stompSystem!: StompSystem;
  private matchSystem!: MatchSystem;

  // Phase change subscriber
  private onPhaseChange?: (phase: MatchPhase) => void;

  // Audio hooks (no-op default)
  private playSound: (name: string) => void;
  private playAnimal: (characterName: string) => void;

  // Cached arrow for hot paths (avoids .bind allocations)
  private readonly _boundGameRandom = (): number => this.rng.random();

  constructor(config: SimulatorConfig) {
    this.settings = config.settings;
    this.playSound = config.playSound ?? (() => {});
    this.playAnimal = config.playAnimal ?? (() => {});
    // Body filled in Step 3.
  }

  step(_inputs: Map<string, InputState>, _dt: number): void { throw new Error('TODO step 4'); }
  setPhase(_phase: MatchPhase): void { throw new Error('TODO step 5'); }
  setOnPhaseChange(cb: (phase: MatchPhase) => void): void { this.onPhaseChange = cb; }
  switchArena(_arenaId: string): void { throw new Error('TODO step 6'); }
  getState(): Readonly<MatchState> { return this.state; }
  getPlayers(): readonly Player[] { return this.state.players; }
  isMatchOver(): boolean { return this.state.matchOver; }
  getParticleSystem(): ParticleSystem { return this.particleSystem; }
  getArena(): Arena { return this.arena; }
  getOriginalArena(): Arena { return this.originalArena; }
  getTheme(): ThemeConfig { return this.theme; }
}
```

- [ ] **Step 3: Implement the constructor**

Open `src/engine/gameLoop/GameLoop.ts`. Read the constructor body — copy the simulation construction (RNG init, arena resolution, theme resolution, effective physics, MatchState, gameplay systems) into Simulator's constructor body. Adjust references from `this.X` to use Simulator's field names (most are identical).

Replace Simulator's constructor body with:

```typescript
constructor(config: SimulatorConfig) {
  this.settings = config.settings;
  this.playSound = config.playSound ?? (() => {});
  this.playAnimal = config.playAnimal ?? (() => {});

  // PRNG — split streams (gameplay vs AI) seeded from the same bytes
  this.rng = new SeededRNG(config.seed);
  this.aiRng = new SeededRNG(config.seed);

  // Arena + theme resolution
  this.originalArena = getArena(config.settings.arenaId);
  this.arena = config.settings.mods?.mirrorArena ? mirrorArena(this.originalArena) : this.originalArena;
  this.theme = getTheme(config.settings.arenaId);

  // Effective physics
  const phys = computeEffectivePhysics(this.theme, config.settings.mods);
  this.effGravity = phys.effGravity;
  this.effFriction = phys.effFriction;
  this.effWalkSpeed = phys.effWalkSpeed;
  this.effJumpImpulse = phys.effJumpImpulse;
  this.effMaxFallSpeed = phys.effMaxFallSpeed;

  // Players + state
  const players = createInitialPlayers(config.settings.activePlayers, this.arena, !!config.settings.mods?.giantPlayers);
  this.state = createInitialMatchState(this.arena, this.theme, config.settings, players);

  this.constructGameplaySystems();
}

/** Constructs all gameplay systems. Called from constructor and switchArena. */
private constructGameplaySystems(): void {
  // ⚠ Constructor signatures below MUST match the actual signatures from Step 1 audit.
  // The order matters: ParticleSystem first (others reference it).
  this.particleSystem = new ParticleSystem(/* match GameLoop's call */);
  this.hazardSystem = new HazardSystem(/* match GameLoop's call */);
  this.carrotSystem = new CarrotSystem(/* match GameLoop's call */);
  this.arenaEntitySystem = new ArenaEntitySystem(/* match GameLoop's call */);
  this.effectZoneSystem = new EffectZoneSystem(/* match GameLoop's call */);
  this.playerCollisionSystem = new PlayerCollisionSystem(/* match GameLoop's call */);
  this.stompSystem = new StompSystem(/* match GameLoop's call */);
  this.matchSystem = new MatchSystem(/* match GameLoop's call */);
}
```

⚠ Fill in each `/* match GameLoop's call */` by copying the corresponding line from GameLoop's constructor verbatim, then renaming `this.<X>` references to use Simulator's fields. Many systems take `this._boundGameRandom`, `this.particleSystem`, the audio callback (`this.playSound`), and `this.state` / `this.theme` / `this.arena`. Match exactly.

- [ ] **Step 4: Implement step()**

Open `src/engine/gameLoop/GameLoop.ts` and locate `fixedUpdate(dt, networkInputs?)`. Copy its body into `Simulator.step`:

```typescript
step(inputs: Map<string, InputState>, dt: number): void {
  if (this.state.matchOver) return;
  if (this.state.phase === 'loading') return;

  // BODY: paste GameLoop.fixedUpdate's body here.
  // Then mechanically transform:
  //   1. Replace any `this._networkInputs` reads with `inputs`. (Simulator always
  //      receives inputs from the caller — there's no internal/network distinction here.)
  //   2. Remove the leading `this._networkInputs = networkInputs;` line.
  //   3. Remove any `this._networkMode` branching — Simulator always uses `inputs`.
  //   4. Replace `this.input.getInput(slot)` (if reachable) with `inputs.get(slot) ?? defaultInput`.
  //   5. Keep all gameplay system invocations (this.hazardSystem.fixedUpdate(dt), etc.).
  //   6. Keep the per-player loop (physics, collision, stomp checks).
  //   7. Keep Math.fround usage and `f` aliases for cross-arch determinism.
}
```

Define a default input near the top of the file:

```typescript
const NEUTRAL_INPUT: InputState = { left: false, right: false, jump: false, down: false };
```

- [ ] **Step 5: Implement setPhase**

```typescript
setPhase(phase: MatchPhase): void {
  const prev = this.state.phase;
  if (prev === phase) return;
  this.state.phase = phase;
  if (phase === 'playing' && prev !== 'playing') {
    // matchSystem.init() starts ambient loops + arena entity setup. Audio side-effects
    // inside it route through this.playSound (no-op in headless).
    this.matchSystem.init();
  }
  this.onPhaseChange?.(phase);
}
```

Note: the music + ambient calls (`audio.playMusic(themeId)`, `playSound('ambient')`) currently in GameLoop's setPhase do NOT move into Simulator. Those are GameLoop's responsibility (Step 7g).

- [ ] **Step 6: Implement switchArena**

```typescript
switchArena(arenaId: string): void {
  this.originalArena = getArena(arenaId);
  this.arena = this.settings.mods?.mirrorArena ? mirrorArena(this.originalArena) : this.originalArena;
  this.theme = getTheme(arenaId);

  const phys = computeEffectivePhysics(this.theme, this.settings.mods);
  this.effGravity = phys.effGravity;
  this.effFriction = phys.effFriction;
  this.effWalkSpeed = phys.effWalkSpeed;
  this.effJumpImpulse = phys.effJumpImpulse;
  this.effMaxFallSpeed = phys.effMaxFallSpeed;

  const players = createInitialPlayers(this.settings.activePlayers, this.arena, !!this.settings.mods?.giantPlayers);
  this.state = createInitialMatchState(this.arena, this.theme, this.settings, players);

  // Phase resets to 'loading' (createInitialMatchState default)
  this.constructGameplaySystems();

  // Notify subscribers (GameLoop reattaches renderer/cosmetics in its switchArena wrapper).
  this.onPhaseChange?.(this.state.phase);
}
```

- [ ] **Step 7: Refactor GameLoop to hold a Simulator**

Open `src/engine/gameLoop/GameLoop.ts`. The simulation work moves out — GameLoop becomes thinner.

a) Add import:

```typescript
import { Simulator } from '../simulator';
```

b) Add field declaration:

```typescript
private simulator!: Simulator;
```

c) **Remove** these field declarations from GameLoop (they live on Simulator now):

```
state, arena, originalArena, theme, effGravity, effFriction, effWalkSpeed,
effJumpImpulse, effMaxFallSpeed, rng, aiRng, particleSystem, hazardSystem,
carrotSystem, arenaEntitySystem, effectZoneSystem, playerCollisionSystem,
stompSystem, matchSystem, _boundGameRandom
```

d) In GameLoop's constructor, **remove** the simulation construction (RNG init, arena/theme resolution, effective physics, MatchState construction, gameplay system constructors). **Replace** with:

```typescript
this.simulator = new Simulator({
  settings,
  seed: seedBytes,
  playSound: this._boundPlaySound,
  playAnimal: this._boundPlayAnimal,
});
```

If `_boundPlayAnimal` doesn't yet exist, add it near `_boundPlaySound`:

```typescript
private readonly _boundPlayAnimal = (name: string): void => {
  if (!this._audioEnabled) return;
  audio.playAnimal(name);
};
```

Keep the rest of GameLoop's constructor intact: Renderer construction, cosmetic systems, KeyboardManager attach, audio init, debug key handler, render scale subscription, AIController construction.

e) Add get-accessors so existing internal references in cosmetic systems and other GameLoop methods keep working without rewrite:

```typescript
get state(): MatchState { return this.simulator.getState() as MatchState; }
get arena(): Arena { return this.simulator.getArena(); }
get originalArena(): Arena { return this.simulator.getOriginalArena(); }
get theme(): ThemeConfig { return this.simulator.getTheme(); }
get particleSystem(): ParticleSystem { return this.simulator.getParticleSystem(); }
```

(These are getters, not data — they'll satisfy reads like `this.state.phase`, `this.particleSystem.emitParticle()`. Writes that previously mutated `this.state` directly need to go through Simulator instead, but most of GameLoop's writes were already inside the gameplay systems which now run on Simulator's state.)

f) Replace `fixedUpdate`'s body. Phase 2 added input merging from `playerInputs[]` — keep that:

```typescript
fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
  let inputs: Map<string, InputState>;
  if (networkInputs) {
    inputs = networkInputs;
  } else if (this.playerInputs.length > 0) {
    inputs = new Map<string, InputState>();
    for (const inp of this.playerInputs) inputs.set(inp.slot, inp.getAction(this.simulator.getState()));
  } else {
    inputs = this.gatherKeyboardAndAIInputs();
  }
  this.simulator.step(inputs, dt);
}

private gatherKeyboardAndAIInputs(): Map<string, InputState> {
  const map = new Map<string, InputState>();
  for (const slot of this.settings.activePlayers) {
    if (isBotSlot(slot)) {
      const ctrl = this.aiControllers.get(slot);
      map.set(slot, ctrl ? ctrl.getInput(this.simulator.getState()) : { left: false, right: false, jump: false, down: false });
    } else {
      map.set(slot, this.input.getInput(slot));
    }
  }
  return map;
}
```

g) Replace `setPhase` with a delegate that adds the audio side-effect:

```typescript
setPhase(phase: MatchPhase): void {
  const prev = this.simulator.getState().phase;
  this.simulator.setPhase(phase);
  if (phase === 'playing' && prev !== 'playing') {
    audio.playMusic(this.simulator.getArena().themeId);
    this.playSound('ambient');
  }
}
```

(Verify the exact audio calls match what GameLoop's old setPhase did — `playMusic(themeId)` and `playSound('ambient')` per `src/engine/CLAUDE.md`. The `matchSystem.init()` call moved into Simulator.setPhase, so don't repeat it here.)

h) Replace `switchArena` with a delegate that re-attaches the renderer:

```typescript
switchArena(arenaId: string): void {
  this.simulator.switchArena(arenaId);
  this.renderer.setTheme(this.simulator.getTheme());
  this.renderer.renderBackground(this.simulator.getArena(), this.simulator.getOriginalArena());
}
```

(Adjust the renderer method names to match `src/engine/renderer.ts`.)

- [ ] **Step 8: Run gameLoop test suite**

```bash
npx vitest run src/engine/gameLoop.test.ts src/engine/gameLoop/
```

Expected: all pass. Common failure modes:
- `TypeError: this.simulator is undefined` — Step 7d's construction was misplaced; ensure `new Simulator(...)` runs before any `this.simulator.X` reference.
- A test wrote directly to `loop.state.X` — convert to write through Simulator's API or expose an internal helper.
- Mock of `GameLoop` in `netMatch.test.ts` missing the new `simulator` field — add a stub.

- [ ] **Step 9: Run regression suite — fingerprints must match Phase 0 baseline**

```bash
npx vitest run src/engine/__tests__/regression-determinism.test.ts src/engine/__tests__/regression-audio-trace.test.ts
```

Expected: PASS with no snapshot diff. If snapshots diff:
- Determinism diff = state mutation moved or RNG advanced differently. Bisect by reverting individual step-7 changes until the diff disappears.
- Audio diff = a `playSound` call lost or duplicated. Trace the diff to a specific gameplay system; verify its constructor in Simulator.constructGameplaySystems passes the same callback GameLoop passed before.

- [ ] **Step 10: Run full suite**

```bash
npm test -- --run
```

Expected: pass count = Phase 0 baseline + everything added in this plan so far.

- [ ] **Step 11: Browser smoke test**

```bash
npm run build
npm run dev
```

Open `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2`. Verify rendering, audio, AI, scoring, splats all work. This is the final integration check that the refactor preserved end-user behavior.

- [ ] **Step 12: Commit**

```bash
git add src/engine/simulator/ src/engine/gameLoop/GameLoop.ts
git commit -m "refactor: extract Simulator from GameLoop — state + gameplay systems own simulation"
```

---

### Task 3.3: Audit gameplay systems for direct audio imports

After Task 3.2, gameplay systems run inside Simulator. They MUST take audio side-effects through the injected `playSound` callback rather than importing `audio` directly — otherwise headless will trigger Howler in Node.

**Files:**
- Audit + possibly modify: `src/engine/gameLoop/gameplay/*.ts`
- Audit + possibly modify: `src/engine/gameLoop/cosmetics/ParticleSystem.ts`

- [ ] **Step 1: Find direct audio imports**

```bash
grep -rn "from.*audio" src/engine/gameLoop/gameplay/ src/engine/gameLoop/cosmetics/ParticleSystem.ts
```

- [ ] **Step 2: For each match, replace with constructor injection**

Pattern:

Before:
```typescript
import { audio } from '../../audio';
// ...
audio.play('lava');
```

After (in the system's constructor):
```typescript
private readonly playSound: (name: string) => void;

constructor(state: MatchState, ..., playSound: (name: string) => void) {
  this.playSound = playSound;
}

// Usage:
this.playSound('lava');
```

If a system already takes a `playSound` callback (the established pattern per `src/engine/CLAUDE.md`), confirm all audio calls go through it — no leftover direct `audio.play` references.

- [ ] **Step 3: Update Simulator's constructGameplaySystems to pass the callback**

If any system gained a new `playSound` parameter in step 2, update the corresponding `new XSystem(...)` call in `Simulator.constructGameplaySystems()` to pass `this.playSound`.

- [ ] **Step 4: Run regression tests**

```bash
npx vitest run src/engine/__tests__/regression-audio-trace.test.ts src/engine/__tests__/regression-determinism.test.ts
```

Expected: PASS with no snapshot diff.

- [ ] **Step 5: Run Node-import test**

```bash
npx vitest run src/engine/__tests__/regression-node-import.test.ts
```

Expected: pass — gameplay systems now import-safe in Node since the `audio` import is gone.

- [ ] **Step 6: Commit (if files changed)**

```bash
git add src/engine/gameLoop/gameplay/ src/engine/gameLoop/cosmetics/ src/engine/simulator/Simulator.ts
git commit -m "refactor(audio): all gameplay systems route SFX through injected playSound"
```

If no files changed, skip.

---

### Task 3.4: Simulator determinism regression test

Now Simulator is real (not a wrapper). Lock its determinism fingerprint as an independent regression target. The fingerprint MUST match GameLoop's (Task 0.2 snapshot) — if it doesn't, Simulator computes something differently than GameLoop did.

**Files:**
- Create: `src/engine/__tests__/regression-simulator-determinism.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/__tests__/regression-simulator-determinism.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Simulator } from '../simulator';
import { registerBuiltinCharacters } from '../characters/builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import type { InputState, MatchSettings, PlayerSlot } from '../types';
import { FIXED_TIMESTEP } from '../constants';

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

function runScenario(): { positions: Array<{ slot: PlayerSlot; x: number; y: number }>; kills: number; phase: string } {
  const settings: MatchSettings = {
    activePlayers: ['P1', 'P2'],
    arenaId: 'meadow',
    killLimit: 16,
    botDifficulty: 'medium',
    mods: {} as MatchSettings['mods'],
  };
  // No mocks needed: Simulator has no DOM/audio at module load (Phase 1 + Task 3.3).
  const sim = new Simulator({ settings, seed: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) });
  sim.setPhase('playing');
  for (let f = 0; f < 600; f++) {
    const inputs = new Map<string, InputState>([
      ['P1', { left: false, right: true, jump: f % 30 === 0, down: false }],
      ['P2', { left: true, right: false, jump: f % 45 === 0, down: false }],
    ]);
    sim.step(inputs, FIXED_TIMESTEP);
  }
  const state = sim.getState();
  return {
    positions: state.players.map((p) => ({ slot: p.id, x: p.x, y: p.y })),
    kills: state.killFeed.length,
    phase: state.phase,
  };
}

describe('regression: Simulator determinism', () => {
  it('produces a stable fingerprint', () => {
    expect(runScenario()).toMatchSnapshot();
  });

  it('is byte-stable across runs', () => {
    expect(runScenario()).toEqual(runScenario());
  });
});
```

- [ ] **Step 2: Run, capture fixture**

```bash
npx vitest run src/engine/__tests__/regression-simulator-determinism.test.ts
```

Expected: pass; snapshot created.

- [ ] **Step 3: Compare fingerprints**

```bash
diff src/engine/__tests__/__snapshots__/regression-determinism.test.ts.snap src/engine/__tests__/__snapshots__/regression-simulator-determinism.test.ts.snap
```

The two scenarios are identical (same seed, same inputs) so the player positions and kill counts should match exactly. A diff means Simulator and GameLoop disagree on the simulation — investigate before proceeding.

- [ ] **Step 4: Add Simulator to Node-import smoke test**

Open `src/engine/__tests__/regression-node-import.test.ts` and add:

```typescript
it('simulator is importable in Node env', async () => {
  const mod = await import('../simulator');
  expect(typeof mod.Simulator).toBe('function');
});

it('simulator constructs without DOM', async () => {
  const { Simulator } = await import('../simulator');
  const { registerBuiltinArenas } = await import('../arenas/builtin');
  const { registerBuiltinCharacters } = await import('../characters/builtin');
  registerBuiltinArenas();
  registerBuiltinCharacters();
  const sim = new Simulator({
    settings: { activePlayers: ['P1'], arenaId: 'meadow', killLimit: 16, botDifficulty: 'medium', mods: {} as never },
    seed: new Uint8Array([1, 2, 3, 4]),
  });
  expect(sim.getState().phase).toBe('loading');
});
```

- [ ] **Step 5: Run + commit**

```bash
npx vitest run src/engine/__tests__/regression-node-import.test.ts src/engine/__tests__/regression-simulator-determinism.test.ts
git add src/engine/__tests__/
git commit -m "test(regression): Simulator fingerprint locked + Node-import smoke"
```

---

# Phase 4: HeadlessRunner + ML Adapter

### Task 4.1: HeadlessRunner skeleton

**Files:**
- Create: `src/engine/headless/HeadlessRunner.ts`
- Create: `src/engine/headless/types.ts`
- Create: `src/engine/headless/index.ts`
- Test: `src/engine/headless/__tests__/HeadlessRunner.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/HeadlessRunner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeadlessRunner } from '../HeadlessRunner';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { registerBuiltinArenas } from '../../arenas/builtin';
import type { InputState, MatchSettings } from '../../types';
import { FIXED_TIMESTEP } from '../../constants';

vi.mock('howler', () => ({
  Howl: vi.fn(function (this: Record<string, unknown>) {
    this.play = vi.fn(); this.stop = vi.fn(); this.volume = vi.fn();
    this.unload = vi.fn(); this.on = vi.fn(); this.once = vi.fn();
    this.playing = vi.fn(() => false);
    return this;
  }),
  Howler: { mute: vi.fn() },
}));

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

const baseSettings: MatchSettings = {
  activePlayers: ['P1', 'P2'],
  arenaId: 'meadow',
  killLimit: 16,
  botDifficulty: 'medium',
  mods: {} as MatchSettings['mods'],
};

describe('HeadlessRunner', () => {
  it('reset transitions to playing phase', () => {
    const r = new HeadlessRunner();
    r.reset({ settings: baseSettings, seed: new Uint8Array([1, 2, 3, 4]) });
    expect(r.getState().phase).toBe('playing');
  });

  it('step advances simulation', () => {
    const r = new HeadlessRunner();
    r.reset({ settings: baseSettings, seed: new Uint8Array([1, 2, 3, 4]) });
    const t0 = r.getState().timeElapsed;
    r.step(new Map([['P1', { left: false, right: true, jump: false, down: false }]]));
    expect(r.getState().timeElapsed).toBeGreaterThan(t0);
  });

  it('done flips when match is over', () => {
    const r = new HeadlessRunner();
    r.reset({ settings: { ...baseSettings, killLimit: 1 }, seed: new Uint8Array([1, 2, 3, 4]) });
    expect(r.done()).toBe(false);
    // Force match over by setting phase
    r.setPhase('over');
    expect(r.done()).toBe(true);
  });

  it('multiple instances run independently in one process', () => {
    const r1 = new HeadlessRunner();
    const r2 = new HeadlessRunner();
    r1.reset({ settings: baseSettings, seed: new Uint8Array([1, 2, 3, 4]) });
    r2.reset({ settings: baseSettings, seed: new Uint8Array([9, 8, 7, 6]) });

    for (let i = 0; i < 30; i++) {
      r1.step(new Map([['P1', { left: false, right: true, jump: false, down: false }]]));
      r2.step(new Map([['P1', { left: true, right: false, jump: false, down: false }]]));
    }

    const p1a = r1.getState().players.find((p) => p.id === 'P1')!;
    const p1b = r2.getState().players.find((p) => p.id === 'P1')!;
    expect(p1a.x).not.toBe(p1b.x); // different inputs produce different state
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/headless/__tests__/HeadlessRunner.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create types**

```typescript
// src/engine/headless/types.ts
import type { MatchSettings } from '../types';

export interface HeadlessResetConfig {
  settings: MatchSettings;
  seed: Uint8Array;
}
```

- [ ] **Step 4: Create HeadlessRunner**

```typescript
// src/engine/headless/HeadlessRunner.ts
import type { InputState, MatchPhase, MatchState, PlayerSlot } from '../types';
import { Simulator } from '../simulator';
import { FIXED_TIMESTEP } from '../constants';
import type { HeadlessResetConfig } from './types';

/**
 * ML self-play adapter. Composes a Simulator directly — no GameLoop, no Renderer,
 * no cosmetic systems, no rAF. Caller drives via step(). Audio is silent by absence:
 * Simulator's gameplay systems get the no-op playSound default.
 */
export class HeadlessRunner {
  private sim: Simulator | null = null;

  /** Begin a new episode. Discards any prior simulator. Phase transitions to 'playing'. */
  reset(config: HeadlessResetConfig): void {
    // No playSound passed — Simulator's gameplay systems get the no-op default. Silence by absence.
    this.sim = new Simulator({ settings: config.settings, seed: config.seed });
    this.sim.setPhase('playing');
  }

  /** Advance one fixed timestep with the provided action map. */
  step(actions: Map<PlayerSlot, InputState>, dt: number = FIXED_TIMESTEP): void {
    if (!this.sim) throw new Error('HeadlessRunner.step called before reset()');
    // Convert PlayerSlot keys to string for the underlying Map signature
    const inputMap = new Map<string, InputState>();
    for (const [slot, action] of actions) inputMap.set(slot, action);
    this.sim.step(inputMap, dt);
  }

  /** True when the match has ended. */
  done(): boolean {
    if (!this.sim) return false;
    const s = this.sim.getState();
    return s.phase === 'over' || s.matchOver;
  }

  /** Read-only state. */
  getState(): Readonly<MatchState> {
    if (!this.sim) throw new Error('HeadlessRunner.getState called before reset()');
    return this.sim.getState();
  }

  /** Force a phase transition (e.g. for tests). */
  setPhase(phase: MatchPhase): void {
    if (!this.sim) throw new Error('HeadlessRunner.setPhase called before reset()');
    this.sim.setPhase(phase);
  }
}
```

- [ ] **Step 5: Create barrel**

```typescript
// src/engine/headless/index.ts
export { HeadlessRunner } from './HeadlessRunner';
export type { HeadlessResetConfig } from './types';
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run src/engine/headless/__tests__/HeadlessRunner.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/headless/
git commit -m "feat(headless): HeadlessRunner — episode lifecycle for ML self-play"
```

---

### Task 4.2: Observation extractor

**Files:**
- Create: `src/engine/headless/observation.ts`
- Test: `src/engine/headless/__tests__/observation.test.ts`
- Modify: `src/engine/headless/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/observation.test.ts
import { describe, it, expect } from 'vitest';
import { extractObservation, OBSERVATION_DIM } from '../observation';
import type { MatchState, Player, PlayerSlot } from '../../types';

function makePlayer(slot: PlayerSlot, x: number, y: number): Player {
  return {
    id: slot,
    character: { name: 'Bunny' } as Player['character'],
    x, y, vx: 0, vy: 0,
    width: 30, height: 40,
    state: 'idle' as const, facing: 'right' as const,
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true, animFrame: 0, animTimer: 0,
    fastFalling: false, fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [],
    expression: 'normal' as const, killStreak: 0,
    breathTimer: 0, springTrailTimer: 0, damageFlashSide: null,
    damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
  } as Player;
}

describe('extractObservation', () => {
  const state: MatchState = {
    players: [makePlayer('P1', 100, 200), makePlayer('P2', 600, 200)],
    phase: 'playing',
    killFeed: [],
    totalKills: 0,
    timeElapsed: 0,
    matchOver: false,
    winner: null,
  } as unknown as MatchState;

  it('returns a Float32Array of OBSERVATION_DIM length', () => {
    const obs = extractObservation(state, 'P1');
    expect(obs).toBeInstanceOf(Float32Array);
    expect(obs.length).toBe(OBSERVATION_DIM);
  });

  it('encodes self position normalized to [0, 1]', () => {
    const obs = extractObservation(state, 'P1');
    // Slot 0 (self) — first two values are x/1280, y/720
    expect(obs[0]).toBeCloseTo(100 / 1280);
    expect(obs[1]).toBeCloseTo(200 / 720);
  });

  it('mirror-pads when fewer than 5 players present', () => {
    // P3-P5 absent — their slots in the obs vector should be zeros
    const obs = extractObservation(state, 'P1');
    // P3 starts at offset (1 self block) + (1 P2 block) = 2*BLOCK
    const BLOCK = 6;
    for (let i = 2 * BLOCK; i < 5 * BLOCK; i++) {
      expect(obs[i]).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/headless/__tests__/observation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create observation extractor**

```typescript
// src/engine/headless/observation.ts
import type { MatchState, Player, PlayerSlot } from '../types';

const ARENA_WIDTH = 1280;
const ARENA_HEIGHT = 720;
const MAX_VEL = 600;

/** Per-player block: x, y, vx, vy, score, active. */
const BLOCK = 6;
/** 5 player slots, ordered: self first, then others in slot order. */
const SLOTS = 5;

/** Total observation vector length. */
export const OBSERVATION_DIM = SLOTS * BLOCK;

/**
 * Extract a fixed-size Float32Array observation from match state, from the perspective
 * of `selfSlot`. Position/velocity normalized to [-1, 1] or [0, 1].
 *
 * Layout: [self_x, self_y, self_vx, self_vy, self_score, self_active,
 *          other1_x, other1_y, ..., other4_active]
 */
export function extractObservation(state: Readonly<MatchState>, selfSlot: PlayerSlot): Float32Array {
  const obs = new Float32Array(OBSERVATION_DIM);
  const playersBySlot = new Map<PlayerSlot, Player>();
  for (const p of state.players) playersBySlot.set(p.id, p);

  const order: PlayerSlot[] = [selfSlot];
  for (const p of state.players) if (p.id !== selfSlot) order.push(p.id);

  for (let i = 0; i < SLOTS; i++) {
    const slot = order[i];
    if (!slot) continue; // mirror-pad with zeros
    const p = playersBySlot.get(slot);
    if (!p) continue;

    const off = i * BLOCK;
    obs[off + 0] = p.x / ARENA_WIDTH;
    obs[off + 1] = p.y / ARENA_HEIGHT;
    obs[off + 2] = p.vx / MAX_VEL;
    obs[off + 3] = p.vy / MAX_VEL;
    obs[off + 4] = p.score / 16; // normalize against default kill limit
    obs[off + 5] = p.active ? 1 : 0;
  }

  return obs;
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/headless/index.ts (replace contents)
export { HeadlessRunner } from './HeadlessRunner';
export type { HeadlessResetConfig } from './types';
export { extractObservation, OBSERVATION_DIM } from './observation';
```

- [ ] **Step 5: Add getObservation to HeadlessRunner**

In `src/engine/headless/HeadlessRunner.ts`:

```typescript
// Add import
import { extractObservation } from './observation';
import type { PlayerSlot } from '../types';

// Add method (after getState):
/** Extract a fixed-size Float32Array observation from current state. */
getObservation(slot: PlayerSlot): Float32Array {
  if (!this.sim) throw new Error('HeadlessRunner.getObservation called before reset()');
  return extractObservation(this.sim.getState(), slot);
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/engine/headless/
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/headless/
git commit -m "feat(headless): extractObservation — fixed-size Float32 vector per player"
```

---

### Task 4.3: Reward shaper

**Files:**
- Create: `src/engine/headless/reward.ts`
- Test: `src/engine/headless/__tests__/reward.test.ts`
- Modify: `src/engine/headless/HeadlessRunner.ts`
- Modify: `src/engine/headless/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/reward.test.ts
import { describe, it, expect } from 'vitest';
import { computeReward } from '../reward';
import type { MatchState, Player, PlayerSlot } from '../../types';

function makePlayer(slot: PlayerSlot, score: number, active: boolean): Player {
  return { id: slot, score, active } as unknown as Player;
}

function makeState(players: Player[]): MatchState {
  return { players, phase: 'playing', matchOver: false, winner: null } as unknown as MatchState;
}

describe('computeReward', () => {
  it('+1 per kill (score increase since last call)', () => {
    const prev = makeState([makePlayer('P1', 0, true), makePlayer('P2', 0, true)]);
    const next = makeState([makePlayer('P1', 1, true), makePlayer('P2', 0, true)]);
    expect(computeReward(prev, next, 'P1')).toBe(1);
  });

  it('-1 when self becomes inactive (died)', () => {
    const prev = makeState([makePlayer('P1', 0, true)]);
    const next = makeState([makePlayer('P1', 0, false)]);
    expect(computeReward(prev, next, 'P1')).toBe(-1);
  });

  it('+10 win bonus on match over with self winning', () => {
    const prev = makeState([makePlayer('P1', 5, true)]);
    const next: MatchState = { ...prev, matchOver: true, winner: 'P1' } as MatchState;
    expect(computeReward(prev, next, 'P1')).toBe(10);
  });

  it('-10 lose penalty on match over with another player winning', () => {
    const prev = makeState([makePlayer('P1', 0, true)]);
    const next: MatchState = { ...prev, matchOver: true, winner: 'P2' } as MatchState;
    expect(computeReward(prev, next, 'P1')).toBe(-10);
  });

  it('0 reward on no relevant change', () => {
    const prev = makeState([makePlayer('P1', 0, true)]);
    const next = makeState([makePlayer('P1', 0, true)]);
    expect(computeReward(prev, next, 'P1')).toBe(0);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/headless/__tests__/reward.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create reward shaper**

```typescript
// src/engine/headless/reward.ts
import type { MatchState, PlayerSlot } from '../types';

const KILL_REWARD = 1;
const DEATH_PENALTY = -1;
const WIN_BONUS = 10;
const LOSE_PENALTY = -10;

/**
 * Sparse reward signal: +1 per kill (score increase), -1 per death (active flips off),
 * +10 / -10 on match-over win/loss. Subclassable / replaceable from caller.
 */
export function computeReward(prev: Readonly<MatchState>, next: Readonly<MatchState>, slot: PlayerSlot): number {
  const prevSelf = prev.players.find((p) => p.id === slot);
  const nextSelf = next.players.find((p) => p.id === slot);
  if (!prevSelf || !nextSelf) return 0;

  let r = 0;

  const scoreDelta = nextSelf.score - prevSelf.score;
  if (scoreDelta > 0) r += scoreDelta * KILL_REWARD;

  if (prevSelf.active && !nextSelf.active) r += DEATH_PENALTY;

  if (!prev.matchOver && next.matchOver) {
    if (next.winner === slot) r += WIN_BONUS;
    else if (next.winner !== null) r += LOSE_PENALTY;
  }

  return r;
}
```

- [ ] **Step 4: Wire into HeadlessRunner**

In `src/engine/headless/HeadlessRunner.ts`:

a) Import:
```typescript
import { computeReward } from './reward';
```

b) Add field:
```typescript
private prevState: MatchState | null = null;
```

c) After each `step()`, update prevState:
```typescript
step(actions: Map<PlayerSlot, InputState>, dt: number = FIXED_TIMESTEP): void {
  if (!this.sim) throw new Error('HeadlessRunner.step called before reset()');
  // Snapshot prev state for reward computation. Shallow clone is sufficient
  // because computeReward only reads scalar fields per player.
  this.prevState = this.snapshotForReward(this.sim.getState());
  const inputMap = new Map<string, InputState>();
  for (const [slot, action] of actions) inputMap.set(slot, action);
  this.sim.step(inputMap, dt);
}

private snapshotForReward(s: Readonly<MatchState>): MatchState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
  } as MatchState;
}
```

d) Add reward accessor:
```typescript
/** Reward for the player since the last step(). Returns 0 if no step has run yet. */
getReward(slot: PlayerSlot): number {
  if (!this.sim || !this.prevState) return 0;
  return computeReward(this.prevState, this.sim.getState(), slot);
}
```

e) Reset prevState in `reset()`:
```typescript
reset(config: HeadlessResetConfig): void {
  this.sim = new Simulator({ settings: config.settings, seed: config.seed, audioEnabled: false });
  this.sim.setPhase('playing');
  this.prevState = null;
}
```

- [ ] **Step 5: Update barrel**

```typescript
// src/engine/headless/index.ts (add line)
export { computeReward } from './reward';
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/engine/headless/
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/headless/
git commit -m "feat(headless): computeReward + getReward on HeadlessRunner"
```

---

### Task 4.4: BatchedPolicy interface + helper

Define the contract for transformer / neural-net policies that prefer batched inference. The interface is opt-in — `RuleBasedBot` and `KeyboardInput` don't need it. Used by the harness to run one forward pass across N slots in a single call.

**Files:**
- Create: `src/engine/headless/batchedPolicy.ts`
- Test: `src/engine/headless/__tests__/batchedPolicy.test.ts`
- Modify: `src/engine/headless/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/batchedPolicy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectActionsBatched } from '../batchedPolicy';
import type { BatchedPolicy } from '../batchedPolicy';
import { HeadlessRunner } from '../HeadlessRunner';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { registerBuiltinArenas } from '../../arenas/builtin';
import type { InputState, MatchSettings, PlayerSlot } from '../../types';

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

describe('selectActionsBatched', () => {
  const settings: MatchSettings = {
    activePlayers: ['P1', 'P2'],
    arenaId: 'meadow',
    killLimit: 16,
    botDifficulty: 'medium',
    mods: {} as MatchSettings['mods'],
  };

  it('passes all slot observations to the policy in one call and returns mapped actions', () => {
    const r = new HeadlessRunner();
    r.reset({ settings, seed: new Uint8Array([1, 2, 3, 4]) });

    const fakePolicy: BatchedPolicy = {
      forwardBatch: vi.fn((obs: Float32Array[]): InputState[] =>
        obs.map((_, i) => ({ left: i === 1, right: i === 0, jump: false, down: false })),
      ),
    };

    const slots: PlayerSlot[] = ['P1', 'P2'];
    const actions = selectActionsBatched(r, fakePolicy, slots);

    expect(fakePolicy.forwardBatch).toHaveBeenCalledOnce();
    const calledWith = (fakePolicy.forwardBatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledWith).toHaveLength(2);
    expect(calledWith[0]).toBeInstanceOf(Float32Array);

    expect(actions.get('P1')).toEqual({ left: false, right: true, jump: false, down: false });
    expect(actions.get('P2')).toEqual({ left: true, right: false, jump: false, down: false });
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/headless/__tests__/batchedPolicy.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create batchedPolicy.ts**

```typescript
// src/engine/headless/batchedPolicy.ts
import type { InputState, PlayerSlot } from '../types';
import type { HeadlessRunner } from './HeadlessRunner';

/**
 * Contract for batched-inference policies (transformers, MLPs).
 * One forward pass per N observations beats N separate calls — especially on GPU.
 *
 * Plug into the harness via selectActionsBatched(runner, policy, slots), or call
 * forwardBatch directly when you want full control over observation construction.
 */
export interface BatchedPolicy {
  /** Run forward inference on a batch of observations. Output length === input length. */
  forwardBatch(observations: Float32Array[]): InputState[];
}

/**
 * Convenience harness helper. Extracts observations for `slots`, runs ONE batched
 * forward pass, returns the slot→action map ready to hand to `runner.step()`.
 *
 * Mix freely with non-batched sources — merge this map with a keyboard slot's action
 * before calling step(). One harness, multiple policy types per match.
 */
export function selectActionsBatched(
  runner: HeadlessRunner,
  policy: BatchedPolicy,
  slots: PlayerSlot[],
): Map<PlayerSlot, InputState> {
  const obs = slots.map((slot) => runner.getObservation(slot));
  const actions = policy.forwardBatch(obs);
  const map = new Map<PlayerSlot, InputState>();
  for (let i = 0; i < slots.length; i++) map.set(slots[i], actions[i]);
  return map;
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/headless/index.ts (add lines)
export { selectActionsBatched } from './batchedPolicy';
export type { BatchedPolicy } from './batchedPolicy';
```

- [ ] **Step 5: Run test**

```bash
npx vitest run src/engine/headless/__tests__/batchedPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/headless/batchedPolicy.ts src/engine/headless/__tests__/batchedPolicy.test.ts src/engine/headless/index.ts
git commit -m "feat(headless): BatchedPolicy + selectActionsBatched helper"
```

---

### Task 4.5: MatchRecorder for training data collection

First-class match recording. Captures `(obs, action, reward, done)` per tick into a buffer; exports as NDJSON (one JSON object per line) or in-memory array. Independent of `HeadlessRunner` so it can be wired into `BrowserGameLoop` later for live-match capture.

**Files:**
- Create: `src/engine/headless/MatchRecorder.ts`
- Test: `src/engine/headless/__tests__/MatchRecorder.test.ts`
- Modify: `src/engine/headless/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/MatchRecorder.test.ts
import { describe, it, expect } from 'vitest';
import { MatchRecorder } from '../MatchRecorder';
import type { PlayerSlot } from '../../types';

const SLOTS: PlayerSlot[] = ['P1', 'P2'];

function neutralFrame(rec: MatchRecorder, opts?: { done?: boolean }) {
  rec.record({
    obs: { P1: new Float32Array([0]), P2: new Float32Array([0]) },
    actions: new Map([
      ['P1', { left: false, right: false, jump: false, down: false }],
      ['P2', { left: false, right: false, jump: false, down: false }],
    ]),
    rewards: { P1: 0, P2: 0 },
    done: opts?.done ?? false,
  });
}

describe('MatchRecorder', () => {
  it('accumulates frames with episode + frame numbers', () => {
    const r = new MatchRecorder(SLOTS);
    r.record({
      obs: { P1: new Float32Array([0.1, 0.2]), P2: new Float32Array([0.3, 0.4]) },
      actions: new Map([
        ['P1', { left: false, right: true, jump: false, down: false }],
        ['P2', { left: true, right: false, jump: false, down: false }],
      ]),
      rewards: { P1: 1, P2: -1 },
      done: false,
    });
    neutralFrame(r, { done: true });

    expect(r.size()).toBe(2);
    const frames = r.toJSON();
    expect(frames[0].frame).toBe(0);
    expect(frames[1].frame).toBe(1);
    expect(frames[0].episode).toBe(0);
    expect(frames[1].done).toBe(true);
    expect(frames[0].obs.P1).toEqual([0.1, 0.2]); // Float32Array → number[]
    expect(frames[0].rewards.P1).toBe(1);
  });

  it('endEpisode increments episode counter and resets frame', () => {
    const r = new MatchRecorder(SLOTS);
    neutralFrame(r);
    r.endEpisode();
    neutralFrame(r);

    const frames = r.toJSON();
    expect(frames[0].episode).toBe(0);
    expect(frames[1].episode).toBe(1);
    expect(frames[1].frame).toBe(0);
  });

  it('toNDJSON serializes one frame per line', () => {
    const r = new MatchRecorder(SLOTS);
    neutralFrame(r);
    neutralFrame(r);
    const ndjson = r.toNDJSON();
    expect(ndjson.split('\n')).toHaveLength(2);
    const parsed = JSON.parse(ndjson.split('\n')[0]);
    expect(parsed.episode).toBe(0);
    expect(parsed.frame).toBe(0);
  });

  it('clear empties the buffer and resets counters', () => {
    const r = new MatchRecorder(SLOTS);
    neutralFrame(r);
    r.endEpisode();
    neutralFrame(r);
    r.clear();
    expect(r.size()).toBe(0);
    expect(r.toNDJSON()).toBe('');
    // Episode counter resets too
    neutralFrame(r);
    expect(r.toJSON()[0].episode).toBe(0);
  });

  it('missing slot in input falls back to defaults (no throw)', () => {
    const r = new MatchRecorder(SLOTS);
    r.record({
      obs: { P1: new Float32Array([1]) } as Record<PlayerSlot, Float32Array>, // P2 missing
      actions: new Map([['P1', { left: true, right: false, jump: false, down: false }]]),
      rewards: { P1: 1 } as Record<PlayerSlot, number>,
      done: false,
    });
    const f = r.toJSON()[0];
    expect(f.obs.P2).toEqual([]);
    expect(f.actions.P2).toEqual({ left: false, right: false, jump: false, down: false });
    expect(f.rewards.P2).toBe(0);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run src/engine/headless/__tests__/MatchRecorder.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create MatchRecorder**

```typescript
// src/engine/headless/MatchRecorder.ts
import type { InputState, PlayerSlot } from '../types';

export interface RecordingFrame {
  episode: number;
  frame: number;
  /** Per-slot observation vectors (Float32Array → number[] for JSON serialization). */
  obs: Record<string, number[]>;
  /** Per-slot input that was fed into step(). */
  actions: Record<string, InputState>;
  /** Per-slot reward returned after step(). */
  rewards: Record<string, number>;
  /** True if the episode ended on this frame. */
  done: boolean;
}

export interface RecordInput {
  obs: Record<PlayerSlot, Float32Array>;
  actions: Map<PlayerSlot, InputState>;
  rewards: Record<PlayerSlot, number>;
  done: boolean;
}

const NEUTRAL_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/**
 * In-memory accumulator for (obs, action, reward, done) tuples. Caller drives — call
 * `record(...)` after each `step()` and `endEpisode()` between episodes.
 *
 * Independent of `HeadlessRunner` so it can be wired into `BrowserGameLoop` later for
 * live-match capture (collect real human play as training data).
 *
 * Output formats:
 *   - `toNDJSON()` — one JSON object per line, easy to stream to file or parse with jq
 *   - `toJSON()`   — array snapshot for in-memory inspection
 */
export class MatchRecorder {
  private readonly slots: readonly PlayerSlot[];
  private frames: RecordingFrame[] = [];
  private episode = 0;
  private frame = 0;

  constructor(slots: readonly PlayerSlot[]) {
    this.slots = slots;
  }

  record(input: RecordInput): void {
    const obs: Record<string, number[]> = {};
    const actions: Record<string, InputState> = {};
    const rewards: Record<string, number> = {};

    for (const slot of this.slots) {
      const v = input.obs[slot];
      obs[slot] = v ? Array.from(v) : [];
      actions[slot] = input.actions.get(slot) ?? NEUTRAL_INPUT;
      rewards[slot] = input.rewards[slot] ?? 0;
    }

    this.frames.push({
      episode: this.episode,
      frame: this.frame++,
      obs, actions, rewards,
      done: input.done,
    });
  }

  endEpisode(): void {
    this.episode++;
    this.frame = 0;
  }

  toNDJSON(): string {
    return this.frames.map((f) => JSON.stringify(f)).join('\n');
  }

  toJSON(): RecordingFrame[] {
    return this.frames.slice();
  }

  size(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
    this.episode = 0;
    this.frame = 0;
  }
}
```

- [ ] **Step 4: Update barrel**

```typescript
// src/engine/headless/index.ts (add lines)
export { MatchRecorder } from './MatchRecorder';
export type { RecordingFrame, RecordInput } from './MatchRecorder';
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/engine/headless/__tests__/MatchRecorder.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/headless/MatchRecorder.ts src/engine/headless/__tests__/MatchRecorder.test.ts src/engine/headless/index.ts
git commit -m "feat(headless): MatchRecorder — training-tuple accumulator with NDJSON export"
```

---

### Task 4.6: End-to-end self-play smoke test (batched policy + recorder)

Drive a full episode using the batched-inference path AND record every step. This is the load-bearing integration test — proves the harness pattern that real ML training will use.

**Files:**
- Create: `src/engine/headless/__tests__/selfPlay.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/engine/headless/__tests__/selfPlay.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessRunner } from '../HeadlessRunner';
import { selectActionsBatched } from '../batchedPolicy';
import type { BatchedPolicy } from '../batchedPolicy';
import { MatchRecorder } from '../MatchRecorder';
import { SeededRNG } from '../../net/prng';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { registerBuiltinArenas } from '../../arenas/builtin';
import type { InputState, MatchSettings, PlayerSlot } from '../../types';

beforeEach(() => {
  registerBuiltinCharacters();
  registerBuiltinArenas();
});

/** Stand-in for a real transformer — random weighted actions, but in batched form
 *  matching the BatchedPolicy contract (single forward over N obs). */
class FakeBatchedPolicy implements BatchedPolicy {
  constructor(private readonly rng: () => number) {}
  forwardBatch(obs: Float32Array[]): InputState[] {
    return obs.map(() => ({
      left: this.rng() < 0.35,
      right: this.rng() < 0.35,
      jump: this.rng() < 0.20,
      down: this.rng() < 0.10,
    }));
  }
}

describe('end-to-end self-play with batched policy + recorder', () => {
  it('runs 3000 ticks, records every frame, exports valid NDJSON', () => {
    const settings: MatchSettings = {
      activePlayers: ['P1', 'P2'],
      arenaId: 'meadow',
      killLimit: 16,
      botDifficulty: 'medium',
      mods: {} as MatchSettings['mods'],
    };

    const r = new HeadlessRunner();
    r.reset({ settings, seed: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) });

    const policyRng = new SeededRNG(new Uint8Array([42, 0, 0, 0]));
    const policy = new FakeBatchedPolicy(() => policyRng.random());
    const recorder = new MatchRecorder(['P1', 'P2']);
    const slots: PlayerSlot[] = ['P1', 'P2'];

    let frames = 0;
    for (let f = 0; f < 3000 && !r.done(); f++) {
      // Snapshot obs BEFORE step (recorder needs pre-step observation)
      const obs: Record<PlayerSlot, Float32Array> = {} as never;
      for (const slot of slots) obs[slot] = r.getObservation(slot);

      // Batched inference — one call, N actions
      const actions = selectActionsBatched(r, policy, slots);

      r.step(actions);

      // Recorder captures post-step rewards + done
      const rewards: Record<PlayerSlot, number> = {} as never;
      for (const slot of slots) rewards[slot] = r.getReward(slot);
      recorder.record({ obs, actions, rewards, done: r.done() });

      frames++;
    }

    expect(frames).toBeGreaterThan(0);
    expect(recorder.size()).toBe(frames);

    // Every frame parses as valid JSON; field shapes are correct
    const lines = recorder.toNDJSON().split('\n');
    expect(lines).toHaveLength(frames);
    const first = JSON.parse(lines[0]);
    expect(first.episode).toBe(0);
    expect(first.frame).toBe(0);
    expect(Array.isArray(first.obs.P1)).toBe(true);
    expect(typeof first.rewards.P1).toBe('number');
    expect(typeof first.done).toBe('boolean');

    // Smoke: getObservation still works after the run
    expect(r.getObservation('P1')).toBeInstanceOf(Float32Array);
  });

  it('mixed sources: batched transformer + non-batched RandomInput in same match', async () => {
    const { RandomInput } = await import('../../input');

    const settings: MatchSettings = {
      activePlayers: ['P1', 'P2'],
      arenaId: 'meadow',
      killLimit: 16,
      botDifficulty: 'medium',
      mods: {} as MatchSettings['mods'],
    };

    const r = new HeadlessRunner();
    r.reset({ settings, seed: new Uint8Array([1, 2, 3, 4]) });

    const policyRng = new SeededRNG(new Uint8Array([42, 0, 0, 0]));
    const policy = new FakeBatchedPolicy(() => policyRng.random());
    const inputRng = new SeededRNG(new Uint8Array([99, 0, 0, 0]));
    const p2 = new RandomInput('P2', () => inputRng.random());

    for (let f = 0; f < 100 && !r.done(); f++) {
      // P1 from batched transformer (batch of 1), P2 from per-slot PlayerInput
      const transformerActions = selectActionsBatched(r, policy, ['P1']);
      const merged = new Map(transformerActions);
      merged.set('P2', p2.getAction(r.getState()));
      r.step(merged);
    }

    // Smoke: both slots progressed without errors
    expect(r.getState().players.find((p) => p.id === 'P1')).toBeDefined();
    expect(r.getState().players.find((p) => p.id === 'P2')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/engine/headless/__tests__/selfPlay.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Run full suite to confirm no regressions**

```bash
npm test -- --run
```

Expected: green. Pass count = baseline + plan additions.

- [ ] **Step 4: Commit**

```bash
git add src/engine/headless/__tests__/selfPlay.test.ts
git commit -m "test(headless): e2e self-play with batched policy + MatchRecorder"
```

---

# Phase 5: Wrap-Up

### Task 5.1: Self-play example script

**Files:**
- Create: `scripts/headless-self-play.mjs`

- [ ] **Step 1: Create the script**

```javascript
// scripts/headless-self-play.mjs
// Example: run N self-play episodes with the batched-policy harness pattern, record every
// step into NDJSON. The fake policy below stands in for a real transformer — replace
// FakeBatchedPolicy with your model wrapper to start collecting real training data.
//
// Run: npx vite-node scripts/headless-self-play.mjs --episodes 10 --arena meadow

import { HeadlessRunner, MatchRecorder, selectActionsBatched } from '../src/engine/headless/index.js';
import { SeededRNG } from '../src/engine/net/prng.js';
import { registerBuiltinCharacters } from '../src/engine/characters/builtin.js';
import { registerBuiltinArenas } from '../src/engine/arenas/builtin.js';
import { writeFileSync } from 'node:fs';

registerBuiltinCharacters();
registerBuiltinArenas();

const args = process.argv.slice(2);
const episodes = Number(args[args.indexOf('--episodes') + 1] ?? 10);
const arenaId = args[args.indexOf('--arena') + 1] ?? 'meadow';
const outFile = args[args.indexOf('--out') + 1] ?? 'self-play.ndjson';

const settings = {
  activePlayers: ['P1', 'P2'],
  arenaId,
  killLimit: 16,
  botDifficulty: 'medium',
  mods: {},
};

const slots = ['P1', 'P2'];
const recorder = new MatchRecorder(slots);

// REPLACE THIS with a real BatchedPolicy implementation when you wire in your model.
// The contract: forwardBatch(obs: Float32Array[]) → InputState[], one entry per slot.
class FakeBatchedPolicy {
  constructor(rng) { this.rng = rng; }
  forwardBatch(obsList) {
    return obsList.map(() => ({
      left: this.rng() < 0.35,
      right: this.rng() < 0.35,
      jump: this.rng() < 0.20,
      down: this.rng() < 0.10,
    }));
  }
}

for (let ep = 0; ep < episodes; ep++) {
  const seed = new Uint8Array(8);
  crypto.getRandomValues(seed);

  const r = new HeadlessRunner();
  r.reset({ settings, seed });

  const policy = new FakeBatchedPolicy(() => new SeededRNG(seed).random());

  for (let frame = 0; frame < 3600 && !r.done(); frame++) {
    // Snapshot obs BEFORE step (recorder needs pre-step observation)
    const obs = {};
    for (const slot of slots) obs[slot] = r.getObservation(slot);

    // ONE forward pass for all controlled slots
    const actions = selectActionsBatched(r, policy, slots);

    r.step(actions);

    const rewards = {};
    for (const slot of slots) rewards[slot] = r.getReward(slot);

    recorder.record({ obs, actions, rewards, done: r.done() });
  }
  recorder.endEpisode();
  console.log(`episode ${ep + 1}/${episodes} — ${recorder.size()} steps recorded total`);
}

writeFileSync(outFile, recorder.toNDJSON());
console.log(`Wrote ${recorder.size()} steps to ${outFile}`);
```

- [ ] **Step 2: Run a smoke episode**

```bash
npx vite-node scripts/headless-self-play.mjs --episodes 1 --arena meadow --out /tmp/self-play.ndjson
```

Expected: prints episode progress, writes the file. If `vite-node` chokes on the `.mjs` imports (TS sources without explicit `.ts` compile), convert the script to `.mts` or import via the built dist.

- [ ] **Step 3: Verify output**

```bash
wc -l /tmp/self-play.ndjson
head -1 /tmp/self-play.ndjson
```

Expected: ~3600 lines, each a JSON object with `episode`, `frame`, `obs`, `actions`, `rewards`, `done` keys. Field shapes match `RecordingFrame` in `MatchRecorder.ts`.

- [ ] **Step 4: Commit**

```bash
git add scripts/headless-self-play.mjs
git commit -m "feat(headless): example self-play data-collection script"
```

---

### Task 5.2: Update CLAUDE.md

**Files:**
- Modify: `src/engine/CLAUDE.md`

- [ ] **Step 1: Add a Headless / Simulator section**

Open `src/engine/CLAUDE.md` and add a new top-level section before `## Network Multiplayer`:

```markdown
## Headless Simulation / ML

- `Simulator` (in `simulator/`) **owns** `MatchState`, `Player[]`, all gameplay systems, and the seeded RNG. Public API: `step(inputs, dt)`, `setPhase`, `setOnPhaseChange`, `switchArena`, `getState`, `getPlayers`, `getParticleSystem`, `getArena`, `getOriginalArena`, `getTheme`, `isMatchOver`. No DOM, no audio (beyond an injected `playSound` callback that defaults to no-op), no rAF, no input ingestion. Adapters feed `Map<PlayerSlot, InputState>` to `step()` per tick.
- `GameLoop` is the browser adapter — holds a `Simulator` plus Renderer, cosmetic systems, audio orchestration, `KeyboardManager`, AIControllers, touch input, debug key handler, rAF scheduling. Its `fixedUpdate` and `setPhase` delegate to Simulator and add browser-only side effects (audio on phase transition, renderer.renderBackground on switchArena). Cosmetic systems consume Simulator state via get-accessors on GameLoop and emit particles via `simulator.particleSystem`.
- `HeadlessRunner` (in `headless/`) is the ML adapter — composes a `Simulator` directly, no GameLoop. `reset(config)` constructs a fresh Simulator and flips phase to 'playing'; `step(actions)` advances; `getObservation(slot)` returns a 30-dim Float32Array; `getReward(slot)` returns sparse reward (kill +1, death -1, win +10, lose -10). Audio is silent by absence — no `playSound` callback passed, so gameplay systems' `this.playSound(name)` calls hit the no-op default.
- `PlayerInput` interface (in `input/`): `getAction(state) → InputState`. Implementations: `KeyboardInput` (browser), `RuleBasedBot` (wraps AIController), `RemoteInput` (network), `RandomInput` (perf/ML warmup); per-slot ML policies live in user code. `KeyboardManager` owns window listeners; per-slot `KeyboardInput` views share one manager. Old `InputManager` in `input.ts` is a deprecation shim.
- **Batched inference** for transformer/MLP policies: `BatchedPolicy.forwardBatch(obs: Float32Array[]) → InputState[]` runs ONE forward pass over N slots. The harness helper `selectActionsBatched(runner, policy, slots)` extracts observations, batches, dispatches, and returns the slot→action map ready for `step()`. Mix freely with non-batched sources (e.g., transformer for B1+B2 + RandomInput for P3) — assemble the action map from multiple sources before calling `step()`. Async inference: buffer the previous tick's prediction and pre-fetch the next; do NOT make `forwardBatch` async (breaks fixed-timestep determinism).
- **Match recording** is first-class via `MatchRecorder`. Caller-driven: call `recorder.record({ obs, actions, rewards, done })` after each step, `recorder.endEpisode()` between episodes, then `toNDJSON()` to dump to file or `toJSON()` for in-memory inspection. Independent of `HeadlessRunner` — the same recorder can later be wired into `BrowserGameLoop` via a tick callback to capture real human play as training data.
- For headless to work: `debugFlags` is lazily initialized via `initDebugFlags(window.location.search)` in the browser entry, `audio.init()` only fires when `play/playMusic` is first invoked, and gameplay systems route SFX through the injected `playSound` callback (never `import { audio }` directly). Importing `physics`, `stomp`, `gameplay/*`, `ai/*`, `simulator/*`, `headless/*` is Node-safe (locked by `regression-node-import.test.ts`).
- Determinism: locked by `regression-determinism.test.ts` (GameLoop path) and `regression-simulator-determinism.test.ts` (Simulator path). Same seed + same inputs = same fingerprint, and the two fingerprints must be byte-identical to each other (Task 3.4 verifies). Bots are NOT deterministic without seeded `aiRng` — for ML self-play, replace bots with ML policies via `setPlayerInputs` or batched policy.
- Vectorization: `new Simulator()` × N is safe in one process (no shared globals — sprite/HUD caches live in Renderer, which the headless path skips entirely). For data-collection throughput, run multiple HeadlessRunner instances per worker thread.
- Example: `scripts/headless-self-play.mjs` runs N episodes with a batched-policy harness pattern + MatchRecorder, dumps NDJSON. Replace the `FakeBatchedPolicy` class with your model wrapper to start collecting real training data.
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Final full-suite run**

```bash
npm test -- --run
npm run test:e2e
```

Expected: green. Note pass counts.

- [ ] **Step 4: Commit**

```bash
git add src/engine/CLAUDE.md
git commit -m "docs: document Simulator + HeadlessRunner + PlayerInput in CLAUDE.md"
```

---

# Final verification

- [ ] **Step 1: Compare regression fingerprints to baseline**

```bash
npx vitest run src/engine/__tests__/regression-determinism.test.ts src/engine/__tests__/regression-audio-trace.test.ts src/engine/__tests__/regression-simulator-determinism.test.ts
```

Expected: all pass with no snapshot drift. If any drift, the refactor changed observable behavior — investigate before merge.

- [ ] **Step 2: Run E2E suite**

```bash
npm run test:e2e
```

Expected: green (allowing for known-flaky tests tagged `@flaky` or `@online`).

- [ ] **Step 3: Build production bundle**

```bash
npm run build
```

Expected: clean, dist/ produced.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&difficulty=hard` — verify a normal match plays correctly, with audio, rendering, and AI behaving as before.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/headless-simulator
```

---

## Self-Review Notes

**Spec coverage:**
- Headless runner: Phase 4 ✓
- PlayerInput abstraction: Phase 2 ✓
- Swappable AI engines (rule-based ↔ transformer): `PlayerInput` interface (Phase 2) + `BatchedPolicy` interface (Task 4.4) ✓
- Batched forward pass for transformer inference: `selectActionsBatched` helper (Task 4.4) ✓
- Match recording for training data collection: `MatchRecorder` (Task 4.5), wired into the e2e test (Task 4.6) and the example script (Task 5.1) ✓
- Tests beforehand for regressions: Phase 0 ✓ (determinism, audio trace, node-import, static no-browser-API guard)
- New worktree: Task 0.1 ✓
- Based on current main: Yes (the plan accounts for `MatchPhase`, `setPhase`, `setNetworkMode`, `_audioEnabled`, current debugFlags top-level parse).

**Open assumptions to verify when starting:**
1. `AIController.getInput(state)` signature — Task 2.3 step 3 grep confirms this before implementing.
2. `MusicManager` field-init Howl — Task 1.2 audits and fixes if found.
3. Each gameplay system's constructor signature — Task 3.2 step 1 audits all of them before the move.
4. `MatchSettings.mods` shape — kept as `as MatchSettings['mods']` in tests since exact shape isn't asserted.
5. `vite-node` may need TypeScript-aware imports for the `.mjs` script — Task 5.1 includes a fallback note.

**Risk areas:**
- **Determinism drift between GameLoop and Simulator (Task 3.2).** The biggest risk in the extraction: if any field reference, RNG call, or system construction order subtly changes during the move, the snapshot fingerprints in `regression-determinism.test.ts` and `regression-simulator-determinism.test.ts` will diverge. Task 3.4 step 3 explicitly diffs them. If they diverge, bisect by reverting individual sub-steps of Task 3.2 step 7.
- **Mock maintenance.** `netMatch.test.ts` mocks `GameLoop` via `Object.assign`. After Task 3.2, GameLoop has a new `simulator` field plus several get-accessors (`state`, `arena`, etc.). Update the mock object to include them or tests will throw `TypeError`s that mask real failures.
- **Audio-call order during refactor (Task 3.3).** Some gameplay systems may have direct `audio.play(...)` imports rather than going through the injected callback. The audio-trace regression test catches this: a missing or duplicate `playSound` invocation after the refactor shows as a snapshot diff.
- **Cosmetic systems stay in GameLoop.** `cosmeticStep` and the cosmetic system instances (`PlayerTransitionSystem`, `EntityTransitionSystem`, `EnvironmentSystem`, etc.) remain in GameLoop — they consume Simulator state via the get-accessors and emit particles via `simulator.particleSystem`. The headless path simply never calls `cosmeticStep`. Lifting cosmetics into a separate `BrowserCosmetics` class is a clean follow-up but not required for the ML use case.
- **Bot determinism.** `AIController` uses `Math.random()` in places. For ML self-play, replace bots with ML policies via `setPlayerInputs` — bypasses AI entirely. For ML training *against* bots, audit AI for `Math.random` and route through `aiRng` as a follow-up.
- **State writes outside gameplay systems.** Most state mutations live inside gameplay systems (which now run on Simulator's state). If GameLoop has any direct `this.state.X = Y` writes in cosmetic/render paths, those need to be re-routed (likely through Simulator's getParticleSystem or another accessor). Task 3.2 step 8 (running the full test suite) surfaces these as compile errors after Step 7c removes the `state` field.
