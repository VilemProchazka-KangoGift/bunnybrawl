import type {
  MatchState, MatchSettings, Arena, PlayerSlot, CharacterSlot,
  InputState, MatchPhase,
} from '../types';
import { isBotSlot } from '../types';
import { SeededRNG } from '../net/prng';
import { takeSnapshot as _takeSnapshot, restoreSnapshot as _restoreSnapshot } from '../net/serialize';
import type { GameSnapshot } from '../net/serialize';
import { KeyboardManager } from '../input/KeyboardManager';
import { KeyboardInput } from '../input/KeyboardInput';
import { RuleBasedBot } from '../input/RuleBasedBot';
import { RemoteInput } from '../input/RemoteInput';
import type { PlayerInput } from '../input/PlayerInput';
import { TouchInputManager } from '../touchInput';
import { isTouchPrimary } from '../touchDetect';
import { haptics } from '../haptics';
import { Renderer, type IRenderer } from '../renderer';
import { subscribeRenderScale } from '../renderScale';
import { audio } from '../audio';
import {
  FIXED_TIMESTEP, MAX_FRAME_TIME,
  CANVAS_WIDTH,
  SLOW_MO_FACTOR,
} from '../constants';
import { AIController } from '../ai';
import { Simulator } from '../simulator/Simulator';
import { debugFlags, toggleNavDebug, toggleNetDebug, toggleFpsDebug } from '../debugFlags';
import { perfTrace } from '../perfTrace';
import { getSlowDevice } from '../perfFlags';
import { sampleFps } from '../fpsCounter';
import * as autoSlowDetect from '../autoSlowDetect';
import type { BotNavDebugState } from '../navDebugOverlay';
import type { NetDebugStats } from '../net/core/debugOverlay';

import { EnvironmentSystem } from './cosmetics/EnvironmentSystem';
import { EntityTransitionSystem } from './cosmetics/EntityTransitionSystem';
import { ParticleSystem } from './cosmetics/ParticleSystem';
import { PlayerTransitionSystem } from './cosmetics/PlayerTransitionSystem';
import { PlayerCosmeticSystem } from './cosmetics/PlayerCosmeticSystem';
import { SurfaceImpactSystem } from './cosmetics/SurfaceImpactSystem';
import { HUDFeedbackSystem } from './cosmetics/HUDFeedbackSystem';
import { ReactiveDecorationSystem } from './cosmetics/ReactiveDecorationSystem';
import type { ReactiveInstance, ReactiveRenderArg } from './cosmetics/reactiveDecorations';
import { WildlifeSystem } from './cosmetics/WildlifeSystem';
import type { WildlifeRenderArg } from './cosmetics/wildlife';

/** Half-rate cosmetic threshold: particles/SFX/VFX tick at ~30Hz while render stays at 60Hz. */
const COSMETIC_INTERVAL = FIXED_TIMESTEP * 2;
/** Slow-device threshold: ~20Hz. Renderer extrapolates from velocity so the smoothness gap is small. */
const COSMETIC_INTERVAL_SLOW = FIXED_TIMESTEP * 3;
/** Cap per-step cosmetic dt so tab-switch recovery doesn't dump seconds of work into one step. */
const COSMETIC_MAX_STEP = FIXED_TIMESTEP * 4;

export type MatchEndCallback = (winner: PlayerSlot | null, state: MatchState) => void;

export class GameLoop {
  private simulator: Simulator;
  private keyboardManager: KeyboardManager;
  private renderer: IRenderer;
  private onMatchEnd: MatchEndCallback;

  private lastTime = 0;
  private accumulator = 0;
  private rafId = 0;
  private running = false;
  private stopped = false;
  private paused = false;

  particleSystem!: ParticleSystem;
  private environmentSystem!: EnvironmentSystem;
  private entityTransitionSystem!: EntityTransitionSystem;
  private playerTransitionSystem!: PlayerTransitionSystem;
  private playerCosmeticSystem!: PlayerCosmeticSystem;
  private surfaceImpactSystem!: SurfaceImpactSystem;
  private hudFeedbackSystem!: HUDFeedbackSystem;
  private reactiveDecorationSystem!: ReactiveDecorationSystem;
  private wildlifeSystem!: WildlifeSystem;

  private _debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _unsubRenderScale: (() => void) | null = null;

  private touchInput: TouchInputManager | null = null;
  private touchSlot: PlayerSlot | null = null;

  private _networkMode = false;

  private onPhaseChange?: (phase: MatchPhase) => void;

  private _cosmeticLead = 0;
  private _cosmeticTick = 0;

  /** True when an external renderer (RendererProxy) was injected. The worker
   *  hosts its own copies of `WildlifeSystem` and the per-frame
   *  reactive/wildlife render args, so main can skip:
   *   - WildlifeSystem.cosmeticUpdate (purely visual; no burst callbacks)
   *   - building the per-frame reactive/wildlife arg objects (proxy strips them)
   *  Reactive's tick stays on main because its burst → particle-emit path
   *  fires from `applyStompImpulse` → `cosmeticUpdate`, and ParticleSystem
   *  lives on main. */
  private _workerActive = false;

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: PlayerSlot[],
    onMatchEnd: MatchEndCallback,
    hudCanvas?: HTMLCanvasElement,
    rng?: SeededRNG,
    bgNightCanvas?: HTMLCanvasElement,
    fgNightTint?: HTMLDivElement,
    lightCanvas?: HTMLCanvasElement,
    /** When provided, GameLoop adopts this renderer instead of constructing
     *  a fresh main-thread `Renderer` from the canvas args. Used by the
     *  worker-offload path: Match.tsx builds a `RendererProxy` (which has
     *  already transferred the canvas drawing surfaces to a Web Worker) and
     *  hands it in. The bg/fg/etc. canvas args are ignored in that case. */
    injectedRenderer?: IRenderer,
  ) {
    this.onMatchEnd = onMatchEnd;
    this.keyboardManager = new KeyboardManager();

    this.simulator = new Simulator({
      arena,
      settings,
      activePlayers,
      rng,
      events: {
        onSfxRequest: (name) => this.playSound(name),
        onMusicStartRequest: (themeId) => audio.playMusic(themeId),
        onMusicStopRequest: () => audio.stopMusic(),
        onSoundStopRequest: (name) => audio.stop(name),
        onSoundVolumeRequest: (name, volume) => audio.setVolume(name, volume),
        onAllGameSoundsStopRequest: () => audio.stopAllGameSounds(),
        onPhaseChange: (phase) => this._handlePhaseChange(phase),
        onMatchEnd: (winner) => this._handleMatchEnd(winner),
        onPlayerLanding: (slot, prevVy) => { if (haptics.isLocal(slot)) haptics.landing(prevVy, slot); },
        onStompHaptic: (slot) => { if (haptics.isLocal(slot)) haptics.hitstop(slot); },
      },
    });

    if (injectedRenderer) {
      // Worker-offload path: the proxy already holds the offscreen canvases
      // and is wired to its worker. Tell it our settings; canvas args are
      // unused.
      this.renderer = injectedRenderer;
      this._workerActive = true;
    } else {
      this.renderer = new Renderer({
        bgCanvas,
        fgCanvas,
        theme: this.simulator.getTheme(),
        mirrored: settings.mods.mirrorArena,
        hudCanvas,
        bgNightCanvas,
        fgNightTint,
        lightCanvas,
      });
    }
    this.renderer.setTimeLimit(settings.timeLimit);

    // ParticleSystem references the simulator's state/arena/theme/settings and
    // ArenaEntitySystem.geyserIndexMap. Construct it after the simulator so its
    // refs are stable, then swap it onto the simulator.
    const sState = this.simulator.getState();
    const sArena = this.simulator.getArena();
    const sTheme = this.simulator.getTheme();
    this.particleSystem = new ParticleSystem(
      sState, sArena, sTheme, settings,
      this.simulator.getArenaEntitySystem().getGeyserIndexMap(),
    );
    this.simulator.setParticleEmitter(this.particleSystem);

    // Cosmetic systems — own particle/transition baselines on the browser side.
    // ReactiveDecorationSystem must be constructed before PlayerTransitionSystem
    // so we can pass its applyStompImpulse as the onStomp callback.
    this.reactiveDecorationSystem = new ReactiveDecorationSystem(
      sState, sArena,
      (instance, _arena) => this._emitReactiveBurst(instance),
    );
    if (sTheme.buildReactiveDecorations) {
      this.reactiveDecorationSystem.setInstances(sTheme.buildReactiveDecorations(sArena));
    }

    this.wildlifeSystem = new WildlifeSystem(sState, sArena);
    if (sTheme.buildWildlife) {
      this.wildlifeSystem.setInstances(sTheme.buildWildlife(sArena));
    }

    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => audio.playAnimal(name),
      this.particleSystem,
      (x, y) => this.reactiveDecorationSystem.applyStompImpulse(x, y),
      (x, y, kind) => this.renderer.emitLightBurst(x, y, kind),
    );
    this.playerCosmeticSystem = new PlayerCosmeticSystem(
      sState, this.simulator.getEffWalkSpeed(), this.particleSystem,
      (name) => this.playSound(name),
      sArena,
    );
    this.environmentSystem = new EnvironmentSystem(sState, sTheme);
    this.entityTransitionSystem = new EntityTransitionSystem(sState, (name) => this.playSound(name));
    this.surfaceImpactSystem = new SurfaceImpactSystem(sState, sArena);
    this.hudFeedbackSystem = new HUDFeedbackSystem(sState);

    // Cooldowns map lives on PlayerTransitionSystem — wire it back into the simulator
    // for the headbonk + crouch + zero-G sound paths in fixedUpdate.
    // The lazy `() => this.playerTransitionSystem.getSfxCooldowns()` indirection
    // means subsequent playerTransitionSystem replacements (e.g. switchArena)
    // are picked up automatically — no need to re-call setSfxCooldownsGetter.
    this.simulator.setSfxCooldownsGetter(() => this.playerTransitionSystem.getSfxCooldowns());

    this.playerTransitionSystem.init();
    this.entityTransitionSystem.init();
    this.hudFeedbackSystem.init();

    // PlayerInput dispatch: KeyboardInput for humans, RuleBasedBot for bots.
    // Must run after the simulator constructor (arena/state are final) and
    // before fixedUpdate consumes them.
    for (const player of sState.players) {
      if (isBotSlot(player.id)) {
        const ai = this.simulator.getAIControllers().get(player.id)!;
        this.simulator.setPlayerInput(player.id, new RuleBasedBot(
          player.id,
          ai,
          sArena,
          settings.mods.carrotChase,
          settings.mods.mirrorArena,
        ));
      } else {
        this.simulator.setPlayerInput(player.id, new KeyboardInput(
          player.id as CharacterSlot,
          this.keyboardManager,
        ));
      }
    }

    // Touch input for mobile: controls the first human player.
    if (isTouchPrimary()) {
      this.touchInput = new TouchInputManager();
      this.touchSlot = activePlayers.find(s => !isBotSlot(s)) ?? null;
      if (this.touchSlot) {
        haptics.init(this.touchSlot);
        this.simulator.setTouchInput(this.touchInput, this.touchSlot);
      }
    }
  }

  start(): void {
    this.keyboardManager.attach();
    if (this.touchInput) {
      const container = document.querySelector('.game-scaler-content') as HTMLElement | null;
      if (container) {
        const scaleFn = () => container.getBoundingClientRect().width / CANVAS_WIDTH;
        this.touchInput.attach(container, scaleFn, () => this.paused);
      }
    }
    this._unsubRenderScale = subscribeRenderScale((s) => this.renderer.setRenderScale(s));
    autoSlowDetect.start();
    this.running = true;
    this.lastTime = performance.now();
    if (debugFlags.navDebugAllowed || debugFlags.netDebugAllowed || debugFlags.fpsAllowed) {
      this._debugKeyHandler = (e: KeyboardEvent) => {
        if (e.key === '`') {
          if (debugFlags.navDebugAllowed) toggleNavDebug();
          if (debugFlags.netDebugAllowed) toggleNetDebug();
          if (debugFlags.fpsAllowed) toggleFpsDebug();
        }
      };
      window.addEventListener('keydown', this._debugKeyHandler);
    }
    if (!this._networkMode) {
      this.loop(this.lastTime);
    }
  }

  stop(): void {
    this.running = false;
    this.stopped = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.keyboardManager.detach();
    this.touchInput?.detach();
    audio.stopAllGameSounds();
    this.simulator.cleanup();
    this._cosmeticLead = 0;
    this._cosmeticTick = 0;
    autoSlowDetect.stop();
    if (this._debugKeyHandler) {
      window.removeEventListener('keydown', this._debugKeyHandler);
      this._debugKeyHandler = null;
    }
    if (this._unsubRenderScale) {
      this._unsubRenderScale();
      this._unsubRenderScale = null;
    }
  }

  /** Play a sound (thin indirection used by cosmetic systems). */
  private playSound(name: string): void {
    audio.play(name as Parameters<typeof audio.play>[0]);
  }

  private _emitReactiveBurst(instance: ReactiveInstance): void {
    if (!instance.burst) return;
    // Spawn `count` particles using the kind's burst color/style. For PR 1
    // we keep this minimal: small petal-shaped fragments above the instance.
    // Future tasks can extend per-particleKind styling.
    const { count, particleKind } = instance.burst;
    const cx = instance.pos.x;
    const cy = instance.pos.y - 8;
    const color = particleKind === 'leaf' ? '#5a8f3a'
                : particleKind === 'petal' ? '#ffb3d9'
                : '#cccccc';
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const speed = 50 + Math.random() * 80;
      const life = 0.6 + Math.random() * 0.5;
      this.particleSystem.emitParticle(
        cx, cy,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        life, 1.5 + Math.random() * 1.5, color,
      );
    }
  }

  /** Set a seeded PRNG for deterministic network play. */
  setRng(rng: SeededRNG): void {
    this.simulator.setRng(rng);
  }

  /** Get the current RNG (for snapshots). */
  getRng(): SeededRNG | undefined {
    return this.simulator.getRng();
  }

  /** Get the AI RNG (for snapshots). */
  getAiRng(): SeededRNG | undefined {
    return this.simulator.getAiRng();
  }

  /** Get AI controllers map (for snapshots). */
  getAIControllers(): Map<string, AIController> {
    return this.simulator.getAIControllers();
  }

  /** Get the underlying Simulator (for tests + adapter wiring). */
  getSimulator(): Simulator {
    return this.simulator;
  }

  /** Read-only accessor for the unified PlayerInput dispatch map.
   *  Used by tests and (in Task 3.x) the future Simulator integration. */
  getPlayerInputs(): ReadonlyMap<PlayerSlot, PlayerInput> {
    return this.simulator.getPlayerInputs();
  }

  /** Read merged input from all key bindings + touch (for online play). */
  getInputAny(): InputState {
    const kb = this.keyboardManager.readAny();
    if (this.touchInput) {
      const touchPlayer = this.touchSlot
        ? this.simulator.getState().players.find(p => p.id === this.touchSlot)
        : null;
      const airborne = touchPlayer?.state === 'airborne';
      const ti = this.touchInput.getInputForPlayer(airborne);
      return {
        left: kb.left || ti.left,
        right: kb.right || ti.right,
        jump: kb.jump || ti.jump,
        down: kb.down || ti.down,
      };
    }
    return kb;
  }

  /** Enable network mode: external code drives the loop.
   *
   *  Swaps the per-slot PlayerInput so every human slot reads from
   *  `ctx.networkInputs` via RemoteInput (was: keyboard / touch reads).
   *  Bot slots keep their RuleBasedBot — the host's AI generates their
   *  inputs locally and they're not in the network buffer. The mobile-host
   *  touch slot is also moved to RemoteInput; the host loop already merges
   *  keyboard + touch into the network buffer via getInputAny, so the touch
   *  signal flows through that single path. On disable, we restore
   *  KeyboardInput / re-install TouchAdapter as appropriate. */
  setNetworkMode(enabled: boolean): void {
    if (this._networkMode === enabled) {
      this.renderer.setNetworkMode(enabled);
      return;
    }
    this._networkMode = enabled;
    this.renderer.setNetworkMode(enabled);
    for (const player of this.simulator.getState().players) {
      if (isBotSlot(player.id)) continue; // bots stay on RuleBasedBot
      if (enabled) {
        this.simulator.setPlayerInput(player.id, new RemoteInput(player.id));
      } else if (player.id === this.touchSlot && this.touchInput) {
        // Restore TouchAdapter via setTouchInput's bookkeeping.
        this.simulator.setTouchInput(this.touchInput, this.touchSlot);
      } else {
        this.simulator.setPlayerInput(player.id, new KeyboardInput(
          player.id as CharacterSlot, this.keyboardManager,
        ));
      }
    }
  }

  /** Register a callback that fires whenever the match phase changes. */
  setOnPhaseChange(cb: (phase: MatchPhase) => void): void {
    this.onPhaseChange = cb;
  }

  /** Snapshot the current loading-session generation. */
  getLoadingGeneration(): number {
    return this.simulator.getLoadingGeneration();
  }

  /** Transition the match to a new phase. */
  setPhase(phase: MatchPhase): void {
    this.simulator.setPhase(phase);
  }

  /** Side effects that fire on the loading→playing edge. Called by NetMatch's
   *  snapshot-driven phase tracker on the guest path (where the simulator's
   *  setPhase isn't called — phase is mutated directly by applySnapshotToState).
   *  Mirrors what Simulator.setPhase('playing') does for the host. */
  onEnterPlayingPhase(): void {
    audio.playMusic(this.simulator.getArena().themeId);
    this.simulator.initMatchSystem();
    this.resetCosmeticBaselines();
    this._cosmeticLead = 0;
    this._cosmeticTick = 0;
  }

  /** Swap to a different arena in place. */
  switchArena(arenaId: string, settingsOverrides?: Partial<MatchSettings>): void {
    this.simulator.switchArena(arenaId, settingsOverrides);
    // Cosmetic + renderer wiring needs the new arena/theme/state refs.
    // The simulator Object.assign'd into the existing state, but cosmetic
    // systems captured the prior arena/theme references; rebuild them.
    const sState = this.simulator.getState();
    const sArena = this.simulator.getArena();
    const newTheme = this.simulator.getTheme();
    const settings = this.simulator.getSettings();

    this.renderer.setTheme(newTheme);
    this.renderer.setTimeLimit(settings.timeLimit);

    this.particleSystem = new ParticleSystem(
      sState, sArena, newTheme, settings,
      this.simulator.getArenaEntitySystem().getGeyserIndexMap(),
    );
    this.simulator.setParticleEmitter(this.particleSystem);

    this.reactiveDecorationSystem = new ReactiveDecorationSystem(
      sState, sArena,
      (instance, _arena) => this._emitReactiveBurst(instance),
    );
    if (newTheme.buildReactiveDecorations) {
      this.reactiveDecorationSystem.setInstances(newTheme.buildReactiveDecorations(sArena));
    }

    this.wildlifeSystem = new WildlifeSystem(sState, sArena);
    if (newTheme.buildWildlife) {
      this.wildlifeSystem.setInstances(newTheme.buildWildlife(sArena));
    }

    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => audio.playAnimal(name),
      this.particleSystem,
      (x, y) => this.reactiveDecorationSystem.applyStompImpulse(x, y),
      (x, y, kind) => this.renderer.emitLightBurst(x, y, kind),
    );
    this.playerCosmeticSystem = new PlayerCosmeticSystem(
      sState, this.simulator.getEffWalkSpeed(), this.particleSystem,
      (name) => this.playSound(name),
      sArena,
    );
    this.environmentSystem = new EnvironmentSystem(sState, newTheme);
    this.entityTransitionSystem = new EntityTransitionSystem(sState, (name) => this.playSound(name));
    this.surfaceImpactSystem = new SurfaceImpactSystem(sState, sArena);
    this.hudFeedbackSystem = new HUDFeedbackSystem(sState);

    this.playerTransitionSystem.init();
    this.entityTransitionSystem.init();
    this.surfaceImpactSystem.init();
    this.hudFeedbackSystem.init();

    // Drain leftover cosmetic lead so the first cosmeticStep after new arena
    // load doesn't run against residual time from the prior arena.
    this._cosmeticLead = 0;
    this._cosmeticTick = 0;
  }

  /** Get the renderer instance. */
  getRenderer(): IRenderer {
    return this.renderer;
  }

  /** Reactive decoration system accessor (used by Renderer to draw instances). */
  getReactiveDecorationSystem(): ReactiveDecorationSystem {
    return this.reactiveDecorationSystem;
  }

  /** Wildlife system accessor (used by tests + Renderer). */
  getWildlifeSystem(): WildlifeSystem {
    return this.wildlifeSystem;
  }

  /** Get the (possibly mirrored) arena. */
  getArena(): Arena {
    return this.simulator.getArena();
  }

  /** Get the un-mirrored arena. */
  getOriginalArena(): Arena {
    return this.simulator.getOriginalArena();
  }

  /** Get the list of character names active in this match (including bots). */
  getActiveCharacterNames(): string[] {
    return this.simulator.getState().players.map(p => p.character.name);
  }

  /** Update net debug stats (forwarded to renderer for overlay). */
  setNetDebugStats(stats: NetDebugStats | null): void {
    this.renderer.setNetDebugStats(stats);
  }

  /** Set custom player display names for online mode. */
  setPlayerNames(names: Record<string, string>): void {
    this.renderer.setPlayerNames(names);
  }

  /** Update connection quality stats for online guest HUD indicator. */
  setConnectionQuality(rtt: number, jitter: number): void {
    this.renderer.setConnectionQuality(rtt, jitter);
  }

  /** Override the touch input slot (for online guest who is P2, not P1). */
  setLocalSlot(slot: PlayerSlot): void {
    this.touchSlot = slot;
    if (this.touchInput && slot) {
      haptics.init(slot);
      this.simulator.setTouchInput(this.touchInput, slot);
    }
  }

  /** Mark a player as disconnected. */
  disconnectPlayer(slot: PlayerSlot): void {
    this.simulator.disconnectPlayer(slot);
  }

  // ---- Phase 2 NetMatchDriver hooks (local-sim no-ops) -------------------
  // GameLoop runs the sim inline; the Phase 2 worker-routing hooks are
  // no-ops on this implementation. Both GameLoop and EngineWorkerProxy
  // satisfy NetMatchDriver; HostLoop / GuestLoop branch on isRemoteSim().

  isRemoteSim(): boolean { return false; }
  postInputBatch(_inputs: ReadonlyMap<PlayerSlot, InputState>): void { /* no-op */ }
  onSnapshotReady(_cb: (buffer: ArrayBuffer, frame: number) => void): void { /* no-op */ }
  pumpIncomingSnapshot(_buffer: ArrayBuffer): void { /* no-op */ }
  setNetMode(_mode: 'host' | 'guest' | 'off', _delayFrames?: number): void { /* no-op */ }
  setExpectedSlots(_slots: PlayerSlot[]): void { /* no-op */ }
  disconnectSlot(slot: PlayerSlot): void { this.simulator.disconnectPlayer(slot); }
  reconnectSlot(slot: PlayerSlot): void {
    const player = this.simulator.getState().players.find((p) => p.id === slot);
    if (!player) return;
    player.disconnected = false;
    player.active = true;
    if (player.state === 'splat') {
      player.state = 'respawning';
      player.respawnTimer = 1.5;
      player.splatTimer = 0;
    }
  }

  /** Mark that we're in rollback resimulation. */
  setResimulating(resim: boolean): void {
    this.simulator.setResimulating(resim);
  }

  /** Half-rate wrapper around cosmeticStep (third-rate on slow-device). */
  tickCosmetic(dt: number): void {
    perfTrace.measure('tickCosmetic', () => {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this._cosmeticLead += dt;
      const interval = getSlowDevice() ? COSMETIC_INTERVAL_SLOW : COSMETIC_INTERVAL;
      if (this._cosmeticLead < interval) return;
      const stepDt = Math.min(this._cosmeticLead, COSMETIC_MAX_STEP);
      this._cosmeticLead = Math.max(0, this._cosmeticLead - stepDt);
      this.cosmeticStep(stepDt);
    });
  }

  /** Re-prime cosmetic baselines against the current state. */
  resetCosmeticBaselines(): void {
    this.playerTransitionSystem.resetBaseline();
    this.entityTransitionSystem.resetBaseline();
    this.surfaceImpactSystem.resetBaseline();
    this.hudFeedbackSystem.resetBaseline();
    this.reactiveDecorationSystem.resetBaseline();
    this.wildlifeSystem.resetBaseline();
  }

  /** Seconds since the last cosmeticStep fired. */
  getCosmeticLead(): number {
    return this._cosmeticLead;
  }

  /** JIT warmup for the cosmetic hot paths during the guest's loading phase.
   *  `cosmeticStep` early-returns at phase=loading to avoid spurious transition
   *  sounds while the first snapshot establishes a baseline — but that means
   *  the first cosmeticStep after phase flips to 'playing' has to JIT-compile
   *  5 systems × per-player × per-entity hot paths at once, blowing frame
   *  budget on cold low-end Android.
   *
   *  This bypasses the phase guard but pins prev-state to current state every
   *  call (`resetCosmeticBaselines`) so transition detection finds prev==curr
   *  and fires nothing. The goal is purely to warm V8's optimizer; the loading
   *  overlay hides any cosmetic motion this incidentally produces (wildlife,
   *  fog, pollen). After phase flips, `onEnterPlayingPhase` re-primes baselines
   *  one more time against the just-applied snapshot so the first real
   *  cosmeticStep starts clean. */
  warmupCosmeticDuringLoading(dt: number): void {
    this.resetCosmeticBaselines();
    this.playerTransitionSystem.cosmeticUpdate(dt);
    this.playerCosmeticSystem.cosmeticUpdate(dt);
    this.entityTransitionSystem.cosmeticUpdate(dt);
    this.particleSystem.cosmeticUpdate(dt);
    this.environmentSystem.cosmeticUpdate(dt);
    this.surfaceImpactSystem.cosmeticUpdate(dt);
    this.hudFeedbackSystem.cosmeticUpdate(dt);
    this.reactiveDecorationSystem.cosmeticUpdate(dt);
    this.wildlifeSystem.cosmeticUpdate(dt);
  }

  /** Tick all cosmetic-only systems (particles, environment, visual decays). */
  cosmeticStep(dt: number): void {
    perfTrace.measure('cosmeticStep', () => {
      if (this.simulator.getState().phase === 'loading') return;
      const tickIdx = this._cosmeticTick++;

      const playerTransitionStart = perfTrace.begin('cosmetic.playerTransition');
      this.playerTransitionSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.playerTransition', playerTransitionStart);

      const playerCosmeticStart = perfTrace.begin('cosmetic.playerCosmetic');
      this.playerCosmeticSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.playerCosmetic', playerCosmeticStart);

      const entityTransitionStart = perfTrace.begin('cosmetic.entityTransition');
      this.entityTransitionSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.entityTransition', entityTransitionStart);

      const particlesStart = perfTrace.begin('cosmetic.particles');
      this.particleSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.particles', particlesStart);

      const environmentStart = perfTrace.begin('cosmetic.environment');
      this.environmentSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.environment', environmentStart);

      const surfaceImpactStart = perfTrace.begin('cosmetic.surfaceImpact');
      this.surfaceImpactSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.surfaceImpact', surfaceImpactStart);

      const hudFeedbackStart = perfTrace.begin('cosmetic.hudFeedback');
      this.hudFeedbackSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.hudFeedback', hudFeedbackStart);

      // Reactive 30Hz bucket runs at half the cosmeticStep rate (~15Hz) with
      // 2× dt so excitement/decay integrate the same total per second. Avoids
      // piling reactive proximity scans on every render frame that lands on
      // a cosmeticStep tick. The 60Hz bucket (fish/birds in fixedUpdate) is
      // untouched.
      if ((tickIdx & 1) === 0) {
        const reactiveStart = perfTrace.begin('cosmetic.reactive');
        this.reactiveDecorationSystem.cosmeticUpdate(dt * 2);
        perfTrace.end('cosmetic.reactive', reactiveStart);

        // WildlifeSystem.cosmeticUpdate is purely visual (no burst /
        // particle callback). When the worker hosts the renderer it
        // maintains its own WildlifeSystem; main's tick is dead weight.
        if (!this._workerActive) {
          const wildlifeStart = perfTrace.begin('cosmetic.wildlife');
          this.wildlifeSystem.cosmeticUpdate(dt * 2);
          perfTrace.end('cosmetic.wildlife', wildlifeStart);
        }
      }

      // Per-arena bespoke cosmetic logic (e.g. underwater bubble trails).
      const tick = this.simulator.getTheme().cosmeticTick;
      if (tick) {
        const arenaCosmeticStart = perfTrace.begin('cosmetic.arena');
        tick(this.simulator.getState(), dt, {
          emitParticle: (x, y, vx, vy, life, size, color) =>
            this.particleSystem.emitParticle(x, y, vx, vy, life, size, color),
        });
        perfTrace.end('cosmetic.arena', arenaCosmeticStart);
      }
    });
  }

  /** Render current frame. Public for network loop. */
  renderFrame(frameDt?: number): void {
    const state = this.simulator.getState();
    const arena = this.simulator.getArena();
    if (this._networkMode && frameDt !== undefined && frameDt > 0) {
      if (state.slowMotion > 0) state.slowMotion = Math.max(0, state.slowMotion - frameDt);
      if (state.screenFlash > 0) state.screenFlash = Math.max(0, state.screenFlash - frameDt);
      if (state.hitstopZoom > 0) state.hitstopZoom = Math.max(0, state.hitstopZoom - frameDt);
      if (state.matchOver) {
        this.particleSystem.updateFireworks(frameDt);
      }
    }
    this.particleSystem.bakeToRenderer(this.renderer);
    this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), this._cosmeticLead, this._buildReactiveArg(), this._buildWildlifeArg());
  }

  /** Capture a snapshot of all gameplay state for rollback. */
  takeSnapshot(frame: number): GameSnapshot {
    return _takeSnapshot(frame, this.simulator.getState(), this.simulator.getRng(), this.simulator.getAIControllers(), this.simulator.getAiRng());
  }

  /** Restore gameplay state from a snapshot for rollback. */
  restoreSnapshot(snap: GameSnapshot): void {
    _restoreSnapshot(snap, this.simulator.getState(), this.simulator.getRng(), this.simulator.getAIControllers(), this.simulator.getAiRng());
  }

  getState(): MatchState { return this.simulator.getState(); }
  getRendererDiagnostics() { return this.renderer.getDiagnostics(); }
  pause(): void { this.paused = true; audio.setPaused(true); this.simulator.getState().screenShake = 0; }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.setPaused(false, this.simulator.getArena().themeId); }
  isPaused(): boolean { return this.paused; }
  isAutoSlowFlipped(): boolean { return autoSlowDetect.isFlipped(); }
  skipCountdown(): void {
    const state = this.simulator.getState();
    if (state.countdown > 0) {
      state.countdown = 0;
    }
  }

  private loop = (currentTime: number): void => {
    if (!this.running) return;
    sampleFps(currentTime);

    const state = this.simulator.getState();
    const arena = this.simulator.getArena();

    if (this.paused) {
      this.lastTime = currentTime;
      this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), 0, this._buildReactiveArg(), this._buildWildlifeArg());
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
    autoSlowDetect.feedFrame(frameTime * 1000);

    const timeScale = state.slowMotion > 0 ? SLOW_MO_FACTOR : 1;
    this.accumulator += frameTime * timeScale;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }

    if (!this._networkMode) {
      this.tickCosmetic(FIXED_TIMESTEP);
    }

    if (state.slowMotion > 0) {
      state.slowMotion = Math.max(0, state.slowMotion - frameTime);
    }
    if (state.screenFlash > 0) {
      state.screenFlash = Math.max(0, state.screenFlash - frameTime);
    }
    if (state.hitstopZoom > 0) {
      state.hitstopZoom = Math.max(0, state.hitstopZoom - frameTime);
    }

    if (state.matchOver) {
      this.particleSystem.updateFireworks(frameTime);
    }

    this.particleSystem.bakeToRenderer(this.renderer);

    if (debugFlags.navDebugEnabled) {
      const botStates: BotNavDebugState[] = [];
      for (const player of state.players) {
        const ai = this.simulator.getAIControllers().get(player.id);
        if (ai && player.active && player.state !== 'splat' && player.state !== 'respawning') {
          botStates.push({ slot: player.id, x: player.x, y: player.y, navTarget: ai.getLastNavTarget() });
        }
      }
      this.renderer.setBotNavDebugStates(botStates);
    }

    this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), this._cosmeticLead, this._buildReactiveArg(), this._buildWildlifeArg());
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Build the per-frame reactive arg passed to renderFrame. The inner arrays
   *  are stable references owned by the system (rebuilt only on `setInstances`)
   *  — no per-frame element copy. Worker-mode short-circuit: the proxy
   *  strips this arg before postMessage, so building it on main is wasted
   *  work. The worker has its own ReactiveDecorationSystem and renders
   *  from there. */
  private static _EMPTY_REACTIVE: ReactiveRenderArg = { prePlayer: [], postPlayer: [], windPhase: 0 };
  private static _EMPTY_WILDLIFE: WildlifeRenderArg = { groundCritter: [], animBackground: [] };
  private _buildReactiveArg(): ReactiveRenderArg {
    if (this._workerActive) return GameLoop._EMPTY_REACTIVE;
    return {
      prePlayer: this.reactiveDecorationSystem.getInstancesForLayer('prePlayer'),
      postPlayer: this.reactiveDecorationSystem.getInstancesForLayer('postPlayer'),
      windPhase: this.reactiveDecorationSystem.getWindPhase(),
    };
  }

  /** Build the per-frame wildlife arg passed to renderFrame. Same stable-ref
   *  contract as `_buildReactiveArg`. */
  private _buildWildlifeArg(): WildlifeRenderArg {
    if (this._workerActive) return GameLoop._EMPTY_WILDLIFE;
    return {
      groundCritter: this.wildlifeSystem.getInstancesForLayer('groundCritter'),
      animBackground: this.wildlifeSystem.getInstancesForLayer('animBackground'),
    };
  }

  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    if (this.stopped) return;
    perfTrace.measure('fixedUpdate', () => {
      // 60Hz path: advance windPhase + run high-frequency reactive instances.
      this.reactiveDecorationSystem.fixedUpdate(dt);
      this.simulator.fixedUpdate(dt, networkInputs);
    });
  }

  /** @internal Test-only: forwards to simulator's getPlayerInputForTest. */
  getPlayerInputForTest(player: import('../types').Player, networkInputs?: ReadonlyMap<string, InputState>): InputState {
    return this.simulator.getPlayerInputForTest(player, networkInputs);
  }

  getTouchInput(): TouchInputManager | null {
    return this.touchInput;
  }

  // Phase + match-end handlers — wired into Simulator events from the constructor.

  private _handlePhaseChange(phase: MatchPhase): void {
    this.onPhaseChange?.(phase);
    if (phase === 'playing') {
      this.resetCosmeticBaselines();
      this._cosmeticLead = 0;
      this._cosmeticTick = 0;
    }
  }

  private _handleMatchEnd(winner: PlayerSlot | null): void {
    // Match.tsx pause overlay: clear the gamePaused flag so the victory sound
    // plays even if the match ended while still paused. matchSystem.cleanup
    // already ran inside Simulator.
    audio.setPaused(false);
    this.onMatchEnd(winner, this.simulator.getState());
  }
}
