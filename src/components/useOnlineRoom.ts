// Network state + protocol handlers for the online lobby.
// Owns the Trystero Transport for the menu→lobby→match lifecycle; the modal
// is pure UI and calls into this hook for connect/cleanup/startMatch.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore, type RemotePlayerInfo } from '../store/gameStore';
import { useTransientBanner } from '../hooks/useTransientBanner';
import { Transport } from '../engine/net/transport';
import type { ConnectionStatus } from '../engine/net/transport';
import { generateReclaimToken } from '../engine/net/core';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import type {
  ReliableMessage, HandshakeMessage, SlotAssignmentMessage,
  StartMatchMessage, PlayerJoinedMessage, PlayerLeftMessage,
} from '../engine/net/protocol';
import {
  CHARACTERS, BOT_CHARACTERS, getAllCharacters, assignBotCharacters,
} from '../engine/characters';
import { ALL_BOT_SLOTS, isBotSlot } from '../engine/types';
import { listPlayableArenaPacks } from '../engine/arenas';
import type { BotSlot, CharacterSlot, PlayerSlot } from '../engine/types';
import { PLAYER_NAME_MAX_LENGTH } from '../engine/rendering/hud';
export { PLAYER_NAME_MAX_LENGTH };

/** Resolve 'random' arenaId to a concrete ID so both peers use the same arena.
 *  CRITICAL: must be called once on the host before sending SETTINGS_SYNC, then
 *  the concrete arena ID is persisted to the store and broadcast. If 'random'
 *  reaches the wire and each peer resolves independently, host and guest pick
 *  DIFFERENT arenas and desync (players appear to clip / float on platforms
 *  the other side doesn't have). */
export function resolveRandomArena(arenaId: string): string {
  if (arenaId !== 'random') return arenaId;
  const all = listPlayableArenaPacks();
  return all[Math.floor(Math.random() * all.length)]?.id ?? 'meadow';
}

// Module-scope transport reference picked up by Match.tsx / VictoryScreen.tsx
// once the match starts. Assigned by connect, cleared by cleanup.
let _modalTransport: Transport | null = null;
export function getModalTransport(): Transport | null { return _modalTransport; }
/** Null the module-scope transport ref. Call this anywhere a transport is
 *  destroyed outside of useOnlineRoom.cleanup() — Match.handleQuit and
 *  VictoryScreen.handleMenu both destroy the transport but used to leave a
 *  stale reference behind, exposing a window where getModalTransport()
 *  returned a destroyed instance. */
export function clearModalTransport(): void { _modalTransport = null; }

// Reclaim tokens issued by the host in lobby SLOT_ASSIGNMENT. Picked up by
// Match.tsx when starting NetMatch. Host: full Map<slot, token>. Guest:
// only its own token.
let _hostReclaimTokens: Map<PlayerSlot, string> = new Map();
let _guestOwnReclaimToken: string | null = null;
export function getHostReclaimTokens(): Map<PlayerSlot, string> {
  return _hostReclaimTokens;
}
export function getGuestOwnReclaimToken(): string | null { return _guestOwnReclaimToken; }
export function clearReclaimTokens(): void {
  _hostReclaimTokens = new Map();
  _guestOwnReclaimToken = null;
}

/** One-shot teardown of the online session: destroys the active transport,
 *  drops the module-scope transport ref, and clears any lobby-issued reclaim
 *  tokens. Used by every "go back to menu" path (handleQuit, handleMenu, peer
 *  disconnect during VictoryScreen) so each site doesn't reimplement the
 *  same three-step cleanup and miss a step. */
export function tearDownOnlineSession(): void {
  const transport = _modalTransport;
  if (transport) {
    transport.destroy();
    _modalTransport = null;
  }
  clearReclaimTokens();
}

export type OnlineStep = 'choose' | 'connecting' | 'lobby' | 'spectating';

interface UseOnlineRoomArgs {
  onMatchStart: () => void;
}

export interface UseOnlineRoomResult {
  step: OnlineStep;
  setStep: (s: OnlineStep) => void;
  localChar: string;
  handleCharChange: (value: string) => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  localReady: boolean;
  markLocalReady: () => void;
  remoteReady: boolean;
  connect: (isHost: boolean, joinCode?: string) => void;
  cleanup: () => void;
  startMatchAsHost: () => void;
  autoSwitchNotice: { prev: string; next: string } | null;
}

type RosterEntry = { slot: PlayerSlot; characterName: string; playerName?: string };

function buildSettingsSyncMsg(ms: ReturnType<typeof useGameStore.getState>['matchSettings'], seed: number, arenaId: string): ReliableMessage {
  return {
    type: MsgType.SETTINGS_SYNC, arenaId,
    killLimit: ms.killLimit, timeLimit: ms.timeLimit, goreMode: ms.goreMode,
    mods: ms.mods, rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
  } as ReliableMessage;
}

export function useOnlineRoom({ onMatchStart }: UseOnlineRoomArgs): UseOnlineRoomResult {
  const { t } = useTranslation();
  const { setScreen, matchSettings, setActivePlayers, setOnline, resetOnline, online } = useGameStore();

  const [step, setStep] = useState<OnlineStep>('choose');
  const [localChar, setLocalChar] = useState(() =>
    localStorage.getItem('carrotroyale_online_char') || CHARACTERS.P1.name
  );
  const localCharRef = useRef(CHARACTERS.P1.name);
  localCharRef.current = localChar;
  const [playerName, setPlayerNameState] = useState(() =>
    (localStorage.getItem('carrotroyale_player_name') || '').slice(0, PLAYER_NAME_MAX_LENGTH)
  );
  const playerNameRef = useRef('');
  playerNameRef.current = playerName;
  const [remoteReady, setRemoteReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const transportRef = useRef<Transport | null>(null);
  const receivedRosterRef = useRef<RosterEntry[] | null>(null);
  // Buffer for player names received via HANDSHAKE before the peer is in remotePlayers
  const pendingPlayerNames = useRef<Map<string, string>>(new Map());

  const allChars = getAllCharacters();

  const setPlayerName = useCallback((name: string) => {
    const clamped = name.slice(0, PLAYER_NAME_MAX_LENGTH);
    setPlayerNameState(clamped);
    playerNameRef.current = clamped;
    try { localStorage.setItem('carrotroyale_player_name', clamped); } catch {}
  }, []);

  // Guest-only one-shot: if local character conflicts with a remote player, pick an alt.
  // Host never auto-switches (authoritative).
  const didAutoSwitch = useRef(false);
  const [autoSwitchNotice, flashAutoSwitchNotice] =
    useTransientBanner<{ prev: string; next: string }>();
  useEffect(() => {
    if (online.isHost) return;
    const takenNames = new Set<string>();
    for (const rp of online.remotePlayers) takenNames.add(rp.characterName);

    if (!takenNames.has(localChar)) return;
    if (didAutoSwitch.current) return;
    didAutoSwitch.current = true;

    const alt = allChars.find(c => !takenNames.has(c.name) && c.name !== localChar);
    if (alt) {
      const prev = localChar;
      setLocalChar(alt.name);
      localCharRef.current = alt.name;
      transportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: alt.name });
      flashAutoSwitchNotice({ prev, next: alt.name }, 4500);
    }
  // `localChar` / `allChars` / `flashAutoSwitchNotice` are intentionally omitted:
  // the didAutoSwitch.current guard short-circuits after one fire, so later
  // changes to those deps can't cause a second switch.
  }, [online.isHost, online.remotePlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleanup = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
      _modalTransport = null;
    }
    resetOnline();
    setStep('choose');
    setLocalReady(false);
    setRemoteReady(false);
    pendingPlayerNames.current.clear();
    didAutoSwitch.current = false;
    flashAutoSwitchNotice(null);
    clearReclaimTokens();
  }, [resetOnline, flashAutoSwitchNotice]);

  // Guarantee cleanup on hook unmount — guards against future paths that
  // dismiss the modal without going through Back/Cancel buttons. We must NOT
  // destroy the transport when match-start triggers the unmount, since
  // Match.tsx is taking ownership in that case (handoff via _modalTransport).
  const matchHandedOff = useRef(false);
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => {
    return () => {
      if (matchHandedOff.current) return;
      if (transportRef.current) cleanupRef.current();
    };
  }, []);

  const startMatchAsGuest = useCallback(() => {
    const store = useGameStore.getState();
    const mySlot: PlayerSlot = store.online.isHost ? 'P1' : (store.online.localSlot || 'P2');

    const names: Record<string, string> = { ...store.online.playerNames, [mySlot]: playerNameRef.current };
    for (const rp of store.online.remotePlayers) {
      if (rp.playerName) names[rp.slot] = rp.playerName;
    }

    const roster = receivedRosterRef.current;
    if (roster && roster.length > 0) {
      for (const entry of roster) {
        if (entry.playerName && !isBotSlot(entry.slot)) names[entry.slot] = entry.playerName;
      }

      for (const entry of roster) {
        const def = allChars.find(c => c.name === entry.characterName);
        if (isBotSlot(entry.slot)) {
          if (def) BOT_CHARACTERS.set(entry.slot as BotSlot, { ...def, slot: entry.slot as BotSlot });
        } else {
          const charSlot = (CHARACTERS as Record<string, typeof CHARACTERS.P1>)[entry.slot];
          if (def && charSlot) {
            charSlot.name = def.name; charSlot.color = def.color;
            charSlot.darkColor = def.darkColor; charSlot.lightColor = def.lightColor;
          }
        }
      }
      const humanSlots = [...new Set(roster.filter(r => !isBotSlot(r.slot)).map(r => r.slot as CharacterSlot))];
      const botSlots = [...new Set(roster.filter(r => isBotSlot(r.slot)).map(r => r.slot as BotSlot))];
      setActivePlayers([...humanSlots, ...botSlots]);
      receivedRosterRef.current = null;
    } else {
      // Legacy path: guest with no roster from host (should not normally happen — host always sends roster)
      const connectedPeers = new Set(transportRef.current?.getPeerIds() ?? []);
      const humanSlots: PlayerSlot[] = [mySlot];
      const slotCharMap = new Map<PlayerSlot, string>();
      slotCharMap.set(mySlot, localCharRef.current);

      for (const rp of store.online.remotePlayers) {
        if (!humanSlots.includes(rp.slot) && connectedPeers.has(rp.peerId)) humanSlots.push(rp.slot);
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
      assignBotCharacters(humanSlots as CharacterSlot[], botSlots, store.online.rngSeed, Array.from(slotCharMap.values()));
      setActivePlayers([...humanSlots as CharacterSlot[], ...botSlots]);
    }

    setOnline({ isOnline: true, localSlot: mySlot, playerNames: names });
    matchHandedOff.current = true;
    onMatchStart();
    setScreen('match');
  }, [allChars, setActivePlayers, setOnline, setScreen, onMatchStart]);

  const startMatchRef = useRef(startMatchAsGuest);
  startMatchRef.current = startMatchAsGuest;

  const handleCharChange = useCallback((value: string) => {
    setLocalChar(value);
    localCharRef.current = value;
    localStorage.setItem('carrotroyale_online_char', value);
    transportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: value });
  }, []);

  const markLocalReady = useCallback(() => {
    setLocalReady(true);
    transportRef.current?.sendReliable({ type: MsgType.READY } as ReliableMessage);
  }, []);

  const startMatchAsHost = useCallback(() => {
    const state = useGameStore.getState();
    const ms = state.matchSettings;
    const seed = state.online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
    setOnline({ rngSeed: seed });

    const connectedPeerIds = new Set(transportRef.current?.getPeerIds() ?? []);
    const rosterEntries: RosterEntry[] = [
      { slot: 'P1', characterName: localCharRef.current, playerName: playerNameRef.current },
    ];
    const seenSlots = new Set<PlayerSlot>(rosterEntries.map(r => r.slot));
    for (const rp of state.online.remotePlayers) {
      if (!seenSlots.has(rp.slot) && connectedPeerIds.has(rp.peerId)) {
        seenSlots.add(rp.slot);
        rosterEntries.push({ slot: rp.slot, characterName: rp.characterName, playerName: rp.playerName });
      }
    }
    const humanNames = rosterEntries.map(r => r.characterName);
    const humanSlots = rosterEntries.map(r => r.slot) as CharacterSlot[];
    const botSlots = ALL_BOT_SLOTS.slice(0, ms.botCount);
    assignBotCharacters(humanSlots, botSlots, seed, humanNames);
    for (const bSlot of botSlots) {
      const botChar = BOT_CHARACTERS.get(bSlot);
      if (botChar) rosterEntries.push({ slot: bSlot, characterName: botChar.name });
    }

    const resolvedArena = resolveRandomArena(ms.arenaId);
    if (resolvedArena !== ms.arenaId) {
      useGameStore.getState().setMatchSettings({ arenaId: resolvedArena });
    }
    transportRef.current?.sendReliable(buildSettingsSyncMsg(ms, seed, resolvedArena));
    transportRef.current?.sendReliable({ type: MsgType.START_MATCH, roster: rosterEntries } as ReliableMessage);

    // Reuse the roster we just built instead of rebuilding it in startMatchAsGuest's else branch.
    receivedRosterRef.current = rosterEntries;
    startMatchAsGuest();
  }, [setOnline, startMatchAsGuest]);

  const connect = useCallback((isHost: boolean, joinCode?: string) => {
    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
      _modalTransport = null;
    }
    // Drop any stale tokens from a prior session — defensive in case a
    // quit/menu path missed clearReclaimTokens(). Without this, a guest
    // might present an old host's token to the new host.
    clearReclaimTokens();
    setStep('connecting');
    setOnline({ isHost, isOnline: true, roomCode: null, connectionStatus: 'idle', connectionError: null });

    const ms = matchSettings;
    const peerSlotMap = new Map<string, string>();
    const freedSlots: string[] = [];
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
          setRemoteReady(false);
          setStep('connecting');
        }
        if (status === 'connected' && !isHost) {
          setStep('lobby');
          transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: playerNameRef.current });
          transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: localCharRef.current });
        }
      },
      onPeerConnected: (peerId: string) => {
        if (!isHost) return;
        // Purge stale entries — peers that are no longer connected
        const connectedNow = new Set(transport.getPeerIds());
        connectedNow.add(peerId);
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
        // Issue this guest's reclaim token. Stored host-side for validation
        // when they later send RECONNECT_REQUEST. Sent to the guest only —
        // SLOT_ASSIGNMENT goes via sendReliableTo (per-peer), not broadcast.
        const reclaimToken = generateReclaimToken();
        _hostReclaimTokens.set(slot, reclaimToken);

        // Match in progress → late joiner becomes spectator
        const currentScreen = useGameStore.getState().screen;
        if (currentScreen === 'match' || currentScreen === 'victory') {
          transport.sendReliableTo(peerId, { type: MsgType.MATCH_IN_PROGRESS, snapshot: null } as ReliableMessage);
          transport.sendReliableTo(peerId, { type: MsgType.SLOT_ASSIGNMENT, slot, reclaimToken, allPlayers: [] } as ReliableMessage);
          setOnline({ remotePlayers: [...currentPlayers, newPeer] });
          return;
        }

        transport.sendReliableTo(peerId, {
          type: MsgType.SLOT_ASSIGNMENT,
          slot,
          reclaimToken,
          allPlayers: [
            { slot: 'P1', characterName: localCharRef.current, isHost: true, playerName: playerNameRef.current },
            ...currentPlayers.map(rp => ({
              slot: rp.slot as string, characterName: rp.characterName, isHost: false, playerName: rp.playerName,
            })),
          ],
        } as ReliableMessage);

        const seed = useGameStore.getState().online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
        const resolvedArenaId = resolveRandomArena(ms.arenaId);
        transport.sendReliableTo(peerId, buildSettingsSyncMsg(ms, seed, resolvedArenaId));
        transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: playerNameRef.current });
        transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: localCharRef.current });

        // Exclude the new peer so it doesn't receive an echo of itself
        for (const pid of transport.getPeerIds()) {
          if (pid !== peerId) {
            transport.sendReliableTo(pid, {
              type: MsgType.PLAYER_JOINED, peerId, slot,
              characterName: CHARACTERS.P2.name, playerName: '',
            } as ReliableMessage);
          }
        }

        setOnline({ remotePlayers: [...currentPlayers, newPeer], rngSeed: seed });
        setStep('lobby');
      },
      onPeerDisconnected: (peerId: string) => {
        const slot = peerSlotMap.get(peerId);
        peerSlotMap.delete(peerId);
        pendingPlayerNames.current.delete(peerId);
        // Drop the slot's reclaim token — when allocateSlot reuses this slot
        // for a fresh peer, a new token will be issued. This keeps a stale
        // token from authenticating a different peer's RECONNECT_REQUEST.
        if (slot) _hostReclaimTokens.delete(slot as PlayerSlot);
        if (isHost) {
          if (slot) freedSlots.push(slot);
          const current = useGameStore.getState().online.remotePlayers;
          const remaining = current.filter(rp => rp.peerId !== peerId);
          setOnline({ remotePlayers: remaining });
          if (slot) {
            transport.sendReliable({ type: MsgType.PLAYER_LEFT, slot, reason: 'disconnect' } as ReliableMessage);
          }
          if (remaining.length === 0) {
            setRemoteReady(false);
            setStep('connecting');
          }
        } else {
          // Guest: host disconnected
          setOnline({ remotePlayers: [] });
          setRemoteReady(false);
          setStep('connecting');
        }
      },
      onReliableMessage: (msg: ReliableMessage, fromPeerId?: string) => {
        if (msg.type === MsgType.HANDSHAKE) {
          const hsMsg = msg as HandshakeMessage;
          // Validate protocol version — cross-version builds silently corrupt
          // snapshots. Reject mismatch with a user-facing error and disconnect.
          if (hsMsg.protocolVersion !== PROTOCOL_VERSION) {
            const err = t('version_mismatch', 'Version mismatch — please reload the page');
            setOnline({ connectionStatus: 'error', connectionError: err });
            if (isHost && fromPeerId) {
              transport.sendReliableTo(fromPeerId, { type: MsgType.DISCONNECT } as ReliableMessage);
            }
            transport.destroy();
            transportRef.current = null;
            _modalTransport = null;
            // Drop buffered HANDSHAKE names from the rejected peer; otherwise
            // a future peer that happens to reuse a peerId could pick up a
            // stale name from a prior session.
            pendingPlayerNames.current.clear();
            setStep('choose');
            return;
          }
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
                if (pid !== fromPeerId) transport.sendReliableTo(pid, msg);
              }
            }
          } else if (!isHost) {
            const current = useGameStore.getState().online.remotePlayers;
            const idx = current.findIndex(rp => rp.slot === 'P1'); // host is always P1
            if (idx >= 0) {
              const updated = current.map((rp, i) => i === idx ? { ...rp, characterName: msg.characterName } : rp);
              setOnline({ remotePlayers: updated });
            }
          }
        } else if (!isHost && msg.type === MsgType.SLOT_ASSIGNMENT) {
          // Host-broadcast only — lifting the !isHost gate would let a buggy/
          // hostile guest rewrite the host's own localSlot + remotePlayers
          // map, breaking match start.
          const slotMsg = msg as SlotAssignmentMessage;
          // Store the reclaim token issued by host for our slot. Match.tsx
          // hands it to NetMatch via config.ownReclaimToken so a future
          // RECONNECT_REQUEST authenticates the reclaim attempt.
          if (slotMsg.reclaimToken) _guestOwnReclaimToken = slotMsg.reclaimToken;
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
        } else if (!isHost && msg.type === MsgType.SETTINGS_SYNC) {
          // Host-authoritative settings — guest applies, host never accepts.
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
          setRemoteReady(true);
        } else if (!isHost && msg.type === MsgType.START_MATCH) {
          // Host-broadcast only. A guest forging START_MATCH to host would
          // otherwise drop the host into the match screen with the guest's
          // chosen roster.
          const startMsg = msg as StartMatchMessage;
          receivedRosterRef.current = (startMsg.roster as RosterEntry[] | undefined) ?? null;
          startMatchRef.current();
        } else if (!isHost && msg.type === MsgType.PLAYER_JOINED) {
          // Host-broadcast only. Without the gate, a guest could inject
          // synthetic player rows into the host's lobby UI.
          const pj = msg as PlayerJoinedMessage;
          const current = useGameStore.getState().online.remotePlayers;
          const names = pj.playerName ? { ...useGameStore.getState().online.playerNames, [pj.slot]: pj.playerName } : undefined;
          const existing = current.find(rp => rp.slot === pj.slot);
          const updatedPlayers = existing
            ? current.map(rp => rp.slot === pj.slot ? { ...rp, characterName: pj.characterName, playerName: pj.playerName || rp.playerName } : rp)
            : [...current, { peerId: pj.peerId, slot: pj.slot as PlayerSlot, characterName: pj.characterName, playerName: pj.playerName || '', ready: false }];
          setOnline({ remotePlayers: updatedPlayers, ...(names && { playerNames: names }) });
        } else if (!isHost && msg.type === MsgType.PLAYER_LEFT) {
          // Host-broadcast only — a guest would otherwise be able to evict
          // arbitrary slot rows from the host's lobby state.
          const pl = msg as PlayerLeftMessage;
          const current = useGameStore.getState().online.remotePlayers;
          setOnline({ remotePlayers: current.filter(rp => rp.slot !== pl.slot) });
        } else if (!isHost && msg.type === MsgType.MATCH_IN_PROGRESS) {
          // Host-broadcast only — guests get this when joining a room whose
          // host is already in a match.
          setStep('spectating');
        } else if (!isHost && msg.type === MsgType.MATCH_RESULT) {
          // Host-broadcast only — fired when the match ends and we're heading
          // back to the lobby.
          setStep('lobby');
        }
      },
      onUnreliableMessage: () => {},
      onRttUpdate: () => {},
    });
    transportRef.current = transport;
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

  return {
    step, setStep,
    localChar, handleCharChange,
    playerName, setPlayerName,
    localReady, markLocalReady,
    remoteReady,
    connect, cleanup, startMatchAsHost,
    autoSwitchNotice,
  };
}
