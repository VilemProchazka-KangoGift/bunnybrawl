import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { Transport } from '../engine/net/transport';
import type { ConnectionStatus } from '../engine/net/transport';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import type { ReliableMessage } from '../engine/net/protocol';
import './OnlineLobby.css';

// Expose transport instance for Match.tsx and CharacterSelect to use
let _activeTransport: Transport | null = null;
export function getActiveTransport(): Transport | null { return _activeTransport; }
export function clearActiveTransport(): void {
  if (_activeTransport) { _activeTransport.destroy(); _activeTransport = null; }
}

export function OnlineLobby() {
  const { t } = useTranslation();
  const { setScreen, online, setOnline, resetOnline } = useGameStore();
  const transportRef = useRef<Transport | null>(null);
  const transitioningToLobby = useRef(false);

  const cleanup = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
      _activeTransport = null;
    }
    resetOnline();
  }, [resetOnline]);

  const goToLobby = useCallback(() => {
    transitioningToLobby.current = true;
    setScreen('charSelect');
  }, [setScreen]);

  // Auto-start: create or join based on store state.
  // Single effect handles both setup and cleanup (React Strict Mode safe).
  useEffect(() => {
    audio.init();

    const handleMsg = (msg: ReliableMessage) => {
      if (msg.type === MsgType.SETTINGS_SYNC) {
        useGameStore.getState().setMatchSettings({
          arenaId: msg.arenaId,
          killLimit: msg.killLimit,
          timeLimit: msg.timeLimit,
          goreMode: msg.goreMode,
          botCount: msg.botCount,
          botDifficulty: msg.botDifficulty as 'easy' | 'medium' | 'hard' | 'impossible',
        });
        setOnline({ rngSeed: msg.rngSeed });
      }
    };

    const { isHost, joinCode } = useGameStore.getState().online;
    const ms = useGameStore.getState().matchSettings;

    const transport = new Transport({
      onStatusChange: (status: ConnectionStatus, error?: string) => {
        setOnline({ connectionStatus: status, connectionError: error ?? null });
        if (status === 'connected') {
          transport.sendReliable({
            type: MsgType.HANDSHAKE,
            protocolVersion: PROTOCOL_VERSION,
            playerName: 'Player',
          });
          if (transport.isHost) {
            const seed = Math.floor(Math.random() * 0xFFFFFFFF);
            setOnline({ rngSeed: seed });
            transport.sendReliable({
              type: MsgType.SETTINGS_SYNC,
              arenaId: ms.arenaId,
              killLimit: ms.killLimit,
              timeLimit: ms.timeLimit,
              goreMode: ms.goreMode,
              mods: ms.mods as unknown as Record<string, boolean>,
              rngSeed: seed,
              botCount: ms.botCount,
              botDifficulty: ms.botDifficulty,
            });
          }
          setTimeout(goToLobby, 300);
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
      transport.createRoom().then(code => {
        setOnline({ roomCode: code });
      }).catch(() => {});
    } else if (joinCode) {
      transport.joinRoom(joinCode).catch(() => {});
    }

    // No cleanup here — transport lifecycle managed by handleBack/goToLobby.
    // React Strict Mode double-invokes effects; destroying transport here
    // kills the WebSocket before PeerJS can connect.
    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = useCallback(() => {
    audio.play('select');
    cleanup();
    setScreen('menu');
  }, [cleanup, setScreen]);

  return (
    <div className="online-lobby">
      <h1 className="online-title">{t('online_play', 'Online Play')}</h1>

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
          {online.roomCode && online.connectionStatus !== 'connected' && online.connectionStatus !== 'error' && (
            t('waiting_opponent', 'Waiting for opponent...')
          )}
          {online.connectionStatus === 'joining' && t('joining_room', 'Joining room...')}
          {online.connectionStatus === 'connected' && t('entering_lobby', 'Entering lobby...')}
          {online.connectionStatus === 'error' && (
            <>
              <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
              <button className="btn-base menu-btn" style={{ marginTop: '12px', fontSize: '18px' }} onClick={() => cleanup()}>
                {t('try_again', 'Try Again')}
              </button>
            </>
          )}
        </div>
      </div>

      <button className="btn-base online-back-btn" onClick={handleBack}>
        {t('back', 'Back')}
      </button>
    </div>
  );
}
