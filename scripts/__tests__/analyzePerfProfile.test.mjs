import { describe, it, expect } from 'vitest';
import { flattenCpuProfile, computeFrameStats, bucketByModule } from '../analyzePerfProfile.mjs';

describe('analyzePerfProfile helpers', () => {
  describe('flattenCpuProfile', () => {
    it('aggregates self-time per node id from samples + timeDeltas', () => {
      const profile = {
        nodes: [
          { id: 1, callFrame: { functionName: 'a', url: 'http://x/a.js', lineNumber: 10, columnNumber: 0 }, hitCount: 0 },
          { id: 2, callFrame: { functionName: 'b', url: 'http://x/b.js', lineNumber: 20, columnNumber: 0 }, hitCount: 0 },
        ],
        samples: [1, 1, 2],
        timeDeltas: [100, 200, 300],
      };
      const flat = flattenCpuProfile(profile);
      expect(flat).toHaveLength(2);
      const totalSelf = flat.reduce((sum, n) => sum + n.selfMs, 0);
      expect(totalSelf).toBeCloseTo(0.6, 5);
    });

    it('drops V8 internal nodes from output', () => {
      const profile = {
        nodes: [
          { id: 1, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1, columnNumber: -1 }, hitCount: 0 },
          { id: 2, callFrame: { functionName: 'real', url: 'http://x/a.js', lineNumber: 10, columnNumber: 0 }, hitCount: 0 },
        ],
        samples: [1, 2],
        timeDeltas: [100, 100],
      };
      const flat = flattenCpuProfile(profile);
      expect(flat.find((n) => n.functionName === '(garbage collector)')).toBeUndefined();
      expect(flat.find((n) => n.functionName === 'real')).toBeDefined();
    });
  });

  describe('computeFrameStats', () => {
    it('returns mean, p50, p95, p99, max, and long-frame counts', () => {
      const dts = [10, 12, 14, 14, 15, 16, 17, 18, 20, 100];
      const stats = computeFrameStats(dts);
      expect(stats.count).toBe(10);
      expect(stats.meanMs).toBeCloseTo(23.6, 1);
      expect(stats.maxMs).toBe(100);
      expect(stats.long16ms).toBe(4);
      expect(stats.long33ms).toBe(1);
    });

    it('returns zeros for empty samples', () => {
      const stats = computeFrameStats([]);
      expect(stats.count).toBe(0);
      expect(stats.meanMs).toBe(0);
    });
  });

  describe('bucketByModule', () => {
    it('aggregates self-time by top-level engine module', () => {
      const flat = [
        { source: 'src/engine/rendering/players.ts', selfMs: 100, functionName: 'a' },
        { source: 'src/engine/rendering/particles.ts', selfMs: 50, functionName: 'b' },
        { source: 'src/engine/ai/awareness.ts', selfMs: 30, functionName: 'c' },
        { source: 'src/engine/audio/AudioManager.ts', selfMs: 10, functionName: 'd' },
        { source: null, selfMs: 5, functionName: 'unresolved' },
      ];
      const buckets = bucketByModule(flat);
      const find = (m) => buckets.find((b) => b.module === m);
      expect(find('rendering')?.selfMs).toBe(150);
      expect(find('ai')?.selfMs).toBe(30);
      expect(find('audio')?.selfMs).toBe(10);
      expect(find('other')?.selfMs).toBe(5);
    });
  });
});
