import { describe, it, expect } from 'vitest';
import { ClientPrediction } from './clientPrediction';
import type { SnapshotPlayer } from './snapshot';
import type { PlayerSlot, Arena } from '../types';

const mockArena: Arena = {
  id: 'test',
  name: 'Test',
  themeId: 'test',
  width: 1280,
  height: 720,
  platforms: [{ x: 0, y: 660, width: 1280, height: 60 }],
  spawnPoints: [{ x: 200, y: 600 }],
};

function makeAuthPlayer(x = 200, y = 620): SnapshotPlayer {
  return {
    id: 'P2' as PlayerSlot,
    x, y, vx: 0, vy: 0,
    state: 'idle', facing: 'right', animFrame: 0, score: 0,
    hitstopTimer: 0, invincibleTimer: 0, fastFalling: false,
    splatTimer: 0, respawnTimer: 0, fatTimer: 0, slowTimer: 0,
    burnTimer: 0, squashScale: 1, expression: 'normal',
    killStreak: 0, disconnected: false, active: true,
    width: 32, height: 32,
  };
}

describe('ClientPrediction', () => {
  it('constructs with local slot and arena', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    expect(pred.localSlot).toBe('P2');
  });

  it('predict moves position with input', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    // Initialize at a known position
    pred.initFromSnapshot(makeAuthPlayer(200, 620));

    // Predict with right input
    pred.predict({ left: false, right: true, jump: false, down: false }, 1 / 60);

    const pos = pred.getPredictedPosition();
    expect(pos.x).toBeGreaterThan(200); // moved right
  });

  it('predict applies gravity', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    // Place above ground with no platform collision
    pred.initFromSnapshot(makeAuthPlayer(200, 400));

    pred.predict({ left: false, right: false, jump: false, down: false }, 1 / 60);

    const pos = pred.getPredictedPosition();
    expect(pos.vy).toBeGreaterThan(0); // falling
  });

  it('reconcile snaps on large correction', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    pred.initFromSnapshot(makeAuthPlayer(200, 620));

    // Reconcile with a position far away (>30px)
    pred.reconcile(makeAuthPlayer(500, 620));

    const pos = pred.getPredictedPosition();
    expect(pos.x).toBe(500);
  });

  it('reconcile smooths on small correction', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    pred.initFromSnapshot(makeAuthPlayer(200, 620));

    // Reconcile with a position slightly off (< 30px)
    pred.reconcile(makeAuthPlayer(210, 625));

    const pos = pred.getPredictedPosition();
    // Should accept authoritative position
    expect(pos.x).toBe(210);
    expect(pos.y).toBe(625);

    // Visual offset should be non-zero (smoothing)
    const display = pred.getDisplayPosition();
    // Display includes visual offset: predicted + offset
    // offset = old predicted (200) - new authoritative (210) = -10
    expect(display.x).not.toBe(210); // offset shifts it
  });

  it('decayVisualOffset reduces offset toward zero', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    pred.initFromSnapshot(makeAuthPlayer(200, 620));
    pred.reconcile(makeAuthPlayer(210, 620)); // small correction, creates offset

    // Copy display x before decay (getDisplayPosition reuses cached object)
    const xBefore = pred.getDisplayPosition().x;
    const offsetBefore = Math.abs(xBefore - 210);

    pred.decayVisualOffset();

    const xAfter = pred.getDisplayPosition().x;
    const offsetAfter = Math.abs(xAfter - 210);

    expect(offsetAfter).toBeLessThan(offsetBefore);
  });

  it('getDisplayPosition equals predicted when no offset', () => {
    const pred = new ClientPrediction('P2' as PlayerSlot, mockArena);
    pred.initFromSnapshot(makeAuthPlayer(300, 500));
    // No reconciliation = no offset
    const display = pred.getDisplayPosition();
    const predicted = pred.getPredictedPosition();
    expect(display.x).toBe(predicted.x);
    expect(display.y).toBe(predicted.y);
  });
});
