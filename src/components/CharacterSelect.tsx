import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS, BOT_CHARACTERS, assignBotCharacters } from '../engine/characters';
import { audio } from '../engine/audio';
import type { CharacterSlot, PlayerSlot, BotSlot } from '../engine/types';
import { isBotSlot } from '../engine/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchInputManager } from '../engine/touchInput';
import { LobbyGame, READY_ZONE_X } from '../engine/lobbyGame';
import './CharacterSelect.css';

export function CharacterSelect() {
  const { setScreen, setActivePlayers, setMatchSettings, matchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const lobbyTouchRef = useRef<TouchInputManager | null>(null);
  const lobbyGameRef = useRef<LobbyGame | null>(null);
  const isMobile = useMemo(() => isTouchPrimary(), []);

  // Initialise LobbyGame once
  useEffect(() => {
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
    const canvas = canvasRef.current;
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

  // Main RAF loop — delegates to LobbyGame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 1 / 60;
      lastTimeRef.current = time;

      const game = lobbyGameRef.current;
      if (game) {
        const touchInput = lobbyTouchRef.current?.getInput();
        game.update(dt, keysRef.current, touchInput);
        game.render(ctx, dt);

        if (game.isCountdownComplete()) startMatch();
      }

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
