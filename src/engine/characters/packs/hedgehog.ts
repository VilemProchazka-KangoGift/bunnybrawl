import type { CharacterPack } from '../types';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  const bodyCx = cx + 2;
  const bodyCy = yOff + h * 0.55;
  const bodyRx = w * 0.34;
  const bodyRy = h * 0.32;
  // Spines
  ctx.fillStyle = colors.darkColor;
  const spineCount = 9;
  for (let i = 0; i < spineCount; i++) {
    const angle = Math.PI * 0.6 + (Math.PI * 1.1) * (i / (spineCount - 1));
    const bx = bodyCx + Math.cos(angle) * bodyRx;
    const by = bodyCy + Math.sin(angle) * bodyRy;
    const tipLen = 7 + (i > 1 && i < spineCount - 1 ? 3 : 0);
    const tx = bodyCx + Math.cos(angle) * (bodyRx + tipLen);
    const ty = bodyCy + Math.sin(angle) * (bodyRy + tipLen);
    const px = -Math.sin(angle) * 2;
    const py = Math.cos(angle) * 2;
    ctx.beginPath();
    ctx.moveTo(bx - px, by - py);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx + px, by + py);
    ctx.closePath();
    ctx.fill();
  }
  // Body
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face/belly
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(bodyCx + bodyRx * 0.35, bodyCy + bodyRy * 0.1, bodyRx * 0.55, bodyRy * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pointed snout
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(bodyCx + bodyRx * 0.7, bodyCy - 3);
  ctx.quadraticCurveTo(bodyCx + bodyRx + 8, bodyCy, bodyCx + bodyRx * 0.7, bodyCy + 3);
  ctx.closePath();
  ctx.fill();
  // Nose
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(bodyCx + bodyRx + 5, bodyCy, 2, 0, Math.PI * 2);
  ctx.fill();
  // Tiny ears
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.arc(bodyCx - 2, bodyCy - bodyRy + 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bodyCx + 5, bodyCy - bodyRy + 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Beady eye
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(bodyCx + bodyRx * 0.5, bodyCy - bodyRy * 0.15, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(bodyCx + bodyRx * 0.5 + 0.8, bodyCy - bodyRy * 0.15 - 0.8, 0.8, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'spine') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-2, 4);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(3, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const hedgehog: CharacterPack = {
  name: 'Hedgehog',
  color: '#8B6B4A', darkColor: '#5C3D1E', lightColor: '#D4B896',
  emoji: '\uD83E\uDD94', customEyes: true, idleTransform: 'headBob',
  splatShape: 'star',
  gibs: [{ gibType: 'spine', width: 6, height: 10 }, { gibType: 'spine', width: 6, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  sound: { type: 'segment', segments: [{ freq: 600, freqEnd: 800, duration: 0.08, type: 'triangle' }, { freq: 800, freqEnd: 500, duration: 0.1, type: 'triangle' }], genVol: 0.4 },
  translations: { en: 'Hedgehog', cs: 'Ježek' },
  drawSprite, drawGib,
};
