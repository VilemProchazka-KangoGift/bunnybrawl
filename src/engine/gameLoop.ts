import type {
  MatchState, MatchSettings, Arena, CharacterSlot, Player, Particle,
  SpringMushroom, Thorn,
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
  THORN_SLOW_DURATION,
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
      vx: 0,
      vy: 0,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      state: 'idle' as const,
      facing: 'right' as const,
      splatTimer: 0,
      respawnTimer: 0,
      invincibleTimer: 0,
      score: 0,
      active: true,
      animFrame: 0,
      animTimer: 0,
      fastFalling: false,
      fatTimer: 0,
      slowTimer: 0,
    }));

    // Place spring mushrooms and thorns on platforms
    const springs = this.createSprings(arena);
    const thorns = this.createThorns(arena);

    this.state = {
      players,
      splatMarks: [],
      killFeed: [],
      timeElapsed: 0,
      matchOver: false,
      winner: null,
      carrots: [],
      carrotTimer: CARROT_SPAWN_INTERVAL,
      springs,
      thorns,
    };
  }

  private createSprings(arena: Arena): SpringMushroom[] {
    // Place springs on a few platforms (not ground)
    const floats = arena.platforms
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.y < 650);

    const springs: SpringMushroom[] = [];
    // Put springs on 2-3 platforms
    const indices = [1, 4, 7].filter(i => i < floats.length);
    for (const idx of indices) {
      const { p, i } = floats[idx];
      springs.push({
        x: p.x + p.width / 2,
        y: p.y,
        platformIndex: i,
        bounceTimer: 0,
      });
    }
    return springs;
  }

  private createThorns(arena: Arena): Thorn[] {
    // Place thorns on a couple of platforms
    const floats = arena.platforms
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.y < 650);

    const thorns: Thorn[] = [];
    const indices = [2, 5].filter(i => i < floats.length);
    for (const idx of indices) {
      const { p, i } = floats[idx];
      thorns.push({
        x: p.x + p.width * 0.7,
        y: p.y - 10,
        width: 24,
        height: 10,
        platformIndex: i,
      });
    }
    return thorns;
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
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.input.detach();
    audio.stop('music');
  }

  getState(): MatchState {
    return this.state;
  }

  pause(): void {
    this.paused = true;
    audio.stop('music');
  }

  resume(): void {
    this.paused = false;
    this.lastTime = performance.now();
    audio.play('music');
  }

  isPaused(): boolean {
    return this.paused;
  }

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

    if (frameTime > MAX_FRAME_TIME) {
      frameTime = MAX_FRAME_TIME;
    }

    this.accumulator += frameTime;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }

    // Render new splat marks on background
    if (this.newSplatsSinceRender.length > 0) {
      const newSplats = this.newSplatsSinceRender.map(i => this.state.splatMarks[i]);
      this.renderer.renderSplatMarks(newSplats);
      this.newSplatsSinceRender = [];
    }

    this.renderer.renderFrame(this.state, this.arena, this.particles, this.settings.goreMode);

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---- Particle spawners ----

  private spawnDustParticles(player: Player, landVy: number): void {
    const cx = player.x + player.width / 2;
    const groundY = player.y + player.height;
    const intensity = Math.min(landVy / 300, 3);
    const count = Math.floor(8 + intensity * 6);
    for (let i = 0; i < count; i++) {
      const life = 0.3 + Math.random() * 0.4 * intensity;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * player.width * 1.5,
        y: groundY - Math.random() * 4,
        vx: (Math.random() - 0.5) * 150 * intensity,
        vy: -Math.random() * 80 * intensity - 20,
        life, maxLife: life,
        size: 2 + Math.random() * 4 * intensity,
        color: '#C8B896',
      });
    }
  }

  private spawnRunDust(player: Player): void {
    const groundY = player.y + player.height;
    const behindX = player.facing === 'right' ? player.x - 2 : player.x + player.width + 2;
    const life = 0.15 + Math.random() * 0.15;
    this.particles.push({
      x: behindX + (Math.random() - 0.5) * 6,
      y: groundY - Math.random() * 3,
      vx: (player.facing === 'right' ? -1 : 1) * (20 + Math.random() * 30),
      vy: -Math.random() * 20 - 5,
      life, maxLife: life,
      size: 1.5 + Math.random() * 2,
      color: '#C8B896',
    });
  }

  private spawnImpactDust(player: Player, direction: 'up' | 'left' | 'right'): void {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      let px: number, py: number, pvx: number, pvy: number;
      if (direction === 'up') {
        px = cx + (Math.random() - 0.5) * player.width;
        py = player.y + 2;
        pvx = (Math.random() - 0.5) * 60;
        pvy = Math.random() * 40 + 10;
      } else {
        const side = direction === 'right' ? player.x + player.width : player.x;
        px = side;
        py = cy + (Math.random() - 0.5) * player.height * 0.6;
        pvx = (direction === 'right' ? -1 : 1) * (20 + Math.random() * 40);
        pvy = -Math.random() * 30;
      }
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
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life, maxLife: life,
        size: 3 + Math.random() * 5,
        color,
      });
    }
  }

  // ---- Carrot spawning ----

  private spawnCarrot(): void {
    // Pick a random platform top that's far from all players
    const candidates: Array<{ x: number; y: number; dist: number }> = [];
    for (const plat of this.arena.platforms) {
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
    }
    // Pick the spot farthest from any player
    candidates.sort((a, b) => b.dist - a.dist);
    if (candidates.length > 0) {
      const spot = candidates[0];
      this.state.carrots.push({ x: spot.x, y: spot.y, active: true });
    }
  }

  // ---- Particle update ----

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
    }
  }

  // ---- Main update ----

  private fixedUpdate(dt: number): void {
    if (this.state.matchOver) return;

    this.state.timeElapsed += dt;

    // Carrot spawn timer
    this.state.carrotTimer -= dt;
    if (this.state.carrotTimer <= 0) {
      this.spawnCarrot();
      this.state.carrotTimer = CARROT_SPAWN_INTERVAL;
    }

    // Update spring bounce animations
    for (const spring of this.state.springs) {
      if (spring.bounceTimer > 0) spring.bounceTimer -= dt;
    }

    // Update animation timers
    for (const player of this.state.players) {
      if (!player.active) continue;
      player.animTimer += dt;
      if (player.animTimer >= ANIM_FRAME_DURATION) {
        player.animTimer -= ANIM_FRAME_DURATION;
        player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
      }

      // Fat/slow timers
      if (player.fatTimer > 0) player.fatTimer -= dt;
      if (player.slowTimer > 0) player.slowTimer -= dt;
    }

    // Process input and physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      const input = this.input.getInput(player.id);

      const wasAirborne = player.state === 'airborne';
      const prevVy = player.vy;
      const prevVx = player.vx;

      applyInput(player, input, dt);

      if (!wasAirborne && player.state === 'airborne') {
        audio.play('jump');
      }

      applyGravity(player, dt);
      movePlayer(player, dt);
      collidePlatforms(player, this.arena.platforms);
      applyArenaConstraints(player, this.arena);
      updatePlayerState(player);

      // Dust on hard landing
      if (wasAirborne && player.state !== 'airborne' && prevVy >= DUST_LAND_VY_THRESHOLD) {
        this.spawnDustParticles(player, prevVy);
      }
      // Running dust
      if (player.state === 'run' && Math.abs(player.vx) > 150 && Math.random() < 0.3) {
        this.spawnRunDust(player);
      }
      // Head bump dust
      if (wasAirborne && prevVy < -50 && player.vy === 0 && player.state === 'airborne') {
        this.spawnImpactDust(player, 'up');
      }
      // Wall dust
      if (Math.abs(prevVx) > 100 && player.vx === 0 && prevVx !== 0) {
        this.spawnImpactDust(player, prevVx > 0 ? 'right' : 'left');
      }

      // Spring mushroom collision
      for (const spring of this.state.springs) {
        if (aabbOverlap(
          player.x, player.y, player.width, player.height,
          spring.x - SPRING_SIZE / 2, spring.y - SPRING_SIZE, SPRING_SIZE, SPRING_SIZE
        ) && player.vy >= 0) {
          player.vy = SPRING_BOUNCE;
          player.state = 'airborne';
          spring.bounceTimer = 0.3;
          audio.play('jump');
        }
      }

      // Thorn collision
      for (const thorn of this.state.thorns) {
        if (player.slowTimer <= 0 && player.invincibleTimer <= 0 && aabbOverlap(
          player.x, player.y, player.width, player.height,
          thorn.x, thorn.y, thorn.width, thorn.height
        )) {
          player.slowTimer = THORN_SLOW_DURATION;
        }
      }

      // Carrot pickup
      for (const carrot of this.state.carrots) {
        if (!carrot.active) continue;
        if (aabbOverlap(
          player.x, player.y, player.width, player.height,
          carrot.x - CARROT_SIZE / 2, carrot.y, CARROT_SIZE, CARROT_SIZE
        )) {
          carrot.active = false;
          player.score += 1;
          player.fatTimer = FAT_DURATION;
          audio.play('select');
        }
      }
    }

    // Clean up collected carrots
    this.state.carrots = this.state.carrots.filter(c => c.active);

    // Check stomps BEFORE pushing players apart
    const { splatMarks, killFeedEntries } = checkStomps(
      this.state.players,
      this.arena.spawnPoints,
      this.state.timeElapsed,
    );

    if (splatMarks.length > 0) {
      const startIdx = this.state.splatMarks.length;
      this.state.splatMarks.push(...splatMarks);
      for (let i = 0; i < splatMarks.length; i++) {
        this.newSplatsSinceRender.push(startIdx + i);
      }
      audio.play('stomp');
    }

    // Spawn kill splatter particles for each kill
    for (const entry of killFeedEntries) {
      const victim = this.state.players.find(p => p.id === entry.victim);
      if (victim) this.spawnKillSplatter(victim);
    }

    if (killFeedEntries.length > 0) {
      this.state.killFeed.push(...killFeedEntries);
    }

    // Player-player collision
    collidePlayersHorizontal(this.state.players);

    // Update splat/respawn timers
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt);

    // Update particles
    this.updateParticles(dt);

    // Check match end
    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    for (const player of this.state.players) {
      if (player.active && player.score >= this.settings.killLimit) {
        this.endMatch(player.id);
        return;
      }
    }

    if (this.settings.timeLimit > 0 && this.state.timeElapsed >= this.settings.timeLimit) {
      let winner: CharacterSlot | null = null;
      let maxScore = -1;
      for (const player of this.state.players) {
        if (player.active && player.score > maxScore) {
          maxScore = player.score;
          winner = player.id;
        }
      }
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
