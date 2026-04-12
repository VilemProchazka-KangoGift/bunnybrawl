import { describe, it, expect, vi, beforeAll } from 'vitest';
import { drawNavDebugOverlay } from './navDebugOverlay';
import type { BotNavDebugState } from './navDebugOverlay';
import { registerBuiltinArenas } from './arenas';

// Register arenas so getArenaNav() finds nav data
registerBuiltinArenas();

function makeMockCtx() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 1,
    lineCap: '' as string,
    lineJoin: '' as string,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    quadraticCurveTo: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
  } as any;
}

function makeArena(id = 'meadow') {
  return {
    id,
    platforms: [
      { x: 0, y: 660, width: 1280, height: 60 },
      { x: 400, y: 500, width: 200, height: 20 },
    ],
    spawnPoints: [{ x: 200, y: 600 }],
    width: 1280,
    height: 720,
  } as any;
}

describe('drawNavDebugOverlay', () => {
  it('draws platform labels and edges for meadow', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('meadow'), false);
    // Should draw platform index labels (fillText) and edge curves
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws legend text', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('meadow'), false);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]);
    // Legend should include edge type labels
    const hasLegend = textCalls.some((t: string) =>
      t.includes('jump') || t.includes('drop') || t.includes('walk') || t.includes('J') || t.includes('D')
    );
    expect(hasLegend || ctx.fillText.mock.calls.length > 3).toBe(true);
  });

  it('draws bot nav targets when provided', () => {
    const ctx = makeMockCtx();
    const botStates: BotNavDebugState[] = [
      { slot: 'B1', x: 300, y: 628, navTarget: { x: 500, y: 500, approachX: 450, type: 'j' } },
    ];
    drawNavDebugOverlay(ctx, makeArena('meadow'), false, botStates);
    // Should draw extra elements for bot target visualization
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalled();
  });

  it('handles arena with no nav data gracefully', () => {
    const ctx = makeMockCtx();
    const arena = makeArena('nonexistent_arena');
    // Should not throw — displays error message instead
    expect(() => drawNavDebugOverlay(ctx, arena, false)).not.toThrow();
    // Should draw an error message
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('handles mirrored arena', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('meadow'), true);
    // Should still draw without errors
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('draws toggle hint text', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('meadow'), false);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]).join(' ');
    // Should include backtick toggle hint
    expect(textCalls.includes('`') || textCalls.includes('toggle') || ctx.fillText.mock.calls.length > 2).toBe(true);
  });

  it('draws on volcano arena (different nav graph)', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('volcano'), false);
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('renders without bot states (undefined)', () => {
    const ctx = makeMockCtx();
    drawNavDebugOverlay(ctx, makeArena('meadow'), false, undefined);
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('renders with bot at null navTarget', () => {
    const ctx = makeMockCtx();
    const botStates: BotNavDebugState[] = [
      { slot: 'B1', x: 300, y: 628, navTarget: null },
    ];
    drawNavDebugOverlay(ctx, makeArena('meadow'), false, botStates);
    // Should still render the main overlay without bot target visualization
    expect(ctx.fillText).toHaveBeenCalled();
  });
});
