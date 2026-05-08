import type { Carrot, SpringMushroom, Thorn } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CARROT_SIZE, SPRING_SIZE, HAZARD_GROW_TIME } from '../constants';

const _hazardAnim = { growScale: 1, fadeAlpha: 1 };
function calcHazardAnim(growTimer: number, life: number) {
  _hazardAnim.growScale = growTimer > 0 ? 1 - (growTimer / HAZARD_GROW_TIME) : 1;
  _hazardAnim.fadeAlpha = life < 2 ? life / 2 : 1;
  return _hazardAnim;
}

export function drawCarrot(ctx: CanvasRenderingContext2D, carrot: Carrot, timeElapsed: number, frameTime: number): void {
  const x = carrot.x;
  const y = carrot.y;
  const bob = Math.sin(frameTime / 300) * 3;
  const age = timeElapsed - carrot.spawnTime;

  // Spawn glow ring (fades over 2 seconds)
  if (age < 2) {
    const ring = 1 - age / 2;
    ctx.strokeStyle = `rgba(255, 200, 50, ${ring * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + CARROT_SIZE / 2 + bob, 20 + age * 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(x, y + CARROT_SIZE / 2 + bob);
  ctx.rotate(-0.3); // tilted sideways

  const hw = CARROT_SIZE * 0.35;
  const hh = CARROT_SIZE * 0.65;

  // Carrot body (big, sideways)
  ctx.fillStyle = '#FF8C00';
  ctx.beginPath();
  ctx.moveTo(hh, 0);
  ctx.quadraticCurveTo(hh * 0.3, -hw, -hh * 0.3, -hw * 0.7);
  ctx.quadraticCurveTo(-hh, 0, -hh * 0.3, hw * 0.7);
  ctx.quadraticCurveTo(hh * 0.3, hw, hh, 0);
  ctx.fill();

  // Stripes
  ctx.strokeStyle = '#E07000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hh * 0.2, -hw * 0.5);
  ctx.lineTo(hh * 0.2, hw * 0.5);
  ctx.moveTo(-hh * 0.15, -hw * 0.4);
  ctx.lineTo(-hh * 0.15, hw * 0.4);
  ctx.stroke();

  // Green top (left side)
  ctx.fillStyle = '#228B22';
  ctx.beginPath();
  ctx.ellipse(-hh * 0.6, -3, 4, 8, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-hh * 0.6, 3, 4, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2EA52E';
  ctx.beginPath();
  ctx.ellipse(-hh * 0.7, 0, 3, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Sparkle
  const sparkle = Math.sin(frameTime / 200) * 0.5 + 0.5;
  ctx.fillStyle = `rgba(255,255,200,${sparkle * 0.8})`;
  ctx.beginPath();
  ctx.arc(x + 8, y + 4 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSpringMushroom(ctx: CanvasRenderingContext2D, spring: SpringMushroom, theme: ThemeConfig): void {
  const x = spring.x;
  const y = spring.y;
  const squash = spring.bounceTimer > 0 ? Math.sin(spring.bounceTimer * 20) * 5 : 0;
  const s = SPRING_SIZE * 1.4;

  const { growScale, fadeAlpha } = calcHazardAnim(spring.growTimer, spring.life);

  // Custom spring renderer
  if (theme.drawCustomSpring) {
    theme.drawCustomSpring(ctx, x, y, s, squash, growScale, fadeAlpha);
    return;
  }

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.translate(x, y);
  ctx.scale(growScale, growScale);
  ctx.translate(-x, -y);

  // Stem
  ctx.fillStyle = '#F5F0E0';
  ctx.fillRect(x - 6, y - s * 0.7 + squash, 12, s * 0.7 - squash);

  // Spring coils on stem — batched into one path with sub-paths.
  ctx.strokeStyle = '#AAA';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const cy = y - 4 - i * 6;
    ctx.moveTo(x - 5, cy);
    ctx.lineTo(x + 5, cy - 3);
  }
  ctx.stroke();

  // Cap
  ctx.fillStyle = '#2ECC40';
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.7 + squash, s * 0.7, s * 0.4 - squash * 0.5, 0, Math.PI, 0);
  ctx.fill();

  // Cap highlight
  ctx.fillStyle = '#5DDE70';
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.8 + squash, s * 0.4, s * 0.15, 0, Math.PI, 0);
  ctx.fill();

  // Spots
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x - 6, y - s * 0.85 + squash, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 6, y - s * 0.75 + squash, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - s * 0.9 + squash, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawThorn(ctx: CanvasRenderingContext2D, thorn: Thorn, theme: ThemeConfig): void {
  const { x, y, width, height } = thorn;

  const { growScale, fadeAlpha } = calcHazardAnim(thorn.growTimer, thorn.life);

  // Custom thorn renderer (e.g. zombie hand)
  if (theme.drawCustomThorn) {
    theme.drawCustomThorn(ctx, x, y, width, height, growScale, fadeAlpha);
    return;
  }

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.translate(x + width / 2, y + height);
  ctx.scale(growScale, growScale);
  ctx.translate(-(x + width / 2), -(y + height));

  // Vine base
  ctx.fillStyle = '#3A5C1E';
  ctx.fillRect(x, y + height - 4, width, 4);

  // Spikes — batch all stem triangles into one path, all tip arcs into another.
  const spikeCount = Math.floor(width / 7);
  ctx.fillStyle = '#5C3A1E';
  ctx.beginPath();
  for (let i = 0; i < spikeCount; i++) {
    const sx = x + 4 + i * (width / spikeCount);
    const spikeH = height + 4 + (i % 2) * 3;
    ctx.moveTo(sx - 4, y + height - 4);
    ctx.lineTo(sx, y + height - spikeH);
    ctx.lineTo(sx + 4, y + height - 4);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = '#DD2222';
  ctx.beginPath();
  for (let i = 0; i < spikeCount; i++) {
    const sx = x + 4 + i * (width / spikeCount);
    const spikeH = height + 4 + (i % 2) * 3;
    const tipY = y + height - spikeH + 1;
    ctx.moveTo(sx + 2, tipY);
    ctx.arc(sx, tipY, 2, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.restore();
}
