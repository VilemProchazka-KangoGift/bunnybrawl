/**
 * Main-thread proxy for a worker-hosted Renderer. Implements the same public
 * surface as `Renderer` (`IRenderer`) so `GameLoop` can hold either without
 * branching. Each call posts a structured-clone payload across the
 * postMessage bridge; the worker's `renderWorker.ts` handler dispatches into
 * a real Renderer.
 *
 * Wire format: `messages.ts`. Lifecycle:
 *   1. Construct: spawns the worker, transfers the canvases, posts `host:init`.
 *   2. GameLoop calls public methods → posts `host:*` per call.
 *   3. Worker posts back `worker:nightOpacity` per change → proxy applies to
 *      `fgNightTint.style.opacity` (and bgNight/light canvas styles, since
 *      those DOM elements live on main even after their drawing surfaces
 *      are transferred).
 *   4. Destroy: posts `host:stop` and terminates.
 */

import type { Arena, MatchState, Particle, Gib } from '../types';
import type { ThemeConfig } from '../themes/types';
import type {
  IRenderer, RenderDiagnostics,
} from '../renderer';
import type { ReactiveRenderArg } from '../gameLoop/cosmetics/reactiveDecorations';
import type { WildlifeRenderArg } from '../gameLoop/cosmetics/wildlife';
import type { Light } from '../lighting';
import type { BotNavDebugState } from '../navDebugOverlay';
import type { NetDebugStats } from '../net/core/debugOverlay';
import type {
  HostInitMsg, HostStopMsg, HostToWorkerMsg, WorkerToHostMsg,
} from './messages';

/** Cumulative worker render-time stats, accumulated across the
 *  per-second flushes from the worker. Read by E2E via
 *  `window.__bunnyTest.workerPerfStats()`. */
export interface WorkerRenderStats {
  frames: number;
  renderSumMs: number;
  renderMaxMs: number;
  handlerSumMs: number;
  handlerMaxMs: number;
}

export interface RendererProxyOptions {
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
  hudCanvas?: HTMLCanvasElement;
  bgNightCanvas?: HTMLCanvasElement;
  /** Multiply-blend night tint above fg. Stays a DOM element on main; the
   *  worker drives it via `worker:nightOpacity` callbacks. */
  fgNightTint?: HTMLDivElement;
  lightCanvas?: HTMLCanvasElement;
  theme: ThemeConfig;
  mirrored?: boolean;
  timeLimit?: number;
  renderScale: number;
  /** Initial UI language code. Defaults to `'en'`. */
  language?: string;
  /** If set, the worker constructor reports init failures here. The caller
   *  should fall back to a main-thread Renderer on error. */
  onError?: (message: string) => void;
  /** Fired once the worker has constructed its Renderer. */
  onReady?: () => void;
}

const STUB_DIAGNOSTICS: RenderDiagnostics = Object.freeze({
  clouds: false, weather: false, wildlife: false, animatedBg: false,
  hazardZones: false, effectZones: false, bouncyPlatforms: false, pigeons: false,
  lavaRocks: false, springs: false, thorns: false, carrots: false,
  gibs: false, confetti: false, shockwaves: false, afterimages: false,
  fog: false, ambient: false, fireworks: false, dayNight: false,
  countdown: false, navDebug: false, netDebug: false, screenFlash: false,
  hitstop: false, screenShake: false, zeroGShimmer: false, playersDrawn: 0,
});

export class RendererProxy implements IRenderer {
  private worker: Worker;
  private destroyed = false;
  private fgNightTint: HTMLDivElement | null;
  private bgNightCanvasEl: HTMLCanvasElement | null;
  private lightCanvasEl: HTMLCanvasElement | null;
  private opts: RendererOptionsCache;
  /** Whitelist of warmed character names — the worker handles the actual
   *  cache, but `hasWarmedAll` must answer synchronously, so the proxy
   *  tracks intent. Returns true once any matching `warmSpriteCache` call
   *  has been posted; the worker is fast enough that the actual sprites
   *  paint correctly even if a pre-warm round is racing the first frame. */
  private warmedNames = new Set<string>();
  /** Cumulative worker render-time stats since proxy construction. Updated
   *  on every `worker:perfStats` push. */
  private renderStats: WorkerRenderStats = {
    frames: 0,
    renderSumMs: 0,
    renderMaxMs: 0,
    handlerSumMs: 0,
    handlerMaxMs: 0,
  };

  /** Snapshot of the cumulative worker render-time stats. */
  getRenderStats(): WorkerRenderStats {
    return { ...this.renderStats };
  }
  resetRenderStats(): void {
    this.renderStats.frames = 0;
    this.renderStats.renderSumMs = 0;
    this.renderStats.renderMaxMs = 0;
    this.renderStats.handlerSumMs = 0;
    this.renderStats.handlerMaxMs = 0;
  }

  constructor(opts: RendererProxyOptions) {
    this.opts = {
      mirrored: opts.mirrored ?? false,
      timeLimit: opts.timeLimit ?? 0,
      renderScale: opts.renderScale,
    };
    this.fgNightTint = opts.fgNightTint ?? null;
    this.bgNightCanvasEl = opts.bgNightCanvas ?? null;
    this.lightCanvasEl = opts.lightCanvas ?? null;

    this.worker = new Worker(
      new URL('./renderWorker.ts', import.meta.url),
      { type: 'module', name: 'carrot-royale-render' },
    );
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', (e) => opts.onError?.(e.message || 'worker error'));
    this.worker.addEventListener('messageerror', () => opts.onError?.('worker structured-clone failed'));

    // Transfer the canvases. Each `transferControlToOffscreen` call detaches
    // the canvas from the main rendering pipeline — main can no longer draw
    // into it, but we keep the HTMLCanvasElement reference alive so we can
    // still write to its `.style.opacity` for the night-tint cross-fade.
    const bgOff = opts.bgCanvas.transferControlToOffscreen();
    const fgOff = opts.fgCanvas.transferControlToOffscreen();
    const hudOff = opts.hudCanvas?.transferControlToOffscreen() ?? null;
    const bgNightOff = opts.bgNightCanvas?.transferControlToOffscreen() ?? null;
    const lightOff = opts.lightCanvas?.transferControlToOffscreen() ?? null;

    const init: HostInitMsg = {
      type: 'host:init',
      bgCanvas: bgOff,
      fgCanvas: fgOff,
      hudCanvas: hudOff,
      bgNightCanvas: bgNightOff,
      lightCanvas: lightOff,
      themeId: opts.theme.id,
      mirrored: this.opts.mirrored,
      timeLimit: this.opts.timeLimit,
      renderScale: this.opts.renderScale,
      language: opts.language ?? 'en',
    };

    const transfer: Transferable[] = [bgOff, fgOff];
    if (hudOff) transfer.push(hudOff);
    if (bgNightOff) transfer.push(bgNightOff);
    if (lightOff) transfer.push(lightOff);

    // Lift the onReady out of the closure so it survives across messages.
    this.onReady = opts.onReady;
    this.worker.postMessage(init, transfer);

    // Expose the proxy so E2E + the perf harness can read worker render-
    // time stats. Single global; replaced on subsequent constructs.
    if (typeof window !== 'undefined') {
      (window as unknown as { __rendererProxy?: RendererProxy }).__rendererProxy = this;
    }
  }

  private onReady?: () => void;

  private handleMessage = (e: MessageEvent<WorkerToHostMsg>): void => {
    const msg = e.data;
    if (msg.type === 'worker:ready') {
      this.onReady?.();
      return;
    }
    if (msg.type === 'worker:error') {
      // Surface worker errors to console so devtools shows them; the
      // experiment doesn't fall back automatically — caller decides.
      console.error('[render worker]', msg.message);
      return;
    }
    if (msg.type === 'worker:nightOpacity') {
      const value = String(msg.opacity);
      if (msg.kind === 'fg') {
        if (this.fgNightTint) this.fgNightTint.style.opacity = value;
      } else if (msg.kind === 'bg') {
        // Main-side bgNight + light DOM elements share the bg-night-opacity
        // channel (light layer was always tied to bgNightOpacity in the
        // direct-DOM Renderer path).
        if (this.bgNightCanvasEl) this.bgNightCanvasEl.style.opacity = value;
        if (this.lightCanvasEl) this.lightCanvasEl.style.opacity = value;
      }
      return;
    }
    if (msg.type === 'worker:perfStats') {
      this.renderStats.frames += msg.frames;
      this.renderStats.renderSumMs += msg.renderSumMs;
      if (msg.renderMaxMs > this.renderStats.renderMaxMs) {
        this.renderStats.renderMaxMs = msg.renderMaxMs;
      }
      this.renderStats.handlerSumMs += msg.handlerSumMs;
      if (msg.handlerMaxMs > this.renderStats.handlerMaxMs) {
        this.renderStats.handlerMaxMs = msg.handlerMaxMs;
      }
    }
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      const stop: HostStopMsg = { type: 'host:stop' };
      this.worker.postMessage(stop);
    } catch {
      // Worker may already be in a bad state — terminate is recovery.
    }
    this.worker.terminate();
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __rendererProxy?: RendererProxy };
      if (w.__rendererProxy === this) w.__rendererProxy = undefined;
    }
  }

  // ---- IRenderer surface — each call is one structured-clone postMessage. ----

  setRenderScale(scale: number): void {
    this.post({ type: 'host:setRenderScale', scale });
  }
  setBotNavDebugStates(states: BotNavDebugState[]): void {
    this.post({ type: 'host:setBotNavDebug', states });
  }
  setNetDebugStats(stats: NetDebugStats | null): void {
    this.post({ type: 'host:setNetDebug', stats });
  }
  setPlayerNames(names: Record<string, string>): void {
    this.post({ type: 'host:setPlayerNames', names });
  }
  setTimeLimit(timeLimit: number): void {
    this.opts.timeLimit = timeLimit;
    this.post({ type: 'host:setTimeLimit', value: timeLimit });
  }
  setNetworkMode(isNetwork: boolean): void {
    this.post({ type: 'host:setNetworkMode', isNetwork });
  }
  setConnectionQuality(rtt: number, jitter: number): void {
    this.post({ type: 'host:setConnectionQuality', rtt, jitter });
  }
  setLobbyOverlayFn(_fn: unknown): void {
    // The lobby renders via a main-thread Renderer (CharacterSelect), not
    // the worker. This is a no-op on the proxy — match-mode never installs
    // a lobby overlay fn.
  }
  getDiagnostics(): RenderDiagnostics {
    // Diagnostics live in the worker. Returning a frozen stub is sufficient
    // for the consumers (test mocks, debug overlay panels). For real
    // diagnostics in worker mode, we'd add a periodic `worker:diagnostics`
    // pushback — out of scope for the experiment.
    return STUB_DIAGNOSTICS;
  }
  warmSpriteCache(names: string[]): void {
    for (const n of names) this.warmedNames.add(n);
    this.post({ type: 'host:warmSpriteCache', names });
  }
  hasWarmedAll(names: string[]): boolean {
    for (const n of names) if (!this.warmedNames.has(n)) return false;
    return true;
  }
  setTheme(theme: ThemeConfig): void {
    this.post({ type: 'host:setTheme', themeId: theme.id });
  }
  setArenaLights(lights: ReadonlyArray<Light>): void {
    this.post({ type: 'host:setArenaLights', lights });
  }
  emitLightBurst(x: number, y: number, kind: 'spawn' | 'stomp'): void {
    this.post({ type: 'host:emitLightBurst', x, y, kind });
  }
  bakeGibs(gibs: Gib[]): void {
    this.post({ type: 'host:bakeGibs', gibs });
  }
  renderBloodDrips(drips: Array<{ x: number; y: number; radius: number; color: string }>): void {
    this.post({ type: 'host:renderBloodDrips', drips });
  }
  renderBackground(arena: Arena, originalArena?: Arena): void {
    this.post({
      type: 'host:renderBackground',
      arenaId: arena.id,
      originalArenaId: originalArena?.id,
    });
  }
  renderFrame(
    matchState: MatchState,
    arena: Arena,
    particles: Particle[],
    cosmeticLead = 0,
    _reactive?: ReactiveRenderArg,
    _wildlife?: WildlifeRenderArg,
  ): void {
    if (this.destroyed) return;
    // Build a structured-clone-safe payload. MatchState contains a
    // `bouncyWobble: Map`, which structured clone supports. We deliberately
    // ship the per-frame timer values out of band so the worker's clone
    // doesn't need to know about main's per-frame decay logic.
    //
    // The reactive + wildlife args are deliberately NOT shipped: their
    // per-instance data can carry pack-supplied draw functions which
    // structured-clone rejects (`DataCloneError`). The worker maintains its
    // own local copies of those systems and ticks them from the shipped
    // state. See `renderWorker.ts > ensureCosmeticSystemsFor`.
    this.post({
      type: 'host:renderFrame',
      state: matchState,
      arenaId: arena.id,
      particles,
      cosmeticLead,
      slowMotion: matchState.slowMotion,
      screenFlash: matchState.screenFlash,
      hitstopZoom: matchState.hitstopZoom,
    });
  }

  private post(msg: HostToWorkerMsg): void {
    if (this.destroyed) return;
    this.worker.postMessage(msg);
  }
}

interface RendererOptionsCache {
  mirrored: boolean;
  timeLimit: number;
  renderScale: number;
}
