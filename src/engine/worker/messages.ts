/**
 * Wire format for postMessage between main thread and the render worker.
 * Kept browser-pure (no DOM imports) so it compiles into both bundles.
 *
 * Direction is encoded by the type prefix:
 *   `host:*` — main → worker
 *   `worker:*` — worker → main
 *
 * The args of each `host:*` message are the structured-clone-able payload
 * for one Renderer method call. The worker hosts a real Renderer and
 * dispatches each message to the matching method. State for renderFrame is
 * shipped per frame; the heavy data (sprite caches, gradient caches,
 * fg-nature OffscreenCanvas) lives inside the worker's Renderer and never
 * crosses the wire.
 */

import type { MatchState, Particle, Gib, MatchSettings, PlayerSlot, InputState, MatchPhase, CharacterDef } from '../types';
import type { Light } from '../lighting';
import type { BotNavDebugState } from '../navDebugOverlay';
import type { NetDebugStats } from '../net/core/debugOverlay';

/** Initial handoff. Transferable canvases ride the `transfer` list. */
export interface HostInitMsg {
  type: 'host:init';
  bgCanvas: OffscreenCanvas;
  fgCanvas: OffscreenCanvas;
  hudCanvas: OffscreenCanvas | null;
  bgNightCanvas: OffscreenCanvas | null;
  lightCanvas: OffscreenCanvas | null;
  themeId: string;
  mirrored: boolean;
  timeLimit: number;
  renderScale: number;
  /** UI language code ('en' | 'cs' | 'hi' | 'fil') — set on hud module
   *  before the first frame so character-name lookups don't flash English
   *  for one frame. Updates after init via `host:setLanguage`. */
  language: string;
  /** When true, the worker enables `perfTrace` and ships per-second
   *  rollups (histogram + section snapshot + long-frame attribution)
   *  back to main. */
  perfEnabled: boolean;
}

export interface HostStopMsg { type: 'host:stop' }

export interface HostSetRenderScaleMsg { type: 'host:setRenderScale'; scale: number }
export interface HostSetBotNavDebugMsg { type: 'host:setBotNavDebug'; states: BotNavDebugState[] }
export interface HostSetNetDebugMsg { type: 'host:setNetDebug'; stats: NetDebugStats | null }
export interface HostSetPlayerNamesMsg { type: 'host:setPlayerNames'; names: Record<string, string> }
export interface HostSetTimeLimitMsg { type: 'host:setTimeLimit'; value: number }
export interface HostSetNetworkModeMsg { type: 'host:setNetworkMode'; isNetwork: boolean }
export interface HostSetConnectionQualityMsg { type: 'host:setConnectionQuality'; rtt: number; jitter: number }
export interface HostSetThemeMsg { type: 'host:setTheme'; themeId: string }
export interface HostSetLanguageMsg { type: 'host:setLanguage'; language: string }
export interface HostSetArenaLightsMsg { type: 'host:setArenaLights'; lights: ReadonlyArray<Light> }
export interface HostEmitLightBurstMsg { type: 'host:emitLightBurst'; x: number; y: number; kind: 'spawn' | 'stomp' }
export interface HostBakeGibsMsg { type: 'host:bakeGibs'; gibs: Gib[] }
export interface HostRenderBloodDripsMsg {
  type: 'host:renderBloodDrips';
  drips: Array<{ x: number; y: number; radius: number; color: string }>;
}
export interface HostRenderBackgroundMsg {
  type: 'host:renderBackground';
  arenaId: string;
  originalArenaId?: string;
}
export interface HostWarmSpriteCacheMsg { type: 'host:warmSpriteCache'; names: string[] }
export interface HostWarmHudFontsMsg { type: 'host:warmHudFonts' }

// ---- Sim-in-worker mode ('?simWorker=on') ----------------------------------
// In addition to the renderer the worker hosts the GameLoop. Main becomes
// a thin shell forwarding keyboard inputs and dispatching SFX/haptic events.

/** Bring up Simulator + GameLoop + Renderer inside the worker. Replaces
 *  HostInitMsg for sim-worker mode (engine includes init semantics). The
 *  same canvas transfers happen; in addition we ship the simulation params. */
export interface HostInitEngineMsg {
  type: 'host:initEngine';
  bgCanvas: OffscreenCanvas;
  fgCanvas: OffscreenCanvas;
  hudCanvas: OffscreenCanvas | null;
  bgNightCanvas: OffscreenCanvas | null;
  lightCanvas: OffscreenCanvas | null;
  arenaId: string;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  /** Slot → CharacterDef assignments resolved on main. The lobby UI mutates
   *  the `CHARACTERS` record and `assignBotCharacters` populates
   *  `BOT_CHARACTERS` per match — neither map crosses the worker boundary,
   *  so we ship the resolved pairs here and re-populate the worker-side
   *  registry before constructing the Simulator. */
  characters: Array<[PlayerSlot, CharacterDef]>;
  mirrored: boolean;
  renderScale: number;
  language: string;
  perfEnabled: boolean;
}

/** Per-frame input batch from main. The worker's RemoteInput adapters
 *  read this map; their existing usage in network play handles the
 *  same shape. */
export interface HostEngineInputBatchMsg {
  type: 'host:engineInputBatch';
  /** Encoded as flat array because Maps survive structured clone but
   *  array round-trip is a hair faster and matches the existing wire
   *  shape used in netMatch. */
  inputs: Array<[PlayerSlot, InputState]>;
}

export interface HostEnginePauseMsg { type: 'host:enginePause' }
export interface HostEngineResumeMsg { type: 'host:engineResume' }
export interface HostEngineSwitchArenaMsg { type: 'host:engineSwitchArena'; arenaId: string; settingsOverrides?: Partial<MatchSettings> }
export interface HostEngineSetPhaseMsg { type: 'host:engineSetPhase'; phase: MatchPhase }
export interface HostEngineSkipCountdownMsg { type: 'host:engineSkipCountdown' }
export interface HostRenderFrameMsg {
  type: 'host:renderFrame';
  state: MatchState;
  arenaId: string;
  particles: Particle[];
  cosmeticLead: number;
  // reactiveArg + wildlifeArg are NOT shipped: their per-instance `data`
  // can carry pack-supplied draw functions (notably `GroundCritterData.draw`)
  // which structured-clone rejects. The worker maintains its own local
  // ReactiveDecorationSystem + WildlifeSystem, ticked from the shipped
  // state, and renders from them.
  /** Frame-decay timers — the proxy ships them so the worker doesn't need
   *  to know about network mode. Same values the main-thread renderFrame
   *  decays before drawing. */
  slowMotion: number;
  screenFlash: number;
  hitstopZoom: number;
}

export type HostToWorkerMsg =
  | HostInitMsg
  | HostStopMsg
  | HostSetRenderScaleMsg
  | HostSetBotNavDebugMsg
  | HostSetNetDebugMsg
  | HostSetPlayerNamesMsg
  | HostSetTimeLimitMsg
  | HostSetNetworkModeMsg
  | HostSetConnectionQualityMsg
  | HostSetThemeMsg
  | HostSetLanguageMsg
  | HostSetArenaLightsMsg
  | HostEmitLightBurstMsg
  | HostBakeGibsMsg
  | HostRenderBloodDripsMsg
  | HostRenderBackgroundMsg
  | HostWarmSpriteCacheMsg
  | HostWarmHudFontsMsg
  | HostRenderFrameMsg
  | HostInitEngineMsg
  | HostEngineInputBatchMsg
  | HostEnginePauseMsg
  | HostEngineResumeMsg
  | HostEngineSwitchArenaMsg
  | HostEngineSetPhaseMsg
  | HostEngineSkipCountdownMsg;

export interface WorkerReadyMsg { type: 'worker:ready' }
export interface WorkerErrorMsg { type: 'worker:error'; message: string }
/** Fired when the worker's Renderer wants to update one of the night-tint
 *  DOM opacities. Main applies it to the corresponding HTMLElement.style. */
export interface WorkerNightOpacityMsg {
  type: 'worker:nightOpacity';
  kind: 'bg' | 'fg';
  opacity: number;
}

/** Histogram bucket width for the worker render-time distribution.
 *  HIST_BUCKET_COUNT × HIST_BUCKET_MS = 20 ms upper bound; anything above
 *  is clamped into the last bucket and counted toward `overflowFrames`. */
export const HIST_BUCKET_MS = 0.1;
export const HIST_BUCKET_COUNT = 200;

export interface WorkerLongFrameSample {
  /** Total renderFrame ms — exceeded the soft threshold. */
  ms: number;
  /** Worker-side perfTrace section sums for THAT frame only (not
   *  cumulative). Only populated when perfEnabled. */
  sections: Record<string, number>;
}

/** Periodic perf rollup pushed from worker → main. Replaces the older
 *  sum-only `worker:perfStats`. The harness reads via
 *  `window.__rendererProxy.getRenderStats()` to get the real per-frame
 *  cost distribution inside the worker — main-thread rAF measurements
 *  are vsync-paced once the canvases are transferred. */
export interface WorkerPerfStatsMsg {
  type: 'worker:perfStats';
  /** Number of renderFrame calls aggregated since last flush. */
  frames: number;
  /** Sum of renderer.renderFrame() ms over the flush window. */
  renderSumMs: number;
  /** Max single-frame render ms. */
  renderMaxMs: number;
  /** Sum of full message-handler ms (incl. cosmetic ticks + state copy). */
  handlerSumMs: number;
  /** Max single-frame handler ms. */
  handlerMaxMs: number;
  /** Histogram of per-frame renderFrame ms. Each bucket spans
   *  HIST_BUCKET_MS; index i covers [i × w, (i+1) × w). Frames > the
   *  upper bound are clamped to the last bucket and counted in
   *  `overflowFrames`. Plain array (structured-clone-safe; tiny). */
  histogram: number[];
  /** Frames whose renderFrame ms exceeded the histogram upper bound. */
  overflowFrames: number;
  /** Per-second snapshot of the worker's perfTrace state. Only populated
   *  when `perfEnabled` was set on init. Format matches main's
   *  perfTrace.snapshot() output. */
  sections?: Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }>;
  /** Frames that crossed the soft long-frame threshold (~12ms) since the
   *  last flush, with attribution from this-frame perfTrace section sums. */
  longFrames?: WorkerLongFrameSample[];
}

/** Engine-side events posted from the worker's GameLoop callbacks back to
 *  main. Main dispatches `audio` / haptic / phase-change / match-end. The
 *  union keeps wire shape compact; main's handler switches on `kind`. */
export interface WorkerEngineEventMsg {
  type: 'worker:engineEvent';
  kind:
    | 'sfx' | 'animal' | 'musicStart' | 'musicStop' | 'soundStop'
    | 'soundVolume' | 'allGameSoundsStop' | 'paused' | 'resumeContext'
    | 'preloadArena' | 'haptic'
    | 'phaseChange' | 'matchEnd';
  name?: string;
  themeId?: string;
  volume?: number;
  paused?: boolean;
  arenaId?: string;
  flavor?: 'landing' | 'hitstop';
  slot?: PlayerSlot;
  prevVy?: number;
  phase?: MatchPhase;
  winner?: PlayerSlot | null;
  /** Carried by `kind === 'matchEnd'`. Worker includes the final
   *  MatchState in the event so VictoryScreen never reads a stale
   *  bootState if matchEnd fires before the next 5Hz state mirror. */
  state?: MatchState;
}

/** Periodic state mirror for E2E (`window.__bunnyTest.state()`) and for
 *  Match.tsx's getActiveCharacterNames / getArena / etc. callsites that
 *  need a synchronous read on main. Posted at low frequency (~5Hz). */
export interface WorkerEngineStateMirrorMsg {
  type: 'worker:engineStateMirror';
  state: MatchState;
  arenaId: string;
}

export type WorkerToHostMsg =
  | WorkerReadyMsg
  | WorkerErrorMsg
  | WorkerNightOpacityMsg
  | WorkerPerfStatsMsg
  | WorkerEngineEventMsg
  | WorkerEngineStateMirrorMsg;
