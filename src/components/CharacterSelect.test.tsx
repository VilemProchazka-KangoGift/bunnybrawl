import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterSelect } from './CharacterSelect';
import { useGameStore } from '../store/gameStore';

describe('CharacterSelect', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setScreen('charSelect');
  });

  it('renders all 4 player slots', () => {
    render(<CharacterSelect />);
    expect(screen.getByTestId('slot-P1')).toBeInTheDocument();
    expect(screen.getByTestId('slot-P2')).toBeInTheDocument();
    expect(screen.getByTestId('slot-P3')).toBeInTheDocument();
    expect(screen.getByTestId('slot-P4')).toBeInTheDocument();
  });

  it('shows "Need 2+ Players" when fewer than 2 ready', () => {
    render(<CharacterSelect />);
    expect(screen.getByTestId('start-button')).toHaveTextContent('Need 2+ Players');
    expect(screen.getByTestId('start-button')).toBeDisabled();
  });

  it('enables start when 2 players ready up', () => {
    render(<CharacterSelect />);

    // P1 presses jump key (w)
    fireEvent.keyDown(window, { key: 'w' });
    // P2 presses jump key (ArrowUp)
    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(screen.getByTestId('start-button')).toHaveTextContent('Start Match!');
    expect(screen.getByTestId('start-button')).not.toBeDisabled();
  });

  it('navigates back on back button', () => {
    render(<CharacterSelect />);
    fireEvent.click(screen.getByTestId('back-button'));
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('has kill limit selector', () => {
    render(<CharacterSelect />);
    const select = screen.getByTestId('kill-limit');
    expect(select).toBeInTheDocument();
  });

  it('has time limit selector', () => {
    render(<CharacterSelect />);
    const select = screen.getByTestId('time-limit');
    expect(select).toBeInTheDocument();
  });
});
