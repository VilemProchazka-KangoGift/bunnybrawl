import { describe, it, expect, vi } from 'vitest';
import { detectPlayerTransitions, snapshotPlayerCosmeticState } from '../playerTransitions';
import type { PrevPlayerCosmeticState, TransitionCallbacks } from '../playerTransitions';
import type { Player, MatchState, PlayerSlot } from '../../../types';
import type { SfxCooldowns } from '../sfx';

// Locks the `lightBurst` callback wiring on splat (stomp) and respawn
// transitions. The conflict-resolution path most likely to silently break
// these is a re-merge of `playerTransitions.ts` that drops the cb.lightBurst
// calls or moves them outside the rising-edge guards.

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'P1' as PlayerSlot, active: true, state: 'idle', x: 100, y: 200,
    vx: 0, vy: 0, width: 32, height: 40,
    score: 0, character: { name: 'Bunny', color: '#FF8800' } as any,
    fatTimer: 0, sideSquash: 1, burnTimer: 0, slowTimer: 0,
    invincibleTimer: 0, fastFalling: false, springTrailTimer: 0,
    damageFlashTimer: 0, hitstopTimer: 0,
    disconnected: false,
    ...overrides,
  } as Player;
}

function makeCallbacks(): Required<Pick<TransitionCallbacks, 'lightBurst'>> & TransitionCallbacks {
  return {
    playSound: vi.fn(),
    playAnimal: vi.fn(),
    spawnDustParticles: vi.fn(),
    spawnJumpDustParticles: vi.fn(),
    spawnKillSplatter: vi.fn(),
    pickupCarrotVFX: vi.fn(),
    spawnPlayerSpawnVFX: vi.fn(),
    onStomp: vi.fn(),
    lightBurst: vi.fn(),
  };
}

const emptyState = { shockwaves: [] } as unknown as MatchState;
const emptyCooldowns: Map<PlayerSlot, SfxCooldowns> = new Map();

describe('detectPlayerTransitions — lightBurst wiring', () => {
  it('fires lightBurst with kind="stomp" at victim center on splat transition', () => {
    const cb = makeCallbacks();
    const player = makePlayer({ x: 100, y: 200, width: 32, height: 40, state: 'splat' });
    const prev: PrevPlayerCosmeticState = snapshotPlayerCosmeticState(makePlayer({ state: 'airborne' }));

    detectPlayerTransitions(player, prev, emptyState, emptyCooldowns, cb);

    expect(cb.lightBurst).toHaveBeenCalledTimes(1);
    expect(cb.lightBurst).toHaveBeenCalledWith(116, 220, 'stomp'); // x + w/2, y + h/2
  });

  it('fires lightBurst with kind="spawn" at player center on respawn (invincibleTimer rising)', () => {
    const cb = makeCallbacks();
    const player = makePlayer({ x: 300, y: 400, width: 32, height: 40, invincibleTimer: 2.0 });
    const prev: PrevPlayerCosmeticState = snapshotPlayerCosmeticState(makePlayer({ invincibleTimer: 0 }));

    detectPlayerTransitions(player, prev, emptyState, emptyCooldowns, cb);

    expect(cb.lightBurst).toHaveBeenCalledTimes(1);
    expect(cb.lightBurst).toHaveBeenCalledWith(316, 420, 'spawn');
  });

  it('does NOT fire lightBurst on idle→idle (no transition)', () => {
    const cb = makeCallbacks();
    const player = makePlayer();
    const prev = snapshotPlayerCosmeticState(player);

    detectPlayerTransitions(player, prev, emptyState, emptyCooldowns, cb);

    expect(cb.lightBurst).not.toHaveBeenCalled();
  });

  it('does NOT fire lightBurst on disconnect-induced splat (player.disconnected guard)', () => {
    const cb = makeCallbacks();
    const player = makePlayer({ state: 'splat', disconnected: true });
    const prev = snapshotPlayerCosmeticState(makePlayer({ state: 'idle' }));

    detectPlayerTransitions(player, prev, emptyState, emptyCooldowns, cb);

    expect(cb.lightBurst).not.toHaveBeenCalled();
  });

  it('still fires when lightBurst is the only optional callback (no onStomp)', () => {
    const cb = { ...makeCallbacks(), onStomp: undefined };
    const player = makePlayer({ state: 'splat' });
    const prev = snapshotPlayerCosmeticState(makePlayer({ state: 'airborne' }));

    detectPlayerTransitions(player, prev, emptyState, emptyCooldowns, cb);

    expect(cb.lightBurst).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'stomp');
  });
});
