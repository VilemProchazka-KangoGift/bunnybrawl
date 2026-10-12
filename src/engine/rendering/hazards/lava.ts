import type { Ctx2D } from '../../types';
import type { ThemeConfig } from '../../themes/types';

// drawLavaRock has no module-local caches; clearLavaCaches is a no-op kept
// for symmetry with the other category files so the barrel can call all
// three uniformly without per-module branching.
export function clearLavaCaches(): void {
  // no caches
}

export function drawLavaRock(
  ctx: Ctx2D,
  rock: { x: number; y: number; size: number; rotation: number; vy?: number },
  theme: ThemeConfig,
  time = 0,
): void {
  const lrc = theme.lavaRockConfig;
  const size = rock.size;
  // Four short ash puffs follow the fall direction, independent of body rotation.
  for (let j = 3; j >= 0; j--) {
    const age = j * .065;
    const r = size * (.62 - j * .055);
    ctx.save();
    ctx.translate(rock.x + Math.sin(j * 2.7 + 1) * size * .55,
      rock.y - (rock.vy ?? 225) * age - size * .4);
    ctx.rotate(Math.sin(j + time) * .25);
    ctx.globalAlpha = .58 * (1 - j / 4);
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      const rr = r * (1 + .2 * Math.sin(k * 2.2 + j));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ACA19A'; ctx.strokeStyle = '#624B40'; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.save();
  ctx.translate(rock.x, rock.y);
  ctx.globalAlpha = .3;
  ctx.fillStyle = lrc?.glowColor || '#FF6600';
  const sGlow = size;
  ctx.beginPath();
  ctx.moveTo(-sGlow * 1.5, sGlow * .6);
  ctx.bezierCurveTo(-sGlow * 2, -sGlow * .4, -sGlow * 1.1, -sGlow * 1.8, -sGlow * .7, -sGlow * 2.8);
  ctx.quadraticCurveTo(-sGlow * .3, -sGlow * 1.5, 0, -sGlow * 3.4);
  ctx.quadraticCurveTo(sGlow * .4, -sGlow * 2, sGlow * .8, -sGlow * 2.7);
  ctx.bezierCurveTo(sGlow * .8, -sGlow * 1.3, sGlow * 2, -sGlow * .3, sGlow * 1.4, sGlow * .8);
  ctx.quadraticCurveTo(0, sGlow * 1.9, -sGlow * 1.5, sGlow * .6);
  ctx.fill();
  ctx.rotate(rock.rotation);
  // Rock body -- jagged
  ctx.globalAlpha = 1;
  ctx.fillStyle = lrc?.color || '#4A2010';
  ctx.beginPath();
  const s = rock.size;
  ctx.moveTo(-s, -s * 0.3);
  ctx.lineTo(-s * 0.5, -s);
  ctx.lineTo(s * 0.3, -s * 0.8);
  ctx.lineTo(s, -s * 0.2);
  ctx.lineTo(s * 0.7, s * 0.6);
  ctx.lineTo(-s * 0.2, s * 0.8);
  ctx.lineTo(-s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.fill();
  // Hot cracks
  ctx.strokeStyle = '#FF8800';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.5);
  ctx.lineTo(s * 0.1, s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.2, -s * 0.3);
  ctx.lineTo(-s * 0.1, s * 0.4);
  ctx.stroke();
  ctx.restore();
}
