/// <reference lib="webworker" />
/**
 * Render worker entry — Phase 3.
 *
 * Hosts a real `Renderer` instance and dispatches RPC messages from the main
 * thread (proxied via `RendererProxy`) into method calls. The simulation
 * stays on main; this worker only paints.
 *
 * Wire format: `messages.ts`. The full set of messages mirrors the public
 * Renderer surface used by `GameLoop` + `ParticleSystem.bakeToRenderer`.
 *
 * Bundle hygiene: this file's transitive imports must stay browser-pure.
 * The regression test in `worker-bundle-no-main-deps.test.ts` enforces it.
 */

import { Renderer } from '../renderer';
import { registerBuiltinArenas } from '../arenas/builtin';
import { registerBuiltinCharacters } from '../characters/builtin';
import { getArena, getTheme } from '../arenas/operations';
import { setHudLanguage } from '../rendering/hud';
import type {
  HostToWorkerMsg,
  WorkerReadyMsg,
  WorkerErrorMsg,
  WorkerNightOpacityMsg,
} from './messages';

const ctxScope = self as DedicatedWorkerGlobalScope;

let renderer: Renderer | null = null;
let stopped = false;

/** Bootstrap arena + character registries inside the worker. The worker
 *  module graph mirrors main's, but module-scope side-effects in `App.tsx`
 *  (which is React and never reaches the worker) don't run. We register here
 *  exactly once. The registries are idempotent on duplicate calls. */
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

ctxScope.addEventListener('message', (e: MessageEvent<HostToWorkerMsg>) => {
  if (stopped) return;
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'host:init': {
        bootstrap();
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
      case 'host:setLanguage':
        setHudLanguage(msg.language);
        return;
      case 'host:stop': {
        stopped = true;
        renderer = null;
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
        // The state is a structured-clone of main's MatchState. The proxy
        // sets the per-frame decay timers (slowMotion/screenFlash/hitstop)
        // directly on the cloned state before transit; main keeps its own
        // copy for sim. We don't write back — the worker's clone is throwaway.
        msg.state.slowMotion = msg.slowMotion;
        msg.state.screenFlash = msg.screenFlash;
        msg.state.hitstopZoom = msg.hitstopZoom;
        renderer.renderFrame(
          msg.state,
          arena,
          msg.particles,
          msg.cosmeticLead,
          msg.reactiveArg,
          msg.wildlifeArg,
        );
        return;
      }
    }
  } catch (err) {
    postError(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
});

// Keep the module type "module worker" for Vite.
export {};
