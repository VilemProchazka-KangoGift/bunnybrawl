import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { Transport } from '../engine/net/transport';
import type { ConnectionStatus } from '../engine/net/transport';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import type { ReliableMessage } from '../engine/net/protocol';
import { CHARACTERS, getAllCharacters, getCharacterEmoji, getCharacterDisplayName } from '../engine/characters';
import './OnlineLobby.css';

let _activeTransport: Transport | null = null;
export function getActiveTransport(): Transport | null { return _activeTransport; }

export function OnlineLobby() {
  const { t, i18n } = useTranslation();
  const { setScreen, online, setOnline, resetOnline, setActivePlayers } = useGameStore();
  const transportRef = useRef<Transport | null>(null);
  const [localCharacter, setLocalCharacter] = useState(
    online.isHost ? CHARACTERS.P1.name : CHARACTERS.P2.name
  );
  const localCharRef = useRef(localCharacter);
  localCharRef.current = localCharacter;
  const remoteCharRef = useRef<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const allChars = getAllCharacters();

  const cleanup = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
      _activeTransport = null;
    }
    resetOnline();
  }, [resetOnline]);

  const startMatch = useCallback(() => {
    const myChar = localCharRef.current;
    const theirChar = remoteCharRef.current || online.remoteCharacterName || (online.isHost ? 'Fox' : 'Bunny');
    const p1Name = online.isHost ? myChar : theirChar;
    const p2Name = online.isHost ? theirChar : myChar;
    const p1Def = allChars.find(c => c.name === p1Name);
    const p2Def = allChars.find(c => c.name === p2Name);
    if (p1Def) {
      CHARACTERS.P1.name = p1Def.name; CHARACTERS.P1.color = p1Def.color;
      CHARACTERS.P1.darkColor = p1Def.darkColor; CHARACTERS.P1.lightColor = p1Def.lightColor;
    }
    if (p2Def) {
      CHARACTERS.P2.name = p2Def.name; CHARACTERS.P2.color = p2Def.color;
      CHARACTERS.P2.darkColor = p2Def.darkColor; CHARACTERS.P2.lightColor = p2Def.lightColor;
    }
    setActivePlayers(['P1', 'P2']);
    setOnline({ isOnline: true });
    setScreen('match');
  }, [online.isHost, online.remoteCharacterName, allChars, setActivePlayers, setOnline, setScreen]);

  // Auto-start transport on mount
  useEffect(() => {
    audio.init();
    const { isHost, joinCode } = useGameStore.getState().online;
    const ms = useGameStore.getState().matchSettings;

    const handleMsg = (msg: ReliableMessage) => {
      switch (msg.type) {
        case MsgType.CHARACTER_SELECT:
          remoteCharRef.current = msg.characterName;
          setOnline({ remoteCharacterName: msg.characterName });
          break;
        case MsgType.SETTINGS_SYNC:
          useGameStore.getState().setMatchSettings({
            arenaId: msg.arenaId, killLimit: msg.killLimit, timeLimit: msg.timeLimit,
            goreMode: msg.goreMode, botCount: msg.botCount,
            botDifficulty: msg.botDifficulty as 'easy' | 'medium' | 'hard' | 'impossible',
          });
          setOnline({ rngSeed: msg.rngSeed });
          break;
        case MsgType.READY:
          setRemoteReady(true);
          break;
        case MsgType.START_MATCH:
          // Guest receives start — trigger match via ref-based startMatch
          startMatchRef.current?.();
          break;
      }
    };

    const transport = new Transport({
      onStatusChange: (status: ConnectionStatus, error?: string) => {
        setOnline({ connectionStatus: status, connectionError: error ?? null });
        if (status === 'connected') {
          transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: 'Player' });
          transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: localCharRef.current });
          if (transport.isHost) {
            const seed = Math.floor(Math.random() * 0xFFFFFFFF);
            setOnline({ rngSeed: seed });
            transport.sendReliable({
              type: MsgType.SETTINGS_SYNC, arenaId: ms.arenaId, killLimit: ms.killLimit,
              timeLimit: ms.timeLimit, goreMode: ms.goreMode,
              mods: ms.mods as unknown as Record<string, boolean>,
              rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
            });
          }
        }
      },
      onReliableMessage: handleMsg,
      onUnreliableMessage: () => {},
      onRttUpdate: () => {},
    });
    transportRef.current = transport;
    _activeTransport = transport;

    setOnline({ isOnline: true });
    if (isHost) {
      transport.createRoom().then(code => setOnline({ roomCode: code })).catch(() => {});
    } else if (joinCode) {
      transport.joinRoom(joinCode).catch(() => {});
    }

    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref to latest startMatch for use in message handler
  const startMatchRef = useRef(startMatch);
  startMatchRef.current = startMatch;

  // Host: when both ready, send START and begin match
  useEffect(() => {
    if (localReady && remoteReady && online.isHost) {
      transportRef.current?.sendReliable({ type: MsgType.START_MATCH } as ReliableMessage);
      startMatch();
    }
  }, [localReady, remoteReady, online.isHost, startMatch]);

  const handleCharacterChange = useCallback((name: string) => {
    setLocalCharacter(name);
    audio.play('select');
    transportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: name });
  }, []);

  const handleReady = useCallback(() => {
    audio.play('select');
    setLocalReady(true);
    transportRef.current?.sendReliable({ type: MsgType.READY } as ReliableMessage);
  }, []);

  const handleBack = useCallback(() => {
    audio.play('select');
    cleanup();
    setScreen('menu');
  }, [cleanup, setScreen]);

  const isConnected = online.connectionStatus === 'connected';

  return (
    <div className="online-lobby">
      <h1 className="online-title">{t('online_play', 'Online Play')}</h1>

      <div className="online-room-info">
        {online.roomCode && (
          <div className="online-room-code">
            <span className="online-label">{t('room_code', 'Room Code')}</span>
            <span className="online-code">{online.roomCode}</span>
          </div>
        )}

        <div className="online-status">
          {(online.connectionStatus === 'idle' || online.connectionStatus === 'creating') && !online.roomCode && (
            t('connecting_server', 'Connecting to server...')
          )}
          {online.roomCode && !isConnected && online.connectionStatus !== 'error' && (
            t('waiting_opponent', 'Waiting for opponent...')
          )}
          {online.connectionStatus === 'joining' && t('joining_room', 'Joining room...')}
          {online.connectionStatus === 'error' && (
            <>
              <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
              <button className="btn-base menu-btn" style={{ marginTop: '12px', fontSize: '18px' }} onClick={cleanup}>
                {t('try_again', 'Try Again')}
              </button>
            </>
          )}
        </div>

        {isConnected && (
          <div className="online-characters">
            <div className="online-player-card">
              <span className="online-label">{t('you', 'You')}:</span>
              <select
                className="online-char-select"
                value={localCharacter}
                onChange={(e) => handleCharacterChange(e.target.value)}
                disabled={localReady}
              >
                {allChars
                  .filter(c => c.name !== online.remoteCharacterName)
                  .map(c => (
                  <option key={c.name} value={c.name}>
                    {getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
            <div className="online-player-card">
              <span className="online-label">{t('opponent', 'Opponent')}:</span>
              <span className="online-char-name">
                {online.remoteCharacterName
                  ? `${getCharacterEmoji(online.remoteCharacterName)} ${getCharacterDisplayName(online.remoteCharacterName, i18n.language)}`
                  : t('choosing', 'Choosing...')}
              </span>
              {remoteReady && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
            </div>

            {!localReady ? (
              <button className="btn-base menu-btn play-btn" onClick={handleReady}>
                {t('ready_up', 'Ready!')}
              </button>
            ) : (
              <div className="online-waiting-start">
                {online.isHost
                  ? t('waiting_ready', 'Waiting for opponent to ready up...')
                  : t('waiting_host_start', 'Waiting for host to start...')}
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-base online-back-btn" onClick={handleBack}>
        {t('back', 'Back')}
      </button>
    </div>
  );
}
