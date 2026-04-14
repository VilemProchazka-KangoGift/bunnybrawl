/**
 * WebRTC transport layer using Trystero (serverless signaling via Nostr).
 * Supports multi-guest star topology: host accepts N guests, relays inputs.
 * Each guest connects only to the host.
 *
 * Replaces PeerJS with Trystero for zero-server-dependency signaling.
 * Room-based API maps directly to game lobby create/join flow.
 */
import { joinRoom } from 'trystero/nostr';
import type { Room, ActionSender } from 'trystero/nostr';
import {
  MsgType,
  encodePing, encodePong, decodePingPong,
} from './protocol';
import type { ReliableMessage } from './protocol';
import { NetworkSimulator, readSimConfigFromUrl } from './networkSimulator';

export type ConnectionStatus = 'idle' | 'creating' | 'joining' | 'connected' | 'disconnected' | 'error';
export type ConnectionHealth = 'healthy' | 'degraded' | 'lost';

export interface PeerInfo {
  peerId: string;
  rtt: number;
  jitter: number;
  lastPongTime: number;
  health: ConnectionHealth;
}

export interface TransportEvents {
  onStatusChange: (status: ConnectionStatus, error?: string) => void;
  onReliableMessage: (msg: ReliableMessage, fromPeerId?: string) => void;
  onUnreliableMessage: (data: ArrayBuffer, fromPeerId?: string) => void;
  onRttUpdate: (rttMs: number) => void;
  onPeerConnected?: (peerId: string) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onPeerHealthChange?: (peerId: string, health: ConnectionHealth) => void;
}

const APP_ID = 'carrot-royale-v1';
const PING_INTERVAL = 500;
const PONG_TIMEOUT_MS = 5000;
const DEGRADED_THRESHOLD_MS = 2000;
const RTT_ALPHA = 0.1;

// TURN config (free relay for symmetric NAT fallback)
const TURN_DISABLED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noturn');

const TURN_SERVERS = TURN_DISABLED ? [] : [
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ],
    username: 'c3df312aef92720b59dfd78e',
    credential: 'fiR6/CHXZdpjR4cC',
  },
];

function getRoomConfig(roomId: string) {
  return {
    config: {
      appId: APP_ID,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.relay.metered.ca:80' },
          ...TURN_SERVERS,
        ],
      },
      turnConfig: TURN_SERVERS.length > 0 ? TURN_SERVERS : undefined,
    },
    roomId,
  };
}

export class Transport {
  private room: Room | null = null;
  private peers: Map<string, PeerInfo> = new Map();
  private events: TransportEvents;
  private status: ConnectionStatus = 'idle';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _isHost = false;
  private _roomCode: string | null = null;
  private simulator: NetworkSimulator | null = null;
  private simFlushTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenAt = 0;
  private handleVisibilityChange: () => void;

  // Trystero action senders
  private sendBinaryAction: ActionSender<ArrayBuffer> | null = null;
  private sendJsonAction: ActionSender<string> | null = null;

  // Aggregate RTT/jitter
  private _rtt = 0;
  private _jitter = 0;
  private _isRelay = false;

  constructor(events: TransportEvents) {
    this.events = events;
    const simConfig = readSimConfigFromUrl();
    if (simConfig) {
      this.simulator = new NetworkSimulator(simConfig);
      console.log('[Transport] Network simulator active:', simConfig);
    }
    this.handleVisibilityChange = () => {
      if (document.hidden) {
        this.hiddenAt = performance.now();
      } else if (this.hiddenAt > 0) {
        const hiddenDuration = performance.now() - this.hiddenAt;
        if (hiddenDuration > 2000 && this.status === 'connected') {
          for (const info of this.peers.values()) {
            info.lastPongTime = performance.now();
          }
          this.sendUnreliable(encodePing(performance.now()));
        }
        this.hiddenAt = 0;
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  get isHost(): boolean { return this._isHost; }
  get currentRtt(): number {
    if (this.simulator?.enabled) {
      const cfg = this.simulator.getConfig();
      return this._rtt + cfg.latencyMs * 2;
    }
    return this._rtt;
  }
  get currentJitter(): number {
    if (this.simulator?.enabled) {
      return this._jitter + this.simulator.getConfig().jitterMs;
    }
    return this._jitter;
  }
  get connected(): boolean { return this.status === 'connected'; }
  get roomCode(): string | null { return this._roomCode; }
  get peerCount(): number { return this.peers.size; }
  get isRelay(): boolean { return this._isRelay; }

  getPeerIds(): string[] { return Array.from(this.peers.keys()); }
  getPeerInfo(peerId: string): PeerInfo | undefined { return this.peers.get(peerId); }

  setEvents(events: TransportEvents): void {
    this.events = events;
  }

  /** Create a room as host. Returns the room code. */
  async createRoom(): Promise<string> {
    this.setStatus('creating');
    this._isHost = true;

    const code = generateRoomCode();
    this._roomCode = code;

    try {
      const { config, roomId } = getRoomConfig(`room-${code.toUpperCase()}`);
      this.room = joinRoom(config, roomId);
    } catch (e) {
      this.setStatus('error', `Failed to create room: ${e}`);
      throw e;
    }

    this.setupRoom();

    // Room is "created" immediately — Trystero uses decentralized signaling
    // so there's no server to confirm with. Resolve right away.
    return code;
  }

  /** Join a room as guest by room code. */
  async joinRoom(code: string): Promise<void> {
    this.setStatus('joining');
    this._isHost = false;
    this._roomCode = code;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus('error', 'Connection timed out. Check the room code or try again.');
        reject(new Error('timeout'));
      }, 20000); // 20s timeout for Nostr discovery

      try {
        const { config, roomId } = getRoomConfig(`room-${code.toUpperCase()}`);
        this.room = joinRoom(config, roomId);
      } catch (e) {
        clearTimeout(timeout);
        this.setStatus('error', `Failed to join room: ${e}`);
        reject(e);
        return;
      }

      this.setupRoom();

      // Wait for at least one peer (the host) to connect
      const origOnPeerConnected = this.events.onPeerConnected;
      const checkConnected = (peerId: string) => {
        clearTimeout(timeout);
        this.events.onPeerConnected = origOnPeerConnected;
        origOnPeerConnected?.(peerId);
        resolve();
      };
      this.events.onPeerConnected = checkConnected;
    });
  }

  /** Send a reliable JSON message to ALL connected peers. */
  sendReliable(msg: ReliableMessage): void {
    if (!this.sendJsonAction) return;
    const json = JSON.stringify(msg);
    this.sendJsonAction(json).catch(() => {});
  }

  /** Send a reliable JSON message to a specific peer. */
  sendReliableTo(peerId: string, msg: ReliableMessage): void {
    if (!this.sendJsonAction) return;
    const json = JSON.stringify(msg);
    this.sendJsonAction(json, peerId).catch(() => {});
  }

  /** Send an unreliable binary message to ALL connected peers. */
  sendUnreliable(data: ArrayBuffer): void {
    if (!this.sendBinaryAction) return;
    this.sendBinaryAction(data).catch(() => {});
  }

  /** Send an unreliable binary message to a specific peer. */
  sendUnreliableTo(peerId: string, data: ArrayBuffer): void {
    if (!this.sendBinaryAction) return;
    this.sendBinaryAction(data, peerId).catch(() => {});
  }

  /** Send DISCONNECT and leave room. */
  gracefulDisconnect(): void {
    try {
      this.sendReliable({ type: MsgType.DISCONNECT } as ReliableMessage);
    } catch { /* ignore */ }
    setTimeout(() => this.destroy(), 100);
  }

  /** Clean up all resources. */
  destroy(): void {
    if (this.simFlushTimer) {
      clearInterval(this.simFlushTimer);
      this.simFlushTimer = null;
    }
    this.stopPing();
    if (this.room) {
      this.room.leave().catch(() => {});
      this.room = null;
    }
    this.peers.clear();
    this.sendBinaryAction = null;
    this.sendJsonAction = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.setStatus('idle');
  }

  private setupRoom(): void {
    if (!this.room) return;

    // Create actions for binary and JSON channels
    const [sendBinary, onBinary] = this.room.makeAction<ArrayBuffer>('bin');
    const [sendJson, onJson] = this.room.makeAction<string>('json');

    this.sendBinaryAction = sendBinary;
    this.sendJsonAction = sendJson;

    // Handle incoming binary data
    onBinary((data: ArrayBuffer, peerId: string) => {
      this.onIncomingData(data, peerId, true);
    });

    // Handle incoming JSON data
    onJson((data: string, peerId: string) => {
      this.onIncomingData(data, peerId, false);
    });

    // Peer join/leave
    this.room.onPeerJoin((peerId: string) => {
      const info: PeerInfo = {
        peerId,
        rtt: 0,
        jitter: 0,
        lastPongTime: performance.now(),
        health: 'healthy',
      };
      this.peers.set(peerId, info);

      if (this.status !== 'connected') {
        this.setStatus('connected');
        this.startPing();
      }

      // Setup network simulator flush if needed
      if (this.simulator?.enabled && !this.simFlushTimer) {
        this.simFlushTimer = setInterval(() => this.flushSimulator(), 2);
      }

      this.events.onPeerConnected?.(peerId);
    });

    this.room.onPeerLeave((peerId: string) => {
      this.removePeer(peerId);
    });
  }

  private removePeer(peerId: string): void {
    const info = this.peers.get(peerId);
    if (!info) return;
    this.peers.delete(peerId);
    this.events.onPeerDisconnected?.(peerId);

    if (this.peers.size === 0) {
      this.setStatus('disconnected');
      this.stopPing();
    }
  }

  private onIncomingData(data: unknown, fromPeerId: string, isBinary: boolean): void {
    if (this.simulator?.enabled) {
      if (isBinary) {
        const pp = decodePingPong(data as ArrayBuffer);
        if (pp) {
          this.handleBinaryMessage(data as ArrayBuffer, fromPeerId);
          return;
        }
      }
      this.simulator.enqueue({ data, fromPeerId }, !isBinary);
    } else {
      this.deliverData(data, fromPeerId, isBinary);
    }
  }

  private deliverData(data: unknown, fromPeerId: string, isBinary: boolean): void {
    if (isBinary && data instanceof ArrayBuffer) {
      this.handleBinaryMessage(data, fromPeerId);
    } else if (!isBinary && typeof data === 'string') {
      this.handleJsonMessage(data, fromPeerId);
    }
  }

  private flushSimulator(): void {
    if (!this.simulator) return;
    const ready = this.simulator.flush();
    for (const msg of ready) {
      const { data, fromPeerId } = msg.data as { data: unknown; fromPeerId: string };
      const isBinary = data instanceof ArrayBuffer;
      this.deliverData(data, fromPeerId, isBinary);
    }
  }

  private handleBinaryMessage(data: ArrayBuffer, fromPeerId: string): void {
    const pp = decodePingPong(data);
    if (pp) {
      if (pp.type === MsgType.PING) {
        this.sendUnreliableTo(fromPeerId, encodePong(pp.timestamp));
      } else if (pp.type === MsgType.PONG) {
        const rtt = performance.now() - pp.timestamp;
        if (rtt >= 0 && rtt < 10000) {
          const info = this.peers.get(fromPeerId);
          if (info) {
            const deviation = Math.abs(rtt - info.rtt);
            info.rtt = info.rtt === 0 ? rtt : info.rtt * (1 - RTT_ALPHA) + rtt * RTT_ALPHA;
            info.jitter = info.jitter === 0 ? deviation : info.jitter * 0.9 + deviation * 0.1;
            info.lastPongTime = performance.now();
            if (info.health !== 'healthy') {
              info.health = 'healthy';
              this.events.onPeerHealthChange?.(fromPeerId, 'healthy');
            }
          }
          this.updateAggregateRtt();
          this.events.onRttUpdate(this._rtt);
        }
      }
      return;
    }

    this.events.onUnreliableMessage(data, fromPeerId);
  }

  private handleJsonMessage(data: string, fromPeerId: string): void {
    try {
      const msg = JSON.parse(data) as ReliableMessage;
      this.events.onReliableMessage(msg, fromPeerId);
    } catch {
      // Malformed message
    }
  }

  private updateAggregateRtt(): void {
    if (this.peers.size === 0) return;
    let totalRtt = 0;
    let totalJitter = 0;
    for (const info of this.peers.values()) {
      totalRtt += info.rtt;
      totalJitter += info.jitter;
    }
    this._rtt = totalRtt / this.peers.size;
    this._jitter = totalJitter / this.peers.size;
  }

  private startPing(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      if (this.status !== 'connected') return;

      this.sendUnreliable(encodePing(performance.now()));

      const now = performance.now();
      for (const [peerId, info] of this.peers) {
        if (info.lastPongTime <= 0) continue;
        const elapsed = now - info.lastPongTime;

        if (elapsed > PONG_TIMEOUT_MS && info.health !== 'lost') {
          info.health = 'lost';
          this.events.onPeerHealthChange?.(peerId, 'lost');
          console.warn(`[Transport] Peer ${peerId} timeout — no pong for ${PONG_TIMEOUT_MS}ms`);
          this.removePeer(peerId);
        } else if (elapsed > DEGRADED_THRESHOLD_MS && info.health === 'healthy') {
          info.health = 'degraded';
          this.events.onPeerHealthChange?.(peerId, 'degraded');
        }
      }
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this.status = status;
    this.events.onStatusChange(status, error);
  }
}

// ---- Room code generation ----

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
