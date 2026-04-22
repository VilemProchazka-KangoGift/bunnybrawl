import { describe, it, expect, vi } from 'vitest';
import { drawNetDebugOverlay } from './core/debugOverlay';
import type { NetDebugStats } from './core/debugOverlay';

function makeMockCtx() {
  return {
    fillStyle: '' as string,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  } as any;
}

function makeStats(overrides?: Partial<NetDebugStats>): NetDebugStats {
  return {
    localFrame: 100,
    rtt: 45,
    jitter: 8,
    stalled: false,
    isRelay: false,
    snapshotBytes: 320,
    guestCount: 1,
    interpDelayFrames: 2,
    bufferDepth: 5,
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

  it('uses save/restore', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 1280);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('positions overlay based on canvasWidth', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats(), 800);
    const rectCall = ctx.fillRect.mock.calls[0];
    expect(rectCall[0]).toBeLessThan(800);
  });

  it('displays RTT and jitter values', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats({ rtt: 123, jitter: 45 }), 1280);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(textCalls).toContain('123');
    expect(textCalls).toContain('45');
  });

  it('displays snapshot size and guest count', () => {
    const ctx = makeMockCtx();
    drawNetDebugOverlay(ctx, makeStats({ snapshotBytes: 512, guestCount: 3 }), 1280);
    const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(textCalls).toContain('512');
    expect(textCalls).toContain('3');
  });
});
