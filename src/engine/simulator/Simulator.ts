import type {
  MatchState, MatchPhase, MatchSettings, Arena, PlayerSlot, Player, InputState,
} from '../types';
import { isBotSlot } from '../types';
import { SeededRNG } from '../net/prng';
import type { PlayerInput, PlayerInputContext } from '../input/PlayerInput';
import { TouchAdapter } from '../input/TouchAdapter';
import type { ThemeConfig } from '../themes/types';
import type { ParticleEmitter, SimulatorEvents, SimulatorOptions, TouchInputProvider } from './types';
import { getArena, getTheme, mirrorArena } from '../arenas';
import { swapRemove } from '../themes/utils';
import { AIController } from '../ai';
import {
  applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState,
  applyArenaConstraints, aabbOverlap, resolveStuckPlayer, resolveOutOfBoundsPlayer,
} from '../physics';
import {
  CARROT_SIZE, FAT_DURATION, SPRING_BOUNCE,
  HITSTOP_DURATION, SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  SCREEN_FLASH_DURATION, ANIM_FRAME_DURATION, RUN_FRAMES,
} from '../constants';
import { computeEffectivePhysics, createInitialPlayers, createInitialMatchState } from './initialState';
import { perfTrace } from '../perfTrace';
import { fastSin } from '../fastMath';
import { RuleBasedBot } from '../input/RuleBasedBot';

import { PlayerSfxCooldowns } from '../sfxCooldowns';
import { HazardSystem } from '../gameLoop/gameplay/HazardSystem';
import { CarrotSystem } from '../gameLoop/gameplay/CarrotSystem';
import { ArenaEntitySystem } from '../gameLoop/gameplay/ArenaEntitySystem';
import { EffectZoneSystem } from '../gameLoop/gameplay/EffectZoneSystem';
import { PlayerCollisionSystem } from '../gameLoop/gameplay/PlayerCollisionSystem';
import { StompSystem } from '../gameLoop/gameplay/StompSystem';
import { MatchSystem } from '../gameLoop/gameplay/MatchSystem';
import { getEntities } from '../entities/registry';
import type { EntityFixedCtx } from '../entities/types';
import type { ScatterFlockSpecies } from '../themes/types';
import { pickScatterColor } from '../rendering/hazards';

const f = Math.fround;

const SCATTER_PARTICLE_COUNT: Record<ScatterFlockSpecies, number> = {
  bird: 7,
  bat: 12,
  crow: 7,
};

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

  // Touch slot tracker (TouchAdapter is installed into _playerInputs for the
  // active touch slot — this only records which slot to move on setLocalSlot).
  private _touchSlot: PlayerSlot | null = null;

  // Side effects
  private readonly _events: Required<SimulatorEvents>;
  private _particleEmitter: ParticleEmitter;

  // Per-tick state for fixedUpdate. `_mutCtx` is the single reused ctx object
  // — fields are overwritten at the top of each fixedUpdate. `_tickCtx` is
  // the public reference handed to PlayerInput.getAction; it always points
  // at `_mutCtx` once fixedUpdate has run. PlayerInput impls must NOT mutate.
  private readonly _mutCtx: { networkInputs?: ReadonlyMap<string, InputState>; airborne?: boolean } = {};
  private _tickCtx: PlayerInputContext = this._mutCtx;
  // Reused entity-dispatch ctx — fields overwritten at the top of fixedUpdate
  // so the per-tick entity loop doesn't allocate. Entities MUST NOT mutate
  // the ctx object (read-only contract).
  private readonly _entityCtx: EntityFixedCtx;
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

  // Cooldowns injected by adapter's PlayerTransitionSystem (for headbonk + crouch).
  // Default: a fresh local instance — gameplay still works, cooldowns just
  // never decay (PlayerTransitionSystem is the central decay site).
  private _sfxCooldownsGetter: () => PlayerSfxCooldowns = () => this._defaultSfxCooldowns;
  private readonly _defaultSfxCooldowns = new PlayerSfxCooldowns();

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

    // Build the entity dispatch ctx once. Fields that depend on per-tick
    // state (`dt`, `resimulating`) are overwritten in `fixedUpdate`; the
    // rest are stable per-Simulator-lifetime. `arena` / `theme` / `settings`
    // are reassigned on `switchArena`.
    this._entityCtx = {
      dt: 0,
      state: this._state,
      arena: this._arena,
      theme: this._theme,
      settings: this._settings,
      players: this._state.players,
      rng: this._boundGameRandom,
      events: this._events,
      particles: this._boundParticleEmitter,
      resimulating: false,
    };

    this._buildSystems();
  }

  // Adapter-facing setters (browser only) -------------------------------

  /** Replace the particle emitter. Used by GameLoop after constructing
   *  ParticleSystem (which depends on Simulator's state). */
  setParticleEmitter(emitter: ParticleEmitter): void {
    this._particleEmitter = emitter;
  }

  /** Register a touch input provider for a specific slot. Set to null to disable.
   *  Installs a TouchAdapter into the playerInputs map for the new slot,
   *  replacing whatever PlayerInput was there. The previous touch slot's adapter
   *  is removed from the map (caller is responsible for restoring its prior
   *  input via setPlayerInput if needed). */
  setTouchInput(input: TouchInputProvider | null, slot: PlayerSlot | null): void {
    // Remove any TouchAdapter on the previous slot.
    if (this._touchSlot !== null) {
      const prev = this._playerInputs.get(this._touchSlot);
      if (prev instanceof TouchAdapter) this._playerInputs.delete(this._touchSlot);
    }
    this._touchSlot = input && slot ? slot : null;
    if (input && slot) {
      this._playerInputs.set(slot, new TouchAdapter(slot, input));
    }
  }

  /** Inject a getter for SFX cooldown state owned by the cosmetic adapter
   *  (PlayerTransitionSystem). Used by headbonk + crouch + zero-G sounds. */
  setSfxCooldownsGetter(getter: () => PlayerSfxCooldowns): void {
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

    // Refresh entity ctx for the new arena/theme/settings.
    this._entityCtx.arena = this._arena;
    this._entityCtx.theme = this._theme;
    this._entityCtx.settings = this._settings;
    this._entityCtx.players = this._state.players;

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

  /** Reverse `disconnectPlayer`. If the player was killed mid-disconnect,
   *  schedule a respawn at the standard delay so they pop back in cleanly. */
  reconnectPlayer(slot: PlayerSlot): void {
    const player = this._state.players.find(p => p.id === slot);
    if (!player) return;
    player.disconnected = false;
    player.active = true;
    if (player.state === 'splat') {
      player.state = 'respawning';
      player.respawnTimer = 1.5;
      player.splatTimer = 0;
    }
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

  /** Run one fixed-timestep simulation tick.
   *
   *  `ctxOrNetworkInputs` accepts either the new PlayerInputContext or the
   *  legacy Map<string, InputState> form (for backward compatibility with
   *  GameLoop callers and tests). When a Map is passed, it's wrapped into
   *  `{ networkInputs: <map> }`. The ctx is built once per tick and shared
   *  across every PlayerInput.getAction call. */
  fixedUpdate(dt: number, ctxOrNetworkInputs?: PlayerInputContext | ReadonlyMap<string, InputState>): void {
    // Normalize ctx once per tick. We always reuse `_mutCtx` (no allocation
    // per tick) and overwrite its fields. Map = legacy networkInputs arg;
    // plain object = new PlayerInputContext.
    if (!ctxOrNetworkInputs) {
      this._mutCtx.networkInputs = undefined;
    } else if (ctxOrNetworkInputs instanceof Map) {
      this._mutCtx.networkInputs = ctxOrNetworkInputs as ReadonlyMap<string, InputState>;
    } else {
      this._mutCtx.networkInputs = (ctxOrNetworkInputs as PlayerInputContext).networkInputs;
    }
    // Pre-compute airborne for the touch slot. Other slots ignore ctx.airborne.
    // Indexed loop avoids the per-tick `find(p => ...)` closure allocation.
    if (this._touchSlot !== null) {
      let tpAirborne = false;
      const players = this._state.players;
      for (let i = 0; i < players.length; i++) {
        if (players[i].id === this._touchSlot) {
          tpAirborne = players[i].state === 'airborne';
          break;
        }
      }
      this._mutCtx.airborne = tpAirborne;
    } else {
      this._mutCtx.airborne = undefined;
    }
    this._tickCtx = this._mutCtx;
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
    // Entity-registry fixedUpdate dispatch. Iteration order = registration
    // order (locked in `entities/index.ts > registerBuiltinEntities`) and
    // matches the original explicit call order: lavaRocks → ghosts →
    // geyserStates → scatterFlocks. Re-ordering invalidates the
    // determinism snapshots.
    this._entityCtx.dt = dt;
    this._entityCtx.resimulating = this._resimulating;
    const state = this._state;
    for (const e of getEntities()) {
      const tick = e.fixedUpdate;
      if (!tick) continue;
      tick((state as unknown as Record<string, unknown[]>)[e.id], this._entityCtx);
    }
    perfTrace.end('gameplay.arenaEntity', arenaEntityStart);

    const perPlayerStart = perfTrace.begin('simulator.perPlayerPhysics');

    for (const player of this._state.players) {
      if (!player.active) continue;
      // Status timers tick down even during hitstop.
      if (player.fatTimer > 0) player.fatTimer = Math.max(0, f(player.fatTimer - dt));
      if (player.slowTimer > 0) player.slowTimer = Math.max(0, f(player.slowTimer - dt));
      if (player.burnTimer > 0) player.burnTimer = Math.max(0, f(player.burnTimer - dt));
      if (player.hitstopTimer > 0) {
        player.hitstopTimer = Math.max(0, f(player.hitstopTimer - dt));
        if (player.hitstopTimer > 0) continue;
      }
      const pi = this._playerInputs.get(player.id);
      const input = pi ? pi.getAction(this._state, this._tickCtx) : Simulator._NEUTRAL_INPUT;
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
      resolveOutOfBoundsPlayer(player, this._arena, this._state.players, this._rng);
      if (player.vx !== 0 && player.vx > -1e-4 && player.vx < 1e-4) player.vx = 0;
      if (player.vy !== 0 && player.vy > -1e-4 && player.vy < 1e-4) player.vy = 0;
      updatePlayerState(player);

      if (wasAirborne && player.state === 'airborne' && prevVy < -10 && player.vy === 0) {
        const cd = this._sfxCooldownsGetter();
        if (cd.headbonk.isReady(player.id)) {
          this._events.onSfxRequest('headbonk');
          cd.headbonk.set(player.id, 0.15);
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
          const cd = this._sfxCooldownsGetter();
          if (cd.crouch.isReady(player.id)) {
            this._events.onSfxRequest('crouch');
            cd.crouch.set(player.id, 0.2);
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

      // Fat wobble — host-only (or local). squashScale is in the snapshot, so
      // applying this on the guest as well would compound the multiplication
      // and produce a visible vibration when fatPlayer mod is on.
      if (player.fatTimer > 0) {
        player.squashScale = f(player.squashScale * f(1 + f(fastSin(f(this._state.timeElapsed * 6)) * 0.05)));
      }

      // animFrame advance — was in PlayerCosmeticSystem but animFrame is in
      // the snapshot, so guest's local animTimer drift caused visible run-cycle
      // shake. Host advances authoritatively here, guest reads from snapshot.
      if (player.state === 'run') {
        player.animTimer = f(player.animTimer + dt);
        if (player.animTimer >= ANIM_FRAME_DURATION) {
          player.animTimer = f(player.animTimer - ANIM_FRAME_DURATION);
          player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
        }
      } else {
        player.animFrame = 0;
      }

      if (player.invincibleTimer <= 0 && player.vy <= 400) {
        let angry = false;
        const pcx = player.x + player.width / 2;
        const pcy = player.y + player.height / 2;
        for (const other of this._state.players) {
          if (other.id === player.id || !other.active || other.state === 'splat' || other.state === 'respawning') continue;
          const dx = (other.x + other.width / 2) - pcx;
          const dy = (other.y + other.height / 2) - pcy;
          if (dx > -80 && dx < 80 && dy > -60 && dy < 60) { angry = true; break; }
        }
        player.expression = angry ? 'angry' : 'normal';
      }
      // dizzy/scared overrides — moved here from PlayerCosmeticSystem so the
      // value is baked into the snapshot. Order matters: these win over the
      // angry/normal block above so a stomped player shows dizzy, and a
      // fast-falling non-angry player shows scared.
      if (player.invincibleTimer > 0) {
        player.expression = 'dizzy';
      } else if (player.vy > 400 && player.expression === 'normal') {
        player.expression = 'scared';
      }

      const ps = this._state.stats.perPlayer.get(player.id);
      if (ps) {
        if (player.state === 'airborne') ps.timeAirborne += dt;
        ps.distanceTraveled += (Math.abs(player.vx) + Math.abs(player.vy)) * dt;
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

      for (const flock of this._state.scatterFlocks) {
        if (!flock.active) continue;
        const dx = (player.x + player.width / 2) - flock.x;
        const dy = (player.y + player.height) - flock.y;
        const distSq = dx * dx + dy * dy;
        const r = flock.radius;
        if (flock.armed && distSq < r * r && player.state !== 'airborne') {
          flock.active = false;
          flock.armed = false;
          flock.respawnTimer = flock.respawnTime;
          this._events.onSfxRequest('pigeon_scatter');
          const count = SCATTER_PARTICLE_COUNT[flock.species];
          for (let pi = 0; pi < count; pi++) {
            const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.6;
            const speed = 130 + Math.random() * 160;
            flock.scatterParticles.push({
              x: flock.x + (Math.random() - 0.5) * 20,
              y: flock.y - 4,
              vx: Math.cos(angle) * speed * (flock.x > player.x ? 1 : -1),
              vy: Math.sin(angle) * speed - 60,
              life: 1.6 + Math.random() * 0.8,
              phase: Math.random() * Math.PI * 2,
              color: pickScatterColor(flock.species, Math.random()),
            });
          }
        } else if (!flock.armed && distSq > (r * 1.5) * (r * 1.5)) {
          flock.armed = true;
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

  private static readonly _NEUTRAL_INPUT: Readonly<InputState> = { left: false, right: false, jump: false, down: false };

  /** Test-only: drives the unified PlayerInput dispatch path so tests can
   *  assert the result without driving a full fixedUpdate tick.
   *
   *  Builds the same per-tick ctx as fixedUpdate would, then calls the
   *  registered PlayerInput.getAction directly. Returns the neutral default
   *  when no PlayerInput is registered for the slot. */
  getPlayerInputForTest(player: Player, networkInputs?: ReadonlyMap<string, InputState>): InputState {
    this._mutCtx.networkInputs = networkInputs;
    if (this._touchSlot !== null) {
      const tp = this._state.players.find(p => p.id === this._touchSlot);
      this._mutCtx.airborne = tp?.state === 'airborne';
    } else {
      this._mutCtx.airborne = undefined;
    }
    const pi = this._playerInputs.get(player.id);
    if (!pi) return Simulator._NEUTRAL_INPUT;
    return pi.getAction(this._state, this._mutCtx);
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
        if (!this._resimulating) {
          this._state.screenFlash = SCREEN_FLASH_DURATION;
          this._state.screenShake = 0;
        }
        this._matchSystem.cleanup();
        this._events.onMusicStopRequest();
        this._events.onMatchEnd(winner, this._state);
      },
    );
  }
}
