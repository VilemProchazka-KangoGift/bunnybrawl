import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS, BOT_CHARACTERS, assignBotCharacters, regenerateLobbyRoster } from '../engine/characters';
import { audio } from '../engine/audio';
import type { CharacterSlot, PlayerSlot, BotSlot } from '../engine/types';
import { isBotSlot } from '../engine/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchInputManager } from '../engine/touchInput';
import { LobbyGame, READY_ZONE_X } from '../engine/lobbyGame';
import { drawLobbyOverlay } from '../engine/lobbyRender';
import { Renderer } from '../engine/renderer';
import { getTheme } from '../engine/arenas';
import { sampleFps, drawFpsCounter } from '../engine/fpsCounter';
import { useCanvasRenderScale } from '../hooks/useCanvasRenderScale';
import './CharacterSelect.css';

export function CharacterSelect() {
  const { setScreen, setActivePlayers, setMatchSettings, matchSettings } = useGameStore();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const lobbyTouchRef = useRef<TouchInputManager | null>(null);
  const lobbyGameRef = useRef<LobbyGame | null>(null);
  const isMobile = useMemo(() => isTouchPrimary(), []);

  // Initialise LobbyGame once
  useEffect(() => {
    regenerateLobbyRoster();
    lobbyGameRef.current = new LobbyGame({
      botCount: matchSettings.botCount,
      isMobile,
    });
    return () => {
      lobbyGameRef.current?.destroy();
      lobbyGameRef.current = null;
    };
  }, []);

  const startMatch = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const game = lobbyGameRef.current;
    if (!game) { startedRef.current = false; return; }

    const inZone = game.getReadyPlayers();
    if (inZone.length < 2) {
      game.countdown = -1;
      game.countdownStarted = false;
      startedRef.current = false;
      return;
    }

    // Write the chosen characters back into CHARACTERS so the match uses them (humans only)
    const humanInZone = inZone.filter(p => !isBotSlot(p.id));
    for (const lp of humanInZone) {
      CHARACTERS[lp.id as CharacterSlot] = { ...lp.character, slot: lp.id };
    }

    // Assign bot characters
    const humanSlots = humanInZone.map(p => p.id as CharacterSlot);
    const botInZone = inZone.filter(p => isBotSlot(p.id));
    const botSlots = botInZone.map(p => p.id as BotSlot);
    assignBotCharacters(humanSlots, botSlots);
    for (const bot of botInZone) {
      BOT_CHARACTERS.set(bot.id as BotSlot, { ...bot.character, slot: bot.id });
    }

    const activePlayers: PlayerSlot[] = inZone.map(p => p.id);
    setActivePlayers(activePlayers);
    setMatchSettings({ playerCount: activePlayers.length });
    audio.play('select');
    setScreen('match');
  }, [setActivePlayers, setMatchSettings, setScreen]);

  useEffect(() => {
    audio.playMenuMusic();
  }, []);

  // Keyboard + touch input
  useEffect(() => {
    const normalizeKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.add(normalizeKey(e.key));
      if (e.key === 'Escape') setScreen('menu');
      if (e.key === 'Enter' && lobbyGameRef.current?.countdownStarted) startMatch();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.delete(normalizeKey(e.key));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    if (isMobile) {
      const touch = new TouchInputManager();
      lobbyTouchRef.current = touch;
      const container = document.querySelector('.game-scaler-content') as HTMLElement | null;
      if (container) {
        const scaleFn = () => container.getBoundingClientRect().width / CANVAS_WIDTH;
        touch.attach(container, scaleFn);
      }
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      lobbyTouchRef.current?.detach();
      lobbyTouchRef.current = null;
    };
  }, [setScreen, startMatch]);

  useEffect(() => {
    const canvas = fgCanvasRef.current;
    if (!canvas) return;

    // Separate click + touchstart (rather than one pointerdown) so that on mobile
    // stopPropagation can suppress the document-level TouchInputManager's joystick
    // activation mid-tap while the lobby→match transition is in flight.
    const tryStartFromPoint = (clientX: number): boolean => {
      const game = lobbyGameRef.current;
      if (!game?.countdownStarted) return false;
      const rect = canvas.getBoundingClientRect();
      const lx = (clientX - rect.left) / (rect.width / CANVAS_WIDTH);
      if (lx < READY_ZONE_X) return false;
      startMatch();
      return true;
    };

    const handleClick = (e: MouseEvent) => {
      tryStartFromPoint(e.clientX);
    };
    const handleTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (t && tryStartFromPoint(t.clientX)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouchStart);
    };
  }, [startMatch]);

  useCanvasRenderScale(bgCanvasRef);
  useCanvasRenderScale(fgCanvasRef);
  useCanvasRenderScale(hudCanvasRef);

  // Main RAF loop — lobby physics + standard Renderer (lobbyMode)
  useEffect(() => {
    const bg = bgCanvasRef.current;
    const fg = fgCanvasRef.current;
    const hud = hudCanvasRef.current;
    if (!bg || !fg || !hud) return;

    const theme = getTheme('lobby');
    // Lobby skips bgNightCanvas/fgNightTint to avoid the per-arena VRAM cost.
    // LightingPipeline falls back to the source-over fillRect path; the lobby
    // does cycle dayPhase (LOBBY_DAY_CYCLE), so composite() emits a tint when
    // the cycle hits dusk/midnight — same look as pre-M1's drawDayNightCycle.
    // L4 per-arena keyframes may want lobby parity — see lighting program design doc.
    const renderer = new Renderer(bg, fg, theme, false, hud);

    // Static world (sky, hills, far background, platform iso skin) baked once.
    const game = lobbyGameRef.current;
    if (game) {
      renderer.renderBackground(game.getArena());
    }

    // Wire the lobby HUD overlay through the renderer's lobby-mode hook so it
    // paints on the dedicated hud canvas above the player layer each frame.
    renderer.setLobbyOverlayFn((ctx) => {
      const g = lobbyGameRef.current;
      if (!g) return;
      const counts = g.getReadyZoneCounts();
      drawLobbyOverlay(ctx, {
        players: g.players,
        bots: g.bots,
        extras: g.extraChars,
        countdown: g.countdown,
        countdownActive: g.countdownStarted,
        isMobile,
        inZoneCount: counts.inZone,
        humanInZoneCount: counts.humans,
        botInZoneCount: counts.bots,
      });
      drawFpsCounter(ctx, CANVAS_WIDTH);
    });

    const loop = (time: number) => {
      sampleFps(time);
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 1 / 60;
      lastTimeRef.current = time;

      const g = lobbyGameRef.current;
      if (g) {
        const touchInput = lobbyTouchRef.current?.getInput();
        g.update(dt, keysRef.current, touchInput);
        renderer.renderFrame(g.getMatchState(), g.getArena(), g.getParticles());
        if (g.isCountdownComplete()) startMatch();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isMobile, startMatch]);

  return (
    <div className="char-select" data-testid="char-select">
      <div className="lobby-canvas-container">
        <canvas
          ref={bgCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="lobby-canvas lobby-bg-canvas"
        />
        <canvas
          ref={fgCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="lobby-canvas lobby-fg-canvas"
          data-testid="lobby-canvas"
        />
        <canvas
          ref={hudCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="lobby-canvas lobby-hud-canvas"
        />
      </div>
      {isMobile && (
        <button
          className="mobile-overlay-btn lobby-back-btn"
          onClick={() => setScreen('menu')}
        >
          &#8249;
        </button>
      )}
    </div>
  );
}
