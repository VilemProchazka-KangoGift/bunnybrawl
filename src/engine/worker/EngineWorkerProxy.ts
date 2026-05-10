/**
 * Main-thread proxy for sim-in-worker mode (?simWorker=on). Stands in for
 * GameLoop entirely — the worker hosts Simulator + cosmetic systems +
 * Renderer and drives its own RAF. Main only:
 *   - reads keyboard / touch each frame and forwards an input batch
 *   - receives engine events (SFX, music, haptics, phase change, match end)
 *     and dispatches via the real AudioManager / haptics / callbacks
 *   - mirrors the worker's MatchState so getState() answers synchronously
 *     for E2E and pause/resume UI
 *
 * Implements just enough of GameLoop's public surface for Match.tsx +
 * matchLoading + bunnyTestShim. Hard-coded callsites (lobby, online play)
 * keep using the real GameLoop — sim-in-worker is local-only this round.
 *
 * Wire format: messages.ts. Lifecycle:
 *   1. Construct → spawns worker, transfers canvases, posts host:initEngine
 *   2. start() → begins forwarding inputs each rAF on main
 *   3. Worker drives its own RAF for sim+cosmetic+render
 *   4. stop() / destroy → posts host:stop, terminates worker
 */

import { KeyboardManager } from '../input/KeyboardManager';
import { audio } from '../audio';
import { haptics } from '../haptics';
import { isTouchPrimary } from '../touchDetect';
import { TouchInputManager } from '../touchInput';
import { isBotSlot } from '../types';
import { getArena, getTheme } from '../arenas/operations';
import { CANVAS_WIDTH } from '../constants';
import type { Arena, MatchSettings, MatchState, MatchPhase, PlayerSlot, InputState, CharacterSlot } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { IRenderer, RenderDiagnostics } from '../renderer';
import type {
  HostInitEngineMsg, HostStopMsg, HostEngineInputBatchMsg,
  HostEnginePauseMsg, HostEngineResumeMsg,
  HostEngineSwitchArenaMsg, HostEngineSetPhaseMsg, HostEngineSkipCountdownMsg,
  WorkerToHostMsg,
} from './messages';

/** EngineWorkerProxy creation options. Mirrors RendererProxyOptions but
 *  carries the simulation params too (arena, settings, players). */
export interface EngineWorkerProxyOptions {
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
  hudCanvas?: HTMLCanvasElement;
  bgNightCanvas?: HTMLCanvasElement;
  fgNightTint?: HTMLDivElement;
  lightCanvas?: HTMLCanvasElement;
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  onMatchEnd: (winner: PlayerSlot | null, state: MatchState) => void;
  mirrored?: boolean;
  renderScale: number;
  language?: string;
  perfEnabled?: boolean;
  onError?: (message: string) => void;
}

/** Stub diagnostics until the worker periodically posts the real ones. */
const STUB_DIAGNOSTICS: RenderDiagnostics = Object.freeze({
  clouds: false, weather: false, wildlife: false, animatedBg: false,
  hazardZones: false, effectZones: false, bouncyPlatforms: false, pigeons: false,
  lavaRocks: false, springs: false, thorns: false, carrots: false,
  gibs: false, confetti: false, shockwaves: false, afterimages: false,
  fog: false, ambient: false, fireworks: false, dayNight: false,
  countdown: false, navDebug: false, netDebug: false, screenFlash: false,
  hitstop: false, screenShake: false, zeroGShimmer: false, playersDrawn: 0,
});

export class EngineWorkerProxy {
  private worker: Worker;
  private destroyed = false;
  private fgNightTint: HTMLDivElement | null;
  private bgNightCanvasEl: HTMLCanvasElement | null;
  private lightCanvasEl: HTMLCanvasElement | null;
  private keyboardManager = new KeyboardManager();
  private touchInput: TouchInputManager | null = null;
  private touchSlot: PlayerSlot | null = null;
  private rafId = 0;
  private running = false;
  private paused = false;
  private mirrorState: MatchState | null = null;
  /** Last input batch posted to the worker. Per-rAF reads compare against
   *  this to skip identical posts — inputs change far less often than 60Hz
   *  so the dedup cuts postMessage volume 3-10×. Indexed by slot order in
   *  `activePlayers`. */
  private lastSentInputs: InputState[] = [];
  /** True until the first input batch has been posted, ensuring the worker
   *  receives at least one batch even on a frame with all-empty inputs
   *  (so RemoteInput's read finds the slot in the map). */
  private inputsEverSent = false;
  private mirrorArena: Arena;
  private originalArena: Arena;
  private settings: MatchSettings;
  private activePlayers: PlayerSlot[];
  private onMatchEnd: (winner: PlayerSlot | null, state: MatchState) => void;
  private onPhaseChange?: (phase: MatchPhase) => void;
  private onError?: (message: string) => void;
  /** A frozen-empty MatchState provided to getState() until the first
   *  worker:engineStateMirror arrives. Match.tsx + bunnyTestShim tolerate
   *  the empty shape because phase=loading short-circuits most reads. */
  private bootState: MatchState;
  /** Stand-in for IRenderer that matchLoading expects. Methods post to the
   *  worker; the worker's hosted Renderer applies them. */
  readonly renderer: IRenderer;

  constructor(opts: EngineWorkerProxyOptions) {
    this.fgNightTint = opts.fgNightTint ?? null;
    this.bgNightCanvasEl = opts.bgNightCanvas ?? null;
    this.lightCanvasEl = opts.lightCanvas ?? null;
    this.mirrorArena = opts.arena;
    this.originalArena = opts.arena;
    this.settings = opts.settings;
    this.activePlayers = opts.activePlayers;
    this.onMatchEnd = opts.onMatchEnd;
    this.onError = opts.onError;
    this.bootState = makeBootState(opts.arena, opts.activePlayers);

    this.worker = new Worker(
      new URL('./renderWorker.ts', import.meta.url),
      { type: 'module', name: 'carrot-royale-engine' },
    );
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', (e) => this.onError?.(e.message || 'worker error'));
    this.worker.addEventListener('messageerror', () => this.onError?.('worker structured-clone failed'));

    const bgOff = opts.bgCanvas.transferControlToOffscreen();
    const fgOff = opts.fgCanvas.transferControlToOffscreen();
    const hudOff = opts.hudCanvas?.transferControlToOffscreen() ?? null;
    const bgNightOff = opts.bgNightCanvas?.transferControlToOffscreen() ?? null;
    const lightOff = opts.lightCanvas?.transferControlToOffscreen() ?? null;

    const init: HostInitEngineMsg = {
      type: 'host:initEngine',
      bgCanvas: bgOff,
      fgCanvas: fgOff,
      hudCanvas: hudOff,
      bgNightCanvas: bgNightOff,
      lightCanvas: lightOff,
      arenaId: opts.arena.id,
      settings: opts.settings,
      activePlayers: opts.activePlayers,
      mirrored: opts.mirrored ?? false,
      renderScale: opts.renderScale,
      language: opts.language ?? 'en',
      perfEnabled: opts.perfEnabled ?? false,
    };
    const transfer: Transferable[] = [bgOff, fgOff];
    if (hudOff) transfer.push(hudOff);
    if (bgNightOff) transfer.push(bgNightOff);
    if (lightOff) transfer.push(lightOff);
    this.worker.postMessage(init, transfer);

    // Touch input lives on main and forwards into the input batch.
    if (isTouchPrimary()) {
      this.touchInput = new TouchInputManager();
      this.touchSlot = opts.activePlayers.find((s) => !isBotSlot(s)) ?? null;
      if (this.touchSlot) haptics.init(this.touchSlot);
    }

    // Build the IRenderer adapter. Each method posts a message; the
    // worker's hosted Renderer applies it. matchLoading uses these.
    this.renderer = makeRendererProxy(this);

    if (typeof window !== 'undefined') {
      (window as unknown as { __engineWorkerProxy?: EngineWorkerProxy }).__engineWorkerProxy = this;
    }
  }

  start(): void {
    this.keyboardManager.attach();
    if (this.touchInput) {
      const container = document.querySelector('.game-scaler-content') as HTMLElement | null;
      if (container) {
        const scaleFn = (): number => container.getBoundingClientRect().width / CANVAS_WIDTH;
        this.touchInput.attach(container, scaleFn, () => this.paused);
      }
    }
    this.running = true;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    if (!this.running || this.destroyed) return;
    // Build per-slot input batch from KeyboardManager + TouchInput. Bots
    // run inside the worker's Simulator (RuleBasedBot) so we don't include
    // their inputs.
    const inputs: Array<[PlayerSlot, InputState]> = [];
    let humanIdx = 0;
    let changed = !this.inputsEverSent;
    for (const slot of this.activePlayers) {
      if (isBotSlot(slot)) continue;
      const kb = this.keyboardManager.readSlot(slot as CharacterSlot);
      let merged: InputState = kb;
      if (this.touchInput && slot === this.touchSlot) {
        const player = this.mirrorState?.players.find((p) => p.id === slot);
        const airborne = player?.state === 'airborne';
        const ti = this.touchInput.getInputForPlayer(airborne);
        merged = {
          left: kb.left || ti.left,
          right: kb.right || ti.right,
          jump: kb.jump || ti.jump,
          down: kb.down || ti.down,
        };
      }
      inputs.push([slot, merged]);
      const last = this.lastSentInputs[humanIdx];
      if (!last
        || last.left !== merged.left
        || last.right !== merged.right
        || last.jump !== merged.jump
        || last.down !== merged.down) {
        changed = true;
      }
      this.lastSentInputs[humanIdx] = merged;
      humanIdx++;
    }
    // Skip the post when nothing changed since last frame. The worker's
    // input map keeps the previous values; RemoteInput re-reads them each
    // tick so unchanged inputs stay correct without a refresh.
    if (changed) {
      const m: HostEngineInputBatchMsg = { type: 'host:engineInputBatch', inputs };
      this.worker.postMessage(m);
      this.inputsEverSent = true;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.keyboardManager.detach();
    this.touchInput?.detach();
    audio.stopAllGameSounds();
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      const stop: HostStopMsg = { type: 'host:stop' };
      this.worker.postMessage(stop);
    } catch { /* worker may already be down */ }
    this.worker.terminate();
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __engineWorkerProxy?: EngineWorkerProxy };
      if (w.__engineWorkerProxy === this) w.__engineWorkerProxy = undefined;
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    audio.setPaused(true);
    const m: HostEnginePauseMsg = { type: 'host:enginePause' };
    this.worker.postMessage(m);
  }
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    audio.setPaused(false, this.mirrorArena.themeId);
    const m: HostEngineResumeMsg = { type: 'host:engineResume' };
    this.worker.postMessage(m);
  }
  isPaused(): boolean { return this.paused; }
  isAutoSlowFlipped(): boolean { return false; }  // worker-side flag not mirrored yet
  skipCountdown(): void {
    const m: HostEngineSkipCountdownMsg = { type: 'host:engineSkipCountdown' };
    this.worker.postMessage(m);
  }
  setPhase(phase: MatchPhase): void {
    const m: HostEngineSetPhaseMsg = { type: 'host:engineSetPhase', phase };
    this.worker.postMessage(m);
  }
  switchArena(arenaId: string, settingsOverrides?: Partial<MatchSettings>): void {
    this.mirrorArena = getArena(arenaId);
    this.originalArena = this.mirrorArena;
    if (settingsOverrides) Object.assign(this.settings, settingsOverrides);
    const m: HostEngineSwitchArenaMsg = { type: 'host:engineSwitchArena', arenaId, settingsOverrides };
    this.worker.postMessage(m);
  }
  /** Worker drives its own loading-generation; main always returns 0
   *  for the kickoffLoading guard. Adequate for local play (no
   *  rapid-arena-swap race in single-player). */
  getLoadingGeneration(): number { return 0; }
  getActiveCharacterNames(): string[] {
    return this.activePlayers
      .map((slot) => this.bootState.players.find((p) => p.id === slot)?.character?.name)
      .filter((n): n is string => !!n);
  }
  getArena(): Arena { return this.mirrorArena; }
  getOriginalArena(): Arena { return this.originalArena; }
  getRenderer(): IRenderer { return this.renderer; }
  getTouchInput(): TouchInputManager | null { return this.touchInput; }
  getState(): MatchState { return this.mirrorState ?? this.bootState; }
  getRendererDiagnostics(): RenderDiagnostics { return STUB_DIAGNOSTICS; }
  setOnPhaseChange(cb: (phase: MatchPhase) => void): void { this.onPhaseChange = cb; }
  setNetworkMode(_enabled: boolean): void { /* sim-worker is local-only */ }
  setPlayerNames(_names: Record<string, string>): void { /* online not in this path */ }
  setConnectionQuality(_rtt: number, _jitter: number): void { /* online not in this path */ }
  setLocalSlot(_slot: PlayerSlot): void { /* online not in this path */ }
  setMatchOver(): void { /* online-only */ }
  resetCosmeticBaselines(): void { /* worker handles internally */ }

  private handleMessage = (e: MessageEvent<WorkerToHostMsg>): void => {
    const msg = e.data;
    if (msg.type === 'worker:nightOpacity') {
      const value = String(msg.opacity);
      if (msg.kind === 'fg') {
        if (this.fgNightTint) this.fgNightTint.style.opacity = value;
      } else if (msg.kind === 'bg') {
        if (this.bgNightCanvasEl) this.bgNightCanvasEl.style.opacity = value;
        if (this.lightCanvasEl) this.lightCanvasEl.style.opacity = value;
      }
      return;
    }
    if (msg.type === 'worker:engineStateMirror') {
      this.mirrorState = msg.state;
      if (msg.arenaId !== this.mirrorArena.id) this.mirrorArena = getArena(msg.arenaId);
      return;
    }
    if (msg.type === 'worker:engineEvent') {
      this.dispatchEngineEvent(msg.kind, msg);
      return;
    }
    if (msg.type === 'worker:error') {
      console.error('[engine worker]', msg.message);
      this.onError?.(msg.message);
      return;
    }
  };

  private dispatchEngineEvent(kind: string, m: { name?: string; themeId?: string; volume?: number; paused?: boolean; arenaId?: string; flavor?: string; slot?: PlayerSlot; prevVy?: number; phase?: MatchPhase; winner?: PlayerSlot | null }): void {
    switch (kind) {
      case 'sfx':              if (m.name) audio.play(m.name as Parameters<typeof audio.play>[0]); break;
      case 'animal':           if (m.name) audio.playAnimal(m.name as Parameters<typeof audio.playAnimal>[0]); break;
      case 'musicStart':       if (m.themeId) audio.playMusic(m.themeId); break;
      case 'musicStop':        audio.stopMusic(); break;
      case 'soundStop':        if (m.name) audio.stop(m.name as Parameters<typeof audio.stop>[0]); break;
      case 'soundVolume':      if (m.name && typeof m.volume === 'number') audio.setVolume(m.name as Parameters<typeof audio.setVolume>[0], m.volume); break;
      case 'allGameSoundsStop': audio.stopAllGameSounds(); break;
      case 'paused':           audio.setPaused(!!m.paused); break;
      case 'resumeContext':    audio.resumeContext(); break;
      case 'preloadArena':     if (m.arenaId) audio.preloadArena(m.arenaId); break;
      case 'haptic': {
        if (m.slot && haptics.isLocal(m.slot)) {
          if (m.flavor === 'landing' && typeof m.prevVy === 'number') haptics.landing(m.prevVy);
          else if (m.flavor === 'hitstop') haptics.hitstop();
        }
        break;
      }
      case 'phaseChange':      if (m.phase) this.onPhaseChange?.(m.phase); break;
      case 'matchEnd':         this.onMatchEnd(m.winner ?? null, this.mirrorState ?? this.bootState); break;
    }
  }
}

/** Build the boot MatchState. Phase=loading + empty arrays so the first
 *  paint and any pre-mirror callsites see a consistent shape. The worker's
 *  Simulator is the source of truth; this is just a placeholder until the
 *  first state mirror arrives. */
function makeBootState(arena: Arena, _activePlayers: PlayerSlot[]): MatchState {
  // Lazy: import MatchState constructor only here to avoid heavyweight
  // setup costs at proxy module-load time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createInitialMatchState } = require('../simulator/initialState');
  const theme = getTheme(arena.themeId);
  return createInitialMatchState(arena, theme);
}

/** Implements the IRenderer surface that matchLoading needs. Each call
 *  posts a host:* message to the worker. */
function makeRendererProxy(proxy: EngineWorkerProxy): IRenderer {
  const worker = (proxy as unknown as { worker: Worker }).worker;
  const warmedNames = new Set<string>();
  return {
    setRenderScale(scale) { worker.postMessage({ type: 'host:setRenderScale', scale }); },
    setBotNavDebugStates(states) { worker.postMessage({ type: 'host:setBotNavDebug', states }); },
    setNetDebugStats(stats) { worker.postMessage({ type: 'host:setNetDebug', stats }); },
    setPlayerNames(names) { worker.postMessage({ type: 'host:setPlayerNames', names }); },
    setTimeLimit(value) { worker.postMessage({ type: 'host:setTimeLimit', value }); },
    setNetworkMode(isNetwork) { worker.postMessage({ type: 'host:setNetworkMode', isNetwork }); },
    setConnectionQuality(rtt, jitter) { worker.postMessage({ type: 'host:setConnectionQuality', rtt, jitter }); },
    setLobbyOverlayFn() { /* no-op: lobby uses main-thread Renderer */ },
    getDiagnostics(): RenderDiagnostics { return STUB_DIAGNOSTICS; },
    warmSpriteCache(names) {
      for (const n of names) warmedNames.add(n);
      worker.postMessage({ type: 'host:warmSpriteCache', names });
    },
    hasWarmedAll(names) { for (const n of names) if (!warmedNames.has(n)) return false; return true; },
    warmHudFonts() { worker.postMessage({ type: 'host:warmHudFonts' }); },
    setTheme(theme: ThemeConfig) { worker.postMessage({ type: 'host:setTheme', themeId: theme.id }); },
    renderBackground(arena, originalArena) {
      worker.postMessage({ type: 'host:renderBackground', arenaId: arena.id, originalArenaId: originalArena?.id });
    },
    emitLightBurst(x, y, kind) { worker.postMessage({ type: 'host:emitLightBurst', x, y, kind }); },
    setArenaLights(lights) { worker.postMessage({ type: 'host:setArenaLights', lights }); },
    bakeGibs(gibs) { worker.postMessage({ type: 'host:bakeGibs', gibs }); },
    renderBloodDrips(drips) { worker.postMessage({ type: 'host:renderBloodDrips', drips }); },
    /** Worker drives its own RAF; this is only called if main accidentally
     *  calls renderFrame on the IRenderer. Safe no-op. */
    renderFrame() { /* worker drives its own RAF */ },
  };
}
