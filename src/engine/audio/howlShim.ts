/**
 * Single re-export of `Howl` from `howler`. Character packs import their
 * `createSound` factory's `Howl` reference through here instead of going
 * directly to the `howler` package.
 *
 * Why the indirection: Vite's optimizeDeps prebundles `howler` for main
 * and rewrites `from 'howler'` to the prebundled URL during import
 * analysis — and that transformed source is cached and shared across the
 * main and worker bundles. We can't intercept the bare specifier from
 * worker context because the rewrite happens BEFORE worker.plugins
 * resolveId can see it. By routing through a project file, the worker
 * bundle resolves a RELATIVE import (`'../../audio/howlShim'`) which
 * does go through worker.plugins — there we map it to the worker stub.
 * Main keeps the real Howler.
 */

export { Howl } from 'howler';
