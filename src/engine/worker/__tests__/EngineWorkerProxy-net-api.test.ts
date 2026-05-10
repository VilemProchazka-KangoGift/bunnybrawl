// Phase 2 Task 13 — main-side net-mode methods on EngineWorkerProxy.
// Type-shape only: a Worker spawn would need DOM globals; the prototype
// inspection is enough to lock the API contract NetMatch will drive.

import { describe, it, expect } from 'vitest';
import { EngineWorkerProxy } from '../EngineWorkerProxy';

describe('EngineWorkerProxy net API', () => {
  it('exposes the net-mode methods NetMatch + HostAuthority drive', () => {
    const proto = EngineWorkerProxy.prototype as unknown as Record<string, unknown>;
    for (const name of [
      'setNetMode',
      'pumpIncomingSnapshot',
      'disconnectPlayer',
      'reconnectSlot',
      'onSnapshotReady',
    ]) {
      expect(typeof proto[name], `missing ${name}`).toBe('function');
    }
  });
});
