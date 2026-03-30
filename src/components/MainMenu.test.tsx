import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from './MainMenu';
import { useGameStore } from '../store/gameStore';

describe('MainMenu', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('renders the game title', () => {
    render(<MainMenu />);
    expect(screen.getByText('Bunny')).toBeInTheDocument();
    expect(screen.getByText('Brawl')).toBeInTheDocument();
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
    expect(screen.getByText('Stomp your friends!')).toBeInTheDocument();
  });
});
