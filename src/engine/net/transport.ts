/**
 * WebRTC transport layer using PeerJS.
 * Provides dual DataChannels: unreliable (inputs) + reliable (control).
 */
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import {
  MsgType,
  encodePing, encodePong, decodePingPong,
} from './protocol';
import type { ReliableMessage } from './protocol';

export type ConnectionStatus = 'idle' | 'creating' | 'joining' | 'connected' | 'disconnected' | 'error';

export interface TransportEvents {
  onStatusChange: (status: ConnectionStatus, error?: string) => void;
  onReliableMessage: (msg: ReliableMessage) => void;
  onUnreliableMessage: (data: ArrayBuffer) => void;
  onRttUpdate: (rttMs: number) => void;
}

const PEER_PREFIX = 'brawl-';
const PING_INTERVAL = 500;
const RTT_ALPHA = 0.1; // EMA smoothing

export class Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private events: TransportEvents;
  private status: ConnectionStatus = 'idle';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private rtt = 0;
  private _isHost = false;

  constructor(events: TransportEvents) {
    this.events = events;
  }

  get isHost(): boolean { return this._isHost; }
  get currentRtt(): number { return this.rtt; }
  get connected(): boolean { return this.status === 'connected'; }

  /** Create a room as host. Returns the room code. */
  async createRoom(): Promise<string> {
    this.setStatus('creating');
    this._isHost = true;

    const code = generateRoomCode();
    const peerId = PEER_PREFIX + code;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus('error', 'Connection to signaling server timed out. The free PeerJS server may be down — try again in a moment.');
        reject(new Error('timeout'));
      }, 10000);

      try {
        this.peer = new Peer(peerId, {
          debug: 1, // log errors only
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

      this.peer.on('connection', (conn) => {
        this.conn = conn;
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
          this.setStatus('disconnected');
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

      this.peer.on('open', () => {
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true,
          serialization: 'none',
        });
        this.conn = conn;
        this.setupConnection(conn);

        conn.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          this.setStatus('error', `Connection error: ${err.message}`);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        this.setStatus('error', err.type === 'peer-unavailable'
          ? 'Room not found — check the code and try again'
          : `Signaling error: ${err.type} — ${err.message}`);
        reject(err);
      });
    });
  }

  /** Send a reliable JSON message. */
  sendReliable(msg: ReliableMessage): void {
    if (!this.conn || this.status !== 'connected') return;
    try {
      this.conn.send(JSON.stringify(msg));
    } catch {
      // Connection might be closing
    }
  }

  /** Send an unreliable binary message (inputs). */
  sendUnreliable(data: ArrayBuffer): void {
    if (!this.conn || this.status !== 'connected') return;
    try {
      this.conn.send(data);
    } catch {
      // Connection might be closing
    }
  }

  /** Clean up all resources. */
  destroy(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.setStatus('idle');
  }

  private setupConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.setStatus('connected');
      this.startPing();
    });

    conn.on('data', (data: unknown) => {
      if (data instanceof ArrayBuffer) {
        this.handleBinaryMessage(data);
      } else if (typeof data === 'string') {
        this.handleJsonMessage(data);
      }
    });

    conn.on('close', () => {
      this.setStatus('disconnected');
      this.stopPing();
    });

    conn.on('error', (err) => {
      this.setStatus('error', err.message);
    });
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    // Check if it's a ping/pong
    const pp = decodePingPong(data);
    if (pp) {
      if (pp.type === MsgType.PING) {
        // Reply with pong
        this.sendUnreliable(encodePong(pp.timestamp));
      } else if (pp.type === MsgType.PONG) {
        // Calculate RTT
        const rtt = performance.now() - pp.timestamp;
        if (rtt >= 0 && rtt < 10000) { // sanity check
          this.rtt = this.rtt === 0 ? rtt : this.rtt * (1 - RTT_ALPHA) + rtt * RTT_ALPHA;
          this.events.onRttUpdate(this.rtt);
        }
      }
      return;
    }

    // Otherwise it's an input message
    this.events.onUnreliableMessage(data);
  }

  private handleJsonMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as ReliableMessage;
      this.events.onReliableMessage(msg);
    } catch {
      // Malformed message, ignore
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.status === 'connected') {
        this.sendUnreliable(encodePing(performance.now()));
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

// No ambiguous characters (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
