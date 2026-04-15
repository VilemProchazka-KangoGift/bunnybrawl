import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatchState, Player, PlayerSlot, Carrot, SpringMushroom, Thorn } from '../types';

// Mock audio module — must come before GuestSFX import
vi.mock('../audio', () => ({
  audio: {
    play: vi.fn(),
    playAnimal: vi.fn(),
  },
}));

// Mock characters module
vi.mock('../characters', () => ({
  getCharacterForSlot: vi.fn((_slot: PlayerSlot) => ({ name: 'Bunny' })),
}));

import { GuestSFX } from './guestSfx';
import { audio } from '../audio';

// ── Helpers ──────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { id: PlayerSlot }): Player {
  return {
    id: overrides.id,
    character: { slot: overrides.id, name: 'Bunny', color: '#fff', darkColor: '#aaa', lightColor: '#eee' },
    x: 100, y: 100, vx: 0, vy: 0,
    width: 30, height: 40,
    state: 'idle',
    facing: 'right',
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true,
    animFrame: 0, animTimer: 0,
    fastFalling: false,
    fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0,
    sideSquash: 1,
    afterimages: [],
    idleAnimTimer: 0,
    expression: 'normal',
    killStreak: 0,
    breathTimer: 0,
    springTrailTimer: 0,
    damageFlashSide: null,
    damageFlashTimer: 0,
    burnTimer: 0,
    hitstopTimer: 0,
    renderOffsetX: 0,
    renderOffsetY: 0,
    disconnected: false,
    ...overrides,
  };
}

function makeCarrot(overrides: Partial<Carrot> = {}): Carrot {
  return { x: 200, y: 100, active: true, spawnTime: 0, ...overrides };
}

function makeSpring(overrides: Partial<SpringMushroom> = {}): SpringMushroom {
  return { x: 300, y: 100, platformIndex: 0, bounceTimer: 0, life: 10, growTimer: 0, ...overrides };
}

function makeThorn(overrides: Partial<Thorn> = {}): Thorn {
  return { x: 400, y: 100, width: 20, height: 20, platformIndex: 0, life: 10, growTimer: 0, hit: false, ...overrides };
}

function makeState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    players: [],
    killFeed: [],
    timeElapsed: 0,
    matchOver: false,
    winner: null,
    carrots: [],
    carrotTimer: 0,
    springs: [],
    thorns: [],
    springSpawnTimer: 0,
    thornSpawnTimer: 0,
    screenShake: 0,
    slowMotion: 0,
    weather: [],
    dayPhase: 0,
    countdown: 0,
    stats: { perPlayer: new Map() },
    shockwaves: [],
    screenFlash: 0,
    hitstopZoom: 0,
    wildlife: [],
    fogParticles: [],
    pollenParticles: [],
    shootingStars: [],
    scoreAnimations: [],
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer: 0,
    geyserStates: [],
    pigeonFlocks: [],
    bouncyWobble: new Map(),
    gibs: [],
    confetti: [],
    ...overrides,
  };
}

// Minimal mock for GameLoop — only the methods GuestSFX calls
function makeMockGameLoop() {
  return {
    spawnStompVfxPublic: vi.fn(),
    spawnGibsPublic: vi.fn(),
    spawnDustPublic: vi.fn(),
    spawnCarrotVfxPublic: vi.fn(),
  } as any; // cast to GameLoop since we only need these methods
}

// ── Tests ────────────────────────────────────────────────────

describe('GuestSFX', () => {
  let sfx: GuestSFX;
  let mockGameLoop: ReturnType<typeof makeMockGameLoop>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGameLoop = makeMockGameLoop();
    sfx = new GuestSFX(mockGameLoop);
  });

  describe('construction', () => {
    it('creates without errors', () => {
      expect(sfx).toBeDefined();
      expect(sfx).toBeInstanceOf(GuestSFX);
    });
  });

  describe('first update (initialization)', () => {
    it('should NOT trigger player SFX on the first update call', () => {
      // countdown: 3 avoids the countdown_go trigger (prevCountdown starts at 4)
      const state = makeState({
        players: [makePlayer({ id: 'P1', state: 'idle' })],
        countdown: 3,
      });
      sfx.update(state);

      // Player-related SFX should not fire on initialization
      expect(audio.play).not.toHaveBeenCalledWith('stomp');
      expect(audio.play).not.toHaveBeenCalledWith('jump');
      expect(audio.play).not.toHaveBeenCalledWith('land');
      expect(audio.play).not.toHaveBeenCalledWith('bump');
      expect(audio.play).not.toHaveBeenCalledWith('oof');
      expect(audio.playAnimal).not.toHaveBeenCalled();
      expect(mockGameLoop.spawnStompVfxPublic).not.toHaveBeenCalled();
      expect(mockGameLoop.spawnDustPublic).not.toHaveBeenCalled();
    });

    it('should NOT trigger stomp SFX if player starts in splat state', () => {
      const state = makeState({
        players: [makePlayer({ id: 'P1', state: 'splat' })],
        countdown: 3,
      });
      sfx.update(state);

      expect(audio.play).not.toHaveBeenCalledWith('stomp');
      expect(audio.playAnimal).not.toHaveBeenCalled();
    });

    it('should NOT trigger SFX for inactive players', () => {
      const state = makeState({
        players: [makePlayer({ id: 'P1', state: 'idle', active: false })],
        countdown: 3,
      });
      sfx.update(state);

      // Inactive players are skipped entirely, so no prev state stored
      // Second update with player now active and in splat should not trigger stomp
      // because there was no prev state
      const state2 = makeState({
        players: [makePlayer({ id: 'P1', state: 'splat', active: true })],
        countdown: 3,
      });
      sfx.update(state2);

      expect(audio.play).not.toHaveBeenCalledWith('stomp');
      expect(audio.playAnimal).not.toHaveBeenCalled();
    });
  });

  describe('player state transitions', () => {
    it('idle → splat triggers stomp sound, animal sound, and stomp VFX', () => {
      const player = makePlayer({ id: 'P1', state: 'idle' });
      sfx.update(makeState({ players: [player] }));

      vi.clearAllMocks();
      const splatted = makePlayer({ id: 'P1', state: 'splat' });
      sfx.update(makeState({ players: [splatted] }));

      expect(audio.play).toHaveBeenCalledWith('stomp');
      expect(audio.playAnimal).toHaveBeenCalledWith('Bunny');
      expect(mockGameLoop.spawnStompVfxPublic).toHaveBeenCalledWith(splatted);
    });

    it('run → splat triggers stomp sound', () => {
      const player = makePlayer({ id: 'P1', state: 'run' });
      sfx.update(makeState({ players: [player] }));

      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }));

      expect(audio.play).toHaveBeenCalledWith('stomp');
      expect(audio.playAnimal).toHaveBeenCalled();
    });

    it('airborne → splat triggers stomp sound', () => {
      const player = makePlayer({ id: 'P1', state: 'airborne' });
      sfx.update(makeState({ players: [player] }));

      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }));

      expect(audio.play).toHaveBeenCalledWith('stomp');
    });

    it('splat → splat does NOT re-trigger stomp', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }));

      expect(audio.play).not.toHaveBeenCalledWith('stomp');
    });

    it('respawning → splat does NOT trigger stomp (guard in condition)', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'respawning' })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }));

      expect(audio.play).not.toHaveBeenCalledWith('stomp');
    });

    it('airborne → idle triggers landing sound and dust VFX', () => {
      const player = makePlayer({ id: 'P1', state: 'airborne', vy: 400 });
      sfx.update(makeState({ players: [player] }));

      vi.clearAllMocks();
      const landed = makePlayer({ id: 'P1', state: 'idle' });
      sfx.update(makeState({ players: [landed] }));

      expect(audio.play).toHaveBeenCalledWith('land');
      expect(mockGameLoop.spawnDustPublic).toHaveBeenCalledWith(landed, 400);
    });

    it('airborne → run triggers landing sound and dust VFX', () => {
      const player = makePlayer({ id: 'P1', state: 'airborne', vy: 300 });
      sfx.update(makeState({ players: [player] }));

      vi.clearAllMocks();
      const landed = makePlayer({ id: 'P1', state: 'run' });
      sfx.update(makeState({ players: [landed] }));

      expect(audio.play).toHaveBeenCalledWith('land');
      expect(mockGameLoop.spawnDustPublic).toHaveBeenCalledWith(landed, 300);
    });

    it('idle → airborne triggers jump sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'airborne' })] }));

      expect(audio.play).toHaveBeenCalledWith('jump');
    });

    it('run → airborne triggers jump sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'airborne' })] }));

      expect(audio.play).toHaveBeenCalledWith('jump');
    });

    it('respawning → idle triggers land sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'respawning' })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }));

      expect(audio.play).toHaveBeenCalledWith('land');
    });
  });

  describe('push bump detection (sideSquash)', () => {
    it('sideSquash dropping from 1.0 to 0.8 triggers bump sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 1.0 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.8 })] }));

      expect(audio.play).toHaveBeenCalledWith('bump');
    });

    it('sideSquash dropping to 0.75 (wall hit) triggers bump sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 1.0 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.75 })] }));

      expect(audio.play).toHaveBeenCalledWith('bump');
    });

    it('sideSquash staying at 0.8 does NOT re-trigger bump', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.8 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.8 })] }));

      expect(audio.play).not.toHaveBeenCalledWith('bump');
    });

    it('sideSquash at 0.95 (just above threshold) dropping to 0.84 does NOT trigger', () => {
      // prev >= 0.95 check: 0.95 is on the boundary (passes >= 0.95)
      // but 0.84 is NOT < 0.85, so no trigger
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.95 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', sideSquash: 0.86 })] }));

      expect(audio.play).not.toHaveBeenCalledWith('bump');
    });
  });

  describe('burn damage detection', () => {
    it('burnTimer going from 0 to positive triggers oof sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', burnTimer: 0 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', burnTimer: 0.5 })] }));

      expect(audio.play).toHaveBeenCalledWith('oof');
    });

    it('burnTimer staying positive does NOT re-trigger', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', burnTimer: 0.5 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', burnTimer: 0.3 })] }));

      expect(audio.play).not.toHaveBeenCalledWith('oof');
    });
  });

  describe('geyser launch detection', () => {
    it('sudden vy drop > 300 triggers geyser sound', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', vy: 100 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', vy: -250 })] }));

      // prev.vy - player.vy = 100 - (-250) = 350 > 300
      expect(audio.play).toHaveBeenCalledWith('geyser');
    });

    it('small vy change does NOT trigger geyser', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', vy: 100 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', vy: -100 })] }));

      // prev.vy - player.vy = 100 - (-100) = 200 <= 300
      expect(audio.play).not.toHaveBeenCalledWith('geyser');
    });
  });

  describe('footstep sounds', () => {
    it('accumulates footstep time when player is running', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      vi.clearAllMocks();

      // Each update adds 1/60 ≈ 0.0167s. Need > 0.22s → ~14 updates
      for (let i = 0; i < 13; i++) {
        sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      }
      expect(audio.play).not.toHaveBeenCalledWith('land');

      // One more should cross the threshold (14 * 1/60 ≈ 0.233 > 0.22)
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      expect(audio.play).toHaveBeenCalledWith('land');
    });

    it('resets footstep accumulator when player stops running', () => {
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));

      // Accumulate partway
      for (let i = 0; i < 10; i++) {
        sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      }

      // Switch to idle — should reset accumulator
      sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }));
      vi.clearAllMocks();

      // Should need full 14 again after reset
      for (let i = 0; i < 13; i++) {
        sfx.update(makeState({ players: [makePlayer({ id: 'P1', state: 'run' })] }));
      }
      expect(audio.play).not.toHaveBeenCalledWith('land');
    });
  });

  describe('carrot pickup detection', () => {
    it('carrot active → inactive triggers crunch sound and VFX', () => {
      const carrot = makeCarrot({ active: true, x: 50, y: 60 });
      sfx.update(makeState({ carrots: [carrot] }));
      vi.clearAllMocks();

      const picked = makeCarrot({ active: false, x: 50, y: 60 });
      sfx.update(makeState({ carrots: [picked] }));

      expect(audio.play).toHaveBeenCalledWith('crunch');
      expect(mockGameLoop.spawnCarrotVfxPublic).toHaveBeenCalledWith(50, 60);
    });

    it('carrot staying active does NOT trigger', () => {
      sfx.update(makeState({ carrots: [makeCarrot({ active: true })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ carrots: [makeCarrot({ active: true })] }));

      expect(audio.play).not.toHaveBeenCalledWith('crunch');
    });

    it('first appearance of carrot does NOT trigger pickup', () => {
      // No carrots on first update
      sfx.update(makeState({ carrots: [] }));
      vi.clearAllMocks();

      // Carrot appears (spawned) as inactive — should NOT trigger
      sfx.update(makeState({ carrots: [makeCarrot({ active: false })] }));
      expect(audio.play).not.toHaveBeenCalledWith('crunch');
    });
  });

  describe('spring bounce detection', () => {
    it('bounceTimer going from 0 to positive triggers spring sound', () => {
      sfx.update(makeState({ springs: [makeSpring({ bounceTimer: 0 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ springs: [makeSpring({ bounceTimer: 0.3 })] }));

      expect(audio.play).toHaveBeenCalledWith('spring');
    });

    it('bounceTimer staying positive does NOT re-trigger', () => {
      sfx.update(makeState({ springs: [makeSpring({ bounceTimer: 0.3 })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ springs: [makeSpring({ bounceTimer: 0.2 })] }));

      expect(audio.play).not.toHaveBeenCalledWith('spring');
    });
  });

  describe('thorn hit detection', () => {
    it('thorn hit becoming true triggers thornhit sound', () => {
      sfx.update(makeState({ thorns: [makeThorn({ hit: false })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ thorns: [makeThorn({ hit: true })] }));

      expect(audio.play).toHaveBeenCalledWith('thornhit');
    });

    it('thorn hit staying true does NOT re-trigger', () => {
      sfx.update(makeState({ thorns: [makeThorn({ hit: true })] }));
      vi.clearAllMocks();
      sfx.update(makeState({ thorns: [makeThorn({ hit: true })] }));

      expect(audio.play).not.toHaveBeenCalledWith('thornhit');
    });
  });

  describe('countdown detection', () => {
    it('countdown ticking down triggers beep for each second boundary', () => {
      sfx.update(makeState({ countdown: 3.5 }));
      vi.clearAllMocks();

      // Move from 3.5 to 2.8 — ceil goes from 4 to 3, so beep should fire
      sfx.update(makeState({ countdown: 2.8 }));
      expect(audio.play).toHaveBeenCalledWith('countdown_beep');
    });

    it('countdown within same second does NOT trigger beep', () => {
      sfx.update(makeState({ countdown: 3.5 }));
      vi.clearAllMocks();

      // Still ceil = 4
      sfx.update(makeState({ countdown: 3.1 }));
      expect(audio.play).not.toHaveBeenCalledWith('countdown_beep');
    });

    it('countdown reaching 0 triggers go sound', () => {
      sfx.update(makeState({ countdown: 0.5 }));
      vi.clearAllMocks();

      sfx.update(makeState({ countdown: 0 }));
      expect(audio.play).toHaveBeenCalledWith('countdown_go');
    });

    it('countdown staying at 0 does NOT re-trigger go', () => {
      sfx.update(makeState({ countdown: 0.5 }));
      sfx.update(makeState({ countdown: 0 }));
      vi.clearAllMocks();

      sfx.update(makeState({ countdown: 0 }));
      expect(audio.play).not.toHaveBeenCalledWith('countdown_go');
    });
  });

  describe('match over detection', () => {
    it('matchOver becoming true triggers victory sound', () => {
      sfx.update(makeState({ matchOver: false }));
      vi.clearAllMocks();

      sfx.update(makeState({ matchOver: true }));
      expect(audio.play).toHaveBeenCalledWith('victory');
    });

    it('matchOver staying true does NOT re-trigger', () => {
      sfx.update(makeState({ matchOver: false }));
      sfx.update(makeState({ matchOver: true }));
      vi.clearAllMocks();

      sfx.update(makeState({ matchOver: true }));
      expect(audio.play).not.toHaveBeenCalledWith('victory');
    });
  });

  describe('multiple players', () => {
    it('detects transitions independently for each player', () => {
      const p1 = makePlayer({ id: 'P1', state: 'idle' });
      const p2 = makePlayer({ id: 'P2', state: 'airborne', vy: 200 });
      sfx.update(makeState({ players: [p1, p2] }));
      vi.clearAllMocks();

      // P1 dies, P2 lands — both should fire independently
      sfx.update(makeState({
        players: [
          makePlayer({ id: 'P1', state: 'splat' }),
          makePlayer({ id: 'P2', state: 'idle' }),
        ],
      }));

      expect(audio.play).toHaveBeenCalledWith('stomp');
      expect(audio.play).toHaveBeenCalledWith('land');
      expect(mockGameLoop.spawnStompVfxPublic).toHaveBeenCalledTimes(1);
      expect(mockGameLoop.spawnDustPublic).toHaveBeenCalledTimes(1);
    });
  });

  describe('consecutive updates with no change', () => {
    it('same state on every update does NOT trigger any SFX', () => {
      const state = makeState({
        players: [makePlayer({ id: 'P1', state: 'idle' })],
        carrots: [makeCarrot({ active: true })],
        springs: [makeSpring({ bounceTimer: 0 })],
        thorns: [makeThorn({ hit: false })],
        countdown: 0,
        matchOver: false,
      });

      // First update — initializes
      sfx.update(state);
      vi.clearAllMocks();

      // Next 5 updates with identical state
      for (let i = 0; i < 5; i++) {
        sfx.update(state);
      }

      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.playAnimal).not.toHaveBeenCalled();
      expect(mockGameLoop.spawnStompVfxPublic).not.toHaveBeenCalled();
      expect(mockGameLoop.spawnDustPublic).not.toHaveBeenCalled();
      expect(mockGameLoop.spawnCarrotVfxPublic).not.toHaveBeenCalled();
    });
  });

  describe('array resizing (detectArrayTransition)', () => {
    it('handles arrays growing between updates', () => {
      sfx.update(makeState({ carrots: [makeCarrot({ active: true })] }));
      vi.clearAllMocks();

      // Second carrot appears — new entry, should NOT trigger pickup
      sfx.update(makeState({
        carrots: [makeCarrot({ active: true }), makeCarrot({ active: false })],
      }));
      expect(audio.play).not.toHaveBeenCalledWith('crunch');
    });

    it('handles arrays shrinking between updates', () => {
      sfx.update(makeState({
        carrots: [makeCarrot({ active: true }), makeCarrot({ active: true })],
      }));
      vi.clearAllMocks();

      // Array shrinks — no error, remaining element checked
      sfx.update(makeState({ carrots: [makeCarrot({ active: true })] }));
      expect(audio.play).not.toHaveBeenCalledWith('crunch');
    });

    it('detects transition in existing element when array grows', () => {
      sfx.update(makeState({
        carrots: [makeCarrot({ active: true, x: 10, y: 20 })],
      }));
      vi.clearAllMocks();

      // First carrot picked up AND a new carrot appears
      sfx.update(makeState({
        carrots: [
          makeCarrot({ active: false, x: 10, y: 20 }),
          makeCarrot({ active: true }),
        ],
      }));
      expect(audio.play).toHaveBeenCalledWith('crunch');
      expect(mockGameLoop.spawnCarrotVfxPublic).toHaveBeenCalledWith(10, 20);
    });
  });
});
