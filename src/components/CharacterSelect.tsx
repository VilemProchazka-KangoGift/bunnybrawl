import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS } from '../engine/characters';
import { KEY_BINDINGS } from '../engine/input';
import { audio } from '../engine/audio';
import type { CharacterSlot } from '../engine/types';
import './CharacterSelect.css';

const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4'];

export function CharacterSelect() {
  const { setScreen, setActivePlayers, matchSettings, setMatchSettings } = useGameStore();
  const [readyPlayers, setReadyPlayers] = useState<Set<CharacterSlot>>(new Set());

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    for (const slot of SLOTS) {
      const bindings = KEY_BINDINGS[slot];
      if (e.key === bindings.jump) {
        setReadyPlayers((prev) => {
          const next = new Set(prev);
          if (next.has(slot)) {
            next.delete(slot);
          } else {
            next.add(slot);
            audio.play('select');
          }
          return next;
        });
      }
    }

    // Escape goes back
    if (e.key === 'Escape') {
      setScreen('menu');
    }
  }, [setScreen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const canStart = readyPlayers.size >= 2;

  const handleStart = () => {
    if (!canStart) return;
    const players = SLOTS.filter((s) => readyPlayers.has(s));
    setActivePlayers(players);
    setMatchSettings({ playerCount: players.length });
    audio.play('select');
    setScreen('match');
  };

  return (
    <div className="char-select" data-testid="char-select">
      <h1 className="select-title">Choose Your Fighter!</h1>
      <p className="select-hint">Press your JUMP key to join/leave</p>

      <div className="player-slots">
        {SLOTS.map((slot) => {
          const char = CHARACTERS[slot];
          const ready = readyPlayers.has(slot);
          const bindings = KEY_BINDINGS[slot];

          return (
            <div
              key={slot}
              className={`player-slot ${ready ? 'ready' : 'waiting'}`}
              data-testid={`slot-${slot}`}
            >
              <div className="slot-header">{slot}</div>
              <div
                className="character-preview"
                style={{ backgroundColor: ready ? char.color : '#444' }}
              >
                <span className="char-name">{char.name}</span>
              </div>
              <div className="controls-info">
                <span>{bindings.left}/{bindings.right}/{bindings.jump}</span>
              </div>
              <div className={`ready-badge ${ready ? 'show' : ''}`}>
                READY!
              </div>
            </div>
          );
        })}
      </div>

      <div className="settings-row">
        <label>
          Kill Limit:
          <select
            value={matchSettings.killLimit}
            onChange={(e) => setMatchSettings({ killLimit: Number(e.target.value) })}
            data-testid="kill-limit"
          >
            {[5, 10, 15, 20, 25, 30].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Time Limit:
          <select
            value={matchSettings.timeLimit}
            onChange={(e) => setMatchSettings({ timeLimit: Number(e.target.value) })}
            data-testid="time-limit"
          >
            <option value={0}>Off</option>
            {[60, 120, 180, 240, 300].map((n) => (
              <option key={n} value={n}>{Math.floor(n / 60)} min</option>
            ))}
          </select>
        </label>
      </div>

      <div className="select-actions">
        <button className="back-btn" onClick={() => setScreen('menu')} data-testid="back-button">
          Back
        </button>
        <button
          className={`start-btn ${canStart ? 'enabled' : ''}`}
          onClick={handleStart}
          disabled={!canStart}
          data-testid="start-button"
        >
          {canStart ? 'Start Match!' : 'Need 2+ Players'}
        </button>
      </div>
    </div>
  );
}
