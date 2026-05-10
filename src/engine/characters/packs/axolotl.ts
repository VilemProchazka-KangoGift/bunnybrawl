import { Howl } from '../../audio/howlShim';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const SIDES = [-1, 1] as const;

const GILL_LEN = 10;
const GILL_TIP_DX = new Float32Array([
  Math.cos(-1.0) * GILL_LEN,
  Math.cos(-0.6) * GILL_LEN,
  Math.cos(-0.15) * GILL_LEN,
]);
const GILL_TIP_DY = new Float32Array([
  Math.sin(-1.0) * GILL_LEN,
  Math.sin(-0.6) * GILL_LEN,
  Math.sin(-0.15) * GILL_LEN,
]);

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.4, yOff + h * 0.55);
  ctx.lineTo(cx - w * 0.6, yOff + h * 0.45);
  ctx.lineTo(cx - w * 0.62, yOff + h * 0.75);
  ctx.lineTo(cx - w * 0.4, yOff + h * 0.7);
  ctx.closePath();
  ctx.fill();

  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.58, rx: w * 0.42, ry: h * 0.36 }, colors);

  const gillBaseY = yOff + h * 0.4;

  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of SIDES) {
    const baseX = cx + side * w * 0.28;
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(baseX, gillBaseY);
      ctx.lineTo(baseX + side * GILL_TIP_DX[i], gillBaseY + GILL_TIP_DY[i]);
    }
  }
  ctx.stroke();

  ctx.fillStyle = colors.color;
  ctx.beginPath();
  for (const side of SIDES) {
    const baseX = cx + side * w * 0.28;
    for (let i = 0; i < 3; i++) {
      const dx = side * GILL_TIP_DX[i];
      const dy = GILL_TIP_DY[i];
      for (let j = 0; j < 4; j++) {
        const t = 0.25 + j * 0.25;
        const r = 2.2 - j * 0.25;
        const fx = baseX + dx * t;
        const fy = gillBaseY + dy * t;
        ctx.moveTo(fx + r, fy);
        ctx.arc(fx, fy, r, 0, Math.PI * 2);
      }
    }
  }
  ctx.fill();

  ctx.fillStyle = '#FF8FAB';
  ctx.beginPath();
  for (const side of SIDES) {
    const baseX = cx + side * w * 0.28;
    for (let i = 0; i < 3; i++) {
      const tipX = baseX + side * GILL_TIP_DX[i];
      const tipY = gillBaseY + GILL_TIP_DY[i];
      ctx.moveTo(tipX + 1.6, tipY);
      ctx.arc(tipX, tipY, 1.6, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.72, w * 0.28, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  const eyeY = yOff + h * 0.5;
  const eyeDX = w * 0.156;

  ctx.fillStyle = '#000';
  ctx.beginPath();
  for (const side of SIDES) {
    ctx.moveTo(cx + side * eyeDX + 1.6, eyeY);
    ctx.arc(cx + side * eyeDX, eyeY, 1.6, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  for (const side of SIDES) {
    const cxLight = cx + side * eyeDX - 0.3;
    const cyLight = eyeY - h * 0.005;
    ctx.moveTo(cxLight + 0.55, cyLight);
    ctx.arc(cxLight, cyLight, 0.55, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = '#FFB3CC';
  ctx.beginPath();
  for (const side of SIDES) {
    ctx.moveTo(cx + side * 10 + 2.2, yOff + h * 0.62);
    ctx.arc(cx + side * 10, yOff + h * 0.62, 2.2, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, yOff + h * 0.58, 4, 0.35, Math.PI - 0.35);
  ctx.stroke();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'wing') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(4, 0, 6, -3);
    ctx.quadraticCurveTo(2, -1, 0, 4);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, -3);
    ctx.lineTo(5, 3);
    ctx.closePath();
    ctx.fill();
  }
};

export const axolotl: CharacterPack = {
  name: 'Axolotl',
  color: '#FFC8DD', darkColor: '#D9A0B8', lightColor: '#FFE4EC',
  emoji: '🦎', customEyes: true,
  splatShape: 'circle',
  gibs: [{ gibType: 'wing', width: 10, height: 10 }, { gibType: 'wing', width: 10, height: 10 }, { gibType: 'tail', width: 10, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Axolotl', cs: 'Axolotl', hi: 'ऐक्सोलॉटल', fil: 'Axolotl' },
  legStyle: { shape: 'rounded', footStyle: 'webbed', legWidth: 5, legHeight: 4, footHeight: 2 },
  eyebrowAnchor: {
    leftOuter: { x: -10, y: 14 }, leftInner: { x: -1, y: 16 },
    rightOuter: { x: 10, y: 14 }, rightInner: { x: 1, y: 16 },
  },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.38 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 600, freqEnd: 800, duration: 0.06, type: 'sine' },
      { freq: 750, freqEnd: 650, duration: 0.06, type: 'sine' },
    ], 0.3)],
    volume: 0.4,
  }),
};
