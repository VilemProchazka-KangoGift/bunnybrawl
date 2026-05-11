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
import {
  HIST_BUCKET_COUNT, HIST_BUCKET_MS,
  type HostInitMsg, type HostStopMsg, type HostToWorkerMsg, type WorkerToHostMsg,
  type WorkerLongFrameSample,
} from './messages';
import { createParticlesSab, makeViews, writeParticles, type ParticleSabViews } from './sabParticles';

/** Cumulative worker render-time stats, accumulated across the
 *  per-second flushes from the worker. Read by the perf harness. */
export interface WorkerRenderStats {
  frames: number;
  renderSumMs: number;
  renderMaxMs: number;
  handlerSumMs: number;
  handlerMaxMs: number;
  /** Render-time histogram (HIST_BUCKET_COUNT × HIST_BUCKET_MS ms). Frames
   *  above the upper bound counted in `overflowFrames`. */
  histogram: number[];
  histogramBucketMs: number;
  overflowFrames: number;
  /** Latest worker-side perfTrace section snapshot. Cumulative since the
   *  worker booted. Only present when perfEnabled was set on init. */
  sections?: Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }>;
  /** Long frames captured since proxy construction (ring-buffer-capped
   *  per-flush in the worker so this list grows bounded over time). */
  longFrames: WorkerLongFrameSample[];
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
  /** When true, the worker enables `perfTrace` and ships per-section
   *  timings + long-frame attribution back to main. */
  perfEnabled?: boolean;
  /** URL-gated debug overlays. Forwarded to the worker so the renderer
   *  inside it draws the overlay instead of the (gone-from-main) Renderer. */
  navDebugEnabled?: boolean;
  netDebugEnabled?: boolean;
  fpsEnabled?: boolean;
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
  /** Native worker.postMessage captured before the boot-queue wrapper
   *  replaces it. Restored on `worker:bootReady` so the hot path
   *  (`renderFrame` at 60Hz) doesn't pay the wrapper branch. */
  private _origPostMessage!: Worker['postMessage'];
  private _bootQueue: Array<{ msg: unknown; transfer: Transferable[] }> = [];
  /** SAB-backed particles wire (Step 4). Null in prod / non-isolated
   *  contexts; the existing `particles: Particle[]` field in
   *  `host:renderFrame` handles those. */
  private particleSabViews: ParticleSabViews | null = null;
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
    histogram: new Array(HIST_BUCKET_COUNT).fill(0),
    histogramBucketMs: HIST_BUCKET_MS,
    overflowFrames: 0,
    longFrames: [],
  };
  /** Compositor frame-presentation pacing. Captured via
   *  requestVideoFrameCallback on a hidden video element on main —
   *  fires when the browser presents a video frame, paced alongside
   *  canvas paints by the same compositor. The deltas between callbacks
   *  are the user-perceived frame intervals. */
  private composPacing: { lastT: number; samples: number[] } = { lastT: 0, samples: [] };
  private composRunning = false;

  /** Snapshot of the cumulative worker render-time stats. */
  getRenderStats(): WorkerRenderStats {
    return {
      ...this.renderStats,
      histogram: this.renderStats.histogram.slice(),
      longFrames: this.renderStats.longFrames.slice(),
    };
  }
  resetRenderStats(): void {
    this.renderStats.frames = 0;
    this.renderStats.renderSumMs = 0;
    this.renderStats.renderMaxMs = 0;
    this.renderStats.handlerSumMs = 0;
    this.renderStats.handlerMaxMs = 0;
    this.renderStats.histogram.fill(0);
    this.renderStats.overflowFrames = 0;
    this.renderStats.longFrames.length = 0;
    this.renderStats.sections = undefined;
  }

  /** Compositor frame-presentation deltas (ms) since last reset. */
  getCompositorPacing(): number[] {
    return this.composPacing.samples.slice();
  }
  resetCompositorPacing(): void {
    this.composPacing.samples.length = 0;
    this.composPacing.lastT = 0;
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
    // Same boot-handshake workaround as EngineWorkerProxy: Vite dev's
    // module-worker boot drops messages posted before the worker finishes
    // top-level eval (the spec requires queuing; module-worker dev mode
    // doesn't deliver on it). Buffer postMessage locally until
    // `worker:bootReady` lands, then restore the native method so the
    // hot path (renderFrame at 60Hz) has no wrapper branch.
    this._origPostMessage = this.worker.postMessage.bind(this.worker);
    this.worker.postMessage = ((msg: unknown, transfer?: Transferable[]): void => {
      this._bootQueue.push({ msg, transfer: transfer ?? [] });
    }) as Worker['postMessage'];
    this.worker.addEventListener('message', this.handleMessage);
    // On a worker runtime error / structured-clone failure, mark the proxy
    // dead so subsequent postMessage calls no-op (silent worker is better
    // than a thrown error per frame). The caller's onError lets Match.tsx
    // surface a banner / decide whether to fall back to a main-thread
    // Renderer; the proxy itself does not auto-fallback.
    this.worker.addEventListener('error', (e) => {
      const msg = e.message || 'worker error';
      this.destroyed = true;
      opts.onError?.(msg);
    });
    this.worker.addEventListener('messageerror', () => {
      this.destroyed = true;
      opts.onError?.('worker structured-clone failed');
    });

    // Wrap canvas-transfer + postMessage in try/catch — see EngineWorkerProxy
    // (review round 8 #32) for the rationale. A throw between `new Worker()`
    // and constructor return strands the worker; terminate it explicitly
    // before re-throwing so the caller's catch only deals with the error.
    try {
      // Each `transferControlToOffscreen` call detaches the canvas from
      // main's rendering pipeline — we keep the HTMLCanvasElement
      // reference alive so we can still write to its `.style.opacity`
      // for the night-tint cross-fade.
      const bgOff = opts.bgCanvas.transferControlToOffscreen();
      const fgOff = opts.fgCanvas.transferControlToOffscreen();
      const hudOff = opts.hudCanvas?.transferControlToOffscreen() ?? null;
      const bgNightOff = opts.bgNightCanvas?.transferControlToOffscreen() ?? null;
      const lightOff = opts.lightCanvas?.transferControlToOffscreen() ?? null;

      const particlesSab = createParticlesSab();
      if (particlesSab) this.particleSabViews = makeViews(particlesSab);

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
        perfEnabled: opts.perfEnabled ?? false,
        navDebugEnabled: opts.navDebugEnabled ?? false,
        netDebugEnabled: opts.netDebugEnabled ?? false,
        fpsEnabled: opts.fpsEnabled ?? false,
        particlesSab: particlesSab ?? undefined,
      };

      const transfer: Transferable[] = [bgOff, fgOff];
      if (hudOff) transfer.push(hudOff);
      if (bgNightOff) transfer.push(bgNightOff);
      if (lightOff) transfer.push(lightOff);

      // Lift the onReady out of the closure so it survives across messages.
      this.onReady = opts.onReady;
      this.worker.postMessage(init, transfer);
    } catch (err) {
      this.worker.terminate();
      this.destroyed = true;
      throw err;
    }

    // Expose the proxy so E2E + the perf harness can read worker render-
    // time stats. Single global; replaced on subsequent constructs.
    // Compositor pacing is opt-in (call startCompositorPacing()) — the
    // hidden video + captureStream setup can stall window.onload in some
    // environments (headless Chrome with no media decoders), so we don't
    // auto-attach it on construction.
    if (typeof window !== 'undefined') {
      (window as unknown as { __rendererProxy?: RendererProxy }).__rendererProxy = this;
    }
  }

  /** Set up a hidden 1×1 video sourced from a captureStream of a synthetic
   *  canvas. `requestVideoFrameCallback` then fires on each frame the
   *  browser presents, giving us ground-truth compositor presentation
   *  pacing. The deltas between presentations are the user-perceived
   *  frame intervals — crucial signal in worker mode where main-thread
   *  rAF is also vsync-paced and so can't be told apart from the same
   *  metric on the no-worker baseline.
   *
   *  The canvas is fed at 60 fps via captureStream(60) so the stream
   *  always has a frame ready; the actual presentation pacing is dictated
   *  by the browser compositor, not the source canvas. */
  private composRafId = 0;

  /** Start the compositor pacing capture. Opt-in — not auto-started.
   *
   *  Originally tried `requestVideoFrameCallback` on a hidden video sourced
   *  from a canvas captureStream. Headless Chrome / no-decoder environments
   *  often produce zero VFC fires (the video never gets a first decoded
   *  frame), so we fall through to the rAF-delta approach which gives the
   *  same answer in worker mode: the browser paces rAF callbacks at vsync,
   *  and dropped vsyncs show up as deltas > 1 frame interval. */
  startCompositorPacing(): void {
    if (this.composRunning) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    this.composRunning = true;
    const tick = (t: number): void => {
      if (this.destroyed || !this.composRunning) return;
      if (this.composPacing.lastT > 0) {
        this.composPacing.samples.push(t - this.composPacing.lastT);
      }
      this.composPacing.lastT = t;
      this.composRafId = requestAnimationFrame(tick);
    };
    this.composRafId = requestAnimationFrame(tick);
  }

  private stopCompositorPacing(): void {
    this.composRunning = false;
    if (this.composRafId) {
      cancelAnimationFrame(this.composRafId);
      this.composRafId = 0;
    }
  }

  private onReady?: () => void;

  private _releaseBootQueue(): void {
    if (this.worker.postMessage === this._origPostMessage) return;
    this.worker.postMessage = this._origPostMessage;
    for (const { msg, transfer } of this._bootQueue) {
      if (transfer.length > 0) this._origPostMessage(msg, transfer);
      else this._origPostMessage(msg);
    }
    this._bootQueue.length = 0;
  }

  private handleMessage = (e: MessageEvent<WorkerToHostMsg>): void => {
    if (this.destroyed) return;
    const msg = e.data;
    if (msg.type === 'worker:bootReady') {
      this._releaseBootQueue();
      return;
    }
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
      // Merge histograms bucket-by-bucket.
      const h = this.renderStats.histogram;
      for (let i = 0; i < h.length && i < msg.histogram.length; i++) {
        h[i] += msg.histogram[i];
      }
      this.renderStats.overflowFrames += msg.overflowFrames;
      // Sections snapshot is cumulative since worker boot — overwrite.
      if (msg.sections) this.renderStats.sections = msg.sections;
      if (msg.longFrames && msg.longFrames.length > 0) {
        for (const lf of msg.longFrames) this.renderStats.longFrames.push(lf);
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
    this.stopCompositorPacing();
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
  warmHudFonts(): void {
    this.post({ type: 'host:warmHudFonts' });
  }
  /** Forward a runtime debug-flag toggle so the worker's overlay state
   *  matches main's. Subscribed by `useLocalMatch` /  `useOnlineMatch` to
   *  `debugFlags.subscribeDebugFlags`. */
  setDebugFlag(name: 'nav' | 'net' | 'fps' | 'perf', value: boolean): void {
    this.post({ type: 'host:setDebugFlag', name, value });
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
    // SAB fast path — write particles into shared memory, leave the
    // postMessage `particles` field empty so structured clone has
    // nothing to do. The worker reads from the SAB instead.
    if (this.particleSabViews) {
      writeParticles(this.particleSabViews, particles);
    }
    this.post({
      type: 'host:renderFrame',
      state: matchState,
      arenaId: arena.id,
      particles: this.particleSabViews ? [] : particles,
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
