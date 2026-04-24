import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const BEAK_COLOR = '#FF8C1A';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.4 }, colors);
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - 4, yOff + 4);
  ctx.lineTo(cx - 5, yOff - 3);
  ctx.lineTo(cx - 1, yOff + 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 1, yOff + 2);
  ctx.lineTo(cx, yOff - 5);
  ctx.lineTo(cx + 2, yOff + 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 2, yOff + 3);
  ctx.lineTo(cx + 5, yOff - 3);
  ctx.lineTo(cx + 4, yOff + 4);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.42, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.42, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 4, yOff + h * 0.42 - 1, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, yOff + h * 0.42 - 1, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BEAK_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx - 2, yOff + h * 0.55);
  ctx.lineTo(cx, yOff + h * 0.63);
  ctx.lineTo(cx + 2, yOff + h * 0.55);
  ctx.closePath();
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'wing') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 1, 2, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(1, 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const chick: CharacterPack = {
  name: 'Chick',
  color: '#FFE44D', darkColor: '#F2B90D', lightColor: '#FFF3A0',
  emoji: '🐥', customEyes: true,
  splatShape: 'paw',
  gibs: [
    { gibType: 'wing', width: 8, height: 12 },
    { gibType: 'tail', width: 8, height: 8 },
    { gibType: 'tail', width: 8, height: 8 },
    { gibType: 'body', width: 14, height: 12 },
  ],
  translations: { en: 'Chick', cs: 'Kuřátko', hi: 'चूज़ा', fil: 'Sisiw' },
  legStyle: { shape: 'stick', footStyle: 'claw', legWidth: 3, legHeight: 4, footWidth: 6, footHeight: 3, footColor: BEAK_COLOR },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.4 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 1400, freqEnd: 1200, duration: 0.06, type: 'square' },
      { freq: 1400, freqEnd: 1100, duration: 0.08, type: 'square' },
    ], 0.35)],
    volume: 0.4,
  }),
};
