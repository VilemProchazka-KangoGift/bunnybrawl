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
import type { PlayerInput } from '../input/PlayerInput';
import { TouchInputManager } from '../touchInput';
import { isTouchPrimary } from '../touchDetect';
import { haptics } from '../haptics';
import { Renderer } from '../renderer';
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
import { sampleFps } from '../fpsCounter';
import type { BotNavDebugState } from '../navDebugOverlay';
import type { NetDebugStats } from '../net/core/debugOverlay';

import { EnvironmentSystem } from './cosmetics/EnvironmentSystem';
import { EntityTransitionSystem } from './cosmetics/EntityTransitionSystem';
import { ParticleSystem } from './cosmetics/ParticleSystem';
import { PlayerTransitionSystem } from './cosmetics/PlayerTransitionSystem';
import { PlayerCosmeticSystem } from './cosmetics/PlayerCosmeticSystem';

/** Half-rate cosmetic threshold: particles/SFX/VFX tick at ~30Hz while render stays at 60Hz. */
const COSMETIC_INTERVAL = FIXED_TIMESTEP * 2;
/** Cap per-step cosmetic dt so tab-switch recovery doesn't dump seconds of work into one step. */
const COSMETIC_MAX_STEP = FIXED_TIMESTEP * 4;

export type MatchEndCallback = (winner: PlayerSlot | null, state: MatchState) => void;

export class GameLoop {
  private simulator: Simulator;
  private keyboardManager: KeyboardManager;
  private renderer: Renderer;
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

  private _debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _unsubRenderScale: (() => void) | null = null;

  private touchInput: TouchInputManager | null = null;
  private touchSlot: PlayerSlot | null = null;

  private _networkMode = false;
  private _audioEnabled = true;

  private onPhaseChange?: (phase: MatchPhase) => void;

  private _cosmeticLead = 0;

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: PlayerSlot[],
    onMatchEnd: MatchEndCallback,
    hudCanvas?: HTMLCanvasElement,
    rng?: SeededRNG,
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
        onPlayerLanding: (slot, prevVy) => { if (haptics.isLocal(slot)) haptics.landing(prevVy); },
        onStompHaptic: (slot) => { if (haptics.isLocal(slot)) haptics.hitstop(); },
      },
    });

    this.renderer = new Renderer(bgCanvas, fgCanvas, this.simulator.getTheme(), settings.mods.mirrorArena, hudCanvas);
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
    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => { if (this._audioEnabled) audio.playAnimal(name); },
      this.particleSystem,
    );
    this.playerCosmeticSystem = new PlayerCosmeticSystem(
      sState, this.simulator.getEffWalkSpeed(), this.particleSystem,
      (name) => this.playSound(name),
    );
    this.environmentSystem = new EnvironmentSystem(sState, sTheme);
    this.entityTransitionSystem = new EntityTransitionSystem(sState, (name) => this.playSound(name));

    // Cooldowns map lives on PlayerTransitionSystem — wire it back into the simulator
    // for the headbonk + crouch + zero-G sound paths in fixedUpdate.
    // The lazy `() => this.playerTransitionSystem.getSfxCooldowns()` indirection
    // means subsequent playerTransitionSystem replacements (e.g. switchArena)
    // are picked up automatically — no need to re-call setSfxCooldownsGetter.
    this.simulator.setSfxCooldownsGetter(() => this.playerTransitionSystem.getSfxCooldowns());

    this.playerTransitionSystem.init();
    this.entityTransitionSystem.init();

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
    if (this._debugKeyHandler) {
      window.removeEventListener('keydown', this._debugKeyHandler);
      this._debugKeyHandler = null;
    }
    if (this._unsubRenderScale) {
      this._unsubRenderScale();
      this._unsubRenderScale = null;
    }
  }

  /** Play a sound, respecting audio mute (used during rollback resimulation). */
  private playSound(name: string): void {
    if (this._audioEnabled) audio.play(name as Parameters<typeof audio.play>[0]);
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

  /** Enable network mode: external code drives the loop. */
  setNetworkMode(enabled: boolean): void {
    this._networkMode = enabled;
    this.renderer.setNetworkMode(enabled);
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
    this.playSound('ambient');
    this.simulator.initMatchSystem();
    this.resetCosmeticBaselines();
    this._cosmeticLead = 0;
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

    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => { if (this._audioEnabled) audio.playAnimal(name); },
      this.particleSystem,
    );
    this.playerCosmeticSystem = new PlayerCosmeticSystem(
      sState, this.simulator.getEffWalkSpeed(), this.particleSystem,
      (name) => this.playSound(name),
    );
    this.environmentSystem = new EnvironmentSystem(sState, newTheme);
    this.entityTransitionSystem = new EntityTransitionSystem(sState, (name) => this.playSound(name));

    this.playerTransitionSystem.init();
    this.entityTransitionSystem.init();

    // Drain leftover cosmetic lead so the first cosmeticStep after new arena
    // load doesn't run against residual time from the prior arena.
    this._cosmeticLead = 0;
  }

  /** Get the renderer instance. */
  getRenderer(): Renderer {
    return this.renderer;
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

  /** Mute/unmute audio (used during rollback resimulation). */
  setAudioEnabled(enabled: boolean): void {
    this._audioEnabled = enabled;
  }

  /** Mark that we're in rollback resimulation. */
  setResimulating(resim: boolean): void {
    this.simulator.setResimulating(resim);
  }

  /** Half-rate wrapper around cosmeticStep. */
  tickCosmetic(dt: number): void {
    perfTrace.measure('tickCosmetic', () => {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this._cosmeticLead += dt;
      if (this._cosmeticLead < COSMETIC_INTERVAL) return;
      const stepDt = Math.min(this._cosmeticLead, COSMETIC_MAX_STEP);
      this._cosmeticLead = Math.max(0, this._cosmeticLead - stepDt);
      this.cosmeticStep(stepDt);
    });
  }

  /** Re-prime cosmetic baselines against the current state. */
  resetCosmeticBaselines(): void {
    this.playerTransitionSystem.resetBaseline();
    this.entityTransitionSystem.resetBaseline();
  }

  /** Seconds since the last cosmeticStep fired. */
  getCosmeticLead(): number {
    return this._cosmeticLead;
  }

  /** Tick all cosmetic-only systems (particles, environment, visual decays). */
  cosmeticStep(dt: number): void {
    perfTrace.measure('cosmeticStep', () => {
      if (this.simulator.getState().phase === 'loading') return;

      this.playerTransitionSystem.cosmeticUpdate(dt);
      this.playerCosmeticSystem.cosmeticUpdate(dt);
      this.entityTransitionSystem.cosmeticUpdate(dt);
      this.particleSystem.cosmeticUpdate(dt);
      this.environmentSystem.cosmeticUpdate(dt);
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
    this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), this._cosmeticLead);
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
  pause(): void { this.paused = true; audio.setPaused(true); }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.setPaused(false, this.simulator.getArena().themeId); }
  isPaused(): boolean { return this.paused; }
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
      this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), 0);
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

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

    this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), this._cosmeticLead);
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    if (this.stopped) return;
    perfTrace.measure('fixedUpdate', () => {
      this.simulator.fixedUpdate(dt, networkInputs);
    });
  }

  /** @internal Test-only: forwards to simulator's getPlayerInputForTest. */
  getPlayerInputForTest(player: import('../types').Player, networkInputs?: Map<string, InputState>): InputState {
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
