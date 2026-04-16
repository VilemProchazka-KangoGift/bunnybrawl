import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }, colors);
  // Pointed ears
  ctx.beginPath();
  ctx.moveTo(cx - 9, yOff + 6);
  ctx.lineTo(cx - 11, yOff - 6);
  ctx.lineTo(cx - 3, yOff + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 9, yOff + 6);
  ctx.lineTo(cx + 11, yOff - 6);
  ctx.lineTo(cx + 3, yOff + 4);
  ctx.fill();
  // Snout
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 3, yOff + h * 0.5, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx + 6, yOff + h * 0.48, 2, 0, Math.PI * 2);
  ctx.fill();
  // Belly
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.2, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const wolf: CharacterPack = {
  name: 'Wolf',
  color: '#708090', darkColor: '#4A5A68', lightColor: '#A0B0C0',
  emoji: '\uD83D\uDC3A', customEyes: false, idleTransform: 'headBob',
  splatShape: 'star',
  gibs: [{ gibType: 'ear', width: 8, height: 12 }, { gibType: 'ear', width: 8, height: 12 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Wolf', cs: 'Vlk', hi: 'भेड़िया', fil: 'Lobo' },
  legStyle: { shape: 'tapered', footStyle: 'paw', legWidth: 5 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 300, freqEnd: 500, duration: 0.12, type: 'sawtooth' },
      { freq: 500, freqEnd: 400, duration: 0.23, type: 'sawtooth' },
    ], 0.4)],
    volume: 0.4,
  }),
};
