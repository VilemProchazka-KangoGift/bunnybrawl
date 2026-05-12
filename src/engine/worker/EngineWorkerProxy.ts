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
import { mergeKeyboardTouchInput } from '../input/mergeKeyboardTouch';
import { audio } from '../audio';
import { haptics } from '../haptics';
import { isTouchPrimary } from '../touchDetect';
import { TouchInputManager } from '../touchInput';
import { isBotSlot } from '../types';
import { getArena, getTheme } from '../arenas/operations';
import { getCharacterForSlot } from '../characters/defaults';
import { createInitialPlayers, createInitialMatchState } from '../simulator/initialState';
import { CANVAS_WIDTH } from '../constants';
import { createInputSab, setSlotCount, writeSlotInput, SAB_INPUT_MAX_SLOTS } from './sabInput';
import { installWorkerBootQueue, type WorkerBootQueue } from './workerBootQueue';
import type { Arena, MatchSettings, MatchState, MatchPhase, PlayerSlot, InputState, CharacterSlot } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { IRenderer, RenderDiagnostics } from '../renderer';
import type { NetDebugStats } from '../net/core/debugOverlay';
import type {
  HostInitEngineMsg, HostStopMsg, HostEngineInputBatchMsg,
  HostEnginePauseMsg, HostEngineResumeMsg,
  HostEngineSwitchArenaMsg, HostEngineSetPhaseMsg, HostEngineSkipCountdownMsg,
  HostPerfResetMsg,
  HostNetSetModeMsg, HostNetSnapshotApplyMsg,
  HostNetDisconnectSlotMsg, HostNetReconnectSlotMsg,
  WorkerEngineEventMsg, WorkerToHostMsg,
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
  /** URL-gated debug overlays forwarded to the worker. */
  navDebugEnabled?: boolean;
  netDebugEnabled?: boolean;
  fpsEnabled?: boolean;
  onError?: (message: string) => void;
}

/** Stub diagnostics until the worker periodically posts the real ones. */
const STUB_DIAGNOSTICS: RenderDiagnostics = Object.freeze({
  clouds: false, weather: false, wildlife: false, animatedBg: false,
  hazardZones: false, effectZones: false, bouncyPlatforms: false,
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
  /** Phase 2: host-mode subscriber for worker-emitted encoded snapshots.
   *  Single-caller — NetMatch wires it in `start()`. Null when offline. */
  private snapshotReadyCb: ((buffer: ArrayBuffer, frame: number) => void) | null = null;
  /** Last input batch posted to the worker. Per-rAF reads compare against
   *  this to skip identical posts — inputs change far less often than 60Hz
   *  so the dedup cuts postMessage volume 3-10×. Indexed by slot order in
   *  `activePlayers`. Each entry is its own scratch (NOT a reference to
   *  the current tick's `merged` source, which is itself a reused scratch
   *  from KeyboardManager / touchMerged — those mutate every tick, so a
   *  shared reference would defeat the field-equality check). */
  private lastSentInputs: InputState[] = [];
  /** True until the first input batch has been posted, ensuring the worker
   *  receives at least one batch even on a frame with all-empty inputs
   *  (so RemoteInput's read finds the slot in the map). */
  private inputsEverSent = false;
  /** SAB-backed input view (Step 2 of the SAB roadmap). When the browser
   *  exposes `crossOriginIsolated` + SAB, main writes per-slot bitfields
   *  here instead of postMessaging an input batch. Null in prod / non-
   *  isolated contexts; the postMessage fallback handles those. */
  private inputSabView: Int32Array | null = null;
  /** The current arena (un-mirrored layout — Match.tsx hands the proxy the
   *  arena from `getArena(id)`). The worker re-applies `mirrorArena()`
   *  internally when `mods.mirrorArena=true`, so this field is the raw
   *  arena, not a mirrored copy despite living in a class adjacent to
   *  the mirror flag. */
  private _arena: Arena;
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
  /** Drops the `warmedNames` set inside `makeRendererProxy`'s closure.
   *  Called from `switchArena` so a level switch doesn't leave a falsely
   *  pre-warmed roster on the new arena. Wired by the constructor. */
  private _clearWarmedNames?: () => void;
  /** Buffers postMessage calls until the worker posts `worker:bootReady`,
   *  then restores native postMessage so the 60Hz input-batch hot path
   *  has no wrapper branch. See `workerBootQueue.ts` for the rationale. */
  private _bootQueue!: WorkerBootQueue;

  /** Latest worker perfStats flush. Populated from `worker:perfStats`
   *  messages and read by the bench via `__fpsCounter` / `__perfTrace`
   *  shims (the global rAF observer + perfTrace on main are unfed when
   *  the loop runs in the worker). */
  private _latestFpsSamples: { dts: number[]; lastSampleTime: number } = { dts: [], lastSampleTime: 0 };
  private _latestSections: Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }> = {};

  /** Per-rAF scratches so the input loop allocates zero objects in
   *  steady state. Inputs are read into these, then either SAB-written
   *  or postMessage-posted. The postMessage path retains the array
   *  reference across ticks (structured clone copies it on send). */
  private _inputsScratch: Array<[PlayerSlot, InputState]> = [];
  private _touchMerged: InputState = { left: false, right: false, jump: false, down: false };

  constructor(opts: EngineWorkerProxyOptions) {
    this.fgNightTint = opts.fgNightTint ?? null;
    this.bgNightCanvasEl = opts.bgNightCanvas ?? null;
    this.lightCanvasEl = opts.lightCanvas ?? null;
    this._arena = opts.arena;
    this.originalArena = opts.arena;
    this.settings = opts.settings;
    this.activePlayers = opts.activePlayers;
    this.onMatchEnd = opts.onMatchEnd;
    this.onError = opts.onError;
    this.bootState = makeBootState(opts.arena, opts.activePlayers, opts.settings);

    this.worker = new Worker(
      new URL('./renderWorker.ts', import.meta.url),
      { type: 'module', name: 'carrot-royale-engine' },
    );
    this._bootQueue = installWorkerBootQueue(this.worker);
    this.worker.addEventListener('message', this.handleMessage);
    // On a worker runtime error / structured-clone failure, mark the proxy
    // dead so subsequent input batch posts no-op (a silent worker is better
    // than throwing per-rAF). Stop the rAF loop on main too. The caller's
    // onError lets Match.tsx flash a banner and quit the match.
    this.worker.addEventListener('error', (e) => {
      const m = e.message || 'worker error';
      this.destroyed = true;
      this.running = false;
      this.onError?.(m);
    });
    this.worker.addEventListener('messageerror', () => {
      this.destroyed = true;
      this.running = false;
      this.onError?.('worker structured-clone failed');
    });

    // Wrap the canvas-transfer + postMessage in a try/catch so a partial
    // failure (e.g. one canvas already detached, structured-clone refusing
    // a payload field) terminates the spawned worker instead of leaking
    // it. Without this guard, a throw between `new Worker()` and the
    // constructor's return strands the worker — the local `engineProxy`
    // binding never gets assigned, the caller's catch block can't reach
    // the worker reference, and the worker keeps its message listener +
    // canvases alive forever (review round 8 #32).
    try {
      const bgOff = opts.bgCanvas.transferControlToOffscreen();
      const fgOff = opts.fgCanvas.transferControlToOffscreen();
      const hudOff = opts.hudCanvas?.transferControlToOffscreen() ?? null;
      const bgNightOff = opts.bgNightCanvas?.transferControlToOffscreen() ?? null;
      const lightOff = opts.lightCanvas?.transferControlToOffscreen() ?? null;

      // Resolve the slot → CharacterDef pairs on main where the lobby's
      // CHARACTERS / BOT_CHARACTERS state lives, then ship to the worker.
      const characters: Array<[PlayerSlot, ReturnType<typeof getCharacterForSlot>]> =
        opts.activePlayers.map((slot) => [slot, getCharacterForSlot(slot)]);

      // SAB input wire (Step 2). Allocate only the human slots — bots
      // run inside the worker's Simulator and never read this view.
      const humanSlots = opts.activePlayers.filter((s) => !isBotSlot(s));
      const inputSab = humanSlots.length <= SAB_INPUT_MAX_SLOTS ? createInputSab() : null;
      if (inputSab) {
        this.inputSabView = new Int32Array(inputSab);
        setSlotCount(this.inputSabView, humanSlots.length);
      }

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
        characters,
        mirrored: opts.mirrored ?? false,
        renderScale: opts.renderScale,
        language: opts.language ?? 'en',
        perfEnabled: opts.perfEnabled ?? false,
        navDebugEnabled: opts.navDebugEnabled ?? false,
        netDebugEnabled: opts.netDebugEnabled ?? false,
        fpsEnabled: opts.fpsEnabled ?? false,
        inputSab: inputSab ?? undefined,
        inputSabSlots: inputSab ? humanSlots : undefined,
      };
      const transfer: Transferable[] = [bgOff, fgOff];
      if (hudOff) transfer.push(hudOff);
      if (bgNightOff) transfer.push(bgNightOff);
      if (lightOff) transfer.push(lightOff);
      this.worker.postMessage(init, transfer);
    } catch (err) {
      this.worker.terminate();
      this.destroyed = true;
      throw err;
    }

    // Touch input lives on main and forwards into the input batch.
    if (isTouchPrimary()) {
      this.touchInput = new TouchInputManager();
      this.touchSlot = opts.activePlayers.find((s) => !isBotSlot(s)) ?? null;
      if (this.touchSlot) haptics.init(this.touchSlot);
    }

    // Build the IRenderer adapter. Each method posts a message; the
    // worker's hosted Renderer applies it. matchLoading uses these.
    // The factory hands back a clearer for the warmedNames intent set so
    // `switchArena()` can drop stale entries (review #23).
    const adapter = makeRendererProxy(this);
    this.renderer = adapter.renderer;
    this._clearWarmedNames = adapter.clearWarmedNames;

    // Globals carry the most-recently-constructed proxy so E2E + the perf
    // harness can read worker stats. React StrictMode double-mount in dev
    // is safe: the first proxy's `stop()` only nulls the global if it
    // still points at `=== this`, so we never clobber the live one.
    if (typeof window !== 'undefined') {
      (window as unknown as { __engineWorkerProxy?: EngineWorkerProxy }).__engineWorkerProxy = this;
      this._installPerfShims();
    }
  }

  /** Override `window.__fpsCounter` + `__perfTrace` with worker-backed
   *  shims so the perf bench (which expects main-thread modules) reads
   *  the worker's actual frame timings and section snapshots. The
   *  useLocalMatch / useOnlineMatch shells set the real modules first;
   *  this overwrites them in simWorker mode where those modules are
   *  never fed. Cleared in `stop()` if the global still points at us. */
  private _installPerfShims(): void {
    type FpsLike = { dumpSamples(): { dts: number[]; count: number; lastSampleTime: number } };
    type PerfLike = {
      enabled: boolean;
      snapshot(): Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }>;
      reset(): void;
    };
    const w = window as unknown as {
      __fpsCounter?: FpsLike;
      __perfTrace?: PerfLike;
    };
    w.__fpsCounter = {
      dumpSamples: () => {
        const s = this._latestFpsSamples;
        return { dts: s.dts, count: s.dts.length, lastSampleTime: s.lastSampleTime };
      },
    };
    w.__perfTrace = {
      enabled: true,
      snapshot: () => this._latestSections,
      reset: () => this.resetPerfStats(),
    };
  }

  /** Resets the worker's perfTrace + fpsCounter rings AND clears the
   *  proxy's last-known snapshot so a subsequent shim read returns empty
   *  until the next perfStats flush arrives. Mirrors main's
   *  perfTrace.reset() semantics. */
  resetPerfStats(): void {
    this._latestSections = {};
    this._latestFpsSamples = { dts: [], lastSampleTime: 0 };
    const msg: HostPerfResetMsg = { type: 'host:perfReset' };
    // workerBootQueue wraps `worker.postMessage` so pre-bootReady calls
    // are buffered transparently.
    this.worker.postMessage(msg);
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
    //
    // Allocations: zero in steady state. `_inputsScratch` is retained,
    // truncated, and refilled each tick. Tuples are recycled in place.
    // Touch-merge writes into a single `_touchMerged` scratch.
    const inputs = this._inputsScratch;
    let humanIdx = 0;
    let changed = !this.inputsEverSent;
    for (const slot of this.activePlayers) {
      if (isBotSlot(slot)) continue;
      const kb = this.keyboardManager.readSlot(slot as CharacterSlot);
      let merged: InputState = kb;
      if (this.touchInput && slot === this.touchSlot) {
        // Index-based lookup avoids the per-rAF closure that
        // `players.find(p => p.id === slot)` allocates.
        let airborne = false;
        if (this.mirrorState) {
          const players = this.mirrorState.players;
          for (let i = 0; i < players.length; i++) {
            if (players[i].id === slot) { airborne = players[i].state === 'airborne'; break; }
          }
        }
        const ti = this.touchInput.getInputForPlayer(airborne);
        const tm = this._touchMerged;
        tm.left = kb.left || ti.left;
        tm.right = kb.right || ti.right;
        tm.jump = kb.jump || ti.jump;
        tm.down = kb.down || ti.down;
        merged = tm;
      }
      // Reuse the existing tuple at this index if present; otherwise
      // push a fresh one (one-time per slot, amortized across the match).
      if (humanIdx < inputs.length) {
        inputs[humanIdx][0] = slot;
        inputs[humanIdx][1] = merged;
      } else {
        inputs.push([slot, merged]);
      }
      let last = this.lastSentInputs[humanIdx];
      if (!last) {
        last = { left: false, right: false, jump: false, down: false };
        this.lastSentInputs[humanIdx] = last;
        changed = true;
      } else if (last.left !== merged.left
        || last.right !== merged.right
        || last.jump !== merged.jump
        || last.down !== merged.down) {
        changed = true;
      }
      // Copy fields (not reference) — merged is itself a reused scratch
      // that will be overwritten next tick; storing the reference would
      // make next-tick's `last.x === merged.x` trivially true.
      last.left = merged.left;
      last.right = merged.right;
      last.jump = merged.jump;
      last.down = merged.down;
      humanIdx++;
    }
    // Truncate to the actual human-slot count (no-op in steady state).
    if (inputs.length > humanIdx) inputs.length = humanIdx;

    // Two delivery paths:
    //  - SAB (crossOriginIsolated dev/preview): Atomics.store the per-slot
    //    bitfield. Worker polls every fixedUpdate, no message hop.
    //  - postMessage fallback (prod / GitHub Pages, no COOP/COEP): same
    //    `host:engineInputBatch` wire as before.
    if (this.inputSabView) {
      for (let i = 0; i < inputs.length; i++) {
        writeSlotInput(this.inputSabView, i, inputs[i][1]);
      }
      this.inputsEverSent = true;
    } else if (changed) {
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
      const w = window as unknown as {
        __engineWorkerProxy?: EngineWorkerProxy;
        __fpsCounter?: unknown;
        __perfTrace?: unknown;
      };
      if (w.__engineWorkerProxy === this) {
        w.__engineWorkerProxy = undefined;
        // Drop the perf shims we installed. Tests / next match's proxy
        // re-install when they construct a fresh EngineWorkerProxy.
        w.__fpsCounter = undefined;
        w.__perfTrace = undefined;
      }
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
    audio.setPaused(false, this._arena.themeId);
    const m: HostEngineResumeMsg = { type: 'host:engineResume' };
    this.worker.postMessage(m);
  }
  isPaused(): boolean { return this.paused; }
  isAutoSlowFlipped(): boolean { return false; }  // worker-side flag not mirrored yet

  /** Host-side disconnect propagation. The generic core HostAuthority
   *  calls `simulation.disconnectPlayer(slot)` when a peer's grace timer
   *  expires; in remote-sim mode that routes through this postMessage. */
  disconnectPlayer(slot: PlayerSlot): void {
    const m: HostNetDisconnectSlotMsg = { type: 'host:netDisconnectSlot', slot };
    this.worker.postMessage(m);
  }

  // ---- NetMatchDriver remainder (worker-hosted, mostly no-op on main) ----
  // Sim lives in the worker, so the per-frame tick/cosmetic/render hooks
  // are no-ops here. Main still serves up local input via the keyboard
  // manager so HostLoop's input-fairness ring can read it.

  /** Read main's local input. HostLoop calls this on every fixedUpdate to
   *  feed the input fairness ring before posting the per-tick batch. */
  getInputAny(): InputState {
    const kb = this.keyboardManager.readAny();
    let airborne = false;
    if (this.touchSlot && this.mirrorState) {
      const players = this.mirrorState.players;
      for (let i = 0; i < players.length; i++) {
        if (players[i].id === this.touchSlot) {
          airborne = players[i].state === 'airborne';
          break;
        }
      }
    }
    return mergeKeyboardTouchInput(kb, this.touchInput, airborne, this._inputAnyScratch);
  }
  private readonly _inputAnyScratch: InputState = { left: false, right: false, jump: false, down: false };

  fixedUpdate(_dt: number, _networkInputs?: Map<string, InputState>): void { /* worker drives */ }
  tickCosmetic(_dt: number): void { /* worker drives */ }
  warmupCosmeticDuringLoading(_dt: number): void { /* worker drives */ }
  onEnterPlayingPhase(): void { /* worker detects phase change from snapshot.phase */ }
  renderFrame(_dt: number): void { /* worker drives its own RAF + render */ }
  setNetDebugStats(stats: NetDebugStats | null): void {
    this.worker.postMessage({ type: 'host:setNetDebug', stats });
  }
  skipCountdown(): void {
    const m: HostEngineSkipCountdownMsg = { type: 'host:engineSkipCountdown' };
    this.worker.postMessage(m);
  }
  setPhase(phase: MatchPhase): void {
    const m: HostEngineSetPhaseMsg = { type: 'host:engineSetPhase', phase };
    this.worker.postMessage(m);
  }

  /** NetMatchDriver discriminator. EngineWorkerProxy hosts the simulation
   *  in a worker — HostLoop branches on this to forward input batches
   *  instead of calling fixedUpdate locally. */
  isRemoteSim(): boolean { return true; }

  /** Replace the previous batch and post a fresh host:engineInputBatch
   *  with the (already-fairness-delayed) input map. Reuses the existing
   *  Phase 1 wire shape — SAB Step 2's bitfield path may take over once
   *  wired, but the postMessage path is the COOP/COEP-less fallback.
   *  Reuses a class-scoped scratch tuple list across calls to avoid a
   *  per-tick array allocation; dedups against the previous batch so a
   *  60Hz host with idle hands posts ~0 messages/sec, matching the SAB
   *  fast path's cadence. */
  private _inputBatchScratch: Array<[PlayerSlot, InputState]> = [];
  private _lastInputBatchHash = 0;
  postInputBatch(inputs: ReadonlyMap<PlayerSlot, InputState>): void {
    // Bitfield hash over the input map. 4 bits per slot, slot order
    // matches insertion (which `HostAuthority.getNetworkInputs` keeps
    // stable). Collisions are acceptable — at worst we miss one update.
    let hash = 0;
    let bit = 0;
    for (const [, input] of inputs) {
      if (input.left)  hash |= 1 << bit;
      if (input.right) hash |= 1 << (bit + 1);
      if (input.jump)  hash |= 1 << (bit + 2);
      if (input.down)  hash |= 1 << (bit + 3);
      bit += 4;
    }
    if (hash === this._lastInputBatchHash && this.inputsEverSent) return;
    this._lastInputBatchHash = hash;
    this.inputsEverSent = true;

    this._inputBatchScratch.length = 0;
    for (const [slot, input] of inputs) this._inputBatchScratch.push([slot, input]);
    const m: HostEngineInputBatchMsg = { type: 'host:engineInputBatch', inputs: this._inputBatchScratch };
    this.worker.postMessage(m);
  }

  // ---- Phase 2: NetMatch async fixedUpdate -------------------------------

  /** Tell the worker which side of the netcode it's running. host =
   *  encode + emit snapshots per tick; guest = decode + interpolate from
   *  buffers fed via pumpIncomingSnapshot. */
  setNetMode(mode: 'host' | 'guest' | 'off', delayFrames = 0): void {
    const m: HostNetSetModeMsg = { type: 'host:netSetMode', mode, delayFrames };
    this.worker.postMessage(m);
  }

  /** Guest-only. Hand an encoded snapshot buffer to the worker for decode
   *  + interp + apply. The buffer is transferred — main must not retain
   *  a reference after this call. The Trystero 1-byte type prefix is
   *  already stripped by the caller. */
  pumpIncomingSnapshot(buffer: ArrayBuffer): void {
    const m: HostNetSnapshotApplyMsg = { type: 'host:netSnapshotApply', buffer };
    this.worker.postMessage(m, [buffer]);
  }

  /** Host-only. Tell the worker a peer reconnected — the sim respawns the
   *  player and resumes their input wiring. */
  reconnectSlot(slot: PlayerSlot): void {
    const m: HostNetReconnectSlotMsg = { type: 'host:netReconnectSlot', slot };
    this.worker.postMessage(m);
  }

  /** Host-only subscription. The proxy fires the callback for every
   *  worker:netSnapshot it receives — NetMatch funnels the buffer into
   *  HostAuthority.broadcastEncodedSnapshot. Only one subscriber at a
   *  time (NetMatch is the single caller). */
  onSnapshotReady(cb: (buffer: ArrayBuffer, frame: number) => void): void {
    this.snapshotReadyCb = cb;
  }

  switchArena(arenaId: string, settingsOverrides?: Partial<MatchSettings>): void {
    this._arena = getArena(arenaId);
    this.originalArena = this._arena;
    if (settingsOverrides) Object.assign(this.settings, settingsOverrides);
    // Drop the warmedNames intent set so `hasWarmedAll` doesn't falsely
    // report true for old characters after a level switch (review #23).
    // The next `runLoadingTasks` pass will re-warm against the new roster.
    this._clearWarmedNames?.();
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
  getArena(): Arena { return this._arena; }
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
  /** Forward a runtime debug-flag toggle to the worker's GameLoop so its
   *  Renderer sees the same overlay state as main. */
  setDebugFlag(name: 'nav' | 'net' | 'fps' | 'perf', value: boolean): void {
    this.worker.postMessage({ type: 'host:setDebugFlag', name, value });
  }

  private handleMessage = (e: MessageEvent<WorkerToHostMsg>): void => {
    if (this.destroyed) return;
    const msg = e.data;
    if (msg.type === 'worker:bootReady') {
      this._bootQueue.release();
      return;
    }
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
      if (msg.arenaId !== this._arena.id) this._arena = getArena(msg.arenaId);
      return;
    }
    if (msg.type === 'worker:engineEvent') {
      this.dispatchEngineEvent(msg);
      return;
    }
    // Phase 2: host emits encoded snapshots; main pumps into transport.
    if (msg.type === 'worker:netSnapshot') {
      this.snapshotReadyCb?.(msg.buffer, msg.frame);
      return;
    }
    if (msg.type === 'worker:netInterpStats') {
      // Guest-side interp stats forwarded here. Currently no consumer;
      // hook for the debug overlay lands when net stats integrate.
      return;
    }
    if (msg.type === 'worker:perfStats') {
      // Sections snapshot is cumulative since worker boot (or last reset)
      // — overwrite per flush. fpsSamples is the current ring dump, also
      // a fresh per-flush snapshot.
      if (msg.sections) this._latestSections = msg.sections;
      if (msg.fpsSamples) this._latestFpsSamples = msg.fpsSamples;
      return;
    }
    if (msg.type === 'worker:error') {
      console.error('[engine worker]', msg.message);
      this.onError?.(msg.message);
      return;
    }
  };

  private dispatchEngineEvent(m: WorkerEngineEventMsg): void {
    switch (m.kind) {
      case 'sfx':              audio.play(m.name as Parameters<typeof audio.play>[0]); break;
      case 'animal':           audio.playAnimal(m.name as Parameters<typeof audio.playAnimal>[0]); break;
      case 'soundStop':        audio.stop(m.name as Parameters<typeof audio.stop>[0]); break;
      case 'musicStart':       audio.playMusic(m.themeId); break;
      case 'musicStop':        audio.stopMusic(); break;
      case 'soundVolume':      audio.setVolume(m.name as Parameters<typeof audio.setVolume>[0], m.volume); break;
      case 'allGameSoundsStop': audio.stopAllGameSounds(); break;
      case 'paused':           audio.setPaused(m.paused); break;
      case 'resumeContext':    audio.resumeContext(); break;
      case 'preloadArena':     audio.preloadArena(m.arenaId); break;
      case 'haptic': {
        if (m.slot && haptics.isLocal(m.slot)) {
          if (m.flavor === 'landing' && typeof m.prevVy === 'number') haptics.landing(m.prevVy);
          else if (m.flavor === 'hitstop') haptics.hitstop();
        }
        break;
      }
      case 'phaseChange':      this.onPhaseChange?.(m.phase); break;
      case 'matchEnd':         this.onMatchEnd(m.winner, m.state ?? this.mirrorState ?? this.bootState); break;
      default: {
        // Exhaustiveness check: if a new kind is added to WorkerEngineEventMsg
        // without a case here, `m` won't narrow to `never` and TS errors.
        const _exhaustive: never = m;
        void _exhaustive;
      }
    }
  }
}

/** Build the boot MatchState. Placeholder shape so `getState()` /
 *  `getActiveCharacterNames()` answer synchronously before the first
 *  worker:engineStateMirror lands. The worker's Simulator is the source of
 *  truth — anything mutated here is overwritten on first mirror. */
function makeBootState(arena: Arena, activePlayers: PlayerSlot[], settings: MatchSettings): MatchState {
  const theme = getTheme(arena.themeId);
  const players = createInitialPlayers(activePlayers, arena, settings.mods.giantPlayers, Math.random);
  return createInitialMatchState(arena, theme, settings, players, activePlayers, Math.random);
}

/** Implements the IRenderer surface that matchLoading needs. Each call
 *  posts a host:* message to the worker. Returns the renderer plus a
 *  `clearWarmedNames` callback so `switchArena` can flush the pre-warm
 *  intent set when the roster changes. */
function makeRendererProxy(proxy: EngineWorkerProxy): { renderer: IRenderer; clearWarmedNames: () => void } {
  const worker = (proxy as unknown as { worker: Worker }).worker;
  const warmedNames = new Set<string>();
  const renderer: IRenderer = {
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
  return {
    renderer,
    clearWarmedNames: () => warmedNames.clear(),
  };
}
