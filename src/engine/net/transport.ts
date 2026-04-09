/**
 * WebRTC transport layer using PeerJS.
 * Supports multi-guest star topology: host accepts N guests, relays inputs.
 * Each guest connects only to the host.
 */
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
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
  conn: DataConnection;
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

const PEER_PREFIX = 'brawl-';
const PING_INTERVAL = 500;
const PONG_TIMEOUT_MS = 5000;
const DEGRADED_THRESHOLD_MS = 2000;
const RTT_ALPHA = 0.1;

export class Transport {
  private peer: Peer | null = null;
  private peers: Map<string, PeerInfo> = new Map(); // peerId → connection info
  private events: TransportEvents;
  private status: ConnectionStatus = 'idle';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _isHost = false;
  private _roomCode: string | null = null;
  private simulator: NetworkSimulator | null = null;
  private simFlushTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenAt = 0;
  private handleVisibilityChange: () => void;

  // Aggregate RTT/jitter (average across all peers, or single peer for guest)
  private _rtt = 0;
  private _jitter = 0;

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
          // Suppress pong timeout for the duration we were hidden
          for (const info of this.peers.values()) {
            info.lastPongTime = performance.now();
          }
          // Send immediate ping to check if connections are still alive
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
  get currentRtt(): number { return this._rtt; }
  get currentJitter(): number { return this._jitter; }
  get connected(): boolean { return this.status === 'connected'; }
  get roomCode(): string | null { return this._roomCode; }
  get peerCount(): number { return this.peers.size; }

  /** Get all connected peer IDs. */
  getPeerIds(): string[] { return Array.from(this.peers.keys()); }

  /** Get peer info by ID. */
  getPeerInfo(peerId: string): PeerInfo | undefined { return this.peers.get(peerId); }

  /** Replace event callbacks (used when transitioning from lobby to match). */
  setEvents(events: TransportEvents): void {
    this.events = events;
  }

  /** Create a room as host. Returns the room code. */
  async createRoom(): Promise<string> {
    this.setStatus('creating');
    this._isHost = true;

    const code = generateRoomCode();
    this._roomCode = code;
    const peerId = PEER_PREFIX + code;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus('error', 'Connection to signaling server timed out. The free PeerJS server may be down — try again in a moment.');
        reject(new Error('timeout'));
      }, 10000);

      try {
        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });
      } catch (e) {
        clearTimeout(timeout);
        this.setStatus('error', `Failed to create peer: ${e}`);
        reject(e);
        return;
      }

      this.peer.on('open', () => {
        clearTimeout(timeout);
        resolve(code);
      });

      // Accept multiple incoming connections (multi-guest)
      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        this.setStatus('error', err.type === 'unavailable-id'
          ? 'Room code already in use — try again'
          : `Signaling error: ${err.type} — ${err.message}`);
        reject(err);
      });

      this.peer.on('disconnected', () => {
        clearTimeout(timeout);
        if (this.status === 'connected') {
          // Try to reconnect signaling (data channels may still work)
          try { this.peer?.reconnect(); } catch { /* ignore */ }
        } else if (this.status === 'creating') {
          this.setStatus('error', 'Lost connection to signaling server');
        }
      });
    });
  }

  /** Join a room as guest by room code. */
  async joinRoom(code: string): Promise<void> {
    this.setStatus('joining');
    this._isHost = false;
    this._roomCode = code;

    const hostPeerId = PEER_PREFIX + code.toUpperCase();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus('error', 'Connection timed out. Check the room code or try again.');
        reject(new Error('timeout'));
      }, 10000);

      try {
        this.peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });
      } catch (e) {
        clearTimeout(timeout);
        this.setStatus('error', `Failed to create peer: ${e}`);
        reject(e);
        return;
      }

      const origOnStatusChange = this.events.onStatusChange;
      this.events.onStatusChange = (status, error) => {
        origOnStatusChange(status, error);
        if (status === 'connected') {
          clearTimeout(timeout);
          this.events.onStatusChange = origOnStatusChange;
          resolve();
        } else if (status === 'error') {
          clearTimeout(timeout);
          this.events.onStatusChange = origOnStatusChange;
          reject(new Error(error || 'Connection failed'));
        }
      };

      this.peer.on('open', () => {
        const conn = this.peer!.connect(hostPeerId, { reliable: true });
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        this.events.onStatusChange = origOnStatusChange;
        this.setStatus('error', err.type === 'peer-unavailable'
          ? 'Room not found — check the code and try again'
          : `Signaling error: ${err.type} — ${err.message}`);
        reject(err);
      });
    });
  }

  /** Send a reliable JSON message to ALL connected peers. */
  sendReliable(msg: ReliableMessage): void {
    const json = JSON.stringify(msg);
    for (const info of this.peers.values()) {
      if (!info.conn.open) continue;
      try {
        info.conn.send(json);
      } catch (e) {
        console.warn('[Transport] sendReliable error:', e);
      }
    }
  }

  /** Send a reliable JSON message to a specific peer. */
  sendReliableTo(peerId: string, msg: ReliableMessage): void {
    const info = this.peers.get(peerId);
    if (!info?.conn.open) return;
    try {
      info.conn.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[Transport] sendReliableTo error:', e);
    }
  }

  /** Send an unreliable binary message to ALL connected peers. */
  sendUnreliable(data: ArrayBuffer): void {
    for (const info of this.peers.values()) {
      if (!info.conn.open) continue;
      try {
        info.conn.send(data);
      } catch { /* closing */ }
    }
  }

  /** Send an unreliable binary message to a specific peer. */
  sendUnreliableTo(peerId: string, data: ArrayBuffer): void {
    const info = this.peers.get(peerId);
    if (!info?.conn.open) return;
    try {
      info.conn.send(data);
    } catch { /* closing */ }
  }

  /** Send DISCONNECT and destroy after brief delay. */
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
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const info of this.peers.values()) {
      try { info.conn.close(); } catch { /* ignore */ }
    }
    this.peers.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.setStatus('idle');
  }

  private setupConnection(conn: DataConnection): void {
    const peerId = conn.peer;

    const onOpen = () => {
      // Register this peer
      const info: PeerInfo = {
        peerId,
        conn,
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
      this.events.onPeerConnected?.(peerId);
    };

    conn.on('open', onOpen);

    // PeerJS race: connection may already be open
    if (conn.open) {
      onOpen();
    }

    conn.on('data', (data: unknown) => {
      this.onIncomingData(data, peerId);
    });

    if (this.simulator?.enabled && !this.simFlushTimer) {
      this.simFlushTimer = setInterval(() => this.flushSimulator(), 2);
    }

    conn.on('close', () => {
      this.removePeer(peerId);
    });

    conn.on('error', (err) => {
      console.warn(`[Transport] Connection error from ${peerId}:`, err.message);
      this.removePeer(peerId);
    });
  }

  private removePeer(peerId: string): void {
    const info = this.peers.get(peerId);
    if (!info) return;
    this.peers.delete(peerId);
    this.events.onPeerDisconnected?.(peerId);

    // If no peers left, we're disconnected
    if (this.peers.size === 0) {
      this.setStatus('disconnected');
      this.stopPing();
    }
  }

  private onIncomingData(data: unknown, fromPeerId: string): void {
    if (this.simulator?.enabled) {
      let isBinary = false;
      if (data instanceof ArrayBuffer) {
        isBinary = true;
      } else if (data && typeof data === 'object' && !Array.isArray(data) && typeof data !== 'string') {
        const typed = data as { buffer?: ArrayBuffer };
        if (typed.buffer instanceof ArrayBuffer) {
          isBinary = true;
          data = typed.buffer;
        }
      }
      if (isBinary) {
        const pp = decodePingPong(data as ArrayBuffer);
        if (pp) {
          this.handleBinaryMessage(data as ArrayBuffer, fromPeerId);
          return;
        }
      }
      this.simulator.enqueue({ data, fromPeerId }, !isBinary);
    } else {
      this.deliverData(data, fromPeerId);
    }
  }

  private deliverData(data: unknown, fromPeerId: string): void {
    if (data instanceof ArrayBuffer) {
      this.handleBinaryMessage(data, fromPeerId);
    } else if (typeof data === 'string') {
      this.handleJsonMessage(data, fromPeerId);
    } else if (data && typeof data === 'object') {
      const typed = data as { buffer?: ArrayBuffer };
      if (typed.buffer instanceof ArrayBuffer) {
        this.handleBinaryMessage(typed.buffer, fromPeerId);
      }
    }
  }

  private flushSimulator(): void {
    if (!this.simulator) return;
    const ready = this.simulator.flush();
    for (const msg of ready) {
      const { data, fromPeerId } = msg.data as { data: unknown; fromPeerId: string };
      this.deliverData(data, fromPeerId);
    }
  }

  private handleBinaryMessage(data: ArrayBuffer, fromPeerId: string): void {
    const pp = decodePingPong(data);
    if (pp) {
      if (pp.type === MsgType.PING) {
        // Reply to the specific peer
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
            // Update health
            if (info.health !== 'healthy') {
              info.health = 'healthy';
              this.events.onPeerHealthChange?.(fromPeerId, 'healthy');
            }
          }
          // Update aggregate RTT (average across peers)
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
    if (this.pingTimer) return; // already running
    this.pingTimer = setInterval(() => {
      if (this.status !== 'connected') return;

      this.sendUnreliable(encodePing(performance.now()));

      // Check per-peer health
      const now = performance.now();
      for (const [peerId, info] of this.peers) {
        if (info.lastPongTime <= 0) continue;
        const elapsed = now - info.lastPongTime;

        if (elapsed > PONG_TIMEOUT_MS && info.health !== 'lost') {
          info.health = 'lost';
          this.events.onPeerHealthChange?.(peerId, 'lost');
          console.warn(`[Transport] Peer ${peerId} timeout — no pong for ${PONG_TIMEOUT_MS}ms`);
          // Remove peer after timeout
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
