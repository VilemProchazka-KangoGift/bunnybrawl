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
import { NetworkSimulator, readSimConfigFromUrl } from './networkSimulator';

export type ConnectionStatus = 'idle' | 'creating' | 'joining' | 'connected' | 'disconnected' | 'error';

export interface TransportEvents {
  onStatusChange: (status: ConnectionStatus, error?: string) => void;
  onReliableMessage: (msg: ReliableMessage) => void;
  onUnreliableMessage: (data: ArrayBuffer) => void;
  onRttUpdate: (rttMs: number) => void;
}

const PEER_PREFIX = 'brawl-';
const PING_INTERVAL = 500;
const PONG_TIMEOUT_MS = 5000; // disconnect if no pong for this long
const RTT_ALPHA = 0.1; // EMA smoothing

export class Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private events: TransportEvents;
  private status: ConnectionStatus = 'idle';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private rtt = 0;
  private _jitter = 0;        // EMA of |sample - smoothedRtt|
  private _rttMin = Infinity;
  private _rttMax = 0;
  private _isHost = false;
  private lastPongTime = 0;
  private simulator: NetworkSimulator | null = null;
  private simFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(events: TransportEvents) {
    this.events = events;
    // Auto-configure simulator from URL params (?simLatency=50&simJitter=20&simLoss=5)
    const simConfig = readSimConfigFromUrl();
    if (simConfig) {
      this.simulator = new NetworkSimulator(simConfig);
      console.log('[Transport] Network simulator active:', simConfig);
    }
  }

  get isHost(): boolean { return this._isHost; }
  get currentRtt(): number { return this.rtt; }
  get currentJitter(): number { return this._jitter; }
  get rttMin(): number { return this._rttMin; }
  get rttMax(): number { return this._rttMax; }
  get connected(): boolean { return this.status === 'connected'; }

  /** Replace event callbacks (used when transitioning from lobby to match). */
  setEvents(events: TransportEvents): void {
    this.events = events;
  }

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

      // Resolve when we reach 'connected' status (set by setupConnection)
      const origOnStatusChange = this.events.onStatusChange;
      this.events.onStatusChange = (status, error) => {
        origOnStatusChange(status, error);
        if (status === 'connected') {
          clearTimeout(timeout);
          this.events.onStatusChange = origOnStatusChange; // restore
          resolve();
        } else if (status === 'error') {
          clearTimeout(timeout);
          this.events.onStatusChange = origOnStatusChange;
          reject(new Error(error || 'Connection failed'));
        }
      };

      this.peer.on('open', () => {
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true,
        });
        this.conn = conn;
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

  /** Send a reliable JSON message. */
  sendReliable(msg: ReliableMessage): void {
    if (!this.conn) return;
    if (!this.conn.open) {
      console.warn('[Transport] sendReliable called but conn not open, status:', this.status);
      return;
    }
    try {
      this.conn.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[Transport] sendReliable error:', e);
    }
  }

  /** Send an unreliable binary message (inputs). */
  sendUnreliable(data: ArrayBuffer): void {
    if (!this.conn || !this.conn.open) return;
    try {
      this.conn.send(data);
    } catch {
      // Connection might be closing
    }
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
    const onOpen = () => {
      if (this.status !== 'connected') {
        this.setStatus('connected');
        this.startPing();
      }
    };

    conn.on('open', onOpen);

    // PeerJS race: on the host side, the connection may already be open
    // by the time peer.on('connection') fires and we attach listeners.
    if (conn.open) {
      onOpen();
    }

    conn.on('data', (data: unknown) => {
      this.onIncomingData(data);
    });

    // Start simulator flush loop if active
    if (this.simulator?.enabled && !this.simFlushTimer) {
      this.simFlushTimer = setInterval(() => this.flushSimulator(), 2);
    }

    conn.on('close', () => {
      this.setStatus('disconnected');
      this.stopPing();
    });

    conn.on('error', (err) => {
      this.setStatus('error', err.message);
    });
  }

  /** Route incoming data through simulator (if active) or handle directly. */
  private onIncomingData(data: unknown): void {
    if (this.simulator?.enabled) {
      // Determine if binary (unreliable) or string (reliable)
      let isBinary = false;
      if (data instanceof ArrayBuffer) {
        isBinary = true;
      } else if (data && typeof data === 'object' && !Array.isArray(data) && typeof data !== 'string') {
        const typed = data as { buffer?: ArrayBuffer };
        if (typed.buffer instanceof ArrayBuffer) {
          isBinary = true;
          data = typed.buffer; // normalize to ArrayBuffer
        }
      }
      // Ping/pong bypass simulator (they measure real RTT)
      if (isBinary) {
        const pp = decodePingPong(data as ArrayBuffer);
        if (pp) {
          this.handleBinaryMessage(data as ArrayBuffer);
          return;
        }
      }
      this.simulator.enqueue(data, !isBinary);
    } else {
      this.deliverData(data);
    }
  }

  /** Deliver data directly to the appropriate handler. */
  private deliverData(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.handleBinaryMessage(data);
    } else if (typeof data === 'string') {
      this.handleJsonMessage(data);
    } else if (data && typeof data === 'object') {
      const typed = data as { buffer?: ArrayBuffer };
      if (typed.buffer instanceof ArrayBuffer) {
        this.handleBinaryMessage(typed.buffer);
      }
    }
  }

  /** Flush delayed messages from the simulator. */
  private flushSimulator(): void {
    if (!this.simulator) return;
    const ready = this.simulator.flush();
    for (const msg of ready) {
      this.deliverData(msg.data);
    }
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    // Check if it's a ping/pong
    const pp = decodePingPong(data);
    if (pp) {
      if (pp.type === MsgType.PING) {
        // Reply with pong
        this.sendUnreliable(encodePong(pp.timestamp));
      } else if (pp.type === MsgType.PONG) {
        // Calculate RTT + jitter
        const rtt = performance.now() - pp.timestamp;
        if (rtt >= 0 && rtt < 10000) { // sanity check
          const deviation = Math.abs(rtt - this.rtt);
          this.rtt = this.rtt === 0 ? rtt : this.rtt * (1 - RTT_ALPHA) + rtt * RTT_ALPHA;
          this._jitter = this._jitter === 0 ? deviation : this._jitter * 0.9 + deviation * 0.1;
          this._rttMin = Math.min(this._rttMin, rtt);
          this._rttMax = Math.max(this._rttMax, rtt);
          this.lastPongTime = performance.now();
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
    this.lastPongTime = performance.now();
    this.pingTimer = setInterval(() => {
      if (this.status === 'connected') {
        this.sendUnreliable(encodePing(performance.now()));
        // Detect peer timeout: no pong received for 5 seconds
        if (this.lastPongTime > 0 && performance.now() - this.lastPongTime > PONG_TIMEOUT_MS) {
          console.warn('[Transport] Peer timeout — no pong received');
          this.setStatus('disconnected');
          this.stopPing();
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

// No ambiguous characters (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
