// src/engine/input/__tests__/RuleBasedBot.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RuleBasedBot } from '../RuleBasedBot';
import { makePlayer, makeState, makeArena } from '../../__tests__/testHelpers';
import type { AIController } from '../../ai';
import type { InputState } from '../../types';

function makeStubController(out: InputState): { ctrl: AIController; getInput: ReturnType<typeof vi.fn> } {
  const getInput = vi.fn(() => out);
  const ctrl = { getInput } as unknown as AIController;
  return { ctrl, getInput };
}

describe('RuleBasedBot', () => {
  it('delegates getAction to AIController.getInput with the correct args', () => {
    const out: InputState = { left: false, right: false, jump: false, down: false };
    const { ctrl, getInput } = makeStubController(out);
    const arena = makeArena();
    const bot = new RuleBasedBot('B1', ctrl, arena, true, false);
    const player = makePlayer({ id: 'B1' });
    const state = makeState({ players: [player] });

    bot.getAction(state);

    expect(getInput).toHaveBeenCalledTimes(1);
    const call = getInput.mock.calls[0];
    expect(call[0]).toBe(player);
    expect(call[1]).toBe(state);
    expect(call[2]).toBe(arena);
    expect(call[3]).toBe(true);
    expect(call[4]).toBe(false);
  });

  it('returns the controller output verbatim', () => {
    const out: InputState = { left: true, right: false, jump: true, down: false };
    const { ctrl } = makeStubController(out);
    const bot = new RuleBasedBot('B2', ctrl, makeArena(), false, false);
    const state = makeState({ players: [makePlayer({ id: 'B2' })] });

    expect(bot.getAction(state)).toBe(out);
  });

  it('returns all-false and skips the controller when the player slot is missing', () => {
    const { ctrl, getInput } = makeStubController({ left: true, right: true, jump: true, down: true });
    const bot = new RuleBasedBot('B3', ctrl, makeArena(), false, false);
    const state = makeState({ players: [makePlayer({ id: 'P1' })] });

    expect(bot.getAction(state)).toEqual({ left: false, right: false, jump: false, down: false });
    expect(getInput).not.toHaveBeenCalled();
  });

  it('exposes the BotSlot via the slot field', () => {
    const { ctrl } = makeStubController({ left: false, right: false, jump: false, down: false });
    const bot = new RuleBasedBot('B4', ctrl, makeArena(), false, false);
    expect(bot.slot).toBe('B4');
  });

  it('setArena updates the arena passed to subsequent getAction calls', () => {
    const { ctrl, getInput } = makeStubController({ left: false, right: false, jump: false, down: false });
    const arenaA = makeArena({ id: 'arena-a' });
    const arenaB = makeArena({ id: 'arena-b' });
    const bot = new RuleBasedBot('B5', ctrl, arenaA, false, true);
    const state = makeState({ players: [makePlayer({ id: 'B5' })] });

    bot.getAction(state);
    bot.setArena(arenaB);
    bot.getAction(state);

    expect(getInput.mock.calls[0][2]).toBe(arenaA);
    expect(getInput.mock.calls[1][2]).toBe(arenaB);
  });
});
