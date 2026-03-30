import type {
  MatchState, MatchSettings, Arena, CharacterSlot, Player, Particle,
  WeatherParticle, MatchStats, PlayerStats,
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
    }));

    // Init weather particles
    const weather: WeatherParticle[] = [];
    for (let i = 0; i < WEATHER_PARTICLE_COUNT; i++) {
      weather.push(this.createWeatherParticle(true));
    }

    // Generate puddles on the ground platform (y >= 650 assumed ground)
    const groundPlatforms = arena.platforms.filter(p => p.y >= 650);
    const puddles: Array<{x: number; width: number}> = [];
    const puddleCount = 4 + Math.floor(Math.random() * 2); // 4-5
    for (let i = 0; i < puddleCount; i++) {
      const gp = groundPlatforms.length > 0
        ? groundPlatforms[Math.floor(Math.random() * groundPlatforms.length)]
        : arena.platforms[0];
      puddles.push({
        x: gp.x + 20 + Math.random() * (gp.width - 80),
        width: 30 + Math.random() * 30,
      });
    }

    // Init stats
    const statsMap = new Map<CharacterSlot, PlayerStats>();
    for (const slot of activePlayers) {
      statsMap.set(slot, { bestStreak: 0, timeAirborne: 0, distanceTraveled: 0, carrotsEaten: 0 });
    }
    const stats: MatchStats = { perPlayer: statsMap };

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
      puddles,
      countdown: MATCH_COUNTDOWN,
      stats,
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
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.input.detach();
    audio.stop('music');
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
        candidates.push({ x: cx, y: cy, dist: minDist });
      }
      // Mid-air candidates above platforms (reachable by jumping)
      for (let attempt = 0; attempt < 2; attempt++) {
        const cx = plat.x + 20 + Math.random() * (plat.width - 40);
        const cy = plat.y - 60 - Math.random() * 60; // 60 to 120 px above platform
        let minDist = Infinity;
        for (const p of this.state.players) {
          if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
          const dx = cx - (p.x + p.width / 2);
          const dy = cy - (p.y + p.height / 2);
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
        candidates.push({ x: cx, y: cy, dist: minDist });
      }
    }
    candidates.sort((a, b) => b.dist - a.dist);
    if (candidates.length > 0) {
      const spot = candidates[0];
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
      }

      // Squash on landing
      if (justLanded) {
        player.squashScale = SQUASH_ON_LAND;
        player.squashTimer = 0.15;

        // Puddle splash on landing on ground platform
        const playerCx = player.x + player.width / 2;
        const playerBottom = player.y + player.height;
        if (playerBottom >= 650) {
          for (const puddle of this.state.puddles) {
            if (playerCx >= puddle.x && playerCx <= puddle.x + puddle.width) {
              audio.play('splash');
              // Spawn blue-ish splash particles
              for (let i = 0; i < 10; i++) {
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
                const speed = 40 + Math.random() * 100;
                const life = 0.3 + Math.random() * 0.3;
                this.particles.push({ x: playerCx + (Math.random() - 0.5) * 20, y: playerBottom - 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, life, maxLife: life, size: 2 + Math.random() * 3, color: '#4488CC' });
              }
              break;
            }
          }
        }

        // Platform crumble when landing hard
        if (prevVy > 300) {
          const playerCxCrumble = player.x + player.width / 2;
          const playerBottomCrumble = player.y + player.height;
          for (let i = 0; i < 6; i++) {
            const life = 0.2 + Math.random() * 0.3;
            this.particles.push({
              x: playerCxCrumble + (Math.random() - 0.5) * player.width,
              y: playerBottomCrumble,
              vx: (Math.random() - 0.5) * 60,
              vy: Math.random() * 20 + 10,
              life, maxLife: life,
              size: 1.5 + Math.random() * 2,
              color: '#8B6914',
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
      }
      const victim = this.state.players.find(p => p.id === entry.victim);
      if (victim) {
        this.spawnKillSplatter(victim);
        // Stats: reset kill streak on death
        victim.killStreak = 0;
      }
    }
    if (killFeedEntries.length > 0) this.state.killFeed.push(...killFeedEntries);

    collidePlayersHorizontal(this.state.players);
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt);
    this.updateParticles(dt);

    // Crowd cheering: ramp up volume near end of match
    const leadScore = Math.max(...this.state.players.filter(p => p.active).map(p => p.score));
    if (leadScore >= this.settings.killLimit - 1) {
      audio.setVolume('crowd', 0.3);
    } else if (leadScore >= this.settings.killLimit - 3) {
      audio.setVolume('crowd', 0.15);
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
    audio.stop('music');
    audio.play('victory');
    this.onMatchEnd(winner, this.state);
  }
}
