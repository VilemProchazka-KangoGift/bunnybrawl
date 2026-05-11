/// <reference lib="webworker" />
/**
 * Sim-in-worker init — dynamically imported by `renderWorker.ts` when a
 * `host:initEngine` message arrives. Lazy-loaded so the renderer-only
 * path (`?worker=on`, no `?simWorker=on`) doesn't pay for the GameLoop
 * imports.
 *
 * The GameLoop class works unchanged inside the worker thanks to the
 * `vite.config.ts > worker.plugins` aliases that swap `audio`, `haptics`,
 * `KeyboardManager`, and `touchDetect` for worker-safe stubs. The stubs
 * post events back to main where the real adapters dispatch.
 *
 * The worker drives its own RAF loop (workers can call requestAnimationFrame
 * when they hold an OffscreenCanvas via `transferControlToOffscreen`).
 */

import { GameLoop } from '../gameLoop';
import { Renderer } from '../renderer';
import { getArena, getTheme } from '../arenas/operations';
import { registerBuiltinArenas } from '../arenas/builtin';
import { registerBuiltinCharacters } from '../characters/builtin';
import { CHARACTERS, BOT_CHARACTERS } from '../characters/defaults';
import { setHudLanguage } from '../rendering/hud';
import { RemoteInput } from '../input/RemoteInput';
import { isBotSlot } from '../types';
import { FIXED_TIMESTEP, MAX_FRAME_TIME, SLOW_MO_FACTOR } from '../constants';
import { debugFlags } from '../debugFlags';
import type {
  HostInitEngineMsg, HostEngineInputBatchMsg,
  HostEngineSwitchArenaMsg, HostEngineSetPhaseMsg,
  WorkerEngineEventMsg, WorkerEngineStateMirrorMsg,
  WorkerNetSnapshotMsg,
} from './messages';
import type { PlayerSlot, BotSlot, CharacterSlot, InputState, MatchPhase } from '../types';
import { readSlotInput } from './sabInput';
import { takeAuthSnapshot, encodeSnapshot, decodeSnapshot, createEmptySnapshot } from '../net/snapshot';
import type { AuthSnapshot } from '../net/snapshot';
import { EntityInterpolation, applySnapshotToState } from '../net/interpolation';
import type { Simulator } from '../simulator/Simulator';
import { perfTrace } from '../perfTrace';
import { dumpSamples as dumpFpsSamples, resetFpsCounter, sampleFps } from '../fpsCounter';
import type { WorkerPerfStatsMsg } from './messages';

const ctxScope = self as DedicatedWorkerGlobalScope;

let gameLoop: GameLoop | null = null;
let renderer: Renderer | null = null;
/** Per-frame input map — RemoteInput adapters read this map when fixedUpdate
 *  asks for each slot's action. Mirrors HostAuthority's getNetworkInputs(). */
const inputMap = new Map<PlayerSlot, InputState>();
/** SAB-backed input reader (Step 2). When main allocates the SAB and
 *  ships it in `host:initEngine`, we install a typed view here and
 *  refresh `inputMap` at the top of each `driveTick`. Pre-allocated
 *  `InputState` objects are reused across ticks (the map references the
 *  same object every tick — RemoteInput only reads booleans). */
let inputSabView: Int32Array | null = null;
let inputSabSlots: PlayerSlot[] = [];
const inputSabScratch: InputState[] = [];
let rafId = 0;
let running = false;
let paused = false;
let accumulator = 0;
let lastTime = 0;
let lastMirrorAt = 0;
const STATE_MIRROR_INTERVAL_MS = 200;  // 5Hz

/** Perf-stats flush schedule (mirrors renderWorker.ts's renderer-only
 *  perfStats cadence). Posted as `worker:perfStats` so EngineWorkerProxy
 *  can expose the worker's fpsCounter / perfTrace state to the bench. */
let lastPerfFlushAt = 0;
const PERF_FLUSH_INTERVAL_MS = 1000;
const PERF_HISTOGRAM_STUB: number[] = [];

/** Phase 2 net-mode flag. 'off' = local-only (Phase 1 default); 'host' =
 *  encode + emit snapshots per fixedUpdate tick; 'guest' = decode + apply
 *  incoming snapshots (wired up by Task 12). */
type NetMode = 'off' | 'host' | 'guest';
let netMode: NetMode = 'off';
let hostFrame = 0;

/** Guest-side snapshot decode pool and interpolation engine. Constructed
 *  on transition into 'guest' mode; torn down on transition out so the
 *  module state matches a fresh match's expectations. */
const GUEST_POOL_SIZE = 30;
let guestInterp: EntityInterpolation | null = null;
let guestPool: AuthSnapshot[] = [];
let guestPoolIdx = 0;

export function setNetMode(mode: NetMode, _delayFrames = 0): void {
  netMode = mode;
  hostFrame = 0;
  // _delayFrames is consumed by EntityInterpolation's adaptive delay
  // tracker; the constructor doesn't take it currently. We accept it
  // here for the wire-level contract (HostNetSetModeMsg) and consume
  // it later if the interpolation engine grows an initial-delay knob.
  if (mode === 'guest') {
    guestInterp = new EntityInterpolation();
    guestPool = Array.from({ length: GUEST_POOL_SIZE }, () => createEmptySnapshot());
    guestPoolIdx = 0;
  } else {
    guestInterp = null;
    guestPool = [];
    guestPoolIdx = 0;
  }
}

/** Read-only for tests / debug overlay. */
export function getGuestInterpDepth(): number {
  return guestInterp?.getBufferDepth() ?? 0;
}

/** Read-only for tests. */
export function getNetMode(): NetMode { return netMode; }
export function getHostFrame(): number { return hostFrame; }

/** Snapshot + encode helper. Exported as a seam so Task 10's regression
 *  test can drive a Simulator without spawning a real worker. Returns a
 *  copied ArrayBuffer owned by the caller — safe to `transfer` to main. */
export function takeAndEncodeForHost(sim: Simulator): ArrayBuffer {
  hostFrame++;
  const snap = takeAuthSnapshot(hostFrame, sim.getState());
  const { buffer, length } = encodeSnapshot(snap);
  // .slice copies into a buffer the caller can transfer without disturbing
  // the codec's reusable scratch.
  return buffer.slice(0, length);
}

/** Distributive Omit so each variant in the union keeps its own
 *  required-fields shape (a plain `Omit<WorkerEngineEventMsg, 'type'>`
 *  collapses the union into a single intersection that loses
 *  per-variant required fields). */
type EventBody = WorkerEngineEventMsg extends infer T
  ? T extends { type: 'worker:engineEvent' } ? Omit<T, 'type'> : never
  : never;

function postEvent(ev: EventBody): void {
  ctxScope.postMessage({ type: 'worker:engineEvent', ...ev } as WorkerEngineEventMsg);
}

export function initEngine(msg: HostInitEngineMsg): void {
  registerBuiltinArenas();
  registerBuiltinCharacters();
  // Re-populate slot → CharacterDef mappings inside the worker. Main owns
  // the lobby UI that mutates these maps; without this rebuild the worker
  // would throw "No character assigned to bot slot Bx" inside
  // `createInitialPlayers` and the loading screen would hang.
  BOT_CHARACTERS.clear();
  for (const [slot, def] of msg.characters) {
    if (isBotSlot(slot)) {
      BOT_CHARACTERS.set(slot as BotSlot, def);
    } else {
      CHARACTERS[slot as CharacterSlot] = def;
    }
  }
  if (msg.perfEnabled) debugFlags.perfEnabled = true;
  if (msg.navDebugEnabled) { debugFlags.navDebugAllowed = true; debugFlags.navDebugEnabled = true; }
  if (msg.netDebugEnabled) { debugFlags.netDebugAllowed = true; debugFlags.netDebugEnabled = true; }
  if (msg.fpsEnabled)      { debugFlags.fpsAllowed = true;      debugFlags.fpsEnabled = true; }
  setHudLanguage(msg.language);

  const arena = getArena(msg.arenaId);
  const theme = getTheme(arena.themeId);
  renderer = new Renderer({
    bgCanvas: msg.bgCanvas,
    fgCanvas: msg.fgCanvas,
    hudCanvas: msg.hudCanvas ?? undefined,
    bgNightCanvas: msg.bgNightCanvas ?? undefined,
    lightCanvas: msg.lightCanvas ?? undefined,
    theme,
    mirrored: msg.mirrored,
    language: msg.language,
    nightOpacityCallback: (kind, opacity) => {
      // Sim-in-worker forwards night-opacity DOM updates the same way the
      // renderer-only proxy does.
      ctxScope.postMessage({ type: 'worker:nightOpacity', kind, opacity });
    },
  });
  renderer.setRenderScale(msg.renderScale);
  renderer.setTimeLimit(msg.settings.timeLimit);

  const onMatchEnd = (winner: PlayerSlot | null): void => {
    // Ship the final state alongside the event so main's VictoryScreen
    // never reads the placeholder bootState (the 5Hz mirror could race
    // matchEnd by up to 200ms — see review #19).
    const state = gameLoop?.getState();
    postEvent({ kind: 'matchEnd', winner, state });
  };

  // Construct GameLoop with the worker-hosted Renderer injected. The
  // canvas args are required by the constructor signature but ignored
  // when injectedRenderer is provided.
  // The OffscreenCanvas → HTMLCanvasElement cast is intentional and safe
  // because the canvases are only used inside the bypassed branch.
  gameLoop = new GameLoop(
    msg.bgCanvas as unknown as HTMLCanvasElement,
    msg.fgCanvas as unknown as HTMLCanvasElement,
    arena,
    msg.settings,
    msg.activePlayers,
    onMatchEnd,
    msg.hudCanvas as unknown as HTMLCanvasElement | undefined,
    undefined,  // rng — local play
    msg.bgNightCanvas as unknown as HTMLCanvasElement | undefined,
    undefined,  // fgNightTint — DOM div, stays on main
    msg.lightCanvas as unknown as HTMLCanvasElement | undefined,
    renderer,
  );

  // Replace KeyboardInput-backed slots with RemoteInput so per-slot
  // actions come from inputMap (filled by host:engineInputBatch). Bots
  // keep their RuleBasedBot.
  const sim = gameLoop.getSimulator();
  for (const player of sim.getState().players) {
    if (isBotSlot(player.id)) continue;
    sim.setPlayerInput(player.id, new RemoteInput(player.id));
  }

  gameLoop.setOnPhaseChange((phase: MatchPhase) => {
    postEvent({ kind: 'phaseChange', phase });
  });

  // Install the SAB input reader (Step 2). The fallback path keeps
  // working when main couldn't allocate a SAB (no crossOriginIsolated).
  if (msg.inputSab && msg.inputSabSlots) {
    inputSabView = new Int32Array(msg.inputSab);
    inputSabSlots = msg.inputSabSlots;
    inputSabScratch.length = 0;
    for (let i = 0; i < inputSabSlots.length; i++) {
      const slot = inputSabSlots[i];
      const obj: InputState = { left: false, right: false, jump: false, down: false };
      inputSabScratch.push(obj);
      inputMap.set(slot, obj);
    }
  }

  // We start `running` here so the drive loop fires; we do NOT call
  // gameLoop.start() because that would attach the (stubbed) keyboard
  // manager and run the main rAF loop. We drive it ourselves.
  running = true;
  paused = false;
  lastTime = performance.now();
  rafId = ctxScope.requestAnimationFrame(driveTick);
}

function driveTick(currentTime: number): void {
  if (!running || !gameLoop || !renderer) return;
  // GameLoop.loop() owns the sampleFps call in main-thread mode; we drive
  // the worker's loop manually, so feed fpsCounter directly. No-op when
  // `debugFlags.fpsEnabled` is false (the perf bench sets it via the URL).
  sampleFps(currentTime);
  if (paused) {
    lastTime = currentTime;
    renderer.renderFrame(gameLoop.getState(), gameLoop.getArena(), [], 0);
    rafId = ctxScope.requestAnimationFrame(driveTick);
    return;
  }
  let frameTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  // SAB input fast path — refresh per-slot bitfields once per visual
  // frame. The inner fixedUpdate loop may iterate multiple times per
  // frame on long frames; consuming the same bitfield across those
  // iterations is fine — the postMessage path had the same property.
  if (inputSabView) {
    for (let i = 0; i < inputSabSlots.length; i++) {
      readSlotInput(inputSabView, i, inputSabScratch[i]);
    }
  }

  const state = gameLoop.getState();
  const timeScale = state.slowMotion > 0 ? SLOW_MO_FACTOR : 1;
  accumulator += frameTime * timeScale;

  if (netMode === 'guest') {
    // Guest doesn't fixedUpdate — sim authority lives on the host. We apply
    // the latest interpolated snapshot so cosmetic systems (which read
    // state via state-transition detection) see a coherent world. The
    // accumulator is intentionally NOT advanced; clear it so a netMode
    // flip doesn't leak frames of work into the next branch.
    accumulator = 0;
    const snap = guestInterp?.getInterpolatedState();
    if (snap) applySnapshotToState(snap, state);
  } else {
    while (accumulator >= FIXED_TIMESTEP) {
      gameLoop.fixedUpdate(FIXED_TIMESTEP, inputMap);
      accumulator -= FIXED_TIMESTEP;
      // Host net mode: encode + post snapshot per fixedUpdate so the host's
      // 60Hz broadcast cadence rides off the simulation tick, not main's rAF.
      // Main pumps the buffer into HostAuthority.broadcastEncodedSnapshot
      // which respects per-peer broadcast tier + delta bypass.
      if (netMode === 'host') {
        const buf = takeAndEncodeForHost(gameLoop.getSimulator());
        const msg: WorkerNetSnapshotMsg = { type: 'worker:netSnapshot', buffer: buf, frame: hostFrame };
        ctxScope.postMessage(msg, [buf]);
      }
    }
  }

  gameLoop.tickCosmetic(FIXED_TIMESTEP);

  // Frame-decay timers. Mirrors the main-thread loop()'s hand-off block.
  if (state.slowMotion > 0) state.slowMotion = Math.max(0, state.slowMotion - frameTime);
  if (state.screenFlash > 0) state.screenFlash = Math.max(0, state.screenFlash - frameTime);
  if (state.hitstopZoom > 0) state.hitstopZoom = Math.max(0, state.hitstopZoom - frameTime);
  if (state.matchOver) gameLoop.particleSystem.updateFireworks(frameTime);

  gameLoop.particleSystem.bakeToRenderer(renderer);
  gameLoop.renderFrame(frameTime);

  // Periodic state mirror back to main for E2E.
  if (currentTime - lastMirrorAt >= STATE_MIRROR_INTERVAL_MS) {
    lastMirrorAt = currentTime;
    const mirror: WorkerEngineStateMirrorMsg = {
      type: 'worker:engineStateMirror',
      state,
      arenaId: gameLoop.getArena().id,
    };
    ctxScope.postMessage(mirror);
  }

  // Periodic perf flush. Lets the bench read worker-side fpsCounter +
  // perfTrace state via `__fpsCounter` / `__perfTrace` shims that
  // EngineWorkerProxy installs on main.
  if (currentTime - lastPerfFlushAt >= PERF_FLUSH_INTERVAL_MS) {
    lastPerfFlushAt = currentTime;
    const m: WorkerPerfStatsMsg = {
      type: 'worker:perfStats',
      // The histogram + render-time fields belong to renderWorker.ts's
      // renderer-only path. Sim-in-worker doesn't separately time render
      // (the GameLoop's perfTrace sections cover it). Stub to keep
      // RendererProxy's accumulator type-safe.
      frames: 0,
      renderSumMs: 0,
      renderMaxMs: 0,
      handlerSumMs: 0,
      handlerMaxMs: 0,
      histogram: PERF_HISTOGRAM_STUB,
      overflowFrames: 0,
    };
    if (debugFlags.perfEnabled) m.sections = perfTrace.snapshot();
    if (debugFlags.fpsEnabled) m.fpsSamples = dumpFpsSamples();
    ctxScope.postMessage(m);
  }

  rafId = ctxScope.requestAnimationFrame(driveTick);
}

/** Pure helper: replace `target` Map contents from a per-slot list. Slots
 *  absent from the list are evicted. Phase 2 introduces an out-of-worker
 *  caller (the netmatch async path), so the seam is extracted from
 *  `applyInputBatch` for testability. */
export function applyInputBatchTo(
  target: Map<PlayerSlot, InputState>,
  inputs: ReadonlyArray<readonly [PlayerSlot, InputState]>,
): void {
  target.clear();
  for (const [slot, input] of inputs) target.set(slot, input);
}

export function applyInputBatch(msg: HostEngineInputBatchMsg): void {
  applyInputBatchTo(inputMap, msg.inputs);
}

export function pauseEngine(): void {
  if (!gameLoop) return;
  paused = true;
  gameLoop.pause();
}

export function resumeEngine(): void {
  if (!gameLoop) return;
  paused = false;
  lastTime = performance.now();
  gameLoop.resume();
}

export function switchArenaInWorker(msg: HostEngineSwitchArenaMsg): void {
  if (!gameLoop) return;
  gameLoop.switchArena(msg.arenaId, msg.settingsOverrides);
}

export function setPhaseInWorker(msg: HostEngineSetPhaseMsg): void {
  if (!gameLoop) return;
  gameLoop.setPhase(msg.phase);
}

/** Reset perfTrace + fpsCounter rings. Used by the perf bench between
 *  countdown and steady-state capture so accumulated sections / dts
 *  don't include startup noise. */
export function resetPerfStats(): void {
  perfTrace.reset();
  resetFpsCounter();
}

export function skipCountdownInWorker(): void {
  if (!gameLoop) return;
  gameLoop.skipCountdown();
}

export function stopEngine(): void {
  running = false;
  if (rafId) ctxScope.cancelAnimationFrame(rafId);
  rafId = 0;
  gameLoop?.stop();
  gameLoop = null;
  renderer = null;
  inputMap.clear();
  netMode = 'off';
  hostFrame = 0;
}

// ---- Phase 2: NetMatch async fixedUpdate handlers --------------------------

/** Guest-only. Main strips the Trystero 1-byte type prefix before posting,
 *  so we decode from offset 0. The decode reuses one of GUEST_POOL_SIZE
 *  AuthSnapshot instances — matches the interpolation ring depth so the
 *  slot we're about to overwrite has already been evicted from the ring. */
export function applyIncomingSnapshot(buffer: ArrayBuffer): void {
  if (netMode !== 'guest' || !guestInterp || buffer.byteLength === 0) return;
  const out = guestPool[guestPoolIdx];
  guestPoolIdx = (guestPoolIdx + 1) % GUEST_POOL_SIZE;
  const snap = decodeSnapshot(buffer, 0, out);
  if (snap) guestInterp.pushSnapshot(snap);
}

/** Host posts this when a peer's grace timer expires. The sim's
 *  `disconnectPlayer` already handles state.disconnected + player.active. */
export function disconnectSlotInWorker(slot: PlayerSlot): void {
  if (!gameLoop) return;
  gameLoop.getSimulator().disconnectPlayer(slot);
}

/** Host posts this on a successful RECONNECT_REQUEST. */
export function reconnectSlotInWorker(slot: PlayerSlot): void {
  gameLoop?.getSimulator().reconnectPlayer(slot);
}

/** Used by `renderWorker.ts` to route IRenderer-shaped messages
 *  (`host:warmSpriteCache`, `host:renderBackground`, `host:warmHudFonts`,
 *  …) to the engine-mode Renderer. Without this hook the messages would
 *  fall into the renderer-only dispatch and be dropped because that
 *  module's `renderer` is null in sim-worker mode. */
export function getEngineRenderer(): Renderer | null {
  return renderer;
}
