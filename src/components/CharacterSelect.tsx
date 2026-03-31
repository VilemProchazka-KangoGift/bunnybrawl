import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS, ALL_CHARACTERS } from '../engine/characters';
import { KEY_BINDINGS } from '../engine/input';
import { audio } from '../engine/audio';
import i18n from '../i18n';
import type { CharacterSlot, CharacterDef } from '../engine/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT } from '../engine/constants';
import './CharacterSelect.css';

const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
const READY_ZONE_X = CANVAS_WIDTH * 0.72;
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
  slot: CharacterSlot;
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
  const { setScreen, setActivePlayers, setMatchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef<LobbyPlayer[]>([]);
  const extraCharsRef = useRef<LobbyPlayer[]>([]); // extra NPCs on the field
  const keysRef = useRef<Set<string>>(new Set());
  const countdownRef = useRef<number>(-1);
  const countdownStartedRef = useRef<boolean>(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const readySoundPlayedRef = useRef<Set<CharacterSlot>>(new Set());

  useEffect(() => {
    // Randomly assign characters to players
    const shuffled = shuffle([...ALL_CHARACTERS]);
    const assigned = shuffled.slice(0, SLOTS.length);
    const extras = shuffled.slice(SLOTS.length);

    playersRef.current = SLOTS.map((slot, i) => ({
      slot,
      char: { ...assigned[i], slot },
      x: 40 + i * 90,
      y: GROUND_Y - PLAYER_HEIGHT,
      vx: 0, vy: 0,
      facing: 'right' as const,
      animFrame: 0, animTimer: 0,
      onGround: true, splatTimer: 0,
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
      onGround: true, splatTimer: 0,
    }));
  }, []);

  const startMatch = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const inZone = playersRef.current.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
    if (inZone.length < 2) {
      countdownRef.current = -1;
      countdownStartedRef.current = false;
      startedRef.current = false;
      return;
    }

    // Write the chosen characters back into CHARACTERS so the match uses them
    for (const lp of inZone) {
      CHARACTERS[lp.slot] = { ...lp.char, slot: lp.slot };
    }

    const activePlayers = inZone.map(p => p.slot);
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
  }, [setScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 1 / 60;
      lastTimeRef.current = time;

      const allLobby = [...playersRef.current, ...extraCharsRef.current];

      // Update player-controlled characters
      for (const p of playersRef.current) {
        if (p.splatTimer > 0) { p.splatTimer -= dt; continue; }
        const bindings = KEY_BINDINGS[p.slot];
        const keys = keysRef.current;

        if (keys.has(bindings.left)) { p.vx = -LOBBY_SPEED; p.facing = 'left'; }
        else if (keys.has(bindings.right)) { p.vx = LOBBY_SPEED; p.facing = 'right'; }
        else { p.vx *= 0.85; if (Math.abs(p.vx) < 5) p.vx = 0; }

        if (keys.has(bindings.jump) && p.onGround) { p.vy = LOBBY_JUMP; p.onGround = false; }

        // Fast-fall with down key
        if (keys.has(bindings.down) && !p.onGround) {
          p.vy = Math.max(p.vy, LOBBY_FAST_FALL);
        }

        updateLobbyPhysics(p, dt);
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

      // Stomp detection — players stomp NPCs to swap characters, players stomp players to swap
      for (const attacker of playersRef.current) {
        if (attacker.splatTimer > 0) continue;
        if (attacker.vy < STOMP_VY) continue; // must be falling

        for (const victim of allLobby) {
          if (victim === attacker) continue;
          if (victim.splatTimer > 0) continue;

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

            // Respawn victim far from attacker (left of wall) so attacker lands safely
            const minDist = 200;
            let bestX = 40;
            let bestDist = 0;
            for (let attempt = 0; attempt < 10; attempt++) {
              const tryX = 20 + Math.random() * (WALL_X - 80);
              const dx = Math.abs(tryX - attacker.x);
              if (dx > bestDist) { bestDist = dx; bestX = tryX; }
            }
            if (bestDist < minDist && WALL_X > 200) bestX = attacker.x > WALL_X / 2 ? 40 : WALL_X - 60;
            victim.x = bestX;
            victim.y = GROUND_Y - PLAYER_HEIGHT;
            victim.vx = 0;
            victim.vy = 0;
            victim.onGround = true;
          }
        }
      }

      // No side collisions in lobby — players walk through each other freely
      // Only stomp detection above handles character interaction
      if (false) { // disabled — kept for reference
      for (let i = 0; i < allLobby.length; i++) {
        if (allLobby[i].splatTimer > 0) continue;
        for (let j = i + 1; j < allLobby.length; j++) {
          if (allLobby[j].splatTimer > 0) continue;
          const a = allLobby[i];
          const b = allLobby[j];

          const vertOverlap = Math.min(a.y + PLAYER_HEIGHT, b.y + PLAYER_HEIGHT) - Math.max(a.y, b.y);
          if (vertOverlap < PLAYER_HEIGHT * 0.5) continue;

          if (a.x + PLAYER_WIDTH - 4 > b.x + 4 && a.x + 4 < b.x + PLAYER_WIDTH - 4) {
            const aCx = a.x + PLAYER_WIDTH / 2;
            const bCx = b.x + PLAYER_WIDTH / 2;
            const overlap = PLAYER_WIDTH - 8 - Math.abs(aCx - bCx);
            if (overlap > 0) {
              const half = overlap / 2 + 0.5;
              if (aCx <= bCx) { a.x -= half; b.x += half; }
              else { a.x += half; b.x -= half; }
            }
          }
        }
      }
      } // end disabled collision block

      // Ready zone check
      const inZone = playersRef.current.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
      // Play animal sound when player enters ready zone for the first time
      for (const p of inZone) {
        if (!readySoundPlayedRef.current.has(p.slot)) {
          readySoundPlayedRef.current.add(p.slot);
          audio.play(p.char.name.toLowerCase() as any);
        }
      }
      // Remove players who left the zone so they can trigger again if they re-enter
      for (const p of playersRef.current) {
        if (p.x + PLAYER_WIDTH <= READY_ZONE_X || p.splatTimer > 0) {
          readySoundPlayedRef.current.delete(p.slot);
        }
      }
      if (inZone.length >= 2 && !countdownStartedRef.current) {
        countdownStartedRef.current = true;
        countdownRef.current = COUNTDOWN_SECONDS;
      }
      if (inZone.length < 2) {
        countdownStartedRef.current = false;
        countdownRef.current = -1;
      }

      if (countdownStartedRef.current) {
        countdownRef.current -= dt;
        if (countdownRef.current <= 0) startMatch();
      }

      drawLobby(ctx, playersRef.current, extraCharsRef.current, countdownRef.current, countdownStartedRef.current);
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

// ---- Physics ----

function updateLobbyPhysics(p: LobbyPlayer, dt: number): void {
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
      p.x = WALL_X - PLAYER_WIDTH;
      p.vx = 0;
    } else {
      // Blocked from the right
      p.x = WALL_X + WALL_WIDTH;
      p.vx = 0;
    }
  }

  // Screen bounds
  if (p.x < 0) p.x = 0;
  if (p.x + PLAYER_WIDTH > CANVAS_WIDTH) p.x = CANVAS_WIDTH - PLAYER_WIDTH;

  if (Math.abs(p.vx) > 10) {
    p.animTimer += dt;
    if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
  }
}

// ---- Drawing ----

function drawLobby(
  ctx: CanvasRenderingContext2D,
  players: LobbyPlayer[],
  extras: LobbyPlayer[],
  countdown: number,
  countdownActive: boolean,
): void {
  // Sky
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#4A90D9');
  gradient.addColorStop(0.7, '#87CEEB');
  gradient.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Control schemes at top
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(10, 8, CANVAS_WIDTH - 20, 42, 8);
  ctx.fill();

  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  const slotWidth = (CANVAS_WIDTH - 40) / SLOTS.length;
  for (let i = 0; i < SLOTS.length; i++) {
    const slot = SLOTS[i];
    const bindings = KEY_BINDINGS[slot];
    const player = players[i];
    const sx = 20 + i * slotWidth + slotWidth / 2;

    // Player color dot
    ctx.fillStyle = player.char.color;
    ctx.beginPath();
    ctx.arc(sx - slotWidth * 0.35, 29, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Slot + character name
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.fillText(`${slot}: ${player.char.name}`, sx - slotWidth * 0.25, 25);

    // Keys
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px monospace';
    ctx.fillText(`${bindings.left} ${bindings.right} ${bindings.jump} ${bindings.down}`, sx - slotWidth * 0.25, 39);
    ctx.font = 'bold 13px monospace';
  }

  // Ground
  ctx.fillStyle = '#4a8c3f';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);

  // Grass
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x - 2, GROUND_Y - 5 - (x * 7 % 4));
    ctx.stroke();
  }

  // Wall obstacle
  // Stone base
  ctx.fillStyle = '#6B5B4F';
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT);
  // Brick lines
  ctx.strokeStyle = '#5A4A3E';
  ctx.lineWidth = 1;
  for (let row = 0; row < WALL_HEIGHT; row += 14) {
    ctx.beginPath();
    ctx.moveTo(WALL_X, WALL_Y + row);
    ctx.lineTo(WALL_X + WALL_WIDTH, WALL_Y + row);
    ctx.stroke();
    // Offset vertical line per row
    const offset = (row / 14) % 2 === 0 ? WALL_WIDTH * 0.5 : 0;
    if (offset > 0) {
      ctx.beginPath();
      ctx.moveTo(WALL_X + offset, WALL_Y + row);
      ctx.lineTo(WALL_X + offset, WALL_Y + row + 14);
      ctx.stroke();
    }
  }
  // Top edge highlight
  ctx.fillStyle = '#7D6D5F';
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, 3);
  // Moss on top
  ctx.fillStyle = '#5DAF4A';
  ctx.fillRect(WALL_X - 2, WALL_Y - 2, WALL_WIDTH + 4, 4);
  // Small grass on top
  ctx.strokeStyle = '#4A9A3A';
  ctx.lineWidth = 1.5;
  for (let gx = WALL_X + 3; gx < WALL_X + WALL_WIDTH; gx += 6) {
    ctx.beginPath();
    ctx.moveTo(gx, WALL_Y - 2);
    ctx.lineTo(gx - 1, WALL_Y - 7 - Math.random() * 3);
    ctx.stroke();
  }

  // Ready zone
  ctx.fillStyle = 'rgba(76, 175, 80, 0.15)';
  ctx.fillRect(READY_ZONE_X, 55, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y - 55);

  ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(READY_ZONE_X, 55);
  ctx.lineTo(READY_ZONE_X, GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(76, 175, 80, 0.4)';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(i18n.t('lobby_go'), (READY_ZONE_X + CANVAS_WIDTH) / 2, GROUND_Y / 2 + 20);

  // Draw extras (NPCs) first (behind players)
  for (const npc of extras) {
    if (npc.splatTimer > 0) {
      drawSquishedChar(ctx, npc);
    } else {
      drawLobbyCharacter(ctx, npc);
    }
    // NPC label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(npc.char.name, npc.x + PLAYER_WIDTH / 2, npc.y - 6);
  }

  // Draw players
  for (const p of players) {
    if (p.splatTimer > 0) {
      drawSquishedChar(ctx, p);
    } else {
      drawLobbyCharacter(ctx, p);
    }
    // Player label: slot + name
    ctx.fillStyle = p.char.color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.slot}`, p.x + PLAYER_WIDTH / 2, p.y - 14);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '10px sans-serif';
    ctx.fillText(p.char.name, p.x + PLAYER_WIDTH / 2, p.y - 4);
  }

  // Title
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(i18n.t('lobby_title'), CANVAS_WIDTH / 2, 56);
  ctx.textBaseline = 'alphabetic';

  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(i18n.t('lobby_back'), CANVAS_WIDTH / 2, 90);

  // Countdown
  if (countdownActive && countdown > 0) {
    const secs = Math.ceil(countdown);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 80, 98, 160, 44, 12);
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('lobby_starting', { seconds: secs }), CANVAS_WIDTH / 2, 127);
  }

  // Player count
  const inZone = players.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0);
  if (inZone.length > 0) {
    ctx.fillStyle = 'rgba(76,175,80,0.8)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('lobby_players_ready', { count: inZone.length }), (READY_ZONE_X + CANVAS_WIDTH) / 2, GROUND_Y - 15);
  }
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
    // Horse: tall oval body + long face
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.36, h * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.52, 5, 6, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.fillRect(cx - 2, yOff + 0, 8, 5);
  } else if (char.name === 'Goat') {
    // Goat: round body + horns + beard
    ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#A09070'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx - 8, yOff + 2, 6, -Math.PI * 0.8, -Math.PI * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 8, yOff + 2, 6, -Math.PI * 0.9, -Math.PI * 0.2); ctx.stroke();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath(); ctx.moveTo(cx - 2, yOff + h * 0.58); ctx.lineTo(cx + 2, yOff + h * 0.58); ctx.lineTo(cx, yOff + h * 0.7); ctx.fill();
    // Goat horizontal pupils
    ctx.fillStyle = '#E8D060';
    ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx - 5, yOff + h * 0.38, 2.5, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 5, yOff + h * 0.38, 2.5, 1.2, 0, 0, Math.PI * 2); ctx.fill();
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
  } else {
    // Fallback
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Generic eyes for characters without custom ones
  if (!['Frog', 'Owl', 'Cat', 'Panda', 'Cow', 'Goat', 'Sheep', 'Monkey'].includes(char.name)) {
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
