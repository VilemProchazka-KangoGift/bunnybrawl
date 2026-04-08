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

// Expose transport instance for Match.tsx to use
let _activeTransport: Transport | null = null;
export function getActiveTransport(): Transport | null { return _activeTransport; }

export function OnlineLobby() {
  const { t, i18n } = useTranslation();
  const { setScreen, online, setOnline, matchSettings, setMatchSettings, setActivePlayers, resetOnline } = useGameStore();
  const transportRef = useRef<Transport | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [localCharacter, setLocalCharacter] = useState(CHARACTERS.P1.name);
  const localCharRef = useRef(localCharacter);
  localCharRef.current = localCharacter;
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

  const transitioningToMatch = useRef(false);

  useEffect(() => {
    return () => {
      // On unmount: destroy transport unless we're transitioning to match
      if (transportRef.current && !transitioningToMatch.current) {
        transportRef.current.destroy();
        transportRef.current = null;
        _activeTransport = null;
      }
    };
  }, []);

  const handleReliableMessage = useCallback((msg: ReliableMessage) => {
    switch (msg.type) {
      case MsgType.HANDSHAKE:
        // Peer connected, send our handshake back
        transportRef.current?.sendReliable({
          type: MsgType.HANDSHAKE,
          protocolVersion: PROTOCOL_VERSION,
          playerName: 'Player',
        });
        break;
      case MsgType.CHARACTER_SELECT: {
        setOnline({ remoteCharacterName: msg.characterName });
        // If opponent picked our character, switch to first available
        if (msg.characterName === localCharRef.current) {
          const available = allChars.find(c => c.name !== msg.characterName);
          if (available) {
            setLocalCharacter(available.name);
            transportRef.current?.sendReliable({
              type: MsgType.CHARACTER_SELECT,
              characterName: available.name,
            });
          }
        }
        break;
      }
      case MsgType.SETTINGS_SYNC: {
        // Guest receives host's settings
        setMatchSettings({
          arenaId: msg.arenaId,
          killLimit: msg.killLimit,
          timeLimit: msg.timeLimit,
          goreMode: msg.goreMode,
          botCount: msg.botCount,
          botDifficulty: msg.botDifficulty as 'easy' | 'medium' | 'hard' | 'impossible',
        });
        setOnline({ rngSeed: msg.rngSeed });
        break;
      }
      case MsgType.READY:
        setRemoteReady(true);
        break;
      case MsgType.START_MATCH:
        startMatch();
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOnline, setMatchSettings]);

  const setupTransport = useCallback(() => {
    const transport = new Transport({
      onStatusChange: (status: ConnectionStatus, error?: string) => {
        setOnline({ connectionStatus: status, connectionError: error ?? null });
        if (status === 'connected') {
          // Send handshake
          transport.sendReliable({
            type: MsgType.HANDSHAKE,
            protocolVersion: PROTOCOL_VERSION,
            playerName: 'Player',
          });
          // Send character selection
          transport.sendReliable({
            type: MsgType.CHARACTER_SELECT,
            characterName: localCharacter,
          });
          // Host sends settings
          if (transport.isHost) {
            const seed = Math.floor(Math.random() * 0xFFFFFFFF);
            setOnline({ rngSeed: seed });
            transport.sendReliable({
              type: MsgType.SETTINGS_SYNC,
              arenaId: matchSettings.arenaId,
              killLimit: matchSettings.killLimit,
              timeLimit: matchSettings.timeLimit,
              goreMode: matchSettings.goreMode,
              mods: matchSettings.mods as unknown as Record<string, boolean>,
              rngSeed: seed,
              botCount: matchSettings.botCount,
              botDifficulty: matchSettings.botDifficulty,
            });
          }
        }
      },
      onReliableMessage: handleReliableMessage,
      onUnreliableMessage: () => {}, // No input messages in lobby
      onRttUpdate: () => {},
    });
    transportRef.current = transport;
    _activeTransport = transport;
    return transport;
  }, [localCharacter, matchSettings, setOnline, handleReliableMessage]);

  const handleCreate = useCallback(async () => {
    audio.init();
    audio.play('select');
    const transport = setupTransport();
    setOnline({ isHost: true, isOnline: true });
    try {
      const code = await transport.createRoom();
      setOnline({ roomCode: code });
    } catch {
      // Error handled via onStatusChange
    }
  }, [setupTransport, setOnline]);

  const handleJoin = useCallback(async () => {
    if (joinCode.length < 4) return;
    audio.init();
    audio.play('select');
    const transport = setupTransport();
    setOnline({ isHost: false, isOnline: true });
    try {
      await transport.joinRoom(joinCode.toUpperCase());
    } catch {
      // Error handled via onStatusChange
    }
  }, [joinCode, setupTransport, setOnline]);

  const handleCharacterChange = useCallback((name: string) => {
    setLocalCharacter(name);
    audio.play('select');
    transportRef.current?.sendReliable({
      type: MsgType.CHARACTER_SELECT,
      characterName: name,
    });
  }, []);

  const handleReady = useCallback(() => {
    audio.play('select');
    setLocalReady(true);
    transportRef.current?.sendReliable({ type: MsgType.READY });
  }, []);

  const startMatch = useCallback(() => {
    // Set up player slots: host = P1, guest = P2
    const host = CHARACTERS.P1;
    const guest = CHARACTERS.P2;

    // Assign characters
    if (online.isHost) {
      host.name = localCharacter;
      const charDef = allChars.find(c => c.name === localCharacter);
      if (charDef) { host.color = charDef.color; host.darkColor = charDef.darkColor; host.lightColor = charDef.lightColor; }

      const remoteName = online.remoteCharacterName || 'Fox';
      guest.name = remoteName;
      const remoteCharDef = allChars.find(c => c.name === remoteName);
      if (remoteCharDef) { guest.color = remoteCharDef.color; guest.darkColor = remoteCharDef.darkColor; guest.lightColor = remoteCharDef.lightColor; }
    } else {
      guest.name = localCharacter;
      const charDef = allChars.find(c => c.name === localCharacter);
      if (charDef) { guest.color = charDef.color; guest.darkColor = charDef.darkColor; guest.lightColor = charDef.lightColor; }

      const remoteName = online.remoteCharacterName || 'Bunny';
      host.name = remoteName;
      const remoteCharDef = allChars.find(c => c.name === remoteName);
      if (remoteCharDef) { host.color = remoteCharDef.color; host.darkColor = remoteCharDef.darkColor; host.lightColor = remoteCharDef.lightColor; }
    }

    transitioningToMatch.current = true;
    setActivePlayers(['P1', 'P2']);
    setOnline({ isOnline: true });
    setScreen('match');
  }, [online.isHost, online.remoteCharacterName, localCharacter, allChars, setActivePlayers, setOnline, setScreen]);

  // When both ready and host, send START
  useEffect(() => {
    if (localReady && remoteReady && online.isHost) {
      transportRef.current?.sendReliable({ type: MsgType.START_MATCH });
      startMatch();
    }
  }, [localReady, remoteReady, online.isHost, startMatch]);

  // When guest receives START from host
  // (handled in handleReliableMessage)

  const handleBack = useCallback(() => {
    audio.play('select');
    cleanup();
    setScreen('menu');
  }, [cleanup, setScreen]);

  const isConnected = online.connectionStatus === 'connected';

  return (
    <div className="online-lobby">
      <h1 className="online-title">{t('online_play', 'Online Play')}</h1>

      {!online.isOnline && (
        <div className="online-actions">
          <button className="btn-base menu-btn online-create-btn" onClick={handleCreate}>
            {t('create_room', 'Create Room')}
          </button>
          <div className="online-join-row">
            <input
              className="online-code-input"
              type="text"
              maxLength={4}
              placeholder="CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleJoin(); }}
            />
            <button className="btn-base menu-btn" onClick={handleJoin} disabled={joinCode.length < 4}>
              {t('join_room', 'Join')}
            </button>
          </div>
        </div>
      )}

      {online.isOnline && (
        <div className="online-room-info">
          {online.roomCode && (
            <div className="online-room-code">
              <span className="online-label">{t('room_code', 'Room Code')}:</span>
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
            {isConnected && t('connected', 'Connected!')}
            {online.connectionStatus === 'error' && (
              <>
                <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
                <button className="btn-base menu-btn" style={{ marginTop: '12px', fontSize: '18px' }} onClick={() => {
                  cleanup();
                }}>
                  {t('try_again', 'Try Again')}
                </button>
              </>
            )}
            {online.connectionStatus === 'disconnected' && t('disconnected', 'Disconnected')}
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
                  {t('waiting_ready', 'Waiting for opponent to ready up...')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button className="btn-base online-back-btn" onClick={handleBack}>
        {t('back', 'Back')}
      </button>
    </div>
  );
}
