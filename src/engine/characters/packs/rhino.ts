import type { CharacterPack } from '../types';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.44, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Small rounded ears
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 6, 4, 0, Math.PI * 2);
  ctx.fill();
  // Horn
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(cx + 3, yOff + h * 0.35);
  ctx.lineTo(cx + 6, yOff - 2);
  ctx.lineTo(cx + 9, yOff + h * 0.38);
  ctx.closePath();
  ctx.fill();
  // Smaller second horn
  ctx.beginPath();
  ctx.moveTo(cx + 1, yOff + h * 0.42);
  ctx.lineTo(cx + 3, yOff + h * 0.3);
  ctx.lineTo(cx + 6, yOff + h * 0.42);
  ctx.closePath();
  ctx.fill();
  // Thick skin folds
  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx - 2, yOff + h * 0.55, w * 0.3, 0.3, 1.2);
  ctx.stroke();
  // Nostril
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx + 9, yOff + h * 0.48, 1.5, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'horn') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-3, 5);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fill();
  }
};

export const rhino: CharacterPack = {
  name: 'Rhino',
  color: '#8A8A8A', darkColor: '#5A5A5A', lightColor: '#B0B0B0',
  emoji: '\uD83E\uDD8F', customEyes: false, idleTransform: 'headBob',
  splatShape: 'circle',
  gibs: [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
  sound: { type: 'segment', segments: [{ freq: 100, freqEnd: 60, duration: 0.2, type: 'square' }, { freq: 60, freqEnd: 90, duration: 0.2, type: 'sine' }], genVol: 0.4, vol: 0.5 },
  translations: { en: 'Rhino', cs: 'Nosorožec' },
  drawSprite, drawGib,
};
