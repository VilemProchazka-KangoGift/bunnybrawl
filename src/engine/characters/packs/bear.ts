import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.5, rx: w * 0.42, ry: h * 0.42 }, colors);
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#D2B48C';
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bear scratch idle: small paw near ear
  if (isIdleAnim) {
    const scratchY = Math.sin((idleT / 0.5) * Math.PI * 3) * 3;
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(cx + 13, yOff + 6 + scratchY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = '#D2B48C';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const bear: CharacterPack = {
  name: 'Bear',
  color: '#8B4513', darkColor: '#654321', lightColor: '#D2691E',
  emoji: '\uD83D\uDC3B', customEyes: false, idleTransform: 'none',
  splatShape: 'circle',
  gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Bear', cs: 'Medvěd' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.5, rx: w * 0.42, ry: h * 0.42 }),
  drawSprite, drawGib,
};
