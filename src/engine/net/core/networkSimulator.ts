/**
 * Network condition simulator for testing under adverse conditions.
 * Wraps the transport receive path to inject artificial latency, jitter, and packet loss.
 * Activated via URL params: ?simLatency=50&simJitter=20&simLoss=5
 * Or at runtime: window.__netSim.configure({ latencyMs: 100, jitterMs: 30, packetLossPercent: 5 })
 */

export interface SimulatorConfig {
  /** One-way added latency in ms (applied to receive path) */
  latencyMs: number;
  /** +/- random variation on latency in ms */
  jitterMs: number;
  /** 0-100, chance of dropping unreliable (binary) packets */
  packetLossPercent: number;
}

interface QueuedMessage {
  data: unknown;
  deliverAt: number;
  isReliable: boolean;
}

const DEFAULT_CONFIG: SimulatorConfig = {
  latencyMs: 0,
  jitterMs: 0,
  packetLossPercent: 0,
};

export class NetworkSimulator {
  private config: SimulatorConfig;
  private queue: QueuedMessage[] = [];
  private _enabled = false;

  constructor(config?: Partial<SimulatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._enabled = this.config.latencyMs > 0 || this.config.jitterMs > 0 || this.config.packetLossPercent > 0;
  }

  get enabled(): boolean { return this._enabled; }

  configure(config: Partial<SimulatorConfig>): void {
    Object.assign(this.config, config);
    this._enabled = this.config.latencyMs > 0 || this.config.jitterMs > 0 || this.config.packetLossPercent > 0;
  }

  getConfig(): Readonly<SimulatorConfig> {
    return this.config;
  }

  /** Check if an unreliable packet should be dropped. */
  shouldDrop(): boolean {
    if (this.config.packetLossPercent <= 0) return false;
    return Math.random() * 100 < this.config.packetLossPercent;
  }

  /** Get the delay for a message (latency + jitter). */
  private getDelay(): number {
    const jitter = this.config.jitterMs > 0
      ? (Math.random() - 0.5) * 2 * this.config.jitterMs
      : 0;
    return Math.max(0, this.config.latencyMs + jitter);
  }

  /** Queue a message for delayed delivery. Returns true if queued, false if dropped. */
  enqueue(data: unknown, isReliable: boolean): boolean {
    // Only drop unreliable messages (reliable = TCP-like, always arrives)
    if (!isReliable && this.shouldDrop()) {
      return false;
    }
    const delay = this.getDelay();
    if (delay <= 0) {
      // No delay — deliver immediately
      this.queue.push({ data, deliverAt: 0, isReliable });
      return true;
    }
    this.queue.push({
      data,
      deliverAt: performance.now() + delay,
      isReliable,
    });
    return true;
  }

  /** Flush messages that are ready for delivery. */
  flush(): QueuedMessage[] {
    if (this.queue.length === 0) return [];

    const now = performance.now();
    const ready: QueuedMessage[] = [];
    let writeIdx = 0;

    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].deliverAt <= now) {
        ready.push(this.queue[i]);
      } else {
        this.queue[writeIdx++] = this.queue[i];
      }
    }
    this.queue.length = writeIdx;

    return ready;
  }
}

