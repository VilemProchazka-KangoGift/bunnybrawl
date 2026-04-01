import { useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { CharacterSelect } from './components/CharacterSelect';
import { Match } from './components/Match';
import { VictoryScreen } from './components/VictoryScreen';
import { GameScaler } from './components/GameScaler';
import { assignBotCharacters } from './engine/characters';
import type { PlayerSlot, BotSlot, CharacterSlot } from './engine/types';
import { ALL_BOT_SLOTS } from './engine/types';

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

function App() {
  const screen = useGameStore((s) => s.screen);
  useDevAutoStart();

  return (
    <GameScaler>
      {screen === 'menu' && <MainMenu />}
      {screen === 'charSelect' && <CharacterSelect />}
      {screen === 'match' && <Match />}
      {screen === 'victory' && <VictoryScreen />}
    </GameScaler>
  );
}

export default App;
