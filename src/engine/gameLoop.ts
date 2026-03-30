import type { MatchState, MatchSettings, Arena, CharacterSlot, Player } from './types';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState, applyArenaConstraints } from './physics';
import { checkStomps, updateSplatTimers } from './stomp';
import { audio } from './audio';
import {
  FIXED_TIMESTEP, MAX_FRAME_TIME,
  PLAYER_WIDTH, PLAYER_HEIGHT, ANIM_FRAME_DURATION, RUN_FRAMES,
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
  private newSplatsSinceRender: number[] = [];

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

    // Initialize players
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
    }));

    this.state = {
      players,
      splatMarks: [],
      killFeed: [],
      timeElapsed: 0,
      matchOver: false,
      winner: null,
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
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.input.detach();
    audio.stop('music');
  }

  getState(): MatchState {
    return this.state;
  }

  private loop = (currentTime: number): void => {
    if (!this.running) return;

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Prevent spiral of death
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

    this.renderer.renderFrame(this.state, this.arena);

    this.rafId = requestAnimationFrame(this.loop);
  };

  private fixedUpdate(dt: number): void {
    if (this.state.matchOver) return;

    this.state.timeElapsed += dt;

    // Update animation timers
    for (const player of this.state.players) {
      if (!player.active) continue;
      player.animTimer += dt;
      if (player.animTimer >= ANIM_FRAME_DURATION) {
        player.animTimer -= ANIM_FRAME_DURATION;
        player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
      }
    }

    // Process input and physics
    for (const player of this.state.players) {
      if (!player.active) continue;
      const input = this.input.getInput(player.id);

      const wasOnGround = player.state !== 'airborne';
      applyInput(player, input, dt);
      if (!wasOnGround && player.state !== 'airborne') {
        // Landed
      }
      if (wasOnGround && player.state === 'airborne') {
        audio.play('jump');
      }

      applyGravity(player, dt);
      movePlayer(player, dt);
      collidePlatforms(player, this.arena.platforms);
      applyArenaConstraints(player, this.arena);
      updatePlayerState(player);
    }

    // Check stomps
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

    if (killFeedEntries.length > 0) {
      this.state.killFeed.push(...killFeedEntries);
    }

    // Update splat/respawn timers
    updateSplatTimers(this.state.players, this.arena.spawnPoints, dt);

    // Check match end conditions
    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    // Kill limit
    for (const player of this.state.players) {
      if (player.active && player.score >= this.settings.killLimit) {
        this.endMatch(player.id);
        return;
      }
    }

    // Time limit
    if (this.settings.timeLimit > 0 && this.state.timeElapsed >= this.settings.timeLimit) {
      // Highest score wins
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
