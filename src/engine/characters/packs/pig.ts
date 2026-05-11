import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.38 }, colors);
  // Small upright ears
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 10);
  ctx.lineTo(cx - 10, yOff + 0);
  ctx.lineTo(cx - 4, yOff + 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 10);
  ctx.lineTo(cx + 10, yOff + 0);
  ctx.lineTo(cx + 4, yOff + 8);
  ctx.fill();
  // Snout circle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 3, yOff + h * 0.52, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx + 1, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Curly tail
  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - w * 0.48, yOff + h * 0.45, 4, 0, Math.PI * 1.5);
  ctx.stroke();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(-2, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 1.5);
    ctx.stroke();
  }
};

export const pig: CharacterPack = {
  name: 'Pig',
  color: '#F4A6B0', darkColor: '#C88090', lightColor: '#FFD0D8',
  emoji: '\uD83D\uDC37', customEyes: false,
  splatShape: 'circle',
  gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'tail', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Pig', cs: 'Prase', hi: 'सूअर', fil: 'Baboy' },
  legStyle: { shape: 'rounded', footStyle: 'hoof', footColor: '#FFD0D8' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.38 }),
  drawSprite, drawGib,
};;
