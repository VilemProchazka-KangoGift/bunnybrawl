import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from './MainMenu';
import { useGameStore } from '../store/gameStore';

describe('MainMenu', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('renders the game logo', () => {
    render(<MainMenu />);
    expect(screen.getByAltText('Carrot Royale')).toBeInTheDocument();
  });

  it('renders Play button', () => {
    render(<MainMenu />);
    expect(screen.getByTestId('play-button')).toBeInTheDocument();
  });

  it('navigates to character select on Play click', () => {
    render(<MainMenu />);
    fireEvent.click(screen.getByTestId('play-button'));
    expect(useGameStore.getState().screen).toBe('charSelect');
  });

  it('shows tagline', () => {
    render(<MainMenu />);
    expect(screen.getByText('Locally sourced violence.')).toBeInTheDocument();
  });
});
