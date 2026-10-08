import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drawFastFallPoseEchoes, clearSpriteCache } from '../players';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';
import { bunny } from '../../characters/packs/bunny';
import { registerCharacter } from '../../characters/registry';
import type { Player } from '../../types';
import type { ThemeConfig } from '../../themes/types';

const theme = {} as ThemeConfig;
function diver(overrides: Partial<Player> = {}): Player {
  return {
    state: 'airborne', fastFalling: true, vx: 100, vy: 600,
    x: 100, y: 100, width: 32, height: 40, facing: 'right',
    character: { name: 'Echo Test', color: '#ffffff', darkColor: '#555555', lightColor: '#ffffff' },
    animFrame: 0, fastFallStreakAlpha: 1, ...overrides,
  } as Player;
}

describe('fast-stomp pose echoes', () => {
  beforeEach(() => {
    registerCharacter({ ...bunny, name: 'Echo Test', noOutline: true, noHighlight: true });
    vi.stubGlobal('OffscreenCanvas', class {
      width: number; height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext() { return createMockCanvasCtx(); }
    });
    clearSpriteCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('draws two cached attack poses and preserves inherited opacity', () => {
    const ctx = createMockCanvasCtx();
    ctx.globalAlpha = 0.5;
    const alphas: number[] = [];
    vi.mocked(ctx.drawImage).mockImplementation(() => { alphas.push(ctx.globalAlpha); });
    drawFastFallPoseEchoes(ctx, diver({ fastFallStreakAlpha: 0 }), theme);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(alphas).toEqual([0.18, 0.3]);
    expect(ctx.globalAlpha).toBe(0.5);
    const calls = vi.mocked(ctx.drawImage).mock.calls;
    expect(calls[0][2]).toBeLessThan(calls[1][2] as number);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
  });

  it.each([
    { vy: -300 }, { vy: 0 }, { fastFalling: false }, { state: 'idle' as const },
    { state: 'splat' as const },
  ])('never draws a stale dive after landing, death, or upward bounce: %j', overrides => {
    const ctx = createMockCanvasCtx();
    drawFastFallPoseEchoes(ctx, diver(overrides), theme);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
