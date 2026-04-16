import { describe, it, expect, vi } from 'vitest';
import { drawNetDebugOverlay } from './debugOverlay';
import type { NetDebugStats } from './debugOverlay';

function makeMockCtx() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
  } as any;
}

function makeStats(overrides?: Partial<NetDebugStats>): NetDebugStats {
  return {
    localFrame: 100,
    remoteConfirmedFrame: 95,
    remoteLatestAck: 98,
    rtt: 45,
    jitter: 8,
    inputDelay: 2,
    stalled: false,
    rollbacksPerSec: 3,
    maxRollbackDepth: 2,
    ...overrides,
  };
}

describe('drawNetDebugOverlay', () => {
  it('draws stats text lines', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 1280);
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.fillText.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('draws background box', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 1280);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('shows STALLED indicator when stalled', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats({ stalled: true }), 1280);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]);
    const hasStalled = textCalls.some((t: string) => t.includes('STALL'));
    expect(hasStalled).toBe(true);
  });

  it('uses save/restore for alpha', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 1280);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('positions overlay based on canvasWidth', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 800);
    // Should use right-aligned position relative to 800px width
    expect(ctx.fillRect).toHaveBeenCalled();
    const rectCall = ctx.fillRect.mock.calls[0];
    expect(rectCall[0]).toBeLessThan(800); // x < canvas width
  });

  it('displays RTT and jitter values', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats({ rtt: 123, jitter: 45 }), 1280);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(textCalls).toContain('123');
    expect(textCalls).toContain('45');
  });

  it('displays rollback count and depth', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats({ rollbacksPerSec: 7, maxRollbackDepth: 4 }), 1280);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(textCalls).toContain('7');
  });
});
