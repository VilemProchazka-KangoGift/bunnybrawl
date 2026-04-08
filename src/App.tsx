import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { CharacterSelect } from './components/CharacterSelect';
import { Match } from './components/Match';
import { VictoryScreen } from './components/VictoryScreen';
import { OnlineLobby } from './components/OnlineLobby';
import { GameScaler } from './components/GameScaler';
import { assignBotCharacters, registerBuiltinCharacters } from './engine/characters';
import type { PlayerSlot, BotSlot, CharacterSlot } from './engine/types';
import { ALL_BOT_SLOTS } from './engine/types';
import logoUrl from '/logo.png?url';

// Register all built-in characters into the pack registry at module load time
registerBuiltinCharacters();

/**
 * Dev test link: skip lobby and jump straight into a match.
 * Usage: ?arena=rooftops&bots=2&difficulty=hard
 *   arena: arena id (e.g. rooftops, meadow, volcano)
 *   bots: number of bots (0-5, default 1)
 *   difficulty: easy|medium|hard|impossible (default medium)
 */
function useDevAutoStart() {
  const setScreen = useGameStore((s) => s.setScreen);
  const setMatchSettings = useGameStore((s) => s.setMatchSettings);
  const setActivePlayers = useGameStore((s) => s.setActivePlayers);
  const didAutoStart = useRef(false);

  useEffect(() => {
    if (didAutoStart.current) return;
    const params = new URLSearchParams(window.location.search);
    const arena = params.get('arena');
    if (!arena) return;
    didAutoStart.current = true;

    const botCount = Math.min(5, Math.max(0, parseInt(params.get('bots') || '1', 10) || 1));
    const rawDiff = params.get('difficulty');
    const validDiffs = ['easy', 'medium', 'hard', 'impossible'] as const;
    const diff = validDiffs.includes(rawDiff as typeof validDiffs[number]) ? rawDiff as typeof validDiffs[number] : 'medium';

    const humanSlots: CharacterSlot[] = ['P1'];
    const botSlots: BotSlot[] = ALL_BOT_SLOTS.slice(0, botCount);
    assignBotCharacters(humanSlots, botSlots);

    const activePlayers: PlayerSlot[] = [...humanSlots, ...botSlots];
    setActivePlayers(activePlayers);
    setMatchSettings({ arenaId: arena, botCount, botDifficulty: diff, playerCount: activePlayers.length });
    setScreen('match');
  }, [setScreen, setMatchSettings, setActivePlayers]);
}

/** Wait for logo image + fonts, then dismiss the HTML loading screen. */
function usePreflight() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = logoUrl;

    const imgLoaded = img.complete
      ? Promise.resolve()
      : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(fallback);
      setReady(true);
      const el = document.getElementById('loading-screen');
      if (el) {
        el.style.opacity = '0';
        const remove = () => { try { el.remove(); } catch { /* already gone */ } };
        el.addEventListener('transitionend', remove, { once: true });
        setTimeout(remove, 700);
      }
    };

    Promise.all([imgLoaded, document.fonts.ready]).then(dismiss);
    // Hard cap so users never stare at a loader forever
    const fallback = setTimeout(dismiss, 4000);
    return () => { dismissed = true; clearTimeout(fallback); };
  }, []);

  return ready;
}

function App() {
  const screen = useGameStore((s) => s.screen);
  const ready = usePreflight();
  useDevAutoStart();

  return (
    <GameScaler>
      {screen === 'menu' && ready && <MainMenu />}
      {screen === 'charSelect' && <CharacterSelect />}
      {screen === 'onlineLobby' && <OnlineLobby />}
      {screen === 'match' && <Match />}
      {screen === 'victory' && <VictoryScreen />}
    </GameScaler>
  );
}

export default App;
