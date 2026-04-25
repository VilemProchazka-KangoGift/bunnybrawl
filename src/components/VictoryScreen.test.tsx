import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VictoryScreen } from './VictoryScreen';
import { useGameStore } from '../store/gameStore';
import { CHARACTERS } from '../engine/characters';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../engine/constants';

function setupVictoryState() {
  useGameStore.getState().setMatchResult('P1', {
    players: [
      {
        id: 'P1', character: CHARACTERS.P1,
        x: 0, y: 0, vx: 0, vy: 0,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        state: 'idle', facing: 'right',
        splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
        score: 10, active: true, animFrame: 0, animTimer: 0, fastFalling: false, fatTimer: 0, slowTimer: 0, burnTimer: 0, hitstopTimer: 0,
      },
      {
        id: 'P2', character: CHARACTERS.P2,
        x: 0, y: 0, vx: 0, vy: 0,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        state: 'idle', facing: 'right',
        splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
        score: 7, active: true, animFrame: 0, animTimer: 0, fastFalling: false, fatTimer: 0, slowTimer: 0, burnTimer: 0, hitstopTimer: 0,
      },
    ],
    phase: 'playing',
    killFeed: [],
    timeElapsed: 90,
    matchOver: true,
    winner: 'P1',
    carrots: [],
    carrotTimer: 10,
    springs: [],
    thorns: [],
  });
}

describe('VictoryScreen', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    setupVictoryState();
  });

  it('shows winner name', () => {
    render(<VictoryScreen />);
    const bunnies = screen.getAllByText(/Bunny/);
    expect(bunnies.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Wins!/)).toBeInTheDocument();
  });

  it('shows final scores', () => {
    render(<VictoryScreen />);
    expect(screen.getByText('10 kills')).toBeInTheDocument();
    expect(screen.getByText('7 kills')).toBeInTheDocument();
  });

  it('shows match time', () => {
    render(<VictoryScreen />);
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it('has rematch button', () => {
    render(<VictoryScreen />);
    expect(screen.getByTestId('rematch-button')).toBeInTheDocument();
  });

  it('has menu button', () => {
    render(<VictoryScreen />);
    expect(screen.getByTestId('menu-button')).toBeInTheDocument();
  });

  it('goes to menu on menu button click', () => {
    render(<VictoryScreen />);
    fireEvent.click(screen.getByTestId('menu-button'));
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('goes to match on rematch click', () => {
    render(<VictoryScreen />);
    fireEvent.click(screen.getByTestId('rematch-button'));
    expect(useGameStore.getState().screen).toBe('match');
  });

  describe('disconnect-win path', () => {
    beforeEach(() => {
      // Replay setupVictoryState but with disconnectWin = true.
      useGameStore.getState().reset();
      // Pretend we're an online host so the rematch/change-arena buttons would
      // *normally* show — disconnectWin should suppress them.
      useGameStore.getState().setOnline({ isOnline: true, isHost: true });
      useGameStore.getState().setMatchResult('P1', {
        players: [
          {
            id: 'P1', character: CHARACTERS.P1,
            x: 0, y: 0, vx: 0, vy: 0,
            width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
            state: 'idle', facing: 'right',
            splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
            score: 5, active: true, animFrame: 0, animTimer: 0, fastFalling: false, fatTimer: 0, slowTimer: 0, burnTimer: 0, hitstopTimer: 0,
          },
        ],
        phase: 'playing',
        killFeed: [], timeElapsed: 30, matchOver: true, winner: 'P1',
        carrots: [], carrotTimer: 10, springs: [], thorns: [],
      }, true /* disconnectWin */);
    });

    it('disconnect banner is shown, rematch/change-arena buttons are hidden on first render', () => {
      // Validates that peerConnected initializes to !disconnectWin = false, so
      // the rematch buttons (gated by `peerConnected`) don't briefly flash
      // visible before the useEffect can run. The disconnect banner itself
      // is gated by disconnectWin, so both should be in the right state on
      // the very first render.
      render(<VictoryScreen />);
      expect(screen.getByTestId('disconnect-info')).toBeInTheDocument();
      expect(screen.queryByTestId('rematch-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('change-arena-button')).not.toBeInTheDocument();
      // Menu button still visible — labeled "Leave Game" in disconnect-win path.
      expect(screen.getByTestId('menu-button')).toBeInTheDocument();
    });
  });

  describe('handleMenu cleans up state', () => {
    it('resets winner / online / activePlayers when leaving to menu', () => {
      // Pre-populate online + activePlayers to verify they're cleared.
      useGameStore.getState().setOnline({ isOnline: true, isHost: true, roomCode: 'ABCD' });
      useGameStore.getState().setActivePlayers(['P1', 'P2']);
      // Sanity: setMatchResult was already called in setupVictoryState beforeEach.
      expect(useGameStore.getState().winner).toBe('P1');

      render(<VictoryScreen />);
      fireEvent.click(screen.getByTestId('menu-button'));

      const after = useGameStore.getState();
      expect(after.screen).toBe('menu');
      expect(after.winner).toBeNull();
      expect(after.lastMatchState).toBeNull();
      expect(after.activePlayers).toEqual([]);
      expect(after.online.isOnline).toBe(false);
    });

    it('clears winner / lastMatchState before navigating on rematch', () => {
      render(<VictoryScreen />);
      fireEvent.click(screen.getByTestId('rematch-button'));

      const after = useGameStore.getState();
      // Rematch goes to 'match' but ALSO drops the ghost winner data so the
      // newly-mounted Match doesn't briefly see stale victory state.
      expect(after.screen).toBe('match');
      expect(after.winner).toBeNull();
      expect(after.lastMatchState).toBeNull();
    });
  });
});
