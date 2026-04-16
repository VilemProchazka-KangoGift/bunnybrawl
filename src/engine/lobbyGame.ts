/**
 * LobbyGame — extracted lobby simulation + rendering from CharacterSelect.tsx.
 *
 * Owns the lobby player state, NPC wandering, bot AI, physics, stomp/swap,
 * ready-zone countdown, and all canvas drawing. CharacterSelect becomes a thin
 * React wrapper that feeds keyboard/touch input and reads query methods.
 */

import type { Arena, CharacterDef, CharacterSlot, Player, PlayerSlot, InputState } from './types';
import { ALL_BOT_SLOTS, isBotSlot } from './types';
import type { ThemeConfig } from './themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED, STOMP_VY_THRESHOLD } from './constants';
import { KEY_BINDINGS } from './input';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState } from './physics';
import { getAllCharacters, getCharacterEmoji, getCharacterDisplayName } from './characters';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
} from './themes/drawPrimitives';
import { drawCharacterCore } from './rendering/players';
import { audio } from './audio';
import i18n from '../i18n';
import { initWildlife, updateAndDrawWildlife, drawDayNightCycle } from './canvasAnimations';
import type { SimpleWildlife } from './canvasAnimations';

// ---- Constants ----

const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
export const READY_ZONE_X = CANVAS_WIDTH * 0.72;
const LOBBY_DAY_CYCLE = 90;

const COUNTDOWN_SECONDS = 5;
const GROUND_Y = 560;
const LOBBY_GRAVITY = 600;
const LOBBY_SPEED = 200;
const LOBBY_JUMP = -400;

// Wall obstacle at ~2/3 of screen — forces players to jump to reach the ready zone
const WALL_X = CANVAS_WIDTH * 0.58;
const WALL_WIDTH = 24;
const WALL_HEIGHT = 120;
const WALL_Y = GROUND_Y - WALL_HEIGHT;

// ---- Engine-compat helpers ----

// Synthetic arena used by engine physics (collidePlatforms needs a Platform[]).
// Ground spans full width; wall obstacle matches the visual WALL_X/WALL_Y/WALL_WIDTH/WALL_HEIGHT.
const LOBBY_ARENA: Arena = {
  id: 'lobby',
  name: 'Lobby',
  themeId: 'lobby',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y },
    { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT },
  ],
  spawnPoints: [],
  allowFallOff: false,
};

// Minimal theme stub for drawPlayer — it only reads theme.bubbleHelmet.
// Other fields set to satisfy the type but never consulted in the lobby render path.
export const LOBBY_THEME = { bubbleHelmet: false } as unknown as ThemeConfig;

function makeLobbyPlayer(slot: PlayerSlot, char: CharacterDef, x: number, y: number): Player {
  return {
    id: slot,
    character: { ...char, slot },
    x, y, vx: 0, vy: 0,
    width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
    state: 'idle', facing: 'right',
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true,
    animFrame: 0, animTimer: 0, fastFalling: false,
    fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1,
    afterimages: [], idleAnimTimer: 0,
    expression: 'normal', killStreak: 0,
    breathTimer: 0, springTrailTimer: 0,
    damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
  };
}

function clampLobbyBounds(p: Player): void {
  // Horizontal clamp (NOT wrap — we don't want players teleporting across the canvas)
  if (p.x < 0) {
    if (p.vx < 0) p.sideSquash = 0.75;
    p.x = 0;
    p.vx = 0;
  } else if (p.x + p.width > CANVAS_WIDTH) {
    if (p.vx > 0) p.sideSquash = 0.75;
    p.x = CANVAS_WIDTH - p.width;
    p.vx = 0;
  }
  // Vertical ceiling
  if (p.y < 0) {
    p.y = 0;
    if (p.vy < 0) p.vy = 0;
  }
}

// ---- Public types ----

const FLOWER_COLORS = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
const FLOWER_POSITIONS = [100, 190, 260, 340, 430, 520, 580, 670];

// Cached gradients (static coordinates, created once per canvas context)
let _cachedCtx: CanvasRenderingContext2D | null = null;
let _skyGrad: CanvasGradient | null = null;
let _groundGrad: CanvasGradient | null = null;
let _wallGrad: CanvasGradient | null = null;
let _zoneGrad: CanvasGradient | null = null;

function getLobbyGradients(ctx: CanvasRenderingContext2D) {
  if (_cachedCtx !== ctx) {
    _cachedCtx = ctx;
    _skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    _skyGrad.addColorStop(0, '#4A90D9');
    _skyGrad.addColorStop(0.6, '#87CEEB');
    _skyGrad.addColorStop(1, '#B0E0E6');
    _groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
    _groundGrad.addColorStop(0, '#4A7C3F');
    _groundGrad.addColorStop(0.3, '#3D6B35');
    _groundGrad.addColorStop(1, '#2D5025');
    _wallGrad = ctx.createLinearGradient(WALL_X, WALL_Y, WALL_X + WALL_WIDTH, WALL_Y + WALL_HEIGHT);
    _wallGrad.addColorStop(0, '#8B7355');
    _wallGrad.addColorStop(0.5, '#A0896B');
    _wallGrad.addColorStop(1, '#7A6548');
    _zoneGrad = ctx.createLinearGradient(READY_ZONE_X, 0, CANVAS_WIDTH, 0);
    _zoneGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    _zoneGrad.addColorStop(0.15, 'rgba(255, 215, 0, 0.05)');
    _zoneGrad.addColorStop(1, 'rgba(255, 215, 0, 0.12)');
  }
  return { sky: _skyGrad!, ground: _groundGrad!, wall: _wallGrad!, zone: _zoneGrad! };
}

export interface LobbyGameConfig {
  botCount: number;
  isMobile: boolean;
}

// ---- Shuffle helper ----

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Bot AI parameters ----

const BOT_SPEED_VARIANCE = [0.85, 1.0, 0.9, 1.1, 0.95];
const BOT_PAUSE_CHANCE = [0.003, 0.002, 0.004, 0.001, 0.003];

// ---- LobbyGame class ----

export class LobbyGame {
  players: Player[] = [];
  bots: Player[] = [];
  extraChars: Player[] = [];

  countdown = -1;
  countdownStarted = false;

  private readySoundPlayed = new Set<PlayerSlot>();
  private wildlife: SimpleWildlife[] | null = null;
  private isMobile: boolean;

  // Pre-allocated combined arrays (rebuilt in update, avoid per-frame spread)
  private _allLobby: Player[] = [];
  private _participants: Player[] = [];  // players + bots (no extras)
  private _extrasSet = new Set<Player>();

  // Ready-zone counts (computed in updateReadyZone, read in drawLobby)
  private _inZoneCount = 0;
  private _humanInZoneCount = 0;
  private _botInZoneCount = 0;

  constructor(config: LobbyGameConfig) {
    this.isMobile = config.isMobile;
    const botCount = config.botCount;
    const botSlots = ALL_BOT_SLOTS.slice(0, botCount);

    // On mobile, only spawn P1 (touch player)
    const activeSlots = config.isMobile ? (['P1'] as CharacterSlot[]) : SLOTS;

    // Randomly assign characters to players
    const shuffled = shuffle([...getAllCharacters()]);
    const assigned = shuffled.slice(0, activeSlots.length);
    const botAssigned = shuffled.slice(activeSlots.length, activeSlots.length + botCount);
    const extras = shuffled.slice(activeSlots.length + botCount);

    this.players = activeSlots.map((slot, i) =>
      makeLobbyPlayer(slot, assigned[i], 40 + i * 90, GROUND_Y - PLAYER_HEIGHT)
    );

    this.bots = botSlots.map((slot, i) =>
      makeLobbyPlayer(slot, botAssigned[i], 40 + (SLOTS.length + i) * 60, GROUND_Y - PLAYER_HEIGHT)
    );

    this.extraChars = extras.map((ch) => {
      const p = makeLobbyPlayer('P1' as CharacterSlot, ch, 40 + Math.random() * (WALL_X - 80), GROUND_Y - PLAYER_HEIGHT);
      p.vx = (Math.random() - 0.5) * 60;
      p.facing = Math.random() > 0.5 ? 'right' : 'left';
      return p;
    });
  }

  // ---- Update (called every frame) ----

  /**
   * Advance the lobby simulation by `dt` seconds.
   * @param dt frame delta in seconds (clamped by caller)
   * @param keys currently held keyboard keys
   * @param touchInput optional P1 touch input (mobile)
   */
  update(dt: number, keys: Set<string>, touchInput?: InputState): void {
    // Rebuild cached combined arrays (avoids per-frame spread allocations)
    this._allLobby.length = 0;
    for (const p of this.players) this._allLobby.push(p);
    for (const b of this.bots) this._allLobby.push(b);
    for (const e of this.extraChars) this._allLobby.push(e);

    this._participants.length = 0;
    for (const p of this.players) this._participants.push(p);
    for (const b of this.bots) this._participants.push(b);

    this._extrasSet.clear();
    for (const e of this.extraChars) this._extrasSet.add(e);

    const step = (p: Player, input: InputState): void => {
      if (p.splatTimer > 0) { p.splatTimer = Math.max(0, p.splatTimer - dt); return; }

      applyInput(p, input, dt, LOBBY_SPEED, 1500 /* friction */, LOBBY_JUMP);
      applyGravity(p, dt, LOBBY_GRAVITY, 800);
      movePlayer(p, dt);
      collidePlatforms(p, LOBBY_ARENA.platforms);
      clampLobbyBounds(p);
      updatePlayerState(p);

      // Squash decay (engine decays these inside GameLoop with fround — lobby doesn't need determinism)
      if (p.squashScale !== 1) {
        p.squashScale += (1 - p.squashScale) * SQUASH_DECAY_SPEED * dt;
        if (Math.abs(p.squashScale - 1) < 0.02) p.squashScale = 1;
      }
      if (p.sideSquash !== 1) {
        p.sideSquash += (1 - p.sideSquash) * SQUASH_DECAY_SPEED * dt;
        if (Math.abs(p.sideSquash - 1) < 0.02) p.sideSquash = 1;
      }

      // Anim frame tick
      if (Math.abs(p.vx) > 10) {
        p.animTimer += dt;
        if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
      }

      // Lobby-specific: crouch-on-ground squat
      if (input.down && p.state !== 'airborne') p.squashScale = SQUASH_ON_CROUCH;
    };

    // --- Player-controlled characters ---
    for (const p of this.players) {
      let input: InputState;
      if (touchInput && p.id === 'P1') {
        input = touchInput;
      } else {
        const bindings = KEY_BINDINGS[p.id as CharacterSlot];
        input = {
          left: keys.has(bindings.left),
          right: keys.has(bindings.right),
          jump: keys.has(bindings.jump),
          down: keys.has(bindings.down),
        };
      }
      step(p, input);
    }

    // --- NPC extras — simple wandering AI ---
    for (const npc of this.extraChars) {
      step(npc, wanderInput());
    }

    // --- Bot players — directed AI walking toward ready zone ---
    for (const bot of this.bots) {
      step(bot, botLobbyInput(bot));
    }

    // --- Stomp detection ---
    this.processStomps(this._allLobby);

    // --- Ready zone check ---
    this.updateReadyZone(dt);
  }

  // ---- Stomp / swap logic ----

  private processStomps(allLobby: Player[]): void {
    for (const attacker of this._participants) {
      if (attacker.splatTimer > 0) continue;
      if (attacker.vy < STOMP_VY_THRESHOLD) continue;
      const attackerIsBot = isBotSlot(attacker.id);

      for (const victim of allLobby) {
        if (victim === attacker) continue;
        if (victim.splatTimer > 0) continue;
        if (attackerIsBot && !this._extrasSet.has(victim)) continue;

        if (
          attacker.x + PLAYER_WIDTH > victim.x &&
          attacker.x < victim.x + PLAYER_WIDTH &&
          attacker.y + PLAYER_HEIGHT > victim.y &&
          attacker.y + PLAYER_HEIGHT < victim.y + PLAYER_HEIGHT * 0.5 + 4
        ) {
          const tempChar = attacker.character;
          attacker.character = { ...victim.character, slot: attacker.id };
          victim.character = { ...tempChar, slot: victim.id };
          victim.splatTimer = 0.8;
          attacker.vy = -300;
          audio.play('stomp');

          const isNPC = this._extrasSet.has(victim);
          if (isNPC) {
            let bestX = 40;
            let bestDist = 0;
            for (let attempt = 0; attempt < 10; attempt++) {
              const tryX = 20 + Math.random() * (WALL_X - 80);
              const dx = Math.abs(tryX - attacker.x);
              if (dx > bestDist) { bestDist = dx; bestX = tryX; }
            }
            if (bestDist < 200 && WALL_X > 200) bestX = attacker.x > WALL_X / 2 ? 40 : WALL_X - 60;
            victim.x = bestX;
            victim.y = GROUND_Y - PLAYER_HEIGHT;
            victim.vx = 0;
            victim.vy = 0;
            victim.state = 'idle';
          }
        }
      }
    }
  }

  // ---- Ready zone + countdown ----

  private updateReadyZone(dt: number): void {
    // Count zone membership with a single pass (no filter allocations)
    this._inZoneCount = 0;
    this._humanInZoneCount = 0;
    this._botInZoneCount = 0;
    for (const p of this._participants) {
      if (p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0) {
        this._inZoneCount++;
        if (isBotSlot(p.id)) this._botInZoneCount++;
        else this._humanInZoneCount++;

        // Play animal sound when player/bot enters ready zone for the first time
        if (!this.readySoundPlayed.has(p.id)) {
          this.readySoundPlayed.add(p.id);
          audio.playAnimal(p.character.name);
        }
      } else {
        // Remove players who left the zone so they can trigger again if they re-enter
        this.readySoundPlayed.delete(p.id);
      }
    }

    // Need at least 1 human + total 2 participants to start countdown
    if (this._inZoneCount >= 2 && this._humanInZoneCount >= 1 && !this.countdownStarted) {
      this.countdownStarted = true;
      this.countdown = COUNTDOWN_SECONDS;
    }
    if (this._inZoneCount < 2 || this._humanInZoneCount < 1) {
      this.countdownStarted = false;
      this.countdown = -1;
    }

    if (this.countdownStarted) {
      this.countdown -= dt;
    }
  }

  // ---- Query methods ----

  /** All participants (human + bot) currently in the ready zone and not splatted. */
  getReadyPlayers(): Player[] {
    // Not a hot path — called once at countdown end. Iterate source arrays
    // directly so this works even before the first update() call.
    const result: Player[] = [];
    for (const p of this.players) {
      if (p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0) result.push(p);
    }
    for (const b of this.bots) {
      if (b.x + PLAYER_WIDTH > READY_ZONE_X && b.splatTimer <= 0) result.push(b);
    }
    return result;
  }

  /** True when the countdown has elapsed. */
  isCountdownComplete(): boolean {
    return this.countdownStarted && this.countdown <= 0;
  }

  // ---- Rendering ----

  render(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.wildlife) {
      this.wildlife = initWildlife(6, GROUND_Y, 0.67);
    }
    drawLobby(
      ctx, this.players, this.bots, this.extraChars,
      this.countdown, this.countdownStarted, dt, this.wildlife, this.isMobile,
      this._inZoneCount, this._humanInZoneCount, this._botInZoneCount,
    );
  }

  // ---- Cleanup ----

  destroy(): void {
    this.players = [];
    this.bots = [];
    this.extraChars = [];
    this.wildlife = null;
    this.readySoundPlayed.clear();
  }
}

// ---- Bot Lobby AI ----

function botLobbyInput(bot: Player): InputState {
  const slotIdx = parseInt(bot.id[1]) - 1;
  const speedMult = BOT_SPEED_VARIANCE[slotIdx % BOT_SPEED_VARIANCE.length];
  const pauseChance = BOT_PAUSE_CHANCE[slotIdx % BOT_PAUSE_CHANCE.length];

  const zoneWidth = CANVAS_WIDTH - READY_ZONE_X - 20;
  const botTargetX = READY_ZONE_X + 30 + (slotIdx / 5) * zoneWidth;

  // Past the zone entrance: fine-tune to target x
  if (bot.x + PLAYER_WIDTH > READY_ZONE_X + 20) {
    const dxToTarget = botTargetX - bot.x;
    if (Math.abs(dxToTarget) > 30) {
      return { left: dxToTarget < 0, right: dxToTarget > 0, jump: false, down: false };
    }
    return { left: false, right: false, jump: false, down: false };
  }

  // Random pause
  if (Math.random() < pauseChance) {
    return { left: false, right: false, jump: false, down: false };
  }

  // speedMult is currently unused in InputState form (can't vary speed via booleans).
  // Task 4 will wire bots through applyInput which caps at LOBBY_SPEED; speedMult is dropped.
  void speedMult;

  let jump = false;
  // Jump near wall
  const onGround = bot.state !== 'airborne';
  if (onGround && bot.x + PLAYER_WIDTH > WALL_X - 60 && bot.x < WALL_X + WALL_WIDTH + 20) {
    jump = true;
  }
  if (onGround && Math.abs(bot.x - (WALL_X - PLAYER_WIDTH)) < 4) {
    jump = true;
  }

  return { left: false, right: true, jump, down: false };
}

function wanderInput(): InputState {
  const left = Math.random() < 0.005;
  const right = Math.random() < 0.005;
  const jump = Math.random() < 0.005;
  return { left: left && !right, right: right && !left, jump, down: false };
}

// ---- Drawing ----

function drawLobby(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  bots: Player[],
  extras: Player[],
  countdown: number,
  countdownActive: boolean,
  dt: number,
  wildlife: SimpleWildlife[] | null,
  isMobile: boolean,
  inZoneCount: number,
  humanInZoneCount: number,
  botInZoneCount: number,
): void {
  const grads = getLobbyGradients(ctx);
  ctx.fillStyle = grads.sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // ---- Distant forest treeline ----
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#3A6A3A';
  ctx.beginPath();
  ctx.moveTo(-10, GROUND_Y + 10);
  const treeline = [
    0, -70, 40, -50, 80, -75, 120, -45, 160, -65, 200, -55,
    250, -80, 300, -50, 350, -70, 400, -45, 450, -60, 500, -75,
    550, -50, 600, -80, 650, -55, 700, -65, 750, -50, 800, -70,
    850, -55, 900, -75, 950, -45, 1000, -65, 1050, -55, 1100, -80,
    1150, -50, 1200, -70, 1250, -55, 1300, -65,
  ];
  for (let i = 0; i < treeline.length; i += 2) {
    ctx.lineTo(treeline[i], GROUND_Y + treeline[i + 1]);
  }
  ctx.lineTo(1300, GROUND_Y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ---- Clouds (animated, using drawCloud) ----
  const now = performance.now() / 1000;
  const cloudDefs = [
    { speed: 8, offset: 0, y: 80, size: 70 },
    { speed: 5, offset: 400, y: 50, size: 85 },
    { speed: 11, offset: 800, y: 110, size: 55 },
    { speed: 7, offset: 200, y: 35, size: 65 },
  ];
  for (const c of cloudDefs) {
    const cx = (now * c.speed + c.offset) % (CANVAS_WIDTH + 300) - 150;
    drawCloud(ctx, cx, c.y, c.size);
  }

  // ---- Background hills ----
  const hillDefs: [number, number, number, number][] = [[0, 300, 120, 620], [250, 400, 100, 630], [600, 350, 130, 620], [900, 400, 100, 635]];
  for (const [hx, hw, hh, hby] of hillDefs) {
    ctx.fillStyle = '#5C9E4C';
    ctx.beginPath();
    ctx.moveTo(hx, hby);
    ctx.quadraticCurveTo(hx + hw / 2, hby - hh, hx + hw, hby);
    ctx.lineTo(hx + hw, GROUND_Y + 10);
    ctx.lineTo(hx, GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }

  // ---- Ground ----
  ctx.fillStyle = grads.ground;
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 15) {
    const h = 6 + (x * 7 % 5);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x - 2, GROUND_Y - h);
    ctx.stroke();
  }

  // ---- Background trees ----
  drawTree(ctx, 50, GROUND_Y, 55);
  drawTree(ctx, 380, GROUND_Y, 45);
  drawTree(ctx, 650, GROUND_Y, 50);

  // ---- Background bushes ----
  drawBush(ctx, 150, GROUND_Y, 28);
  drawBush(ctx, 300, GROUND_Y, 22);
  drawBush(ctx, 500, GROUND_Y, 25);

  // ---- Flowers ----
  for (const fx of FLOWER_POSITIONS) {
    drawFlower(ctx, fx, GROUND_Y, FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length]);
  }

  // ---- Mushrooms ----
  drawMushroom(ctx, 220, GROUND_Y);
  drawMushroom(ctx, 560, GROUND_Y);

  // ---- Grass tufts ----
  for (let gx = 30; gx < WALL_X; gx += 90 + (gx * 3 % 30)) {
    drawGrassTuft(ctx, gx, GROUND_Y);
  }

  // ---- Wildlife (butterflies & birds) ----
  if (wildlife) {
    updateAndDrawWildlife(ctx, wildlife, dt, GROUND_Y);
  }

  // ---- Wall obstacle (nicer) ----
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(WALL_X + 4, WALL_Y + 4, WALL_WIDTH, WALL_HEIGHT);
  ctx.fillStyle = grads.wall;
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for (let row = 0; row < WALL_HEIGHT; row += 14) {
    ctx.beginPath(); ctx.moveTo(WALL_X, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH, WALL_Y + row); ctx.stroke();
    if ((row / 14) % 2 === 0) {
      ctx.beginPath(); ctx.moveTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row + 14); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, 2);
  ctx.fillStyle = '#5DAF4A';
  ctx.beginPath();
  ctx.ellipse(WALL_X + WALL_WIDTH / 2, WALL_Y - 1, WALL_WIDTH / 2 + 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4A9A3A';
  ctx.lineWidth = 1.5;
  for (let gx = WALL_X + 3; gx < WALL_X + WALL_WIDTH; gx += 5) {
    ctx.beginPath(); ctx.moveTo(gx, WALL_Y - 2); ctx.lineTo(gx - 1, WALL_Y - 7 - (gx * 3 % 4)); ctx.stroke();
  }

  // ---- Ready zone (highly visible) ----
  ctx.fillStyle = grads.zone;
  ctx.fillRect(READY_ZONE_X, 55, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y - 55);

  ctx.strokeStyle = 'rgba(76, 200, 80, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();
  ctx.strokeStyle = 'rgba(76, 200, 80, 0.25)';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();

  const goText = i18n.t('lobby_go');
  const goCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const goCy = GROUND_Y / 2 + 40;
  ctx.font = "bold 80px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 6;
  ctx.strokeText(goText, goCx, goCy);
  ctx.fillStyle = 'rgba(40, 140, 45, 0.85)';
  ctx.fillText(goText, goCx, goCy);

  // ---- Draw NPCs (behind players) ----
  for (const npc of extras) {
    if (npc.splatTimer > 0) { drawSquishedChar(ctx, npc); }
    else { drawLobbyCharacter(ctx, npc); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(getCharacterDisplayName(npc.character.name, i18n.language), npc.x + PLAYER_WIDTH / 2, npc.y - 5);
  }

  // ---- Draw bots ----
  for (const bot of bots) {
    if (bot.splatTimer > 0) { drawSquishedChar(ctx, bot); }
    else { drawLobbyCharacter(ctx, bot); }
    const tagX = bot.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(80, 60, 120, 0.6)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, bot.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#C8A0FF';
    ctx.font = "bold 10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('BOT', tagX, bot.y - 10);
  }

  // ---- Draw players ----
  for (const p of players) {
    if (p.splatTimer > 0) { drawSquishedChar(ctx, p); }
    else { drawLobbyCharacter(ctx, p); }
    const tagX = p.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, p.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = p.character.color;
    ctx.font = "bold 10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(`${p.id}`, tagX, p.y - 10);
  }

  // ---- UI bar at top (polished) ----
  const barH = 52;
  const maxSlotPx = 260;
  const slotCount = players.length;
  const barW = isMobile
    ? Math.min(slotCount * maxSlotPx + 40, CANVAS_WIDTH - 16)
    : CANVAS_WIDTH - 16;
  const barX = isMobile ? CANVAS_WIDTH - barW - 8 : 8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(barX, 6, barW, barH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX + 1, 7, barW - 2, barH - 2, 9);
  ctx.stroke();

  const slotWidth = (barW - 40) / slotCount;
  for (let i = 0; i < slotCount; i++) {
    const player = players[i];
    const sx = barX + 20 + i * slotWidth + slotWidth / 2;
    const emojiX = sx - slotWidth * 0.38;
    const textX = emojiX + 22;

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getCharacterEmoji(player.character.name), emojiX, 32);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = player.character.color;
    ctx.textAlign = 'left';
    ctx.font = "bold 14px 'Nunito', sans-serif";
    ctx.fillText(`${player.id}: ${getCharacterDisplayName(player.character.name, i18n.language)}`, textX, 26);

    if (!isMobile) {
      const bindings = KEY_BINDINGS[player.id as CharacterSlot];
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = "bold 13px 'Nunito', monospace";
      const fmtKey = (k: string) => k === 'ArrowLeft' ? '\u2190' : k === 'ArrowRight' ? '\u2192' : k === 'ArrowUp' ? '\u2191' : k === 'ArrowDown' ? '\u2193' : k;
      ctx.fillText(`${fmtKey(bindings.left)} ${fmtKey(bindings.right)} ${fmtKey(bindings.jump)} ${fmtKey(bindings.down)}`, textX, 42);
    }
  }

  // ---- Bottom-left: swap instruction ----
  const swapText = i18n.t('lobby_title');
  ctx.font = "bold 16px 'Nunito', sans-serif";
  const swapW = ctx.measureText(swapText).width + 28;
  const blX = 14;
  const blY = GROUND_Y + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(blX, blY, swapW, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(swapText, blX + 14, blY + 16);
  ctx.textBaseline = 'alphabetic';

  // ---- Rules hint (below START in ready zone) ----
  const rulesText = `${i18n.t('rules_label')}  🦶 ${i18n.t('rules_stomp')}   🥕 ${i18n.t('rules_carrot')}`;
  ctx.font = "14px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  const rulesCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const rulesY = GROUND_Y / 2 + 80;
  ctx.globalAlpha = 0.7;
  const rulesW = ctx.measureText(rulesText).width + 24;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(rulesCx - rulesW / 2, rulesY - 12, rulesW, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#DDD';
  ctx.textBaseline = 'middle';
  ctx.fillText(rulesText, rulesCx, rulesY);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;

  // ---- Bottom-right: join instruction with arrow ----
  const joinText = i18n.t('lobby_join');
  ctx.font = "bold 16px 'Nunito', sans-serif";
  const joinW = ctx.measureText(joinText).width + 50;
  const brX = CANVAS_WIDTH - joinW - 14;
  const brY = GROUND_Y + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(brX, brY, joinW, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#7CFC00';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = "bold 20px 'Nunito', sans-serif";
  ctx.fillText('\u2191', brX + 10, brY + 16);
  ctx.font = "bold 16px 'Nunito', sans-serif";
  ctx.fillText(joinText, brX + 30, brY + 16);
  ctx.textBaseline = 'alphabetic';

  // ---- Countdown (in the ready zone) ----
  if (countdownActive && countdown > 0) {
    const secs = Math.ceil(countdown);
    const cx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
    const cy = GROUND_Y / 2 + 115;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(cx - 90, cy, 180, 48, 14);
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.font = "bold 26px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('lobby_starting', { seconds: secs }), cx, cy + 31);
    ctx.font = "14px 'Nunito', sans-serif";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFF';
    ctx.fillText(i18n.t('countdown_skip'), cx, cy + 62);
    ctx.globalAlpha = 1;
  }

  // ---- Player count in zone (uses cached counts from updateReadyZone) ----
  if (inZoneCount > 0) {
    const parts: string[] = [];
    if (humanInZoneCount > 0) parts.push(i18n.t('lobby_humans_ready', { count: humanInZoneCount }));
    if (botInZoneCount > 0) parts.push(i18n.t('lobby_bots_ready', { count: botInZoneCount }));
    const readyText = parts.join(' + ');
    ctx.font = "bold 16px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    const rw = ctx.measureText(readyText).width + 24;
    const rx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
    const ry = GROUND_Y - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(rx - rw / 2, ry, rw, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#7CFC00';
    ctx.textBaseline = 'middle';
    ctx.fillText(readyText, rx, ry + 12);
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Day/night cycle ----
  drawDayNightCycle(ctx, performance.now() / 1000, LOBBY_DAY_CYCLE);
}

function drawSquishedChar(ctx: CanvasRenderingContext2D, p: Player): void {
  const cx = p.x + PLAYER_WIDTH / 2;
  const by = p.y + PLAYER_HEIGHT;
  ctx.fillStyle = p.character.color;
  ctx.beginPath();
  ctx.ellipse(cx, by - 4, PLAYER_WIDTH * 0.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLobbyCharacter(ctx: CanvasRenderingContext2D, p: Player): void {
  const { x, y, character, facing, animFrame, vx } = p;
  const onGround = p.state !== 'airborne';
  const w = PLAYER_WIDTH;
  const h = PLAYER_HEIGHT;
  const cx = x + w / 2;
  const isRunning = Math.abs(vx) > 10 && onGround;
  const isAirborne = !onGround;
  const bounce = isRunning ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
  const yOff = y - bounce;

  ctx.save();
  if (facing === 'left') {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }

  const ss = p.sideSquash;
  const sq = p.squashScale;
  if (ss !== 1 || sq !== 1) {
    const ssX = (1 + (1 - sq) * 0.5) * (ss !== 1 ? ss : 1);
    const ssY = sq * (ss !== 1 ? 1 + (1 - ss) * 0.4 : 1);
    const footY = y + h;
    ctx.translate(cx, footY);
    ctx.scale(ssX, ssY);
    ctx.translate(-cx, -footY);
  }

  const state = isAirborne ? 'airborne' : isRunning ? 'run' : 'idle';
  const colors = { color: character.color, darkColor: character.darkColor, lightColor: character.lightColor };
  drawCharacterCore(ctx, cx, yOff, w, h, character.name, state, animFrame, p.squashScale, colors);

  ctx.restore();
}
