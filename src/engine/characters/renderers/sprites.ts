import type { CharacterRenderer } from '../types';

export const drawBunny: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears (with idle twitch on right ear)
  const earTwitch = isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI) * 0.25 : 0;
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 4, 12, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 4, 12, 0.2 + earTwitch, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = '#FFB6C1';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + 2, 2, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + 2, 2, 8, 0.2 + earTwitch, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - w * 0.35, yOff + h * 0.5, 4, 0, Math.PI * 2);
  ctx.fill();
};

export const drawFox: CharacterRenderer = (ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT, colors) => {
  const isRunning = state === 'run';
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.38, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 8);
  ctx.lineTo(cx - 12, yOff - 6);
  ctx.lineTo(cx - 2, yOff + 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 8);
  ctx.lineTo(cx + 12, yOff - 6);
  ctx.lineTo(cx + 2, yOff + 6);
  ctx.fill();
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  const tailWag = isRunning ? Math.sin(animFrame * Math.PI) * 5 : (isIdleAnim ? Math.sin((idleT / 0.5) * Math.PI * 2) * 4 : 0);
  ctx.moveTo(cx - w * 0.3, yOff + h * 0.5);
  ctx.quadraticCurveTo(cx - w * 0.7, yOff + h * 0.2 + tailWag, cx - w * 0.5, yOff + h * 0.1);
  ctx.quadraticCurveTo(cx - w * 0.3, yOff + h * 0.3, cx - w * 0.3, yOff + h * 0.5);
  ctx.fill();
  ctx.fillStyle = '#FFF8DC';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.6, w * 0.2, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const drawFrog: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
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

export const drawBear: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, isIdleAnim, idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.5, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#D2B48C';
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bear scratch idle: small paw near ear
  if (isIdleAnim) {
    const scratchY = Math.sin((idleT / 0.5) * Math.PI * 3) * 3;
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(cx + 13, yOff + 6 + scratchY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawOwl: CharacterRenderer = (ctx, cx, yOff, w, h, state, animFrame, _isIdleAnim, _idleT, colors) => {
  const isAirborne = state === 'airborne';
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.5, w * 0.4, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ear tufts
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 6);
  ctx.lineTo(cx - 12, yOff - 6);
  ctx.lineTo(cx - 4, yOff + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 6);
  ctx.lineTo(cx + 12, yOff - 6);
  ctx.lineTo(cx + 4, yOff + 4);
  ctx.fill();
  // White face disk
  ctx.fillStyle = '#E8E0F0';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.38, w * 0.28, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Big round eyes
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 4.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
  ctx.fill();
  // Beak
  ctx.fillStyle = '#D4A030';
  ctx.beginPath();
  ctx.moveTo(cx - 2, yOff + h * 0.45);
  ctx.lineTo(cx, yOff + h * 0.52);
  ctx.lineTo(cx + 2, yOff + h * 0.45);
  ctx.fill();
  // Belly
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  const wingFlap = isAirborne ? Math.sin(animFrame * Math.PI) * 5 : 0;
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.3, yOff + h * 0.45 - wingFlap, 6, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();
};

export const drawCat: CharacterRenderer = (ctx, cx, yOff, w, h, _state, animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
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

export const drawWolf: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
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

export const drawPanda: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Black ears
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // Black eye patches
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + h * 0.38, 5, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.38, 5, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // White eyes in patches
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 4.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5.5, yOff + h * 0.38, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const drawPig: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.55, w * 0.4, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  // Small upright ears
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 10);
  ctx.lineTo(cx - 10, yOff + 0);
  ctx.lineTo(cx - 4, yOff + 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 10);
  ctx.lineTo(cx + 10, yOff + 0);
  ctx.lineTo(cx + 4, yOff + 8);
  ctx.fill();
  // Snout circle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 3, yOff + h * 0.52, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx + 1, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.52, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Curly tail
  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - w * 0.35, yOff + h * 0.45, 5, 0, Math.PI * 1.5);
  ctx.stroke();
};

export const drawCow: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Black patches
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - 6, yOff + h * 0.4, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4, yOff + h * 0.58, 4, 3.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, yOff + h * 0.35, 3, 2.5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Small horns
  ctx.fillStyle = '#E8D8A0';
  ctx.beginPath();
  ctx.moveTo(cx - 7, yOff + 6);
  ctx.lineTo(cx - 10, yOff - 4);
  ctx.lineTo(cx - 5, yOff + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 7, yOff + 6);
  ctx.lineTo(cx + 10, yOff - 4);
  ctx.lineTo(cx + 5, yOff + 4);
  ctx.fill();
  // Pink nose/muzzle
  ctx.fillStyle = '#FFB0B0';
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.52, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = '#D08080';
  ctx.beginPath();
  ctx.arc(cx + 0.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 3.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Custom eyes
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
};

export const drawHorse: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.38, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Long face/muzzle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 6, yOff + h * 0.54, 6, 7, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Tall pointed ears
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.moveTo(cx - 7, yOff + 8);
  ctx.lineTo(cx - 10, yOff - 6);
  ctx.lineTo(cx - 3, yOff + 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 5, yOff + 8);
  ctx.lineTo(cx + 8, yOff - 6);
  ctx.lineTo(cx + 1, yOff + 5);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 6);
  ctx.lineTo(cx - 8, yOff - 2);
  ctx.lineTo(cx - 4, yOff + 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 4, yOff + 6);
  ctx.lineTo(cx + 6, yOff - 2);
  ctx.lineTo(cx + 2, yOff + 5);
  ctx.fill();
  // Flowing mane
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - 10, yOff + 4);
  ctx.lineTo(cx - 14, yOff - 2);
  ctx.lineTo(cx - 8, yOff + 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 11, yOff + 10);
  ctx.lineTo(cx - 16, yOff + 4);
  ctx.lineTo(cx - 9, yOff + 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 10, yOff + h * 0.48);
  ctx.lineTo(cx - 15, yOff + h * 0.38);
  ctx.lineTo(cx - 8, yOff + h * 0.5);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = '#4A3020';
  ctx.beginPath();
  ctx.ellipse(cx + 8, yOff + h * 0.56, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.57, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes — warm brown with highlight
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 3, yOff + h * 0.4, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.4, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2);
  ctx.fill();
};

export const drawGoat: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Curly ram horns
  ctx.strokeStyle = '#B0A080';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 4);
  ctx.bezierCurveTo(cx - 10, yOff - 6, cx - 18, yOff - 4, cx - 16, yOff + 4);
  ctx.bezierCurveTo(cx - 14, yOff + 10, cx - 8, yOff + 10, cx - 8, yOff + 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6, yOff + 4);
  ctx.bezierCurveTo(cx + 10, yOff - 6, cx + 18, yOff - 4, cx + 16, yOff + 4);
  ctx.bezierCurveTo(cx + 14, yOff + 10, cx + 8, yOff + 10, cx + 8, yOff + 6);
  ctx.stroke();
  // Horn ridges
  ctx.strokeStyle = '#8A7A58';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 6, yOff + 3);
  ctx.bezierCurveTo(cx - 9, yOff - 4, cx - 15, yOff - 2, cx - 14, yOff + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6, yOff + 3);
  ctx.bezierCurveTo(cx + 9, yOff - 4, cx + 15, yOff - 2, cx + 14, yOff + 4);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Floppy ears
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx - 12, yOff + h * 0.38, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 4, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx - 12, yOff + h * 0.38, 2.5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 2.5, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Snout
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.5, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.51, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4, yOff + h * 0.51, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.moveTo(cx - 1, yOff + h * 0.56);
  ctx.lineTo(cx + 3, yOff + h * 0.56);
  ctx.lineTo(cx + 2, yOff + h * 0.72);
  ctx.lineTo(cx, yOff + h * 0.68);
  ctx.lineTo(cx - 1, yOff + h * 0.72);
  ctx.fill();
  // Horizontal rectangular pupils (goat eyes!)
  ctx.fillStyle = '#D4B840';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.38, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx - 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, yOff + h * 0.38, 2.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const drawSheep: CharacterRenderer = (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
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

export const drawMonkey: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Large round ears
  ctx.beginPath();
  ctx.arc(cx - 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 12, yOff + h * 0.35, 6, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 12, yOff + h * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Lighter face circle
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.46, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 2, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  // Nose/mouth
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.5, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Curling tail
  ctx.strokeStyle = colors.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx - w * 0.35, yOff + h * 0.4, 7, -Math.PI * 0.3, Math.PI * 1.3);
  ctx.stroke();
};

export const drawTiger: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  ctx.fillStyle = colors.color;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.52, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Round ears
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  // Black stripes on body — upper pair
  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8, yOff + h * 0.35); ctx.lineTo(cx - 12, yOff + h * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, yOff + h * 0.3); ctx.lineTo(cx - 8, yOff + h * 0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 8, yOff + h * 0.35); ctx.lineTo(cx + 12, yOff + h * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5, yOff + h * 0.3); ctx.lineTo(cx + 8, yOff + h * 0.42); ctx.stroke();
  // Lower body stripes
  ctx.beginPath(); ctx.moveTo(cx - 7, yOff + h * 0.5); ctx.lineTo(cx - 11, yOff + h * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 7, yOff + h * 0.5); ctx.lineTo(cx + 11, yOff + h * 0.6); ctx.stroke();
  // White muzzle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.52, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = '#FF6060';
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Whiskers
  ctx.strokeStyle = '#DDD';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 4, yOff + h * 0.52); ctx.lineTo(cx - 14, yOff + h * 0.48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, yOff + h * 0.54); ctx.lineTo(cx - 14, yOff + h * 0.56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, yOff + h * 0.52); ctx.lineTo(cx + 16, yOff + h * 0.48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, yOff + h * 0.54); ctx.lineTo(cx + 16, yOff + h * 0.56); ctx.stroke();
};

export const drawRhino: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
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

export const drawHedgehog: CharacterRenderer = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
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
