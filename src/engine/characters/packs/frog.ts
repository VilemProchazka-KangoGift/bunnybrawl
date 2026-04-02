import type { CharacterPack } from '../types';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
  ctx.fill();
  // Frog idle blink: draw lines instead of circle eyes
  const frogBlink = isIdleAnim && (idleT / 0.5) > 0.3 && (idleT / 0.5) < 0.7;
  if (frogBlink) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, yOff + 8);
    ctx.lineTo(cx - 3, yOff + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 5, yOff + 8);
    ctx.lineTo(cx + 11, yOff + 8);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#90EE90';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (_ctx, _gibType, _w, _h, _colors) => {
  // No non-body gibs for frog
};

export const frog: CharacterPack = {
  name: 'Frog',
  color: '#32CD32', darkColor: '#228B22', lightColor: '#7CFC00',
  emoji: '\uD83D\uDC38', customEyes: true, idleTransform: 'none',
  splatShape: 'splat',
  gibs: [{ gibType: 'body', width: 12, height: 10 }, { gibType: 'body', width: 10, height: 10 }, { gibType: 'body', width: 11, height: 9 }],
  sound: { type: 'custom' },
  translations: { en: 'Frog', cs: 'Žába' },
  drawSprite, drawGib,
};
