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
  });
});
