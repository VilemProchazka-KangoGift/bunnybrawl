import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }, colors);
  // Curling tail
  ctx.strokeStyle = colors.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx - w * 0.48, yOff + h * 0.4, 6, -Math.PI * 0.3, Math.PI * 1.3);
  ctx.stroke();
  // Large round ears
  ctx.beginPath();
  ctx.arc(cx - 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Lighter face circle
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.46, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  // Nose/mouth
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.5, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 1.5);
    ctx.stroke();
  }
};

export const monkey: CharacterPack = {
  name: 'Monkey',
  color: '#B07040', darkColor: '#704020', lightColor: '#D09060',
  emoji: '\uD83D\uDC35', customEyes: true,
  splatShape: 'star',
  gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Monkey', cs: 'Opice', hi: 'बंदर', fil: 'Unggoy' },
  legStyle: { shape: 'tapered', footStyle: 'paw' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 800, freqEnd: 1200, duration: 0.07, type: 'square' },
      { freq: 1200, freqEnd: 600, duration: 0.13, type: 'square' },
    ], 0.4)],
    volume: 0.4,
  }),
};
