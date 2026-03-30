import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { CharacterSelect } from './components/CharacterSelect';
import { Match } from './components/Match';
import { VictoryScreen } from './components/VictoryScreen';
import './App.css';

function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div className="app" data-testid="app">
      {screen === 'menu' && <MainMenu />}
      {screen === 'charSelect' && <CharacterSelect />}
      {screen === 'match' && <Match />}
      {screen === 'victory' && <VictoryScreen />}
    </div>
  );
}

export default App;
