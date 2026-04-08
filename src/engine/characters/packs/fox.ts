import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors) => {
  const isRunning = state === 'run';
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.38, ry: h * 0.38 }, colors);
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 8);
  ctx.lineTo(cx - 12, yOff - 6);
  ctx.lineTo(cx - 2, yOff + 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 8);
  ctx.lineTo(cx + 12, yOff - 6);
  ctx.lineTo(cx + 2, yOff + 6);
  ctx.fill();
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : (isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI * 2) * 4 : 0);
  ctx.moveTo(cx - w * 0.3, yOff + h * 0.5);
  ctx.quadraticCurveTo(cx - w * 0.7, yOff + h * 0.2 + tailWag, cx - w * 0.5, yOff + h * 0.1);
  ctx.quadraticCurveTo(cx - w * 0.3, yOff + h * 0.3, cx - w * 0.3, yOff + h * 0.5);
  ctx.fill();
  ctx.fillStyle = '#FFF8DC';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.6, w * 0.2, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(6, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = '#FFF8DC';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const fox: CharacterPack = {
  name: 'Fox',
  color: '#FF8C00', darkColor: '#CC6600', lightColor: '#FFB347',
  emoji: '\uD83E\uDD8A', customEyes: false, idleTransform: 'none',
  splatShape: 'star',
  gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Fox', cs: 'Liška' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.38, ry: h * 0.38 }),
  drawSprite, drawGib,
};
