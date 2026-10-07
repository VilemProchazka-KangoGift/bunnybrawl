import type { Ctx2D } from '../types';
import type { Carrot, SpringMushroom, Thorn } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CARROT_SIZE, SPRING_SIZE, HAZARD_GROW_TIME } from '../constants';

const _hazardAnim = { growScale: 1, fadeAlpha: 1 };
const CARROT_ART = { tilt: -0.55, width: 0.72, height: 0.96 } as const;
function calcHazardAnim(growTimer: number, life: number) {
  _hazardAnim.growScale = growTimer > 0 ? 1 - (growTimer / HAZARD_GROW_TIME) : 1;
  _hazardAnim.fadeAlpha = life < 2 ? life / 2 : 1;
  return _hazardAnim;
}

export function drawCarrot(ctx: Ctx2D, carrot: Carrot, timeElapsed: number, frameTime: number): void {
  const x = carrot.x;
  const y = carrot.y;
  const bob = Math.sin(frameTime / 300) * 3;
  const age = timeElapsed - carrot.spawnTime;
  ctx.save();

  // A brief warm ring makes a new pickup visible without a blurred glow.
  if (age < 2) {
    const ring = 1 - age / 2;
    ctx.strokeStyle = `rgba(246, 190, 91, ${ring * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + CARROT_SIZE / 2 + bob, 19 + age * 17, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.translate(x, y + CARROT_SIZE / 2 + bob);
  ctx.rotate(CARROT_ART.tilt);
  ctx.scale(CARROT_ART.width, CARROT_ART.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Three leaves share a buried crown, so the greenery reads as a plant
  // attached to the root rather than separate oval decorations.
  ctx.fillStyle = '#4e7748';
  ctx.strokeStyle = '#304c39';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-2, -7);
  ctx.quadraticCurveTo(-13, -12, -13, -19);
  ctx.quadraticCurveTo(-9, -20, -5, -14);
  ctx.quadraticCurveTo(-7, -23, -2, -25);
  ctx.quadraticCurveTo(3, -23, 1, -14);
  ctx.quadraticCurveTo(7, -21, 11, -19);
  ctx.quadraticCurveTo(11, -12, 3, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // One lighter plane suggests folded leaves without drawing tiny veins.
  ctx.fillStyle = '#83a766';
  ctx.beginPath();
  ctx.moveTo(-2, -11);
  ctx.quadraticCurveTo(-4, -20, -2, -23);
  ctx.quadraticCurveTo(2, -20, 0, -12);
  ctx.closePath();
  ctx.fill();

  // Broad shoulders and an uneven tapered tip keep the root recognizable
  // at roughly the same game scale as the original pickup.
  ctx.fillStyle = '#ef872f';
  ctx.strokeStyle = '#613e2b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-8, -9);
  ctx.quadraticCurveTo(-12, -6, -10, -1);
  ctx.bezierCurveTo(-8, 6, -3, 13, 0, 17);
  ctx.quadraticCurveTo(2, 19, 3, 15);
  ctx.bezierCurveTo(7, 8, 11, 0, 10, -5);
  ctx.quadraticCurveTo(8, -10, 1, -9);
  ctx.quadraticCurveTo(-4, -11, -8, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Color planes give volume without a per-frame canvas gradient.
  ctx.fillStyle = '#d86b2c';
  ctx.beginPath();
  ctx.moveTo(5, -6);
  ctx.quadraticCurveTo(10, -4, 8, 1);
  ctx.quadraticCurveTo(5, 11, 2, 16);
  ctx.quadraticCurveTo(4, 8, 3, 2);
  ctx.quadraticCurveTo(4, -4, 5, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb351';
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.quadraticCurveTo(-6, -8, -2, -7);
  ctx.quadraticCurveTo(-5, -2, -5, 3);
  ctx.quadraticCurveTo(-9, -1, -7, -5);
  ctx.closePath();
  ctx.fill();

  // Two irregular root creases survive downscaling better than many stripes.
  ctx.strokeStyle = '#ad592c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.quadraticCurveTo(-4, 1, -2, 0);
  ctx.moveTo(3, 5);
  ctx.quadraticCurveTo(6, 6, 7, 4);
  ctx.stroke();

  // A small four-point glint distinguishes the pickup from arena foliage.
  const sparkle = Math.sin(frameTime / 200) * 0.5 + 0.5;
  ctx.strokeStyle = `rgba(255, 231, 159, ${0.25 + sparkle * 0.55})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(14, -11);
  ctx.lineTo(14, -4);
  ctx.moveTo(10.5, -7.5);
  ctx.lineTo(17.5, -7.5);
  ctx.stroke();
  ctx.restore();
}

export function drawSpringMushroom(ctx: Ctx2D, spring: SpringMushroom, theme: ThemeConfig): void {
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
  const ink = '#493d42';
  const capY = -13 + squash * 0.75;
  const halfCap = 19 + Math.max(0, squash) * 0.55;
  const stemTop = capY + 1;

  // A flared foot and folded stem make the compression legible without a
  // metal spring. Keep the foot on the platform as the cap moves.
  ctx.fillStyle = '#718553';
  ctx.beginPath();
  ctx.ellipse(0, -1, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e9d9b6';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, stemTop);
  ctx.bezierCurveTo(-6, -7, -5, -3, -8, 0);
  ctx.quadraticCurveTo(0, 2, 8, 0);
  ctx.bezierCurveTo(5, -3, 6, -7, 5, stemTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#b69d8c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4.5, -5);
  ctx.quadraticCurveTo(0, -3, 4.5, -5);
  ctx.moveTo(-4.5, -8);
  ctx.quadraticCurveTo(0, -6, 4.5, -8);
  ctx.stroke();

  // Pale underside stays visible beneath the broad, slightly uneven cap.
  ctx.fillStyle = '#f3cbb0';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.ellipse(0, capY, halfCap, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#a67b77';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, capY + 1);
  ctx.lineTo(-6, capY + 3);
  ctx.moveTo(11, capY + 1);
  ctx.lineTo(6, capY + 3);
  ctx.stroke();

  ctx.fillStyle = '#d46f82';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-halfCap, capY);
  ctx.bezierCurveTo(-halfCap + 1, capY - 8, -13, capY - 16, -5, capY - 16);
  ctx.bezierCurveTo(-1, capY - 19, 5, capY - 17, 9, capY - 15);
  ctx.bezierCurveTo(16, capY - 12, halfCap - 1, capY - 6, halfCap, capY);
  ctx.quadraticCurveTo(9, capY + 2, 0, capY + 1);
  ctx.quadraticCurveTo(-11, capY + 2, -halfCap, capY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // One broad color plane and three uneven spots survive match-scale viewing.
  ctx.fillStyle = '#efa2a0';
  ctx.beginPath();
  ctx.moveTo(-13, capY - 6);
  ctx.quadraticCurveTo(-10, capY - 14, -4, capY - 14);
  ctx.quadraticCurveTo(-9, capY - 10, -10, capY - 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5dfa4';
  ctx.beginPath();
  ctx.ellipse(-8, capY - 8, 3.2, 2.2, -0.35, 0, Math.PI * 2);
  ctx.ellipse(2, capY - 11, 2.8, 2, 0.25, 0, Math.PI * 2);
  ctx.ellipse(11, capY - 5, 2.5, 1.8, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawThorn(ctx: Ctx2D, thorn: Thorn, theme: ThemeConfig): void {
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
