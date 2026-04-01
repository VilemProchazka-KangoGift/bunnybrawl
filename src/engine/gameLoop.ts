import type {
  MatchState, MatchSettings, Arena, PlayerSlot, Player, Particle,
  WeatherParticle, MatchStats, PlayerStats, WildlifeEntity, EffectZone, Platform,
  InputState,
} from './types';
import { isBotSlot } from './types';
import type { ThemeConfig } from './themes/types';
import { getTheme } from './themes/registry';
import { randRange, pickWeighted, swapRemove } from './themes/utils';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState, applyArenaConstraints, collidePlayersHorizontal, aabbOverlap } from './physics';
import { checkStomps, updateSplatTimers } from './stomp';
import { audio } from './audio';
import {
  FIXED_TIMESTEP, MAX_FRAME_TIME,
  PLAYER_WIDTH, PLAYER_HEIGHT, ANIM_FRAME_DURATION, RUN_FRAMES,
  DUST_LAND_VY_THRESHOLD, CARROT_SPAWN_INTERVAL, CARROT_SIZE,
  FAT_DURATION, SPRING_BOUNCE, SPRING_SIZE,
  THORN_SLOW_DURATION, CANVAS_WIDTH, CANVAS_HEIGHT,
  SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL, HAZARD_LIFETIME, HAZARD_GROW_TIME,
  SCREEN_SHAKE_DURATION, SLOW_MO_DURATION, SLOW_MO_FACTOR,
  SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
  MATCH_COUNTDOWN, IDLE_ANIM_INTERVAL,
  SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  SPRING_TRAIL_DURATION, SCORE_ANIM_DURATION,
  GRAVITY, FRICTION, MAX_WALK_SPEED, JUMP_IMPULSE, MAX_FALL_SPEED,
} from './constants';
import { getCharacterForSlot } from './characters';
import { AIController } from './ai';

export type MatchEndCallback = (winner: PlayerSlot | null, state: MatchState) => void;

export class GameLoop {
  private arena: Arena;
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
  private newSplatsSinceRender: number[] = [];
  private particles: Particle[] = [];
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

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: PlayerSlot[],
    onMatchEnd: MatchEndCallback,
  ) {
    this.arena = arena;
    this.settings = settings;
    this.onMatchEnd = onMatchEnd;
    this.theme = getTheme(arena.themeId);
    this.input = new InputManager();
    this.renderer = new Renderer(bgCanvas, fgCanvas, this.theme);

    // Compute effective physics from theme modifiers
    const pm = this.theme.physics;
    this.effGravity = GRAVITY * (pm?.gravity ?? 1);
    this.effFriction = FRICTION * (pm?.friction ?? 1);
    this.effWalkSpeed = MAX_WALK_SPEED * (pm?.walkSpeed ?? 1);
    this.effJumpImpulse = JUMP_IMPULSE * (pm?.jumpImpulse ?? 1);
    this.effMaxFallSpeed = MAX_FALL_SPEED * (pm?.gravity ?? 1); // scale with gravity

    const players: Player[] = activePlayers.map((slot, index) => ({
      id: slot,
      character: getCharacterForSlot(slot),
      x: arena.spawnPoints[index % arena.spawnPoints.length].x - PLAYER_WIDTH / 2,
      y: arena.spawnPoints[index % arena.spawnPoints.length].y - PLAYER_HEIGHT,
      vx: 0, vy: 0,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      state: 'idle' as const, facing: 'right' as const,
      splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
      score: 0, active: true, animFrame: 0, animTimer: 0,
      fastFalling: false, fatTimer: 0, slowTimer: 0,
      squashScale: 1, squashTimer: 0, afterimages: [], idleAnimTimer: 0,
      expression: 'normal' as const, killStreak: 0,
      breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0,
    }));

    // Init AI controllers for bot players
    const botDifficulty = settings.botDifficulty ?? 'medium';
    for (const player of players) {
      if (isBotSlot(player.id)) {
        this.aiControllers.set(player.id, new AIController(player.id, player.character.name, botDifficulty));
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
      splatMarks: [], killFeed: [],
      timeElapsed: 0, matchOver: false, winner: null,
      carrots: [], carrotTimer: CARROT_SPAWN_INTERVAL,
      springs: [], thorns: [],
      springSpawnTimer: 5, // first spring after 5s
      thornSpawnTimer: 8,  // first thorn after 8s
      screenShake: 0, slowMotion: 0,
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
      lavaRockTimer: this.theme.lavaRockConfig ? randRange(this.theme.lavaRockConfig.spawnInterval) : 9999,
      wind: { direction: 0, strength: 0, timer: this.theme.windConfig ? 5 + Math.random() * 5 : 9999, phase: 'idle' as const },
      geyserStates: (arena.effectZones || []).filter(z => z.type === 'geyser').map(z => ({
        timer: (z.interval || 10) * Math.random(),
        active: false,
        activeTimer: 0,
      })),
      pigeonFlocks: (this.theme.pigeonConfig?.positions || []).map(p => ({
        x: p.x, y: p.y, active: true, respawnTimer: 0,
        scatterParticles: [],
      })),
      bouncyWobble: new Map(),
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
          x: Math.random() * CANVAS_WIDTH,
          y: 300 + Math.random() * 300,
          vx: (Math.random() < 0.5 ? -1 : 1) * gc.speed * (0.7 + Math.random() * 0.6),
          size: gc.size,
          alpha: 0.5 + Math.random() * 0.3,
          wobblePhase: Math.random() * Math.PI * 2,
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
    this.renderer.renderBackground(this.arena);
    this.running = true;
    this.lastTime = performance.now();
    audio.playMusic(this.arena.themeId);
    audio.play('ambient');
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.input.detach();
    audio.stopMusic();
    audio.stop('ambient');
    audio.stop('wind');
    audio.stop('zero_g');
    audio.stop('crowd');
  }

  getState(): MatchState { return this.state; }
  pause(): void { this.paused = true; audio.stopMusic(); }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.playMusic(this.arena.themeId); }
  isPaused(): boolean { return this.paused; }

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

    // Fireworks when match is over
    if (this.state.matchOver) {
      this.fireworkTimer -= frameTime;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.3;
        this.spawnFirework();
      }
      // Update firework particles with gravity
      this.updateParticles(frameTime);
    }

    // Render
    if (this.newSplatsSinceRender.length > 0) {
      const newSplats = this.newSplatsSinceRender.map(i => this.state.splatMarks[i]);
      this.renderer.renderSplatMarks(newSplats, this.settings.goreMode);
      this.newSplatsSinceRender.length = 0;
      // Cap after rendering to prevent unbounded growth (old marks are baked into bg canvas)
      if (this.state.splatMarks.length > 200) {
        this.state.splatMarks.length = 200;
      }
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
      const fp = candidates[Math.floor(Math.random() * candidates.length)];
      const x = fp.plat.x + 20 + Math.random() * (fp.plat.width - 40);
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
      const fp = this.floatingPlatforms[Math.floor(Math.random() * this.floatingPlatforms.length)];
      const x = fp.plat.x + 10 + Math.random() * (fp.plat.width - 44);
      if (!this.playerNearSpawn(fp.plat, x)) {
        this.state.thorns.push({
          x, y: fp.plat.y - 12, width: 28, height: 12,
          platformIndex: fp.idx, life: HAZARD_LIFETIME, growTimer: HAZARD_GROW_TIME, hit: false,
        });
        return;
      }
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
      this.particles.push({ x: cx + (Math.random() - 0.5) * player.width * 1.5, y: groundY - Math.random() * 4, vx: (Math.random() - 0.5) * 150 * intensity, vy: -Math.random() * 80 * intensity - 20, life, maxLife: life, size: 2 + Math.random() * 4 * intensity, color: '#C8B896' });
    }
  }

  private spawnRunDust(player: Player): void {
    const groundY = player.y + player.height;
    const behindX = player.facing === 'right' ? player.x - 2 : player.x + player.width + 2;
    const life = 0.15 + Math.random() * 0.15;
    this.particles.push({ x: behindX + (Math.random() - 0.5) * 6, y: groundY - Math.random() * 3, vx: (player.facing === 'right' ? -1 : 1) * (20 + Math.random() * 30), vy: -Math.random() * 20 - 5, life, maxLife: life, size: 1.5 + Math.random() * 2, color: '#C8B896' });
  }

  private spawnImpactDust(player: Player, direction: 'up' | 'left' | 'right'): void {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    for (let i = 0; i < 4; i++) {
      let px: number, py: number, pvx: number, pvy: number;
      if (direction === 'up') { px = cx + (Math.random() - 0.5) * player.width; py = player.y + 2; pvx = (Math.random() - 0.5) * 60; pvy = Math.random() * 40 + 10; }
      else { const side = direction === 'right' ? player.x + player.width : player.x; px = side; py = cy + (Math.random() - 0.5) * player.height * 0.6; pvx = (direction === 'right' ? -1 : 1) * (20 + Math.random() * 40); pvy = -Math.random() * 30; }
      const life = 0.2 + Math.random() * 0.2;
      this.particles.push({ x: px, y: py, vx: pvx, vy: pvy, life, maxLife: life, size: 1.5 + Math.random() * 2.5, color: '#C8B896' });
    }
  }

  private spawnKillSplatter(victim: Player): void {
    const cx = victim.x + victim.width / 2;
    const cy = victim.y + victim.height / 2;
    const color = this.settings.goreMode ? '#CC2222' : victim.character.color;
    const count = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      const life = 0.4 + Math.random() * 0.6;
      this.particles.push({ x: cx + (Math.random() - 0.5) * 10, y: cy + (Math.random() - 0.5) * 10, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life, maxLife: life, size: 3 + Math.random() * 5, color });
    }
  }

  private spawnCarrotVFX(x: number, y: number): void {
    // Sparkle burst when carrot appears
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      const life = 0.5 + Math.random() * 0.3;
      this.particles.push({ x, y: y + CARROT_SIZE / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 2 + Math.random() * 3, color: i % 2 === 0 ? '#FFD700' : '#FF8C00' });
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
      this.particles.push({
        x: fx, y: fy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50, // upward bias
        life, maxLife: life,
        size: 2 + Math.random() * 4,
        color,
      });
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
        const cx = plat.x + 20 + Math.random() * (plat.width - 40);
        const cy = plat.y - CARROT_SIZE;
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
      }
      // Mid-air candidates above platforms (reachable by jumping)
      for (let attempt = 0; attempt < 2; attempt++) {
        const cx = plat.x + 20 + Math.random() * (plat.width - 40);
        const cy = plat.y - 60 - Math.random() * 60;
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
      }
    }
    // Extra mid-air candidates inside effect zones (carrots floating in zero-G, etc.)
    for (const zone of this.cachedZeroGZones) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const cx = zone.x + 30 + Math.random() * (zone.width - 60);
        const cy = zone.y + 30 + Math.random() * (zone.height - 60);
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) * 2.25 }); // 1.5x bias squared
      }
    }
    // Filter out candidates too close to existing carrots
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
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        swapRemove(this.particles, i);
        // don't decrement i — re-check the swapped element at this index
        continue; // loop decrements i, but the element at i is new — acceptable 1-frame delay
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
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

  private fixedUpdate(dt: number): void {
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
        audio.play('countdown_go');
      } else if (curSec < prevSec) {
        audio.play('countdown_beep');
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
      this.state.springSpawnTimer = SPRING_SPAWN_INTERVAL + Math.random() * 5;
    }
    this.state.thornSpawnTimer -= dt;
    if (this.state.thornSpawnTimer <= 0) {
      this.spawnThorn();
      this.state.thornSpawnTimer = THORN_SPAWN_INTERVAL + Math.random() * 5;
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
      this.state.carrotTimer = CARROT_SPAWN_INTERVAL;
    }

    // Weather
    this.updateWeather(dt);

    // Update lava rocks
    if (this.theme.lavaRockConfig) {
      const lrc = this.theme.lavaRockConfig;
      this.state.lavaRockTimer -= dt;
      if (this.state.lavaRockTimer <= 0) {
        this.state.lavaRockTimer = randRange(lrc.spawnInterval);
        this.state.lavaRocks.push({
          x: 80 + Math.random() * (CANVAS_WIDTH - 160),
          y: -20,
          vy: randRange(lrc.fallSpeed),
          size: randRange(lrc.sizeRange),
          rotation: Math.random() * Math.PI * 2,
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

    // Update wind system
    if (this.theme.windConfig) {
      const wc = this.theme.windConfig;
      const wind = this.state.wind;
      wind.timer -= dt;
      if (wind.phase === 'idle' && wind.timer <= 0) {
        wind.phase = 'building';
        wind.direction = Math.random() < 0.5 ? -1 : 1;
        wind.timer = wc.buildDuration;
        audio.play('wind');
      } else if (wind.phase === 'building') {
        wind.strength = wc.maxStrength * (1 - wind.timer / wc.buildDuration);
        if (wind.timer <= 0) { wind.phase = 'peak'; wind.timer = wc.peakDuration; }
      } else if (wind.phase === 'peak') {
        wind.strength = wc.maxStrength;
        if (wind.timer <= 0) { wind.phase = 'fading'; wind.timer = wc.fadeDuration; }
      } else if (wind.phase === 'fading') {
        wind.strength = wc.maxStrength * (wind.timer / wc.fadeDuration);
        if (wind.timer <= 0) {
          wind.phase = 'idle';
          wind.strength = 0;
          wind.timer = randRange(wc.interval);
          audio.stop('wind');
        }
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
          audio.play('geyser');
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
            this.particles.push({
              x: fx, y: fy,
              vx: (Math.random() - 0.5) * 40,
              vy: -60 - Math.random() * 80,
              life, maxLife: life,
              size: 2 + Math.random() * 4,
              color: colors[Math.floor(Math.random() * colors.length)],
            });
          }
        }
      }
      // Breathing animation
      player.breathTimer += dt;
      // Decay damage flash and spring trail
      if (player.damageFlashTimer > 0) player.damageFlashTimer -= dt;
      if (player.springTrailTimer > 0) player.springTrailTimer -= dt;
    }

    // Input + physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      const input = this.getPlayerInput(player);
      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;

      // Bot walk speed penalty (easy bots move slower)
      let playerWalkSpeed = this.effWalkSpeed;
      if (isBotSlot(player.id)) {
        const ai = this.aiControllers.get(player.id);
        if (ai) playerWalkSpeed *= ai.getWalkSpeedMult();
      }
      applyInput(player, input, dt, playerWalkSpeed, this.effFriction, this.effJumpImpulse);
      if (!wasAirborne && player.state === 'airborne') {
        audio.play('jump');
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

      if (justLanded && prevVy >= DUST_LAND_VY_THRESHOLD) this.spawnDustParticles(player, prevVy);
      if (player.state === 'run' && Math.abs(player.vx) > 150 && Math.random() < 0.3) this.spawnRunDust(player);
      if (wasAirborne && prevVy < -50 && player.vy === 0 && player.state === 'airborne') this.spawnImpactDust(player, 'up');

      // Oof sound: when player hits a wall (prevVx was high, now 0)
      if (Math.abs(prevVx) > 100 && player.vx === 0 && prevVx !== 0) {
        this.spawnImpactDust(player, prevVx > 0 ? 'right' : 'left');
        audio.play('oof');
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
            this.particles.push({
              x: cx + (Math.random() - 0.5) * player.width * 1.5,
              y: groundY - Math.random() * 3,
              vx: (Math.random() - 0.5) * 100 * intensity,
              vy: -(Math.random() * 60 + 30) * intensity, // FLY UPWARD
              life, maxLife: life,
              size: 2 + Math.random() * 3,
              color: i % 3 === 0 ? this.theme.platform.floatingBodyColor : this.theme.platform.groundTopColor,
            });
          }
        }
      }

      // Squash when pressing down on ground (crouch)
      if (input.down && player.state !== 'airborne') {
        player.squashScale = SQUASH_ON_CROUCH;
      } else {
        // Squash/stretch decay
        if (player.squashTimer > 0) {
          player.squashTimer -= dt;
          player.squashScale += (1.0 - player.squashScale) * SQUASH_DECAY_SPEED * dt;
        } else {
          player.squashScale = 1.0;
        }
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
          audio.play(playerBottom > 600 ? 'footstep_grass' : 'footstep_wood');
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
          audio.play('jump');
        }
      }

      // Thorn collision (only fully grown)
      for (const thorn of this.state.thorns) {
        if (thorn.growTimer > 0 || thorn.hit) continue;
        if (player.slowTimer <= 0 && player.invincibleTimer <= 0 && aabbOverlap(player.x, player.y, player.width, player.height, thorn.x, thorn.y, thorn.width, thorn.height)) {
          player.slowTimer = THORN_SLOW_DURATION;
          thorn.hit = true;
          audio.play('thornhit');

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
            this.particles.push({ x: px + (Math.random() - 0.5) * 8, y: py + (Math.random() - 0.5) * 8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, life, maxLife: life, size: 2.5 + Math.random() * 4, color: '#CC2222' });
          }
          // Thorn shrapnel
          for (let i = 0; i < 8; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const speed = 30 + Math.random() * 80;
            const life = 0.3 + Math.random() * 0.3;
            this.particles.push({ x: tx, y: ty, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 1.5 + Math.random() * 2, color: '#5C3A1E' });
          }
          // Small screen shake
          this.state.screenShake = Math.max(this.state.screenShake, 0.15);
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
            audio.play('thornhit');
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            // Big particle burst
            for (let i = 0; i < 24; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 80 + Math.random() * 200;
              const life = 0.4 + Math.random() * 0.6;
              const color = hz.type === 'lava' ? (i % 3 === 0 ? '#FFCC00' : i % 3 === 1 ? '#FF4400' : '#FF8800') : '#CC2222';
              this.particles.push({ x: px + (Math.random() - 0.5) * 12, y: py + (Math.random() - 0.5) * 12, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 100, life, maxLife: life, size: 3 + Math.random() * 5, color });
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
            audio.play('thornhit');
            // Big ghost hit burst
            for (let i = 0; i < 20; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 60 + Math.random() * 160;
              const life = 0.4 + Math.random() * 0.5;
              const color = i % 2 === 0 ? '#8855CC' : '#AA77EE';
              this.particles.push({ x: pcx, y: pcy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, life, maxLife: life, size: 3 + Math.random() * 4, color });
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
            audio.play('thornhit');
            const pcx = player.x + player.width / 2;
            const pcy = player.y + player.height / 2;
            for (let i = 0; i < 16; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 60 + Math.random() * 150;
              const life = 0.3 + Math.random() * 0.5;
              const color = i % 2 === 0 ? '#FF6600' : '#FFAA00';
              this.particles.push({ x: pcx, y: pcy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life, maxLife: life, size: 2.5 + Math.random() * 4, color });
            }
            player.vx += dx > 0 ? -120 : 120;
            player.vy = -150;
            player.damageFlashSide = dx > 0 ? 'left' : 'right';
            player.damageFlashTimer = 0.3;
            player.squashScale = 0.65;
            player.squashTimer = 0.2;
            this.state.screenShake = Math.max(this.state.screenShake, 0.2);
          }
        }
      }

      // Fall-off detection (rooftops, treetops — gaps in ground)
      // No score penalty — just lose ~1 second to respawn in hurt state
      if (this.arena.allowFallOff && player.y > CANVAS_HEIGHT + 50) {
        const spawn = this.arena.spawnPoints[Math.floor(Math.random() * this.arena.spawnPoints.length)];
        player.x = spawn.x - player.width / 2;
        player.y = spawn.y - player.height;
        player.vx = 0;
        player.vy = 0;
        player.state = 'idle';
        player.invincibleTimer = 1.5;
        player.slowTimer = 2.0; // respawn slowed (hurt state)
        player.fastFalling = false;
        player.fatTimer = 0;
        audio.play('oof');
        this.state.screenShake = Math.max(this.state.screenShake, 0.1);
      }

      // Wind force (affects airborne players)
      if (this.state.wind.strength > 0 && player.state === 'airborne') {
        player.vx += this.state.wind.direction * this.state.wind.strength * dt;
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
            // Push player horizontally
            player.vx += (zone.vx || 0) * dt;
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
            audio.play('jump');
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
          audio.play('pigeon_scatter');
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
          audio.play('select');
          audio.playAnimal(player.character.name);
          // Score animation for carrot pickup
          this.state.scoreAnimations.push({ playerId: player.id, value: player.score, timer: SCORE_ANIM_DURATION });
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
        audio.play('zero_g');
        this.zeroGSoundPlaying = true;
      } else if (!anyInZeroG && this.zeroGSoundPlaying) {
        audio.stop('zero_g');
        this.zeroGSoundPlaying = false;
      }
    }

    // Stomps
    const { splatMarks, killFeedEntries } = checkStomps(this.state.players, this.arena.spawnPoints, this.state.timeElapsed);

    if (splatMarks.length > 0) {
      const startIdx = this.state.splatMarks.length;
      this.state.splatMarks.push(...splatMarks);
      for (let i = 0; i < splatMarks.length; i++) this.newSplatsSinceRender.push(startIdx + i);
      audio.play('stomp');
      // Screen shake on kill
      this.state.screenShake = SCREEN_SHAKE_DURATION;
    }

    for (const entry of killFeedEntries) {
      const attacker = this.state.players.find(p => p.id === entry.attacker);
      if (attacker) {
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
      // Cap kill feed (HUD only shows last 3)
      if (this.state.killFeed.length > 10) {
        this.state.killFeed.splice(0, this.state.killFeed.length - 10);
      }
    }

    collidePlayersHorizontal(this.state.players);
    // Re-resolve platform collisions after player-player pushes
    // (prevents getting shoved inside solid blocks like the mausoleum)
    for (const player of this.state.players) {
      if (!player.active || player.state === 'splat' || player.state === 'respawning') continue;
      collidePlatforms(player, this.arena.platforms);
    }
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt);
    this.updateParticles(dt);

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
      this.state.shootingStars.push({
        x: Math.random() * CANVAS_WIDTH * 0.5,
        y: Math.random() * CANVAS_HEIGHT * 0.3,
        vx: 300 + Math.random() * 200,
        vy: 50 + Math.random() * 50,
        life: 0.4,
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
        audio.play('crowd');
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
    if (isBotSlot(player.id)) {
      const ai = this.aiControllers.get(player.id);
      if (ai) return ai.getInput(player, this.state, this.arena);
      return { left: false, right: false, jump: false, down: false };
    }
    return this.input.getInput(player.id as import('./types').CharacterSlot);
  }

  private endMatch(winner: PlayerSlot | null): void {
    this.state.matchOver = true;
    this.state.winner = winner;
    this.state.screenFlash = SCREEN_FLASH_DURATION;
    audio.stopMusic();
    audio.play('victory');
    this.onMatchEnd(winner, this.state);
  }
}
