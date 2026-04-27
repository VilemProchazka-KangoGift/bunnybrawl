import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterSelect } from './CharacterSelect';
import { useGameStore } from '../store/gameStore';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { registerBuiltinCharacters } from '../engine/characters';
import { registerBuiltinArenas } from '../engine/arenas';
import { installMockCanvas2D } from '../engine/__tests__/mockCanvas';

// LobbyGame's constructor reads the lobby arena pack from the registry
// (`getArena('lobby').platforms` for collision). Tests must initialise both
// registries before rendering — App.tsx does this at module scope in production.
registerBuiltinCharacters();
registerBuiltinArenas();
installMockCanvas2D();

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

  it('canvas dimensions match CANVAS_WIDTH and CANVAS_HEIGHT constants', () => {
    render(<CharacterSelect />);
    const canvas = screen.getByTestId('lobby-canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(CANVAS_WIDTH);
    expect(canvas.height).toBe(CANVAS_HEIGHT);
  });

  it('renders without crashing with default store state', () => {
    useGameStore.getState().reset();
    const { container } = render(<CharacterSelect />);
    expect(container.querySelector('.char-select')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders without crashing when bot count is set', () => {
    useGameStore.getState().setMatchSettings({ botCount: 3 });
    const { container } = render(<CharacterSelect />);
    expect(container.querySelector('.char-select')).toBeInTheDocument();
  });

  it('cleans up on unmount without errors', () => {
    const { unmount } = render(<CharacterSelect />);
    expect(() => unmount()).not.toThrow();
  });

  it('cleans up animation frame on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(<CharacterSelect />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });

  it('Escape key navigates back to menu', () => {
    render(<CharacterSelect />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('canvas element has the lobby-canvas class', () => {
    render(<CharacterSelect />);
    const canvas = screen.getByTestId('lobby-canvas');
    expect(canvas).toHaveClass('lobby-canvas');
  });
});
