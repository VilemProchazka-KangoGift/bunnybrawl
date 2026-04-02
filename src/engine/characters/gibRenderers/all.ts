import type { GibRenderer } from '../types';

export const drawBunnyGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

export const drawFoxGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(6, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = '#FFF8DC';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawBearGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = '#D2B48C';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawOwlGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'wing') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 2, 4, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawCatGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

export const drawWolfGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

export const drawPandaGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawPigGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(-2, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 1.5);
    ctx.stroke();
  }
};

export const drawCowGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'horn') {
    ctx.fillStyle = '#F5DEB3';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-3, 5);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 5, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawGoatGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'horn') {
    ctx.fillStyle = '#C8B896';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(4, -3, 2, 5);
    ctx.lineTo(-2, 5);
    ctx.quadraticCurveTo(-4, -3, 0, -8);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'beard') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(0, 6);
    ctx.lineTo(3, -3);
    ctx.closePath();
    ctx.fill();
  }
};

export const drawHorseGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'mane') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawSheepGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

export const drawMonkeyGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 1.5);
    ctx.stroke();
  }
};

export const drawTigerGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawRhinoGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

export const drawHedgehogGib: GibRenderer = (ctx, gibType, _w, _h, colors) => {
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

// Frog has no unique gib types (only body), so use fallback
export const drawFrogGib: GibRenderer = (_ctx, _gibType, _w, _h, _colors) => {
  // No non-body gibs for frog
};
