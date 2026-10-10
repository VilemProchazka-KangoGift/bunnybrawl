import { INVINCIBLE_DURATION } from '../constants';
import type { Ctx2D, Player } from '../types';

/** Four small shoulder sparks; the transported protection timer drives their motion. */
export function drawShieldSparks(ctx: Ctx2D, player: Player): void {
  const remaining = player.invincibleTimer;
  if (remaining <= 0) return;
  const elapsed = Math.max(0, INVINCIBLE_DURATION - remaining);
  const edge = Math.min(1, elapsed / .1, remaining / .1);
  const sx = player.width / 32;
  const sy = player.height / 32;
  const facing = player.facing === 'left' ? -1 : 1;
  ctx.fillStyle = '#B7DEFF';
  ctx.strokeStyle = '#6895C1';
  ctx.lineWidth = .6;
  for (let i = 0; i < 4; i++) {
    const phase = (elapsed * 3 + i * .27) % 1;
    const alpha = Math.sin(phase * Math.PI) * edge;
    const r = 1.2 + 2 * alpha;
    const x = player.x + player.width / 2 + (i % 2 ? -20 : 20) * sx * facing;
    const y = player.y + player.height + (-10 - Math.floor(i / 2) * 18 - phase * 4) * sy;
    ctx.globalAlpha = alpha * .9;
    ctx.beginPath();
    ctx.moveTo(x - r * sx, y);
    ctx.lineTo(x, y - r * 1.4 * sy);
    ctx.lineTo(x + r * sx, y);
    ctx.lineTo(x, y + r * 1.4 * sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
