import type {
  MatchState, MatchPhase, MatchSettings, Arena, PlayerSlot, Player, InputState,
} from '../types';
import { isBotSlot } from '../types';
import { SeededRNG } from '../net/prng';
import type { PlayerInput } from '../input/PlayerInput';
import type { ThemeConfig } from '../themes/types';
import type { ParticleEmitter, SimulatorEvents, SimulatorOptions, TouchInputProvider } from './types';
import { getArena, getTheme, mirrorArena } from '../arenas';
import { swapRemove } from '../themes/utils';
import { AIController } from '../ai';
import {
  applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState,
  applyArenaConstraints, aabbOverlap, resolveStuckPlayer,
} from '../physics';
import {
  CARROT_SIZE, FAT_DURATION, SPRING_BOUNCE,
  HITSTOP_DURATION, SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  SCREEN_FLASH_DURATION,
} from '../constants';
import { computeEffectivePhysics, createInitialPlayers, createInitialMatchState } from './initialState';
import { perfTrace } from '../perfTrace';
import { RuleBasedBot } from '../input/RuleBasedBot';

import { getOrCreateCooldowns } from '../sfxCooldowns';
import type { SfxCooldowns } from '../sfxCooldowns';
import { HazardSystem } from '../gameLoop/gameplay/HazardSystem';
import { CarrotSystem } from '../gameLoop/gameplay/CarrotSystem';
import { ArenaEntitySystem } from '../gameLoop/gameplay/ArenaEntitySystem';
import { EffectZoneSystem } from '../gameLoop/gameplay/EffectZoneSystem';
import { PlayerCollisionSystem } from '../gameLoop/gameplay/PlayerCollisionSystem';
import { StompSystem } from '../gameLoop/gameplay/StompSystem';
import { MatchSystem } from '../gameLoop/gameplay/MatchSystem';

const f = Math.fround;

const NOOP = (): void => {};
const NOOP_NAME = (_n: string): void => {};
const NOOP_NAME_NUM = (_n: string, _v: number): void => {};
const NOOP_PHASE = (_p: MatchPhase): void => {};
const NOOP_MATCH_END = (_w: PlayerSlot | null, _s: MatchState): void => {};
const NOOP_LANDING = (_s: PlayerSlot, _v: number): void => {};
const NOOP_SLOT = (_s: PlayerSlot): void => {};

const NOOP_EMITTER: ParticleEmitter = {
  emitParticle: NOOP,
  spawnCarrotVFX: NOOP,
  applyHazardHitVFX: NOOP,
};

/**
 * Pure simulation core. Owns MatchState, RNG, AI, gameplay systems, and PlayerInputs.
 * Side effects (audio, haptics, phase callbacks) flow through SimulatorEvents.
 *
 * The Simulator MUST NOT import audio, renderer, haptics, touchInput, or any
 * browser API directly. Adapters subscribe to events to translate requests to
 * concrete browser actions.
 */
export class Simulator {
  // Arena + theme + settings
  private _arena: Arena;
  private _originalArena: Arena;
  private _theme: ThemeConfig;
  private _settings: MatchSettings;

  // Effective physics (theme + mods applied)
  private _effGravity: number;
  private _effFriction: number;
  private _effWalkSpeed: number;
  private _effJumpImpulse: number;
  private _effMaxFallSpeed: number;

  // PRNG (split into game + AI streams so AI conditional calls can't desync spawn RNG)
  private _rng?: SeededRNG;
  private _aiRng?: SeededRNG;

  // Behavior
  private _state: MatchState;
  private _phase: MatchPhase = 'loading';
  private _aiControllers: Map<string, AIController> = new Map();
  private _playerInputs: Map<PlayerSlot, PlayerInput> = new Map();

  // Touch override (set by browser adapter; null in headless runs)
  private _touchInput: TouchInputProvider | null = null;
  private _touchSlot: PlayerSlot | null = null;

  // Side effects
  private readonly _events: Required<SimulatorEvents>;
  private _particleEmitter: ParticleEmitter;

  // Per-tick state for fixedUpdate
  private _networkInputs?: Map<string, InputState>;
  private _resimulating = false;
  private _loadingGeneration = 0;

  // Bound callbacks (avoid .bind() allocations in hot paths)
  private readonly _boundGameRandom = (): number => this.gameRandom();
  private readonly _boundPlaySound = (name: string): void => this._events.onSfxRequest(name);
  private readonly _boundStopSound = (name: string): void => this._events.onSoundStopRequest(name);
  private readonly _boundSetSoundVolume = (name: string, volume: number): void =>
    this._events.onSoundVolumeRequest(name, volume);
  private readonly _boundParticleEmitter: ParticleEmitter = {
    emitParticle: (x, y, vx, vy, life, size, color) => this._particleEmitter.emitParticle(x, y, vx, vy, life, size, color),
    spawnCarrotVFX: (x, y) => this._particleEmitter.spawnCarrotVFX(x, y),
    applyHazardHitVFX: (hit, slot, state, resim) => this._particleEmitter.applyHazardHitVFX(hit, slot, state, resim),
  };

  // Gameplay systems (rebuilt on switchArena)
  private _hazardSystem!: HazardSystem;
  private _carrotSystem!: CarrotSystem;
  private _arenaEntitySystem!: ArenaEntitySystem;
  private _effectZoneSystem!: EffectZoneSystem;
  private _playerCollisionSystem!: PlayerCollisionSystem;
  private _stompSystem!: StompSystem;
  private _matchSystem!: MatchSystem;

  // Cooldowns map injected by adapter's PlayerTransitionSystem (for headbonk + crouch).
  // Default: empty map — gameplay still works, cooldowns just always start at 0.
  private _sfxCooldownsGetter: () => Map<PlayerSlot, SfxCooldowns> = () => new Map();

  constructor(opts: SimulatorOptions) {
    const e = opts.events ?? {};
    this._events = {
      onSfxRequest: e.onSfxRequest ?? NOOP_NAME,
      onMusicStartRequest: e.onMusicStartRequest ?? NOOP_NAME,
      onMusicStopRequest: e.onMusicStopRequest ?? NOOP,
      onSoundStopRequest: e.onSoundStopRequest ?? NOOP_NAME,
      onSoundVolumeRequest: e.onSoundVolumeRequest ?? NOOP_NAME_NUM,
      onAllGameSoundsStopRequest: e.onAllGameSoundsStopRequest ?? NOOP,
      onPhaseChange: e.onPhaseChange ?? NOOP_PHASE,
      onMatchEnd: e.onMatchEnd ?? NOOP_MATCH_END,
      onPlayerLanding: e.onPlayerLanding ?? NOOP_LANDING,
      onStompHaptic: e.onStompHaptic ?? NOOP_SLOT,
    };
    this._particleEmitter = opts.particleEmitter ?? NOOP_EMITTER;

    this._rng = opts.rng;
    if (opts.rng) this._aiRng = new SeededRNG(opts.rng.getState() ^ 0x41495F52);

    this._settings = opts.settings;
    this._originalArena = opts.arena;
    this._theme = getTheme(opts.arena.themeId);

    let effectiveArena = opts.arena;
    if (opts.settings.mods.superBounce) {
      effectiveArena = { ...effectiveArena, bouncyPlatforms: effectiveArena.platforms.map((_, i) => i) };
    }
    if (opts.settings.mods.mirrorArena) {
      effectiveArena = mirrorArena(effectiveArena);
    }
    this._arena = effectiveArena;

    const phys = computeEffectivePhysics(this._theme, opts.settings.mods);
    this._effGravity = phys.gravity;
    this._effFriction = phys.friction;
    this._effWalkSpeed = phys.walkSpeed;
    this._effJumpImpulse = phys.jumpImpulse;
    this._effMaxFallSpeed = phys.maxFallSpeed;

    const players = createInitialPlayers(opts.activePlayers, this._arena, opts.settings.mods.giantPlayers, this._boundGameRandom);

    const botDifficulty = opts.settings.botDifficulty ?? 'medium';
    let botIndex = 0;
    for (const player of players) {
      if (isBotSlot(player.id)) {
        this._aiControllers.set(player.id, new AIController(player.id, player.character.name, botDifficulty, botIndex++, this._aiRng));
      }
    }

    this._state = createInitialMatchState(this._arena, this._theme, opts.settings, players, opts.activePlayers, this._boundGameRandom);

    this._buildSystems();
  }

  // Adapter-facing setters (browser only) -------------------------------

  /** Replace the particle emitter. Used by GameLoop after constructing
   *  ParticleSystem (which depends on Simulator's state). */
  setParticleEmitter(emitter: ParticleEmitter): void {
    this._particleEmitter = emitter;
  }

  /** Register a touch input provider for a specific slot. Set to null to disable. */
  setTouchInput(input: TouchInputProvider | null, slot: PlayerSlot | null): void {
    this._touchInput = input;
    this._touchSlot = slot;
  }

  /** Inject a getter for SFX cooldown state owned by the cosmetic adapter
   *  (PlayerTransitionSystem). Used by headbonk + crouch + zero-G sounds. */
  setSfxCooldownsGetter(getter: () => Map<PlayerSlot, SfxCooldowns>): void {
    this._sfxCooldownsGetter = getter;
    // Rebuild EffectZoneSystem so it picks up the fresh getter (it captured
    // the previous one at construction).
    this._effectZoneSystem = new EffectZoneSystem(
      this._state, this._arena, this._arenaEntitySystem,
      this._sfxCooldownsGetter, this._boundPlaySound, this._boundStopSound,
    );
  }

  // Public accessors ------------------------------------------------------

  getState(): MatchState { return this._state; }
  getArena(): Arena { return this._arena; }
  getOriginalArena(): Arena { return this._originalArena; }
  getTheme(): ThemeConfig { return this._theme; }
  getSettings(): MatchSettings { return this._settings; }
  getEffWalkSpeed(): number { return this._effWalkSpeed; }
  getRng(): SeededRNG | undefined { return this._rng; }
  getAiRng(): SeededRNG | undefined { return this._aiRng; }
  getAIControllers(): Map<string, AIController> { return this._aiControllers; }
  getPhase(): MatchPhase { return this._phase; }
  getLoadingGeneration(): number { return this._loadingGeneration; }
  getArenaEntitySystem(): ArenaEntitySystem { return this._arenaEntitySystem; }

  // PlayerInput map ------------------------------------------------------

  setPlayerInput(slot: PlayerSlot, input: PlayerInput): void {
    this._playerInputs.set(slot, input);
  }
  getPlayerInput(slot: PlayerSlot): PlayerInput | undefined {
    return this._playerInputs.get(slot);
  }
  getPlayerInputs(): ReadonlyMap<PlayerSlot, PlayerInput> {
    return this._playerInputs;
  }

  // RNG --------------------------------------------------------------------

  setRng(rng: SeededRNG): void {
    this._rng = rng;
    for (const ai of this._aiControllers.values()) {
      ai.setRng(this._aiRng ?? rng);
    }
  }

  // Resim flag -----------------------------------------------------------

  setResimulating(resim: boolean): void {
    this._resimulating = resim;
  }

  // Phase ----------------------------------------------------------------

  /** Transition the match to a new phase. No-op if already in that phase.
   *  On the loading→playing edge, requests arena music + ambient and inits
   *  MatchSystem. */
  setPhase(phase: MatchPhase): void {
    const prev = this._state.phase;
    if (prev === phase) return;
    this._state.phase = phase;
    this._phase = phase;
    if (phase === 'playing' && prev !== 'playing') {
      this._events.onMusicStartRequest(this._arena.themeId);
      this._events.onSfxRequest('ambient');
      this._matchSystem.init();
    }
    this._events.onPhaseChange(phase);
  }

  // Arena swap mid-match -------------------------------------------------

  /** Swap to a different arena in place. Scores reset, state reinitialized,
   *  phase flips back to 'loading'. */
  switchArena(arenaId: string, settingsOverrides?: Partial<MatchSettings>): void {
    this._events.onAllGameSoundsStopRequest();
    this._matchSystem.cleanup();

    const newArena = getArena(arenaId);
    this._originalArena = newArena;
    if (settingsOverrides) {
      this._settings = { ...this._settings, ...settingsOverrides };
    }
    let effectiveArena = newArena;
    if (this._settings.mods.superBounce) {
      effectiveArena = { ...effectiveArena, bouncyPlatforms: effectiveArena.platforms.map((_, i) => i) };
    }
    if (this._settings.mods.mirrorArena) {
      effectiveArena = mirrorArena(effectiveArena);
    }
    this._arena = effectiveArena;
    for (const pi of this._playerInputs.values()) {
      if (pi instanceof RuleBasedBot) pi.setArena(this._arena);
    }
    this._theme = getTheme(newArena.themeId);

    const phys = computeEffectivePhysics(this._theme, this._settings.mods);
    this._effGravity = phys.gravity;
    this._effFriction = phys.friction;
    this._effWalkSpeed = phys.walkSpeed;
    this._effJumpImpulse = phys.jumpImpulse;
    this._effMaxFallSpeed = phys.maxFallSpeed;

    const activePlayers = this._state.players.map(p => p.id);
    const fresh = createInitialMatchState(
      this._arena, this._theme, this._settings,
      createInitialPlayers(activePlayers, this._arena, this._settings.mods.giantPlayers, this._boundGameRandom),
      activePlayers, this._boundGameRandom,
    );
    Object.assign(this._state, fresh);

    this._buildSystems();

    this._loadingGeneration++;
    this._phase = 'loading';
    this._events.onPhaseChange('loading');
  }

  // Player lifecycle -----------------------------------------------------

  /** Mark a player as disconnected — kill them and prevent respawn. */
  disconnectPlayer(slot: PlayerSlot): void {
    const player = this._state.players.find(p => p.id === slot);
    if (!player) return;
    player.disconnected = true;
    if (player.state !== 'splat') {
      player.state = 'splat';
      player.splatTimer = 999999;
    }
    player.respawnTimer = 0;
  }

  /** Free system-owned timers (ambient loops, periodic ambient timers).
   *  Adapters should call this in their teardown. */
  cleanup(): void {
    this._matchSystem.cleanup();
  }

  /** Initialize MatchSystem (start ambient loops, seed periodic timers).
   *  Normally fired by setPhase('playing'); the guest path needs to invoke
   *  it manually when its snapshot-mutated phase flips. */
  initMatchSystem(): void {
    this._matchSystem.init();
  }

  // Hot path -------------------------------------------------------------

  /** Run one fixed-timestep simulation tick. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    this._networkInputs = networkInputs;
    if (this._state.matchOver) return;
    if (this._state.phase === 'loading') return;
    this._state.timeElapsed = f(this._state.timeElapsed + dt);

    this._state.dayPhase = f(this._state.dayPhase + f(dt / this._theme.dayNight.cycleDuration));
    if (this._state.dayPhase > 1) this._state.dayPhase = f(this._state.dayPhase - 1);

    if (this._state.countdown > 0) {
      this._state.countdown = f(this._state.countdown - dt);
      if (this._state.countdown <= 0) {
        this._state.countdown = 0;
      }
      return;
    }

    if (!this._resimulating && this._state.screenShake > 0) {
      this._state.screenShake = Math.max(0, this._state.screenShake - dt);
    }

    const hazardStart = perfTrace.begin('gameplay.hazard');
    this._hazardSystem.fixedUpdate(dt);
    perfTrace.end('gameplay.hazard', hazardStart);

    const carrotStart = perfTrace.begin('gameplay.carrot');
    this._carrotSystem.fixedUpdate(dt);
    perfTrace.end('gameplay.carrot', carrotStart);

    const arenaEntityStart = perfTrace.begin('gameplay.arenaEntity');
    this._arenaEntitySystem.fixedUpdate(dt);
    perfTrace.end('gameplay.arenaEntity', arenaEntityStart);

    const perPlayerStart = perfTrace.begin('simulator.perPlayerPhysics');

    for (const player of this._state.players) {
      if (!player.active) continue;
      if (player.hitstopTimer > 0) {
        player.hitstopTimer = Math.max(0, f(player.hitstopTimer - dt));
        if (player.fatTimer > 0) player.fatTimer = Math.max(0, f(player.fatTimer - dt));
        if (player.slowTimer > 0) player.slowTimer = Math.max(0, f(player.slowTimer - dt));
        if (player.burnTimer > 0) player.burnTimer = Math.max(0, f(player.burnTimer - dt));
        continue;
      }
      if (player.fatTimer > 0) player.fatTimer = Math.max(0, f(player.fatTimer - dt));
      if (player.slowTimer > 0) player.slowTimer = Math.max(0, f(player.slowTimer - dt));
      if (player.burnTimer > 0) player.burnTimer = Math.max(0, f(player.burnTimer - dt));
    }

    for (const player of this._state.players) {
      if (!player.active) continue;
      if (player.hitstopTimer > 0) continue;
      const input = this._getPlayerInput(player);
      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;
      const wasCrouching = player.squashScale <= SQUASH_ON_CROUCH;

      let playerWalkSpeed = this._effWalkSpeed;
      if (isBotSlot(player.id)) {
        const ai = this._aiControllers.get(player.id);
        if (ai) playerWalkSpeed *= ai.getWalkSpeedMult();
      }
      applyInput(player, input, dt, playerWalkSpeed, this._effFriction, this._effJumpImpulse);

      if (!wasAirborne && player.state === 'airborne') {
        player.squashScale = STRETCH_ON_JUMP;
        player.squashTimer = 0.15;
      }

      applyGravity(player, dt, this._effGravity, this._effMaxFallSpeed);
      movePlayer(player, dt);
      collidePlatforms(player, this._arena.platforms);
      resolveStuckPlayer(player, this._arena.platforms);
      applyArenaConstraints(player, this._arena);
      if (player.vx !== 0 && player.vx > -1e-4 && player.vx < 1e-4) player.vx = 0;
      if (player.vy !== 0 && player.vy > -1e-4 && player.vy < 1e-4) player.vy = 0;
      updatePlayerState(player);

      if (wasAirborne && player.state === 'airborne' && prevVy < -10 && player.vy === 0) {
        const cd = getOrCreateCooldowns(this._sfxCooldownsGetter(), player.id);
        if (cd.headbonk <= 0) {
          this._events.onSfxRequest('headbonk');
          cd.headbonk = 0.15;
        }
      }

      const justLanded = wasAirborne && player.state !== 'airborne';

      if (justLanded) this._events.onPlayerLanding(player.id, prevVy);

      if (Math.abs(prevVx) > 100 && player.vx === 0 && prevVx !== 0) {
        player.squashScale = 1.3;
        player.squashTimer = 0.12;
      }

      if (justLanded) {
        player.squashScale = SQUASH_ON_LAND;
        player.squashTimer = 0.15;
      }

      if (input.down && player.state !== 'airborne') {
        player.squashScale = SQUASH_ON_CROUCH;
        if (!wasCrouching) {
          const cd = getOrCreateCooldowns(this._sfxCooldownsGetter(), player.id);
          if (cd.crouch <= 0) {
            this._events.onSfxRequest('crouch');
            cd.crouch = 0.2;
          }
        }
      } else {
        if (player.squashTimer > 0) {
          player.squashTimer = f(player.squashTimer - dt);
          player.squashScale = f(player.squashScale + f(f(1.0 - player.squashScale) * f(SQUASH_DECAY_SPEED * dt)));
        } else {
          player.squashScale = 1.0;
        }
      }

      if (player.invincibleTimer <= 0 && player.vy <= 400) {
        let angry = false;
        for (const other of this._state.players) {
          if (other.id === player.id || !other.active || other.state === 'splat' || other.state === 'respawning') continue;
          const dx = Math.abs((other.x + other.width / 2) - (player.x + player.width / 2));
          const dy = Math.abs((other.y + other.height / 2) - (player.y + player.height / 2));
          if (dx < 80 && dy < 60) { angry = true; break; }
        }
        player.expression = angry ? 'angry' : 'normal';
      }

      if (player.state === 'airborne') {
        const ps = this._state.stats.perPlayer.get(player.id);
        if (ps) ps.timeAirborne += dt;
      }
      {
        const ps = this._state.stats.perPlayer.get(player.id);
        if (ps) ps.distanceTraveled += (Math.abs(player.vx) * dt + Math.abs(player.vy) * dt);
      }

      this._playerCollisionSystem.checkCollisions(player);
      this._effectZoneSystem.applyToPlayer(player, justLanded, wasAirborne, prevVy, dt);

      if (this._arena.bouncyPlatforms && justLanded && !(input.down && prevVy < 100)) {
        for (const bi of this._arena.bouncyPlatforms) {
          const bp = this._arena.platforms[bi];
          if (!bp) continue;
          const playerBottom = player.y + player.height;
          const playerCx = player.x + player.width / 2;
          if (playerBottom >= bp.y && playerBottom <= bp.y + bp.height + 4 &&
              playerCx >= bp.x && playerCx <= bp.x + bp.width) {
            player.vy = f(SPRING_BOUNCE * 0.85);
            player.state = 'airborne';
            this._state.bouncyWobble.set(bi, 0.4);
            break;
          }
        }
      }

      for (const flock of this._state.pigeonFlocks) {
        if (!flock.active) continue;
        const dx = (player.x + player.width / 2) - flock.x;
        const dy = (player.y + player.height) - flock.y;
        if (dx * dx + dy * dy < 60 * 60 && player.state !== 'airborne') {
          flock.active = false;
          flock.respawnTimer = this._theme.pigeonConfig?.respawnTime || 12;
          this._events.onSfxRequest('pigeon_scatter');
          for (let pi = 0; pi < 6; pi++) {
            const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
            const speed = 150 + Math.random() * 200;
            flock.scatterParticles.push({
              x: flock.x + (Math.random() - 0.5) * 20,
              y: flock.y - 5,
              vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
              vy: Math.sin(angle) * speed - 80,
              life: 1.0 + Math.random() * 0.5,
            });
          }
        }
      }

      for (const carrot of this._state.carrots) {
        if (!carrot.active) continue;
        if (aabbOverlap(player.x, player.y, player.width, player.height, carrot.x - CARROT_SIZE / 2, carrot.y, CARROT_SIZE, CARROT_SIZE)) {
          carrot.active = false;
          player.score += 1;
          player.fatTimer = FAT_DURATION;
          player.hitstopTimer = Math.max(player.hitstopTimer, HITSTOP_DURATION * 0.5);
          if (!this._resimulating) this._state.hitstopZoom = Math.max(this._state.hitstopZoom, HITSTOP_DURATION * 0.5);
          const ps = this._state.stats.perPlayer.get(player.id);
          if (ps) ps.carrotsEaten += 1;
        }
      }
    }

    for (let i = this._state.carrots.length - 1; i >= 0; i--) {
      if (!this._state.carrots[i].active) {
        swapRemove(this._state.carrots, i);
      }
    }

    perfTrace.end('simulator.perPlayerPhysics', perPlayerStart);

    const effectZoneStart = perfTrace.begin('gameplay.effectZone');
    this._effectZoneSystem.fixedUpdate(dt);
    perfTrace.end('gameplay.effectZone', effectZoneStart);

    const stompStart = perfTrace.begin('gameplay.stomp');
    this._stompSystem.fixedUpdate(dt);
    perfTrace.end('gameplay.stomp', stompStart);

    const matchStart = perfTrace.begin('gameplay.match');
    this._matchSystem.fixedUpdate(dt);
    perfTrace.end('gameplay.match', matchStart);
  }

  // Internal -------------------------------------------------------------

  private gameRandom(): number {
    return this._rng ? this._rng.nextFloat() : Math.random();
  }

  private _getPlayerInput(player: Player): InputState {
    if (this._networkInputs) {
      const net = this._networkInputs.get(player.id);
      if (net) {
        if (net.jump && player.state === 'airborne') {
          return { left: net.left, right: net.right, jump: false, down: true };
        }
        return net;
      }
    }
    if (this._touchInput && player.id === this._touchSlot) {
      return this._touchInput.getInputForPlayer(player.state === 'airborne');
    }
    const pi = this._playerInputs.get(player.id);
    if (pi) return pi.getAction(this._state);
    return { left: false, right: false, jump: false, down: false };
  }

  /** Test-only: forwards to _getPlayerInput so dispatch branches can be
   *  asserted without driving a full fixedUpdate tick. */
  getPlayerInputForTest(player: Player, networkInputs?: Map<string, InputState>): InputState {
    if (networkInputs) this._networkInputs = networkInputs;
    return this._getPlayerInput(player);
  }

  private _buildSystems(): void {
    this._arenaEntitySystem = new ArenaEntitySystem(this._state, this._arena, this._theme, this._boundGameRandom);
    this._arenaEntitySystem.init();

    this._hazardSystem = new HazardSystem(this._state, this._arena, this._boundGameRandom);
    this._hazardSystem.init();

    this._carrotSystem = new CarrotSystem(
      this._state, this._arena, this._settings,
      this._arenaEntitySystem.getCachedZeroGZones(),
      this._boundGameRandom, this._boundParticleEmitter,
    );

    this._effectZoneSystem = new EffectZoneSystem(
      this._state, this._arena, this._arenaEntitySystem,
      this._sfxCooldownsGetter, this._boundPlaySound, this._boundStopSound,
    );
    this._playerCollisionSystem = new PlayerCollisionSystem(
      this._state, this._arena, this._boundParticleEmitter,
      () => this._resimulating,
    );
    this._stompSystem = new StompSystem(
      this._state, this._arena, this._settings,
      () => this._resimulating,
      () => this._rng,
      this._events.onStompHaptic,
    );
    this._matchSystem = new MatchSystem(
      this._state, this._settings, this._theme,
      this._boundPlaySound, this._boundStopSound, this._boundSetSoundVolume,
      () => this._resimulating,
      (winner) => {
        this._state.matchOver = true;
        this._state.winner = winner;
        if (!this._resimulating) this._state.screenFlash = SCREEN_FLASH_DURATION;
        this._matchSystem.cleanup();
        this._events.onMusicStopRequest();
        this._events.onMatchEnd(winner, this._state);
      },
    );
  }
}
