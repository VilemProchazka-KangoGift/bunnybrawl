import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Arena } from '../types';
import type { Renderer } from '../renderer';

// Mock the audio module so we can control `preloadArena` timing.
vi.mock('../audio', () => ({
  audio: {
    preloadArena: vi.fn(() => Promise.resolve()),
    hasPreloadedArena: vi.fn(() => true),
  },
}));

// Import AFTER vi.mock so the module-under-test picks up the mocked audio.
import { runLoadingTasks } from '../matchLoading';
import { audio } from '../audio';

function makeRendererStub(): Renderer {
  return {
    renderBackground: vi.fn(),
    warmSpriteCache: vi.fn(),
    hasWarmedAll: vi.fn(() => true),
  } as unknown as Renderer;
}

function makeArenaStub(): Arena {
  return {} as Arena;
}

describe('runLoadingTasks', () => {
  beforeEach(() => {
    vi.mocked(audio.preloadArena).mockReset();
    vi.mocked(audio.preloadArena).mockResolvedValue(undefined);
  });

  it('enforces the minimum duration when everything else resolves instantly', async () => {
    const renderer = makeRendererStub();
    const arena = makeArenaStub();
    const originalArena = makeArenaStub();

    const start = Date.now();
    await runLoadingTasks({
      arenaId: 'meadow',
      characterNames: ['Bunny', 'Fox'],
      renderer,
      arena,
      originalArena,
      minDurationMs: 100,
      timeoutMs: 5000,
    });
    const elapsed = Date.now() - start;

    // 80-300ms window: floor accounts for timer slop on fast CI, ceiling for
    // slow Windows CI. Core assertion is "min duration is honored, not blown".
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(300);

    expect(renderer.renderBackground).toHaveBeenCalledTimes(1);
    expect(renderer.renderBackground).toHaveBeenCalledWith(arena, originalArena);
    expect(renderer.warmSpriteCache).toHaveBeenCalledTimes(1);
    expect(renderer.warmSpriteCache).toHaveBeenCalledWith(['Bunny', 'Fox']);
    expect(audio.preloadArena).toHaveBeenCalledWith('meadow');
  });

  it('retries preloadArena if verification says the right theme is not loaded', async () => {
    // Simulate: initial preload completes (e.g. for a DIFFERENT theme, or was
    // superseded), verification says we don't have what we need, retry runs.
    vi.mocked(audio.hasPreloadedArena).mockReturnValue(false);

    const renderer = makeRendererStub();
    const arena = makeArenaStub();
    const originalArena = makeArenaStub();

    await runLoadingTasks({
      arenaId: 'meadow',
      characterNames: ['Bunny'],
      renderer,
      arena,
      originalArena,
      minDurationMs: 10,
      timeoutMs: 5000,
    });

    // Called once in the initial task + once in verification retry.
    expect(audio.preloadArena).toHaveBeenCalledTimes(2);
  });

  it('re-warms sprite cache if verification finds missing characters', async () => {
    const renderer = makeRendererStub();
    // First hasWarmedAll call (inside the verification block) returns false to
    // trigger the retry. In real usage this would happen if a setTheme() call
    // cleared the cache between warm and verify.
    vi.mocked(renderer.hasWarmedAll).mockReturnValue(false);

    const arena = makeArenaStub();
    const originalArena = makeArenaStub();

    await runLoadingTasks({
      arenaId: 'meadow',
      characterNames: ['Bunny', 'Fox'],
      renderer,
      arena,
      originalArena,
      minDurationMs: 10,
      timeoutMs: 5000,
    });

    // Called once in the initial task + once in verification retry.
    expect(renderer.warmSpriteCache).toHaveBeenCalledTimes(2);
  });

  it('rejects with loading_timeout when a task never resolves', async () => {
    // preloadArena returns a promise that never resolves.
    vi.mocked(audio.preloadArena).mockReturnValue(new Promise<void>(() => {}));

    const renderer = makeRendererStub();
    const arena = makeArenaStub();
    const originalArena = makeArenaStub();

    const start = Date.now();
    await expect(
      runLoadingTasks({
        arenaId: 'meadow',
        characterNames: ['Bunny'],
        renderer,
        arena,
        originalArena,
        minDurationMs: 50,
        timeoutMs: 200,
      }),
    ).rejects.toThrow('loading_timeout');
    const elapsed = Date.now() - start;

    // Give a wide window around 200ms — the point is "it times out near the
    // requested deadline", not exact timer precision.
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(500);
  });
});
