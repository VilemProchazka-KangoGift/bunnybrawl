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
  const { setScreen, online, setOnline, matchSettings, resetOnline } = useGameStore();
  const transportRef = useRef<Transport | null>(null);
  const transitioningToLobby = useRef(false);
  const startedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
      _activeTransport = null;
    }
    resetOnline();
  }, [resetOnline]);

  useEffect(() => {
    return () => {
      if (transportRef.current && !transitioningToLobby.current) {
        transportRef.current.destroy();
        transportRef.current = null;
        _activeTransport = null;
      }
    };
  }, []);

  const goToLobby = useCallback(() => {
    transitioningToLobby.current = true;
    setScreen('charSelect');
  }, [setScreen]);

  const handleReliableMessage = useCallback((msg: ReliableMessage) => {
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
  }, [setOnline]);

  const setupTransport = useCallback(() => {
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
          setTimeout(goToLobby, 300);
        }
      },
      onReliableMessage: handleReliableMessage,
      onUnreliableMessage: () => {},
      onRttUpdate: () => {},
    });
    transportRef.current = transport;
    _activeTransport = transport;
    return transport;
  }, [matchSettings, setOnline, handleReliableMessage, goToLobby]);

  // Auto-start: create or join based on store state
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    audio.init();

    const transport = setupTransport();

    if (online.isHost) {
      setOnline({ isOnline: true });
      transport.createRoom().then(code => {
        setOnline({ roomCode: code });
      }).catch(() => {});
    } else if (online.joinCode) {
      setOnline({ isOnline: true });
      transport.joinRoom(online.joinCode).catch(() => {});
    }
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
