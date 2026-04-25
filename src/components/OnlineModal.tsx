// Online multiplayer lobby modal — host/join room, character select, ready-up.
// Network/protocol logic lives in useOnlineRoom; this file is UI only.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { isTouchPrimary } from '../engine/touchDetect';
import { MobileTextInput } from './MobileTextInput';
import { getAllCharacters, getCharacterEmoji, getCharacterDisplayName } from '../engine/characters';
import { ALL_BOT_SLOTS } from '../engine/types';
import { useOnlineRoom } from './useOnlineRoom';
import { ROOM_CODE_LENGTH } from '../engine/net/transport';

type ConnectingStage = 'initial' | 'searching' | 'check' | 'slow';
const CONNECTING_STAGE_KEYS: Record<ConnectingStage, string> = {
  initial: 'connecting_server',
  searching: 'connecting_searching',
  check: 'connecting_check_code',
  slow: 'connecting_slow',
};
const CONNECTING_STAGE_TIMINGS: Array<{ at: number; key: ConnectingStage }> = [
  { at: 3000,  key: 'searching' },
  { at: 8000,  key: 'check' },
  { at: 15000, key: 'slow' },
];

export { getModalTransport, clearModalTransport, clearReclaimTokens, tearDownOnlineSession, getHostReclaimTokens, getGuestOwnReclaimToken, resolveRandomArena, PLAYER_NAME_MAX_LENGTH } from './useOnlineRoom';
import { PLAYER_NAME_MAX_LENGTH } from './useOnlineRoom';

interface OnlineModalProps {
  onClose: () => void;
}

export function OnlineModal({ onClose }: OnlineModalProps) {
  const { t, i18n } = useTranslation();
  const { matchSettings, online } = useGameStore();

  const {
    step, setStep,
    localChar, handleCharChange,
    playerName, setPlayerName,
    localReady, markLocalReady,
    remoteReady,
    connect, cleanup, startMatchAsHost,
    autoSwitchNotice,
  } = useOnlineRoom({ onMatchStart: onClose });

  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [mobileNameOpen, setMobileNameOpen] = useState(false);
  const [mobileCodeOpen, setMobileCodeOpen] = useState(false);

  // Guest-only staged messaging: MQTT → signaling → WebRTC can take 10-20s
  // on cold start. Staged copy reassures the user that work is happening.
  const [connectingStage, setConnectingStage] = useState<ConnectingStage>('initial');
  useEffect(() => {
    setConnectingStage('initial');
    if (step !== 'connecting' || online.isHost) return;
    const timers = CONNECTING_STAGE_TIMINGS.map(s => setTimeout(() => setConnectingStage(s.key), s.at));
    return () => timers.forEach(clearTimeout);
  }, [step, online.isHost]);

  const allChars = getAllCharacters();

  return (
    <>
      <div className="mods-overlay" onClick={() => { if (step === 'choose') { onClose(); setJoinMode(false); } }}>
        <div className="mods-modal online-modal" onClick={e => e.stopPropagation()}>
          <h2 className="mods-title">{t('online_play', 'Online Play')}</h2>

          {autoSwitchNotice && (
            <div
              className="online-auto-switch-notice"
              data-testid="online-auto-switch-notice"
              role="status"
              aria-live="polite"
            >
              {t('char_auto_switched', '{{prev}} was taken — you\'re {{next}}', {
                prev: getCharacterDisplayName(autoSwitchNotice.prev, i18n.language),
                next: getCharacterDisplayName(autoSwitchNotice.next, i18n.language),
              })}
            </div>
          )}

          {/* Step 1: Choose create or join */}
          {step === 'choose' && !joinMode && (
            <div className="online-step">
              <div className="online-section">
                <span className="online-section-title">{t('your_name', 'Your name')}</span>
                {isTouchPrimary() ? (
                  <button className={`online-code-input online-name-input online-name-tap${playerName ? '' : ' placeholder'}`} data-testid="online-name-input"
                    onClick={() => setMobileNameOpen(true)}>
                    {playerName || t('tap_to_enter_name', 'Tap to enter name...')}
                  </button>
                ) : (
                  <input className="online-code-input online-name-input" data-testid="online-name-input" type="text" maxLength={PLAYER_NAME_MAX_LENGTH}
                    value={playerName} autoFocus
                    onChange={(e) => {
                      const v = e.target.value.replace(/[\p{C}]/gu, '').slice(0, 16);
                      setPlayerName(v);
                    }}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                )}
              </div>
              {matchSettings.botCount > 0 && <p className="online-info">{(() => {
                const n = matchSettings.botCount;
                if (i18n.language === 'cs') {
                  if (n === 1) return t('online_bots_info_one');
                  if (n >= 2 && n <= 4) return t('online_bots_info_few', { count: n });
                  return t('online_bots_info_other', { count: n });
                }
                return t('online_bots_info', { count: n });
              })()}</p>}
              {playerName.trim() && (<>
              <button className="btn-base menu-btn online-create-btn" data-testid="online-create-btn" onClick={() => { audio.play('select'); audio.init(); connect(true); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                {t('create_room', 'Create Room')}
              </button>
              <div className="online-divider">
                <span className="online-divider-line" />
                <span className="online-or">{t('or', 'or')}</span>
                <span className="online-divider-line" />
              </div>
              <button className="btn-base menu-btn" data-testid="online-join-btn" onClick={() => { audio.play('select'); setJoinMode(true); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                {t('join_room_full', 'Join Room')}
              </button>
              </>)}
              <button className="btn-base mods-close-btn" onClick={onClose}>{t('back', 'Back')}</button>
            </div>
          )}

          {/* Step 1b: Enter join code */}
          {step === 'choose' && joinMode && (
            <div className="online-step">
              <p className="online-join-label">{t('enter_room_code', 'Enter the room code:')}</p>
              {isTouchPrimary() ? (
                <button className={`online-code-input online-name-tap${joinCode ? '' : ' placeholder'}`} data-testid="online-code-input"
                  onClick={() => setMobileCodeOpen(true)}>
                  {joinCode || t('code_placeholder', 'Code')}
                </button>
              ) : (
                <input className="online-code-input" data-testid="online-code-input" type="text" maxLength={ROOM_CODE_LENGTH} placeholder={t('code_placeholder', 'Code')}
                  value={joinCode} autoFocus
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); if (joinCode.length >= ROOM_CODE_LENGTH) { audio.play('select'); audio.init(); connect(false, joinCode); } } }}
                />
              )}
              <button className={`btn-base menu-btn online-create-btn${joinCode.length >= ROOM_CODE_LENGTH ? ' play-btn' : ''}`} data-testid="online-join-submit" disabled={joinCode.length < ROOM_CODE_LENGTH}
                onClick={() => { audio.play('select'); audio.init(); connect(false, joinCode); }}>
                {t('join_room', 'Join')}
              </button>
              <button className="btn-base mods-close-btn" onClick={() => setJoinMode(false)}>{t('back', 'Back')}</button>
            </div>
          )}

          {/* Step 2: Connecting — room code, character select, waiting */}
          {step === 'connecting' && (() => {
            const errorBlock = online.connectionStatus === 'error' && (
              <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
            );
            return (
            <div className="online-step">
              {online.roomCode && (
                <div className="online-room-code">
                  <span className="online-code-label">{t('room_code', 'Room Code')}</span>
                  <span className="online-code" data-testid="online-room-code">{online.roomCode}</span>
                </div>
              )}

              {online.isHost ? (
                <div className="online-lobby-columns">
                  <div className="online-lobby-left">
                    <div className="online-section">
                      <span className="online-section-title">{t('your_character', 'Your character')}</span>
                      <select className="online-char-select" value={localChar}
                        onChange={(e) => handleCharChange(e.target.value)}>
                        {(() => {
                          const takenNames = new Set(online.remotePlayers.map(rp => rp.characterName));
                          return allChars.map(c => <option key={c.name} value={c.name} disabled={takenNames.has(c.name)}>{getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}{takenNames.has(c.name) ? ` (${t('taken', 'taken')})` : ''}</option>);
                        })()}
                      </select>
                    </div>
                    <div className="online-status-box">
                      {!online.roomCode && online.connectionStatus !== 'error' && t('connecting_server', 'Connecting to server...')}
                      {online.roomCode && t('waiting_players', 'Waiting for players to join...')}
                      {errorBlock}
                    </div>
                    <button className="btn-base mods-close-btn" onClick={() => { cleanup(); setStep('choose'); }}>
                      {t('back', 'Back')}
                    </button>
                  </div>
                  <div className="online-lobby-right">
                    <div className="online-section">
                      <span className="online-section-title">{t('players', 'Players')}</span>
                      <div className="online-player-list">
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(localChar)} {playerName}</span>
                          <span className="online-host-badge">{t('host', 'HOST')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="online-status-box">
                    {online.connectionStatus !== 'error' && t(CONNECTING_STAGE_KEYS[connectingStage], { code: joinCode })}
                    {errorBlock}
                  </div>
                  <button className="btn-base mods-close-btn" onClick={() => { cleanup(); setStep('choose'); }}>
                    {t('back', 'Back')}
                  </button>
                </>
              )}
            </div>
            );
          })()}

          {/* Step 3: Lobby — both connected */}
          {step === 'lobby' && (
            <div className="online-step">
              {online.roomCode && (
                <div className="online-room-code online-room-code-small">
                  <span className="online-code-label">{t('room_code', 'Room Code')}</span>
                  <span className="online-code">{online.roomCode}</span>
                </div>
              )}

              <div className="online-lobby-columns">
                <div className="online-lobby-left">
                  <div className="online-section">
                    <span className="online-section-title">{t('your_character', 'Your character')}</span>
                    <select className="online-char-select" value={localChar} disabled={localReady}
                      onChange={(e) => handleCharChange(e.target.value)}>
                      {(() => {
                        const takenNames = new Set(online.remotePlayers.map(rp => rp.characterName));
                        return allChars.map(c => (
                          <option key={c.name} value={c.name} disabled={takenNames.has(c.name)}>
                            {getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}{takenNames.has(c.name) ? ` (${t('taken', 'taken')})` : ''}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  {/* Guest: ready button or ready badge */}
                  {!online.isHost && !localReady && (
                    <button className="btn-base menu-btn play-btn" data-testid="online-ready-btn" onClick={() => {
                      audio.play('select');
                      markLocalReady();
                    }}>{t('ready_up', 'Ready!')}</button>
                  )}
                  {!online.isHost && localReady && (
                    <div className="online-ready-status"><span className="online-ready-badge">{t('ready', 'READY')}</span></div>
                  )}

                  {/* Host: "waiting to ready up" hint + Start button. Host
                      can still force-start; the hint just explains the wait. */}
                  {online.isHost && online.remotePlayers.length > 0 && !online.remotePlayers.some(rp => rp.ready) && (
                    <div className="online-status-box online-status-box--ready-hint" data-testid="waiting-ready-hint">
                      {t('waiting_ready', 'Waiting for opponent to ready up...')}
                    </div>
                  )}
                  {online.isHost && (
                    <button className="btn-base menu-btn play-btn" data-testid="online-start-btn" onClick={() => {
                      audio.play('select');
                      startMatchAsHost();
                    }}>{t('start_game', 'Start Game!')}</button>
                  )}

                  <button className="btn-base mods-close-btn" onClick={cleanup}>{t('back', 'Back')}</button>
                </div>

                <div className="online-lobby-right">
                  <div className="online-section">
                    <span className="online-section-title">{t('players', 'Players')}</span>
                    <div className="online-player-list">
                      {/* Host always first */}
                      {online.isHost ? (
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(localChar)} {playerName}</span>
                          <span className="online-host-badge">{t('host', 'HOST')}</span>
                        </div>
                      ) : (
                        <div className="online-player-row">
                          <span className="online-char-name">
                            {(() => {
                              const hostPlayer = online.remotePlayers.find(rp => rp.slot === 'P1');
                              return hostPlayer
                                ? `${getCharacterEmoji(hostPlayer.characterName)} ${online.playerNames['P1'] || getCharacterDisplayName(hostPlayer.characterName, i18n.language)}`
                                : t('choosing', 'Choosing...');
                            })()}
                          </span>
                          <span className="online-host-badge">{t('host', 'HOST')}</span>
                          {remoteReady && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
                        </div>
                      )}
                      {/* Guest: local player */}
                      {!online.isHost && (
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(localChar)} {playerName}</span>
                        </div>
                      )}
                      {/* Other remote players (multi-guest, excluding host already shown above) */}
                      {online.remotePlayers.filter(rp => online.isHost || rp.slot !== 'P1').map(rp => (
                        <div className="online-player-row" key={rp.slot}>
                          <span className="online-char-name">
                            {getCharacterEmoji(rp.characterName)} {rp.playerName || getCharacterDisplayName(rp.characterName, i18n.language)}
                          </span>
                          {rp.ready && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
                        </div>
                      ))}
                      {matchSettings.botCount > 0 && ALL_BOT_SLOTS.slice(0, matchSettings.botCount).map(slot => (
                        <div className="online-player-row online-bot-row" key={slot}>
                          <span className="online-char-name">🤖 {t('bot_label', 'Bot')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Spectating — joined while match in progress */}
          {step === 'spectating' && (
            <div className="online-step">
              <div className="online-status-box online-status-box--spectating">
                <p className="online-spectating-title">{t('match_in_progress', 'Match in progress')}</p>
                <p className="online-spectating-hint">{t('spectating_hint', "You'll join when the current match ends.")}</p>
              </div>
              <button className="btn-base mods-close-btn" onClick={cleanup}>{t('back', 'Back')}</button>
            </div>
          )}
        </div>
      </div>
      {mobileNameOpen && (
        <MobileTextInput
          value={playerName}
          maxLength={PLAYER_NAME_MAX_LENGTH}
          label={t('your_name', 'Your name')}
          onConfirm={(v) => {
            setPlayerName(v);
            setMobileNameOpen(false);
          }}
          onCancel={() => setMobileNameOpen(false)}
        />
      )}
      {mobileCodeOpen && (
        <MobileTextInput
          value={joinCode}
          maxLength={ROOM_CODE_LENGTH}
          label={t('enter_room_code', 'Enter the room code')}
          onConfirm={(v) => {
            const code = v.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, ROOM_CODE_LENGTH);
            setJoinCode(code);
            setMobileCodeOpen(false);
            if (code.length >= ROOM_CODE_LENGTH) { audio.play('select'); audio.init(); connect(false, code); }
          }}
          onCancel={() => setMobileCodeOpen(false)}
        />
      )}
    </>
  );
}
