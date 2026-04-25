import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import type { PlayerSlot, PlayerStats } from '../engine/types';
import { isBotSlot } from '../engine/types';
import { getCharacterEmoji, getCharacterDisplayName } from '../engine/characters';
import { ArenaGrid } from './ArenaGrid';
import { getModalTransport, clearModalTransport } from './OnlineModal';
import { MsgType } from '../engine/net/protocol';
import type { ReliableMessage } from '../engine/net/protocol';
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
  const { t, i18n } = useTranslation();
  const { winner, lastMatchState, setScreen, setActivePlayers, setMatchSettings, online, disconnectWin } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showArenaSelect, setShowArenaSelect] = useState(false);
  const [peerConnected, setPeerConnected] = useState(true);

  const winnerChar = winner ? lastMatchState?.players.find(p => p.id === winner)?.character ?? null : null;
  const players = lastMatchState?.players.filter(p => p.active) ?? [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const charName = (name: string, slot?: PlayerSlot) => {
    if (slot && online.isOnline && !isBotSlot(slot)) {
      const custom = online.playerNames[slot];
      if (custom) return custom;
    }
    return getCharacterDisplayName(name, i18n.language);
  };
  const botSuffix = (id: PlayerSlot) => isBotSlot(id) ? ' (BOT)' : '';

  const handleRematch = useCallback(() => {
    // Host sends rematch signal to guest
    if (online.isOnline && online.isHost) {
      const transport = getModalTransport();
      if (transport) {
        transport.sendReliable({ type: MsgType.START_MATCH } as ReliableMessage); // START_MATCH
      }
    }
    setScreen('match');
  }, [online.isOnline, online.isHost, setScreen]);

  const handleMenu = useCallback(() => {
    const transport = getModalTransport();
    if (transport) {
      transport.destroy();
      clearModalTransport();
    }
    useGameStore.getState().resetOnline();
    setActivePlayers([]);
    setScreen('menu');
  }, [setActivePlayers, setScreen]);
  const handleChooseArena = useCallback((arenaId: string) => {
    setMatchSettings({ arenaId });
    setShowArenaSelect(false);
    // Host sends arena change + start to guest
    if (online.isOnline && online.isHost) {
      const transport = getModalTransport();
      if (transport) {
        transport.sendReliable({ type: MsgType.SETTINGS_SYNC, arenaId } as ReliableMessage); // SETTINGS_SYNC (arena only)
        transport.sendReliable({ type: MsgType.START_MATCH } as ReliableMessage); // START_MATCH
      }
    }
    setScreen('match');
  }, [setMatchSettings, online.isOnline, online.isHost, setScreen]);

  // Online: listen for disconnect + rematch signals
  useEffect(() => {
    if (!online.isOnline) return;
    const transport = getModalTransport();
    if (!transport) return;
    transport.setEvents({
      onStatusChange: (status) => {
        if (status === 'disconnected' || status === 'error') {
          setPeerConnected(false);
          if (!online.isHost) {
            transport.destroy();
            clearModalTransport();
            useGameStore.getState().resetOnline();
            setActivePlayers([]);
            setScreen('menu');
          }
        }
      },
      onReliableMessage: (msg) => {
        if (msg.type === MsgType.SETTINGS_SYNC && 'arenaId' in msg) {
          setMatchSettings({ arenaId: msg.arenaId });
        }
        if (msg.type === MsgType.START_MATCH) {
          setScreen('match');
        }
        if (msg.type === MsgType.DISCONNECT) {
          setPeerConnected(false);
        }
      },
      onUnreliableMessage: () => {},
      onRttUpdate: () => {},
      onPeerDisconnected: () => {
        setPeerConnected(false);
      },
    });
  }, [online.isOnline, online.isHost, setScreen, setMatchSettings, setActivePlayers]);

  // Fireworks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const particles: FireworkParticle[] = [];
    let lastSpawn = 0;
    const COLORS = ['#FF4444', '#44FF44', '#4488FF', '#FFD700', '#FF69B4', '#44FFFF', '#FF8844', '#AA44FF'];

    function spawnBurst(time: number) {
      const bx = 100 + Math.random() * 1080;
      const by = 80 + Math.random() * 400;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const count = 20 + Math.floor(Math.random() * 15);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 60 + Math.random() * 120;
        particles.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0 + Math.random() * 0.5, maxLife: 1.0 + Math.random() * 0.5, color, size: 2 + Math.random() * 2 });
      }
      lastSpawn = time;
    }

    let rafId = 0;
    let lastTime = 0;
    function animate(time: number) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (time - lastSpawn > 400) spawnBurst(time);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
        p.vy += 80 * dt;
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

  // Keyboard: Enter=rematch (host only in online), Escape=menu (or close arena select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showArenaSelect) setShowArenaSelect(false);
        else handleMenu();
      } else if (e.key === 'Enter' && !showArenaSelect) {
        // In online mode, only host can rematch
        if (online.isOnline && !online.isHost) return;
        handleRematch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showArenaSelect, handleMenu, handleRematch, online.isOnline, online.isHost]);

  const getPlayerStats = (playerId: PlayerSlot): PlayerStats | null => {
    if (!lastMatchState) return null;
    const stats = lastMatchState.stats;
    if (!stats || !stats.perPlayer) return null;
    return stats.perPlayer.get(playerId) ?? null;
  };

  const mvpHighlights = useMemo(() => {
    const highlights: Array<{ label: string; icon: string; rawName: string; playerName: string; playerColor: string; value: string }> = [];
    if (!sortedPlayers.length) return highlights;

    let bestAirborne = { name: '', color: '', slot: '' as PlayerSlot, val: 0 };
    let bestCarrots = { name: '', color: '', slot: '' as PlayerSlot, val: 0 };
    let bestStreak = { name: '', color: '', slot: '' as PlayerSlot, val: 0 };

    for (const player of sortedPlayers) {
      const ps = getPlayerStats(player.id);
      if (!ps) continue;
      if (ps.timeAirborne > bestAirborne.val) bestAirborne = { name: player.character.name, color: player.character.color, slot: player.id, val: ps.timeAirborne };
      if (ps.carrotsEaten > bestCarrots.val) bestCarrots = { name: player.character.name, color: player.character.color, slot: player.id, val: ps.carrotsEaten };
      if (ps.bestStreak > bestStreak.val) bestStreak = { name: player.character.name, color: player.character.color, slot: player.id, val: ps.bestStreak };
    }

    if (bestAirborne.val > 0) highlights.push({ label: t('mvp_most_airborne'), icon: '\u2708', rawName: bestAirborne.name, playerName: charName(bestAirborne.name, bestAirborne.slot), playerColor: bestAirborne.color, value: bestAirborne.val.toFixed(1) + 's' });
    if (bestCarrots.val > 0) highlights.push({ label: t('mvp_carrot_king'), icon: '\uD83E\uDD55', rawName: bestCarrots.name, playerName: charName(bestCarrots.name, bestCarrots.slot), playerColor: bestCarrots.color, value: String(bestCarrots.val) });
    if (bestStreak.val > 0) highlights.push({ label: t('mvp_serial_killer'), icon: '\uD83D\uDD25', rawName: bestStreak.name, playerName: charName(bestStreak.name, bestStreak.slot), playerColor: bestStreak.color, value: String(bestStreak.val) + ' ' + t('mvp_streak') });

    return highlights;
  }, [sortedPlayers, lastMatchState, t, online.isOnline, online.playerNames]);

  return (
    <div className="victory-screen" data-testid="victory-screen">
      <canvas ref={canvasRef} className="fireworks-canvas" />
      <div className="victory-bg">
        <div className="victory-content">
          {disconnectWin && (
            <p className="disconnect-info" data-testid="disconnect-info" style={{ color: '#FF6B6B', fontSize: '18px', margin: '0 0 8px' }}>
              {t('game_ended_disconnect', 'Game ended — a player disconnected.')}
            </p>
          )}
          {winnerChar ? (
            <>
              <h1 className="winner-text">
                <span style={{ color: winnerChar.color }}>{charName(winnerChar.name, winner!)}{botSuffix(winner!)}</span> {t('victory_wins')}
              </h1>
              <div className="winner-avatar winner-avatar-pose" style={{ borderColor: winnerChar.lightColor }}>
                <span className="winner-emoji">{getCharacterEmoji(winnerChar.name)}</span>
              </div>
            </>
          ) : (
            <h1 className="winner-text">{t('victory_draw')}</h1>
          )}

          <div className="victory-columns">
            <div className="victory-col-left">
              <div className="scoreboard">
                <h2>{t('victory_results')}</h2>
                {sortedPlayers.map((player, idx) => (
                  <div key={player.id} className={`score-row ${idx === 0 ? 'first' : ''}`}>
                    <span className="rank">#{idx + 1}</span>
                    <span className="row-emoji">{getCharacterEmoji(player.character.name)}</span>
                    <span className="player-name" style={{ color: player.character.color }}>
                      {charName(player.character.name, player.id)}{botSuffix(player.id)}
                    </span>
                    <span className="player-score">{player.score} {t('victory_pts')}</span>
                  </div>
                ))}
              </div>

              <div className="match-stats">
                <span>{t('victory_match_time')}: {formatTime(lastMatchState?.timeElapsed ?? 0)}</span>
                <span>{t('victory_total_splats')}: {lastMatchState?.killFeed.length ?? 0}</span>
              </div>
            </div>

            <div className="victory-col-right">
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
                            <span className="row-emoji">{getCharacterEmoji(player.character.name)}</span>{charName(player.character.name, player.id)}
                          </span>
                          <span className="stats-cell">{ps?.bestStreak ?? 0}</span>
                          <span className="stats-cell">{ps ? ps.timeAirborne.toFixed(1) + 's' : '0.0s'}</span>
                          <span className="stats-cell">{ps ? Math.floor(ps.distanceTraveled / 100) : 0}</span>
                          <span className="stats-cell">{ps?.carrotsEaten ?? 0}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {mvpHighlights.length > 0 && (
                <div className="mvp-highlights">
                  <h2>{t('mvp_title')}</h2>
                  {mvpHighlights.map((hl, idx) => (
                    <div key={idx} className="mvp-row">
                      <span className="mvp-icon">{hl.icon}</span>
                      <span className="mvp-label">{hl.label}</span>
                      <span className="mvp-player" style={{ color: hl.playerColor }}><span className="row-emoji">{getCharacterEmoji(hl.rawName)}</span>{hl.playerName}</span>
                      <span className="mvp-value">{hl.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {online.isOnline && online.isHost && !peerConnected && !disconnectWin && (
            <p className="disconnect-info" style={{ color: '#FFB400', fontSize: '16px', margin: '0 0 8px', textAlign: 'center' }}>
              {t('opponent_left', 'Opponent left the game.')}
            </p>
          )}
          <div className="victory-actions">
            {!disconnectWin && (!online.isOnline || online.isHost) && peerConnected && (
              <button className="btn-base rematch-btn" onClick={handleRematch} data-testid="rematch-button">{t('victory_rematch')}</button>
            )}
            {!disconnectWin && (!online.isOnline || online.isHost) && peerConnected && (
              <button className="btn-base arena-btn-v" data-testid="change-arena-button" onClick={() => setShowArenaSelect(true)}>{t('victory_choose_arena')}</button>
            )}
            <button className="btn-base menu-btn-v" onClick={handleMenu} data-testid="menu-button">{t(disconnectWin || (online.isOnline && !online.isHost) ? 'leave_game' : 'victory_menu')}</button>
          </div>

          {showArenaSelect && (
            <div className="victory-arena-overlay" onClick={() => setShowArenaSelect(false)}>
              <div className="victory-arena-modal" data-testid="arena-select-modal" onClick={e => e.stopPropagation()}>
                <h2 className="victory-arena-title">{t('victory_choose_arena')}</h2>
                <div className="victory-arena-grid">
                  <ArenaGrid
                    classPrefix="victory-arena"
                    onSelect={handleChooseArena}
                  />
                </div>
                <button className="btn-base menu-btn-v" onClick={() => setShowArenaSelect(false)}>
                  {t('pause_back')}
                </button>
              </div>
            </div>
          )}
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
