import type { ThemeConfig } from './types';

export const CANDY_LAND_THEME: ThemeConfig = {
  id: 'candy_land',
  nameKey: 'arena_candy_land',
  previewGradient: 'linear-gradient(to bottom, #FFB6C1 0%, #FFDAB9 50%, #FFE4E1 100%)',
  previewIcon: '🍭',

  sky: {
    gradient: [
      { offset: 0, color: '#FFB6C1' },
      { offset: 0.35, color: '#FFDAB9' },
      { offset: 0.7, color: '#FFE4E1' },
      { offset: 1, color: '#FFF0F5' },
    ],
  },

  hills: [
    { x: -20, baseY: 620, width: 350, height: 100, color: '#FFD1DC' },
    { x: 280, baseY: 630, width: 400, height: 80, color: '#FFC8DD' },
    { x: 620, baseY: 615, width: 380, height: 110, color: '#FFD1DC' },
    { x: 950, baseY: 625, width: 400, height: 90, color: '#FFC8DD' },
  ],

  ground: {
    surfaceColor: '#FF9ECE',
    surfaceThickness: 5,
    grassBlades: {
      color: '#FF85C0',
      spacing: 20,
      heightRange: [4, 7],
    },
  },

  platform: {
    floatingBodyColor: '#FFD4A8',
    floatingTopColor: '#FFE8CC',
    floatingAccentColor: '#FF9ECE',
    groundBodyColor: '#F5C49C',
    groundTopColor: '#FFD4B8',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Cookie/wafer ground
        ctx.fillStyle = '#F5C49C';
        ctx.fillRect(x, y + 5, w, h - 5);
        ctx.fillStyle = '#FFD4B8';
        ctx.fillRect(x, y, w, 6);
        // Wafer pattern
        ctx.strokeStyle = 'rgba(200, 150, 100, 0.3)';
        ctx.lineWidth = 1;
        for (let dx = 0; dx < w; dx += 20) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + 6);
          ctx.lineTo(x + dx + 10, y + h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + dx + 10, y + 6);
          ctx.lineTo(x + dx, y + h);
          ctx.stroke();
        }
        // Frosting on top
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.5;
        for (let fx = x; fx < x + w; fx += 30) {
          ctx.beginPath();
          ctx.arc(fx + 15, y + 2, 8, Math.PI, 0);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        // Wafer platform
        ctx.fillStyle = '#FFD4A8';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#FFE8CC';
        ctx.fillRect(x, y, w, 4);
        // Wafer cross pattern
        ctx.strokeStyle = 'rgba(200, 160, 120, 0.3)';
        ctx.lineWidth = 1;
        for (let dx = 0; dx < w; dx += 14) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + 4);
          ctx.lineTo(x + dx + 7, y + h);
          ctx.stroke();
        }
        // Pink frosting drips
        ctx.fillStyle = '#FF9ECE';
        const dripCount = Math.floor(w / 25);
        for (let d = 0; d < dripCount; d++) {
          const dx = x + 10 + d * 25 + Math.random() * 10;
          const dh = 6 + Math.random() * 8;
          ctx.beginPath();
          ctx.arc(dx, y + h + dh * 0.3, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(dx - 2, y + h - 1, 4, dh * 0.3);
        }
      }
    },
  },

  clouds: {
    count: 5,
    color: 'rgba(255, 255, 255, 0.6)',
    minSize: 45,
    maxSize: 75,
    minSpeed: 4,
    maxSpeed: 8,
    yRange: [30, 95],
  },

  weather: {
    particleCount: 25,
    types: [
      { type: 'sprinkle', weight: 0.7, sizeRange: [2, 4], vxRange: [-10, 10], vyRange: [15, 35], rotSpeedRange: [2, 5] },
      { type: 'petal', weight: 0.3, sizeRange: [3, 5], vxRange: [-8, 8], vyRange: [10, 20], rotSpeedRange: [1, 3] },
    ],
  },

  wildlife: {
    count: 3,
    types: [
      { type: 'butterfly', weight: 1, colors: ['#FF69B4', '#FFD700', '#87CEEB', '#DDA0DD', '#98FB98'], speedRange: [10, 25], yRange: [0.2, 0.7] },
    ],
  },

  fog: {
    count: 10,
    baseY: 660,
    yVariance: 10,
    speedRange: [2, 5],
    alphaRange: [0.08, 0.18],
    color: '#FFE0F0',
    sizeX: 45,
    sizeY: 8,
  },

  ambientParticles: {
    count: 15,
    sizeRange: [1, 2.5],
    vxRange: [-3, 3],
    vyRange: [-5, -12],
    alphaRange: [0.2, 0.5],
    colors: ['#FFD700', '#FF69B4', '#87CEEB', '#98FB98', '#DDA0DD'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 150,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  drawFarBackground: (ctx, _arena) => {
    ctx.save();
    ctx.globalAlpha = 0.3;

    // Distant candy mountains
    ctx.fillStyle = '#FF9ECE';
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(100, 460);
    ctx.lineTo(200, 500);
    ctx.lineTo(320, 420);
    ctx.lineTo(450, 480);
    ctx.lineTo(550, 440);
    ctx.lineTo(700, 470);
    ctx.lineTo(850, 400);
    ctx.lineTo(1000, 460);
    ctx.lineTo(1100, 430);
    ctx.lineTo(1200, 480);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // White frosting on mountain peaks
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.25;
    const peaks = [
      { x: 100, y: 460, w: 50 }, { x: 320, y: 420, w: 55 },
      { x: 550, y: 440, w: 45 }, { x: 850, y: 400, w: 60 },
      { x: 1100, y: 430, w: 50 },
    ];
    for (const p of peaks) {
      ctx.beginPath();
      ctx.moveTo(p.x - p.w * 0.5, p.y + 25);
      ctx.quadraticCurveTo(p.x, p.y - 10, p.x + p.w * 0.5, p.y + 25);
      ctx.fill();
    }

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Lollipops
    const drawLollipop = (lx: number, ly: number, size: number, color1: string, color2: string) => {
      // Stick — reaches from ground up to candy
      ctx.fillStyle = '#F5F5DC';
      ctx.fillRect(lx - 2, ly - size * 2, 4, size * 2);
      // Candy circle
      ctx.fillStyle = color1;
      ctx.beginPath();
      ctx.arc(lx, ly - size * 2.2, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // Spiral
      ctx.strokeStyle = color2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lx, ly - size * 2.2, size * 0.3, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(lx, ly - size * 2.2, size * 0.15, 0, Math.PI);
      ctx.stroke();
    };

    drawLollipop(130, y, 30, '#FF6B8A', '#FFFFFF');
    drawLollipop(550, y, 25, '#87CEEB', '#FFD700');
    drawLollipop(840, y, 35, '#DDA0DD', '#FF69B4');
    drawLollipop(1150, y, 28, '#98FB98', '#FFD700');

    // Gummy bears
    const drawGummyBear = (gx: number, gy: number, size: number, color: string) => {
      ctx.fillStyle = color;
      // Body
      ctx.beginPath();
      ctx.ellipse(gx, gy - size * 0.5, size * 0.4, size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(gx, gy - size * 1.1, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // Ears
      ctx.beginPath();
      ctx.arc(gx - size * 0.2, gy - size * 1.35, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx + size * 0.2, gy - size * 1.35, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(gx - size * 0.08, gy - size * 1.15, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx + size * 0.08, gy - size * 1.15, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(gx + size * 0.1, gy - size * 0.6, size * 0.15, size * 0.25, 0.3, 0, Math.PI * 2);
      ctx.fill();
    };

    drawGummyBear(280, y, 18, 'rgba(255, 80, 80, 0.8)');
    drawGummyBear(700, y, 15, 'rgba(80, 200, 80, 0.8)');
    drawGummyBear(1000, y, 17, 'rgba(255, 200, 50, 0.8)');

    // Candy canes
    const drawCandyCane = (cx: number, cy: number, h: number) => {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - h);
      ctx.arc(cx + 8, cy - h, 8, Math.PI, 0, true);
      ctx.stroke();
      // White stripes
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      for (let sy = cy; sy > cy - h; sy -= 12) {
        ctx.beginPath();
        ctx.moveTo(cx - 3, sy);
        ctx.lineTo(cx + 3, sy - 6);
        ctx.stroke();
      }
    };

    drawCandyCane(400, y, 45);
    drawCandyCane(1080, y, 40);

    // Cupcakes as decorations
    const drawCupcake = (cx: number, cy: number, size: number) => {
      // Wrapper
      ctx.fillStyle = '#FF8CAA';
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.5, cy);
      ctx.lineTo(cx - size * 0.35, cy - size * 0.6);
      ctx.lineTo(cx + size * 0.35, cy - size * 0.6);
      ctx.lineTo(cx + size * 0.5, cy);
      ctx.closePath();
      ctx.fill();
      // Frosting
      ctx.fillStyle = '#FFB6C1';
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.7, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Cherry on top
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(cx, cy - size * 1.05, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    };

    drawCupcake(180, y, 20);
    drawCupcake(950, y, 22);

    // Platform decorations
    const floats = arena.platforms.filter(p => p.y < 650 && p.width >= 80);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawLollipop(mid, plat.y, 18, '#FF69B4', '#FFD700');
      } else if (i % 3 === 1) {
        drawCupcake(mid, plat.y, 14);
      } else {
        drawGummyBear(mid, plat.y, 12, 'rgba(100, 150, 255, 0.8)');
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground candy canes
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(30, gy + 20);
    ctx.lineTo(30, gy - 50);
    ctx.arc(42, gy - 50, 12, Math.PI, 0, true);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    for (let sy = gy + 15; sy > gy - 50; sy -= 16) {
      ctx.beginPath();
      ctx.moveTo(25, sy);
      ctx.lineTo(35, sy - 8);
      ctx.stroke();
    }

    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(1250, gy + 20);
    ctx.lineTo(1250, gy - 45);
    ctx.arc(1262, gy - 45, 12, Math.PI, 0, true);
    ctx.stroke();
    ctx.restore();

    // Sprinkle overlay on ground (manual rotation, single save/restore)
    ctx.save();
    ctx.globalAlpha = 0.35;
    const sprinkleColors = ['#FF69B4', '#FFD700', '#87CEEB', '#98FB98', '#DDA0DD', '#FF6347'];
    for (let sx = 50; sx < 1230; sx += 35) {
      ctx.fillStyle = sprinkleColors[Math.floor(sx * 0.03) % sprinkleColors.length];
      const angle = Math.sin(sx * 0.1) * 0.8;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = sx, cy = gy - 2;
      // Rotated rect (6×2) centered at (cx, cy)
      ctx.beginPath();
      ctx.moveTo(cx - 3 * cos + 1 * sin, cy - 3 * sin - 1 * cos);
      ctx.lineTo(cx + 3 * cos + 1 * sin, cy + 3 * sin - 1 * cos);
      ctx.lineTo(cx + 3 * cos - 1 * sin, cy + 3 * sin + 1 * cos);
      ctx.lineTo(cx - 3 * cos - 1 * sin, cy - 3 * sin + 1 * cos);
      ctx.fill();
    }
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.rotation);
    if (w.type === 'sprinkle') {
      // Colorful sprinkle
      const colors = ['#FF69B4', '#FFD700', '#87CEEB', '#98FB98', '#DDA0DD', '#FF6347'];
      ctx.fillStyle = colors[Math.floor(w.x * 0.1) % colors.length];
      ctx.fillRect(-w.size, -w.size * 0.3, w.size * 2, w.size * 0.6);
      // Rounded ends
      ctx.beginPath();
      ctx.arc(-w.size, 0, w.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w.size, 0, w.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sugar petal
      ctx.fillStyle = 'rgba(255, 200, 220, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w.size, w.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawCustomThorn: (ctx, x, y, width, height, growScale, fadeAlpha) => {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    const cx = x + width / 2;
    const by = y + height;
    ctx.translate(cx, by);
    ctx.scale(growScale, growScale);
    ctx.translate(-cx, -by);

    // Candy cane spikes — red/white striped pointed sticks
    const canes = [
      { sx: 0.15, sh: 0.65 },
      { sx: 0.35, sh: 0.9 },
      { sx: 0.5, sh: 1.0 },
      { sx: 0.65, sh: 0.85 },
      { sx: 0.85, sh: 0.6 },
    ];
    for (const c of canes) {
      const caneX = x + width * c.sx;
      const caneH = height * c.sh;
      const caneW = width * 0.055;
      // Red base
      ctx.fillStyle = '#FF2222';
      ctx.beginPath();
      ctx.moveTo(caneX - caneW, by);
      ctx.lineTo(caneX, by - caneH);
      ctx.lineTo(caneX + caneW, by);
      ctx.closePath();
      ctx.fill();
      // White stripes
      ctx.fillStyle = '#FFFFFF';
      const stripeCount = Math.floor(caneH / 8);
      for (let s = 0; s < stripeCount; s += 2) {
        const t1 = s / stripeCount;
        const t2 = (s + 1) / stripeCount;
        const y1 = by - caneH * t1;
        const y2 = by - caneH * t2;
        const w1 = caneW * (1 - t1);
        const w2 = caneW * (1 - t2);
        ctx.beginPath();
        ctx.moveTo(caneX - w1, y1);
        ctx.lineTo(caneX - w2, y2);
        ctx.lineTo(caneX + w2, y2);
        ctx.lineTo(caneX + w1, y1);
        ctx.closePath();
        ctx.fill();
      }
      // Shiny highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(caneX - caneW * 0.2, by);
      ctx.lineTo(caneX, by - caneH);
      ctx.lineTo(caneX + caneW * 0.1, by);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  },

  drawCustomSpring: (ctx, x, y, size, bounceTimer, growScale, fadeAlpha) => {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(x, y);
    ctx.scale(growScale, growScale);
    ctx.translate(-x, -y);

    const squash = 1 + bounceTimer * 0.03;
    const halfW = size * 0.4;
    const bodyH = size * 0.85 / squash;

    // Gummy bear body
    ctx.fillStyle = 'rgba(80, 220, 80, 0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y - bodyH * 0.45, halfW, bodyH * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headR = size * 0.22;
    ctx.beginPath();
    ctx.arc(x, y - bodyH - headR * 0.2, headR, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath();
    ctx.arc(x - headR * 0.7, y - bodyH - headR * 1.1, headR * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + headR * 0.7, y - bodyH - headR * 1.1, headR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.beginPath();
    ctx.ellipse(x - halfW * 0.45, y - 2, halfW * 0.3, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + halfW * 0.45, y - 2, halfW * 0.3, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x - headR * 0.3, y - bodyH - headR * 0.3, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + headR * 0.3, y - bodyH - headR * 0.3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y - bodyH - headR * 0.1, headR * 0.3, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // Shiny highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + halfW * 0.2, y - bodyH * 0.5, halfW * 0.2, bodyH * 0.2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
};
