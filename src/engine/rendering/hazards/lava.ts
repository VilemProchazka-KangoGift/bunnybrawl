import type { ThemeConfig } from '../../themes/types';

// drawLavaRock has no module-local caches; clearLavaCaches is a no-op kept
// for symmetry with the other category files so the barrel can call all
// three uniformly without per-module branching.
export function clearLavaCaches(): void {
  // no caches
}

export function drawLavaRock(
  ctx: CanvasRenderingContext2D,
  rock: { x: number; y: number; size: number; rotation: number },
  theme: ThemeConfig,
): void {
  const lrc = theme.lavaRockConfig;
  ctx.save();
  ctx.translate(rock.x, rock.y);
  ctx.rotate(rock.rotation);
  // Glow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = lrc?.glowColor || '#FF6600';
  ctx.beginPath();
  ctx.arc(0, 0, rock.size * 1.8, 0, Math.PI * 2);
  ctx.fill();
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
