import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS } from '../engine/characters';
import type { CharacterSlot } from '../engine/types';
import './VictoryScreen.css';

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export function VictoryScreen() {
  const { t } = useTranslation();
  const { winner, lastMatchState, setScreen, setActivePlayers } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Fireworks background effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = 1280;
    canvas.height = 720;

    const particles: FireworkParticle[] = [];
    let lastSpawn = 0;
    const SPAWN_INTERVAL = 400;
    const COLORS = ['#FF4444', '#44FF44', '#4488FF', '#FFD700', '#FF69B4', '#44FFFF', '#FF8844', '#AA44FF'];

    function spawnBurst(time: number) {
      const bx = 100 + Math.random() * 1080;
      const by = 80 + Math.random() * 400;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const count = 20 + Math.floor(Math.random() * 15);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 60 + Math.random() * 120;
        particles.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0 + Math.random() * 0.5,
          maxLife: 1.0 + Math.random() * 0.5,
          color,
          size: 2 + Math.random() * 2,
        });
      }
      lastSpawn = time;
    }

    let rafId = 0;
    let lastTime = 0;

    function animate(time: number) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;

      ctx.clearRect(0, 0, 1280, 720);

      // Spawn new bursts
      if (time - lastSpawn > SPAWN_INTERVAL) {
        spawnBurst(time);
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += 80 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;

        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Keyboard shortcuts: Enter = rematch, Escape = menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRematch();
      } else if (e.key === 'Escape') {
        handleMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Get stats for a player if available
  const getPlayerStats = (playerId: CharacterSlot) => {
    if (!lastMatchState) return null;
    const stats = (lastMatchState as any).stats;
    if (!stats || !stats.perPlayer) return null;
    return stats.perPlayer.get(playerId) ?? null;
  };

  return (
    <div className="victory-screen" data-testid="victory-screen">
      <canvas ref={canvasRef} className="fireworks-canvas" />
      <div className="victory-bg">
        <div className="victory-content">
          {winnerChar ? (
            <>
              <h1 className="winner-text">
                <span style={{ color: winnerChar.color }}>{winnerChar.name}</span> {t('victory_wins')}
              </h1>
              <div
                className="winner-avatar"
                style={{ backgroundColor: winnerChar.color, borderColor: winnerChar.lightColor }}
              />
            </>
          ) : (
            <h1 className="winner-text">{t('victory_draw')}</h1>
          )}

          <div className="scoreboard">
            <h2>{t('victory_results')}</h2>
            {sortedPlayers.map((player, idx) => (
              <div key={player.id} className={`score-row ${idx === 0 ? 'first' : ''}`}>
                <span className="rank">#{idx + 1}</span>
                <span
                  className="player-name"
                  style={{ color: player.character.color }}
                >
                  {player.character.name}
                </span>
                <span className="player-score">{player.score} {t('victory_pts')}</span>
              </div>
            ))}
          </div>

          {/* Per-player stats section */}
          {sortedPlayers.length > 0 && (
            <div className="player-stats-section">
              <h2>{t('victory_stats')}</h2>
              <div className="stats-grid">
                <div className="stats-header">
                  <span className="stats-cell stats-name-cell">{t('victory_player')}</span>
                  <span className="stats-cell">{t('victory_streak')}</span>
                  <span className="stats-cell">{t('victory_airborne')}</span>
                  <span className="stats-cell">{t('victory_distance')}</span>
                  <span className="stats-cell">{t('victory_carrots')}</span>
                </div>
                {sortedPlayers.map((player) => {
                  const ps = getPlayerStats(player.id);
                  return (
                    <div key={player.id} className="stats-row">
                      <span className="stats-cell stats-name-cell" style={{ color: player.character.color }}>
                        {player.character.name}
                      </span>
                      <span className="stats-cell">{ps?.bestStreak ?? 0}</span>
                      <span className="stats-cell">{ps ? (ps.timeAirborne).toFixed(1) + 's' : '0.0s'}</span>
                      <span className="stats-cell">{ps ? Math.floor(ps.distanceTraveled / 100) : 0}</span>
                      <span className="stats-cell">{ps?.carrotsEaten ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="match-stats">
            <span>{t('victory_match_time')}: {formatTime(lastMatchState?.timeElapsed ?? 0)}</span>
            <span>{t('victory_total_splats')}: {lastMatchState?.splatMarks.length ?? 0}</span>
          </div>

          <div className="victory-actions">
            <button className="rematch-btn" onClick={handleRematch} data-testid="rematch-button">
              {t('victory_rematch')}
            </button>
            <button className="menu-btn-v" onClick={handleMenu} data-testid="menu-button">
              {t('victory_menu')}
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
