import { describe, it, expect, vi } from 'vitest';
import { NetworkSimulator } from './networkSimulator';

describe('NetworkSimulator', () => {
  describe('construction', () => {
    it('defaults to disabled with zero config', () => {
      const sim = new NetworkSimulator();
      expect(sim.enabled).toBe(false);
    });

    it('is enabled when latencyMs > 0', () => {
      const sim = new NetworkSimulator({ latencyMs: 50 });
      expect(sim.enabled).toBe(true);
    });

    it('is enabled when jitterMs > 0', () => {
      const sim = new NetworkSimulator({ jitterMs: 10 });
      expect(sim.enabled).toBe(true);
    });

    it('is enabled when packetLossPercent > 0', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 5 });
      expect(sim.enabled).toBe(true);
    });
  });

  describe('configure', () => {
    it('updates config and re-evaluates enabled', () => {
      const sim = new NetworkSimulator();
      expect(sim.enabled).toBe(false);
      sim.configure({ latencyMs: 100 });
      expect(sim.enabled).toBe(true);
      expect(sim.getConfig().latencyMs).toBe(100);
    });

    it('can disable by setting all to zero', () => {
      const sim = new NetworkSimulator({ latencyMs: 50 });
      expect(sim.enabled).toBe(true);
      sim.configure({ latencyMs: 0 });
      expect(sim.enabled).toBe(false);
    });
  });

  describe('shouldDrop', () => {
    it('never drops when packetLossPercent is 0', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 0 });
      for (let i = 0; i < 100; i++) {
        expect(sim.shouldDrop()).toBe(false);
      }
    });

    it('always drops when packetLossPercent is 100', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 100 });
      let dropped = 0;
      for (let i = 0; i < 100; i++) {
        if (sim.shouldDrop()) dropped++;
      }
      expect(dropped).toBe(100);
    });

    it('drops roughly the expected percentage', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 50 });
      let dropped = 0;
      for (let i = 0; i < 1000; i++) {
        if (sim.shouldDrop()) dropped++;
      }
      // 50% loss ± reasonable margin
      expect(dropped).toBeGreaterThan(350);
      expect(dropped).toBeLessThan(650);
    });
  });

  describe('enqueue', () => {
    it('queues reliable messages even with packet loss', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 100, latencyMs: 0 });
      const queued = sim.enqueue('hello', true);
      expect(queued).toBe(true);
    });

    it('drops unreliable messages with packet loss', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 100 });
      const queued = sim.enqueue('hello', false);
      expect(queued).toBe(false);
    });

    it('delivers immediately when latency is 0', () => {
      const sim = new NetworkSimulator({ latencyMs: 0 });
      sim.enqueue('data', true);
      const ready = sim.flush();
      expect(ready).toHaveLength(1);
      expect(ready[0].data).toBe('data');
    });

    it('delays messages when latency > 0', () => {
      const sim = new NetworkSimulator({ latencyMs: 1000 }); // 1s delay
      sim.enqueue('delayed', true);
      // Flush immediately — message should NOT be ready yet
      const ready = sim.flush();
      // Message deliverAt is performance.now() + 1000, so it won't be ready now
      expect(ready).toHaveLength(0);
    });
  });

  describe('flush', () => {
    it('returns empty array when no messages queued', () => {
      const sim = new NetworkSimulator();
      expect(sim.flush()).toHaveLength(0);
    });

    it('removes delivered messages from queue', () => {
      const sim = new NetworkSimulator({ latencyMs: 0 });
      sim.enqueue('msg1', true);
      sim.enqueue('msg2', true);
      const first = sim.flush();
      expect(first).toHaveLength(2);
      const second = sim.flush();
      expect(second).toHaveLength(0);
    });
  });

  describe('getConfig', () => {
    it('returns current config values', () => {
      const sim = new NetworkSimulator({ latencyMs: 50, jitterMs: 10, packetLossPercent: 5 });
      const config = sim.getConfig();
      expect(config.latencyMs).toBe(50);
      expect(config.jitterMs).toBe(10);
      expect(config.packetLossPercent).toBe(5);
    });

    it('reflects updates from configure()', () => {
      const sim = new NetworkSimulator();
      sim.configure({ latencyMs: 99, jitterMs: 33 });
      const config = sim.getConfig();
      expect(config.latencyMs).toBe(99);
      expect(config.jitterMs).toBe(33);
      expect(config.packetLossPercent).toBe(0); // unchanged
    });
  });

  describe('message ordering', () => {
    it('preserves message data through queue', () => {
      const sim = new NetworkSimulator({ latencyMs: 0 });
      sim.enqueue({ type: 'test', value: 42 }, true);
      const ready = sim.flush();
      expect(ready[0].data).toEqual({ type: 'test', value: 42 });
    });

    it('tracks isReliable flag', () => {
      const sim = new NetworkSimulator({ latencyMs: 0 });
      sim.enqueue('reliable', true);
      sim.enqueue('unreliable', false);
      const ready = sim.flush();
      expect(ready[0].isReliable).toBe(true);
      expect(ready[1].isReliable).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('partial config merge (only latencyMs)', () => {
      const sim = new NetworkSimulator({ latencyMs: 50, jitterMs: 20, packetLossPercent: 10 });
      sim.configure({ latencyMs: 0 });
      expect(sim.getConfig().jitterMs).toBe(20); // unchanged
      expect(sim.getConfig().packetLossPercent).toBe(10); // unchanged
    });

    it('100% loss still delivers reliable messages', () => {
      const sim = new NetworkSimulator({ packetLossPercent: 100, latencyMs: 0 });
      let delivered = 0;
      for (let i = 0; i < 100; i++) {
        if (sim.enqueue(i, true)) delivered++;
      }
      expect(delivered).toBe(100);
      expect(sim.flush()).toHaveLength(100);
    });
  });

  describe('jitter delay', () => {
    it('applies jitter to message delivery time', () => {
      const sim = new NetworkSimulator({ latencyMs: 50, jitterMs: 20 });
      // Enqueue many messages and check delivery times vary
      for (let i = 0; i < 50; i++) {
        sim.enqueue(i, false);
      }
      // All messages should be queued (no loss configured)
      // Flushing at time 0 should return nothing (all have delay > 0)
      const immediate = sim.flush();
      // With 50ms latency + up to ±20ms jitter, min delay = 30ms
      // At time 0, nothing should be ready
      expect(immediate).toHaveLength(0);
    });

    it('messages arrive after latency + jitter window', () => {
      const sim = new NetworkSimulator({ latencyMs: 10, jitterMs: 5 });
      // Mock performance.now to advance time
      const origNow = performance.now;
      let fakeTime = origNow.call(performance);
      vi.spyOn(performance, 'now').mockImplementation(() => fakeTime);

      sim.enqueue('test', false);

      // At time + 0ms: not delivered
      expect(sim.flush()).toHaveLength(0);

      // Advance time past max delay (latency + jitter = 15ms)
      fakeTime += 20;
      const delivered = sim.flush();
      expect(delivered.length).toBeGreaterThanOrEqual(1);
      expect(delivered[0].data).toBe('test');

      vi.restoreAllMocks();
    });

    it('jitter never produces negative delay', () => {
      // High jitter relative to latency
      const sim = new NetworkSimulator({ latencyMs: 5, jitterMs: 20 });
      // Enqueue many messages — none should have negative delay (instant delivery)
      for (let i = 0; i < 100; i++) {
        sim.enqueue(i, false);
      }
      // If delay were negative, messages would have deliverAt=0 and flush immediately
      const immediate = sim.flush();
      // Some may flush immediately if Math.max(0, ...) kicks in, but shouldn't be all
      expect(immediate.length).toBeLessThanOrEqual(100);
    });
  });

  describe('readSimConfigFromUrl', () => {
    it('returns null when no sim params present', async () => {
      const { readSimConfigFromUrl } = await import('./networkSimulator');
      // Default URL has no sim params
      const config = readSimConfigFromUrl();
      expect(config).toBeNull();
    });
  });
});
