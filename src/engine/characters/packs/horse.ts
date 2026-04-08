import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.38, ry: h * 0.42 }, colors);
  // Long face/muzzle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 6, yOff + h * 0.54, 6, 7, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Tall pointed ears
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.moveTo(cx - 7, yOff + 8);
  ctx.lineTo(cx - 10, yOff - 6);
  ctx.lineTo(cx - 3, yOff + 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 5, yOff + 8);
  ctx.lineTo(cx + 8, yOff - 6);
  ctx.lineTo(cx + 1, yOff + 5);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 6);
  ctx.lineTo(cx - 8, yOff - 2);
  ctx.lineTo(cx - 4, yOff + 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 4, yOff + 6);
  ctx.lineTo(cx + 6, yOff - 2);
  ctx.lineTo(cx + 2, yOff + 5);
  ctx.fill();
  // Flowing mane
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - 10, yOff + 4);
  ctx.lineTo(cx - 14, yOff - 2);
  ctx.lineTo(cx - 8, yOff + 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 11, yOff + 10);
  ctx.lineTo(cx - 16, yOff + 4);
  ctx.lineTo(cx - 9, yOff + 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 10, yOff + h * 0.48);
  ctx.lineTo(cx - 15, yOff + h * 0.38);
  ctx.lineTo(cx - 8, yOff + h * 0.5);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = '#4A3020';
  ctx.beginPath();
  ctx.ellipse(cx + 8, yOff + h * 0.56, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.57, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes — warm brown with highlight
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 3, yOff + h * 0.4, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.4, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'mane') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const horse: CharacterPack = {
  name: 'Horse',
  color: '#8B6040', darkColor: '#5C3A20', lightColor: '#B08060',
  emoji: '\uD83D\uDC34', customEyes: true, idleTransform: 'headBob',
  splatShape: 'circle',
  gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'mane', width: 12, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Horse', cs: 'Kůň', hi: 'घोड़ा', fil: 'Kabayo' },
  legStyle: { shape: 'tapered', footStyle: 'hoof', legHeight: 10, legWidth: 5 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.38, ry: h * 0.42 }),
  drawSprite, drawGib,
};
