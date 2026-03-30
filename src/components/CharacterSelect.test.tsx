import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterSelect } from './CharacterSelect';
import { useGameStore } from '../store/gameStore';

describe('CharacterSelect (Lobby)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setScreen('charSelect');
  });

  it('renders the lobby canvas', () => {
    render(<CharacterSelect />);
    expect(screen.getByTestId('lobby-canvas')).toBeInTheDocument();
  });

  it('renders the char-select container', () => {
    render(<CharacterSelect />);
    expect(screen.getByTestId('char-select')).toBeInTheDocument();
  });

  it('canvas has correct dimensions', () => {
    render(<CharacterSelect />);
    const canvas = screen.getByTestId('lobby-canvas');
    expect(canvas).toHaveAttribute('width', '1280');
    expect(canvas).toHaveAttribute('height', '720');
  });
});
