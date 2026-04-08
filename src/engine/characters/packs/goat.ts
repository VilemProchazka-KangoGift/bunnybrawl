import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }, colors);
  // Curly ram horns
  ctx.strokeStyle = '#B0A080';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 4);
  ctx.bezierCurveTo(cx - 10, yOff - 6, cx - 18, yOff - 4, cx - 16, yOff + 4);
  ctx.bezierCurveTo(cx - 14, yOff + 10, cx - 8, yOff + 10, cx - 8, yOff + 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6, yOff + 4);
  ctx.bezierCurveTo(cx + 10, yOff - 6, cx + 18, yOff - 4, cx + 16, yOff + 4);
  ctx.bezierCurveTo(cx + 14, yOff + 10, cx + 8, yOff + 10, cx + 8, yOff + 6);
  ctx.stroke();
  // Horn ridges
  ctx.strokeStyle = '#8A7A58';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 3);
  ctx.bezierCurveTo(cx - 9, yOff - 4, cx - 15, yOff - 2, cx - 14, yOff + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6, yOff + 3);
  ctx.bezierCurveTo(cx + 9, yOff - 4, cx + 15, yOff - 2, cx + 14, yOff + 4);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Floppy ears
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx - 12, yOff + h * 0.38, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 4, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx - 12, yOff + h * 0.38, 2.5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 2.5, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Snout
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.51, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4, yOff + h * 0.51, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(cx - 1, yOff + h * 0.56);
  ctx.lineTo(cx + 3, yOff + h * 0.56);
  ctx.lineTo(cx + 2, yOff + h * 0.72);
  ctx.lineTo(cx, yOff + h * 0.68);
  ctx.lineTo(cx - 1, yOff + h * 0.72);
  ctx.fill();
  // Horizontal rectangular pupils (goat eyes!)
  ctx.fillStyle = '#D4B840';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'horn') {
    ctx.fillStyle = '#C8B896';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(4, -3, 2, 5);
    ctx.lineTo(-2, 5);
    ctx.quadraticCurveTo(-4, -3, 0, -8);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'beard') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(0, 6);
    ctx.lineTo(3, -3);
    ctx.closePath();
    ctx.fill();
  }
};

export const goat: CharacterPack = {
  name: 'Goat',
  color: '#C8B896', darkColor: '#8A7A60', lightColor: '#E8D8C0',
  emoji: '\uD83D\uDC10', customEyes: true, idleTransform: 'headBob',
  splatShape: 'star',
  gibs: [{ gibType: 'horn', width: 8, height: 14 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'beard', width: 8, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Goat', cs: 'Koza', hi: 'बकरी', fil: 'Kambing' },
  legStyle: { shape: 'tapered', footStyle: 'hoof' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }),
  drawSprite, drawGib,
};
