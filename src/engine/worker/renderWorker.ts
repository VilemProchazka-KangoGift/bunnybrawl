/// <reference lib="webworker" />
/**
 * Render worker entry — Phase 3.
 *
 * Hosts a real `Renderer` instance and dispatches RPC messages from the main
 * thread (proxied via `RendererProxy`) into method calls. The simulation
 * stays on main; this worker only paints.
 *
 * Wildlife + reactive decorations are special-cased: their instance arrays
 * carry per-pack draw functions inside `inst.data` which can't survive
 * structured-clone. The worker therefore constructs its OWN
 * `WildlifeSystem` + `ReactiveDecorationSystem` for the current arena and
 * ticks them locally using the shipped state. Main also has its own copies
 * (for burst→particle emission); the duplication is cheap (cosmetic ticks
 * are ~0.05–0.1 ms) and keeps the wire payload structured-clone-safe.
 *
 * Wire format: `messages.ts`. Bundle hygiene: this file's transitive
 * imports must stay browser-pure. The regression test in
 * `worker-bundle-no-main-deps.test.ts` enforces it. Howler is stubbed via
 * `vite.config.ts > worker.plugins`.
 */

import { Renderer } from '../renderer';
import { registerBuiltinArenas } from '../arenas/builtin';
import { registerBuiltinCharacters } from '../characters/builtin';
import { getArena, getTheme, mirrorArena } from '../arenas/operations';
import { setHudLanguage } from '../rendering/hud';
import { ReactiveDecorationSystem } from '../gameLoop/cosmetics/ReactiveDecorationSystem';
import { WildlifeSystem } from '../gameLoop/cosmetics/WildlifeSystem';
import { perfTrace } from '../perfTrace';
import { debugFlags } from '../debugFlags';
import type { MatchState, Arena, Particle } from '../types';
import type { ThemeConfig } from '../themes/types';
import { makeViews, readParticles, ColorCache, type ParticleSabViews } from './sabParticles';
import {
  HIST_BUCKET_MS, HIST_BUCKET_COUNT,
  type HostToWorkerMsg,
  type WorkerReadyMsg,
  type WorkerErrorMsg,
  type WorkerNightOpacityMsg,
  type WorkerPerfStatsMsg,
  type WorkerLongFrameSample,
} from './messages';

const ctxScope = self as DedicatedWorkerGlobalScope;

let renderer: Renderer | null = null;
let stopped = false;
/** Tracks `mods.mirrorArena` for the lifetime of the match. Mirror is a
 *  match setting (no mid-match change), so we cache it once at init and
 *  re-apply `mirrorArena()` to any arena resolved from id. Without this,
 *  the worker's cosmetic systems + Renderer use the non-mirrored layout
 *  while main's Simulator runs against the mirrored coords. */
let _mirror = false;

/** Resolve an arena by id, applying horizontal mirror if the match has it
 *  on. The result MUST be used everywhere the worker would otherwise call
 *  `getArena(id)` for a layout-bearing arena (renderFrame, renderBackground,
 *  cosmetic systems). */
function resolveArena(id: string): Arena {
  const a = getArena(id);
  return _mirror ? mirrorArena(a) : a;
}

/** Stable MatchState container the worker mutates each frame so the cosmetic
 *  systems can keep a single state ref and not need rebuilding per tick. */
let workerState: MatchState | null = null;
let reactiveSystem: ReactiveDecorationSystem | null = null;
let wildlifeSystem: WildlifeSystem | null = null;
let currentArenaId: string | null = null;
let currentArena: Arena | null = null;

/** SAB-backed particles reader (Step 4 of the SAB roadmap). When main
 *  ships a `particlesSab` in `host:init`, we install the views here and
 *  read from them each frame instead of the `host:renderFrame.particles`
 *  field. The Particle[] pool is reused across frames (the renderer only
 *  reads, never retains references). */
let particleSabViews: ParticleSabViews | null = null;
const particlePool: Particle[] = [];
const colorCache = new ColorCache();
let particlePoolLen = 0;

function bootstrap(): void {
  registerBuiltinArenas();
  registerBuiltinCharacters();
}

function postReady(): void {
  const m: WorkerReadyMsg = { type: 'worker:ready' };
  ctxScope.postMessage(m);
}

function postError(message: string): void {
  const m: WorkerErrorMsg = { type: 'worker:error', message };
  ctxScope.postMessage(m);
}

function postNightOpacity(kind: 'bg' | 'fg', opacity: number): void {
  const m: WorkerNightOpacityMsg = { type: 'worker:nightOpacity', kind, opacity };
  ctxScope.postMessage(m);
}

/** Soft long-frame threshold inside the worker. Crossings get attribution
 *  capture (which `perfTrace` sections were hot that frame) and ride
 *  along on the next per-second flush. 12 ms = "user-noticeable hitch
 *  even if vsync hasn't dropped a frame yet." */
const LONG_FRAME_MS = 12;
const LONG_FRAME_BUFFER_CAP = 32;

/** Per-frame perf stats accumulated in the worker. Flushed to main once per
 *  second. The histogram replaces the old sum-only fields so main can
 *  reconstruct p50/p95/p99/long-frame counts; the section snapshot mirrors
 *  main's perfTrace breakdown; the long-frame buffer captures attribution. */
const _perf = {
  frames: 0,
  renderSumMs: 0,
  renderMaxMs: 0,
  handlerSumMs: 0,
  handlerMaxMs: 0,
  lastFlushAt: 0,
  /** Render-time histogram. Index = floor(renderMs / HIST_BUCKET_MS); the
   *  last bucket also accumulates frames over the upper bound. */
  histogram: new Uint32Array(HIST_BUCKET_COUNT),
  overflowFrames: 0,
  longFrames: [] as WorkerLongFrameSample[],
};

let _perfEnabled = false;

function recordHistogram(renderMs: number): void {
  let idx = Math.floor(renderMs / HIST_BUCKET_MS);
  if (idx < 0) idx = 0;
  if (idx >= HIST_BUCKET_COUNT) {
    idx = HIST_BUCKET_COUNT - 1;
    _perf.overflowFrames += 1;
  }
  _perf.histogram[idx] += 1;
}

function flushPerfStats(now: number): void {
  if (_perf.frames === 0) return;
  if (now - _perf.lastFlushAt < 1000) return;
  // Convert Uint32Array → number[] for structured-clone compactness; the
  // histogram is small (200 entries), so the copy cost is trivial. (The
  // alternative — Transferable Uint32Array — would force us to allocate
  // a fresh buffer every flush since the worker can't keep using a
  // transferred-out buffer.)
  const histogram = Array.from(_perf.histogram);
  const m: WorkerPerfStatsMsg = {
    type: 'worker:perfStats',
    frames: _perf.frames,
    renderSumMs: _perf.renderSumMs,
    renderMaxMs: _perf.renderMaxMs,
    handlerSumMs: _perf.handlerSumMs,
    handlerMaxMs: _perf.handlerMaxMs,
    histogram,
    overflowFrames: _perf.overflowFrames,
  };
  if (_perfEnabled) {
    m.sections = perfTrace.snapshot();
    if (_perf.longFrames.length > 0) m.longFrames = _perf.longFrames;
  }
  ctxScope.postMessage(m);
  _perf.frames = 0;
  _perf.renderSumMs = 0;
  _perf.renderMaxMs = 0;
  _perf.handlerSumMs = 0;
  _perf.handlerMaxMs = 0;
  _perf.histogram.fill(0);
  _perf.overflowFrames = 0;
  _perf.longFrames = [];
  _perf.lastFlushAt = now;
}

/** Rebuild the local cosmetic systems for a new arena. Safe to call with
 *  the same arenaId — early-returns. */
function ensureCosmeticSystemsFor(arena: Arena, theme: ThemeConfig, state: MatchState): void {
  if (currentArenaId === arena.id && reactiveSystem && wildlifeSystem) return;
  currentArena = arena;
  currentArenaId = arena.id;
  // Worker-side burst is a no-op: emitting particles would need a
  // ParticleSystem, which lives on main. Bursts on worker affect the
  // visual flag but skip emission — main's mirror of the system fires
  // the actual particles.
  reactiveSystem = new ReactiveDecorationSystem(state, arena, () => { /* noop */ });
  if (theme.buildReactiveDecorations) {
    reactiveSystem.setInstances(theme.buildReactiveDecorations(arena));
  }
  wildlifeSystem = new WildlifeSystem(state, arena);
  if (theme.buildWildlife) {
    wildlifeSystem.setInstances(theme.buildWildlife(arena));
  }
}

/** Engine bindings statically imported. We previously code-split this
 *  via dynamic `import()` to keep the renderer-only path slim — but the
 *  resulting runtime fetch added 3–5s of cold-start to the first
 *  `host:initEngine` (worse under devtools / throttling), which made
 *  `?simWorker=on` feel sluggish at match start. The renderer-only path
 *  tree-shakes part of GameLoop (the cosmetic systems are already
 *  imported separately above) — net bundle delta is on the order of
 *  ~100-200 KB minified, paid once per worker spawn and cached by the
 *  browser. The trade-off (always pay the bigger fetch, never pay the
 *  cold-start hitch) is the right one because the cold-start was the
 *  user-visible problem; bundle size is invisible after first load. */
import * as engineBindings from './engineWorkerInit';

ctxScope.addEventListener('message', (e: MessageEvent<HostToWorkerMsg>) => {
  if (stopped) return;
  const msg = e.data;
  const handlerStart = msg.type === 'host:renderFrame' ? performance.now() : 0;

  // Engine-mode messages are async (lazy import on first init). All other
  // handlers are synchronous below. We dispatch to the engine async path
  // first; if it's not an engine message, fall through to the sync switch.
  if (msg.type === 'host:initEngine') {
    _mirror = msg.mirrored;
    try {
      engineBindings.initEngine(msg);
      // Sim-in-worker hosts its own Renderer inside engineWorkerInit. Route
      // the renderer-only IRenderer messages (warmSpriteCache, renderBackground,
      // warmHudFonts, setRenderScale, setTheme, setBotNavDebugStates, …)
      // through that same Renderer so the loading pipeline works (otherwise
      // the proxy posts run forever while the worker's own dispatch sees
      // a null `renderer`).
      const engineRenderer = engineBindings.getEngineRenderer();
      if (engineRenderer) renderer = engineRenderer;
      postReady();
    } catch (err) {
      postError(err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    return;
  }
  if (msg.type === 'host:engineInputBatch') { engineBindings.applyInputBatch(msg); return; }
  if (msg.type === 'host:enginePause') { engineBindings.pauseEngine(); return; }
  if (msg.type === 'host:engineResume') { engineBindings.resumeEngine(); return; }
  if (msg.type === 'host:engineSwitchArena') { engineBindings.switchArenaInWorker(msg); return; }
  if (msg.type === 'host:engineSetPhase') { engineBindings.setPhaseInWorker(msg); return; }
  if (msg.type === 'host:engineSkipCountdown') { engineBindings.skipCountdownInWorker(); return; }
  // Phase 2: NetMatch async fixedUpdate wiring. Worker hosts encode/decode;
  // main only forwards buffers to/from the transport.
  if (msg.type === 'host:netSetMode') { engineBindings.setNetMode(msg.mode, msg.delayFrames); return; }
  if (msg.type === 'host:netSnapshotApply') { engineBindings.applyIncomingSnapshot(msg.buffer); return; }
  if (msg.type === 'host:netDisconnectSlot') { engineBindings.disconnectSlotInWorker(msg.slot); return; }
  if (msg.type === 'host:netReconnectSlot') { engineBindings.reconnectSlotInWorker(msg.slot); return; }

  try {
    switch (msg.type) {
      case 'host:init': {
        bootstrap();
        if (msg.perfEnabled) {
          debugFlags.perfEnabled = true;
          _perfEnabled = true;
        }
        // URL-gated overlays — same allowed/enabled pair as main's
        // initDebugFlags() does. Without this, ?worker=on&debug=nav would
        // silently disable the overlay because the worker's debugFlags
        // module-scope copy defaults to all-false.
        if (msg.navDebugEnabled) { debugFlags.navDebugAllowed = true; debugFlags.navDebugEnabled = true; }
        if (msg.netDebugEnabled) { debugFlags.netDebugAllowed = true; debugFlags.netDebugEnabled = true; }
        if (msg.fpsEnabled)      { debugFlags.fpsAllowed = true;      debugFlags.fpsEnabled = true; }
        _mirror = msg.mirrored;
        const theme = getTheme(msg.themeId);
        renderer = new Renderer({
          bgCanvas: msg.bgCanvas,
          fgCanvas: msg.fgCanvas,
          hudCanvas: msg.hudCanvas ?? undefined,
          bgNightCanvas: msg.bgNightCanvas ?? undefined,
          lightCanvas: msg.lightCanvas ?? undefined,
          theme,
          mirrored: msg.mirrored,
          nightOpacityCallback: postNightOpacity,
          language: msg.language,
        });
        renderer.setRenderScale(msg.renderScale);
        renderer.setTimeLimit(msg.timeLimit);
        if (msg.particlesSab) particleSabViews = makeViews(msg.particlesSab);
        postReady();
        return;
      }
      case 'host:stop': {
        stopped = true;
        renderer = null;
        reactiveSystem = null;
        wildlifeSystem = null;
        workerState = null;
        currentArena = null;
        currentArenaId = null;
        if (engineBindings) engineBindings.stopEngine();
        return;
      }
      case 'host:setLanguage':
        setHudLanguage(msg.language);
        return;
      case 'host:setDebugFlag': {
        // Runtime debug-flag propagation from main (backtick keypress,
        // DevMenu). Mirrors `setDebugFlag()` semantics: flip *Allowed and
        // *Enabled together so a value=true unconditionally activates the
        // overlay (the URL-gating step already happened on main).
        const { name, value } = msg;
        switch (name) {
          case 'nav':  debugFlags.navDebugAllowed = value; debugFlags.navDebugEnabled = value; break;
          case 'net':  debugFlags.netDebugAllowed = value; debugFlags.netDebugEnabled = value; break;
          case 'fps':  debugFlags.fpsAllowed     = value; debugFlags.fpsEnabled     = value; break;
          case 'perf': debugFlags.perfEnabled = value; _perfEnabled = value; break;
        }
        return;
      }
    }
    if (!renderer) return;
    switch (msg.type) {
      case 'host:setRenderScale':
        renderer.setRenderScale(msg.scale);
        return;
      case 'host:setBotNavDebug':
        renderer.setBotNavDebugStates(msg.states);
        return;
      case 'host:setNetDebug':
        renderer.setNetDebugStats(msg.stats);
        return;
      case 'host:setPlayerNames':
        renderer.setPlayerNames(msg.names);
        return;
      case 'host:setTimeLimit':
        renderer.setTimeLimit(msg.value);
        return;
      case 'host:setNetworkMode':
        renderer.setNetworkMode(msg.isNetwork);
        return;
      case 'host:setConnectionQuality':
        renderer.setConnectionQuality(msg.rtt, msg.jitter);
        return;
      case 'host:setTheme':
        renderer.setTheme(getTheme(msg.themeId));
        // Theme changed → cosmetic systems need rebuild against the new
        // arena. Done on the next renderBackground / renderFrame.
        currentArenaId = null;
        reactiveSystem = null;
        wildlifeSystem = null;
        return;
      case 'host:setArenaLights':
        renderer.setArenaLights(msg.lights);
        return;
      case 'host:emitLightBurst':
        renderer.emitLightBurst(msg.x, msg.y, msg.kind);
        return;
      case 'host:bakeGibs':
        renderer.bakeGibs(msg.gibs);
        return;
      case 'host:renderBloodDrips':
        renderer.renderBloodDrips(msg.drips);
        return;
      case 'host:renderBackground': {
        const arena = resolveArena(msg.arenaId);
        // originalArena (used by Renderer for the bg/fg-nature paint paths)
        // is the un-mirrored layout — the canvas itself is flipped via the
        // Renderer's `mirrored` flag, so the nature draw fns receive the
        // original coords.
        const original = msg.originalArenaId ? getArena(msg.originalArenaId) : undefined;
        renderer.renderBackground(arena, original);
        return;
      }
      case 'host:warmSpriteCache':
        renderer.warmSpriteCache(msg.names);
        return;
      case 'host:warmHudFonts':
        renderer.warmHudFonts();
        return;
      case 'host:renderFrame': {
        const arena = resolveArena(msg.arenaId);
        // Mutate the stable state container in place (Object.assign copies
        // top-level field refs — players, particles, etc.) so the cosmetic
        // systems' captured state ref stays stable. Construct on first
        // call.
        if (!workerState) {
          workerState = msg.state;
        } else {
          Object.assign(workerState, msg.state);
        }
        // Per-frame timer decay (the proxy ships them out of band so the
        // worker doesn't need to know about network mode).
        workerState.slowMotion = msg.slowMotion;
        workerState.screenFlash = msg.screenFlash;
        workerState.hitstopZoom = msg.hitstopZoom;
        ensureCosmeticSystemsFor(arena, getTheme(arena.themeId), workerState);
        // Tick local cosmetic systems before render. Reactive 60Hz happens
        // here too (main's GameLoop runs it in fixedUpdate; we approximate
        // by running both buckets at the same dt — the visual difference is
        // negligible for sway). dt = cosmeticLead is the seconds-since-last
        // cosmeticStep — the same value the proxy ships, mirrored from
        // GameLoop.getCosmeticLead. Reactive cosmeticUpdate (30Hz bucket)
        // and fixedUpdate (60Hz + windPhase) advance separately on main;
        // we collapse them with a single tick.
        const dt = msg.cosmeticLead > 0 ? msg.cosmeticLead : 1 / 60;
        if (reactiveSystem) {
          reactiveSystem.fixedUpdate(dt);
          reactiveSystem.cosmeticUpdate(dt);
        }
        if (wildlifeSystem) {
          wildlifeSystem.cosmeticUpdate(dt);
        }
        // Build the per-frame arg from the worker's local systems. The
        // wire-shipped reactiveArg/wildlifeArg are ignored — they're
        // stripped at the proxy.
        const reactiveArg = reactiveSystem ? {
          prePlayer: reactiveSystem.getInstancesForLayer('prePlayer'),
          postPlayer: reactiveSystem.getInstancesForLayer('postPlayer'),
          windPhase: reactiveSystem.getWindPhase(),
        } : { prePlayer: [], postPlayer: [], windPhase: 0 };
        const wildlifeArg = wildlifeSystem ? {
          groundCritter: wildlifeSystem.getInstancesForLayer('groundCritter'),
          animBackground: wildlifeSystem.getInstancesForLayer('animBackground'),
        } : { groundCritter: [], animBackground: [] };
        // For long-frame attribution we capture cumulative section totals
        // before/after this frame and diff. Cheap (read-only Map walk),
        // skipped entirely when perfTrace is off.
        const sectionsBefore = _perfEnabled ? perfTrace.cumulativeTotals() : null;
        // SAB fast path — read particles from shared memory into the
        // reused worker-side pool, then slice to the live count so the
        // renderer's `for..of` doesn't paint stale entries. Pool keeps
        // its peak capacity to avoid re-allocating Particle objects when
        // count dips. The slice is N ref copies — cheap vs the
        // structured-clone-per-particle this path replaces.
        let particles: Particle[];
        if (particleSabViews) {
          particlePoolLen = readParticles(particleSabViews, particlePool, colorCache);
          particles = particlePool.length === particlePoolLen
            ? particlePool
            : particlePool.slice(0, particlePoolLen);
        } else {
          particles = msg.particles;
        }
        const renderStart = performance.now();
        renderer.renderFrame(
          workerState,
          arena,
          particles,
          msg.cosmeticLead,
          reactiveArg,
          wildlifeArg,
        );
        const renderEnd = performance.now();
        const renderMs = renderEnd - renderStart;
        const handlerMs = renderEnd - handlerStart;
        _perf.frames += 1;
        _perf.renderSumMs += renderMs;
        if (renderMs > _perf.renderMaxMs) _perf.renderMaxMs = renderMs;
        _perf.handlerSumMs += handlerMs;
        if (handlerMs > _perf.handlerMaxMs) _perf.handlerMaxMs = handlerMs;
        recordHistogram(renderMs);
        if (renderMs > LONG_FRAME_MS && _perf.longFrames.length < LONG_FRAME_BUFFER_CAP) {
          // Diff cumulative totals to attribute THIS frame's hot sections.
          const after = sectionsBefore ? perfTrace.cumulativeTotals() : null;
          const sections: Record<string, number> = {};
          if (sectionsBefore && after) {
            for (const k of Object.keys(after)) {
              const delta = after[k] - (sectionsBefore[k] ?? 0);
              if (delta > 0.01) sections[k] = delta;
            }
          }
          _perf.longFrames.push({ ms: renderMs, sections });
        }
        flushPerfStats(renderEnd);
        // Touch currentArena to silence the unused-var warning when the
        // optional capture path doesn't read it later.
        void currentArena;
        return;
      }
    }
  } catch (err) {
    postError(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
});

// Boot handshake. Vite dev's module-worker boot can drop messages posted
// before the worker finishes evaluating its top-level code (the browser
// spec says they should queue; in module-worker dev mode they don't,
// observably). The proxy buffers `postMessage` calls until this lands.
// In prod where queuing works correctly, this is a harmless one-byte ping.
ctxScope.postMessage({ type: 'worker:bootReady' });

export {};
