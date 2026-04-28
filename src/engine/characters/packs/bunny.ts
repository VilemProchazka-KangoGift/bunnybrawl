import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.4 }, colors);
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFB6C1';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - w * 0.35, yOff + h * 0.5, 4, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const bunny: CharacterPack = {
  name: 'Bunny',
  color: '#FFFFFF', darkColor: '#CCCCCC', lightColor: '#FFFFFF',
  emoji: '\uD83D\uDC30', customEyes: false,
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 8, height: 20 }, { gibType: 'ear', width: 8, height: 20 }, { gibType: 'tail', width: 8, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Bunny', cs: 'Králík', hi: 'खरगोश', fil: 'Kuneho' },
  legStyle: { shape: 'rounded', footStyle: 'paw', footHeight: 2 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.4 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 800, freqEnd: 1100, duration: 0.05, type: 'square' },
      { freq: 900, freqEnd: 1300, duration: 0.05, type: 'square' },
    ], 0.4)],
    volume: 0.4,
  }),
};
