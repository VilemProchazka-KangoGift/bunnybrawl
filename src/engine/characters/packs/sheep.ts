import type { CharacterPack } from '../types';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  // Fluffy body — multiple overlapping circles
  ctx.fillStyle = colors.color;
  ctx.beginPath(); ctx.arc(cx - 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.48, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, yOff + h * 0.42, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.56, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4, yOff + h * 0.56, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, yOff + h * 0.35, 7, 0, Math.PI * 2); ctx.fill();
  // Small dark face
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.44, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes on dark face
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
  // Small ears peeking from wool
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - 10, yOff + h * 0.38, 3, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 3, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'wool') {
    ctx.fillStyle = colors.lightColor;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 4, Math.sin(a) * 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

export const sheep: CharacterPack = {
  name: 'Sheep',
  color: '#F0EDE8', darkColor: '#B0A898', lightColor: '#FFFFFF',
  emoji: '\uD83D\uDC11', customEyes: true, idleTransform: 'headBob',
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'wool', width: 14, height: 12 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Sheep', cs: 'Ovce' },
  drawSprite, drawGib,
};
