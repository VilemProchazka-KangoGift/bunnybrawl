/**
 * Worker-only stub for `howler`. Aliased in via `vite.config.ts > worker.plugins`.
 *
 * Why: every `CharacterPack` does `import { Howl } from 'howler'` to declare
 * its `createSound` factory. The factory is only called by `AudioManager` on
 * the main thread, but the bare ESM import still pulls Howler's module-init
 * into the worker bundle — which then crashes with `HowlerGlobal is not
 * defined` because Howler probes for `window` / `AudioContext` and falls
 * through into a code path the bundler scope-hoisted incorrectly.
 *
 * The renderer in the worker never CALLS createSound, so a no-op constructor
 * is enough. The Audio bundle on main keeps the real Howler.
 */

class StubHowl {
  // No-op API — narrow to the methods the codebase calls on a Howl. If
  // a future caller in worker-side code calls a missing method, throw so
  // we notice in dev rather than silently breaking audio.
  play(): number { return 0; }
  stop(): this { return this; }
  pause(): this { return this; }
  volume(): number { return 0; }
  mute(): this { return this; }
  unload(): void { /* noop */ }
  playing(): boolean { return false; }
  on(): this { return this; }
  off(): this { return this; }
  once(): this { return this; }
}

class StubHowlerGlobal {
  ctx: null = null;
  mute(): this { return this; }
  volume(): number { return 0; }
  stop(): this { return this; }
  unload(): this { return this; }
}

export const Howl = StubHowl;
export const Howler = new StubHowlerGlobal();
export const HowlerGlobal = StubHowlerGlobal;

export default { Howl, Howler, HowlerGlobal };
