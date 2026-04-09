import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { listArenas } from '../engine/arena';
import { listThemes } from '../engine/themes/registry';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { initWildlife, updateAndDrawWildlife, drawDayNightCycle } from '../engine/canvasAnimations';
import type { SimpleWildlife } from '../engine/canvasAnimations';
import logoImg from '/logo.png?url';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
  drawFgBush, drawTallGrass, drawFern, drawFgWildflower,
} from '../engine/themes/drawPrimitives';
import { Transport } from '../engine/net/transport';
import type { ConnectionStatus } from '../engine/net/transport';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import type { ReliableMessage } from '../engine/net/protocol';
import { CHARACTERS, getAllCharacters, getCharacterEmoji, getCharacterDisplayName, assignBotCharacters } from '../engine/characters';
import { ALL_BOT_SLOTS } from '../engine/types';
import type { PlayerSlot } from '../engine/types';
import './MainMenu.css';

// Re-export for Match.tsx — transport lives here now
let _modalTransport: Transport | null = null;
export function getModalTransport(): Transport | null { return _modalTransport; }

const MENU_GROUND_Y = 580;
const DAY_CYCLE_DURATION = 90;

let menuWildlife: SimpleWildlife[] | null = null;
let menuLastTime = 0;

function drawMenuBackground(ctx: CanvasRenderingContext2D): void {
  const now = performance.now() / 1000;
  if (!menuWildlife) menuWildlife = initWildlife(8, MENU_GROUND_Y);
  const dt = menuLastTime ? Math.min(now - menuLastTime, 0.05) : 1 / 60;
  menuLastTime = now;

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  skyGrad.addColorStop(0, '#4A90D9');
  skyGrad.addColorStop(0.6, '#87CEEB');
  skyGrad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant treeline
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#3A6A3A';
  ctx.beginPath();
  ctx.moveTo(-10, MENU_GROUND_Y + 10);
  for (let x = 0; x < 1300; x += 40) {
    ctx.lineTo(x, MENU_GROUND_Y - 50 - Math.sin(x * 0.013) * 20 - (x * 7 % 17));
  }
  ctx.lineTo(1300, MENU_GROUND_Y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Animated clouds
  const cloudDefs = [
    { speed: 6, offset: 0, y: 70, size: 80 },
    { speed: 4, offset: 350, y: 40, size: 90 },
    { speed: 9, offset: 700, y: 100, size: 60 },
    { speed: 5, offset: 150, y: 25, size: 70 },
    { speed: 7, offset: 550, y: 85, size: 55 },
  ];
  for (const c of cloudDefs) {
    const cx = (now * c.speed + c.offset) % (CANVAS_WIDTH + 300) - 150;
    drawCloud(ctx, cx, c.y, c.size);
  }

  // Hills
  const hills: [number, number, number, number][] = [[0, 350, 130, 580], [280, 450, 110, 590], [650, 380, 140, 575], [950, 400, 115, 590]];
  for (const [hx, hw, hh, hby] of hills) {
    ctx.fillStyle = '#5C9E4C';
    ctx.beginPath();
    ctx.moveTo(hx, hby);
    ctx.quadraticCurveTo(hx + hw / 2, hby - hh, hx + hw, hby);
    ctx.lineTo(hx + hw, MENU_GROUND_Y + 10);
    ctx.lineTo(hx, MENU_GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }

  // Ground
  const groundGrad = ctx.createLinearGradient(0, MENU_GROUND_Y, 0, CANVAS_HEIGHT);
  groundGrad.addColorStop(0, '#4a8c3f');
  groundGrad.addColorStop(0.15, '#3a7030');
  groundGrad.addColorStop(1, '#2a5520');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - MENU_GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, 4);
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 15) {
    ctx.beginPath();
    ctx.moveTo(x, MENU_GROUND_Y);
    ctx.lineTo(x - 2, MENU_GROUND_Y - 6 - (x * 7 % 5));
    ctx.stroke();
  }

  // Background trees
  drawTree(ctx, 40, MENU_GROUND_Y, 60);
  drawTree(ctx, 280, MENU_GROUND_Y, 45);
  drawTree(ctx, 1000, MENU_GROUND_Y, 55);
  drawTree(ctx, 1200, MENU_GROUND_Y, 48);

  // Bushes
  drawBush(ctx, 140, MENU_GROUND_Y, 30);
  drawBush(ctx, 420, MENU_GROUND_Y, 24);
  drawBush(ctx, 850, MENU_GROUND_Y, 28);
  drawBush(ctx, 1100, MENU_GROUND_Y, 22);

  // Flowers
  const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
  for (let fx = 60; fx < CANVAS_WIDTH; fx += 70 + (fx * 3 % 40)) {
    drawFlower(ctx, fx, MENU_GROUND_Y, flowerColors[Math.floor(fx * 0.01) % flowerColors.length]);
  }

  // Mushrooms
  drawMushroom(ctx, 200, MENU_GROUND_Y);
  drawMushroom(ctx, 750, MENU_GROUND_Y);
  drawMushroom(ctx, 1150, MENU_GROUND_Y);

  // Grass tufts
  for (let gx = 30; gx < CANVAS_WIDTH; gx += 80 + (gx * 5 % 30)) {
    drawGrassTuft(ctx, gx, MENU_GROUND_Y);
  }

  // Foreground decorations
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawFgBush(ctx, 80, MENU_GROUND_Y, 55);
  drawFgBush(ctx, 500, MENU_GROUND_Y, 48);
  drawFgBush(ctx, 920, MENU_GROUND_Y, 52);
  drawFgBush(ctx, 1180, MENU_GROUND_Y, 42);
  drawTallGrass(ctx, 180, MENU_GROUND_Y, 7);
  drawTallGrass(ctx, 660, MENU_GROUND_Y, 8);
  drawTallGrass(ctx, 1060, MENU_GROUND_Y, 6);
  drawFern(ctx, 50, MENU_GROUND_Y);
  drawFern(ctx, 780, MENU_GROUND_Y);
  drawFern(ctx, 1230, MENU_GROUND_Y);
  drawFgWildflower(ctx, 320, MENU_GROUND_Y, '#FF6B8A', 20);
  drawFgWildflower(ctx, 600, MENU_GROUND_Y, '#DDA0DD', 18);
  drawFgWildflower(ctx, 1100, MENU_GROUND_Y, '#FFD700', 16);
  ctx.restore();

  // Fog wisps
  ctx.save();
  for (let fi = 0; fi < 12; fi++) {
    const fx = (now * (2 + fi * 0.4) + fi * 110) % (CANVAS_WIDTH + 100) - 50;
    const fy = MENU_GROUND_Y - 2 + Math.sin(fi * 2.1) * 8;
    ctx.globalAlpha = 0.08 + (fi % 3) * 0.04;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 45, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Wildlife
  updateAndDrawWildlife(ctx, menuWildlife!, dt, MENU_GROUND_Y);

  // Day/night cycle
  drawDayNightCycle(ctx, now, DAY_CYCLE_DURATION);
}

export function MainMenu() {
  const { t, i18n } = useTranslation();
  const { setScreen, matchSettings, setMatchSettings, setActivePlayers, setOnline, resetOnline, online } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const [modsOpen, setModsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineJoinMode, setOnlineJoinMode] = useState(false);
  const [onlineJoinCode, setOnlineJoinCode] = useState('');

  // Online flow state (all inside modal)
  const [onlineStep, setOnlineStep] = useState<'choose' | 'connecting' | 'lobby' | 'spectating'>('choose');
  const [onlineLocalChar, setOnlineLocalChar] = useState(() =>
    localStorage.getItem('bunnybrawl_online_char') || CHARACTERS.P1.name
  );
  const onlineLocalCharRef = useRef(CHARACTERS.P1.name);
  onlineLocalCharRef.current = onlineLocalChar;
  const [onlineRemoteReady, setOnlineRemoteReady] = useState(false);
  const [onlineLocalReady, setOnlineLocalReady] = useState(false);
  const onlineTransportRef = useRef<Transport | null>(null);
  const remoteCharRef = useRef<string | null>(null);

  const allChars = getAllCharacters();

  // If remote picked the same character, force local to a different one.
  // Uses a guard ref to prevent echo loops: only auto-switch once per conflict.
  const autoSwitchGuard = useRef<string | null>(null);
  useEffect(() => {
    const conflict = online.remoteCharacterName;
    if (!conflict || onlineLocalChar !== conflict) {
      autoSwitchGuard.current = null;
      return;
    }
    // Already handled this specific conflict
    if (autoSwitchGuard.current === conflict) return;
    autoSwitchGuard.current = conflict;

    const takenNames = new Set(online.remotePlayers.map(rp => rp.characterName));
    takenNames.add(conflict);
    const alt = allChars.find(c => !takenNames.has(c.name));
    if (alt) {
      setOnlineLocalChar(alt.name);
      onlineLocalCharRef.current = alt.name;
      onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: alt.name });
    }
  }, [online.remoteCharacterName]); // eslint-disable-line react-hooks/exhaustive-deps

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
    remoteCharRef.current = null;
  }, [resetOnline]);

  const onlineStartMatch = useCallback(() => {
    const store = useGameStore.getState();
    const myChar = onlineLocalCharRef.current;
    const mySlot = store.online.isHost ? 'P1' : (store.online.localSlot || 'P2');

    // Build human player list: local + all remote players
    const humanSlots: string[] = [mySlot];
    const slotCharMap = new Map<string, string>();
    slotCharMap.set(mySlot, myChar);

    for (const rp of store.online.remotePlayers) {
      humanSlots.push(rp.slot);
      slotCharMap.set(rp.slot, rp.characterName);
    }

    // If 1v1 (legacy path), also check remoteCharacterName
    if (humanSlots.length === 1 && store.online.remoteCharacterName) {
      const remSlot = store.online.isHost ? 'P2' : 'P1';
      humanSlots.push(remSlot);
      slotCharMap.set(remSlot, store.online.remoteCharacterName);
    }

    // Set character definitions for all human slots
    for (const [slot, charName] of slotCharMap) {
      const def = allChars.find(c => c.name === charName);
      const charSlot = (CHARACTERS as Record<string, typeof CHARACTERS.P1>)[slot];
      if (def && charSlot) {
        charSlot.name = def.name;
        charSlot.color = def.color;
        charSlot.darkColor = def.darkColor;
        charSlot.lightColor = def.lightColor;
      }
    }

    // Include bots
    const ms = store.matchSettings;
    const botSlots = ALL_BOT_SLOTS.slice(0, ms.botCount);
    const rngSeed = store.online.rngSeed;
    assignBotCharacters(humanSlots as any, botSlots, rngSeed);
    setActivePlayers([...humanSlots as PlayerSlot[], ...botSlots]);
    setOnline({ isOnline: true, localSlot: mySlot as PlayerSlot });
    setOnlineOpen(false);
    setScreen('match');
  }, [allChars, setActivePlayers, setOnline, setScreen]);

  const onlineStartMatchRef = useRef(onlineStartMatch);
  onlineStartMatchRef.current = onlineStartMatch;

  const onlineConnect = useCallback((isHost: boolean, joinCode?: string) => {
    // Clean up any previous transport (e.g. retrying after error)
    if (onlineTransportRef.current) {
      onlineTransportRef.current.destroy();
      onlineTransportRef.current = null;
      _modalTransport = null;
    }
    audio.init();
    setOnlineStep('connecting');
    setOnline({ isHost, isOnline: true, roomCode: null });

    const ms = matchSettings;
    let nextSlotIdx = 2; // Host is P1, guests get P2, P3, P4, P5
    const peerSlotMap = new Map<string, string>(); // peerId → PlayerSlot

    const transport = new Transport({
      onStatusChange: (status: ConnectionStatus, error?: string) => {
        setOnline({ connectionStatus: status, connectionError: error ?? null });
        if (status === 'disconnected') {
          remoteCharRef.current = null;
          setOnline({ remoteCharacterName: null, remotePlayers: [] });
          setOnlineRemoteReady(false);
          setOnlineStep('connecting');
        }
        if (status === 'connected') {
          if (!isHost) {
            // Guest: connected to host
            setOnlineStep('lobby');
            transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: 'Player' });
            transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: onlineLocalCharRef.current });
          }
        }
      },
      onPeerConnected: (peerId: string) => {
        if (isHost) {
          const slot = `P${nextSlotIdx++}` as PlayerSlot;
          peerSlotMap.set(peerId, slot);

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
            // Add as pending spectator — they'll join on next rematch
            const current = useGameStore.getState().online.remotePlayers;
            setOnline({
              remotePlayers: [...current, { peerId, slot, characterName: 'Fox', ready: false }],
            });
            return;
          }

          // Normal lobby join — send slot assignment + settings
          transport.sendReliableTo(peerId, {
            type: MsgType.SLOT_ASSIGNMENT,
            slot,
            allPlayers: [
              { slot: 'P1', characterName: onlineLocalCharRef.current, isHost: true },
              ...useGameStore.getState().online.remotePlayers.map(rp => ({
                slot: rp.slot as string, characterName: rp.characterName, isHost: false,
              })),
            ],
          } as ReliableMessage);

          const seed = useGameStore.getState().online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
          setOnline({ rngSeed: seed });
          transport.sendReliableTo(peerId, {
            type: MsgType.SETTINGS_SYNC, arenaId: ms.arenaId, killLimit: ms.killLimit,
            timeLimit: ms.timeLimit, goreMode: ms.goreMode,
            mods: ms.mods as unknown as Record<string, boolean>,
            rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
          } as ReliableMessage);
          transport.sendReliable({ type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: 'Host' });
          transport.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: onlineLocalCharRef.current });

          // Notify all existing guests about the new player
          transport.sendReliable({
            type: MsgType.PLAYER_JOINED,
            peerId,
            slot,
            characterName: 'Fox', // default, will be updated by CHARACTER_SELECT
          } as ReliableMessage);

          setOnlineStep('lobby');
        }
      },
      onPeerDisconnected: (peerId: string) => {
        const slot = peerSlotMap.get(peerId);
        peerSlotMap.delete(peerId);
        if (isHost) {
          // Remove from remote players list
          const current = useGameStore.getState().online.remotePlayers;
          setOnline({ remotePlayers: current.filter(rp => rp.peerId !== peerId) });
          // Notify others
          if (slot) {
            transport.sendReliable({ type: MsgType.PLAYER_LEFT, slot, reason: 'disconnect' } as ReliableMessage);
          }
          // Update legacy field
          const remaining = useGameStore.getState().online.remotePlayers;
          remoteCharRef.current = remaining.length > 0 ? remaining[0].characterName : null;
          setOnline({ remoteCharacterName: remoteCharRef.current });
          if (remaining.length === 0) {
            setOnlineRemoteReady(false);
            setOnlineStep('connecting');
          }
        } else {
          // Guest: host disconnected
          remoteCharRef.current = null;
          setOnline({ remoteCharacterName: null, remotePlayers: [] });
          setOnlineRemoteReady(false);
          setOnlineStep('connecting');
        }
      },
      onReliableMessage: (msg: ReliableMessage, fromPeerId?: string) => {
        if (msg.type === MsgType.CHARACTER_SELECT) {
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
                setOnline({
                  remotePlayers: [...current, { peerId: fromPeerId, slot: slot as PlayerSlot, characterName: msg.characterName, ready: false }],
                });
              }
              // Update legacy field (first remote player's character)
              const updated = useGameStore.getState().online.remotePlayers;
              remoteCharRef.current = updated.length > 0 ? updated[0].characterName : null;
              setOnline({ remoteCharacterName: remoteCharRef.current });

              // Forward to other guests (exclude the sender to prevent echo loop)
              for (const pid of transport.getPeerIds()) {
                if (pid !== fromPeerId) {
                  transport.sendReliableTo(pid, msg);
                }
              }
            }
          } else if (!isHost) {
            // Guest: received character update (from host or relayed)
            remoteCharRef.current = msg.characterName;
            setOnline({ remoteCharacterName: msg.characterName });
          }
        } else if (msg.type === MsgType.SLOT_ASSIGNMENT) {
          // Guest: received my slot assignment from host
          const slotMsg = msg as import('../engine/net/protocol').SlotAssignmentMessage;
          setOnline({ localSlot: slotMsg.slot as PlayerSlot });
        } else if (msg.type === MsgType.SETTINGS_SYNC) {
          useGameStore.getState().setMatchSettings({
            arenaId: msg.arenaId, killLimit: msg.killLimit, timeLimit: msg.timeLimit,
            goreMode: msg.goreMode, botCount: msg.botCount,
            botDifficulty: msg.botDifficulty as 'easy' | 'medium' | 'hard' | 'impossible',
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
          onlineStartMatchRef.current();
        } else if (msg.type === MsgType.PLAYER_JOINED) {
          // Guest: new player joined
          const pj = msg as import('../engine/net/protocol').PlayerJoinedMessage;
          const current = useGameStore.getState().online.remotePlayers;
          if (!current.find(rp => rp.slot === pj.slot)) {
            setOnline({
              remotePlayers: [...current, { peerId: pj.peerId, slot: pj.slot as PlayerSlot, characterName: pj.characterName, ready: false }],
            });
          }
        } else if (msg.type === MsgType.PLAYER_LEFT) {
          const pl = msg as import('../engine/net/protocol').PlayerLeftMessage;
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
      transport.createRoom().then(code => setOnline({ roomCode: code })).catch(() => { onlineCleanup(); });
    } else if (joinCode) {
      transport.joinRoom(joinCode).catch(() => { onlineCleanup(); });
    }
  }, [matchSettings, setOnline]);

  const handlePlay = useCallback(() => {
    audio.init();
    audio.play('select');
    setScreen('charSelect');
  }, [setScreen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handlePlay]);

  useEffect(() => {
    audio.init();
    audio.setMusicDisabled(matchSettings.mods.noMusic);
    audio.playMenuMusic();
  }, []);

  useEffect(() => {
    audio.setMusicDisabled(matchSettings.mods.noMusic);
    if (!matchSettings.mods.noMusic) audio.playMenuMusic();
  }, [matchSettings.mods.noMusic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const loop = () => {
      drawMenuBackground(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="main-menu" data-testid="main-menu">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="menu-bg-canvas" />
      <div className="menu-bg">
        <div className="menu-content">
          <img src={logoImg} alt="Carrot Royale" className="game-logo" />
          <p className="tagline">{t('tagline')}</p>
          <p className="controls-hint">{t('credits_players')}</p>

          <div className="menu-buttons">
            <button className="btn-base menu-btn play-btn" onClick={handlePlay} data-testid="play-button">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              {t('play_local', 'Play Local')}
            </button>
            <button className="btn-base menu-btn online-btn" data-testid="online-btn" onClick={() => { audio.init(); audio.play('select'); setOnlineOpen(true); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              {t('online', 'Online')}
            </button>
          </div>

          <div className="arena-selector" data-testid="arena-selector">
            <span className="arena-label">{t('arena_label')}</span>
            <div className="arena-options">
              {(() => {
                const arenas = listArenas();
                const themes = listThemes();
                return arenas.map(a => {
                  const theme = themes.find(th => th.id === a.themeId);
                  return (
                    <button
                      key={a.id}
                      className={`arena-option ${matchSettings.arenaId === a.id ? 'selected' : ''}`}
                      onClick={() => {
                        audio.init();
                        audio.play('select');
                        setMatchSettings({ arenaId: a.id });
                      }}
                    >
                      <div className="arena-preview" style={{ background: theme?.previewGradient || '#333' }}>
                        <span className="arena-icon">{theme?.previewIcon || ''}</span>
                      </div>
                      <span className="arena-name">{t(theme?.nameKey || a.name)}</span>
                    </button>
                  );
                });
              })()}
              <button
                className={`arena-option ${matchSettings.arenaId === 'random' ? 'selected' : ''}`}
                onClick={() => {
                  audio.init();
                  audio.play('select');
                  setMatchSettings({ arenaId: 'random' });
                }}
              >
                <div className="arena-preview arena-preview-random">
                  <span className="arena-icon">🎲</span>
                </div>
                <span className="arena-name">{t('arena_random')}</span>
              </button>
            </div>
          </div>

          <div className="menu-settings">
            <div className="bot-settings" data-testid="bot-settings">
              <div className="bot-count-row">
                <span className="bot-label">{t('bot_label')}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.max(0, matchSettings.botCount - 1) })}
                  disabled={matchSettings.botCount <= 0}
                >-</button>
                <span className="bot-count" data-testid="bot-count">{matchSettings.botCount}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.min(5, matchSettings.botCount + 1) })}
                  disabled={matchSettings.botCount >= 5}
                >+</button>
              </div>
              {matchSettings.botCount > 0 && (
                <div className="bot-difficulty-row">
                  {(['easy', 'medium', 'hard', 'impossible'] as const).map(d => (
                    <button
                      key={d}
                      className={`difficulty-btn ${matchSettings.botDifficulty === d ? 'selected' : ''}`}
                      onClick={() => setMatchSettings({ botDifficulty: d })}
                    >
                      {t(`bot_diff_${d}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="gore-toggle">
            <input
              type="checkbox"
              checked={matchSettings.goreMode}
              onChange={(e) => setMatchSettings({ goreMode: e.target.checked })}
              data-testid="gore-toggle"
            />
            <span>{t('blood_mode')}</span>
          </label>
          <div className="lang-toggle">
            {[
              { code: 'en', label: 'EN', flag: <><rect width="60" height="40" fill="#012169"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="7"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4"/><path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="10"/><path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/></> },
              { code: 'cs', label: 'CS', flag: <><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#D7141A"/><polygon points="0,0 30,20 0,40" fill="#11457E"/></> },
              { code: 'hi', label: 'HI', flag: <><rect width="60" height="13.3" fill="#FF9933"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.7" width="60" height="13.3" fill="#138808"/><circle cx="30" cy="20" r="4" fill="none" stroke="#000080" strokeWidth="0.8"/></> },
              { code: 'fil', label: 'FIL', flag: <><rect width="60" height="20" fill="#0038A8"/><rect y="20" width="60" height="20" fill="#CE1126"/><polygon points="0,0 28,20 0,40" fill="#fff"/><circle cx="9" cy="20" r="3" fill="none" stroke="#FCD116" strokeWidth="0.8"/></> },
            ].map((lang, i) => (
              <span key={lang.code}>
                {i > 0 && ' | '}
                <span
                  onClick={() => i18n.changeLanguage(lang.code)}
                  style={{ fontWeight: i18n.language === lang.code ? 'bold' : 'normal', opacity: i18n.language === lang.code ? 1 : 0.6 }}
                >
                  <svg width="18" height="12" viewBox="0 0 60 40" style={{ verticalAlign: 'middle', marginRight: 4 }}>{lang.flag}</svg>
                  {lang.label}
                </span>
              </span>
            ))}
          </div>
          <button className="btn-base help-btn" onClick={() => { audio.init(); audio.play('select'); setHelpOpen(true); }}>
            {t('help_button')}
          </button>
          <button className="btn-base mods-btn" onClick={() => { audio.init(); audio.play('select'); setModsOpen(true); }}>
            {t('mods_button')}
          </button>
          {helpOpen && (
            <div className="mods-overlay" onClick={() => setHelpOpen(false)}>
              <div className="help-modal" onClick={e => e.stopPropagation()}>
                <h2 className="mods-title">{t('help_title')}</h2>
                <div className="help-sections">
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_goal_title')}</h3>
                    <p className="help-text">{t('help_goal')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_scoring_title')}</h3>
                    <p className="help-text">{t('help_scoring')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_controls_title')}</h3>
                    <div className="help-controls-grid">
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} className="help-control-line">{t(`help_controls_p${n}`)}</span>
                      ))}
                    </div>
                    <p className="help-text help-controls-note">{t('help_controls_note')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_pickups_title')}</h3>
                    <p className="help-text">{t('help_pickups_carrots')}</p>
                    <p className="help-text">{t('help_pickups_springs')}</p>
                    <p className="help-text">{t('help_pickups_thorns')}</p>
                    <p className="help-text">{t('help_pickups_falloff')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_lobby_title')}</h3>
                    <p className="help-text">{t('help_lobby')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_options_title')}</h3>
                    <p className="help-text">{t('help_options_arena')}</p>
                    <p className="help-text">{t('help_options_bots')}</p>
                    <p className="help-text">{t('help_options_blood')}</p>
                    <p className="help-text">{t('help_options_mods')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_online_title')}</h3>
                    <p className="help-text">{t('help_online_desc')}</p>
                    <p className="help-text">{t('help_online_steps')}</p>
                  </div>
                  <div className="help-section">
                    <h3 className="help-section-title">{t('help_tips_title')}</h3>
                    <p className="help-text">{t('help_tips')}</p>
                  </div>
                </div>
                <button className="btn-base mods-close-btn" onClick={() => setHelpOpen(false)}>
                  {t('help_close')}
                </button>
              </div>
            </div>
          )}
          {modsOpen && (
            <div className="mods-overlay" onClick={() => setModsOpen(false)}>
              <div className="mods-modal" onClick={e => e.stopPropagation()}>
                <h2 className="mods-title">{t('mods_title')}</h2>
                {([
                  { key: 'extremeGore', name: 'mod_extreme_gore', desc: 'mod_extreme_gore_desc' },
                  { key: 'carrotChase', name: 'mod_carrot_chase', desc: 'mod_carrot_chase_desc' },
                  { key: 'giantPlayers', name: 'mod_giant_players', desc: 'mod_giant_players_desc' },
                  { key: 'turbo', name: 'mod_turbo', desc: 'mod_turbo_desc' },
                  { key: 'superBounce', name: 'mod_super_bounce', desc: 'mod_super_bounce_desc' },
                  { key: 'mirrorArena', name: 'mod_mirror', desc: 'mod_mirror_desc' },
                  { key: 'underwaterGravity', name: 'mod_underwater_gravity', desc: 'mod_underwater_gravity_desc' },
                  { key: 'noMusic', name: 'mod_no_music', desc: 'mod_no_music_desc' },
                ] as const).map(mod => (
                  <div className="mod-row" key={mod.key}>
                    <label className="mod-toggle">
                      <input
                        type="checkbox"
                        checked={matchSettings.mods[mod.key as keyof typeof matchSettings.mods]}
                        onChange={(e) => setMatchSettings({ mods: { ...matchSettings.mods, [mod.key]: e.target.checked } })}
                      />
                      <div className="mod-info">
                        <span className="mod-name">{t(mod.name)}</span>
                        <span className="mod-desc">{t(mod.desc)}</span>
                      </div>
                    </label>
                  </div>
                ))}
                <button className="btn-base mods-close-btn" onClick={() => setModsOpen(false)}>
                  {t('mods_close')}
                </button>
              </div>
            </div>
          )}
          {onlineOpen && (
            <div className="mods-overlay" onClick={() => { if (onlineStep === 'choose') { setOnlineOpen(false); setOnlineJoinMode(false); } }}>
              <div className="mods-modal online-modal" onClick={e => e.stopPropagation()}>
                <h2 className="mods-title">{t('online_play', 'Online Play')}</h2>

                {/* Step 1: Choose create or join */}
                {onlineStep === 'choose' && !onlineJoinMode && (
                  <div className="online-step">
                    {matchSettings.botCount > 0 && <p className="online-info">{(() => {
                      const n = matchSettings.botCount;
                      if (i18n.language === 'cs') {
                        if (n === 1) return t('online_bots_info_one');
                        if (n >= 2 && n <= 4) return t('online_bots_info_few', { count: n });
                        return t('online_bots_info_other', { count: n });
                      }
                      return t('online_bots_info', { count: n });
                    })()}</p>}
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
                    <button className="btn-base mods-close-btn" onClick={() => setOnlineOpen(false)}>{t('back', 'Back')}</button>
                  </div>
                )}

                {/* Step 1b: Enter join code */}
                {onlineStep === 'choose' && onlineJoinMode && (
                  <div className="online-step">
                    <p className="online-join-label">{t('enter_room_code', 'Enter the room code:')}</p>
                    <input className="online-code-input" data-testid="online-code-input" type="text" maxLength={3} placeholder={t('code_placeholder', 'Code')}
                      value={onlineJoinCode} autoFocus
                      onChange={(e) => setOnlineJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && onlineJoinCode.length >= 3) { audio.play('select'); onlineConnect(false, onlineJoinCode); } }}
                    />
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

                    {online.isHost && (
                      <div className="online-section">
                        <span className="online-section-title">{t('your_character', 'Your character')}</span>
                        <select className="online-char-select" value={onlineLocalChar}
                          onChange={(e) => {
                            setOnlineLocalChar(e.target.value); onlineLocalCharRef.current = e.target.value;
                            localStorage.setItem('bunnybrawl_online_char', e.target.value);
                            onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: e.target.value });
                          }}>
                          {allChars.map(c => <option key={c.name} value={c.name} disabled={c.name === online.remoteCharacterName}>{getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}{c.name === online.remoteCharacterName ? ` (${t('taken', 'taken')})` : ''}</option>)}
                        </select>
                      </div>
                    )}

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

                    <div className="online-section">
                      <span className="online-section-title">{t('your_character', 'Your character')}</span>
                      <select className="online-char-select" value={onlineLocalChar} disabled={onlineLocalReady}
                        onChange={(e) => {
                          setOnlineLocalChar(e.target.value); onlineLocalCharRef.current = e.target.value;
                          localStorage.setItem('bunnybrawl_online_char', e.target.value);
                          onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: e.target.value });
                        }}>
                        {(() => {
                          const takenNames = new Set(online.remotePlayers.map(rp => rp.characterName));
                          if (online.remoteCharacterName) takenNames.add(online.remoteCharacterName);
                          return allChars.map(c => (
                            <option key={c.name} value={c.name} disabled={takenNames.has(c.name)}>
                              {getCharacterEmoji(c.name)} {getCharacterDisplayName(c.name, i18n.language)}{takenNames.has(c.name) ? ` (${t('taken', 'taken')})` : ''}
                            </option>
                          ));
                        })()}
                      </select>
                    </div>

                    <div className="online-section">
                      <span className="online-section-title">{t('players', 'Players')} ({1 + online.remotePlayers.length}/4)</span>
                      <div className="online-player-list">
                        {/* Show all remote players */}
                        {online.remotePlayers.length > 0 ? (
                          online.remotePlayers.map(rp => (
                            <div className="online-player-row" key={rp.slot}>
                              <span className="online-char-name">
                                {getCharacterEmoji(rp.characterName)} {getCharacterDisplayName(rp.characterName, i18n.language)}
                                <span style={{ opacity: 0.5, marginLeft: 6, fontSize: '0.85em' }}>({rp.slot})</span>
                              </span>
                              {rp.ready && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
                            </div>
                          ))
                        ) : (
                          <div className="online-player-row">
                            <span className="online-char-name">
                              {online.remoteCharacterName
                                ? `${getCharacterEmoji(online.remoteCharacterName)} ${getCharacterDisplayName(online.remoteCharacterName, i18n.language)}`
                                : t('choosing', 'Choosing...')}
                            </span>
                            {!online.isHost && <span className="online-host-badge">{t('host', 'HOST')}</span>}
                            {onlineRemoteReady && <span className="online-ready-badge">{t('ready', 'READY')}</span>}
                          </div>
                        )}
                        {matchSettings.botCount > 0 && ALL_BOT_SLOTS.slice(0, matchSettings.botCount).map(slot => (
                          <div className="online-player-row online-bot-row" key={slot}>
                            <span className="online-char-name">🤖 {t('bot_label', 'Bot')} ({t(`bot_diff_${matchSettings.botDifficulty}`)})</span>
                          </div>
                        ))}
                      </div>
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

                    {/* Host: always show start button once connected */}
                    {online.isHost && (
                      <button className="btn-base menu-btn play-btn" data-testid="online-start-btn" onClick={() => {
                        audio.play('select');
                        // Send authoritative sync before START_MATCH so all peers agree on roster
                        const ms = useGameStore.getState().matchSettings;
                        const seed = useGameStore.getState().online.rngSeed || Math.floor(Math.random() * 0xFFFFFFFF);
                        setOnline({ rngSeed: seed });
                        onlineTransportRef.current?.sendReliable({
                          type: MsgType.SETTINGS_SYNC, arenaId: ms.arenaId, killLimit: ms.killLimit,
                          timeLimit: ms.timeLimit, goreMode: ms.goreMode,
                          mods: ms.mods as unknown as Record<string, boolean>,
                          rngSeed: seed, botCount: ms.botCount, botDifficulty: ms.botDifficulty,
                        } as ReliableMessage);
                        // Send CHARACTER_SELECT with host's final character
                        onlineTransportRef.current?.sendReliable({ type: MsgType.CHARACTER_SELECT, characterName: onlineLocalCharRef.current });
                        onlineTransportRef.current?.sendReliable({ type: MsgType.START_MATCH } as ReliableMessage);
                        onlineStartMatch();
                      }}>{t('start_game', 'Start Game!')}</button>
                    )}

                    <button className="btn-base mods-close-btn" onClick={() => { onlineCleanup(); }}>{t('back', 'Back')}</button>
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
          )}
        </div>
        <div className="build-info">
          {new Date(__BUILD_TIME__).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          {' '}
          {new Date(__BUILD_TIME__).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
