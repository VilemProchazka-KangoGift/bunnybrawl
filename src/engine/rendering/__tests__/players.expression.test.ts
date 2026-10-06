import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../../types';
import type { Ctx2D } from '../../types';
import { bunny } from '../../characters/packs/bunny';
import { registerCharacter } from '../../characters/registry';
import { drawExpression } from '../players';

function angryPlayer(name: string): Player {
  return {
    expression: 'angry', character: { name },
    x: 100, y: 100, width: 32, height: 40,
    state: 'idle', animFrame: 0,
  } as Player;
}

function strokeContext(): { ctx: Ctx2D; stroke: ReturnType<typeof vi.fn> } {
  const stroke = vi.fn();
  return {
    ctx: { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke } as unknown as Ctx2D,
    stroke,
  };
}

describe('angry expression on authored sprites', () => {
  it('does not paint detached generic eyebrows over authored face art', () => {
    registerCharacter({ ...bunny, name: 'Authored Brow Test', authoredAngryBrows: true });
    const { ctx, stroke } = strokeContext();
    drawExpression(ctx, angryPlayer('Authored Brow Test'), 0);
    expect(stroke).not.toHaveBeenCalled();
  });

  it('keeps generic eyebrows for procedural characters', () => {
    registerCharacter({ ...bunny, name: 'Generic Brow Test' });
    const { ctx, stroke } = strokeContext();
    drawExpression(ctx, angryPlayer('Generic Brow Test'), 0);
    expect(stroke).toHaveBeenCalledOnce();
  });
});
