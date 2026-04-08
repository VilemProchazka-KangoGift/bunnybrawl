import type {
  MatchState, MatchSettings, Arena, PlayerSlot, Player, Particle, Gib, GibType,
  WeatherParticle, MatchStats, PlayerStats, WildlifeEntity, EffectZone, Platform,
  InputState,
} from './types';
import { isBotSlot } from './types';
import type { SeededRNG } from './net/prng';
import { takeSnapshot as _takeSnapshot, restoreSnapshot as _restoreSnapshot } from './net/serialize';
import type { GameSnapshot } from './net/serialize';
import type { ThemeConfig } from './themes/types';
import { getTheme } from './themes/registry';
import { mirrorArena } from './arena';
import { randRange, pickWeighted, swapRemove } from './themes/utils';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState, applyArenaConstraints, collidePlayersHorizontal, aabbOverlap } from './physics';
import { checkStomps, updateSplatTimers } from './stomp';
import { getCharacterGibs } from './characters';
import { audio } from './audio';
import {
  FIXED_TIMESTEP, MAX_FRAME_TIME,
  PLAYER_WIDTH, PLAYER_HEIGHT, ANIM_FRAME_DURATION, RUN_FRAMES,
  DUST_LAND_VY_THRESHOLD, CARROT_SPAWN_INTERVAL, CARROT_CHASE_SPAWN_INTERVAL,
  CARROT_FIRST_SPAWN_DELAY, CARROT_CHASE_FIRST_SPAWN_DELAY, CARROT_SIZE, GIANT_SCALE,
  FAT_DURATION, SPRING_BOUNCE, SPRING_SIZE,
  THORN_SLOW_DURATION, CANVAS_WIDTH, CANVAS_HEIGHT,
  SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL, HAZARD_LIFETIME, HAZARD_GROW_TIME,
  SCREEN_SHAKE_DURATION, SLOW_MO_DURATION, SLOW_MO_FACTOR, HITSTOP_DURATION, HAZARD_HITSTOP_DURATION,
  SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
  MATCH_COUNTDOWN, IDLE_ANIM_INTERVAL,
  SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  SPRING_TRAIL_DURATION, SCORE_ANIM_DURATION,
  GRAVITY, FRICTION, MAX_WALK_SPEED, JUMP_IMPULSE, MAX_FALL_SPEED,
  BLOOD_COLOR,
  GIB_GRAVITY, GIB_LAUNCH_SPEED_MIN, GIB_LAUNCH_SPEED_MAX, GIB_ROTATION_MAX,
  GIB_BOUNCE_FACTOR, GIB_GEYSER_STRENGTH_MULT, GIB_MAX_FLIGHT, GIB_MAX_COUNT,
  CONFETTI_COUNT, CONFETTI_GRAVITY, CONFETTI_FLUTTER, CONFETTI_LIFE_MIN, CONFETTI_LIFE_MAX,
} from './constants';
import { getCharacterForSlot } from './characters';
import { AIController } from './ai';
import { debugFlags, toggleNavDebug } from './debugFlags';
import type { BotNavDebugState } from './navDebugOverlay';

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
  private paused = false;
  private particles: Particle[] = [];
  private particleFreeList: Particle[] = [];  // Recycled particle objects to reduce GC
  private fireworkTimer = 0;
  private afterimageAccumulators: Map<PlayerSlot, number> = new Map();
  private footstepAccumulators: Map<PlayerSlot, number> = new Map();
  private crowdStarted = false;
  private zeroGSoundPlaying = false;
  private hasWaterfallZones = false;
  private cachedGeyserZones: EffectZone[] = [];
  private cachedZeroGZones: EffectZone[] = [];
  private geyserIndexMap: Map<EffectZone, number> = new Map();
  private floatingPlatforms: Array<{ plat: Platform; idx: number }> = [];
  private aiControllers: Map<string, AIController> = new Map();
  private newBloodDripsSinceRender: Array<{ x: number; y: number; radius: number; color: string }> = [];
  private newGroundedGibsSinceRender: Gib[] = [];
  private _debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  // SFX cooldowns (per-player)
  private landCooldowns: Map<PlayerSlot, number> = new Map();
  private headbonkCooldowns: Map<PlayerSlot, number> = new Map();
  private crouchCooldowns: Map<PlayerSlot, number> = new Map();
  // Global bump cooldown (prevents double-fire from both pushed players)
  private bumpCooldown = 0;

  // Per-theme ambient sound state
  private activeAmbientLoops: string[] = [];
  private periodicAmbientTimers: Map<string, number> = new Map();

  // Deterministic PRNG for network mode (undefined = use Math.random, local play)
  private rng?: SeededRNG;

  // Network mode: when true, external code drives the loop
  private _networkMode = false;
  private _audioEnabled = true;
  // Explicit inputs injected by rollback engine (keyed by PlayerSlot)
  private _networkInputs?: Map<string, InputState>;

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: PlayerSlot[],
    onMatchEnd: MatchEndCallback,
  ) {
    this.arena = arena;
    this.originalArena = arena;
    this.settings = settings;
    this.onMatchEnd = onMatchEnd;
    this.theme = getTheme(arena.themeId);
    this.input = new InputManager();
    this.renderer = new Renderer(bgCanvas, fgCanvas, this.theme, settings.mods.mirrorArena);

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
    }));

    // Init AI controllers for bot players
    const botDifficulty = settings.botDifficulty ?? 'medium';
    let botIndex = 0;
    for (const player of players) {
      if (isBotSlot(player.id)) {
        this.aiControllers.set(player.id, new AIController(player.id, player.character.name, botDifficulty, botIndex++, this.rng));
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
    this.hasWaterfallZones = (arena.effectZones || []).some(z => z.type === 'current' && z.vy && z.vy > 0);
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
  }

  private createWeatherParticle(randomY: boolean): WeatherParticle {
    const chosen = pickWeighted(this.theme.weather.types);
    return {
      x: Math.random() * CANVAS_WIDTH,
      y: randomY ? Math.random() * CANVAS_HEIGHT : -10,
      vx: randRange(chosen.vxRange),
      vy: randRange(chosen.vyRange),
      size: randRange(chosen.sizeRange),
      type: chosen.type,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: randRange(chosen.rotSpeedRange),
      color: chosen.color,
    };
  }

  start(): void {
    this.input.attach();
    this.renderer.renderBackground(this.arena, this.originalArena);
    this.running = true;
    this.lastTime = performance.now();
    audio.playMusic(this.arena.themeId);
    this.playSound('ambient');
    if (this.hasWaterfallZones) this.playSound('waterfall_ambient');
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
    if (debugFlags.navDebugAllowed) {
      this._debugKeyHandler = (e: KeyboardEvent) => { if (e.key === '`') toggleNavDebug(); };
      window.addEventListener('keydown', this._debugKeyHandler);
    }
    // In network mode, the external NetMatch drives the loop
    if (!this._networkMode) {
      this.loop(this.lastTime);
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.input.detach();
    audio.stopMusic();
    audio.stop('ambient');
    audio.stop('zero_g');
    audio.stop('crowd');
    audio.stop('waterfall_ambient');
    // Stop all theme ambient loops
    for (const loop of this.activeAmbientLoops) {
      audio.stop(loop);
    }
    this.activeAmbientLoops = [];
    this.periodicAmbientTimers.clear();
    if (this._debugKeyHandler) {
      window.removeEventListener('keydown', this._debugKeyHandler);
      this._debugKeyHandler = null;
    }
  }

  /** Play a sound, respecting audio mute (used during rollback resimulation). */
  private playSound(name: Parameters<typeof audio.play>[0]): void {
    if (this._audioEnabled) this.playSound(name);
  }

  /** Gameplay-affecting random: seeded in network mode, Math.random() in local. */
  private gameRandom(): number {
    return this.rng ? this.rng.nextFloat() : Math.random();
  }

  /** Set a seeded PRNG for deterministic network play. */
  setRng(rng: SeededRNG): void {
    this.rng = rng;
  }

  /** Get the current RNG (for snapshots). */
  getRng(): SeededRNG | undefined {
    return this.rng;
  }

  /** Get AI controllers map (for snapshots). */
  getAIControllers(): Map<string, AIController> {
    return this.aiControllers;
  }

  /** Enable network mode: external code drives the loop. */
  setNetworkMode(enabled: boolean): void {
    this._networkMode = enabled;
  }

  /** Mute/unmute audio (used during rollback resimulation). */
  setAudioEnabled(enabled: boolean): void {
    this._audioEnabled = enabled;
  }

  /** Render current frame. Public for network loop. */
  renderFrame(): void {
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
    return _takeSnapshot(frame, this.state, this.rng, this.aiControllers);
  }

  /** Restore gameplay state from a snapshot for rollback. */
  restoreSnapshot(snap: GameSnapshot): void {
    _restoreSnapshot(snap, this.state, this.rng, this.aiControllers);
  }

  getState(): MatchState { return this.state; }
  pause(): void { this.paused = true; audio.stopMusic(); }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.playMusic(this.arena.themeId); }
  isPaused(): boolean { return this.paused; }
  skipCountdown(): void {
    if (this.state.countdown > 0) {
      this.state.countdown = 0;
      this.playSound('countdown_go');
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

    // Timers that run in real time (not affected by fixedUpdate early return)
    if (this.state.slowMotion > 0) {
      this.state.slowMotion -= frameTime;
    }
    if (this.state.screenFlash > 0) {
      this.state.screenFlash -= frameTime;
    }
    if (this.state.hitstopZoom > 0) {
      this.state.hitstopZoom -= frameTime;
    }

    // Fireworks when match is over
    if (this.state.matchOver) {
      this.fireworkTimer -= frameTime;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.3;
        this.spawnFirework();
      }
      // Update firework particles with gravity
      this.updateParticles(frameTime);
      this.updateGibs(frameTime);
      this.updateConfetti(frameTime);
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

  // ---- Hazard spawning ----

  /** Check if any active player is standing on the given platform near x */
  private playerNearSpawn(plat: Platform, spawnX: number): boolean {
    const margin = 48; // don't spawn within 48px of a player
    for (const p of this.state.players) {
      if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
      const feetY = p.y + p.height;
      // Player is on this platform and near the spawn x
      if (feetY >= plat.y - 4 && feetY <= plat.y + 6 &&
          p.x + p.width > plat.x && p.x < plat.x + plat.width &&
          Math.abs((p.x + p.width / 2) - spawnX) < margin) {
        return true;
      }
    }
    return false;
  }

  private spawnSpring(): void {
    if (this.arena.noSprings) return;
    if (this.floatingPlatforms.length === 0) return;
    // Filter to platforms with enough vertical clearance for a spring bounce (~200px)
    const minClearance = 200;
    const candidates = this.floatingPlatforms.filter(({ plat }) => {
      for (const other of this.arena.platforms) {
        if (other === plat) continue;
        // Check if another platform is directly above within clearance range
        if (other.y < plat.y && plat.y - other.y < minClearance &&
            other.x < plat.x + plat.width && other.x + other.width > plat.x) {
          return false;
        }
      }
      return true;
    });
    if (candidates.length === 0) return;
    // Try a few times to avoid spawning on top of a player
    for (let attempt = 0; attempt < 3; attempt++) {
      const fp = candidates[Math.floor(this.gameRandom() * candidates.length)];
      const x = fp.plat.x + 20 + this.gameRandom() * (fp.plat.width - 40);
      if (!this.playerNearSpawn(fp.plat, x)) {
        this.state.springs.push({
          x, y: fp.plat.y, platformIndex: fp.idx,
          bounceTimer: 0, life: HAZARD_LIFETIME, growTimer: HAZARD_GROW_TIME,
        });
        return;
      }
    }
  }

  private spawnThorn(): void {
    if (this.floatingPlatforms.length === 0) return;
    // Try a few times to avoid spawning on top of a player
    for (let attempt = 0; attempt < 3; attempt++) {
      const fp = this.floatingPlatforms[Math.floor(this.gameRandom() * this.floatingPlatforms.length)];
      const x = fp.plat.x + 10 + this.gameRandom() * (fp.plat.width - 44);
      if (!this.playerNearSpawn(fp.plat, x)) {
        this.state.thorns.push({
          x, y: fp.plat.y - 12, width: 28, height: 12,
          platformIndex: fp.idx, life: HAZARD_LIFETIME, growTimer: HAZARD_GROW_TIME, hit: false,
        });
        return;
      }
    }
  }

  /** Emit a particle, reusing a recycled object if available to reduce GC pressure. */
  private emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void {
    const recycled = this.particleFreeList.pop();
    if (recycled) {
      recycled.x = x; recycled.y = y; recycled.vx = vx; recycled.vy = vy;
      recycled.life = life; recycled.maxLife = life; recycled.size = size; recycled.color = color;
      this.particles.push(recycled);
    } else {
      this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
    }
  }

  // ---- Particle spawners ----

  private spawnDustParticles(player: Player, landVy: number): void {
    const cx = player.x + player.width / 2;
    const groundY = player.y + player.height;
    const intensity = Math.min(landVy / 300, 3);
    const count = Math.floor(8 + intensity * 6);
    for (let i = 0; i < count; i++) {
      const life = 0.3 + Math.random() * 0.4 * intensity;
      this.emitParticle(cx + (Math.random() - 0.5) * player.width * 1.5, groundY - Math.random() * 4, (Math.random() - 0.5) * 150 * intensity, -Math.random() * 80 * intensity - 20, life, 2 + Math.random() * 4 * intensity, '#C8B896');
    }
  }

  private spawnRunDust(player: Player): void {
    const groundY = player.y + player.height;
    const behindX = player.facing === 'right' ? player.x - 2 : player.x + player.width + 2;
    const life = 0.15 + Math.random() * 0.15;
    this.emitParticle(behindX + (Math.random() - 0.5) * 6, groundY - Math.random() * 3, (player.facing === 'right' ? -1 : 1) * (20 + Math.random() * 30), -Math.random() * 20 - 5, life, 1.5 + Math.random() * 2, '#C8B896');
  }

  private spawnImpactDust(player: Player, direction: 'up' | 'left' | 'right'): void {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    for (let i = 0; i < 4; i++) {
      let px: number, py: number, pvx: number, pvy: number;
      if (direction === 'up') { px = cx + (Math.random() - 0.5) * player.width; py = player.y + 2; pvx = (Math.random() - 0.5) * 60; pvy = Math.random() * 40 + 10; }
      else { const side = direction === 'right' ? player.x + player.width : player.x; px = side; py = cy + (Math.random() - 0.5) * player.height * 0.6; pvx = (direction === 'right' ? -1 : 1) * (20 + Math.random() * 40); pvy = -Math.random() * 30; }
      const life = 0.2 + Math.random() * 0.2;
      this.emitParticle(px, py, pvx, pvy, life, 1.5 + Math.random() * 2.5, '#C8B896');
    }
  }

  private spawnKillSplatter(victim: Player): void {
    if (this.settings.goreMode) {
      this.spawnGoreParticles(victim);
    }
    this.spawnGibs(victim);
    if (!this.settings.goreMode) {
      this.spawnConfetti(victim);
    }
  }

  private spawnGoreParticles(victim: Player): void {
    const cx = victim.x + victim.width / 2;
    const cy = victim.y + victim.height / 2;
    const baseCnt = 35 + Math.floor(Math.random() * 15);
    const count = this.settings.mods.extremeGore ? baseCnt * 3 : baseCnt;
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const hSpeed = (120 + Math.random() * 220) * side;
      const vSpeed = -(40 + Math.random() * 180);
      const life = 0.6 + Math.random() * 0.8;
      this.emitParticle(cx + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * 10, hSpeed + (Math.random() - 0.5) * 60, vSpeed, life, 2 + Math.random() * 5, BLOOD_COLOR);
    }
  }

  private launchGib(
    cx: number, cy: number, spread: number,
    angleMin: number, angleMax: number, speedMin: number, speedMax: number,
    w: number, h: number,
    color: string, darkColor: string, lightColor: string,
    characterName: string, gibType: GibType,
  ): void {
    const angle = -Math.PI * (angleMin + Math.random() * (angleMax - angleMin));
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    this.state.gibs.push({
      x: cx + (Math.random() - 0.5) * spread,
      y: cy + (Math.random() - 0.5) * spread * 0.7,
      vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 2 * GIB_ROTATION_MAX,
      width: w, height: h,
      color, darkColor, lightColor,
      characterName, gibType,
      bounced: false,
      life: GIB_MAX_FLIGHT,
    });
  }

  private spawnGibs(victim: Player): void {
    const cx = victim.x + victim.width / 2;
    const cy = victim.y + victim.height / 2;
    const { color, darkColor, lightColor, name } = victim.character;
    const gore = this.settings.goreMode;
    const extreme = this.settings.mods.extremeGore;
    const mult = extreme ? 10 : 1;
    const confettiColors = GameLoop.CONFETTI_COLORS;
    const pickConfetti = () => confettiColors[Math.floor(Math.random() * confettiColors.length)];
    // Character body part gibs
    const gibDefs = getCharacterGibs(name);
    if (gibDefs) {
      for (let r = 0; r < mult; r++) {
        for (const def of gibDefs) {
          this.launchGib(cx, cy, 12 + r * 3, 0.15, 0.85, GIB_LAUNCH_SPEED_MIN, GIB_LAUNCH_SPEED_MAX,
            def.width, def.height, color, darkColor, lightColor, name, def.gibType);
        }
      }
    }
    // Chunk gibs: blood in gore mode, confetti-colored in non-gore
    const chunkCount = (5 + Math.floor(Math.random() * 4)) * mult;
    for (let i = 0; i < chunkCount; i++) {
      const size = 4 + Math.random() * 6;
      const c = gore ? BLOOD_COLOR : pickConfetti();
      this.launchGib(cx, cy, 16, 0.1, 0.9, GIB_LAUNCH_SPEED_MIN * 0.8, GIB_LAUNCH_SPEED_MAX,
        size, size * (0.6 + Math.random() * 0.4), c, c, c, '', 'body');
    }
    // Micro drop gibs: blood specks in gore mode, confetti specks in non-gore
    const microCount = (25 + Math.floor(Math.random() * 15)) * mult;
    for (let i = 0; i < microCount; i++) {
      const size = 1.5 + Math.random() * 2.5;
      const c = gore ? BLOOD_COLOR : pickConfetti();
      this.launchGib(cx, cy, 20, 0.05, 0.95, GIB_LAUNCH_SPEED_MIN * 0.5, GIB_LAUNCH_SPEED_MAX * 1.2,
        size, size, c, c, c, '', 'body');
    }
    // Cap airborne gibs (grounded ones are baked to bgCtx)
    const gibCap = extreme ? GIB_MAX_COUNT * 10 : GIB_MAX_COUNT;
    while (this.state.gibs.length > gibCap) {
      swapRemove(this.state.gibs, 0);
    }
  }

  private static readonly CONFETTI_COLORS = ['#FFD700', '#FF69B4', '#00FFFF', '#7CFC00', '#FF6347', '#DA70D6', '#FFA500'];
  private static readonly CONFETTI_SHAPES: Array<'star' | 'diamond' | 'circle' | 'ribbon'> = ['star', 'diamond', 'circle', 'ribbon'];

  private spawnConfetti(victim: Player): void {
    const cx = victim.x + victim.width / 2;
    const cy = victim.y + victim.height / 2;
    const colors = GameLoop.CONFETTI_COLORS;
    const shapes = GameLoop.CONFETTI_SHAPES;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 190;
      const life = CONFETTI_LIFE_MIN + Math.random() * (CONFETTI_LIFE_MAX - CONFETTI_LIFE_MIN);
      this.state.confetti.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        life,
        maxLife: life,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        flutter: Math.random() * Math.PI * 2,
      });
    }
  }

  private spawnCarrotVFX(x: number, y: number): void {
    // Sparkle burst when carrot appears
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      const life = 0.5 + Math.random() * 0.3;
      this.emitParticle(x, y + CARROT_SIZE / 2, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 2 + Math.random() * 3, i % 2 === 0 ? '#FFD700' : '#FF8C00');
    }
  }

  private pickupCarrotVFX(x: number, y: number): void {
    const cy = y + CARROT_SIZE / 2;
    // Orange carrot chunks — gib-style (bounce + settle on ground)
    for (let i = 0; i < 4; i++) {
      const s = 4 + Math.random() * 3;
      this.launchGib(x, cy, 10, 0.15, 0.85, 80, 200, s, s,
        '#FF8C00', '#CC6600', '#FFB040', '', 'body');
    }
    // Green leaf pieces
    for (let i = 0; i < 2; i++) {
      this.launchGib(x, cy, 8, 0.2, 0.8, 60, 160, 5, 3,
        '#4CAF50', '#2E7D32', '#81C784', '', 'body');
    }
    // Orange/gold particle burst (instant feedback)
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
    const fx = Math.random() * CANVAS_WIDTH;
    const fy = Math.random() * (CANVAS_HEIGHT * 0.5); // upper half
    const count = 20 + Math.floor(Math.random() * 11); // 20-30
    const brightColors = ['#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF', '#FFD700', '#FF8C00', '#FF69B4'];
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      const life = 0.6 + Math.random() * 0.6;
      this.emitParticle(fx, fy, Math.cos(angle) * speed, Math.sin(angle) * speed - 50, life, 2 + Math.random() * 4, color);
    }
  }

  // ---- Carrot spawning ----

  private spawnCarrot(): void {
    const candidates: Array<{ x: number; y: number; distSq: number }> = [];

    const minDistSqTo = (cx: number, cy: number): number => {
      let minSq = Infinity;
      for (const p of this.state.players) {
        if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
        const dx = cx - (p.x + p.width / 2);
        const dy = cy - (p.y + p.height / 2);
        const sq = dx * dx + dy * dy;
        if (sq < minSq) minSq = sq;
      }
      for (const c of this.state.carrots) {
        if (!c.active) continue;
        const dx = cx - c.x;
        const dy = cy - c.y;
        const sq = dx * dx + dy * dy;
        if (sq < minSq) minSq = sq;
      }
      return minSq;
    };

    for (const plat of this.arena.platforms) {
      // On-platform candidates
      for (let attempt = 0; attempt < 3; attempt++) {
        const cx = plat.x + 20 + this.gameRandom() * (plat.width - 40);
        const cy = plat.y - CARROT_SIZE;
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
      }
      // Mid-air candidates above platforms (reachable by jumping)
      for (let attempt = 0; attempt < 2; attempt++) {
        const cx = plat.x + 20 + this.gameRandom() * (plat.width - 40);
        const cy = Math.max(CARROT_SIZE, plat.y - 60 - this.gameRandom() * 60);
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
      }
    }
    // Extra mid-air candidates inside effect zones (carrots floating in zero-G, etc.)
    for (const zone of this.cachedZeroGZones) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const cx = zone.x + 30 + this.gameRandom() * (zone.width - 60);
        const cy = zone.y + 30 + this.gameRandom() * (zone.height - 60);
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) * 2.25 }); // 1.5x bias squared
      }
    }
    // Extra candidates inside carrot zones (increased spawn likelihood)
    if (this.arena.carrotZones) {
      for (const zone of this.arena.carrotZones) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const cx = zone.x + 20 + this.gameRandom() * (zone.width - 40);
          const cy = zone.y + 20 + this.gameRandom() * (zone.height - 40);
          candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) * 4 }); // 2x bias squared
        }
      }
    }
    // Filter out candidates inside noSpawnZones (unreachable building interiors)
    const noSpawn = this.arena.noSpawnZones;
    if (noSpawn) {
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        for (const z of noSpawn) {
          if (c.x >= z.x && c.x <= z.x + z.width && c.y >= z.y && c.y <= z.y + z.height) {
            swapRemove(candidates, i);
            break;
          }
        }
      }
    }
    // Pick candidate farthest from players/carrots
    let bestIdx = 0;
    let bestDistSq = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].distSq > bestDistSq) {
        bestDistSq = candidates[i].distSq;
        bestIdx = i;
      }
    }
    if (candidates.length > 0) {
      const spot = candidates[bestIdx];
      this.state.carrots.push({ x: spot.x, y: spot.y, active: true, spawnTime: this.state.timeElapsed });
      this.spawnCarrotVFX(spot.x, spot.y);
    }
  }

  // ---- Updates ----

  private updateParticles(dt: number): void {
    const platforms = this.arena.platforms;
    const gore = this.settings.goreMode;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        swapRemove(this.particles, i);
        if (this.particleFreeList.length < 300) this.particleFreeList.push(p);
        continue;
      }
      const prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      // Blood particles leave drip marks on platform surfaces
      if (gore && p.color === BLOOD_COLOR && p.vy > 0) {
        for (let pi = 0; pi < platforms.length; pi++) {
          const plat = platforms[pi];
          if (prevY < plat.y && p.y >= plat.y && p.x >= plat.x && p.x <= plat.x + plat.width) {
            this.newBloodDripsSinceRender.push({
              x: p.x, y: plat.y,
              radius: 2 + Math.random() * 3,
              color: BLOOD_COLOR,
            });
            p.life = 0;
            break;
          }
        }
      }
    }
  }

  private updateGibs(dt: number): void {
    const platforms = this.arena.platforms;
    const gibs = this.state.gibs;
    const effectZones = this.arena.effectZones;
    for (let i = gibs.length - 1; i >= 0; i--) {
      const g = gibs[i];
      // Airborne gib physics
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vy += GIB_GRAVITY * dt;
      g.rotation += g.rotationSpeed * dt;
      g.life -= dt;
      // Effect zone interactions (zero-G, geyser, current)
      if (effectZones) {
        for (let zi = 0; zi < effectZones.length; zi++) {
          const zone: EffectZone = effectZones[zi];
          if (g.x < zone.x || g.x > zone.x + zone.width || g.y < zone.y || g.y > zone.y + zone.height) continue;
          if (zone.type === 'zero_g') {
            if (g.vy > 0) g.vy *= 0.92;
            else if (g.vy < 0) g.vy *= 1.03;
          } else if (zone.type === 'current') {
            g.vx += (zone.vx || 0) * dt;
            g.vy += (zone.vy || 0) * dt;
          } else if (zone.type === 'geyser') {
            const geyserIdx = this.geyserIndexMap.get(zone) ?? -1;
            if (geyserIdx >= 0 && this.state.geyserStates[geyserIdx]?.active) {
              g.vy = Math.min(g.vy, (zone.strength || -550) * GIB_GEYSER_STRENGTH_MULT);
            }
          }
        }
      }
      // Platform collision
      let settled = false;
      const gibBottom = g.y + g.height / 2;
      const prevBottom = gibBottom - g.vy * dt;
      for (let pi = 0; pi < platforms.length; pi++) {
        const plat = platforms[pi];
        if (prevBottom < plat.y && gibBottom >= plat.y &&
            g.x + g.width / 2 > plat.x && g.x - g.width / 2 < plat.x + plat.width) {
          if (!g.bounced) {
            g.vy = -Math.abs(g.vy) * GIB_BOUNCE_FACTOR;
            g.vx *= 0.6;
            g.rotationSpeed *= 0.5;
            g.bounced = true;
            g.y = plat.y - g.height / 2;
          } else {
            // Settle: bake to background canvas and remove from active array
            g.y = plat.y - g.height / 2;
            g.vx = 0;
            g.vy = 0;
            g.rotationSpeed = 0;
            this.newGroundedGibsSinceRender.push(g);
            swapRemove(gibs, i);
            settled = true;
          }
          break;
        }
      }
      if (settled) continue;
      // Remove if max flight time exceeded without landing
      if (g.life <= 0) {
        swapRemove(gibs, i);
      }
    }
  }

  private updateConfetti(dt: number): void {
    const confetti = this.state.confetti;
    const time = this.state.timeElapsed;
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.life -= dt;
      if (c.life <= 0) {
        swapRemove(confetti, i);
        continue;
      }
      c.x += c.vx * dt + Math.sin(time * 6 + c.flutter) * CONFETTI_FLUTTER * dt;
      c.y += c.vy * dt;
      c.vy += CONFETTI_GRAVITY * dt;
      c.rotation += c.rotationSpeed * dt;
    }
  }

  private updateWeather(dt: number): void {
    for (let i = this.state.weather.length - 1; i >= 0; i--) {
      const w = this.state.weather[i];
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.rotation += w.rotSpeed * dt;
      // Gentle sway
      w.vx += (Math.random() - 0.5) * 20 * dt;
      if (w.y > CANVAS_HEIGHT + 10 || w.x > CANVAS_WIDTH + 10) {
        this.state.weather[i] = this.createWeatherParticle(false);
      }
    }
  }

  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    this._networkInputs = networkInputs;
    if (this.state.matchOver) return;
    this.state.timeElapsed += dt;

    // Day/night cycle
    this.state.dayPhase += dt / this.theme.dayNight.cycleDuration;
    if (this.state.dayPhase > 1) this.state.dayPhase -= 1;

    // Countdown logic
    if (this.state.countdown > 0) {
      const prevSec = Math.ceil(this.state.countdown);
      this.state.countdown -= dt;
      const curSec = Math.ceil(this.state.countdown);
      if (this.state.countdown <= 0) {
        this.state.countdown = 0;
        this.playSound('countdown_go');
      } else if (curSec < prevSec) {
        this.playSound('countdown_beep');
      }
      // During countdown, still update weather/particles but skip player input
      this.updateWeather(dt);
      this.updateParticles(dt);
      return;
    }

    // Screen shake decay
    if (this.state.screenShake > 0) this.state.screenShake -= dt;

    // Hazard spawn timers
    this.state.springSpawnTimer -= dt;
    if (this.state.springSpawnTimer <= 0) {
      this.spawnSpring();
      this.state.springSpawnTimer = SPRING_SPAWN_INTERVAL + this.gameRandom() * 5;
    }
    this.state.thornSpawnTimer -= dt;
    if (this.state.thornSpawnTimer <= 0) {
      this.spawnThorn();
      this.state.thornSpawnTimer = THORN_SPAWN_INTERVAL + this.gameRandom() * 5;
    }

    // Update hazard lifetimes + grow timers
    for (const s of this.state.springs) {
      s.life -= dt;
      if (s.growTimer > 0) s.growTimer -= dt;
      if (s.bounceTimer > 0) s.bounceTimer -= dt;
    }
    for (let i = this.state.springs.length - 1; i >= 0; i--) {
      if (this.state.springs[i].life <= 0) {
        swapRemove(this.state.springs, i);
      }
    }

    for (const t of this.state.thorns) {
      t.life -= dt;
      if (t.growTimer > 0) t.growTimer -= dt;
    }
    for (let i = this.state.thorns.length - 1; i >= 0; i--) {
      if (this.state.thorns[i].life <= 0 || this.state.thorns[i].hit) {
        swapRemove(this.state.thorns, i);
      }
    }

    // Carrot timer
    this.state.carrotTimer -= dt;
    if (this.state.carrotTimer <= 0) {
      this.spawnCarrot();
      this.state.carrotTimer = this.settings.mods.carrotChase ? CARROT_CHASE_SPAWN_INTERVAL : CARROT_SPAWN_INTERVAL;
    }

    // Weather
    this.updateWeather(dt);

    // Update lava rocks
    if (this.theme.lavaRockConfig) {
      const lrc = this.theme.lavaRockConfig;
      this.state.lavaRockTimer -= dt;
      if (this.state.lavaRockTimer <= 0) {
        this.state.lavaRockTimer = lrc.spawnInterval[0] + this.gameRandom() * (lrc.spawnInterval[1] - lrc.spawnInterval[0]);
        this.state.lavaRocks.push({
          x: 80 + this.gameRandom() * (CANVAS_WIDTH - 160),
          y: -20,
          vy: lrc.fallSpeed[0] + this.gameRandom() * (lrc.fallSpeed[1] - lrc.fallSpeed[0]),
          size: lrc.sizeRange[0] + this.gameRandom() * (lrc.sizeRange[1] - lrc.sizeRange[0]),
          rotation: this.gameRandom() * Math.PI * 2,
          active: true,
        });
      }
      for (const rock of this.state.lavaRocks) {
        rock.y += rock.vy * dt;
        rock.rotation += dt * 3;
        if (rock.y > CANVAS_HEIGHT + 30) rock.active = false;
      }
      for (let i = this.state.lavaRocks.length - 1; i >= 0; i--) {
        if (!this.state.lavaRocks[i].active) {
          swapRemove(this.state.lavaRocks, i);
        }
      }
    }

    // Update ghosts
    for (const ghost of this.state.ghosts) {
      ghost.x += ghost.vx * dt;
      ghost.wobblePhase += dt * 2;
      ghost.y += Math.sin(ghost.wobblePhase) * 20 * dt;
      // Wrap around screen
      if (ghost.vx > 0 && ghost.x > CANVAS_WIDTH + ghost.size) {
        ghost.x = -ghost.size;
        ghost.y = 300 + Math.random() * 300;
      } else if (ghost.vx < 0 && ghost.x < -ghost.size) {
        ghost.x = CANVAS_WIDTH + ghost.size;
        ghost.y = 300 + Math.random() * 300;
      }
    }


    // Update geyser timers
    const geyserZones = this.cachedGeyserZones;
    for (let gi = 0; gi < this.state.geyserStates.length; gi++) {
      const gs = this.state.geyserStates[gi];
      const gz = geyserZones[gi];
      if (!gz) continue;
      if (!gs.active) {
        gs.timer -= dt;
        if (gs.timer <= 0) {
          gs.active = true;
          gs.activeTimer = gz.duration || 3;
          this.playSound('geyser');
        }
      } else {
        gs.activeTimer -= dt;
        if (gs.activeTimer <= 0) {
          gs.active = false;
          gs.timer = gz.interval || 10;
        }
      }
    }

    // Update pigeon flocks
    for (const flock of this.state.pigeonFlocks) {
      if (!flock.active) {
        flock.respawnTimer -= dt;
        if (flock.respawnTimer <= 0) flock.active = true;
      }
      // Decay scatter particles
      for (let i = flock.scatterParticles.length - 1; i >= 0; i--) {
        const sp = flock.scatterParticles[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 100 * dt;
        sp.life -= dt;
        if (sp.life <= 0) {
          swapRemove(flock.scatterParticles, i);
        }
      }
    }

    // Decay bouncy wobble timers
    for (const [idx, timer] of this.state.bouncyWobble) {
      const newTimer = timer - dt;
      if (newTimer <= 0) this.state.bouncyWobble.delete(idx);
      else this.state.bouncyWobble.set(idx, newTimer);
    }

    // Animation timers
    for (const player of this.state.players) {
      if (!player.active) continue;
      // Hitstop: decay timer + status timers, but skip animation advance + physics
      if (player.hitstopTimer > 0) {
        player.hitstopTimer -= dt;
        if (player.fatTimer > 0) player.fatTimer -= dt;
        if (player.slowTimer > 0) player.slowTimer -= dt;
        if (player.burnTimer > 0) player.burnTimer -= dt;
        if (player.damageFlashTimer > 0) player.damageFlashTimer -= dt;
        if (player.springTrailTimer > 0) player.springTrailTimer -= dt;
        continue;
      }
      player.animTimer += dt;
      if (player.animTimer >= ANIM_FRAME_DURATION) {
        player.animTimer -= ANIM_FRAME_DURATION;
        player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
      }
      if (player.fatTimer > 0) player.fatTimer -= dt;
      if (player.slowTimer > 0) player.slowTimer -= dt;
      if (player.burnTimer > 0) {
        player.burnTimer -= dt;
        // Spawn fire particles while burning
        if (player.state !== 'splat' && player.state !== 'respawning') {
          const cx = player.x + player.width / 2;
          const baseY = player.y + player.height;
          for (let i = 0; i < 2; i++) {
            const fx = cx + (Math.random() - 0.5) * player.width * 0.8;
            const fy = baseY - Math.random() * player.height * 0.6;
            const life = 0.25 + Math.random() * 0.3;
            const colors = ['#FF4400', '#FF8800', '#FFCC00', '#FFAA00'];
            this.emitParticle(fx, fy, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, life, 2 + Math.random() * 4, colors[Math.floor(Math.random() * colors.length)]);
          }
        }
      }
      // Decay damage flash and spring trail
      if (player.damageFlashTimer > 0) player.damageFlashTimer -= dt;
      if (player.springTrailTimer > 0) player.springTrailTimer -= dt;
    }

    // Decay global bump cooldown
    if (this.bumpCooldown > 0) this.bumpCooldown -= dt;

    // Input + physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      // Decay SFX cooldowns (even during hitstop so they don't accumulate)
      const lc = this.landCooldowns.get(player.id);
      if (lc !== undefined && lc > 0) this.landCooldowns.set(player.id, lc - dt);
      const hc = this.headbonkCooldowns.get(player.id);
      if (hc !== undefined && hc > 0) this.headbonkCooldowns.set(player.id, hc - dt);
      const cc = this.crouchCooldowns.get(player.id);
      if (cc !== undefined && cc > 0) this.crouchCooldowns.set(player.id, cc - dt);
      if (player.hitstopTimer > 0) continue;
      const input = this.getPlayerInput(player);
      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;
      const wasFastFalling = player.fastFalling;
      const wasCrouching = player.squashScale <= SQUASH_ON_CROUCH;

      // Bot walk speed penalty (easy bots move slower)
      let playerWalkSpeed = this.effWalkSpeed;
      if (isBotSlot(player.id)) {
        const ai = this.aiControllers.get(player.id);
        if (ai) playerWalkSpeed *= ai.getWalkSpeedMult();
      }
      applyInput(player, input, dt, playerWalkSpeed, this.effFriction, this.effJumpImpulse);

      // Fast-fall sound: first frame of pressing down while airborne
      if (!wasFastFalling && player.fastFalling) {
        this.playSound('fastfall');
      }

      if (!wasAirborne && player.state === 'airborne') {
        this.playSound('jump');
        // Stretch on jump
        player.squashScale = STRETCH_ON_JUMP;
        player.squashTimer = 0.15;
      }

      applyGravity(player, dt, this.effGravity, this.effMaxFallSpeed);
      movePlayer(player, dt);
      collidePlatforms(player, this.arena.platforms);
      applyArenaConstraints(player, this.arena);
      updatePlayerState(player);

      // Landing detection
      const justLanded = wasAirborne && player.state !== 'airborne';

      if (justLanded && prevVy >= DUST_LAND_VY_THRESHOLD) {
        this.spawnDustParticles(player, prevVy);
        // Landing sound with per-player cooldown
        const lc = this.landCooldowns.get(player.id) || 0;
        if (lc <= 0) {
          this.playSound('land');
          this.landCooldowns.set(player.id, 0.15);
        }
      }
      if (player.state === 'run' && Math.abs(player.vx) > 150 && Math.random() < 0.3) this.spawnRunDust(player);
      if (wasAirborne && prevVy < -50 && player.vy === 0 && player.state === 'airborne') {
        this.spawnImpactDust(player, 'up');
        // Headbonk sound with per-player cooldown
        const hc = this.headbonkCooldowns.get(player.id) || 0;
        if (hc <= 0) {
          this.playSound('headbonk');
          this.headbonkCooldowns.set(player.id, 0.15);
        }
      }

      // Oof sound: when player hits a wall (prevVx was high, now 0)
      if (Math.abs(prevVx) > 100 && player.vx === 0 && prevVx !== 0) {
        this.spawnImpactDust(player, prevVx > 0 ? 'right' : 'left');
        this.playSound('oof');
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
          const cc = this.crouchCooldowns.get(player.id) || 0;
          if (cc <= 0) {
            this.playSound('crouch');
            this.crouchCooldowns.set(player.id, 0.2);
          }
        }
      } else {
        // Squash/stretch decay
        if (player.squashTimer > 0) {
          player.squashTimer -= dt;
          player.squashScale += (1.0 - player.squashScale) * SQUASH_DECAY_SPEED * dt;
        } else {
          player.squashScale = 1.0;
        }
      }

      // Side squash decay (wall/push squash recovers to 1.0)
      if (player.sideSquash !== 1) {
        player.sideSquash += (1.0 - player.sideSquash) * SQUASH_DECAY_SPEED * dt;
        if (Math.abs(player.sideSquash - 1) < 0.02) player.sideSquash = 1;
      }

      // Size wobble when fat
      if (player.fatTimer > 0) {
        player.squashScale *= 1 + Math.sin(this.state.timeElapsed * 6) * 0.05;
      }

      // Expressions
      if (player.invincibleTimer > 0) {
        player.expression = 'dizzy';
      } else if (player.vy > 400) {
        player.expression = 'scared';
      } else {
        // Check for nearby enemy
        let angry = false;
        for (const other of this.state.players) {
          if (other.id === player.id || !other.active || other.state === 'splat' || other.state === 'respawning') continue;
          const dx = Math.abs((other.x + other.width / 2) - (player.x + player.width / 2));
          const dy = Math.abs((other.y + other.height / 2) - (player.y + player.height / 2));
          if (dx < 80 && dy < 60) { angry = true; break; }
        }
        player.expression = angry ? 'angry' : 'normal';
      }

      // Idle animations
      if (player.state === 'idle') {
        player.idleAnimTimer += dt;
        if (player.idleAnimTimer >= IDLE_ANIM_INTERVAL) {
          player.idleAnimTimer = 0;
        }
      } else {
        player.idleAnimTimer = 0;
      }

      // Afterimages
      const speed = Math.max(Math.abs(player.vx), Math.abs(player.vy));
      const spawnAfterimage = speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0;
      if (spawnAfterimage) {
        let acc = this.afterimageAccumulators.get(player.id) || 0;
        acc += dt;
        while (acc >= AFTERIMAGE_INTERVAL) {
          acc -= AFTERIMAGE_INTERVAL;
          if (player.afterimages.length < AFTERIMAGE_MAX) {
            player.afterimages.push({ x: player.x, y: player.y, facing: player.facing, alpha: 1 });
          }
        }
        this.afterimageAccumulators.set(player.id, acc);
      } else {
        this.afterimageAccumulators.set(player.id, 0);
      }
      // Decay afterimage alpha
      for (let i = player.afterimages.length - 1; i >= 0; i--) {
        player.afterimages[i].alpha -= dt * 4;
        if (player.afterimages[i].alpha <= 0) {
          swapRemove(player.afterimages, i);
        }
      }

      // Footstep sounds
      if (player.state === 'run') {
        let fAcc = this.footstepAccumulators.get(player.id) || 0;
        fAcc += dt;
        if (fAcc >= 0.15) {
          fAcc -= 0.15;
          const playerBottom = player.y + player.height;
          this.playSound(playerBottom > 600 ? 'footstep_grass' : 'footstep_wood');
        }
        this.footstepAccumulators.set(player.id, fAcc);
      } else {
        this.footstepAccumulators.set(player.id, 0);
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

      // Spring collision (only fully grown, not already bouncing)
      for (const spring of this.state.springs) {
        if (spring.growTimer > 0 || spring.bounceTimer > 0) continue;
        if (aabbOverlap(player.x, player.y, player.width, player.height, spring.x - SPRING_SIZE / 2, spring.y - SPRING_SIZE, SPRING_SIZE, SPRING_SIZE) && player.vy >= 0) {
          player.vy = SPRING_BOUNCE;
          player.state = 'airborne';
          spring.bounceTimer = 0.3;
          player.springTrailTimer = SPRING_TRAIL_DURATION;
          this.playSound('spring');
        }
      }

      // Thorn collision (only fully grown)
      for (const thorn of this.state.thorns) {
        if (thorn.growTimer > 0 || thorn.hit) continue;
        if (player.slowTimer <= 0 && player.invincibleTimer <= 0 && aabbOverlap(player.x, player.y, player.width, player.height, thorn.x, thorn.y, thorn.width, thorn.height)) {
          player.slowTimer = THORN_SLOW_DURATION;
          thorn.hit = true;
          this.playSound('thornhit');

          // Big blood splash at player + thorn location
          const px = player.x + player.width / 2;
          const py = player.y + player.height / 2;
          const tx = thorn.x + thorn.width / 2;
          const ty = thorn.y;
          // Blood from player
          for (let i = 0; i < 18; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 160;
            const life = 0.4 + Math.random() * 0.5;
            this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2.5 + Math.random() * 4, BLOOD_COLOR);
          }
          // Thorn shrapnel
          for (let i = 0; i < 8; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const speed = 30 + Math.random() * 80;
            const life = 0.3 + Math.random() * 0.3;
            this.emitParticle(tx, ty, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.5 + Math.random() * 2, '#5C3A1E');
          }
          // Small screen shake
          this.state.screenShake = Math.max(this.state.screenShake, 0.15);
          player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
          this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HAZARD_HITSTOP_DURATION);
        }
      }

      // Hazard zone collision (lava pools etc.) — inset hitbox by 12px on sides to allow edge stepping
      if (this.arena.hazardZones) {
        for (const hz of this.arena.hazardZones) {
          const inset = 12;
          if (player.slowTimer <= 0 && player.invincibleTimer <= 0 &&
              aabbOverlap(player.x, player.y, player.width, player.height, hz.x + inset, hz.y, hz.width - inset * 2, hz.height)) {
            player.slowTimer = THORN_SLOW_DURATION;
            if (hz.type === 'lava') player.burnTimer = THORN_SLOW_DURATION;
            this.playSound('thornhit');
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            // Big particle burst
            for (let i = 0; i < 24; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 80 + Math.random() * 200;
              const life = 0.4 + Math.random() * 0.6;
              const color = hz.type === 'lava' ? (i % 3 === 0 ? '#FFCC00' : i % 3 === 1 ? '#FF4400' : '#FF8800') : BLOOD_COLOR;
              this.emitParticle(px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 12, Math.cos(angle) * speed, Math.sin(angle) * speed - 100, life, 3 + Math.random() * 5, color);
            }
            // Knockback away from hazard center
            const hcx = hz.x + hz.width / 2;
            player.vx += (px > hcx ? 1 : -1) * 150;
            player.vy = -200;
            player.damageFlashSide = px > hcx ? 'left' : 'right';
            player.damageFlashTimer = 0.4;
            player.squashScale = 0.6;
            player.squashTimer = 0.2;
            this.state.screenShake = Math.max(this.state.screenShake, 0.25);
            this.state.screenFlash = Math.max(this.state.screenFlash, 0.06);
            player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
            this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HAZARD_HITSTOP_DURATION);
            break;
          }
        }
      }

      // Ghost collision
      for (const ghost of this.state.ghosts) {
        if (player.slowTimer <= 0 && player.invincibleTimer <= 0) {
          const gx = ghost.x;
          const gy = ghost.y;
          const gr = ghost.size * 0.5;
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          const dx = pcx - gx;
          const dy = pcy - gy;
          if (dx * dx + dy * dy < (gr + player.width * 0.4) * (gr + player.width * 0.4)) {
            player.slowTimer = THORN_SLOW_DURATION;
            this.playSound('thornhit');
            // Big ghost hit burst
            for (let i = 0; i < 20; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 60 + Math.random() * 160;
              const life = 0.4 + Math.random() * 0.5;
              const color = i % 2 === 0 ? '#8855CC' : '#AA77EE';
              this.emitParticle(pcx, pcy, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 3 + Math.random() * 4, color);
            }
            // Knockback away from ghost
            player.vx += (dx > 0 ? 1 : -1) * 180;
            player.vy = -180;
            player.damageFlashSide = dx > 0 ? 'left' : 'right';
            player.damageFlashTimer = 0.4;
            player.squashScale = 0.6;
            player.squashTimer = 0.2;
            this.state.screenShake = Math.max(this.state.screenShake, 0.2);
            this.state.screenFlash = Math.max(this.state.screenFlash, 0.06);
            player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
            this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HAZARD_HITSTOP_DURATION);
            break;
          }
        }
      }

      // Lava rock collision
      for (const rock of this.state.lavaRocks) {
        if (!rock.active) continue;
        if (player.slowTimer <= 0 && player.invincibleTimer <= 0) {
          const dx = (player.x + player.width / 2) - rock.x;
          const dy = (player.y + player.height / 2) - rock.y;
          const hitDist = rock.size + player.width * 0.3;
          if (dx * dx + dy * dy < hitDist * hitDist) {
            rock.active = false;
            player.slowTimer = THORN_SLOW_DURATION;
            this.playSound('thornhit');
            const pcx = player.x + player.width / 2;
            const pcy = player.y + player.height / 2;
            for (let i = 0; i < 16; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 60 + Math.random() * 150;
              const life = 0.3 + Math.random() * 0.5;
              const color = i % 2 === 0 ? '#FF6600' : '#FFAA00';
              this.emitParticle(pcx, pcy, Math.cos(angle) * speed, Math.sin(angle) * speed - 60, life, 2.5 + Math.random() * 4, color);
            }
            player.vx += dx > 0 ? -120 : 120;
            player.vy = -150;
            player.damageFlashSide = dx > 0 ? 'left' : 'right';
            player.damageFlashTimer = 0.3;
            player.squashScale = 0.65;
            player.squashTimer = 0.2;
            this.state.screenShake = Math.max(this.state.screenShake, 0.2);
            player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);
            this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HAZARD_HITSTOP_DURATION);
          }
        }
      }

      // Fall-off detection (rooftops, treetops — gaps in ground)
      // No score penalty — just lose ~1 second to respawn in hurt state
      if (this.arena.allowFallOff && player.y > CANVAS_HEIGHT + 50) {
        const spawn = this.arena.spawnPoints[Math.floor(this.gameRandom() * this.arena.spawnPoints.length)];
        player.x = spawn.x - player.width / 2;
        player.y = spawn.y - player.height;
        player.vx = 0;
        player.vy = 0;
        player.state = 'idle';
        player.invincibleTimer = 1.5;
        player.slowTimer = 2.0; // respawn slowed (hurt state)
        player.fastFalling = false;
        player.fatTimer = 0;
        this.playSound('oof');
        this.state.screenShake = Math.max(this.state.screenShake, 0.1);
      }


      // Effect zone interactions
      if (this.arena.effectZones) {
        for (let zi = 0; zi < this.arena.effectZones.length; zi++) {
          const zone: EffectZone = this.arena.effectZones[zi];
          if (!aabbOverlap(player.x, player.y, player.width, player.height, zone.x, zone.y, zone.width, zone.height)) continue;

          if (zone.type === 'zero_g') {
            // Low gravity field — boost upward movement, slow falls
            if (player.vy > 0) {
              // Falling — slow down significantly
              player.vy *= 0.92;
            } else if (player.vy < 0) {
              // Rising — boost upward (amplify jumps)
              player.vy *= 1.03;
            }
          } else if (zone.type === 'current') {
            // Push player horizontally and/or vertically
            player.vx += (zone.vx || 0) * dt;
            player.vy += (zone.vy || 0) * dt;
          } else if (zone.type === 'geyser') {
            // Find matching geyser state
            const geyserIdx = this.geyserIndexMap.get(zone) ?? -1;
            if (geyserIdx >= 0 && this.state.geyserStates[geyserIdx]?.active) {
              player.vy = Math.min(player.vy, zone.strength || -550);
              player.state = 'airborne';
            }
          }
        }
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
            player.vy = SPRING_BOUNCE * 0.85;
            player.state = 'airborne';
            this.state.bouncyWobble.set(bi, 0.4);
            this.playSound('jump');
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
          this.playSound('crunch');
          audio.playAnimal(player.character.name);
          // Hitstop — shorter than kill (half duration)
          player.hitstopTimer = Math.max(player.hitstopTimer, HITSTOP_DURATION * 0.5);
          this.state.hitstopZoom = Math.max(this.state.hitstopZoom, HITSTOP_DURATION * 0.5);
          // Score animation for carrot pickup
          this.state.scoreAnimations.push({ playerId: player.id, value: player.score, timer: SCORE_ANIM_DURATION });
          // Pickup VFX — orange burst from carrot position
          this.pickupCarrotVFX(carrot.x, carrot.y);
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
    const zeroGZones = this.cachedZeroGZones;
    if (zeroGZones.length > 0) {
      let anyInZeroG = false;
      for (const p of this.state.players) {
        if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
        for (const z of zeroGZones) {
          if (aabbOverlap(p.x, p.y, p.width, p.height, z.x, z.y, z.width, z.height)) {
            anyInZeroG = true;
            break;
          }
        }
        if (anyInZeroG) break;
      }
      if (anyInZeroG && !this.zeroGSoundPlaying) {
        this.playSound('zero_g');
        this.zeroGSoundPlaying = true;
      } else if (!anyInZeroG && this.zeroGSoundPlaying) {
        audio.stop('zero_g');
        this.zeroGSoundPlaying = false;
      }
    }

    // Stomps
    const { killFeedEntries } = checkStomps(this.state.players, this.arena.spawnPoints, this.state.timeElapsed, this.settings.mods);

    if (killFeedEntries.length > 0) {
      this.playSound('stomp');
      this.state.screenShake = SCREEN_SHAKE_DURATION;
      this.state.hitstopZoom = HITSTOP_DURATION;
    }

    for (const entry of killFeedEntries) {
      const attacker = this.state.players.find(p => p.id === entry.attacker);
      if (attacker) {
        attacker.hitstopTimer = Math.max(attacker.hitstopTimer, HITSTOP_DURATION);
        audio.playAnimal(attacker.character.name);
        // Stats: kill streak
        attacker.killStreak += 1;
        const aps = this.state.stats.perPlayer.get(attacker.id);
        if (aps && attacker.killStreak > aps.bestStreak) aps.bestStreak = attacker.killStreak;
        // Score animation for attacker
        this.state.scoreAnimations.push({ playerId: attacker.id, value: attacker.score, timer: SCORE_ANIM_DURATION });
      }
      const victim = this.state.players.find(p => p.id === entry.victim);
      if (victim) {
        victim.hitstopTimer = Math.max(victim.hitstopTimer, HITSTOP_DURATION);
        this.spawnKillSplatter(victim);
        // Shockwave at victim position
        this.state.shockwaves.push({
          x: victim.x + victim.width / 2,
          y: victim.y + victim.height / 2,
          radius: 0,
          maxRadius: SHOCKWAVE_MAX_RADIUS,
          life: SHOCKWAVE_DURATION,
        });
        // Damage flash on victim
        if (attacker) {
          victim.damageFlashSide = attacker.x < victim.x ? 'left' : 'right';
        } else {
          victim.damageFlashSide = null;
        }
        victim.damageFlashTimer = 0.3;
        // Stats: reset kill streak on death
        victim.killStreak = 0;
      }
    }
    if (killFeedEntries.length > 0) {
      this.state.killFeed.push(...killFeedEntries);
      // Cap kill feed — keep newest 10 via copyWithin + truncate (avoids O(n) splice from front)
      const excess = this.state.killFeed.length - 10;
      if (excess > 0) {
        this.state.killFeed.copyWithin(0, excess);
        this.state.killFeed.length = 10;
      }
    }

    collidePlayersHorizontal(this.state.players);
    // Bump sound: detect player-player push (sideSquash set to 0.8 by collision)
    if (this.bumpCooldown <= 0) {
      for (const player of this.state.players) {
        if (player.active && player.sideSquash === 0.8) {
          this.playSound('bump');
          this.bumpCooldown = 0.2;
          break; // one bump sound per collision event
        }
      }
    }
    // Re-resolve platform collisions after player-player pushes
    // (prevents getting shoved inside solid blocks like the mausoleum)
    for (const player of this.state.players) {
      if (!player.active || player.state === 'splat' || player.state === 'respawning') continue;
      collidePlatforms(player, this.arena.platforms);
    }
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt, this.rng);
    this.updateParticles(dt);
    this.updateGibs(dt);
    this.updateConfetti(dt);

    // Decay shockwaves
    for (const sw of this.state.shockwaves) {
      const progress = 1 - sw.life / SHOCKWAVE_DURATION;
      sw.radius = sw.maxRadius * progress;
      sw.life -= dt;
    }
    for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
      if (this.state.shockwaves[i].life <= 0) {
        swapRemove(this.state.shockwaves, i);
      }
    }

    // Decay score animations
    for (const sa of this.state.scoreAnimations) {
      sa.timer -= dt;
    }
    for (let i = this.state.scoreAnimations.length - 1; i >= 0; i--) {
      if (this.state.scoreAnimations[i].timer <= 0) {
        swapRemove(this.state.scoreAnimations, i);
      }
    }

    // Update wildlife
    for (const w of this.state.wildlife) {
      w.wingPhase += dt * 8;
      if (w.type === 'butterfly') {
        w.x += w.vx * dt;
        w.vy = Math.sin(w.wingPhase * 0.5) * 20;
        w.y += w.vy * dt;
        // Wrap around screen
        if (w.x > CANVAS_WIDTH + 20) w.x = -20;
        if (w.x < -20) w.x = CANVAS_WIDTH + 20;
        if (w.y < -20) w.y = CANVAS_HEIGHT * 0.6;
        if (w.y > CANVAS_HEIGHT * 0.6) w.y = 0;
      } else {
        // Bird: fly right, respawn left
        w.x += w.vx * dt;
        w.y += Math.sin(w.wingPhase * 0.3) * 5 * dt;
        if (w.x > CANVAS_WIDTH + 50) {
          w.x = -50 - Math.random() * 100;
          w.y = Math.random() * CANVAS_HEIGHT * 0.4;
          w.vx = 40 + Math.random() * 40;
        }
      }
    }

    // Update fog particles
    for (const f of this.state.fogParticles) {
      f.x += f.vx * dt;
      if (f.x > CANVAS_WIDTH + 30) f.x = -30;
    }

    // Update pollen particles
    for (const p of this.state.pollenParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Respawn at bottom when off top
      if (p.y < -10) {
        p.y = CANVAS_HEIGHT + 10;
        p.x = Math.random() * CANVAS_WIDTH;
      }
    }

    // Shooting stars (rare spawn during night phase > 0.4, if enabled by theme)
    if (this.theme.dayNight.showShootingStars && this.state.dayPhase > 0.4 && Math.random() < 0.005) {
      const svx = 300 + Math.random() * 200;
      const svy = 50 + Math.random() * 50;
      this.state.shootingStars.push({
        x: Math.random() * CANVAS_WIDTH * 0.5,
        y: Math.random() * CANVAS_HEIGHT * 0.3,
        vx: svx, vy: svy, life: 0.4,
        tailLen: Math.min(40, Math.sqrt(svx * svx + svy * svy) * 0.1),
      });
    }
    for (const star of this.state.shootingStars) {
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.life -= dt;
    }
    for (let i = this.state.shootingStars.length - 1; i >= 0; i--) {
      if (this.state.shootingStars[i].life <= 0) {
        swapRemove(this.state.shootingStars, i);
      }
    }

    // Crowd cheering: ramp up volume near end of match
    let leadScore = 0;
    for (const p of this.state.players) { if (p.active && p.score > leadScore) leadScore = p.score; }
    if (leadScore >= this.settings.killLimit - 3) {
      if (!this.crowdStarted) {
        this.playSound('crowd');
        this.crowdStarted = true;
      }
      if (leadScore >= this.settings.killLimit - 1) {
        audio.setVolume('crowd', 0.3);
      } else {
        audio.setVolume('crowd', 0.15);
      }
    } else if (this.crowdStarted) {
      audio.setVolume('crowd', 0);
      audio.stop('crowd');
      this.crowdStarted = false;
    }

    // Periodic ambient sounds
    const ambConfig = this.theme.ambientSoundConfig;
    if (ambConfig?.periodic) {
      for (const p of ambConfig.periodic) {
        const remaining = (this.periodicAmbientTimers.get(p.sound) ?? 0) - dt;
        if (remaining <= 0) {
          this.playSound(p.sound);
          const next = p.intervalRange[0] + Math.random() * (p.intervalRange[1] - p.intervalRange[0]);
          this.periodicAmbientTimers.set(p.sound, next);
        } else {
          this.periodicAmbientTimers.set(p.sound, remaining);
        }
      }
    }

    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    for (const player of this.state.players) {
      if (player.active && player.score >= this.settings.killLimit) {
        this.state.slowMotion = SLOW_MO_DURATION; // slow-mo on final kill
        this.endMatch(player.id);
        return;
      }
    }
    if (this.settings.timeLimit > 0 && this.state.timeElapsed >= this.settings.timeLimit) {
      let winner: PlayerSlot | null = null;
      let maxScore = -1;
      for (const player of this.state.players) {
        if (player.active && player.score > maxScore) { maxScore = player.score; winner = player.id; }
      }
      this.state.slowMotion = SLOW_MO_DURATION;
      this.endMatch(winner);
    }
  }

  private getPlayerInput(player: Player): InputState {
    // Network mode: use injected inputs for human players
    if (this._networkInputs) {
      const netInput = this._networkInputs.get(player.id);
      if (netInput) return netInput;
    }
    if (isBotSlot(player.id)) {
      const ai = this.aiControllers.get(player.id);
      if (ai) return ai.getInput(player, this.state, this.arena, this.settings.mods.carrotChase, this.settings.mods.mirrorArena);
      return { left: false, right: false, jump: false, down: false };
    }
    return this.input.getInput(player.id as import('./types').CharacterSlot);
  }

  private endMatch(winner: PlayerSlot | null): void {
    this.state.matchOver = true;
    this.state.winner = winner;
    this.state.screenFlash = SCREEN_FLASH_DURATION;
    audio.stopMusic();
    this.playSound('victory');
    this.onMatchEnd(winner, this.state);
  }
}
