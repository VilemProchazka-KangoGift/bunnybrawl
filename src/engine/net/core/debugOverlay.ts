/**
 * Network debug overlay — draws host-authoritative netcode stats on the canvas.
 * Activated via ?debug=net URL param, toggled with ` key.
 */

export interface NetDebugStats {
  localFrame: number;
  rtt: number;
  jitter: number;
  stalled: boolean;
  isRelay: boolean;
  snapshotBytes: number;
  snapshotBytesMean: number;
  snapshotBytesMax: number;
  guestCount: number;
  interpDelayFrames: number;
  bufferDepth: number;
}

const FONT = '12px monospace';
const LINE_HEIGHT = 16;
const PAD = 8;
const BG_ALPHA = 0.7;
const BOX_WIDTH = 280;
const MAX_LINES = 8;

const lines: string[] = new Array(MAX_LINES);

/** Draw network debug stats in the top-right corner of the canvas. */
export function drawNetDebugOverlay(
  ctx: CanvasRenderingContext2D,
  stats: NetDebugStats,
  canvasWidth: number,
): void {
  lines[0] = `RTT: ${stats.rtt.toFixed(0)}ms | Jit: ${stats.jitter.toFixed(0)}ms`;
  lines[1] = `Frame: ${stats.localFrame} | Snap: ${stats.snapshotBytes}B`;
  lines[2] = `Snap avg: ${stats.snapshotBytesMean.toFixed(0)}B | max: ${stats.snapshotBytesMax}B`;
  lines[3] = `Guests: ${stats.guestCount} | Interp: ${stats.interpDelayFrames}F buf:${stats.bufferDepth}`;
  let lineCount = 4;
  if (stats.stalled) {
    lines[lineCount++] = '** STALLED **';
  }

  const boxH = lineCount * LINE_HEIGHT + PAD * 2;
  const x = canvasWidth - BOX_WIDTH - 8;
  const y = 8;

  ctx.save();
  ctx.font = FONT;

  ctx.fillStyle = `rgba(0, 0, 0, ${BG_ALPHA})`;
  ctx.fillRect(x, y, BOX_WIDTH, boxH);

  ctx.fillStyle = stats.stalled ? '#ff4444' : '#00ff88';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = 0; i < lineCount; i++) {
    ctx.fillText(lines[i], x + PAD, y + PAD + i * LINE_HEIGHT);
  }

  ctx.restore();
}
