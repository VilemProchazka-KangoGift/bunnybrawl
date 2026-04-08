import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }, colors);
  // Black ears
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // Black eye patches
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + h * 0.38, 5, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.38, 5, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // White eyes in patches
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 4.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const panda: CharacterPack = {
  name: 'Panda',
  color: '#F0F0F0', darkColor: '#333333', lightColor: '#FFFFFF',
  emoji: '\uD83D\uDC3C', customEyes: true, idleTransform: 'headBob',
  splatShape: 'circle',
  gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'body', width: 14, height: 12 }, { gibType: 'body', width: 10, height: 10 }],
  translations: { en: 'Panda', cs: 'Panda' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }),
  drawSprite, drawGib,
};
