import { Howl } from '../../audio/howlShim';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.36 }, colors);
  // Tall upright triangular ears
  ctx.beginPath();
  ctx.moveTo(cx - 9, yOff + 10);
  ctx.lineTo(cx - 7, yOff - 8);
  ctx.lineTo(cx - 2, yOff + 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 9, yOff + 10);
  ctx.lineTo(cx + 7, yOff - 8);
  ctx.lineTo(cx + 2, yOff + 8);
  ctx.closePath();
  ctx.fill();
  // Pink inner ears
  ctx.fillStyle = '#FF9AAA';
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 8);
  ctx.lineTo(cx - 7, yOff - 4);
  ctx.lineTo(cx - 3, yOff + 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 8);
  ctx.lineTo(cx + 7, yOff - 4);
  ctx.lineTo(cx + 3, yOff + 7);
  ctx.closePath();
  ctx.fill();
  // Small pink nose
  ctx.fillStyle = '#FF8090';
  ctx.beginPath();
  ctx.arc(cx + 1, yOff + h * 0.48, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Mouth lines from nose
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 1, yOff + h * 0.5);
  ctx.lineTo(cx - 3, yOff + h * 0.55);
  ctx.moveTo(cx + 1, yOff + h * 0.5);
  ctx.lineTo(cx + 5, yOff + h * 0.55);
  ctx.stroke();
  // Whiskers
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    for (let wi = -1; wi <= 1; wi++) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 7, yOff + h * 0.47 + wi * 2.5);
      ctx.lineTo(cx + side * 20, yOff + h * 0.44 + wi * 4);
      ctx.stroke();
    }
  }
  // Upright curved tail
  ctx.strokeStyle = colors.color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const tailCurve = Math.sin((animFrame + 1) * Math.PI * 0.5) * 3;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.3, yOff + h * 0.55);
  ctx.quadraticCurveTo(cx - w * 0.45, yOff + h * 0.1, cx - w * 0.25 + tailCurve, yOff - h * 0.1);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Cat eyes (almond-shaped, green)
  ctx.fillStyle = '#90EE60';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + h * 0.38, 3.5, 2.5, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.38, 3.5, 2.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Vertical slit pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx - 4.5, yOff + h * 0.38, 1, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5.5, yOff + h * 0.38, 1, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-2, 3);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(0, -6, 6, 0);
    ctx.stroke();
  }
};

export const cat: CharacterPack = {
  name: 'Cat',
  color: '#E8A030', darkColor: '#CC8A9A', lightColor: '#FFD4E0',
  emoji: '\uD83D\uDC31', customEyes: true,
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Cat', cs: 'Kočka', hi: 'बिल्ली', fil: 'Pusa' },
  legStyle: { shape: 'tapered', footStyle: 'paw' },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.36 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 700, freqEnd: 500, duration: 0.15, type: 'sine' },
      { freq: 500, freqEnd: 650, duration: 0.18, type: 'sine' },
    ], 0.4)],
    volume: 0.4,
  }),
};
