import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS } from '../engine/characters';
import { KEY_BINDINGS } from '../engine/input';
import { audio } from '../engine/audio';
import type { CharacterSlot, CharacterDef } from '../engine/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT } from '../engine/constants';
import './CharacterSelect.css';

const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
const READY_ZONE_X = CANVAS_WIDTH * 0.7; // Right 30% of screen is the "ready zone"
const COUNTDOWN_SECONDS = 5;
const GROUND_Y = 560;
const LOBBY_GRAVITY = 600;
const LOBBY_SPEED = 200;
const LOBBY_JUMP = -400;

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
}

export function CharacterSelect() {
  const { setScreen, setActivePlayers, setMatchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef<LobbyPlayer[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const countdownRef = useRef<number>(-1);
  const countdownStartedRef = useRef<boolean>(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);

  // Init players spread across left side
  useEffect(() => {
    playersRef.current = SLOTS.map((slot, i) => ({
      slot,
      char: CHARACTERS[slot],
      x: 60 + i * 100,
      y: GROUND_Y - PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      facing: 'right',
      animFrame: 0,
      animTimer: 0,
      onGround: true,
    }));
  }, []);

  const startMatch = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const inZone = playersRef.current.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X);
    if (inZone.length < 2) {
      // Reset if not enough
      countdownRef.current = -1;
      countdownStartedRef.current = false;
      startedRef.current = false;
      return;
    }

    const activePlayers = inZone.map(p => p.slot);
    setActivePlayers(activePlayers);
    setMatchSettings({ playerCount: activePlayers.length });
    audio.play('select');
    setScreen('match');
  }, [setActivePlayers, setMatchSettings, setScreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.add(e.key);
      if (e.key === 'Escape') setScreen('menu');
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.delete(e.key);
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

      // Update players
      for (const p of playersRef.current) {
        const bindings = KEY_BINDINGS[p.slot];
        const keys = keysRef.current;

        // Input
        if (keys.has(bindings.left)) {
          p.vx = -LOBBY_SPEED;
          p.facing = 'left';
        } else if (keys.has(bindings.right)) {
          p.vx = LOBBY_SPEED;
          p.facing = 'right';
        } else {
          p.vx *= 0.85; // friction
          if (Math.abs(p.vx) < 5) p.vx = 0;
        }

        if (keys.has(bindings.jump) && p.onGround) {
          p.vy = LOBBY_JUMP;
          p.onGround = false;
        }

        // Gravity
        p.vy += LOBBY_GRAVITY * dt;
        p.y += p.vy * dt;
        p.x += p.vx * dt;

        // Ground collision
        if (p.y + PLAYER_HEIGHT >= GROUND_Y) {
          p.y = GROUND_Y - PLAYER_HEIGHT;
          p.vy = 0;
          p.onGround = true;
        }

        // Keep in bounds
        if (p.x < 0) p.x = 0;
        if (p.x + PLAYER_WIDTH > CANVAS_WIDTH) p.x = CANVAS_WIDTH - PLAYER_WIDTH;

        // Animation
        if (Math.abs(p.vx) > 10) {
          p.animTimer += dt;
          if (p.animTimer > 0.12) {
            p.animTimer = 0;
            p.animFrame = (p.animFrame + 1) % 4;
          }
        }
      }

      // Check ready zone
      const inZone = playersRef.current.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X);
      if (inZone.length >= 1 && !countdownStartedRef.current) {
        countdownStartedRef.current = true;
        countdownRef.current = COUNTDOWN_SECONDS;
      }
      if (inZone.length === 0) {
        countdownStartedRef.current = false;
        countdownRef.current = -1;
      }

      if (countdownStartedRef.current) {
        countdownRef.current -= dt;
        if (countdownRef.current <= 0) {
          startMatch();
        }
      }

      // Draw
      drawLobby(ctx, playersRef.current, countdownRef.current, countdownStartedRef.current);

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

// ---- Drawing ----

function drawLobby(
  ctx: CanvasRenderingContext2D,
  players: LobbyPlayer[],
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

  // Ready zone highlight
  ctx.fillStyle = 'rgba(76, 175, 80, 0.15)';
  ctx.fillRect(READY_ZONE_X, 0, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y);

  // Zone border line
  ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(READY_ZONE_X, 0);
  ctx.lineTo(READY_ZONE_X, GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow sign pointing right at zone
  ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
  const arrowY = GROUND_Y - 60;
  ctx.beginPath();
  ctx.moveTo(READY_ZONE_X + 10, arrowY);
  ctx.lineTo(READY_ZONE_X + 30, arrowY + 15);
  ctx.lineTo(READY_ZONE_X + 10, arrowY + 30);
  ctx.fill();

  // "GO!" text in zone
  ctx.fillStyle = 'rgba(76, 175, 80, 0.4)';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GO!', (READY_ZONE_X + CANVAS_WIDTH) / 2, GROUND_Y / 2 + 10);

  // Draw players
  for (const p of players) {
    drawLobbyCharacter(ctx, p);
    // Name tag above character
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.char.name, p.x + PLAYER_WIDTH / 2, p.y - 18);

    // Control hint
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px monospace';
    const bindings = KEY_BINDINGS[p.slot];
    ctx.fillText(`${bindings.left} ${bindings.right} ${bindings.jump}`, p.x + PLAYER_WIDTH / 2, p.y - 8);
  }

  // Title
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Walk right to join!', CANVAS_WIDTH / 2, 20);
  ctx.textBaseline = 'alphabetic';

  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('Press ESC to go back', CANVAS_WIDTH / 2, 65);

  // Countdown
  if (countdownActive && countdown > 0) {
    const secs = Math.ceil(countdown);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 80, 90, 160, 50, 12);
    ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Starting in ${secs}...`, CANVAS_WIDTH / 2, 123);
  }

  // Player count in zone
  const inZone = players.filter(p => p.x + PLAYER_WIDTH > READY_ZONE_X);
  if (inZone.length > 0) {
    ctx.fillStyle = 'rgba(76,175,80,0.8)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${inZone.length} player${inZone.length > 1 ? 's' : ''} ready`, (READY_ZONE_X + CANVAS_WIDTH) / 2, GROUND_Y - 20);
  }
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

  // Simplified character drawing (same shapes as main game)
  ctx.fillStyle = char.color;
  ctx.beginPath();
  if (char.name === 'Bunny') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (char.name === 'Fox') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.38, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = char.color;
    ctx.beginPath();
    ctx.moveTo(cx - 8, yOff + 8);
    ctx.lineTo(cx - 12, yOff - 6);
    ctx.lineTo(cx - 2, yOff + 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 8, yOff + 8);
    ctx.lineTo(cx + 12, yOff - 6);
    ctx.lineTo(cx + 2, yOff + 6);
    ctx.fill();
  } else if (char.name === 'Frog') {
    ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = char.lightColor;
    ctx.beginPath();
    ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (char.name === 'Bear') {
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Owl
    ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = char.darkColor;
    ctx.beginPath();
    ctx.moveTo(cx - 8, yOff + 6);
    ctx.lineTo(cx - 12, yOff - 6);
    ctx.lineTo(cx - 4, yOff + 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 8, yOff + 6);
    ctx.lineTo(cx + 12, yOff - 6);
    ctx.lineTo(cx + 4, yOff + 4);
    ctx.fill();
    // Big eyes
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(cx - 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - 4.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes
  if (char.name !== 'Frog' && char.name !== 'Owl') {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - 4, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 6, yOff + h * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(cx - 3, yOff + h * 0.38, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, yOff + h * 0.38, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legs
  ctx.fillStyle = char.darkColor;
  const legSpread = isAirborne ? 3 : 0;
  const legAnim = isRunning ? Math.sin(animFrame * Math.PI) * 3 : 0;
  ctx.fillRect(cx - 8 - legSpread, yOff + h * 0.75 - legAnim, 6, 8);
  ctx.fillRect(cx + 2 + legSpread, yOff + h * 0.75 + legAnim, 6, 8);

  ctx.restore();
}
