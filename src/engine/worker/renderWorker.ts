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
import { getArena, getTheme } from '../arenas/operations';
import { setHudLanguage } from '../rendering/hud';
import { ReactiveDecorationSystem } from '../gameLoop/cosmetics/ReactiveDecorationSystem';
import { WildlifeSystem } from '../gameLoop/cosmetics/WildlifeSystem';
import { perfTrace } from '../perfTrace';
import { debugFlags } from '../debugFlags';
import type { MatchState, Arena } from '../types';
import type { ThemeConfig } from '../themes/types';
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

/** Stable MatchState container the worker mutates each frame so the cosmetic
 *  systems can keep a single state ref and not need rebuilding per tick. */
let workerState: MatchState | null = null;
let reactiveSystem: ReactiveDecorationSystem | null = null;
let wildlifeSystem: WildlifeSystem | null = null;
let currentArenaId: string | null = null;
let currentArena: Arena | null = null;

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

ctxScope.addEventListener('message', (e: MessageEvent<HostToWorkerMsg>) => {
  if (stopped) return;
  const msg = e.data;
  const handlerStart = msg.type === 'host:renderFrame' ? performance.now() : 0;
  try {
    switch (msg.type) {
      case 'host:init': {
        bootstrap();
        if (msg.perfEnabled) {
          debugFlags.perfEnabled = true;
          _perfEnabled = true;
        }
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
        return;
      }
      case 'host:setLanguage':
        setHudLanguage(msg.language);
        return;
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
        const arena = getArena(msg.arenaId);
        const original = msg.originalArenaId ? getArena(msg.originalArenaId) : undefined;
        renderer.renderBackground(arena, original);
        return;
      }
      case 'host:warmSpriteCache':
        renderer.warmSpriteCache(msg.names);
        return;
      case 'host:renderFrame': {
        const arena = getArena(msg.arenaId);
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
        const renderStart = performance.now();
        renderer.renderFrame(
          workerState,
          arena,
          msg.particles,
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

export {};
