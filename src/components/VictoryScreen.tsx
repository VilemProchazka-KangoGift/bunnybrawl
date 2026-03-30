import { useGameStore } from '../store/gameStore';
import { CHARACTERS } from '../engine/characters';
import './VictoryScreen.css';

export function VictoryScreen() {
  const { winner, lastMatchState, setScreen, setActivePlayers } = useGameStore();

  const winnerChar = winner ? CHARACTERS[winner] : null;
  const players = lastMatchState?.players.filter(p => p.active) ?? [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const handleRematch = () => {
    setScreen('match');
  };

  const handleMenu = () => {
    setActivePlayers([]);
    setScreen('menu');
  };

  return (
    <div className="victory-screen" data-testid="victory-screen">
      <div className="victory-bg">
        <div className="victory-content">
          {winnerChar ? (
            <>
              <h1 className="winner-text">
                <span style={{ color: winnerChar.color }}>{winnerChar.name}</span> Wins!
              </h1>
              <div
                className="winner-avatar"
                style={{ backgroundColor: winnerChar.color, borderColor: winnerChar.lightColor }}
              />
            </>
          ) : (
            <h1 className="winner-text">It's a Draw!</h1>
          )}

          <div className="scoreboard">
            <h2>Final Scores</h2>
            {sortedPlayers.map((player, idx) => (
              <div key={player.id} className={`score-row ${idx === 0 ? 'first' : ''}`}>
                <span className="rank">#{idx + 1}</span>
                <span
                  className="player-name"
                  style={{ color: player.character.color }}
                >
                  {player.character.name}
                </span>
                <span className="player-score">{player.score} kills</span>
              </div>
            ))}
          </div>

          <div className="match-stats">
            <span>Match time: {formatTime(lastMatchState?.timeElapsed ?? 0)}</span>
            <span>Total splats: {lastMatchState?.splatMarks.length ?? 0}</span>
          </div>

          <div className="victory-actions">
            <button className="rematch-btn" onClick={handleRematch} data-testid="rematch-button">
              Rematch!
            </button>
            <button className="menu-btn-v" onClick={handleMenu} data-testid="menu-button">
              Main Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
