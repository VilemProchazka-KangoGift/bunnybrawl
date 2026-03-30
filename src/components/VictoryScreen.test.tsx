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
        score: 10, active: true, animFrame: 0, animTimer: 0,
      },
      {
        id: 'P2', character: CHARACTERS.P2,
        x: 0, y: 0, vx: 0, vy: 0,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        state: 'idle', facing: 'right',
        splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
        score: 7, active: true, animFrame: 0, animTimer: 0,
      },
    ],
    splatMarks: [],
    killFeed: [],
    timeElapsed: 90,
    matchOver: true,
    winner: 'P1',
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
});
