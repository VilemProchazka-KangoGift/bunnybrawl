import type { CharacterPack } from '../types';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const earTwitch = isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI) * 0.25 : 0;
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2 + earTwitch, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFB6C1';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2 + earTwitch, 0, Math.PI * 2);
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
  emoji: '\uD83D\uDC30', customEyes: false, idleTransform: 'none',
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 8, height: 20 }, { gibType: 'ear', width: 8, height: 20 }, { gibType: 'tail', width: 8, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  sound: { type: 'simple', freq: 800, duration: 0.1, waveform: 'square', genVol: 0.4, freqEnd: 1200 },
  translations: { en: 'Bunny', cs: 'Králík' },
  drawSprite, drawGib,
};
