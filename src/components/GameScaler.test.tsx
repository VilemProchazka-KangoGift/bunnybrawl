import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';

// Mock touchDetect before importing any component that uses useScaler
vi.mock('../engine/touchDetect', () => ({
  isTouchPrimary: () => false,
}));

import { GameScaler } from './GameScaler';

describe('GameScaler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children passed to it', () => {
    render(
      <GameScaler>
        <div data-testid="child-content">Hello</div>
      </GameScaler>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders the viewport container', () => {
    const { container } = render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    const viewport = container.querySelector('.game-scaler-viewport');
    expect(viewport).toBeInTheDocument();
  });

  it('renders the content container with correct dimensions', () => {
    const { container } = render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    const content = container.querySelector('.game-scaler-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveStyle({ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` });
  });

  it('content container has width 1280 and height 720', () => {
    const { container } = render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    const content = container.querySelector('.game-scaler-content');
    expect(content).toHaveStyle({ width: '1280px', height: '720px' });
  });

  it('renders the fullscreen toggle button', () => {
    render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('fullscreen-btn');
  });

  it('fullscreen button shows enter icon when not in fullscreen', () => {
    render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    const button = screen.getByRole('button');
    // ICON_ENTER_FULLSCREEN = '\u2922'
    expect(button.textContent).toBe('\u2922');
  });

  it('fullscreen button calls toggleFullscreen on click', () => {
    const requestSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: requestSpy,
      writable: true,
      configurable: true,
    });

    render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(requestSpy).toHaveBeenCalled();
  });

  it('renders multiple children correctly', () => {
    render(
      <GameScaler>
        <div data-testid="first">A</div>
        <div data-testid="second">B</div>
      </GameScaler>
    );
    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.getByTestId('second')).toBeInTheDocument();
  });

  it('unmounts without errors', () => {
    const { unmount } = render(
      <GameScaler>
        <span>Test</span>
      </GameScaler>
    );
    expect(() => unmount()).not.toThrow();
  });
});
