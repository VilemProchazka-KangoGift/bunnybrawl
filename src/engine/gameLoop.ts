import type {
  MatchState, MatchSettings, Arena, CharacterSlot, Player, Particle,
  WeatherParticle, MatchStats, PlayerStats, WildlifeEntity,
} from './types';
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
  WEATHER_PARTICLE_COUNT,
  SQUASH_ON_LAND, STRETCH_ON_JUMP, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
  DAY_CYCLE_DURATION, MATCH_COUNTDOWN, IDLE_ANIM_INTERVAL,
  SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SCREEN_FLASH_DURATION,
  SPRING_TRAIL_DURATION, SCORE_ANIM_DURATION,
  WILDLIFE_COUNT, FOG_PARTICLE_COUNT, POLLEN_COUNT,
} from './constants';
import { CHARACTERS } from './characters';

export type MatchEndCallback = (winner: CharacterSlot | null, state: MatchState) => void;

export class GameLoop {
  private arena: Arena;
  private settings: MatchSettings;
  private state: MatchState;
  private input: InputManager;
  private renderer: Renderer;
  private onMatchEnd: MatchEndCallback;

  private lastTime = 0;
  private accumulator = 0;
  private rafId = 0;
  private running = false;
  private paused = false;
  private newSplatsSinceRender: number[] = [];
  private particles: Particle[] = [];
  private fireworkTimer = 0;
  private afterimageAccumulators: Map<CharacterSlot, number> = new Map();
  private footstepAccumulators: Map<CharacterSlot, number> = new Map();
  private crowdStarted = false;

  constructor(
    bgCanvas: HTMLCanvasElement,
    fgCanvas: HTMLCanvasElement,
    arena: Arena,
    settings: MatchSettings,
    activePlayers: CharacterSlot[],
    onMatchEnd: MatchEndCallback,
  ) {
    this.arena = arena;
    this.settings = settings;
    this.onMatchEnd = onMatchEnd;
    this.input = new InputManager();
    this.renderer = new Renderer(bgCanvas, fgCanvas);

    const players: Player[] = activePlayers.map((slot, index) => ({
      id: slot,
      character: CHARACTERS[slot],
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
      breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0,
    }));

    // Init weather particles
    const weather: WeatherParticle[] = [];
    for (let i = 0; i < WEATHER_PARTICLE_COUNT; i++) {
      weather.push(this.createWeatherParticle(true));
    }

    // Init stats
    const statsMap = new Map<CharacterSlot, PlayerStats>();
    for (const slot of activePlayers) {
      statsMap.set(slot, { bestStreak: 0, timeAirborne: 0, distanceTraveled: 0, carrotsEaten: 0 });
    }
    const stats: MatchStats = { perPlayer: statsMap };

    // Init wildlife
    const wildlife: WildlifeEntity[] = [];
    const brightColors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF78C4', '#A66CFF'];
    for (let i = 0; i < WILDLIFE_COUNT; i++) {
      const isButterfly = Math.random() < 0.7;
      if (isButterfly) {
        wildlife.push({
          type: 'butterfly',
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT * 0.6,
          vx: 10 + Math.random() * 20,
          vy: 0,
          wingPhase: Math.random() * Math.PI * 2,
          color: brightColors[Math.floor(Math.random() * brightColors.length)],
        });
      } else {
        wildlife.push({
          type: 'bird',
          x: -50 - Math.random() * 100,
          y: Math.random() * CANVAS_HEIGHT * 0.4,
          vx: 40 + Math.random() * 40,
          vy: 0,
          wingPhase: Math.random() * Math.PI * 2,
          color: '#5C4033',
        });
      }
    }

    // Init fog particles (ground level ~660)
    const fogParticles: Array<{x: number; y: number; vx: number; alpha: number}> = [];
    for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
      fogParticles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 650 + (Math.random() * 20 - 10),
        vx: 5 + Math.random() * 10,
        alpha: 0.15 + Math.random() * 0.15,
      });
    }

    // Init pollen particles
    const pollenParticles: Array<{x: number; y: number; vx: number; vy: number; size: number; alpha: number}> = [];
    for (let i = 0; i < POLLEN_COUNT; i++) {
      pollenParticles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: (Math.random() - 0.5) * 10,
        vy: -(5 + Math.random() * 10),
        size: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.4,
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
      puddles: [],
      countdown: MATCH_COUNTDOWN,
      stats,
      shockwaves: [],
      screenFlash: 0,
      wildlife,
      fogParticles,
      pollenParticles,
      shootingStars: [],
      scoreAnimations: [],
    };
  }

  private createWeatherParticle(randomY: boolean): WeatherParticle {
    const type = Math.random() < 0.6 ? 'leaf' : 'petal';
    return {
      x: Math.random() * CANVAS_WIDTH,
      y: randomY ? Math.random() * CANVAS_HEIGHT : -10,
      vx: 15 + Math.random() * 25,
      vy: 20 + Math.random() * 40,
      size: type === 'leaf' ? 4 + Math.random() * 5 : 3 + Math.random() * 3,
      type,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 3,
    };
  }

  start(): void {
    this.input.attach();
    this.renderer.renderBackground(this.arena);
    this.running = true;
    this.lastTime = performance.now();
    audio.play('music');
    audio.play('ambient');
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.input.detach();
    audio.stop('music');
    audio.stop('ambient');
  }

  getState(): MatchState { return this.state; }
  pause(): void { this.paused = true; audio.stop('music'); }
  resume(): void { this.paused = false; this.lastTime = performance.now(); audio.play('music'); }
  isPaused(): boolean { return this.paused; }

  private loop = (currentTime: number): void => {
    if (!this.running) return;

    if (this.paused) {
      this.lastTime = currentTime;
      this.renderer.renderFrame(this.state, this.arena, this.particles, this.settings.goreMode);
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

    // Slow-mo timer runs in real time
    if (this.state.slowMotion > 0) {
      this.state.slowMotion -= frameTime;
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
      this.newSplatsSinceRender = [];
    }

    this.renderer.renderFrame(this.state, this.arena, this.particles, this.settings.goreMode);
    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---- Hazard spawning ----

  private spawnSpring(): void {
    const floats = this.arena.platforms.filter(p => p.y < 650);
    if (floats.length === 0) return;
    const plat = floats[Math.floor(Math.random() * floats.length)];
    const pi = this.arena.platforms.indexOf(plat);
    this.state.springs.push({
      x: plat.x + 20 + Math.random() * (plat.width - 40),
      y: plat.y,
      platformIndex: pi,
      bounceTimer: 0,
      life: HAZARD_LIFETIME,
      growTimer: HAZARD_GROW_TIME,
    });
  }

  private spawnThorn(): void {
    const floats = this.arena.platforms.filter(p => p.y < 650);
    if (floats.length === 0) return;
    const plat = floats[Math.floor(Math.random() * floats.length)];
    const pi = this.arena.platforms.indexOf(plat);
    this.state.thorns.push({
      x: plat.x + 10 + Math.random() * (plat.width - 44),
      y: plat.y - 12,
      width: 28, height: 12,
      platformIndex: pi,
      life: HAZARD_LIFETIME,
      growTimer: HAZARD_GROW_TIME,
      hit: false,
    });
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
    const MIN_CARROT_DIST = 150; // minimum distance from existing carrots
    const candidates: Array<{ x: number; y: number; dist: number }> = [];
    for (const plat of this.arena.platforms) {
      // On-platform candidates
      for (let attempt = 0; attempt < 3; attempt++) {
        const cx = plat.x + 20 + Math.random() * (plat.width - 40);
        const cy = plat.y - CARROT_SIZE;
        let minDist = Infinity;
        for (const p of this.state.players) {
          if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
          const dx = cx - (p.x + p.width / 2);
          const dy = cy - (p.y + p.height / 2);
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
        // Also distance from existing carrots
        for (const c of this.state.carrots) {
          if (!c.active) continue;
          const dx = cx - c.x;
          const dy = cy - c.y;
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
        candidates.push({ x: cx, y: cy, dist: minDist });
      }
      // Mid-air candidates above platforms (reachable by jumping)
      for (let attempt = 0; attempt < 2; attempt++) {
        const cx = plat.x + 20 + Math.random() * (plat.width - 40);
        const cy = plat.y - 60 - Math.random() * 60;
        let minDist = Infinity;
        for (const p of this.state.players) {
          if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
          const dx = cx - (p.x + p.width / 2);
          const dy = cy - (p.y + p.height / 2);
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
        for (const c of this.state.carrots) {
          if (!c.active) continue;
          const dx = cx - c.x;
          const dy = cy - c.y;
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
        candidates.push({ x: cx, y: cy, dist: minDist });
      }
    }
    // Filter out candidates too close to existing carrots
    const filtered = candidates.filter(c => c.dist >= MIN_CARROT_DIST);
    const pool = filtered.length > 0 ? filtered : candidates;
    pool.sort((a, b) => b.dist - a.dist);
    if (pool.length > 0) {
      const spot = pool[0];
      this.state.carrots.push({ x: spot.x, y: spot.y, active: true, spawnTime: this.state.timeElapsed });
      this.spawnCarrotVFX(spot.x, spot.y);
    }
  }

  // ---- Updates ----

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
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
    this.state.dayPhase += dt / DAY_CYCLE_DURATION;
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
    this.state.springs = this.state.springs.filter(s => s.life > 0);

    for (const t of this.state.thorns) {
      t.life -= dt;
      if (t.growTimer > 0) t.growTimer -= dt;
    }
    this.state.thorns = this.state.thorns.filter(t => t.life > 0 && !t.hit);

    // Carrot timer
    this.state.carrotTimer -= dt;
    if (this.state.carrotTimer <= 0) {
      this.spawnCarrot();
      this.state.carrotTimer = CARROT_SPAWN_INTERVAL;
    }

    // Weather
    this.updateWeather(dt);

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
      // Breathing animation
      player.breathTimer += dt;
      // Decay damage flash and spring trail
      if (player.damageFlashTimer > 0) player.damageFlashTimer -= dt;
      if (player.springTrailTimer > 0) player.springTrailTimer -= dt;
    }

    // Input + physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      const input = this.input.getInput(player.id);
      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;

      applyInput(player, input, dt);
      if (!wasAirborne && player.state === 'airborne') {
        audio.play('jump');
        // Stretch on jump
        player.squashScale = STRETCH_ON_JUMP;
        player.squashTimer = 0.15;
      }

      applyGravity(player, dt);
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
              color: i % 3 === 0 ? '#6B4E1B' : '#8B6914',
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
        if (player.afterimages[i].alpha <= 0) player.afterimages.splice(i, 1);
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

      // Spring collision (only fully grown)
      for (const spring of this.state.springs) {
        if (spring.growTimer > 0) continue;
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

      // Carrot pickup
      for (const carrot of this.state.carrots) {
        if (!carrot.active) continue;
        if (aabbOverlap(player.x, player.y, player.width, player.height, carrot.x - CARROT_SIZE / 2, carrot.y, CARROT_SIZE, CARROT_SIZE)) {
          carrot.active = false;
          player.score += 1;
          player.fatTimer = FAT_DURATION;
          audio.play('select');
          audio.play(player.character.name.toLowerCase() as any);
          // Score animation for carrot pickup
          this.state.scoreAnimations.push({ playerId: player.id, value: player.score, timer: SCORE_ANIM_DURATION });
          // Stats: carrots eaten
          const ps = this.state.stats.perPlayer.get(player.id);
          if (ps) ps.carrotsEaten += 1;
        }
      }
    }

    this.state.carrots = this.state.carrots.filter(c => c.active);

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
        audio.play(attacker.character.name.toLowerCase() as any);
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
    if (killFeedEntries.length > 0) this.state.killFeed.push(...killFeedEntries);

    collidePlayersHorizontal(this.state.players);
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt);
    this.updateParticles(dt);

    // Decay shockwaves
    for (const sw of this.state.shockwaves) {
      const progress = 1 - sw.life / SHOCKWAVE_DURATION;
      sw.radius = sw.maxRadius * progress;
      sw.life -= dt;
    }
    this.state.shockwaves = this.state.shockwaves.filter(sw => sw.life > 0);

    // Decay screen flash
    if (this.state.screenFlash > 0) this.state.screenFlash -= dt;

    // Decay score animations
    for (const sa of this.state.scoreAnimations) {
      sa.timer -= dt;
    }
    this.state.scoreAnimations = this.state.scoreAnimations.filter(sa => sa.timer > 0);

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

    // Shooting stars (rare spawn during night phase > 0.4)
    if (this.state.dayPhase > 0.4 && Math.random() < 0.005) {
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
    this.state.shootingStars = this.state.shootingStars.filter(s => s.life > 0);

    // Crowd cheering: ramp up volume near end of match
    const leadScore = Math.max(...this.state.players.filter(p => p.active).map(p => p.score));
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
    } else {
      audio.setVolume('crowd', 0);
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
      let winner: CharacterSlot | null = null;
      let maxScore = -1;
      for (const player of this.state.players) {
        if (player.active && player.score > maxScore) { maxScore = player.score; winner = player.id; }
      }
      this.state.slowMotion = SLOW_MO_DURATION;
      this.endMatch(winner);
    }
  }

  private endMatch(winner: CharacterSlot | null): void {
    this.state.matchOver = true;
    this.state.winner = winner;
    this.state.screenFlash = SCREEN_FLASH_DURATION;
    audio.stop('music');
    audio.play('victory');
    this.onMatchEnd(winner, this.state);
  }
}
