import type { Ctx2D } from '../types';
import { drawBriar } from './thornArt';
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
  ctx.lineJoin = 'round';
  const ink = '#37443b';
  const capY = -19 + squash * 1.15;
  const stemTop = capY + 1;

  // A planted foot and folded stem replace the old metal coils. The foot
  // stays on the platform while the bell drops and spreads on impact.
  ctx.fillStyle = '#7a8758';
  ctx.beginPath();
  ctx.ellipse(0, -1, 10, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4dfaa';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, stemTop);
  ctx.bezierCurveTo(-3, -11, -5, -5, -8, 0);
  ctx.quadraticCurveTo(0, 2, 8, 0);
  ctx.bezierCurveTo(5, -5, 3, -11, 5, stemTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#c99f74';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-5, -11);
  ctx.quadraticCurveTo(0, -8, 5, -11);
  ctx.moveTo(-5, -6);
  ctx.quadraticCurveTo(0, -3, 5, -6);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, capY);
  ctx.scale(1 + Math.max(0, squash) * 0.015, 1);
  ctx.fillStyle = '#e7ae45';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-19, 0);
  ctx.quadraticCurveTo(-15, -3, -13, -9);
  ctx.quadraticCurveTo(-7, -20, 0, -18);
  ctx.quadraticCurveTo(10, -19, 15, -8);
  ctx.quadraticCurveTo(17, -3, 20, 0);
  ctx.quadraticCurveTo(15, 4, 11, 0);
  ctx.quadraticCurveTo(5, 4, 0, 1);
  ctx.quadraticCurveTo(-6, 4, -11, 0);
  ctx.quadraticCurveTo(-15, 4, -19, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // A light face and shaded edge give the bell volume without tiny spots.
  ctx.fillStyle = '#f9d876';
  ctx.beginPath();
  ctx.moveTo(-14, -3);
  ctx.quadraticCurveTo(-9, -16, 1, -16);
  ctx.quadraticCurveTo(-6, -12, -7, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c87d36';
  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.quadraticCurveTo(12, -13, 15, -2);
  ctx.quadraticCurveTo(12, -5, 9, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a46b3b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(0, 3, 12, 0);
  ctx.stroke();
  ctx.restore();
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

  // Keep the growth pivot on the platform and preserve collision geometry.
  ctx.translate(x, y + height);
  ctx.scale(width / 28, height / 12);
  drawBriar(ctx);

  ctx.restore();
}
