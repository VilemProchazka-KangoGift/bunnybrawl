/**
 * Network debug overlay — draws RTT, jitter, rollback stats on the canvas.
 * Activated via ?debug=net URL param, toggled with ` key.
 */
import type { NetDebugStats } from './rollback';

const FONT = '12px monospace';
const LINE_HEIGHT = 16;
const PAD = 8;
const BG_ALPHA = 0.7;
// Fixed box width — monospace font, longest line is ~35 chars at 12px ≈ 250px
const BOX_WIDTH = 260;
const MAX_LINES = 5;

// Pre-allocated lines array to avoid per-frame allocation
const lines: string[] = new Array(MAX_LINES);

/** Draw network debug stats in the top-right corner of the canvas. */
export function drawNetDebugOverlay(
  ctx: CanvasRenderingContext2D,
  stats: NetDebugStats,
  canvasWidth: number,
): void {
  const adv = stats.localFrame - stats.remoteConfirmedFrame;
  lines[0] = `RTT: ${stats.rtt.toFixed(0)}ms | Jit: ${stats.jitter.toFixed(0)}ms`;
  lines[1] = `Delay: ${stats.inputDelay}F | Adv: ${adv > 0 ? '+' : ''}${adv}F`;
  lines[2] = `Rollback: ${stats.rollbacksPerSec}/s (max ${stats.maxRollbackDepth})`;
  lines[3] = `Frame: ${stats.localFrame} / ${stats.remoteConfirmedFrame}`;
  let lineCount = 4;
  if (stats.stalled) {
    lines[lineCount++] = '** STALLED **';
  }

  const boxH = lineCount * LINE_HEIGHT + PAD * 2;
  const x = canvasWidth - BOX_WIDTH - 8;
  const y = 8;

  ctx.save();
  ctx.font = FONT;

  // Background
  ctx.fillStyle = `rgba(0, 0, 0, ${BG_ALPHA})`;
  ctx.fillRect(x, y, BOX_WIDTH, boxH);

  // Text
  ctx.fillStyle = stats.stalled ? '#ff4444' : '#00ff88';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = 0; i < lineCount; i++) {
    ctx.fillText(lines[i], x + PAD, y + PAD + i * LINE_HEIGHT);
  }

  ctx.restore();
}
