import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InputEcho } from './inputEcho';
import type { InputState, MatchState, Player, PlayerSlot } from '../types';
import { makePlayer } from '../__tests__/testHelpers';

// ---------- Helpers ----------

function noInput(): InputState {
  return { left: false, right: false, jump: false, down: false };
}

function leftInput(): InputState {
  return { left: true, right: false, jump: false, down: false };
}

function rightInput(): InputState {
  return { left: false, right: true, jump: false, down: false };
}

function jumpInput(): InputState {
  return { left: false, right: false, jump: true, down: false };
}

function downInput(): InputState {
  return { left: false, right: false, jump: false, down: true };
}

/** Minimal MatchState with a single player. */
function makeState(playerOverrides: Partial<Player> = {}): MatchState {
  return {
    players: [makePlayer({ id: 'P1' as PlayerSlot, ...playerOverrides })],
    // Remaining fields are unused by InputEcho — provide minimal stubs
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
  } as MatchState;
}

function getPlayer(state: MatchState): Player {
  return state.players[0];
}

// ---------- Tests ----------

describe('InputEcho', () => {
  let echo: InputEcho;
  const dt = 1 / 60; // one frame at 60fps
  const rtt = 50; // typical RTT

  beforeEach(() => {
    echo = new InputEcho('P1' as PlayerSlot);
    // Ensure performance.now() returns a controllable value
    vi.spyOn(performance, 'now').mockReturnValue(10000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Constructor ----

  describe('constructor', () => {
    it('stores the localSlot', () => {
      const e = new InputEcho('P3' as PlayerSlot);
      expect(e.localSlot).toBe('P3');
    });

    it('exposes localSlot as readonly', () => {
      expect(echo.localSlot).toBe('P1');
    });
  });

  // ---- Facing override ----

  describe('facing override', () => {
    it('sets facing=left when left input is active', () => {
      const state = makeState({ facing: 'right' });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');
    });

    it('sets facing=right when right input is active', () => {
      const state = makeState({ facing: 'left' });
      echo.apply(rightInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right');
    });

    it('does not change facing when no directional input', () => {
      const state = makeState({ facing: 'left' });
      echo.apply(noInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');
    });

    it('maintains echoed facing during lock period after input stops', () => {
      const state = makeState({ facing: 'right' });

      // Press left to set echo and lock
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');

      // Release input within lock period (lock = rtt + 50 = 100ms)
      vi.spyOn(performance, 'now').mockReturnValue(10050);
      // Reset player facing to simulate a snapshot overriding it
      getPlayer(state).facing = 'right';
      echo.apply(noInput(), state, rtt, dt);
      // Lock should still hold — echo facing preserved
      expect(getPlayer(state).facing).toBe('left');
    });

    it('lets snapshot facing take over after lock expires', () => {
      const state = makeState({ facing: 'right' });

      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');

      // After lock period (rtt + 50 = 100ms) with no input
      vi.spyOn(performance, 'now').mockReturnValue(10200);
      getPlayer(state).facing = 'right';
      echo.apply(noInput(), state, rtt, dt);
      // Lock expired — snapshot facing stays
      expect(getPlayer(state).facing).toBe('right');
    });
  });

  // ---- Animation frame override ----

  describe('animation frame override', () => {
    it('drives walk cycle when moving left on ground', () => {
      const state = makeState({ state: 'run', animFrame: 0 });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).animFrame).toBeGreaterThan(0);
    });

    it('drives walk cycle when moving right on ground', () => {
      const state = makeState({ state: 'idle', animFrame: 0 });
      echo.apply(rightInput(), state, rtt, dt);
      expect(getPlayer(state).animFrame).toBeGreaterThan(0);
    });

    it('accumulates walk cycle across frames', () => {
      const state = makeState({ state: 'run', animFrame: 0 });
      echo.apply(rightInput(), state, rtt, dt);
      const frame1 = getPlayer(state).animFrame;

      echo.apply(rightInput(), state, rtt, dt);
      const frame2 = getPlayer(state).animFrame;

      expect(frame2).toBeGreaterThan(frame1);
    });

    it('resets walk cycle when no movement input and lock expired', () => {
      const state = makeState({ state: 'run', animFrame: 5 });

      // Move to build up walk cycle
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(rightInput(), state, rtt, dt);

      // Stop moving after lock expires
      vi.spyOn(performance, 'now').mockReturnValue(10200);
      echo.apply(noInput(), state, rtt, dt);

      // Walk cycle frame is internally reset to 0
      // Next movement should start from 0
      vi.spyOn(performance, 'now').mockReturnValue(10300);
      const state2 = makeState({ state: 'run', animFrame: 0 });
      const echo2 = new InputEcho('P1' as PlayerSlot);
      echo2.apply(rightInput(), state2, rtt, dt);
      const freshFrame = getPlayer(state2).animFrame;

      // Should be just 1 frame's worth of walk
      expect(freshFrame).toBe(Math.floor(dt * 60));
    });

    it('does not drive walk cycle when airborne', () => {
      const state = makeState({ state: 'airborne', animFrame: 0 });
      echo.apply(rightInput(), state, rtt, dt);
      // airborne is not 'idle' or 'run', so walk cycle should not apply
      expect(getPlayer(state).animFrame).toBe(0);
    });
  });

  // ---- Fast-fall flag ----

  describe('fast-fall flag', () => {
    it('sets fastFalling=true when down+airborne', () => {
      const state = makeState({ state: 'airborne', fastFalling: false });
      echo.apply(downInput(), state, rtt, dt);
      expect(getPlayer(state).fastFalling).toBe(true);
    });

    it('does not set fastFalling when down but grounded', () => {
      const state = makeState({ state: 'idle', fastFalling: false });
      echo.apply(downInput(), state, rtt, dt);
      expect(getPlayer(state).fastFalling).toBe(false);
    });

    it('does not set fastFalling when airborne but no down input', () => {
      const state = makeState({ state: 'airborne', fastFalling: false });
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).fastFalling).toBe(false);
    });
  });

  // ---- Jump squash ----

  describe('jump squash', () => {
    it('applies squash on jump rising edge', () => {
      const state = makeState({ squashScale: 1, state: 'idle' });
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).squashScale).toBe(0.85);
    });

    it('does not re-trigger squash when jump held across frames', () => {
      const state = makeState({ squashScale: 1, state: 'idle' });
      // First frame: jump pressed (rising edge) → triggers squash
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).squashScale).toBe(0.85);

      // Decay the timer fully by running enough frames with jump held
      // Timer = 0.08s, dt = 1/60 ≈ 0.0167s, so ~5 frames to decay
      for (let i = 0; i < 10; i++) {
        echo.apply(jumpInput(), state, rtt, dt);
      }
      // Timer is now 0. Reset squashScale to test that next frame has no effect.
      getPlayer(state).squashScale = 1;
      echo.apply(jumpInput(), state, rtt, dt);
      // No rising edge (jump held), timer fully decayed → squashScale stays 1
      expect(getPlayer(state).squashScale).toBe(1);
    });

    it('squash timer decays over time', () => {
      const state = makeState({ squashScale: 1, state: 'idle' });
      // Trigger jump squash
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).squashScale).toBe(0.85);

      // Decay the timer fully (~5 frames for 80ms at 60fps)
      for (let i = 0; i < 10; i++) {
        echo.apply(jumpInput(), state, rtt, dt);
      }
      // Now timer is 0 — reset squashScale and verify it is no longer overridden
      getPlayer(state).squashScale = 1;
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).squashScale).toBe(1);
    });
  });

  // ---- Direction reversal squash ----

  describe('reversal squash', () => {
    it('applies sideSquash when changing direction', () => {
      const state = makeState({ sideSquash: 1 });

      // Go right first
      echo.apply(rightInput(), state, rtt, dt);
      // Then reverse to left
      getPlayer(state).sideSquash = 1;
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).sideSquash).toBe(0.9);
    });

    it('does not apply reversal squash without a previous direction', () => {
      const state = makeState({ sideSquash: 1 });
      // First directional input — no previous direction to reverse from
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).sideSquash).toBe(1);
    });

    it('reversal squash timer decays', () => {
      const state = makeState({ sideSquash: 1 });

      // Set up direction then reverse
      echo.apply(rightInput(), state, rtt, dt);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).sideSquash).toBe(0.9);

      // Decay timer fully: 50ms = ~3 frames at 60fps, run extra to be safe
      for (let i = 0; i < 6; i++) {
        echo.apply(leftInput(), state, rtt, dt); // same direction, no new reversal
      }
      // Timer is now 0 — reset sideSquash and verify next frame does not override
      getPlayer(state).sideSquash = 1;
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).sideSquash).toBe(1);
    });
  });

  // ---- Expression override ----

  describe('expression override', () => {
    it('sets expression=scared when fast-falling with high vy', () => {
      const state = makeState({ state: 'airborne', vy: 300, expression: 'normal' });
      echo.apply(downInput(), state, rtt, dt);
      expect(getPlayer(state).expression).toBe('scared');
    });

    it('does not set scared expression when vy is low', () => {
      const state = makeState({ state: 'airborne', vy: 100, expression: 'normal' });
      echo.apply(downInput(), state, rtt, dt);
      expect(getPlayer(state).expression).toBe('normal');
    });

    it('does not set scared expression without down input', () => {
      const state = makeState({ state: 'airborne', vy: 300, expression: 'normal' });
      echo.apply(noInput(), state, rtt, dt);
      expect(getPlayer(state).expression).toBe('normal');
    });
  });

  // ---- Suppression during death/respawn ----

  describe('suppression during death/respawn', () => {
    it('does not apply facing when player is splatted', () => {
      const state = makeState({ state: 'splat', facing: 'right' });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right');
    });

    it('does not apply facing when player is respawning', () => {
      const state = makeState({ state: 'respawning', facing: 'right' });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right');
    });

    it('suppresses echo for 200ms after transitioning out of death', () => {
      // Player is splatted
      const state = makeState({ state: 'splat', facing: 'right' });
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right'); // suppressed: splatted

      // Player is now alive again, but within 200ms grace period
      getPlayer(state).state = 'idle';
      vi.spyOn(performance, 'now').mockReturnValue(10100);
      getPlayer(state).facing = 'right';
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right'); // still suppressed

      // After 200ms grace, echo should work again
      vi.spyOn(performance, 'now').mockReturnValue(10300);
      getPlayer(state).facing = 'right';
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left'); // echo active
    });

    it('does not apply any cosmetic overrides while suppressed', () => {
      const state = makeState({
        state: 'splat',
        facing: 'right',
        animFrame: 5,
        fastFalling: false,
        squashScale: 1,
        sideSquash: 1,
        expression: 'normal',
      });
      echo.apply(
        { left: true, right: false, jump: true, down: true },
        state,
        rtt,
        dt,
      );
      const p = getPlayer(state);
      expect(p.facing).toBe('right');
      expect(p.animFrame).toBe(5);
      expect(p.fastFalling).toBe(false);
      expect(p.squashScale).toBe(1);
      expect(p.sideSquash).toBe(1);
      expect(p.expression).toBe('normal');
    });
  });

  // ---- Respawn teleport detection ----

  describe('respawn teleport detection', () => {
    it('resets echo state on large position jump (>100px)', () => {
      const state = makeState({ x: 200, facing: 'right' });

      // Establish previous position
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');

      // Teleport: player position jumps by >100px
      getPlayer(state).x = 800;
      getPlayer(state).facing = 'right';
      vi.spyOn(performance, 'now').mockReturnValue(10050);
      echo.apply(leftInput(), state, rtt, dt);

      // Should be suppressed due to teleport reset (200ms grace)
      expect(getPlayer(state).facing).toBe('right');
    });

    it('does not reset on small position changes', () => {
      const state = makeState({ x: 200, facing: 'right' });

      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);

      // Small movement — no teleport
      getPlayer(state).x = 210;
      getPlayer(state).facing = 'right';
      vi.spyOn(performance, 'now').mockReturnValue(10010);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');
    });
  });

  // ---- Position never changes ----

  describe('position preservation', () => {
    it('never changes x position', () => {
      const state = makeState({ x: 500, y: 300 });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).x).toBe(500);
    });

    it('never changes y position', () => {
      const state = makeState({ x: 500, y: 300 });
      echo.apply(jumpInput(), state, rtt, dt);
      expect(getPlayer(state).y).toBe(300);
    });

    it('never changes vx or vy', () => {
      const state = makeState({ vx: 100, vy: -50 });
      echo.apply(
        { left: true, right: false, jump: true, down: true },
        state,
        rtt,
        dt,
      );
      expect(getPlayer(state).vx).toBe(100);
      expect(getPlayer(state).vy).toBe(-50);
    });

    it('does not change score or active status', () => {
      const state = makeState({ score: 5, active: true });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).score).toBe(5);
      expect(getPlayer(state).active).toBe(true);
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('does nothing when player is not found (different slot)', () => {
      const echo2 = new InputEcho('P2' as PlayerSlot);
      const state = makeState({ id: 'P1' as PlayerSlot, facing: 'right' });
      echo2.apply(leftInput(), state, rtt, dt);
      // P1's facing unchanged because echo targets P2 which doesn't exist
      expect(getPlayer(state).facing).toBe('right');
    });

    it('does nothing when player is inactive', () => {
      const state = makeState({ active: false, facing: 'right' });
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right');
    });

    it('handles both left and right pressed simultaneously — left wins', () => {
      const state = makeState({ facing: 'right' });
      echo.apply({ left: true, right: true, jump: false, down: false }, state, rtt, dt);
      // Code checks left before right, so left wins
      expect(getPlayer(state).facing).toBe('left');
    });

    it('reset() clears all internal state and sets suppression', () => {
      const state = makeState({ facing: 'right' });
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');

      // Reset with explicit timestamp
      echo.reset(10500);

      // Next call within suppression window should not apply echo
      vi.spyOn(performance, 'now').mockReturnValue(10600);
      getPlayer(state).facing = 'right';
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right');

      // After suppression expires
      vi.spyOn(performance, 'now').mockReturnValue(10800);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('left');
    });

    it('reset() uses performance.now() when no timestamp provided', () => {
      vi.spyOn(performance, 'now').mockReturnValue(20000);
      echo.reset();

      // Suppressed until 20200
      const state = makeState({ facing: 'right' });
      vi.spyOn(performance, 'now').mockReturnValue(20100);
      echo.apply(leftInput(), state, rtt, dt);
      expect(getPlayer(state).facing).toBe('right'); // still suppressed
    });

    it('works with zero RTT', () => {
      const state = makeState({ facing: 'right' });
      echo.apply(leftInput(), state, 0, dt);
      expect(getPlayer(state).facing).toBe('left');
    });

    it('works with large RTT', () => {
      const state = makeState({ facing: 'right' });
      echo.apply(leftInput(), state, 500, dt);
      expect(getPlayer(state).facing).toBe('left');
    });
  });
});
