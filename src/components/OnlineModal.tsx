// Online multiplayer lobby modal — host/join room, character select, ready-up.
// Owns the Trystero Transport for the whole menu→lobby→match lifecycle; Match.tsx
// and VictoryScreen pick it up via getModalTransport().

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore, type RemotePlayerInfo } from '../store/gameStore';
import { audio } from '../engine/audio';
import { isTouchPrimary } from '../engine/touchDetect';
import { MobileTextInput } from './MobileTextInput';
import { Transport } from '../engine/net/transport';
import type { ConnectionStatus } from '../engine/net/transport';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import type { ReliableMessage, HandshakeMessage, SlotAssignmentMessage, StartMatchMessage, PlayerJoinedMessage, PlayerLeftMessage } from '../engine/net/protocol';
import { CHARACTERS, BOT_CHARACTERS, getAllCharacters, getCharacterEmoji, getCharacterDisplayName, assignBotCharacters } from '../engine/characters';
import { ALL_BOT_SLOTS, isBotSlot } from '../engine/types';
import { listArenaPacks } from '../engine/arenas';
import type { BotSlot, CharacterSlot, PlayerSlot } from '../engine/types';

/** Resolve 'random' arenaId to a concrete ID so both peers use the same arena. */
function resolveRandomArena(arenaId: string): string {
  if (arenaId !== 'random') return arenaId;
  const all = listArenaPacks();
  return all[Math.floor(Math.random() * all.length)]?.id ?? 'meadow';
}

// Module-scope transport reference picked up by Match.tsx / VictoryScreen.tsx
// once the match starts. Assigned by onlineConnect, cleared by onlineCleanup.
let _modalTransport: Transport | null = null;
export function getModalTransport(): Transport | null { return _modalTransport; }

interface OnlineModalProps {
  onClose: () => void;
}

export function OnlineModal({ onClose }: OnlineModalProps) {
  const { t, i18n } = useTranslation();
  const { setScreen, matchSettings, setActivePlayers, setOnline, resetOnline, online } = useGameStore();

  const [onlineJoinMode, setOnlineJoinMode] = useState(false);
  const [onlineJoinCode, setOnlineJoinCode] = useState('');
  const [onlineStep, setOnlineStep] = useState<'choose' | 'connecting' | 'lobby' | 'spectating'>('choose');
  const [onlineLocalChar, setOnlineLocalChar] = useState(() =>
    localStorage.getItem('carrotroyale_online_char') || CHARACTERS.P1.name
  );
  const onlineLocalCharRef = useRef(CHARACTERS.P1.name);
  onlineLocalCharRef.current = onlineLocalChar;
  const [onlinePlayerName, setOnlinePlayerName] = useState(() =>
    localStorage.getItem('carrotroyale_player_name') || ''
  );
  const onlinePlayerNameRef = useRef('');
  onlinePlayerNameRef.current = onlinePlayerName;
  const [mobileNameOpen, setMobileNameOpen] = useState(false);
  const [mobileCodeOpen, setMobileCodeOpen] = useState(false);
  const [onlineRemoteReady, setOnlineRemoteReady] = useState(false);
  const [onlineLocalReady, setOnlineLocalReady] = useState(false);
  const onlineTransportRef = useRef<Transport | null>(null);
  const receivedRosterRef = useRef<Array<{ slot: string; characterName: string; playerName?: string }> | null>(null);
  // Buffer for player names received via HANDSHAKE before the peer is in remotePlayers
  const pendingPlayerNames = useRef<Map<string, string>>(new Map());

  const allChars = getAllCharacters();

  // If local character conflicts with a remote player, the GUEST auto-switches once.
  // Host never auto-switches (authoritative). One-shot flag prevents cascade.
  const didAutoSwitch = useRef(false);
  useEffect(() => {
    if (online.isHost) return; // host is authoritative — never auto-switch
    const takenNames = new Set<string>();
    for (const rp of online.remotePlayers) takenNames.add(rp.characterName);

    if (!takenNames.has(onlineLocalChar)) return;
    if (didAutoSwitch.current) return;
    didAutoSwitch.current = true;

    const alt = allChars.find(c => !takenNames.has(c.name) && c.name !== onlineLocalChar);
    if (alt) {
      setOnlineLocalChar(alt.name);
      onlineLocalCharRef.current = alt.name;
      onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: alt.name });
    }
  }, [online.isHost, online.remotePlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  const onlineCleanup = useCallback(() => {
    if (onlineTransportRef.current) {
      onlineTransportRef.current.destroy();
      onlineTransportRef.current = null;
      _modalTransport = null;
    }
    resetOnline();
    setOnlineStep('choose');
    setOnlineJoinMode(false);
    setOnlineJoinCode('');
    setOnlineLocalReady(false);
    setOnlineRemoteReady(false);
    pendingPlayerNames.current.clear();
    didAutoSwitch.current = false;
  }, [resetOnline]);

  const onlineStartMatch = useCallback(() => {
    const store = useGameStore.getState();
    const mySlot = store.online.isHost ? 'P1' : (store.online.localSlot || 'P2');

    // Build playerNames map — start from store, overlay own name + remote names
    const names: Record<string, string> = { ...store.online.playerNames, [mySlot]: onlinePlayerNameRef.current };
    for (const rp of store.online.remotePlayers) {
      if (rp.playerName) names[rp.slot] = rp.playerName;
    }

    // If host sent an authoritative roster, apply it directly (no local computation)
    const roster = receivedRosterRef.current;
    if (roster && roster.length > 0) {
      for (const entry of roster) {
        if (entry.playerName && !isBotSlot(entry.slot as PlayerSlot)) names[entry.slot] = entry.playerName;
      }

      // Apply all character definitions from roster
      for (const entry of roster) {
        const def = allChars.find(c => c.name === entry.characterName);
        const isBot = isBotSlot(entry.slot as PlayerSlot);
        if (isBot) {
          if (def) BOT_CHARACTERS.set(entry.slot as BotSlot, { ...def, slot: entry.slot as BotSlot });
        } else {
          const charSlot = (CHARACTERS as Record<string, typeof CHARACTERS.P1>)[entry.slot];
          if (def && charSlot) {
            charSlot.name = def.name; charSlot.color = def.color;
            charSlot.darkColor = def.darkColor; charSlot.lightColor = def.lightColor;
          }
        }
      }
      const humanSlots = [...new Set(roster.filter(r => !isBotSlot(r.slot as PlayerSlot)).map(r => r.slot as CharacterSlot))];
      const botSlots = [...new Set(roster.filter(r => isBotSlot(r.slot as PlayerSlot)).map(r => r.slot as BotSlot))];
      setActivePlayers([...humanSlots, ...botSlots]);
      receivedRosterRef.current = null;
    } else {
      // Host path (or legacy): compute roster locally, filtering to connected peers only
      const connectedPeers = new Set(onlineTransportRef.current?.getPeerIds() ?? []);
      const myChar = onlineLocalCharRef.current;
      const humanSlots: string[] = [mySlot];
      const slotCharMap = new Map<string, string>();
      slotCharMap.set(mySlot, myChar);

      for (const rp of store.online.remotePlayers) {
        if (!humanSlots.includes(rp.slot) && connectedPeers.has(rp.peerId)) {
          humanSlots.push(rp.slot);
        }
        if (connectedPeers.has(rp.peerId)) slotCharMap.set(rp.slot, rp.characterName);
      }

      for (const [slot, charName] of slotCharMap) {
        const def = allChars.find(c => c.name === charName);
        const charSlot = (CHARACTERS as Record<string, typeof CHARACTERS.P1>)[slot];
        if (def && charSlot) {
          charSlot.name = def.name; charSlot.color = def.color;
          charSlot.darkColor = def.darkColor; charSlot.lightColor = def.lightColor;
        }
      }

      const ms = store.matchSettings;
      const botSlots = ALL_BOT_SLOTS.slice(0, ms.botCount);
      const rngSeed = store.online.rngSeed;
      assignBotCharacters(humanSlots as CharacterSlot[], botSlots, rngSeed, Array.from(slotCharMap.values()));
      setActivePlayers([...humanSlots as CharacterSlot[], ...botSlots]);
    }

    setOnline({ isOnline: true, localSlot: mySlot as PlayerSlot, playerNames: names });
    onClose();
    setScreen('match');
  }, [allChars, setActivePlayers, setOnline, setScreen, onClose]);

  const onlineStartMatchRef = useRef(onlineStartMatch);
  onlineStartMatchRef.current = onlineStartMatch;

  const handleOnlineCharChange = useCallback((value: string) => {
    setOnlineLocalChar(value);
    onlineLocalCharRef.current = value;
    localStorage.setItem('carrotroyale_online_char', value);
    onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: value });
  }, []);

  const onlineConnect = useCallback((isHost: boolean, joinCode?: string) => {
    // Clean up any previous transport (e.g. retrying after error)
    if (onlineTransportRef.current) {
      onlineTransportRef.current.destroy();
      onlineTransportRef.current = null;
      _modalTransport = null;
    }
    audio.init();
    setOnlineStep('connecting');
    setOnline({ isHost, isOnline: true, roomCode: null, connectionStatus: 'idle', connectionError: null });

    const ms = matchSettings;
    const peerSlotMap = new Map<string, string>(); // peerId → PlayerSlot
    const freedSlots: string[] = []; // slots returned by disconnected peers
    let nextSlotIdx = 2;
    const allocateSlot = (): string => {
      if (freedSlots.length > 0) return freedSlots.shift()!;
      return `P${nextSlotIdx++}`;
    };

    const transport = new Transport({
      onStatusChange: (status: ConnectionStatus, error?: string) => {
        setOnline({ connectionStatus: status, connectionError: error ?? null });
        if (status === 'disconnected') {
          setOnline({ remotePlayers: [] });
          setOnlineRemoteReady(false);
          setOnlineStep('connecting');
        }
        if (status === 'connected') {
          if (!isHost) {
            // Guest: connected to host
            setOnlineStep('lobby');
            transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: onlinePlayerNameRef.current });
            transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: onlineLocalCharRef.current });
          }
        }
      },
      onPeerConnected: (peerId: string) => {
        if (isHost) {
          // Purge stale entries — peers that are no longer connected
          const connectedNow = new Set(transport.getPeerIds());
          connectedNow.add(peerId); // new peer is connected but may not be in getPeerIds() yet
          let currentPlayers = useGameStore.getState().online.remotePlayers;
          const stale = currentPlayers.filter(rp => !connectedNow.has(rp.peerId));
          if (stale.length > 0) {
            for (const s of stale) {
              const oldSlot = peerSlotMap.get(s.peerId);
              if (oldSlot) { freedSlots.push(oldSlot); peerSlotMap.delete(s.peerId); }
            }
            currentPlayers = currentPlayers.filter(rp => connectedNow.has(rp.peerId));
          }

          const slot = allocateSlot() as PlayerSlot;
          peerSlotMap.set(peerId, slot);
          const newPeer = { peerId, slot: slot as PlayerSlot, characterName: CHARACTERS.P2.name, playerName: '', ready: false };

          // Check if match is in progress — late joiner becomes spectator
          const currentScreen = useGameStore.getState().screen;
          if (currentScreen === 'match' || currentScreen === 'victory') {
            transport.sendReliableTo(peerId, {
              type: MsgType.MATCH_IN_PROGRESS,
              snapshot: null, // spectator snapshot not yet implemented
            } as ReliableMessage);
            transport.sendReliableTo(peerId, {
              type: MsgType.SLOT_ASSIGNMENT,
              slot,
              allPlayers: [],
            } as ReliableMessage);
            setOnline({ remotePlayers: [...currentPlayers, newPeer] });
            return;
          }

          // Normal lobby join — send slot assignment + settings
          transport.sendReliableTo(peerId, {
            type: MsgType.SLOT_ASSIGNMENT,
            slot,
            allPlayers: [
              { slot: 'P1', characterName: onlineLocalCharRef.current, isHost: true, playerName: onlinePlayerNameRef.current },
              ...currentPlayers.map(rp => ({
                slot: rp.slot as string, characterName: rp.characterName, isHost: false, playerName: rp.playerName,
              })),
            ],
          } as ReliableMessage);

          const seed = useGameStore.getState().online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
          const resolvedArenaId = resolveRandomArena(ms.arenaId);
          transport.sendReliableTo(peerId, {
            type: MsgType.SETTINGS_SYNC, arenaId: resolvedArenaId, killLimit: ms.killLimit,
            timeLimit: ms.timeLimit, goreMode: ms.goreMode,
            mods: ms.mods,
            rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
          } as ReliableMessage);
          transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: onlinePlayerNameRef.current });
          transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: onlineLocalCharRef.current });

          // Notify existing guests about the new player (exclude the new peer itself)
          for (const pid of transport.getPeerIds()) {
            if (pid !== peerId) {
              transport.sendReliableTo(pid, {
                type: MsgType.PLAYER_JOINED, peerId, slot,
                characterName: CHARACTERS.P2.name, playerName: '',
              } as ReliableMessage);
            }
          }

          // Add peer to remotePlayers and persist rng seed in single setOnline
          setOnline({
            remotePlayers: [...currentPlayers, newPeer],
            rngSeed: seed,
          });

          setOnlineStep('lobby');
        }
      },
      onPeerDisconnected: (peerId: string) => {
        const slot = peerSlotMap.get(peerId);
        peerSlotMap.delete(peerId);
        if (isHost) {
          if (slot) freedSlots.push(slot);
          const current = useGameStore.getState().online.remotePlayers;
          const remaining = current.filter(rp => rp.peerId !== peerId);
          setOnline({ remotePlayers: remaining });
          if (slot) {
            transport.sendReliable({ type: MsgType.PLAYER_LEFT, slot, reason: 'disconnect' } as ReliableMessage);
          }
          if (remaining.length === 0) {
            setOnlineRemoteReady(false);
            setOnlineStep('connecting');
          }
        } else {
          // Guest: host disconnected
          setOnline({ remotePlayers: [] });
          setOnlineRemoteReady(false);
          setOnlineStep('connecting');
        }
      },
      onReliableMessage: (msg: ReliableMessage, fromPeerId?: string) => {
        if (msg.type === MsgType.HANDSHAKE) {
          const hsMsg = msg as HandshakeMessage;
          if (isHost && fromPeerId) {
            pendingPlayerNames.current.set(fromPeerId, hsMsg.playerName);
            const { remotePlayers, playerNames } = useGameStore.getState().online;
            const slot = peerSlotMap.get(fromPeerId);
            const names = { ...playerNames };
            if (slot) names[slot] = hsMsg.playerName;
            const rp = remotePlayers.find(r => r.peerId === fromPeerId);
            setOnline({
              remotePlayers: remotePlayers.map(r => r.peerId === fromPeerId ? { ...r, playerName: hsMsg.playerName } : r),
              playerNames: names,
            });
            // Notify other guests about this player's name
            if (slot && rp) {
              for (const pid of transport.getPeerIds()) {
                if (pid !== fromPeerId) {
                  transport.sendReliableTo(pid, {
                    type: MsgType.PLAYER_JOINED, peerId: fromPeerId, slot,
                    characterName: rp.characterName, playerName: hsMsg.playerName,
                  } as ReliableMessage);
                }
              }
            }
          } else if (!isHost) {
            setOnline({ playerNames: { ...useGameStore.getState().online.playerNames, P1: hsMsg.playerName } });
          }
        } else if (msg.type === MsgType.CHARACTER_SELECT) {
          if (isHost && fromPeerId) {
            // Host: update the specific guest's character
            const slot = peerSlotMap.get(fromPeerId);
            if (slot) {
              const current = useGameStore.getState().online.remotePlayers;
              const idx = current.findIndex(rp => rp.peerId === fromPeerId);
              if (idx >= 0) {
                const updated = current.map((rp, i) => i === idx ? { ...rp, characterName: msg.characterName } : rp);
                setOnline({ remotePlayers: updated });
              } else {
                const bufferedName = pendingPlayerNames.current.get(fromPeerId) || '';
                setOnline({
                  remotePlayers: [...current, { peerId: fromPeerId, slot: slot as PlayerSlot, characterName: msg.characterName, playerName: bufferedName, ready: false }],
                });
              }

              // Forward to other guests (exclude the sender to prevent echo loop)
              for (const pid of transport.getPeerIds()) {
                if (pid !== fromPeerId) {
                  transport.sendReliableTo(pid, msg);
                }
              }
            }
          } else if (!isHost) {
            // Guest: received character update (from host or relayed)
            const current = useGameStore.getState().online.remotePlayers;
            const idx = current.findIndex(rp => rp.slot === 'P1'); // host is always P1
            if (idx >= 0) {
              const updated = current.map((rp, i) => i === idx ? { ...rp, characterName: msg.characterName } : rp);
              setOnline({ remotePlayers: updated });
            }
            // No placeholder creation — SLOT_ASSIGNMENT populates remotePlayers
          }
        } else if (msg.type === MsgType.SLOT_ASSIGNMENT) {
          // Guest: received my slot assignment from host
          const slotMsg = msg as SlotAssignmentMessage;
          const names: Record<string, string> = {};
          const newRemotePlayers: RemotePlayerInfo[] = [];
          for (const p of slotMsg.allPlayers) {
            if (p.playerName) names[p.slot] = p.playerName;
            newRemotePlayers.push({
              peerId: '', slot: p.slot as PlayerSlot,
              characterName: p.characterName, playerName: p.playerName || '', ready: false,
            });
          }
          setOnline({ localSlot: slotMsg.slot as PlayerSlot, playerNames: names, remotePlayers: newRemotePlayers });
        } else if (msg.type === MsgType.SETTINGS_SYNC) {
          useGameStore.getState().setMatchSettings({
            arenaId: msg.arenaId, killLimit: msg.killLimit, timeLimit: msg.timeLimit,
            goreMode: msg.goreMode, botCount: msg.botCount,
            botDifficulty: msg.botDifficulty as 'easy' | 'medium' | 'hard' | 'impossible',
            mods: msg.mods,
          });
          setOnline({ rngSeed: msg.rngSeed });
        } else if (msg.type === MsgType.READY) {
          if (isHost && fromPeerId) {
            const current = useGameStore.getState().online.remotePlayers;
            setOnline({
              remotePlayers: current.map(rp => rp.peerId === fromPeerId ? { ...rp, ready: true } : rp),
            });
          }
          setOnlineRemoteReady(true);
        } else if (msg.type === MsgType.START_MATCH) {
          const startMsg = msg as StartMatchMessage;
          receivedRosterRef.current = startMsg.roster ?? null;
          onlineStartMatchRef.current();
        } else if (msg.type === MsgType.PLAYER_JOINED) {
          const pj = msg as PlayerJoinedMessage;
          const current = useGameStore.getState().online.remotePlayers;
          const names = pj.playerName ? { ...useGameStore.getState().online.playerNames, [pj.slot]: pj.playerName } : undefined;
          const existing = current.find(rp => rp.slot === pj.slot);
          const updatedPlayers = existing
            ? current.map(rp => rp.slot === pj.slot ? { ...rp, characterName: pj.characterName, playerName: pj.playerName || rp.playerName } : rp)
            : [...current, { peerId: pj.peerId, slot: pj.slot as PlayerSlot, characterName: pj.characterName, playerName: pj.playerName || '', ready: false }];
          setOnline({ remotePlayers: updatedPlayers, ...(names && { playerNames: names }) });
        } else if (msg.type === MsgType.PLAYER_LEFT) {
          const pl = msg as PlayerLeftMessage;
          const current = useGameStore.getState().online.remotePlayers;
          setOnline({ remotePlayers: current.filter(rp => rp.slot !== pl.slot) });
        } else if (msg.type === MsgType.MATCH_IN_PROGRESS) {
          // Guest: match is running, enter spectator/waiting state
          setOnlineStep('spectating');
        } else if (msg.type === MsgType.MATCH_RESULT) {
          // Guest spectator: match ended, transition to lobby for next match
          setOnlineStep('lobby');
        }
      },
      onUnreliableMessage: () => {},
      onRttUpdate: () => {},
    });
    onlineTransportRef.current = transport;
    _modalTransport = transport;

    if (isHost) {
      transport.createRoom().then(code => setOnline({ roomCode: code })).catch((err) => {
        setOnline({ connectionStatus: 'error', connectionError: err?.message || t('connection_error') });
      });
    } else if (joinCode) {
      transport.joinRoom(joinCode).catch((err) => {
        setOnline({ connectionStatus: 'error', connectionError: err?.message || t('connection_error') });
      });
    }
  }, [matchSettings, setOnline, t]);

  return (
    <>
      <div className="mods-overlay" onClick={() => { if (onlineStep === 'choose') { onClose(); setOnlineJoinMode(false); } }}>
        <div className="mods-modal online-modal" onClick={e => e.stopPropagation()}>
          <h2 className="mods-title">{t('online_play', 'Online Play')}</h2>

          {/* Step 1: Choose create or join */}
          {onlineStep === 'choose' && !onlineJoinMode && (
            <div className="online-step">
              <div className="online-section">
                <span className="online-section-title">{t('your_name', 'Your name')}</span>
                {isTouchPrimary() ? (
                  <button className={`online-code-input online-name-input online-name-tap${onlinePlayerName ? '' : ' placeholder'}`} data-testid="online-name-input"
                    onClick={() => setMobileNameOpen(true)}>
                    {onlinePlayerName || t('tap_to_enter_name', 'Tap to enter name...')}
                  </button>
                ) : (
                  <input className="online-code-input online-name-input" data-testid="online-name-input" type="text" maxLength={16}
                    value={onlinePlayerName} autoFocus
                    onChange={(e) => {
                      const v = e.target.value.replace(/[\p{C}]/gu, '').slice(0, 16);
                      setOnlinePlayerName(v);
                      try { localStorage.setItem('carrotroyale_player_name', v); } catch {}
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
              {onlinePlayerName.trim() && (<>
              <button className="btn-base menu-btn online-create-btn" data-testid="online-create-btn" onClick={() => { audio.play('select'); onlineConnect(true); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                {t('create_room', 'Create Room')}
              </button>
              <div className="online-divider">
                <span className="online-divider-line" />
                <span className="online-or">{t('or', 'or')}</span>
                <span className="online-divider-line" />
              </div>
              <button className="btn-base menu-btn" data-testid="online-join-btn" onClick={() => { audio.play('select'); setOnlineJoinMode(true); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                {t('join_room_full', 'Join Room')}
              </button>
              </>)}
              <button className="btn-base mods-close-btn" onClick={onClose}>{t('back', 'Back')}</button>
            </div>
          )}

          {/* Step 1b: Enter join code */}
          {onlineStep === 'choose' && onlineJoinMode && (
            <div className="online-step">
              <p className="online-join-label">{t('enter_room_code', 'Enter the room code:')}</p>
              {isTouchPrimary() ? (
                <button className={`online-code-input online-name-tap${onlineJoinCode ? '' : ' placeholder'}`} data-testid="online-code-input"
                  onClick={() => setMobileCodeOpen(true)}>
                  {onlineJoinCode || t('code_placeholder', 'Code')}
                </button>
              ) : (
                <input className="online-code-input" data-testid="online-code-input" type="text" maxLength={3} placeholder={t('code_placeholder', 'Code')}
                  value={onlineJoinCode} autoFocus
                  onChange={(e) => setOnlineJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); if (onlineJoinCode.length >= 3) { audio.play('select'); onlineConnect(false, onlineJoinCode); } } }}
                />
              )}
              <button className={`btn-base menu-btn online-create-btn${onlineJoinCode.length >= 3 ? ' play-btn' : ''}`} data-testid="online-join-submit" disabled={onlineJoinCode.length < 3}
                onClick={() => { audio.play('select'); onlineConnect(false, onlineJoinCode); }}>
                {t('join_room', 'Join')}
              </button>
              <button className="btn-base mods-close-btn" onClick={() => setOnlineJoinMode(false)}>{t('back', 'Back')}</button>
            </div>
          )}

          {/* Step 2: Connecting — room code, character select, waiting */}
          {onlineStep === 'connecting' && (
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
                      <select className="online-char-select" value={onlineLocalChar}
                        onChange={(e) => handleOnlineCharChange(e.target.value)}>
                        {(() => {
                          const takenNames = new Set(online.remotePlayers.map(rp => rp.characterName));
                          return allChars.map(c => <option key={c.name} value={c.name} disabled={takenNames.has(c.name)}>{getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}{takenNames.has(c.name) ? ` (${t('taken', 'taken')})` : ''}</option>);
                        })()}
                      </select>
                    </div>
                    <div className="online-status-box">
                      {!online.roomCode && online.connectionStatus !== 'error' && t('connecting_server', 'Connecting to server...')}
                      {online.roomCode && t('waiting_players', 'Waiting for players to join...')}
                      {online.connectionStatus === 'error' && (
                        <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
                      )}
                    </div>
                    <button className="btn-base mods-close-btn" onClick={() => { onlineCleanup(); setOnlineStep('choose'); }}>
                      {t('back', 'Back')}
                    </button>
                  </div>
                  <div className="online-lobby-right">
                    <div className="online-section">
                      <span className="online-section-title">{t('players', 'Players')}</span>
                      <div className="online-player-list">
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(onlineLocalChar)} {onlinePlayerName}</span>
                          <span className="online-host-badge">{t('host', 'HOST')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="online-status-box">
                    {!online.roomCode && online.connectionStatus !== 'error' && t('connecting_server', 'Connecting to server...')}
                    {online.connectionStatus === 'error' && (
                      <span className="online-error">{online.connectionError || t('connection_error', 'Connection failed')}</span>
                    )}
                  </div>
                  <button className="btn-base mods-close-btn" onClick={() => { onlineCleanup(); setOnlineStep('choose'); }}>
                    {t('back', 'Back')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Lobby — both connected */}
          {onlineStep === 'lobby' && (
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
                    <select className="online-char-select" value={onlineLocalChar} disabled={onlineLocalReady}
                      onChange={(e) => handleOnlineCharChange(e.target.value)}>
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
                  {!online.isHost && !onlineLocalReady && (
                    <button className="btn-base menu-btn play-btn" data-testid="online-ready-btn" onClick={() => {
                      audio.play('select'); setOnlineLocalReady(true);
                      onlineTransportRef.current?.sendReliable({ type: MsgType.READY } as ReliableMessage);
                    }}>{t('ready_up', 'Ready!')}</button>
                  )}
                  {!online.isHost && onlineLocalReady && (
                    <div className="online-ready-status"><span className="online-ready-badge">{t('ready', 'READY')}</span></div>
                  )}

                  {/* Host: start button */}
                  {online.isHost && (
                    <button className="btn-base menu-btn play-btn" data-testid="online-start-btn" onClick={() => {
                      audio.play('select');
                      const state = useGameStore.getState();
                  const ms = state.matchSettings;
                  const seed = state.online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
                  setOnline({ rngSeed: seed });

                  // Build roster: host + connected guests + bots
                  const connectedPeerIds = new Set(onlineTransportRef.current?.getPeerIds() ?? []);
                  const rosterEntries: Array<{ slot: string; characterName: string; playerName?: string }> = [
                    { slot: 'P1', characterName: onlineLocalCharRef.current, playerName: onlinePlayerNameRef.current },
                  ];
                  const seenSlots = new Set(rosterEntries.map(r => r.slot));
                  for (const rp of state.online.remotePlayers) {
                    if (!seenSlots.has(rp.slot) && connectedPeerIds.has(rp.peerId)) {
                      seenSlots.add(rp.slot);
                      rosterEntries.push({ slot: rp.slot, characterName: rp.characterName, playerName: rp.playerName });
                    }
                  }
                  // Assign bots on host side
                  const humanNames = rosterEntries.map(r => r.characterName);
                  const humanSlots = rosterEntries.map(r => r.slot);
                  const botSlots = ALL_BOT_SLOTS.slice(0, ms.botCount);
                  assignBotCharacters(humanSlots as CharacterSlot[], botSlots, seed, humanNames);
                  // Add bots to roster for guests
                  for (const bSlot of botSlots) {
                    const botChar = BOT_CHARACTERS.get(bSlot);
                    if (botChar) rosterEntries.push({ slot: bSlot, characterName: botChar.name });
                  }

                  const resolvedArena = resolveRandomArena(ms.arenaId);
                  // Update host's own settings so Match.tsx uses the resolved arena
                  if (resolvedArena !== ms.arenaId) {
                    useGameStore.getState().setMatchSettings({ arenaId: resolvedArena });
                  }
                  onlineTransportRef.current?.sendReliable({
                    type: MsgType.SETTINGS_SYNC, arenaId: resolvedArena, killLimit: ms.killLimit,
                    timeLimit: ms.timeLimit, goreMode: ms.goreMode,
                    mods: ms.mods,
                    rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
                  } as ReliableMessage);
                  onlineTransportRef.current?.sendReliable({
                    type: MsgType.START_MATCH, roster: rosterEntries,
                  } as ReliableMessage);
                      onlineStartMatch();
                    }}>{t('start_game', 'Start Game!')}</button>
                  )}

                  <button className="btn-base mods-close-btn" onClick={() => { onlineCleanup(); }}>{t('back', 'Back')}</button>
                </div>

                <div className="online-lobby-right">
                  <div className="online-section">
                    <span className="online-section-title">{t('players', 'Players')}</span>
                    <div className="online-player-list">
                      {/* Host always first */}
                      {online.isHost ? (
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(onlineLocalChar)} {onlinePlayerName}</span>
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
                          {onlineRemoteReady && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
                        </div>
                      )}
                      {/* Guest: local player */}
                      {!online.isHost && (
                        <div className="online-player-row">
                          <span className="online-char-name">{getCharacterEmoji(onlineLocalChar)} {onlinePlayerName}</span>
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
          {onlineStep === 'spectating' && (
            <div className="online-step">
              <div className="online-status-box" style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontSize: '18px', marginBottom: 8 }}>{t('match_in_progress', 'Match in progress')}</p>
                <p style={{ opacity: 0.7 }}>{t('spectating_hint', "You'll join when the current match ends.")}</p>
              </div>
              <button className="btn-base mods-close-btn" onClick={() => { onlineCleanup(); }}>{t('back', 'Back')}</button>
            </div>
          )}
        </div>
      </div>
      {mobileNameOpen && (
        <MobileTextInput
          value={onlinePlayerName}
          maxLength={16}
          label={t('your_name', 'Your name')}
          onConfirm={(v) => {
            setOnlinePlayerName(v);
            try { localStorage.setItem('carrotroyale_player_name', v); } catch {}
            setMobileNameOpen(false);
          }}
          onCancel={() => setMobileNameOpen(false)}
        />
      )}
      {mobileCodeOpen && (
        <MobileTextInput
          value={onlineJoinCode}
          maxLength={3}
          label={t('enter_room_code', 'Enter the room code')}
          onConfirm={(v) => {
            const code = v.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 3);
            setOnlineJoinCode(code);
            setMobileCodeOpen(false);
            if (code.length >= 3) { audio.play('select'); onlineConnect(false, code); }
          }}
          onCancel={() => setMobileCodeOpen(false)}
        />
      )}
    </>
  );
}
