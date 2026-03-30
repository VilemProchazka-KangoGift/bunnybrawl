import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import './MainMenu.css';

export function MainMenu() {
  const { setScreen, matchSettings, setMatchSettings } = useGameStore();

  const handlePlay = () => {
    audio.init();
    audio.play('select');
    setScreen('charSelect');
  };

  return (
    <div className="main-menu" data-testid="main-menu">
      <div className="menu-bg">
        <div className="menu-content">
          <h1 className="game-title">
            <span className="title-bunny">Bunny</span>
            <span className="title-brawl">Brawl</span>
          </h1>
          <p className="tagline">Stomp your friends!</p>

          <div className="menu-buttons">
            <button className="menu-btn play-btn" onClick={handlePlay} data-testid="play-button">
              Play
            </button>
          </div>

          <div className="menu-settings">
            <label className="gore-toggle">
              <input
                type="checkbox"
                checked={matchSettings.goreMode}
                onChange={(e) => setMatchSettings({ goreMode: e.target.checked })}
                data-testid="gore-toggle"
              />
              <span>Blood mode</span>
            </label>
          </div>

          <div className="credits">
            <p>A Jump'n'Bump tribute</p>
            <p className="controls-hint">Up to 5 players — one keyboard!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
