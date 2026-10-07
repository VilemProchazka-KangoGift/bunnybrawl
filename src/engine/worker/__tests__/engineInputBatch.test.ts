import { describe, it, expect } from 'vitest';
import { applyInputBatchTo } from '../inputBatch';
import type { PlayerSlot, InputState } from '../../types';

/** Phase 2 Task 8 seam. The worker's `applyInputBatch` mutates a module-scope
 *  Map; the pure helper takes the Map by reference so tests don't need a
 *  full worker harness. Used both by the host-mode batch ingest and the
 *  guest-mode local input forward path that the netmatch async refactor
 *  introduces. */
describe('applyInputBatchTo', () => {
  it('replaces map contents — slots dropped from the batch are evicted', () => {
    const map = new Map<PlayerSlot, InputState>();
    map.set('P1', { left: true, right: false, jump: false, down: false });
    map.set('P2', { left: false, right: true, jump: false, down: false });

    applyInputBatchTo(map, [['P1', { left: false, right: true, jump: true, down: false }]]);

    expect(map.size).toBe(1);
    expect(map.get('P1')).toEqual({ left: false, right: true, jump: true, down: false });
    expect(map.has('P2')).toBe(false);
  });

  it('retains a jump when a neutral batch arrives before simulation reads it', () => {
    const map = new Map<PlayerSlot, InputState>();
    applyInputBatchTo(map, [['P1', { left: false, right: true, jump: true, down: false }]]);
    applyInputBatchTo(map, [['P1', { left: true, right: false, jump: false, down: true }]]);
    expect(map.get('P1')).toEqual({ left: true, right: false, jump: true, down: true });
  });

  it('does not retain mutable references to producer input scratches', () => {
    const map = new Map<PlayerSlot, InputState>();
    const input = { left: false, right: false, jump: true, down: false };
    applyInputBatchTo(map, [['P1', input]]);
    input.jump = false;
    expect(map.get('P1')?.jump).toBe(true);
  });

  it('accepts an empty batch — map is cleared', () => {
    const map = new Map<PlayerSlot, InputState>();
    map.set('P1', { left: true, right: false, jump: false, down: false });
    applyInputBatchTo(map, []);
    expect(map.size).toBe(0);
  });
});
