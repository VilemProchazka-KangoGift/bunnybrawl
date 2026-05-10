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
import { setHudLanguage } from '../rendering/hud';
import { RemoteInput } from '../input/RemoteInput';
import { isBotSlot } from '../types';
import { FIXED_TIMESTEP, MAX_FRAME_TIME, SLOW_MO_FACTOR } from '../constants';
import { debugFlags } from '../debugFlags';
import type {
  HostInitEngineMsg, HostEngineInputBatchMsg,
  HostEngineSwitchArenaMsg, HostEngineSetPhaseMsg,
  WorkerEngineEventMsg, WorkerEngineStateMirrorMsg,
} from './messages';
import type { PlayerSlot, InputState, MatchPhase } from '../types';

const ctxScope = self as DedicatedWorkerGlobalScope;

let gameLoop: GameLoop | null = null;
let renderer: Renderer | null = null;
/** Per-frame input map — RemoteInput adapters read this map when fixedUpdate
 *  asks for each slot's action. Mirrors HostAuthority's getNetworkInputs(). */
const inputMap = new Map<PlayerSlot, InputState>();
let rafId = 0;
let running = false;
let paused = false;
let accumulator = 0;
let lastTime = 0;
let lastMirrorAt = 0;
const STATE_MIRROR_INTERVAL_MS = 200;  // 5Hz

function postEvent(ev: Omit<WorkerEngineEventMsg, 'type'>): void {
  const msg: WorkerEngineEventMsg = { type: 'worker:engineEvent', ...ev };
  ctxScope.postMessage(msg);
}

export function initEngine(msg: HostInitEngineMsg): void {
  registerBuiltinArenas();
  registerBuiltinCharacters();
  if (msg.perfEnabled) debugFlags.perfEnabled = true;
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

  const onMatchEnd = (winner: PlayerSlot | null /*, _state: MatchState */): void => {
    postEvent({ kind: 'matchEnd', winner });
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
  if (paused) {
    lastTime = currentTime;
    renderer.renderFrame(gameLoop.getState(), gameLoop.getArena(), [], 0);
    rafId = ctxScope.requestAnimationFrame(driveTick);
    return;
  }
  let frameTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  const state = gameLoop.getState();
  const timeScale = state.slowMotion > 0 ? SLOW_MO_FACTOR : 1;
  accumulator += frameTime * timeScale;

  while (accumulator >= FIXED_TIMESTEP) {
    gameLoop.fixedUpdate(FIXED_TIMESTEP, inputMap);
    accumulator -= FIXED_TIMESTEP;
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

  rafId = ctxScope.requestAnimationFrame(driveTick);
}

export function applyInputBatch(msg: HostEngineInputBatchMsg): void {
  inputMap.clear();
  for (const [slot, input] of msg.inputs) inputMap.set(slot, input);
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
}
