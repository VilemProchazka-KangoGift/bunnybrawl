import type {
  MatchState, MatchSettings, Arena, PlayerSlot, Player, Particle, Gib,
  WeatherParticle, MatchStats, PlayerStats, WildlifeEntity, EffectZone, Platform,
  InputState,
} from '../types';
import { isBotSlot } from '../types';
import { SeededRNG } from '../net/prng';
import { takeSnapshot as _takeSnapshot, restoreSnapshot as _restoreSnapshot } from '../net/serialize';
import type { GameSnapshot } from '../net/serialize';
import type { ThemeConfig } from '../themes/types';
import { getTheme, mirrorArena } from '../arenas';
import { randRange, pickWeighted, swapRemove } from '../themes/utils';
import { InputManager } from '../input';
import { TouchInputManager } from '../touchInput';
import { isTouchPrimary } from '../touchDetect';
import { haptics } from '../haptics';
import { Renderer } from '../renderer';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState, applyArenaConstraints, aabbOverlap, resolveStuckPlayer } from '../physics';
import { audio } from '../audio';
import {
  FIXED_TIMESTEP, MAX_FRAME_TIME,
  PLAYER_WIDTH, PLAYER_HEIGHT,
  CARROT_SPAWN_INTERVAL, CARROT_CHASE_SPAWN_INTERVAL,
  CARROT_FIRST_SPAWN_DELAY, CARROT_CHASE_FIRST_SPAWN_DELAY, CARROT_SIZE, GIANT_SCALE,
  FAT_DURATION, SPRING_BOUNCE,
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL,
  SLOW_MO_DURATION, SLOW_MO_FACTOR, HITSTOP_DURATION,
  SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  MATCH_COUNTDOWN,
  SCREEN_FLASH_DURATION,
  GRAVITY, FRICTION, MAX_WALK_SPEED, JUMP_IMPULSE, MAX_FALL_SPEED,
  BLOOD_COLOR,
} from '../constants';
import { getCharacterForSlot } from '../characters';
import { AIController } from '../ai';
import { debugFlags, toggleNavDebug, toggleNetDebug } from '../debugFlags';
import type { BotNavDebugState } from '../navDebugOverlay';
import type { NetDebugStats } from '../net/core/debugOverlay';

// Extracted submodules
import { emitParticle, spawnDustParticles, spawnGoreParticles, spawnConfetti, spawnCarrotVFX, spawnFirework, updateParticles, updateConfetti } from './cosmetics/particles';
import { launchGib, spawnGibs, updateGibs } from './cosmetics/gibs';
import { createWeatherParticle, updateWeather } from './cosmetics/environment';
import { decaySfxCooldowns, getOrCreateCooldowns, updateCrowdCheering, tickPeriodicAmbient } from './cosmetics/sfx';
import type { SfxCooldowns } from './cosmetics/sfx';
import { detectPlayerTransitions, snapshotPlayerCosmeticState } from './cosmetics/playerTransitions';
import { EnvironmentSystem } from './cosmetics/EnvironmentSystem';
import { EntityTransitionSystem } from './cosmetics/EntityTransitionSystem';
import type { PrevPlayerCosmeticState, TransitionCallbacks } from './cosmetics/playerTransitions';
import { updatePlayerCosmetics } from './cosmetics/playerCosmetics';
import { spawnSpring, spawnThorn, updateHazardLifetimes } from './gameplay/hazards';
import { spawnCarrot } from './gameplay/carrots';
import { updateLavaRocks, updateGhosts, updateGeyserTimers, updatePigeonFlocks } from './gameplay/arenaEntities';
import { applyEffectZones, updateZeroGSound } from './gameplay/effectZones';
import { checkMatchEnd as _checkMatchEnd, getPlayerInput as _getPlayerInput } from './gameplay/match';
import { handleSpringCollision, handleThornCollision, handleHazardZoneCollision, handleGhostCollision, handleLavaRockCollision, handleFallOff } from './gameplay/playerCollisions';
import type { HazardHitResult } from './gameplay/playerCollisions';
import { processStompsAndCollisions } from './gameplay/stomps';

/** Force 32-bit float for cross-architecture determinism (x86 80-bit vs ARM 64-bit). */
const f = Math.fround;

export type MatchEndCallback = (winner: PlayerSlot | null, state: MatchState) => void;

const CARROT_PICKUP_COLORS = ['#FF8C00', '#FF6600', '#FFA500', '#FF7700', '#FFD700', '#FF8C00'];


export class GameLoop {
  private arena: Arena;
  private originalArena: Arena;  // un-mirrored arena for theme rendering
  private settings: MatchSettings;
  private state: MatchState;
  private input: InputManager;
  private renderer: Renderer;
  private onMatchEnd: MatchEndCallback;
  private theme: ThemeConfig;

  // Effective physics (base constant * theme modifier)
  private effGravity: number;
  private effFriction: number;
  private effWalkSpeed: number;
  private effJumpImpulse: number;
  private effMaxFallSpeed: number;

  private lastTime = 0;
  private accumulator = 0;
  private rafId = 0;
  private running = false;
  private stopped = false;
  private paused = false;
  private particles: Particle[] = [];
  private particleFreeList: Particle[] = [];  // Recycled particle objects to reduce GC
  private fireworkTimer = 0;
  private afterimageAccumulators: Map<PlayerSlot, number> = new Map();
  private footstepAccumulators: Map<PlayerSlot, number> = new Map();
  private crowdStarted = false;
  private zeroGSoundPlaying = false;
  private cachedGeyserZones: EffectZone[] = [];
  private cachedZeroGZones: EffectZone[] = [];
  private geyserIndexMap: Map<EffectZone, number> = new Map();
  private floatingPlatforms: Array<{ plat: Platform; idx: number }> = [];
  private aiControllers: Map<string, AIController> = new Map();
  private newBloodDripsSinceRender: Array<{ x: number; y: number; radius: number; color: string }> = [];
  private newGroundedGibsSinceRender: Gib[] = [];
  private _debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  // SFX cooldowns (per-player, consolidated)
  private sfxCooldowns: Map<PlayerSlot, SfxCooldowns> = new Map();
  // Global bump cooldown (prevents double-fire from both pushed players)
  // bumpCooldown removed — bump detection now uses sideSquash transition in cosmeticStep

  // Touch input for mobile
  private touchInput: TouchInputManager | null = null;
  private touchSlot: PlayerSlot | null = null;

  // Per-theme ambient sound state
  private activeAmbientLoops: string[] = [];
  private periodicAmbientTimers: Map<string, number> = new Map();

  // Deterministic PRNG for network mode (undefined = use Math.random, local play)
  // Split into two streams so AI conditional calls can't desync spawn RNG
  private rng?: SeededRNG;
  private aiRng?: SeededRNG;

  // Network mode: when true, external code drives the loop
  private _networkMode = false;
  private _audioEnabled = true;
  private _resimulating = false; // true during rollback resimulation — skip cosmetic systems
  // Explicit inputs injected by rollback engine (keyed by PlayerSlot)
  private _networkInputs?: Map<string, InputState>;

  // Bound callbacks for extracted submodules (avoids .bind() allocations in hot paths)
  private readonly _boundGameRandom = (): number => this.gameRandom();
  private readonly _boundPlaySound = (name: string): void => this.playSound(name as Parameters<typeof audio.play>[0]);
  private readonly _boundEmitParticle = (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void =>
    this.emitParticle(x, y, vx, vy, life, size, color);
  private readonly _transitionCallbacks: TransitionCallbacks = {
    playSound: this._boundPlaySound,
    playAnimal: (name) => { if (this._audioEnabled) audio.playAnimal(name); },
    spawnDustParticles: (p, vy) => this.spawnDustParticles(p, vy),
    spawnKillSplatter: (v) => this.spawnKillSplatter(v),
    pickupCarrotVFX: (x, y) => this.pickupCarrotVFX(x, y),
  };

  // Previous-frame state for cosmetic transition detection (cosmeticStep)
  private prevCosmeticState: Map<PlayerSlot, PrevPlayerCosmeticState> = new Map();

  // CosmeticSystem instances
  private environmentSystem!: EnvironmentSystem;
  private entityTransitionSystem!: EntityTransitionSystem;

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: PlayerSlot[],
    onMatchEnd: MatchEndCallback,
    rng?: SeededRNG,
  ) {
    this.rng = rng; // Set before any gameRandom() calls in init
    // Derive separate AI RNG stream so AI conditional calls can't desync spawn RNG
    if (rng) this.aiRng = new SeededRNG(rng.getState() ^ 0x41495F52); // 'AI_R' xor
    this.arena = arena;
    this.originalArena = arena;
    this.settings = settings;
    this.onMatchEnd = onMatchEnd;
    this.theme = getTheme(arena.themeId);
    this.input = new InputManager();
    this.renderer = new Renderer(bgCanvas, fgCanvas, this.theme, settings.mods.mirrorArena);
    this.renderer.setTimeLimit(settings.timeLimit);

    // Compute effective physics from theme modifiers
    const pm = this.theme.physics;
    this.effGravity = GRAVITY * (pm?.gravity ?? 1);
    this.effFriction = FRICTION * (pm?.friction ?? 1);
    this.effWalkSpeed = MAX_WALK_SPEED * (pm?.walkSpeed ?? 1);
    this.effJumpImpulse = JUMP_IMPULSE * (pm?.jumpImpulse ?? 1);
    this.effMaxFallSpeed = MAX_FALL_SPEED * (pm?.gravity ?? 1); // scale with gravity

    // Apply mod physics multipliers (stacks with theme)
    if (settings.mods.turbo) {
      this.effWalkSpeed *= 2;
      this.effJumpImpulse *= 1.5;
    }

    // Underwater Gravity: floaty physics (stacks with theme)
    if (settings.mods.underwaterGravity) {
      this.effGravity *= 0.6;
      this.effMaxFallSpeed *= 0.6;
      this.effJumpImpulse *= 0.9;
    }

    // Super Bounce: mark all platforms as bouncy (shallow-copy arena to avoid mutation)
    if (settings.mods.superBounce) {
      this.arena = { ...arena, bouncyPlatforms: arena.platforms.map((_, i) => i) };
    }

    // Mirror Arena: flip all positions horizontally (shallow-copy)
    if (settings.mods.mirrorArena) {
      this.arena = mirrorArena(this.arena);
    }

    const pw = settings.mods.giantPlayers ? PLAYER_WIDTH * GIANT_SCALE : PLAYER_WIDTH;
    const ph = settings.mods.giantPlayers ? PLAYER_HEIGHT * GIANT_SCALE : PLAYER_HEIGHT;

    const players: Player[] = activePlayers.map((slot, index) => ({
      id: slot,
      character: getCharacterForSlot(slot),
      x: this.arena.spawnPoints[index % this.arena.spawnPoints.length].x - pw / 2,
      y: this.arena.spawnPoints[index % this.arena.spawnPoints.length].y - ph,
      vx: 0, vy: 0,
      width: pw, height: ph,
      state: 'idle' as const, facing: 'right' as const,
      splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
      score: 0, active: true, animFrame: 0, animTimer: 0,
      fastFalling: false, fatTimer: 0, slowTimer: 0,
      squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [], idleAnimTimer: 0,
      expression: 'normal' as const, killStreak: 0,
      breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
      renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
    }));

    // Init AI controllers for bot players
    const botDifficulty = settings.botDifficulty ?? 'medium';
    let botIndex = 0;
    for (const player of players) {
      if (isBotSlot(player.id)) {
        this.aiControllers.set(player.id, new AIController(player.id, player.character.name, botDifficulty, botIndex++, this.aiRng));
      }
    }

    // Init weather particles from theme config
    const weather: WeatherParticle[] = [];
    for (let i = 0; i < this.theme.weather.particleCount; i++) {
      weather.push(this.createWeatherParticle(true));
    }

    // Init stats
    const statsMap = new Map<PlayerSlot, PlayerStats>();
    for (const slot of activePlayers) {
      statsMap.set(slot, { bestStreak: 0, timeAirborne: 0, distanceTraveled: 0, carrotsEaten: 0 });
    }
    const stats: MatchStats = { perPlayer: statsMap };

    const wildlife: WildlifeEntity[] = [];
    const wc = this.theme.wildlife;
    for (let i = 0; i < wc.count; i++) {
      const chosen = pickWeighted(wc.types);
      wildlife.push({
        type: chosen.type,
        x: chosen.type === 'bird' ? -50 - Math.random() * 100 : Math.random() * CANVAS_WIDTH,
        y: randRange(chosen.yRange) * CANVAS_HEIGHT,
        vx: randRange(chosen.speedRange),
        vy: 0,
        wingPhase: Math.random() * Math.PI * 2,
        color: chosen.colors[Math.floor(Math.random() * chosen.colors.length)],
      });
    }

    const fc = this.theme.fog;
    const fogParticles: Array<{x: number; y: number; vx: number; alpha: number}> = [];
    for (let i = 0; i < fc.count; i++) {
      fogParticles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: fc.baseY + (Math.random() * 2 - 1) * fc.yVariance,
        vx: randRange(fc.speedRange),
        alpha: randRange(fc.alphaRange),
      });
    }

    const ac = this.theme.ambientParticles;
    const pollenParticles: Array<{x: number; y: number; vx: number; vy: number; size: number; alpha: number}> = [];
    for (let i = 0; i < ac.count; i++) {
      pollenParticles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: randRange(ac.vxRange),
        vy: randRange(ac.vyRange),
        size: randRange(ac.sizeRange),
        alpha: randRange(ac.alphaRange),
      });
    }

    this.state = {
      players,
      killFeed: [],
      timeElapsed: 0, matchOver: false, winner: null,
      carrots: [], carrotTimer: settings.mods.carrotChase ? CARROT_CHASE_FIRST_SPAWN_DELAY : CARROT_FIRST_SPAWN_DELAY,
      springs: [], thorns: [],
      springSpawnTimer: 5, // first spring after 5s
      thornSpawnTimer: 8,  // first thorn after 8s
      screenShake: 0, slowMotion: 0, hitstopZoom: 0,
      weather,
      dayPhase: 0,
      countdown: MATCH_COUNTDOWN,
      stats,
      shockwaves: [],
      screenFlash: 0,
      wildlife,
      fogParticles,
      pollenParticles,
      shootingStars: [],
      scoreAnimations: [],
      ghosts: [],
      lavaRocks: [],
      lavaRockTimer: this.theme.lavaRockConfig ? this.theme.lavaRockConfig.spawnInterval[0] + this.gameRandom() * (this.theme.lavaRockConfig.spawnInterval[1] - this.theme.lavaRockConfig.spawnInterval[0]) : 9999,

      geyserStates: (arena.effectZones || []).filter(z => z.type === 'geyser').map(z => ({
        timer: (z.interval || 10) * this.gameRandom(),
        active: false,
        activeTimer: 0,
      })),
      pigeonFlocks: (this.theme.pigeonConfig?.positions || []).map(p => ({
        x: p.x, y: p.y, active: true, respawnTimer: 0,
        scatterParticles: [],
      })),
      bouncyWobble: new Map(),
      gibs: [],
      confetti: [],
    };

    // Cache filtered zone arrays (arena-static, avoids per-frame allocations)
    this.cachedGeyserZones = (arena.effectZones || []).filter(z => z.type === 'geyser');
    this.cachedZeroGZones = (arena.effectZones || []).filter(z => z.type === 'zero_g');
    this.geyserIndexMap = new Map(this.cachedGeyserZones.map((z, i) => [z, i]));
    // Cache floating platforms with indices for hazard spawning
    const noSpawn = this.arena.noSpawnZones ?? [];
    this.floatingPlatforms = this.arena.platforms
      .map((p, i) => ({ plat: p, idx: i }))
      .filter(({ plat }) => {
        if (plat.y >= 650) return false; // ground platforms
        // Exclude platforms inside no-spawn zones (e.g. mausoleum)
        const cx = plat.x + plat.width / 2;
        const cy = plat.y + plat.height / 2;
        for (const z of noSpawn) {
          if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) return false;
        }
        return true;
      });

    // Initialize ghosts from theme config
    if (this.theme.ghostConfig) {
      const gc = this.theme.ghostConfig;
      for (let i = 0; i < gc.count; i++) {
        this.state.ghosts.push({
          x: this.gameRandom() * CANVAS_WIDTH,
          y: 300 + this.gameRandom() * 300,
          vx: (this.gameRandom() < 0.5 ? -1 : 1) * gc.speed * (0.7 + this.gameRandom() * 0.6),
          size: gc.size,
          alpha: 0.5 + this.gameRandom() * 0.3,
          wobblePhase: this.gameRandom() * Math.PI * 2,
        });
      }
    }

    // Touch input for mobile: controls the first human player
    if (isTouchPrimary()) {
      this.touchInput = new TouchInputManager();
      this.touchSlot = activePlayers.find(s => !isBotSlot(s)) ?? null;
      if (this.touchSlot) haptics.init(this.touchSlot);
    }

    // Initialize prev-state tracking for cosmeticStep transition detection
    for (const p of this.state.players) {
      this.prevCosmeticState.set(p.id, snapshotPlayerCosmeticState(p));
    }
    this.environmentSystem = new EnvironmentSystem(this.state, this.theme);
    this.entityTransitionSystem = new EntityTransitionSystem(this.state, this._boundPlaySound);
    this.entityTransitionSystem.init();
  }

  private createWeatherParticle(randomY: boolean): WeatherParticle {
    return createWeatherParticle(this.theme, randomY);
  }

  start(): void {
    this.input.attach();
    if (this.touchInput) {
      const container = document.querySelector('.game-scaler-content') as HTMLElement | null;
      if (container) {
        const scaleFn = () => container.getBoundingClientRect().width / CANVAS_WIDTH;
        this.touchInput.attach(container, scaleFn, () => this.paused);
      }
    }
    this.renderer.renderBackground(this.arena, this.originalArena);
    this.running = true;
    this.lastTime = performance.now();
    audio.playMusic(this.arena.themeId);
    this.playSound('ambient');
    // Start theme ambient loops
    const ambConfig = this.theme.ambientSoundConfig;
    if (ambConfig?.loops) {
      for (const loop of ambConfig.loops) {
        this.playSound(loop);
        this.activeAmbientLoops.push(loop);
      }
    }
    // Initialize periodic ambient timers with random first-fire delay
    if (ambConfig?.periodic) {
      for (const p of ambConfig.periodic) {
        const delay = p.intervalRange[0] + Math.random() * (p.intervalRange[1] - p.intervalRange[0]);
        this.periodicAmbientTimers.set(p.sound, delay);
      }
    }
    if (debugFlags.navDebugAllowed || debugFlags.netDebugAllowed) {
      this._debugKeyHandler = (e: KeyboardEvent) => {
        if (e.key === '`') {
          if (debugFlags.navDebugAllowed) toggleNavDebug();
          if (debugFlags.netDebugAllowed) toggleNetDebug();
        }
      };
      window.addEventListener('keydown', this._debugKeyHandler);
    }
    // In network mode, the external NetMatch drives the loop
    if (!this._networkMode) {
      this.loop(this.lastTime);
    }
  }

  stop(): void {
    this.running = false;
    this.stopped = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.input.detach();
    this.touchInput?.detach();
    audio.stopAllGameSounds();
    this.activeAmbientLoops = [];
    this.periodicAmbientTimers.clear();
    if (this._debugKeyHandler) {
      window.removeEventListener('keydown', this._debugKeyHandler);
      this._debugKeyHandler = null;
    }
  }

  /** Play a sound, respecting audio mute (used during rollback resimulation). */
  private playSound(name: Parameters<typeof audio.play>[0]): void {
    if (this._audioEnabled) audio.play(name);
  }

  /** Gameplay-affecting random: seeded in network mode, Math.random() in local. */
  private gameRandom(): number {
    return this.rng ? this.rng.nextFloat() : Math.random();
  }

  /** Set a seeded PRNG for deterministic network play. */
  setRng(rng: SeededRNG): void {
    this.rng = rng;
    // AI uses separate stream — propagate aiRng, not main rng
    for (const ai of this.aiControllers.values()) {
      ai.setRng(this.aiRng ?? rng);
    }
  }

  /** Get the current RNG (for snapshots). */
  getRng(): SeededRNG | undefined {
    return this.rng;
  }

  /** Get the AI RNG (for snapshots). */
  getAiRng(): SeededRNG | undefined {
    return this.aiRng;
  }

  /** Get AI controllers map (for snapshots). */
  getAIControllers(): Map<string, AIController> {
    return this.aiControllers;
  }

  /** Read merged input from all key bindings + touch (for online play). */
  getInputAny(): InputState {
    const kb = this.input.getInputAny();
    if (this.touchInput) {
      // Network mode: skip airborne conversion — host applies it in getPlayerInput()
      // using authoritative state. Jump latch preserves across message overwrites.
      const touchPlayer = this.touchSlot
        ? this.state.players.find(p => p.id === this.touchSlot)
        : null;
      const airborne = this._networkMode
        ? false  // network mode: never convert, host applies conversion in getPlayerInput()
        : touchPlayer?.state === 'airborne';
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
  }

  /** Update net debug stats (forwarded to renderer for overlay). */
  setNetDebugStats(stats: NetDebugStats | null): void {
    this.renderer.setNetDebugStats(stats);
  }

  /** Set custom player display names for online mode (forwarded to renderer for HUD). */
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
    if (this.touchInput && slot) haptics.init(slot);
  }

  /** Mark a player as disconnected — kill them and prevent respawn. */
  disconnectPlayer(slot: PlayerSlot): void {
    const player = this.state.players.find(p => p.id === slot);
    if (!player) return;
    player.disconnected = true;
    // Kill the player if alive — they'll show as a corpse
    if (player.state !== 'splat' && player.state !== 'respawning') {
      player.state = 'splat';
      player.splatTimer = 999999; // never auto-advance to respawning
    }
  }

  /** Mute/unmute audio (used during rollback resimulation). */
  setAudioEnabled(enabled: boolean): void {
    this._audioEnabled = enabled;
  }

  /** Mark that we're in rollback resimulation — cosmetic systems will be skipped. */
  setResimulating(resim: boolean): void {
    this._resimulating = resim;
  }

  /** Tick all cosmetic-only systems (particles, environment, visual decays).
   *  Called once per frame from local loop(), host loop, and guest loop. */
  cosmeticStep(dt: number): void {
    // --- Per-player cosmetic systems ---
    for (const player of this.state.players) {
      if (!player.active) continue;

      // SFX cooldown decay (must tick even during hitstop so cooldowns don't accumulate)
      decaySfxCooldowns(this.sfxCooldowns, player.id, dt);

      // Cosmetic timer decay (runs even during hitstop for smooth visuals)
      if (player.damageFlashTimer > 0) player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
      if (player.springTrailTimer > 0) player.springTrailTimer = Math.max(0, player.springTrailTimer - dt);

      // --- Transition-triggered effects (must fire even during hitstop, e.g. stomp) ---
      {
        const prev = this.prevCosmeticState.get(player.id);
        if (prev) {
          detectPlayerTransitions(player, prev, this.state, this.sfxCooldowns, this._transitionCallbacks);
        } else {
          this.prevCosmeticState.set(player.id, snapshotPlayerCosmeticState(player));
        }
      }

      // Skip remaining cosmetic systems during hitstop (player is frozen)
      if (player.hitstopTimer > 0) continue;

      updatePlayerCosmetics(
        player, dt, this.state.timeElapsed, this.effWalkSpeed,
        this.afterimageAccumulators, this.footstepAccumulators,
        this._boundEmitParticle, this._boundPlaySound,
      );

    }

    // --- Entity transition detection ---
    this.entityTransitionSystem.cosmeticUpdate(dt);

    // NOTE: The following minor effects remain in fixedUpdate (host-only, acceptable):
    // - crouch sound (depends on input.down + wasCrouching local var)
    // - zero_g loop (depends on zone occupancy check + start/stop)
    // - splash sound (depends on landing-in-waterfall-zone detection)
    // - pigeon_scatter (depends on proximity check with pigeon flocks)
    // - crowd cheering (depends on score proximity to kill limit + volume ramp)
    // - periodic ambient sounds (depends on timer-based random intervals)
    // - collision particles for thorn/hazard/ghost/lava rock (depend on exact collision position)

    // --- Particle systems (moves to ParticleSystem in Task 3) ---
    this._updateWeather(dt);
    this._updateParticles(dt);
    this._updateGibs(dt);
    this._updateConfetti(dt);

    // --- Environment ---
    this.environmentSystem.cosmeticUpdate(dt);
  }

  // Public VFX methods removed — cosmeticStep() calls private methods directly.

  /** Render current frame. Public for network loop. */
  renderFrame(frameDt?: number): void {
    // In network mode, decay real-time timers that are normally handled in loop()
    if (this._networkMode && frameDt !== undefined && frameDt > 0) {
      if (this.state.slowMotion > 0) this.state.slowMotion = Math.max(0, this.state.slowMotion - frameDt);
      if (this.state.screenFlash > 0) this.state.screenFlash = Math.max(0, this.state.screenFlash - frameDt);
      if (this.state.hitstopZoom > 0) this.state.hitstopZoom = Math.max(0, this.state.hitstopZoom - frameDt);
      // Fireworks when match is over
      if (this.state.matchOver) {
        this.fireworkTimer -= frameDt;
        if (this.fireworkTimer <= 0) {
          this.fireworkTimer = 0.3;
          this.spawnFirework();
        }
        this._updateParticles(frameDt);
        this._updateGibs(frameDt);
        this._updateConfetti(frameDt);
      }
    }
    // Bake settled gibs/blood
    if (this.newGroundedGibsSinceRender.length > 0) {
      this.renderer.bakeGibs(this.newGroundedGibsSinceRender);
      this.newGroundedGibsSinceRender.length = 0;
    }
    if (this.newBloodDripsSinceRender.length > 0) {
      this.renderer.renderBloodDrips(this.newBloodDripsSinceRender);
      this.newBloodDripsSinceRender.length = 0;
    }
    this.renderer.renderFrame(this.state, this.arena, this.particles);
  }

  /** Capture a snapshot of all gameplay state for rollback. */
  takeSnapshot(frame: number): GameSnapshot {
    return _takeSnapshot(frame, this.state, this.rng, this.aiControllers, this.aiRng);
  }

  /** Restore gameplay state from a snapshot for rollback. */
  restoreSnapshot(snap: GameSnapshot): void {
    _restoreSnapshot(snap, this.state, this.rng, this.aiControllers, this.aiRng);
  }

  getState(): MatchState { return this.state; }
  getRendererDiagnostics() { return this.renderer.getDiagnostics(); }
  pause(): void { this.paused = true; audio.setPaused(true); }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.setPaused(false, this.arena.themeId); }
  isPaused(): boolean { return this.paused; }
  skipCountdown(): void {
    if (this.state.countdown > 0) {
      this.state.countdown = 0;
      // countdown_go sound will fire from cosmeticStep transition detection
    }
  }

  private loop = (currentTime: number): void => {
    if (!this.running) return;

    if (this.paused) {
      this.lastTime = currentTime;
      this.renderer.renderFrame(this.state, this.arena, this.particles);
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    // Slow-motion affects accumulation
    const timeScale = this.state.slowMotion > 0 ? SLOW_MO_FACTOR : 1;
    this.accumulator += frameTime * timeScale;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }

    // Cosmetic systems (particles, environment, visual decays) — local play only.
    // Network mode: host and guest call cosmeticStep from their own loops (netMatch.ts).
    if (!this._networkMode) {
      this.cosmeticStep(FIXED_TIMESTEP);
    }

    // Timers that run in real time (not affected by fixedUpdate early return)
    if (this.state.slowMotion > 0) {
      this.state.slowMotion = Math.max(0, this.state.slowMotion - frameTime);
    }
    if (this.state.screenFlash > 0) {
      this.state.screenFlash = Math.max(0, this.state.screenFlash - frameTime);
    }
    if (this.state.hitstopZoom > 0) {
      this.state.hitstopZoom = Math.max(0, this.state.hitstopZoom - frameTime);
    }

    // Fireworks when match is over
    if (this.state.matchOver) {
      this.fireworkTimer -= frameTime;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.3;
        this.spawnFirework();
      }
      this._updateParticles(frameTime);
      this._updateGibs(frameTime);
      this._updateConfetti(frameTime);
    }

    // Render — bake settled gibs and blood drips onto persistent background canvas
    if (this.newGroundedGibsSinceRender.length > 0) {
      this.renderer.bakeGibs(this.newGroundedGibsSinceRender);
      this.newGroundedGibsSinceRender.length = 0;
    }
    if (this.newBloodDripsSinceRender.length > 0) {
      this.renderer.renderBloodDrips(this.newBloodDripsSinceRender);
      this.newBloodDripsSinceRender.length = 0;
    }

    // Collect bot nav debug state (zero cost when overlay is off)
    if (debugFlags.navDebugEnabled) {
      const botStates: BotNavDebugState[] = [];
      for (const player of this.state.players) {
        const ai = this.aiControllers.get(player.id);
        if (ai && player.active && player.state !== 'splat' && player.state !== 'respawning') {
          botStates.push({ slot: player.id, x: player.x, y: player.y, navTarget: ai.getLastNavTarget() });
        }
      }
      this.renderer.setBotNavDebugStates(botStates);
    }

    this.renderer.renderFrame(this.state, this.arena, this.particles);
    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---- Hazard spawning (delegates to gameplay/hazards) ----

  private _spawnSpring(): void {
    spawnSpring(this.state, this.floatingPlatforms, this.arena.platforms, this.arena.noSprings, this._boundGameRandom);
  }

  private _spawnThorn(): void {
    spawnThorn(this.state, this.floatingPlatforms, this._boundGameRandom);
  }

  /** Emit a particle via the pool. */
  private emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void {
    emitParticle(this.particles, this.particleFreeList, x, y, vx, vy, life, size, color);
  }

  // ---- Particle spawners (delegates to cosmetics/) ----

  private spawnDustParticles(player: Player, landVy: number): void {
    spawnDustParticles(this.particles, this.particleFreeList, player, landVy);
  }

  /** Orchestration: connects gore particles, gibs, and confetti modules. */
  private spawnKillSplatter(victim: Player): void {
    if (this.settings.goreMode) {
      spawnGoreParticles(this.particles, this.particleFreeList, victim, this.settings.mods.extremeGore);
    }
    spawnGibs(this.state.gibs, victim, this.settings);
    if (!this.settings.goreMode) {
      spawnConfetti(this.state.confetti, victim);
    }
  }

  /** Orchestration: connects gib launcher + particle emitter for carrot pickup. */
  private pickupCarrotVFX(x: number, y: number): void {
    const cy = y + CARROT_SIZE / 2;
    // Orange carrot chunks
    for (let i = 0; i < 4; i++) {
      const s = 4 + Math.random() * 3;
      launchGib(this.state.gibs, x, cy, 10, 0.15, 0.85, 80, 200, s, s, '#FF8C00', '#CC6600', '#FFB040', '', 'body');
    }
    // Green leaf pieces
    for (let i = 0; i < 2; i++) {
      launchGib(this.state.gibs, x, cy, 8, 0.2, 0.8, 60, 160, 5, 3, '#4CAF50', '#2E7D32', '#81C784', '', 'body');
    }
    // Orange/gold particle burst
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 140;
      const life = 0.3 + Math.random() * 0.4;
      this.emitParticle(x, cy, Math.cos(angle) * speed, Math.sin(angle) * speed - 50, life, 2 + Math.random() * 5, CARROT_PICKUP_COLORS[i % CARROT_PICKUP_COLORS.length]);
    }
    // Upward gold sparkle ring
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 30 + Math.random() * 30;
      this.emitParticle(x, cy, Math.cos(angle) * speed, -50 - Math.random() * 40, 0.4 + Math.random() * 0.2, 1.5 + Math.random() * 2, '#FFD700');
    }
  }

  private spawnFirework(): void {
    spawnFirework(this.particles, this.particleFreeList);
  }

  // ---- Carrot spawning (delegates to gameplay/carrots) ----

  private _spawnCarrot(): void {
    const prevCount = this.state.carrots.length;
    spawnCarrot(this.state, this.arena, this.cachedZeroGZones, this._boundGameRandom);
    // Spawn VFX if a carrot was added
    if (this.state.carrots.length > prevCount) {
      const newCarrot = this.state.carrots[this.state.carrots.length - 1];
      spawnCarrotVFX(this.particles, this.particleFreeList, newCarrot.x, newCarrot.y);
    }
  }

  // ---- Updates ----

  private _updateParticles(dt: number): void {
    updateParticles(this.particles, this.particleFreeList, this.arena.platforms, this.settings.goreMode, this.newBloodDripsSinceRender, dt);
  }

  private _updateGibs(dt: number): void {
    updateGibs(this.state.gibs, this.arena.platforms, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, this.newGroundedGibsSinceRender, dt);
  }

  private _updateConfetti(dt: number): void {
    updateConfetti(this.state.confetti, this.state.timeElapsed, dt);
  }

  private _updateWeather(dt: number): void {
    updateWeather(this.state, this.theme, dt);
  }

  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    this._networkInputs = networkInputs;
    if (this.stopped || this.state.matchOver) return;
    this.state.timeElapsed = f(this.state.timeElapsed + dt);

    // Day/night cycle
    this.state.dayPhase = f(this.state.dayPhase + f(dt / this.theme.dayNight.cycleDuration));
    if (this.state.dayPhase > 1) this.state.dayPhase = f(this.state.dayPhase - 1);

    // Countdown logic
    if (this.state.countdown > 0) {
      this.state.countdown = f(this.state.countdown - dt);
      if (this.state.countdown <= 0) {
        this.state.countdown = 0;
      }
      // Countdown sounds moved to cosmeticStep. Particles/weather handled by cosmeticStep too.
      return;
    }

    // Screen shake decay (skip during resimulation — writes are also guarded)
    if (!this._resimulating && this.state.screenShake > 0) this.state.screenShake = Math.max(0, this.state.screenShake - dt);

    // Hazard spawn timers (fround prevents cross-arch zero-crossing divergence → RNG desync)
    this.state.springSpawnTimer = f(this.state.springSpawnTimer - dt);
    if (this.state.springSpawnTimer <= 0) {
      this._spawnSpring();
      this.state.springSpawnTimer = SPRING_SPAWN_INTERVAL;
    }
    this.state.thornSpawnTimer = f(this.state.thornSpawnTimer - dt);
    if (this.state.thornSpawnTimer <= 0) {
      this._spawnThorn();
      this.state.thornSpawnTimer = THORN_SPAWN_INTERVAL;
    }

    // Update hazard lifetimes + grow timers
    updateHazardLifetimes(this.state, dt);

    // Carrot timer
    this.state.carrotTimer = f(this.state.carrotTimer - dt);
    if (this.state.carrotTimer <= 0) {
      this._spawnCarrot();
      this.state.carrotTimer = this.settings.mods.carrotChase ? CARROT_CHASE_SPAWN_INTERVAL : CARROT_SPAWN_INTERVAL;
    }

    // Weather moved to cosmeticStep

    // Update arena entities (lava rocks, ghosts, geysers, pigeons)
    updateLavaRocks(this.state, this.theme, dt, this._boundGameRandom);
    updateGhosts(this.state, dt);
    updateGeyserTimers(this.state, this.cachedGeyserZones, dt);
    updatePigeonFlocks(this.state, dt);

    // Gameplay timers (hitstop gates physics; fat/slow/burn affect gameplay)
    // Cosmetic timers (animFrame, damageFlash, springTrail, fire particles) moved to cosmeticStep()
    for (const player of this.state.players) {
      if (!player.active) continue;
      // Hitstop: decay timer + status timers, but skip physics
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

    // bumpCooldown removed — bump detection uses sideSquash transition in cosmeticStep

    // Input + physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      // SFX cooldown decay moved to cosmeticStep()
      if (player.hitstopTimer > 0) continue;
      const input = this.getPlayerInput(player);
      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;
      const wasCrouching = player.squashScale <= SQUASH_ON_CROUCH;

      // Bot walk speed penalty (easy bots move slower)
      let playerWalkSpeed = this.effWalkSpeed;
      if (isBotSlot(player.id)) {
        const ai = this.aiControllers.get(player.id);
        if (ai) playerWalkSpeed *= ai.getWalkSpeedMult();
      }
      applyInput(player, input, dt, playerWalkSpeed, this.effFriction, this.effJumpImpulse);

      if (!wasAirborne && player.state === 'airborne') {
        // Stretch on jump
        player.squashScale = STRETCH_ON_JUMP;
        player.squashTimer = 0.15;
      }

      applyGravity(player, dt, this.effGravity, this.effMaxFallSpeed);
      movePlayer(player, dt);
      collidePlatforms(player, this.arena.platforms);
      resolveStuckPlayer(player, this.arena.platforms);
      applyArenaConstraints(player, this.arena);
      // Snap tiny values to zero: prevents ARM Flush-to-Zero (FTZ) subnormal
      // divergence and signed-zero hash mismatches (-0 vs +0)
      if (player.vx !== 0 && player.vx > -1e-4 && player.vx < 1e-4) player.vx = 0;
      if (player.vy !== 0 && player.vy > -1e-4 && player.vy < 1e-4) player.vy = 0;
      updatePlayerState(player);

      // Headbonk: ceiling collision clamped vy to 0 while going up
      if (wasAirborne && player.state === 'airborne' && prevVy < -10 && player.vy === 0) {
        const cd = getOrCreateCooldowns(this.sfxCooldowns, player.id);
        if (cd.headbonk <= 0) {
          this.playSound('headbonk');
          cd.headbonk = 0.15;
        }
      }

      // Landing detection
      const justLanded = wasAirborne && player.state !== 'airborne';

      if (justLanded && haptics.isLocal(player.id)) haptics.landing(prevVy);

      // Wall hit: squash/stretch (sound moved to cosmeticStep)
      if (Math.abs(prevVx) > 100 && player.vx === 0 && prevVx !== 0) {
        player.squashScale = 1.3; // stretch vertically = squash horizontally
        player.squashTimer = 0.12;
      }

      // Squash on landing
      if (justLanded) {
        player.squashScale = SQUASH_ON_LAND;
        player.squashTimer = 0.15;

        // Platform crumble when landing hard — chunks fly UP and outward
        if (prevVy > 300) {
          const cx = player.x + player.width / 2;
          const groundY = player.y + player.height;
          const intensity = Math.min(prevVy / 400, 2);
          const count = Math.floor(8 + intensity * 5);
          for (let i = 0; i < count; i++) {
            const life = 0.3 + Math.random() * 0.4;
            this.emitParticle(cx + (Math.random() - 0.5) * player.width * 1.5, groundY - Math.random() * 3, (Math.random() - 0.5) * 100 * intensity, -(Math.random() * 60 + 30) * intensity, life, 2 + Math.random() * 3, i % 3 === 0 ? this.theme.platform.floatingBodyColor : this.theme.platform.groundTopColor);
          }
        }
      }

      // Squash when pressing down on ground (crouch)
      if (input.down && player.state !== 'airborne') {
        player.squashScale = SQUASH_ON_CROUCH;
        // Crouch sound: only on initial sit-down
        if (!wasCrouching) {
          const cd = getOrCreateCooldowns(this.sfxCooldowns, player.id);
          if (cd.crouch <= 0) {
            this.playSound('crouch');
            cd.crouch = 0.2;
          }
        }
      } else {
        // Squash/stretch decay
        if (player.squashTimer > 0) {
          player.squashTimer = f(player.squashTimer - dt);
          player.squashScale = f(player.squashScale + f(f(1.0 - player.squashScale) * f(SQUASH_DECAY_SPEED * dt)));
        } else {
          player.squashScale = 1.0;
        }
      }

      // Side squash decay, fat wobble, expressions (dizzy/scared), idle anim,
      // afterimages, footstep sounds all moved to cosmeticStep()

      // Angry expression (proximity check requires iterating other players — stays in fixedUpdate)
      if (player.invincibleTimer <= 0 && player.vy <= 400) {
        let angry = false;
        for (const other of this.state.players) {
          if (other.id === player.id || !other.active || other.state === 'splat' || other.state === 'respawning') continue;
          const dx = Math.abs((other.x + other.width / 2) - (player.x + player.width / 2));
          const dy = Math.abs((other.y + other.height / 2) - (player.y + player.height / 2));
          if (dx < 80 && dy < 60) { angry = true; break; }
        }
        player.expression = angry ? 'angry' : 'normal';
      }

      // Stats: airborne time
      if (player.state === 'airborne') {
        const ps = this.state.stats.perPlayer.get(player.id);
        if (ps) ps.timeAirborne += dt;
      }
      // Stats: distance traveled
      {
        const ps = this.state.stats.perPlayer.get(player.id);
        if (ps) ps.distanceTraveled += (Math.abs(player.vx) * dt + Math.abs(player.vy) * dt);
      }

      // Hazard collisions
      const springHit = handleSpringCollision(player, this.state);
      if (springHit) this.applyHazardHitVFX(springHit, player.id);

      const thornHit = handleThornCollision(player, this.state);
      if (thornHit) this.applyHazardHitVFX(thornHit, player.id);

      const hzHit = handleHazardZoneCollision(player, this.arena);
      if (hzHit) this.applyHazardHitVFX(hzHit, player.id);

      const ghostHit = handleGhostCollision(player, this.state);
      if (ghostHit) this.applyHazardHitVFX(ghostHit, player.id);

      const rockHit = handleLavaRockCollision(player, this.state);
      if (rockHit) this.applyHazardHitVFX(rockHit, player.id);

      const fell = handleFallOff(player, this.arena, this.state);
      if (fell) this.applyHazardHitVFX(fell, player.id);


      // Effect zone interactions (zero-G, current, geyser)
      if (this.arena.effectZones) {
        applyEffectZones(player, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, justLanded, wasAirborne, prevVy, this.sfxCooldowns, this._boundPlaySound, dt);
      }

      // Bouncy platform check (on landing — skip if holding down on ground to avoid repeat bouncing)
      if (this.arena.bouncyPlatforms && justLanded && !(input.down && prevVy < 100)) {
        for (const bi of this.arena.bouncyPlatforms) {
          const bp = this.arena.platforms[bi];
          if (!bp) continue;
          const playerBottom = player.y + player.height;
          const playerCx = player.x + player.width / 2;
          if (playerBottom >= bp.y && playerBottom <= bp.y + bp.height + 4 &&
              playerCx >= bp.x && playerCx <= bp.x + bp.width) {
            player.vy = f(SPRING_BOUNCE * 0.85);
            player.state = 'airborne';
            this.state.bouncyWobble.set(bi, 0.4);
            // jump sound moved to cosmeticStep (grounded→airborne transition)
            break;
          }
        }
      }

      // Pigeon scatter check
      for (const flock of this.state.pigeonFlocks) {
        if (!flock.active) continue;
        const dx = (player.x + player.width / 2) - flock.x;
        const dy = (player.y + player.height) - flock.y;
        if (dx * dx + dy * dy < 60 * 60 && player.state !== 'airborne') {
          flock.active = false;
          flock.respawnTimer = this.theme.pigeonConfig?.respawnTime || 12;
          this.playSound('pigeon_scatter');
          // Spawn scatter particles (gray birds flying away)
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

      // Carrot pickup
      for (const carrot of this.state.carrots) {
        if (!carrot.active) continue;
        if (aabbOverlap(player.x, player.y, player.width, player.height, carrot.x - CARROT_SIZE / 2, carrot.y, CARROT_SIZE, CARROT_SIZE)) {
          carrot.active = false;
          player.score += 1;
          player.fatTimer = FAT_DURATION;
          // Crunch sound + VFX fired by cosmeticStep via score-change transition detection
          // (works on both host and guest — entity removal doesn't matter since score is in snapshot)
          // Hitstop — shorter than kill (half duration)
          player.hitstopTimer = Math.max(player.hitstopTimer, HITSTOP_DURATION * 0.5);
          if (!this._resimulating) this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HITSTOP_DURATION * 0.5);
          // Stats: carrots eaten
          const ps = this.state.stats.perPlayer.get(player.id);
          if (ps) ps.carrotsEaten += 1;
        }
      }
    }

    for (let i = this.state.carrots.length - 1; i >= 0; i--) {
      if (!this.state.carrots[i].active) {
        swapRemove(this.state.carrots, i);
      }
    }

    // Zero-G ambient sound management
    this.zeroGSoundPlaying = updateZeroGSound(this.state.players, this.cachedZeroGZones, this.zeroGSoundPlaying, this._boundPlaySound);

    // Stomps, kill feed, player-player collision, splat timers
    processStompsAndCollisions(this.state, this.arena, this.settings, dt, this._resimulating, this.rng);

    // Minor sound effects that remain in fixedUpdate (host-only, depend on complex fixedUpdate context)
    if (!this._resimulating) {
      this.crowdStarted = updateCrowdCheering(this.state, this.settings, this.crowdStarted, this._boundPlaySound);
      tickPeriodicAmbient(this.theme, this.periodicAmbientTimers, dt, this._boundPlaySound);
    }

    this.checkMatchEnd();
  }

  /** Apply visual effects (particles, screen shake/flash, haptics) for a hazard collision result. */
  private applyHazardHitVFX(hit: HazardHitResult, playerId: PlayerSlot): void {
    // Screen effects (gated by resimulation)
    if (!this._resimulating) {
      if (hit.screenShake !== undefined) {
        this.state.screenShake = Math.max(this.state.screenShake, hit.screenShake);
      }
      if (hit.screenFlash !== undefined) {
        this.state.screenFlash = Math.max(this.state.screenFlash, hit.screenFlash);
      }
      if (hit.hitstopZoom !== undefined) {
        this.state.hitstopZoom = Math.max(this.state.hitstopZoom, hit.hitstopZoom);
      }
      // Haptics
      if (hit.haptic && haptics.isLocal(playerId)) {
        if (hit.haptic === 'spring') haptics.spring();
        else haptics.hazardHit();
      }
    }

    // Particles based on collision type
    const { px, py } = hit;
    switch (hit.type) {
      case 'thorn': {
        // Blood from player
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          const life = 0.4 + Math.random() * 0.5;
          this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2.5 + Math.random() * 4, BLOOD_COLOR);
        }
        // Thorn shrapnel
        if (hit.sx !== undefined && hit.sy !== undefined) {
          for (let i = 0; i < 8; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const speed = 30 + Math.random() * 80;
            const life = 0.3 + Math.random() * 0.3;
            this.emitParticle(hit.sx, hit.sy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.5 + Math.random() * 2, '#5C3A1E');
          }
        }
        break;
      }
      case 'hazardZone': {
        for (let i = 0; i < 24; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 200;
          const life = 0.4 + Math.random() * 0.6;
          const color = hit.hazardType === 'lava' ? (i % 3 === 0 ? '#FFCC00' : i % 3 === 1 ? '#FF4400' : '#FF8800') : BLOOD_COLOR;
          this.emitParticle(px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 12, Math.cos(angle) * speed, Math.sin(angle) * speed - 100, life, 3 + Math.random() * 5, color);
        }
        break;
      }
      case 'ghost': {
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          const life = 0.4 + Math.random() * 0.5;
          const color = i % 2 === 0 ? '#8855CC' : '#AA77EE';
          this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 3 + Math.random() * 4, color);
        }
        break;
      }
      case 'lavaRock': {
        for (let i = 0; i < 16; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 150;
          const life = 0.3 + Math.random() * 0.5;
          const color = i % 2 === 0 ? '#FF6600' : '#FFAA00';
          this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 60, life, 2.5 + Math.random() * 4, color);
        }
        break;
      }
      // spring, fallOff: no particles
    }
  }

  private checkMatchEnd(): void {
    const winner = _checkMatchEnd(this.state, this.settings);
    if (winner !== null) {
      this.state.slowMotion = SLOW_MO_DURATION;
      this.endMatch(winner);
    }
  }

  private getPlayerInput(player: Player): InputState {
    return _getPlayerInput(player, this.input, this.touchInput, this.touchSlot, this._networkInputs, this.aiControllers, this.state, this.arena, this.settings);
  }

  getTouchInput(): TouchInputManager | null {
    return this.touchInput;
  }

  private endMatch(winner: PlayerSlot | null): void {
    this.state.matchOver = true;
    this.state.winner = winner;
    if (!this._resimulating) this.state.screenFlash = SCREEN_FLASH_DURATION;
    audio.stopMusic();
    // victory sound moved to cosmeticStep (matchOver transition detection)
    this.onMatchEnd(winner, this.state);
  }
}
