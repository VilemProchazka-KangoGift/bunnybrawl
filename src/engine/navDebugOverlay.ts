/**
 * Dev-only nav graph debug overlay.
 * Renders AI navigation edges, platform indices, approach points, and bot nav targets.
 */
import type { Arena } from './types';
import { CANVAS_WIDTH } from './constants';
import { getArenaNav } from './arenas/registry';

export interface BotNavDebugState {
  slot: string;
  x: number;
  y: number;
  navTarget: { x: number; y: number; approachX: number; type: string } | null;
}

const EDGE_COLORS: Record<string, string> = {
  j: '#FFD700', // jump — yellow
  d: '#FF4444', // drop — red
  w: '#44FF44', // walk — green
  g: '#4488FF', // geyser — blue
  z: '#44FFFF', // zero-G drift — cyan
};

const EDGE_LABELS: Record<string, string> = {
  j: 'J', d: 'D', w: 'W', g: 'G', z: 'Z',
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function blendTowardRed(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const blend = Math.min(t * 0.6, 1);
  const nr = Math.round(r + (255 - r) * blend);
  const ng = Math.round(g * (1 - blend));
  const nb = Math.round(b * (1 - blend));
  return `rgb(${nr},${ng},${nb})`;
}

/** Draw a small arrowhead at (tx, ty) pointing from (fx, fy) */
function drawArrowhead(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, size: number): void {
  const angle = Math.atan2(ty - fy, tx - fx);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - size * Math.cos(angle - 0.4), ty - size * Math.sin(angle - 0.4));
  ctx.lineTo(tx - size * Math.cos(angle + 0.4), ty - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

export function drawNavDebugOverlay(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  mirrored: boolean,
  botNavStates?: BotNavDebugState[],
): void {
  const nav = getArenaNav(arena.id);
  if (!nav) {
    ctx.save();
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#FF4444';
    ctx.fillText(`No nav data for "${arena.id}"`, 10, 40);
    ctx.restore();
    return;
  }

  const platforms = arena.platforms;
  ctx.save();
  ctx.globalAlpha = 0.6;

  // --- Platform index labels ---
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(`${i}`, cx, cy);
    ctx.fillStyle = '#FFF';
    ctx.fillText(`${i}`, cx, cy);
  }

  // --- Edges ---
  for (let i = 0; i < nav.edges.length && i < platforms.length; i++) {
    const srcPlat = platforms[i];
    const edges = nav.edges[i];
    if (!edges) continue;

    for (const edge of edges) {
      if (edge.t >= platforms.length) continue;
      const dstPlat = platforms[edge.t];

      // Source: approach point on source platform surface
      let approachX = edge.x;
      if (mirrored) approachX = CANVAS_WIDTH - approachX;
      const srcX = approachX;
      const srcY = srcPlat.y;

      // Target: center-top of destination platform
      const dstX = dstPlat.x + dstPlat.width / 2;
      const dstY = dstPlat.y;

      // Color + danger
      const baseColor = EDGE_COLORS[edge.y] ?? '#AAAAAA';
      const danger = edge.d ?? 0;
      const color = danger > 0 ? blendTowardRed(baseColor, danger / 100) : baseColor;
      const lineWidth = 1 + 2.5 * (danger / 100);

      // Bezier control point: up for jumps/geysers, down for drops, flat for walks
      const midX = (srcX + dstX) / 2;
      let cpY: number;
      if (edge.y === 'j' || edge.y === 'g' || edge.y === 'z') {
        cpY = Math.min(srcY, dstY) - 40 - Math.abs(dstY - srcY) * 0.3;
      } else if (edge.y === 'd') {
        cpY = Math.max(srcY, dstY) + 20;
      } else {
        cpY = (srcY + dstY) / 2 - 15;
      }

      // Draw curve
      ctx.beginPath();
      ctx.moveTo(srcX, srcY);
      ctx.quadraticCurveTo(midX, cpY, dstX, dstY);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Arrowhead — use control point to get tangent direction at endpoint
      ctx.fillStyle = color;
      drawArrowhead(ctx, midX, cpY, dstX, dstY, 7);

      // Approach point diamond
      ctx.beginPath();
      ctx.moveTo(srcX, srcY - 5);
      ctx.lineTo(srcX + 4, srcY);
      ctx.lineTo(srcX, srcY + 5);
      ctx.lineTo(srcX - 4, srcY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // --- Legend ---
  ctx.globalAlpha = 0.8;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let lx = 8;
  const ly = 96; // just below HUD area
  for (const [type, label] of Object.entries(EDGE_LABELS)) {
    const c = EDGE_COLORS[type];
    ctx.fillStyle = c;
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(label, lx + 14, ly);
    ctx.fillText(label, lx + 14, ly);
    lx += 30;
  }
  // Danger indicator
  ctx.fillStyle = '#FF4444';
  ctx.strokeText('thicker=danger', lx + 4, ly);
  ctx.fillText('thicker=danger', lx + 4, ly);

  // --- Bot nav targets ---
  if (botNavStates && botNavStates.length > 0) {
    ctx.globalAlpha = 0.7;
    const now = performance.now() / 1000;
    for (const bot of botNavStates) {
      if (!bot.navTarget) continue;

      const ty = bot.navTarget.y;

      // Pulsing circle at nav target
      const pulse = 6 + 2 * Math.sin(now * 4);
      ctx.beginPath();
      ctx.arc(bot.navTarget.approachX, ty, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dashed line from bot to target
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(bot.x + 12, bot.y + 12); // approx center of bot sprite
      ctx.lineTo(bot.navTarget.approachX, ty);
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#FFA500';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.strokeText(bot.slot, bot.x + 12, bot.y - 6);
      ctx.fillText(bot.slot, bot.x + 12, bot.y - 6);
    }
  }

  // Toggle hint
  ctx.globalAlpha = 0.5;
  ctx.font = '10px monospace';
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';
  ctx.fillText('` to toggle nav overlay', CANVAS_WIDTH - 8, 714);

  ctx.restore();
}
