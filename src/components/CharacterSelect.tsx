import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS, ALL_CHARACTERS, BOT_CHARACTERS, CHAR_EMOJI, CUSTOM_EYE_CHARS, assignBotCharacters } from '../engine/characters';
import { KEY_BINDINGS } from '../engine/input';
import { audio } from '../engine/audio';
import i18n from '../i18n';
import type { CharacterSlot, CharacterDef, PlayerSlot, BotSlot } from '../engine/types';
import { ALL_BOT_SLOTS, isBotSlot } from '../engine/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED } from '../engine/constants';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
} from '../engine/themes/drawPrimitives';
import './CharacterSelect.css';

import { initWildlife, updateAndDrawWildlife, drawDayNightCycle } from '../engine/canvasAnimations';
import type { SimpleWildlife } from '../engine/canvasAnimations';

const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
const READY_ZONE_X = CANVAS_WIDTH * 0.72;
const LOBBY_DAY_CYCLE = 90;

let lobbyWildlife: SimpleWildlife[] | null = null;

const COUNTDOWN_SECONDS = 5;
const GROUND_Y = 560;
const LOBBY_GRAVITY = 600;
const LOBBY_SPEED = 200;
const LOBBY_JUMP = -400;
const LOBBY_FAST_FALL = 500;
const STOMP_VY = 50;

// Wall obstacle at ~2/3 of screen — forces players to jump to reach the ready zone
const WALL_X = CANVAS_WIDTH * 0.58;
const WALL_WIDTH = 24;
const WALL_HEIGHT = 120; // tall enough to require a jump
const WALL_Y = GROUND_Y - WALL_HEIGHT;

interface LobbyPlayer {
  slot: PlayerSlot;
  char: CharacterDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'left' | 'right';
  animFrame: number;
  animTimer: number;
  onGround: boolean;
  splatTimer: number; // > 0 means squished
  sideSquash: number; // 1.0 = normal, <1 = squashed horizontally (wall hit)
  squashScale: number; // 1.0 = normal, <1 = squashed vertically (crouch)
}

// Shuffle array in-place
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function CharacterSelect() {
  const { setScreen, setActivePlayers, setMatchSettings, matchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef<LobbyPlayer[]>([]);
  const botPlayersRef = useRef<LobbyPlayer[]>([]); // AI-controlled bot players
  const extraCharsRef = useRef<LobbyPlayer[]>([]); // extra NPCs on the field
  const keysRef = useRef<Set<string>>(new Set());
  const countdownRef = useRef<number>(-1);
  const countdownStartedRef = useRef<boolean>(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const readySoundPlayedRef = useRef<Set<PlayerSlot>>(new Set());

  useEffect(() => {
    const botCount = matchSettings.botCount;
    const botSlots = ALL_BOT_SLOTS.slice(0, botCount);

    // Randomly assign characters to players
    const shuffled = shuffle([...ALL_CHARACTERS]);
    const assigned = shuffled.slice(0, SLOTS.length);
    const botAssigned = shuffled.slice(SLOTS.length, SLOTS.length + botCount);
    const extras = shuffled.slice(SLOTS.length + botCount);

    playersRef.current = SLOTS.map((slot, i) => ({
      slot,
      char: { ...assigned[i], slot },
      x: 40 + i * 90,
      y: GROUND_Y - PLAYER_HEIGHT,
      vx: 0, vy: 0,
      facing: 'right' as const,
      animFrame: 0, animTimer: 0,
      onGround: true, splatTimer: 0, sideSquash: 1, squashScale: 1,
    }));

    // Create bot lobby players — they spawn on the left and walk to the ready zone
    botPlayersRef.current = botSlots.map((slot, i) => ({
      slot,
      char: { ...botAssigned[i], slot },
      x: 40 + (SLOTS.length + i) * 60,
      y: GROUND_Y - PLAYER_HEIGHT,
      vx: 0, vy: 0,
      facing: 'right' as const,
      animFrame: 0, animTimer: 0,
      onGround: true, splatTimer: 0, sideSquash: 1, squashScale: 1,
    }));

    // Extra characters wandering around — NPCs that players can stomp to swap into
    extraCharsRef.current = extras.map((ch, _i) => ({
      slot: 'P1' as CharacterSlot, // placeholder, not player-controlled
      char: ch,
      x: 40 + Math.random() * (WALL_X - 80),
      y: GROUND_Y - PLAYER_HEIGHT,
      vx: (Math.random() - 0.5) * 60,
      vy: 0,
      facing: (Math.random() > 0.5 ? 'right' : 'left') as 'left' | 'right',
      animFrame: 0, animTimer: 0,
      onGround: true, splatTimer: 0, sideSquash: 1, squashScale: 1,
    }));
  }, []);

  const startMatch = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const allParticipants = [...playersRef.current, ...botPlayersRef.current];
    const inZone = allParticipants.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
    if (inZone.length < 2) {
      countdownRef.current = -1;
      countdownStartedRef.current = false;
      startedRef.current = false;
      return;
    }

    // Write the chosen characters back into CHARACTERS so the match uses them (humans only)
    const humanInZone = inZone.filter(p => !isBotSlot(p.slot));
    for (const lp of humanInZone) {
      CHARACTERS[lp.slot as CharacterSlot] = { ...lp.char, slot: lp.slot };
    }

    // Assign bot characters
    const humanSlots = humanInZone.map(p => p.slot as CharacterSlot);
    const botInZone = inZone.filter(p => isBotSlot(p.slot));
    const botSlots = botInZone.map(p => p.slot as BotSlot);
    // Use the characters the bots walked in with
    assignBotCharacters(humanSlots, botSlots);
    // Override with the actual lobby characters (respecting any lobby swaps)
    for (const bot of botInZone) {
      BOT_CHARACTERS.set(bot.slot as BotSlot, { ...bot.char, slot: bot.slot });
    }

    const activePlayers: PlayerSlot[] = inZone.map(p => p.slot);
    setActivePlayers(activePlayers);
    setMatchSettings({ playerCount: activePlayers.length });
    audio.play('select');
    setScreen('match');
  }, [setActivePlayers, setMatchSettings, setScreen]);

  useEffect(() => {
    const normalizeKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.add(normalizeKey(e.key));
      if (e.key === 'Escape') setScreen('menu');
      if (e.key === 'Enter' && countdownStartedRef.current) startMatch();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.delete(normalizeKey(e.key));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setScreen, startMatch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 1 / 60;
      lastTimeRef.current = time;

      const allLobby = [...playersRef.current, ...botPlayersRef.current, ...extraCharsRef.current];

      // Update player-controlled characters (always CharacterSlots)
      for (const p of playersRef.current) {
        if (p.splatTimer > 0) { p.splatTimer -= dt; continue; }
        const bindings = KEY_BINDINGS[p.slot as CharacterSlot];
        const keys = keysRef.current;

        if (keys.has(bindings.left)) { p.vx = -LOBBY_SPEED; p.facing = 'left'; }
        else if (keys.has(bindings.right)) { p.vx = LOBBY_SPEED; p.facing = 'right'; }
        else { p.vx *= 0.85; if (Math.abs(p.vx) < 5) p.vx = 0; }

        if (keys.has(bindings.jump) && p.onGround) { p.vy = LOBBY_JUMP; p.onGround = false; }

        // Fast-fall with down key, or crouch squash on ground
        const crouching = keys.has(bindings.down);
        if (crouching) {
          if (!p.onGround) {
            p.vy = Math.max(p.vy, LOBBY_FAST_FALL);
          } else {
            p.squashScale = SQUASH_ON_CROUCH;
          }
        }

        updateLobbyPhysics(p, dt, crouching && p.onGround);
      }

      // Update NPC extras — simple wandering AI
      for (const npc of extraCharsRef.current) {
        if (npc.splatTimer > 0) { npc.splatTimer -= dt; continue; }
        // Random direction changes
        if (Math.random() < 0.01) npc.vx = (Math.random() - 0.5) * 80;
        if (Math.random() < 0.005 && npc.onGround) { npc.vy = LOBBY_JUMP * 0.6; npc.onGround = false; }
        npc.facing = npc.vx > 0 ? 'right' : npc.vx < 0 ? 'left' : npc.facing;
        updateLobbyPhysics(npc, dt);
      }

      // Update bot players — directed AI walking toward ready zone
      for (const bot of botPlayersRef.current) {
        if (bot.splatTimer > 0) { bot.splatTimer -= dt; continue; }
        updateBotLobbyAI(bot, dt);
        updateLobbyPhysics(bot, dt);
      }

      // Stomp detection — humans stomp anyone to swap, bots only stomp NPCs (not humans)
      const humanPlayers = playersRef.current;
      const botPlayers = botPlayersRef.current;
      const stompAttackers = [...humanPlayers, ...botPlayers];
      for (const attacker of stompAttackers) {
        if (attacker.splatTimer > 0) continue;
        if (attacker.vy < STOMP_VY) continue; // must be falling
        const attackerIsBot = isBotSlot(attacker.slot);

        for (const victim of allLobby) {
          if (victim === attacker) continue;
          if (victim.splatTimer > 0) continue;
          // Bots cannot stomp human players or other bots in the lobby
          if (attackerIsBot && !extraCharsRef.current.includes(victim)) continue;

          // Check overlap + attacker above victim
          if (
            attacker.x + PLAYER_WIDTH > victim.x &&
            attacker.x < victim.x + PLAYER_WIDTH &&
            attacker.y + PLAYER_HEIGHT > victim.y &&
            attacker.y + PLAYER_HEIGHT < victim.y + PLAYER_HEIGHT * 0.5 + 4
          ) {
            // Stomp! Swap characters
            const tempChar = attacker.char;
            attacker.char = { ...victim.char, slot: attacker.slot };
            victim.char = { ...tempChar, slot: victim.slot };
            victim.splatTimer = 0.8;
            attacker.vy = -300; // bounce
            audio.play('stomp');

            // Only respawn NPCs away — player-controlled characters stay in place
            const isNPC = extraCharsRef.current.includes(victim);
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
              victim.onGround = true;
            }
          }
        }
      }

      // Ready zone check — includes both human players and bots
      const allParticipants = [...playersRef.current, ...botPlayersRef.current];
      const inZone = allParticipants.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
      // Play animal sound when player/bot enters ready zone for the first time
      for (const p of inZone) {
        if (!readySoundPlayedRef.current.has(p.slot)) {
          readySoundPlayedRef.current.add(p.slot);
          audio.playAnimal(p.char.name);
        }
      }
      // Remove players who left the zone so they can trigger again if they re-enter
      for (const p of allParticipants) {
        if (p.x + PLAYER_WIDTH <= READY_ZONE_X || p.splatTimer > 0) {
          readySoundPlayedRef.current.delete(p.slot);
        }
      }
      const humansInZone = inZone.filter(p => !isBotSlot(p.slot));
      // Need at least 1 human + total 2 participants to start countdown
      if (inZone.length >= 2 && humansInZone.length >= 1 && !countdownStartedRef.current) {
        countdownStartedRef.current = true;
        countdownRef.current = COUNTDOWN_SECONDS;
      }
      if (inZone.length < 2 || humansInZone.length < 1) {
        countdownStartedRef.current = false;
        countdownRef.current = -1;
      }

      if (countdownStartedRef.current) {
        countdownRef.current -= dt;
        if (countdownRef.current <= 0) startMatch();
      }

      drawLobby(ctx, playersRef.current, botPlayersRef.current, extraCharsRef.current, countdownRef.current, countdownStartedRef.current, dt);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [startMatch]);

  return (
    <div className="char-select" data-testid="char-select">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="lobby-canvas"
        data-testid="lobby-canvas"
      />
    </div>
  );
}

// ---- Bot Lobby AI ----

// Each bot gets slightly different behavior via a seeded offset
const BOT_SPEED_VARIANCE = [0.85, 1.0, 0.9, 1.1, 0.95];
const BOT_PAUSE_CHANCE = [0.003, 0.002, 0.004, 0.001, 0.003];

function updateBotLobbyAI(bot: LobbyPlayer, _dt: number): void {
  const slotIdx = parseInt(bot.slot[1]) - 1; // B1→0, B2→1, etc.
  const speedMult = BOT_SPEED_VARIANCE[slotIdx % BOT_SPEED_VARIANCE.length];
  const pauseChance = BOT_PAUSE_CHANCE[slotIdx % BOT_PAUSE_CHANCE.length];

  // Each bot has a different target X in the ready zone to spread out
  const zoneWidth = CANVAS_WIDTH - READY_ZONE_X - 20;
  const botTargetX = READY_ZONE_X + 30 + (slotIdx / 5) * zoneWidth;

  // If in the ready zone, slow down and idle near target position
  if (bot.x + PLAYER_WIDTH > READY_ZONE_X + 20) {
    const dxToTarget = botTargetX - bot.x;
    if (Math.abs(dxToTarget) > 30) {
      // Slowly drift toward spread-out target
      bot.vx = Math.sign(dxToTarget) * 40;
      bot.facing = dxToTarget > 0 ? 'right' : 'left';
    } else {
      // At target — stop
      bot.vx *= 0.85;
      if (Math.abs(bot.vx) < 5) bot.vx = 0;
    }
    return;
  }

  // Random pause for organic feel
  if (Math.random() < pauseChance) {
    bot.vx = 0;
    return;
  }

  // Walk right toward the ready zone
  bot.vx = LOBBY_SPEED * 0.7 * speedMult;
  bot.facing = 'right';

  // Jump at the wall obstacle
  if (bot.onGround && bot.x + PLAYER_WIDTH > WALL_X - 60 && bot.x < WALL_X + WALL_WIDTH + 20) {
    bot.vy = LOBBY_JUMP;
    bot.onGround = false;
  }

  // If stuck against the wall, keep trying to jump
  if (bot.onGround && bot.vx > 0 && Math.abs(bot.x - (WALL_X - PLAYER_WIDTH)) < 4) {
    bot.vy = LOBBY_JUMP;
    bot.onGround = false;
  }

  // If on top of the wall, walk right off it
  if (bot.y < WALL_Y && bot.x > WALL_X - PLAYER_WIDTH && bot.x < WALL_X + WALL_WIDTH + PLAYER_WIDTH) {
    bot.vx = LOBBY_SPEED * 0.8 * speedMult;
    bot.facing = 'right';
  }
}

// ---- Physics ----

function updateLobbyPhysics(p: LobbyPlayer, dt: number, holdingCrouch = false): void {
  p.vy += LOBBY_GRAVITY * dt;
  p.y += p.vy * dt;
  p.x += p.vx * dt;

  // Ground collision
  if (p.y + PLAYER_HEIGHT >= GROUND_Y) {
    p.y = GROUND_Y - PLAYER_HEIGHT;
    p.vy = 0;
    p.onGround = true;
  }

  // Wall obstacle collision (can land on top or be blocked sideways)
  if (
    p.x + PLAYER_WIDTH > WALL_X &&
    p.x < WALL_X + WALL_WIDTH &&
    p.y + PLAYER_HEIGHT > WALL_Y &&
    p.y < GROUND_Y
  ) {
    const overlapLeft = (p.x + PLAYER_WIDTH) - WALL_X;
    const overlapRight = (WALL_X + WALL_WIDTH) - p.x;
    const overlapTop = (p.y + PLAYER_HEIGHT) - WALL_Y;

    if (overlapTop < Math.min(overlapLeft, overlapRight) && p.vy >= 0) {
      // Landing on top of wall
      p.y = WALL_Y - PLAYER_HEIGHT;
      p.vy = 0;
      p.onGround = true;
    } else if (overlapLeft < overlapRight) {
      // Blocked from the left
      if (p.vx > 0) p.sideSquash = 0.75;
      p.x = WALL_X - PLAYER_WIDTH;
      p.vx = 0;
    } else {
      // Blocked from the right
      if (p.vx < 0) p.sideSquash = 0.75;
      p.x = WALL_X + WALL_WIDTH;
      p.vx = 0;
    }
  }

  // Screen bounds
  if (p.x < 0) { if (p.vx < 0) p.sideSquash = 0.75; p.x = 0; p.vx = 0; }
  if (p.x + PLAYER_WIDTH > CANVAS_WIDTH) { if (p.vx > 0) p.sideSquash = 0.75; p.x = CANVAS_WIDTH - PLAYER_WIDTH; p.vx = 0; }

  if (Math.abs(p.vx) > 10) {
    p.animTimer += dt;
    if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
  }

  // Squash decay (skip vertical decay while actively crouching)
  if (!holdingCrouch && p.squashScale !== 1) {
    p.squashScale += (1.0 - p.squashScale) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.squashScale - 1) < 0.02) p.squashScale = 1;
  }
  if (p.sideSquash !== 1) {
    p.sideSquash += (1.0 - p.sideSquash) * SQUASH_DECAY_SPEED * dt;
    if (Math.abs(p.sideSquash - 1) < 0.02) p.sideSquash = 1;
  }
}

// ---- Drawing ----

function drawLobby(
  ctx: CanvasRenderingContext2D,
  players: LobbyPlayer[],
  bots: LobbyPlayer[],
  extras: LobbyPlayer[],
  countdown: number,
  countdownActive: boolean,
  dt: number,
): void {
  // ---- Sky with gradient (meadow style) ----
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  skyGrad.addColorStop(0, '#4A90D9');
  skyGrad.addColorStop(0.6, '#87CEEB');
  skyGrad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = skyGrad;
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
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
  groundGrad.addColorStop(0, '#4a8c3f');
  groundGrad.addColorStop(0.15, '#3a7030');
  groundGrad.addColorStop(1, '#2a5520');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  // Grass top strip
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);
  // Grass blades
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
  const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
  const flowerPositions = [100, 190, 260, 340, 430, 520, 580, 670];
  for (const fx of flowerPositions) {
    drawFlower(ctx, fx, GROUND_Y, flowerColors[Math.floor(fx * 0.01) % flowerColors.length]);
  }

  // ---- Mushrooms ----
  drawMushroom(ctx, 220, GROUND_Y);
  drawMushroom(ctx, 560, GROUND_Y);

  // ---- Grass tufts ----
  for (let gx = 30; gx < WALL_X; gx += 90 + (gx * 3 % 30)) {
    drawGrassTuft(ctx, gx, GROUND_Y);
  }

  // ---- Wildlife (butterflies & birds) ----
  if (!lobbyWildlife) lobbyWildlife = initWildlife(6, GROUND_Y, 0.67);
  updateAndDrawWildlife(ctx, lobbyWildlife, dt, GROUND_Y);

  // ---- Wall obstacle (nicer) ----
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(WALL_X + 4, WALL_Y + 4, WALL_WIDTH, WALL_HEIGHT);
  // Stone body
  const wallGrad = ctx.createLinearGradient(WALL_X, WALL_Y, WALL_X + WALL_WIDTH, WALL_Y + WALL_HEIGHT);
  wallGrad.addColorStop(0, '#7D6D5F');
  wallGrad.addColorStop(0.5, '#6B5B4F');
  wallGrad.addColorStop(1, '#5A4A3E');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT);
  // Brick lines
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for (let row = 0; row < WALL_HEIGHT; row += 14) {
    ctx.beginPath(); ctx.moveTo(WALL_X, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH, WALL_Y + row); ctx.stroke();
    if ((row / 14) % 2 === 0) {
      ctx.beginPath(); ctx.moveTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row + 14); ctx.stroke();
    }
  }
  // Highlight top edge
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, 2);
  // Moss + grass on top
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
  // Strong gradient background
  const zoneGrad = ctx.createLinearGradient(READY_ZONE_X, 0, CANVAS_WIDTH, 0);
  zoneGrad.addColorStop(0, 'rgba(76, 175, 80, 0.08)');
  zoneGrad.addColorStop(0.3, 'rgba(76, 175, 80, 0.2)');
  zoneGrad.addColorStop(1, 'rgba(76, 175, 80, 0.3)');
  ctx.fillStyle = zoneGrad;
  ctx.fillRect(READY_ZONE_X, 55, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y - 55);

  // Solid bright border line (not dashed — more visible)
  ctx.strokeStyle = 'rgba(76, 200, 80, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();
  // Glow on border
  ctx.strokeStyle = 'rgba(76, 200, 80, 0.25)';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();

  // Large "GO!" / "START!" text
  const goText = i18n.t('lobby_go');
  const goCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const goCy = GROUND_Y / 2 + 40;
  ctx.font = "bold 80px 'Fredoka', sans-serif";
  ctx.textAlign = 'center';
  // Dark outline for contrast
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 6;
  ctx.strokeText(goText, goCx, goCy);
  // Fill
  ctx.fillStyle = 'rgba(40, 140, 45, 0.85)';
  ctx.fillText(goText, goCx, goCy);

  // ---- Draw NPCs (behind players) ----
  for (const npc of extras) {
    if (npc.splatTimer > 0) { drawSquishedChar(ctx, npc); }
    else { drawLobbyCharacter(ctx, npc); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "10px 'Fredoka', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t(`char_${npc.char.name}`, npc.char.name), npc.x + PLAYER_WIDTH / 2, npc.y - 5);
  }

  // ---- Draw bots ----
  for (const bot of bots) {
    if (bot.splatTimer > 0) { drawSquishedChar(ctx, bot); }
    else { drawLobbyCharacter(ctx, bot); }
    // Bot tag with "BOT" label
    const tagX = bot.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(80, 60, 120, 0.6)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, bot.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#C8A0FF';
    ctx.font = "bold 10px 'Fredoka', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('BOT', tagX, bot.y - 10);
  }

  // ---- Draw players ----
  for (const p of players) {
    if (p.splatTimer > 0) { drawSquishedChar(ctx, p); }
    else { drawLobbyCharacter(ctx, p); }
    // Player tag with background pill
    const tagX = p.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, p.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = p.char.color;
    ctx.font = "bold 10px 'Fredoka', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(`${p.slot}`, tagX, p.y - 10);
  }

  // ---- UI bar at top (polished) ----
  const barH = 52;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(8, 6, CANVAS_WIDTH - 16, barH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(9, 7, CANVAS_WIDTH - 18, barH - 2, 9);
  ctx.stroke();

  const slotWidth = (CANVAS_WIDTH - 40) / SLOTS.length;
  for (let i = 0; i < SLOTS.length; i++) {
    const slot = SLOTS[i];
    const bindings = KEY_BINDINGS[slot];
    const player = players[i];
    const sx = 20 + i * slotWidth + slotWidth / 2;
    const emojiX = sx - slotWidth * 0.38;
    const textX = emojiX + 22;

    // Character emoji
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CHAR_EMOJI[player.char.name] ?? '?', emojiX, 32);
    ctx.textBaseline = 'alphabetic';

    // Name in player color
    ctx.fillStyle = player.char.color;
    ctx.textAlign = 'left';
    ctx.font = "bold 14px 'Fredoka', sans-serif";
    ctx.fillText(`${slot}: ${i18n.t(`char_${player.char.name}`, player.char.name)}`, textX, 26);

    // Keys
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = "bold 13px 'Fredoka', monospace";
    const fmtKey = (k: string) => k === 'ArrowLeft' ? '\u2190' : k === 'ArrowRight' ? '\u2192' : k === 'ArrowUp' ? '\u2191' : k === 'ArrowDown' ? '\u2193' : k;
    ctx.fillText(`${fmtKey(bindings.left)} ${fmtKey(bindings.right)} ${fmtKey(bindings.jump)} ${fmtKey(bindings.down)}`, textX, 42);
  }

  // ---- Bottom-left: swap instruction ----
  const swapText = i18n.t('lobby_title');
  ctx.font = "bold 16px 'Fredoka', sans-serif";
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
  ctx.font = "14px 'Fredoka', sans-serif";
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
  ctx.font = "bold 16px 'Fredoka', sans-serif";
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
  // Arrow pointing up toward the start zone
  ctx.font = "bold 20px 'Fredoka', sans-serif";
  ctx.fillText('\u2191', brX + 10, brY + 16);
  ctx.font = "bold 16px 'Fredoka', sans-serif";
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
    ctx.font = "bold 26px 'Fredoka', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('lobby_starting', { seconds: secs }), cx, cy + 31);
    ctx.font = "14px 'Fredoka', sans-serif";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFF';
    ctx.fillText(i18n.t('countdown_skip'), cx, cy + 62);
    ctx.globalAlpha = 1;
  }

  // ---- Player count in zone ----
  const inZone = [...players, ...bots].filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
  if (inZone.length > 0) {
    const humanCount = inZone.filter(p => !isBotSlot(p.slot)).length;
    const botCount = inZone.filter(p => isBotSlot(p.slot)).length;
    const parts: string[] = [];
    if (humanCount > 0) parts.push(i18n.t('lobby_humans_ready', { count: humanCount }));
    if (botCount > 0) parts.push(i18n.t('lobby_bots_ready', { count: botCount }));
    const readyText = parts.join(' + ');
    ctx.font = "bold 16px 'Fredoka', sans-serif";
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

function drawSquishedChar(ctx: CanvasRenderingContext2D, p: LobbyPlayer): void {
  const cx = p.x + PLAYER_WIDTH / 2;
  const by = p.y + PLAYER_HEIGHT;
  ctx.fillStyle = p.char.color;
  ctx.beginPath();
  ctx.ellipse(cx, by - 4, PLAYER_WIDTH * 0.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLobbyCharacter(ctx: CanvasRenderingContext2D, p: LobbyPlayer): void {
  const { x, y, char, facing, animFrame, onGround, vx } = p;
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

  // Squash/stretch transform (side squash from wall + vertical crouch squash)
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

  ctx.fillStyle = char.color;
  ctx.beginPath();

  if (char.name === 'Bunny') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Fox') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.38, h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.color;
    ctx.beginPath(); ctx.moveTo(cx - 8, yOff + 8); ctx.lineTo(cx - 12, yOff - 6); ctx.lineTo(cx - 2, yOff + 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 8, yOff + 8); ctx.lineTo(cx + 12, yOff - 6); ctx.lineTo(cx + 2, yOff + 6); ctx.fill();
  } else if (char.name === 'Frog') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Bear') {
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Owl') {
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.moveTo(cx - 8, yOff + 6); ctx.lineTo(cx - 12, yOff - 6); ctx.lineTo(cx - 4, yOff + 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 8, yOff + 6); ctx.lineTo(cx + 12, yOff - 6); ctx.lineTo(cx + 4, yOff + 4); ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.36, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.36, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 4.5, yOff + h * 0.36, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5.5, yOff + h * 0.36, 2, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Cat') {
    // Wider rounder body
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    // Tall upright ears
    ctx.beginPath(); ctx.moveTo(cx - 9, yOff + 10); ctx.lineTo(cx - 7, yOff - 8); ctx.lineTo(cx - 2, yOff + 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 9, yOff + 10); ctx.lineTo(cx + 7, yOff - 8); ctx.lineTo(cx + 2, yOff + 8); ctx.closePath(); ctx.fill();
    // Pink inner ears
    ctx.fillStyle = '#FF9AAA';
    ctx.beginPath(); ctx.moveTo(cx - 8, yOff + 8); ctx.lineTo(cx - 7, yOff - 4); ctx.lineTo(cx - 3, yOff + 7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 8, yOff + 8); ctx.lineTo(cx + 7, yOff - 4); ctx.lineTo(cx + 3, yOff + 7); ctx.closePath(); ctx.fill();
    // Pink nose
    ctx.fillStyle = '#FF8090';
    ctx.beginPath(); ctx.arc(cx + 1, yOff + h * 0.48, 2, 0, Math.PI * 2); ctx.fill();
    // Green almond eyes
    ctx.fillStyle = '#90EE60';
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + h * 0.38, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.38, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx - 4.5, yOff + h * 0.38, 1, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5.5, yOff + h * 0.38, 1, 2, 0, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Wolf') {
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 9, yOff + 6); ctx.lineTo(cx - 11, yOff - 6); ctx.lineTo(cx - 3, yOff + 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 9, yOff + 6); ctx.lineTo(cx + 11, yOff - 6); ctx.lineTo(cx + 3, yOff + 4); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 3, yOff + h * 0.5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Panda') {
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + h * 0.38, 5, 4, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.38, 5, 4, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 4.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Pig') {
    // Pig: round pink body + snout
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 3, yOff + h * 0.52, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.arc(cx + 1, yOff + h * 0.52, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.52, 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Cow') {
    // Cow: cream body + black patches
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.ellipse(cx - 6, yOff + h * 0.4, 5, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 4, yOff + h * 0.58, 4, 3, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFB0B0';
    ctx.beginPath(); ctx.ellipse(cx + 2, yOff + h * 0.52, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    // Cow custom eyes
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Horse') {
    // Horse: elongated body, long face, pointed ears, flowing mane
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.38, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 6, yOff + h * 0.54, 6, 7, 0.15, 0, Math.PI * 2); ctx.fill();
    // Tall pointed ears
    ctx.fillStyle = char.color;
    ctx.beginPath(); ctx.moveTo(cx - 7, yOff + 8); ctx.lineTo(cx - 10, yOff - 6); ctx.lineTo(cx - 3, yOff + 5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 5, yOff + 8); ctx.lineTo(cx + 8, yOff - 6); ctx.lineTo(cx + 1, yOff + 5); ctx.fill();
    // Flowing mane tufts
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.moveTo(cx - 10, yOff + 4); ctx.lineTo(cx - 14, yOff - 2); ctx.lineTo(cx - 8, yOff + 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 11, yOff + 10); ctx.lineTo(cx - 16, yOff + 4); ctx.lineTo(cx - 9, yOff + 12); ctx.fill();
    // Nostrils
    ctx.fillStyle = '#4A3020';
    ctx.beginPath(); ctx.ellipse(cx + 8, yOff + h * 0.56, 1.5, 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.57, 1.5, 1, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.38, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 0.8, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Goat') {
    // Goat: stocky body, curved horns, floppy ears, beard, rectangular pupils
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // Curly ram horns
    ctx.strokeStyle = '#B0A080'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 6, yOff + 4); ctx.bezierCurveTo(cx - 10, yOff - 6, cx - 18, yOff - 4, cx - 16, yOff + 4); ctx.bezierCurveTo(cx - 14, yOff + 10, cx - 8, yOff + 10, cx - 8, yOff + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 6, yOff + 4); ctx.bezierCurveTo(cx + 10, yOff - 6, cx + 18, yOff - 4, cx + 16, yOff + 4); ctx.bezierCurveTo(cx + 14, yOff + 10, cx + 8, yOff + 10, cx + 8, yOff + 6); ctx.stroke();
    ctx.lineCap = 'butt';
    // Floppy ears
    ctx.fillStyle = char.color;
    ctx.beginPath(); ctx.ellipse(cx - 12, yOff + h * 0.38, 4, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 12, yOff + h * 0.38, 4, 6, 0.3, 0, Math.PI * 2); ctx.fill();
    // Snout
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Beard
    ctx.beginPath(); ctx.moveTo(cx - 1, yOff + h * 0.56); ctx.lineTo(cx + 3, yOff + h * 0.56); ctx.lineTo(cx + 1, yOff + h * 0.72); ctx.fill();
    // Goat horizontal pupils
    ctx.fillStyle = '#D4B840';
    ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Sheep') {
    // Sheep: fluffy cloud body + dark face
    ctx.fillStyle = char.color;
    ctx.beginPath(); ctx.arc(cx - 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, yOff + h * 0.42, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, yOff + h * 0.55, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.ellipse(cx + 2, yOff + h * 0.44, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Monkey') {
    // Monkey: round body + big ears + light face
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 12, yOff + h * 0.35, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, yOff + h * 0.35, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.arc(cx - 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 1, yOff + h * 0.46, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Tiger') {
    // Tiger: muscular body, round ears, stripes
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath(); ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2); ctx.fill();
    // Upper stripes
    ctx.strokeStyle = char.darkColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 8, yOff + h * 0.35); ctx.lineTo(cx - 12, yOff + h * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 8, yOff + h * 0.35); ctx.lineTo(cx + 12, yOff + h * 0.45); ctx.stroke();
    // Lower stripes
    ctx.beginPath(); ctx.moveTo(cx - 7, yOff + h * 0.5); ctx.lineTo(cx - 11, yOff + h * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 7, yOff + h * 0.5); ctx.lineTo(cx + 11, yOff + h * 0.6); ctx.stroke();
    // Muzzle
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 1, yOff + h * 0.52, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FF6060';
    ctx.beginPath(); ctx.ellipse(cx + 1, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  } else if (char.name === 'Rhino') {
    // Rhino: wide body, small ears, horn
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.44, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 10, yOff + 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, yOff + 6, 4, 0, Math.PI * 2); ctx.fill();
    // Horn
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.moveTo(cx + 3, yOff + h * 0.35); ctx.lineTo(cx + 6, yOff - 2); ctx.lineTo(cx + 9, yOff + h * 0.38); ctx.closePath(); ctx.fill();
    // Skin fold
    ctx.strokeStyle = char.darkColor; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.55, w * 0.3, 0.3, 1.2); ctx.stroke();
  } else {
    // Fallback
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Generic eyes for characters without custom ones
  if (!CUSTOM_EYE_CHARS.has(char.name)) {
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  }

  // Legs
  ctx.fillStyle = char.darkColor;
  const legSpread = isAirborne ? 3 : 0;
  const legAnim = isRunning ? Math.sin(animFrame * Math.PI) * 3 : 0;
  ctx.fillRect(cx - 8 - legSpread, yOff + h * 0.75 - legAnim, 6, 8);
  ctx.fillRect(cx + 2 + legSpread, yOff + h * 0.75 + legAnim, 6, 8);

  ctx.restore();
}
