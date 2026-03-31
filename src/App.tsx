import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { CharacterSelect } from './components/CharacterSelect';
import { Match } from './components/Match';
import { VictoryScreen } from './components/VictoryScreen';
import { GameScaler } from './components/GameScaler';

function App() {
  const screen = useGameStore((s) => s.screen);

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
