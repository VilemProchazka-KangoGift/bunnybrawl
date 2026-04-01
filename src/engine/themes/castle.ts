import type { ThemeConfig } from './types';

export const CASTLE_THEME: ThemeConfig = {
  id: 'castle',
  nameKey: 'arena_castle',
  previewGradient: 'linear-gradient(to bottom, #0A0A2E 0%, #1A1A4E 40%, #3A3A5E 100%)',
  previewIcon: '🏰',

  sky: {
    gradient: [
      { offset: 0, color: '#0A0A1E' },
      { offset: 0.3, color: '#0E0E2E' },
      { offset: 0.6, color: '#1A1A4E' },
      { offset: 1, color: '#2A2A5E' },
    ],
  },

  hills: [
    { x: -30, baseY: 620, width: 400, height: 80, color: '#1A1A2E' },
    { x: 300, baseY: 625, width: 450, height: 70, color: '#151528' },
    { x: 700, baseY: 615, width: 380, height: 90, color: '#1A1A2E' },
    { x: 1000, baseY: 625, width: 350, height: 75, color: '#151528' },
  ],

  ground: {
    surfaceColor: '#4A4A5E',
    surfaceThickness: 4,
  },

  platform: {
    floatingBodyColor: '#3A3A50',
    floatingTopColor: '#5A5A70',
    floatingAccentColor: undefined,
    groundBodyColor: '#2A2A40',
    groundTopColor: '#4A4A5E',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Stone brick floor
        ctx.fillStyle = '#2A2A40';
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = '#4A4A5E';
        ctx.fillRect(x, y, w, 5);
        // Brick pattern
        ctx.strokeStyle = 'rgba(20, 20, 35, 0.5)';
        ctx.lineWidth = 1;
        const brickW = 32;
        const brickH = 14;
        for (let by = y + 6; by < y + h; by += brickH) {
          const off = ((by - y) / brickH) % 2 === 0 ? 0 : brickW / 2;
          for (let bx = x + off; bx < x + w; bx += brickW) {
            ctx.strokeRect(bx, by, brickW, brickH);
          }
        }
      } else {
        // Stone brick platform
        ctx.fillStyle = '#3A3A50';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#5A5A70';
        ctx.fillRect(x, y, w, 4);
        // Brick lines
        ctx.strokeStyle = 'rgba(20, 20, 40, 0.4)';
        ctx.lineWidth = 1;
        const brickW = 24;
        for (let bx = x; bx < x + w; bx += brickW) {
          ctx.beginPath();
          ctx.moveTo(bx, y + 4);
          ctx.lineTo(bx, y + h);
          ctx.stroke();
        }
        // Bottom edge detail
        ctx.fillStyle = '#2A2A3E';
        ctx.fillRect(x, y + h - 2, w, 2);
      }
    },
  },

  clouds: {
    count: 0,
    color: 'rgba(30, 30, 60, 0.3)',
    minSize: 40,
    maxSize: 60,
    minSpeed: 2,
    maxSpeed: 4,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 15,
    types: [
      { type: 'ember', weight: 1, sizeRange: [1, 3], vxRange: [-5, 5], vyRange: [-15, -35], rotSpeedRange: [0, 1], color: '#FF8844' },
    ],
  },

  wildlife: {
    count: 0,
    types: [],
  },

  fog: {
    count: 12,
    baseY: 660,
    yVariance: 15,
    speedRange: [1, 3],
    alphaRange: [0.05, 0.15],
    color: '#8888AA',
    sizeX: 50,
    sizeY: 10,
  },

  ambientParticles: {
    count: 6,
    sizeRange: [1, 2],
    vxRange: [-2, 2],
    vyRange: [-5, -15],
    alphaRange: [0.15, 0.4],
    colors: ['#FFAA44', '#FF8833'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // Stone wall background — fill entire background with wall texture
    ctx.fillStyle = '#1E1E30';
    ctx.fillRect(0, 0, 1280, 720);

    // Brick pattern on walls
    ctx.strokeStyle = 'rgba(15, 15, 25, 0.4)';
    ctx.lineWidth = 1;
    const brickW = 40;
    const brickH = 18;
    for (let by = 0; by < 720; by += brickH) {
      const off = (by / brickH) % 2 === 0 ? 0 : brickW / 2;
      for (let bx = -brickW + off; bx < 1300; bx += brickW) {
        ctx.strokeRect(bx, by, brickW, brickH);
      }
    }

    // Stone color variation patches
    ctx.globalAlpha = 0.08;
    const patches = [
      [80, 100, 120, 90], [400, 50, 100, 80], [800, 120, 130, 70],
      [200, 300, 110, 100], [600, 250, 90, 85], [1000, 200, 120, 95],
      [150, 500, 100, 80], [700, 450, 110, 90], [1100, 400, 90, 70],
    ];
    for (const [px, py, pw, ph] of patches) {
      ctx.fillStyle = Math.random() > 0.5 ? '#252538' : '#1A1A28';
      ctx.fillRect(px, py, pw, ph);
    }
    ctx.globalAlpha = 1;

    // Large arched windows showing starry night sky
    const drawArchedWindow = (wx: number, wy: number, ww: number, wh: number, showMoon = false) => {
      // Window recess (darker)
      ctx.fillStyle = '#08081A';
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.closePath();
      ctx.fill();

      // Starry sky visible through window
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + wh - 3);
      ctx.lineTo(wx + 3, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2 - 3, Math.PI, 0);
      ctx.lineTo(wx + ww - 3, wy + wh - 3);
      ctx.closePath();
      ctx.clip();

      // Night sky gradient through window
      const skyGrd = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      skyGrd.addColorStop(0, '#0A0A2A');
      skyGrd.addColorStop(1, '#151540');
      ctx.fillStyle = skyGrd;
      ctx.fillRect(wx, wy, ww, wh);

      // Stars through window
      ctx.fillStyle = '#FFFFFF';
      for (let s = 0; s < 8; s++) {
        const sx = wx + 8 + (s * 17) % (ww - 16);
        const sy = wy + 10 + (s * 23) % (wh * 0.7);
        ctx.globalAlpha = 0.4 + (s % 3) * 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8 + (s % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Giant moon — only in one window
      if (showMoon) {
        const moonR = Math.min(ww, wh) * 0.3;
        const moonX = wx + ww * 0.55;
        const moonY = wy + wh * 0.3;
        // Moon body
        ctx.fillStyle = '#E8E8CC';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();
        // Crescent shadow
        ctx.fillStyle = '#0A0A2A';
        ctx.beginPath();
        ctx.arc(moonX + moonR * 0.3, moonY - moonR * 0.1, moonR * 0.85, 0, Math.PI * 2);
        ctx.fill();
        // Moonlight glow
        ctx.globalAlpha = 0.15;
        const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 3);
        moonGlow.addColorStop(0, 'rgba(200, 200, 180, 0.4)');
        moonGlow.addColorStop(1, 'rgba(200, 200, 180, 0)');
        ctx.fillStyle = moonGlow;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // Stone frame around window
      ctx.strokeStyle = '#2A2A3E';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + wh * 0.3);
      ctx.arc(wx + ww / 2, wy + wh * 0.3, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.stroke();

      // Window divider (cross mullion)
      ctx.strokeStyle = '#2A2A3E';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy + wh * 0.1);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + wh * 0.55);
      ctx.lineTo(wx + ww - 3, wy + wh * 0.55);
      ctx.stroke();

      // Sill
      ctx.fillStyle = '#2A2A3E';
      ctx.fillRect(wx - 5, wy + wh - 2, ww + 10, 6);
    };

    // Three large windows — only the center one has the moon
    drawArchedWindow(100, 100, 120, 200);
    drawArchedWindow(520, 80, 140, 220, true);
    drawArchedWindow(1000, 90, 130, 210);

    // Two smaller high windows
    drawArchedWindow(330, 140, 80, 140);
    drawArchedWindow(800, 130, 85, 150);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Wall torches on background
    const drawTorch = (tx: number, ty: number) => {
      // Bracket
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(tx - 2, ty - 15, 4, 15);
      ctx.fillRect(tx - 6, ty - 18, 12, 5);
      // Flame
      ctx.fillStyle = '#FF8800';
      ctx.beginPath();
      ctx.moveTo(tx - 5, ty - 18);
      ctx.quadraticCurveTo(tx, ty - 35, tx + 5, ty - 18);
      ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.moveTo(tx - 3, ty - 19);
      ctx.quadraticCurveTo(tx, ty - 30, tx + 3, ty - 19);
      ctx.fill();
      // Glow
      const glow = ctx.createRadialGradient(tx, ty - 25, 2, tx, ty - 25, 40);
      glow.addColorStop(0, 'rgba(255, 150, 50, 0.15)');
      glow.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(tx - 40, ty - 65, 80, 80);
    };

    drawTorch(100, y - 60);
    drawTorch(400, y - 60);
    drawTorch(640, y - 60);
    drawTorch(880, y - 60);
    drawTorch(1180, y - 60);

    // Suits of armor on ground
    const drawArmor = (ax: number, ay: number, size: number) => {
      // Body
      ctx.fillStyle = '#5A5A6A';
      ctx.fillRect(ax - size * 0.3, ay - size * 0.8, size * 0.6, size * 0.5);
      // Helmet
      ctx.fillStyle = '#6A6A7A';
      ctx.beginPath();
      ctx.arc(ax, ay - size * 0.85, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Visor
      ctx.fillStyle = '#2A2A3A';
      ctx.fillRect(ax - size * 0.12, ay - size * 0.88, size * 0.24, size * 0.08);
      // Legs
      ctx.fillStyle = '#5A5A6A';
      ctx.fillRect(ax - size * 0.2, ay - size * 0.3, size * 0.15, size * 0.3);
      ctx.fillRect(ax + size * 0.05, ay - size * 0.3, size * 0.15, size * 0.3);
      // Sword
      ctx.strokeStyle = '#8A8A9A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax + size * 0.35, ay - size * 0.9);
      ctx.lineTo(ax + size * 0.35, ay - size * 0.2);
      ctx.stroke();
      // Hilt
      ctx.strokeStyle = '#6A5A3A';
      ctx.beginPath();
      ctx.moveTo(ax + size * 0.25, ay - size * 0.6);
      ctx.lineTo(ax + size * 0.45, ay - size * 0.6);
      ctx.stroke();
    };

    drawArmor(250, y, 45);
    drawArmor(1050, y, 42);

    // Stone pillars
    const drawPillar = (px: number, py: number, pw: number, ph: number) => {
      ctx.fillStyle = '#3A3A50';
      ctx.fillRect(px, py - ph, pw, ph);
      // Cap
      ctx.fillStyle = '#4A4A60';
      ctx.fillRect(px - 3, py - ph - 5, pw + 6, 8);
      // Base
      ctx.fillRect(px - 3, py - 5, pw + 6, 8);
      // Highlight
      ctx.fillStyle = 'rgba(100, 100, 130, 0.3)';
      ctx.fillRect(px + 2, py - ph + 5, 3, ph - 10);
    };

    // Stone pillars (matching jumpable platform blocks at x=430, 630, 820)
    drawPillar(430, y, 40, 70);
    drawPillar(630, y, 40, 60);
    drawPillar(820, y, 40, 70);
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground stone pillar — left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1A1A2E';
    // Main pillar body
    ctx.fillRect(-10, gy - 80, 55, 110);
    // Pillar capital (wider top)
    ctx.fillRect(-15, gy - 85, 65, 10);
    // Pillar base (wider bottom)
    ctx.fillRect(-15, gy + 20, 65, 10);
    // Stone texture lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#3A3A5E';
    ctx.lineWidth = 1;
    for (let sy = gy - 75; sy < gy + 20; sy += 18) {
      ctx.beginPath();
      ctx.moveTo(-5, sy);
      ctx.lineTo(40, sy);
      ctx.stroke();
    }
    ctx.restore();

    // Large foreground stone pillar — right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(1240, gy - 75, 50, 105);
    ctx.fillRect(1235, gy - 80, 60, 10);
    ctx.fillRect(1235, gy + 20, 60, 10);
    // Stone texture lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#3A3A5E';
    ctx.lineWidth = 1;
    for (let sy = gy - 70; sy < gy + 20; sy += 18) {
      ctx.beginPath();
      ctx.moveTo(1245, sy);
      ctx.lineTo(1285, sy);
      ctx.stroke();
    }
    ctx.restore();

    // Large iron chandelier silhouette — center
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1A1A2E';
    ctx.strokeStyle = '#2A2A3E';
    ctx.lineWidth = 3;
    const chX = 640;
    const chY = gy - 55;
    // Chain from above
    ctx.beginPath();
    ctx.moveTo(chX, chY - 60);
    ctx.lineTo(chX, chY - 25);
    ctx.stroke();
    // Main ring
    ctx.beginPath();
    ctx.ellipse(chX, chY - 20, 50, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Arms extending down with candle holders
    for (const dx of [-45, -22, 0, 22, 45]) {
      ctx.beginPath();
      ctx.moveTo(chX + dx, chY - 20);
      ctx.lineTo(chX + dx, chY - 10);
      ctx.stroke();
      // Candle holder cup
      ctx.fillRect(chX + dx - 4, chY - 10, 8, 5);
      // Candle flame glow
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#FF8844';
      ctx.beginPath();
      ctx.arc(chX + dx, chY - 15, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#1A1A2E';
    }
    ctx.restore();

    // Chain decorations hanging in foreground
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#5A5A6A';
    ctx.lineWidth = 2;
    const drawChain = (cx: number, cy: number, links: number) => {
      for (let i = 0; i < links; i++) {
        const ly = cy + i * 10;
        ctx.beginPath();
        ctx.ellipse(cx, ly, 3, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    drawChain(200, gy - 40, 4);
    drawChain(1080, gy - 35, 3);
    ctx.restore();

    // Foreground hanging banners — animated sway
    const t = Date.now() * 0.001; // time in seconds for animation
    const bannerColors = ['#8B0000', '#00008B', '#006400', '#4B0082'];
    const floats = arena.platforms.filter(p => p.y < 650 && p.width >= 100);
    floats.forEach((plat, i) => {
      const bx = plat.x + plat.width / 2;
      const by = plat.y + plat.height;
      const color = bannerColors[i % bannerColors.length];
      const h = 35;
      const sway = Math.sin(t * 1.5 + i * 1.8) * 6;

      ctx.save();
      ctx.globalAlpha = 0.7;

      // Banner rod
      ctx.fillStyle = '#8A8A6A';
      ctx.fillRect(bx - 14, by - 2, 28, 3);

      // Swaying banner body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx - 12, by);
      ctx.lineTo(bx + 12, by);
      ctx.quadraticCurveTo(bx + 10 + sway * 0.5, by + h * 0.5, bx + 8 + sway, by + h);
      ctx.lineTo(bx + sway, by + h + 12);
      ctx.lineTo(bx - 8 + sway, by + h);
      ctx.quadraticCurveTo(bx - 10 + sway * 0.5, by + h * 0.5, bx - 12, by);
      ctx.closePath();
      ctx.fill();

      // Emblem — shield shape
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      const ex = bx + sway * 0.3;
      ctx.beginPath();
      ctx.moveTo(ex, by + 8);
      ctx.lineTo(ex + 6, by + 13);
      ctx.lineTo(ex + 6, by + 22);
      ctx.lineTo(ex, by + 27);
      ctx.lineTo(ex - 6, by + 22);
      ctx.lineTo(ex - 6, by + 13);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    // Torch spark particles
    ctx.fillStyle = w.color || '#FF8844';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, w.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFCC66';
    ctx.beginPath();
    ctx.arc(0, 0, w.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  ghostConfig: {
    count: 2,
    speed: 30,
    size: 28,
    color: 'rgba(160, 180, 220, 0.5)',
    glowColor: '#5566AA',
  },

  drawCustomThorn: (ctx, x, y, width, height, growScale, fadeAlpha) => {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    const cx = x + width / 2;
    const by = y + height;
    ctx.translate(cx, by);
    ctx.scale(growScale, growScale);
    ctx.translate(-cx, -by);

    // Stone base block
    ctx.fillStyle = '#4A4A55';
    ctx.fillRect(x + width * 0.05, by - height * 0.18, width * 0.9, height * 0.18);
    // Base edge highlight
    ctx.fillStyle = '#5A5A65';
    ctx.fillRect(x + width * 0.05, by - height * 0.18, width * 0.9, 2);

    // Iron spikes
    const spikePositions = [0.15, 0.35, 0.5, 0.65, 0.85];
    for (let i = 0; i < spikePositions.length; i++) {
      const sx = x + width * spikePositions[i];
      const sh = height * (i === 2 ? 0.95 : 0.7);
      const sw = width * 0.06;
      // Spike body
      ctx.fillStyle = '#6A6A78';
      ctx.beginPath();
      ctx.moveTo(sx - sw, by - height * 0.18);
      ctx.lineTo(sx, by - sh);
      ctx.lineTo(sx + sw, by - height * 0.18);
      ctx.closePath();
      ctx.fill();
      // Metal highlight
      ctx.fillStyle = 'rgba(160, 160, 180, 0.35)';
      ctx.beginPath();
      ctx.moveTo(sx - sw * 0.3, by - height * 0.18);
      ctx.lineTo(sx, by - sh);
      ctx.lineTo(sx + sw * 0.2, by - height * 0.18);
      ctx.closePath();
      ctx.fill();
      // Dark tip
      ctx.fillStyle = '#3A3A48';
      ctx.beginPath();
      ctx.arc(sx, by - sh, sw * 0.5, 0, Math.PI * 2);
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

    const halfW = size * 0.45;
    const squash = 1 + bounceTimer * 0.03;
    const bodyH = size * 0.8 / squash;

    // Gargoyle stone body
    ctx.fillStyle = '#5A5A68';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.5, y);
    ctx.lineTo(x - halfW * 0.6, y - bodyH * 0.6);
    ctx.lineTo(x - halfW * 0.3, y - bodyH);
    ctx.lineTo(x + halfW * 0.3, y - bodyH);
    ctx.lineTo(x + halfW * 0.6, y - bodyH * 0.6);
    ctx.lineTo(x + halfW * 0.5, y);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = '#6A6A78';
    ctx.beginPath();
    ctx.arc(x, y - bodyH - size * 0.12, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // Horns
    ctx.fillStyle = '#4A4A58';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y - bodyH - size * 0.2);
    ctx.lineTo(x - size * 0.22, y - bodyH - size * 0.38);
    ctx.lineTo(x - size * 0.08, y - bodyH - size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, y - bodyH - size * 0.2);
    ctx.lineTo(x + size * 0.22, y - bodyH - size * 0.38);
    ctx.lineTo(x + size * 0.08, y - bodyH - size * 0.18);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#FFAA00';
    ctx.globalAlpha = fadeAlpha * 0.8;
    ctx.beginPath();
    ctx.arc(x - size * 0.06, y - bodyH - size * 0.14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size * 0.06, y - bodyH - size * 0.14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fadeAlpha;

    // Wings that extend on bounce
    const wingSpread = halfW * (0.6 + Math.abs(bounceTimer) * 0.08);
    ctx.fillStyle = '#5A5A68';
    // Left wing
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.5, y - bodyH * 0.7);
    ctx.lineTo(x - wingSpread, y - bodyH * 0.9);
    ctx.lineTo(x - wingSpread * 0.8, y - bodyH * 0.5);
    ctx.closePath();
    ctx.fill();
    // Right wing
    ctx.beginPath();
    ctx.moveTo(x + halfW * 0.5, y - bodyH * 0.7);
    ctx.lineTo(x + wingSpread, y - bodyH * 0.9);
    ctx.lineTo(x + wingSpread * 0.8, y - bodyH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Pedestal base
    ctx.fillStyle = '#4A4A55';
    ctx.fillRect(x - halfW * 0.7, y - 3, halfW * 1.4, 3);

    ctx.restore();
  },
};
