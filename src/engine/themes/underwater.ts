import type { ThemeConfig } from './types';
import { createThornRenderer, createSpringRenderer } from './drawPrimitives';
import { getFloatingPlatforms } from './utils';

export const UNDERWATER_THEME: ThemeConfig = {
  id: 'underwater',
  nameKey: 'arena_underwater',
  previewGradient: 'linear-gradient(to bottom, #0A3A6B 0%, #0E4A8B 40%, #1A6AAA 100%)',
  previewIcon: '🐠',

  sky: {
    gradient: [
      { offset: 0, color: '#0A2A4B' },
      { offset: 0.3, color: '#0E3A6B' },
      { offset: 0.6, color: '#1A5A9A' },
      { offset: 1, color: '#2A7ABB' },
    ],
  },

  hills: [
    { x: -20, baseY: 630, width: 380, height: 80, color: '#1A4A6A' },
    { x: 300, baseY: 640, width: 420, height: 60, color: '#164060' },
    { x: 670, baseY: 625, width: 400, height: 90, color: '#1A4A6A' },
    { x: 1000, baseY: 635, width: 350, height: 70, color: '#164060' },
  ],

  ground: {
    surfaceColor: '#C2A868',
    surfaceThickness: 5,
  },

  platform: {
    floatingBodyColor: '#3A7A6A',
    floatingTopColor: '#5AA08A',
    floatingAccentColor: '#FF6B6B',
    groundBodyColor: '#8A7A50',
    groundTopColor: '#C2A868',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Sandy ocean floor
        ctx.fillStyle = '#8A7A50';
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = '#C2A868';
        ctx.fillRect(x, y, w, 5);
        // Sand ripples
        ctx.strokeStyle = 'rgba(160, 140, 80, 0.3)';
        ctx.lineWidth = 1;
        for (let sx = x; sx < x + w; sx += 25) {
          ctx.beginPath();
          ctx.moveTo(sx, y + 8);
          ctx.quadraticCurveTo(sx + 12, y + 6, sx + 24, y + 8);
          ctx.stroke();
        }
        // Shell decorations
        ctx.fillStyle = '#E8D8C8';
        for (let sx = x + 50; sx < x + w; sx += 120 + Math.random() * 80) {
          ctx.beginPath();
          ctx.arc(sx, y + 2, 4, Math.PI, 0);
          ctx.fill();
        }
      } else {
        // Coral/rock platform
        ctx.fillStyle = '#3A7A6A';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#5AA08A';
        ctx.fillRect(x, y, w, 4);
        // Coral bumps on top
        ctx.fillStyle = '#FF6B6B';
        for (let cx = x + 8; cx < x + w - 8; cx += 18 + Math.random() * 10) {
          const ch = 3 + Math.random() * 4;
          ctx.beginPath();
          ctx.ellipse(cx, y - 1, 4, ch, 0, Math.PI, 0);
          ctx.fill();
        }
        // Underside detail
        ctx.fillStyle = 'rgba(20, 80, 60, 0.4)';
        ctx.fillRect(x, y + h - 2, w, 2);
      }
    },
  },

  clouds: {
    count: 0,
    color: 'rgba(40, 100, 150, 0.3)',
    minSize: 50,
    maxSize: 80,
    minSpeed: 1,
    maxSpeed: 3,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 30,
    types: [
      { type: 'bubble', weight: 0.8, sizeRange: [2, 6], vxRange: [-5, 5], vyRange: [-20, -50], rotSpeedRange: [0, 0.5] },
      { type: 'petal', weight: 0.2, sizeRange: [2, 4], vxRange: [-8, 8], vyRange: [5, 15], rotSpeedRange: [0.5, 2] },
    ],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'fish', weight: 0.7, colors: ['#FF6B6B', '#FFD700', '#FF8C00', '#7B68EE', '#4A8ABB', '#66CCAA'], speedRange: [20, 45], yRange: [0.15, 0.85] },
      { type: 'fish', weight: 0.3, colors: ['#5AA0CC', '#3A7AAA', '#2288AA'], speedRange: [35, 60], yRange: [0.3, 0.7] },
    ],
  },

  fog: {
    count: 20,
    baseY: 655,
    yVariance: 25,
    speedRange: [1, 4],
    alphaRange: [0.1, 0.25],
    color: '#2A6A9A',
    sizeX: 60,
    sizeY: 12,
  },

  ambientParticles: {
    count: 20,
    sizeRange: [1, 3],
    vxRange: [-2, 2],
    vyRange: [-8, -20],
    alphaRange: [0.15, 0.4],
    colors: ['#88CCFF', '#AADDFF', '#66BBEE'],
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

    // Light rays from surface
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#88CCFF';
    for (let r = 0; r < 6; r++) {
      const rx = 100 + r * 200;
      const rw = 40 + r * 10;
      ctx.beginPath();
      ctx.moveTo(rx - rw, 0);
      ctx.lineTo(rx + rw, 0);
      ctx.lineTo(rx + rw * 2, 720);
      ctx.lineTo(rx - rw * 2, 720);
      ctx.closePath();
      ctx.fill();
    }

    // Water surface shimmer at top
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#4A9ACC';
    for (let wx = -20; wx < 1300; wx += 30) {
      const wy = 5 + Math.sin(wx * 0.04) * 8;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant underwater terrain
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#0A3050';
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(80, 500);
    ctx.lineTo(200, 540);
    ctx.lineTo(350, 470);
    ctx.lineTo(500, 520);
    ctx.lineTo(650, 460);
    ctx.lineTo(800, 510);
    ctx.lineTo(950, 450);
    ctx.lineTo(1100, 490);
    ctx.lineTo(1200, 470);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Seaweed
    const drawSeaweed = (sx: number, sy: number, h: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for (let t = 0; t < h; t += 8) {
        ctx.lineTo(sx + Math.sin(t * 0.15) * 8, sy - t);
      }
      ctx.stroke();
      // Leaves
      ctx.fillStyle = color;
      for (let t = 15; t < h; t += 20) {
        ctx.beginPath();
        ctx.ellipse(sx + Math.sin(t * 0.15) * 8 + 6, sy - t, 8, 3, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawSeaweed(60, y, 60, '#2A8A4A');
    drawSeaweed(280, y, 50, '#3A9A5A');
    drawSeaweed(480, y, 70, '#2A7A3A');
    drawSeaweed(720, y, 55, '#3A9A5A');
    drawSeaweed(950, y, 65, '#2A8A4A');
    drawSeaweed(1200, y, 45, '#3A9A5A');

    // Coral formations
    const drawCoral = (cx: number, cy: number, size: number, color: string) => {
      ctx.fillStyle = color;
      // Main branches
      for (let b = 0; b < 4; b++) {
        const angle = -Math.PI / 2 + (b - 1.5) * 0.4;
        const bh = size * (0.6 + b * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * bh - 3, cy + Math.sin(angle) * bh);
        ctx.lineTo(cx + Math.cos(angle) * bh + 3, cy + Math.sin(angle) * bh);
        ctx.closePath();
        ctx.fill();
        // Tips
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * bh, cy + Math.sin(angle) * bh, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawCoral(160, y, 35, '#FF6B6B');
    drawCoral(400, y, 28, '#FF8C66');
    drawCoral(800, y, 32, '#FF69B4');
    drawCoral(1060, y, 30, '#FF7B7B');

    // Treasure chest
    const drawTreasureChest = (tx: number, ty: number) => {
      // Body
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(tx - 18, ty - 18, 36, 20);
      // Lid
      ctx.fillStyle = '#9A7A24';
      ctx.beginPath();
      ctx.moveTo(tx - 20, ty - 18);
      ctx.lineTo(tx - 18, ty - 28);
      ctx.lineTo(tx + 18, ty - 28);
      ctx.lineTo(tx + 20, ty - 18);
      ctx.closePath();
      ctx.fill();
      // Lock
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(tx - 4, ty - 22, 8, 8);
      // Keyhole
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(tx, ty - 18, 2, 0, Math.PI * 2);
      ctx.fill();
      // Gold coins spilling
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(tx + 22, ty - 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx + 28, ty - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Gold gleam
      ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
      ctx.beginPath();
      ctx.arc(tx - 8, ty - 24, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    drawTreasureChest(640, y);

    // Starfish
    const drawStarfish = (sx: number, sy: number, size: number, color: string) => {
      ctx.fillStyle = color;
      for (let arm = 0; arm < 5; arm++) {
        const angle = (arm / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(angle - 0.3) * size * 0.3, sy + Math.sin(angle - 0.3) * size * 0.3);
        ctx.lineTo(sx + Math.cos(angle) * size, sy + Math.sin(angle) * size);
        ctx.lineTo(sx + Math.cos(angle + 0.3) * size * 0.3, sy + Math.sin(angle + 0.3) * size * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    };

    drawStarfish(340, y - 3, 10, '#FF6347');
    drawStarfish(880, y - 2, 8, '#FF8C00');

    // Platform decorations
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawSeaweed(mid, plat.y, 30, '#2A8A4A');
      } else if (i % 3 === 1) {
        drawCoral(mid, plat.y, 20, '#FF6B6B');
      } else {
        drawStarfish(mid, plat.y - 2, 6, '#FFD700');
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Large foreground coral formation — left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    // Main coral trunk
    ctx.fillStyle = '#8B2252';
    ctx.beginPath();
    ctx.moveTo(-10, gy + 30);
    ctx.lineTo(-5, gy - 20);
    ctx.lineTo(10, gy - 50);
    ctx.lineTo(25, gy - 65);
    ctx.lineTo(35, gy - 55);
    ctx.lineTo(45, gy - 70);
    ctx.lineTo(55, gy - 50);
    ctx.lineTo(65, gy - 30);
    ctx.lineTo(80, gy - 45);
    ctx.lineTo(95, gy - 25);
    ctx.lineTo(105, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Coral branch tips — brighter
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#CC4488';
    ctx.beginPath();
    ctx.arc(25, gy - 65, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(45, gy - 70, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(80, gy - 45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Large foreground coral formation — right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#CC6622';
    ctx.beginPath();
    ctx.moveTo(1175, gy + 30);
    ctx.lineTo(1185, gy - 15);
    ctx.lineTo(1200, gy - 50);
    ctx.lineTo(1215, gy - 60);
    ctx.lineTo(1225, gy - 45);
    ctx.lineTo(1240, gy - 70);
    ctx.lineTo(1255, gy - 55);
    ctx.lineTo(1270, gy - 30);
    ctx.lineTo(1290, gy + 30);
    ctx.closePath();
    ctx.fill();
    // Bright tips
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#FFAA44';
    ctx.beginPath();
    ctx.arc(1215, gy - 60, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1240, gy - 70, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Large foreground kelp strands
    ctx.save();
    ctx.globalAlpha = 0.45;
    const drawFgKelp = (sx: number, h: number, lean: number) => {
      // Thick kelp stalk
      ctx.strokeStyle = '#0D5A2A';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(sx, gy + 10);
      for (let t = 0; t < h; t += 8) {
        ctx.lineTo(sx + Math.sin(t * 0.08) * 18 + lean * (t / h), gy - t);
      }
      ctx.stroke();
      // Large kelp leaves
      ctx.fillStyle = '#1A6A3A';
      for (let t = 15; t < h; t += 20) {
        const lx = sx + Math.sin(t * 0.08) * 18 + lean * (t / h);
        const ly = gy - t;
        const side = (t % 40 < 20) ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(lx + side * 14, ly, 16, 6, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawFgKelp(50, 80, -8);
    drawFgKelp(1230, 75, 8);
    ctx.restore();

    // Foreground seaweed (original, thinner)
    ctx.save();
    ctx.globalAlpha = 0.4;
    const drawFgSeaweed = (sx: number, h: number) => {
      ctx.strokeStyle = '#1A6A3A';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx, gy + 10);
      for (let t = 0; t < h; t += 10) {
        ctx.lineTo(sx + Math.sin(t * 0.12) * 12, gy - t);
      }
      ctx.stroke();
      ctx.fillStyle = '#1A6A3A';
      for (let t = 20; t < h; t += 25) {
        ctx.beginPath();
        ctx.ellipse(sx + Math.sin(t * 0.12) * 12 + 8, gy - t, 10, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawFgSeaweed(150, 70);
    drawFgSeaweed(1130, 60);
    ctx.restore();

    // Caustic light pattern on ground
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#88DDFF';
    for (let cx = 30; cx < 1250; cx += 90) {
      const cy = gy - 15 + Math.sin(cx * 0.05) * 10;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30 + Math.sin(cx * 0.03) * 12, 12, Math.sin(cx * 0.02) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    if (w.type === 'bubble') {
      // Bubble
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, w.size, 0, Math.PI * 2);
      ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(220, 240, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(-w.size * 0.3, -w.size * 0.3, w.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Floating debris/plankton
      ctx.fillStyle = 'rgba(100, 180, 140, 0.3)';
      ctx.beginPath();
      ctx.arc(0, 0, w.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  physics: {
    gravity: 0.6,
    friction: 1.2,
    walkSpeed: 0.7,
    jumpImpulse: 0.9,
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    // Sea urchin — dark spiky ball
    const urchinCX = x + width / 2;
    const urchinCY = y + height * 0.5;
    const urchinR = Math.min(width, height) * 0.35;

    // Core body
    ctx.fillStyle = '#1A1A2A';
    ctx.beginPath();
    ctx.arc(urchinCX, urchinCY, urchinR, 0, Math.PI * 2);
    ctx.fill();

    // Dark purple shading
    ctx.fillStyle = '#2A1A3A';
    ctx.beginPath();
    ctx.arc(urchinCX + urchinR * 0.15, urchinCY + urchinR * 0.1, urchinR * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Spines radiating outward
    ctx.strokeStyle = '#1A1028';
    ctx.lineWidth = 1.5;
    const spineCount = 16;
    for (let i = 0; i < spineCount; i++) {
      const angle = (i / spineCount) * Math.PI * 2;
      const spineLen = urchinR * (1.4 + (i % 3) * 0.2);
      ctx.beginPath();
      ctx.moveTo(
        urchinCX + Math.cos(angle) * urchinR * 0.7,
        urchinCY + Math.sin(angle) * urchinR * 0.7,
      );
      ctx.lineTo(
        urchinCX + Math.cos(angle) * spineLen,
        urchinCY + Math.sin(angle) * spineLen,
      );
      ctx.stroke();
    }

    // Purple tip dots
    ctx.fillStyle = '#4A2A5A';
    for (let i = 0; i < spineCount; i += 2) {
      const angle = (i / spineCount) * Math.PI * 2;
      const spineLen = urchinR * (1.4 + (i % 3) * 0.2);
      ctx.beginPath();
      ctx.arc(
        urchinCX + Math.cos(angle) * spineLen,
        urchinCY + Math.sin(angle) * spineLen,
        1.5, 0, Math.PI * 2,
      );
      ctx.fill();
    }

    // Highlight
    ctx.fillStyle = 'rgba(100, 80, 140, 0.3)';
    ctx.beginPath();
    ctx.arc(urchinCX - urchinR * 0.25, urchinCY - urchinR * 0.25, urchinR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.5;
    const openAmount = 0.3 + Math.abs(bounceTimer) * 0.04;

    // Bottom shell half
    ctx.fillStyle = '#8A7A6A';
    ctx.beginPath();
    ctx.ellipse(x, y, halfW, size * 0.18, 0, 0, Math.PI);
    ctx.fill();
    // Shell ridges bottom
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.4)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 5; r++) {
      const angle = (r / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * halfW, y + Math.sin(angle) * size * 0.18);
      ctx.stroke();
    }

    // Top shell half (hinges open based on bounceTimer)
    ctx.save();
    ctx.translate(x - halfW, y);
    ctx.rotate(-openAmount);
    ctx.fillStyle = '#9A8A7A';
    ctx.beginPath();
    ctx.ellipse(halfW, 0, halfW, size * 0.18, 0, Math.PI, 0);
    ctx.fill();
    // Shell ridges top
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.4)';
    for (let r = 0; r < 5; r++) {
      const angle = Math.PI + (r / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW + Math.cos(angle) * halfW, Math.sin(angle) * size * 0.18);
      ctx.stroke();
    }
    ctx.restore();

    // Pearl inside (visible when open)
    if (openAmount > 0.2) {
      ctx.fillStyle = '#F0E8E0';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.06, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Pearl shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(x - size * 0.03, y - size * 0.09, size * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  ghostConfig: {
    count: 2,
    speed: 25,
    size: 36,
    color: 'rgba(220, 120, 255, 0.7)',
    glowColor: '#CC66FF',
  },

  drawCustomGhost: (ctx, x, y, size, alpha, time) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha * (0.6 + Math.sin(time * 1.2) * 0.15);

    // Jellyfish bell — pulsing dome
    const pulse = 1 + Math.sin(time * 2.5) * 0.08;
    const bellW = size * 0.5 * pulse;
    const bellH = size * 0.35;

    // Glow
    const glow = ctx.createRadialGradient(0, -bellH * 0.3, size * 0.1, 0, 0, size * 1.2);
    glow.addColorStop(0, 'rgba(220, 160, 255, 0.4)');
    glow.addColorStop(1, 'rgba(220, 160, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-size * 1.2, -size * 1.2, size * 2.4, size * 2.4);

    // Bell dome
    const bellGrad = ctx.createRadialGradient(0, -bellH * 0.5, bellW * 0.2, 0, -bellH * 0.3, bellW);
    bellGrad.addColorStop(0, 'rgba(240, 200, 255, 0.85)');
    bellGrad.addColorStop(0.6, 'rgba(200, 140, 240, 0.65)');
    bellGrad.addColorStop(1, 'rgba(160, 100, 220, 0.45)');
    ctx.fillStyle = bellGrad;
    ctx.beginPath();
    ctx.ellipse(0, -bellH * 0.3, bellW, bellH, 0, Math.PI, 0);
    // Scalloped rim
    const scallops = 6;
    for (let i = 0; i < scallops; i++) {
      const sx = bellW - (i + 1) * (bellW * 2 / scallops);
      const sy = -bellH * 0.3 + Math.sin(time * 2 + i) * 2;
      const nx = bellW - (i + 1.5) * (bellW * 2 / scallops);
      ctx.quadraticCurveTo((sx + nx) / 2, sy + 5, nx, sy);
    }
    ctx.closePath();
    ctx.fill();

    // Tentacles — wavy strands hanging down
    ctx.lineWidth = 1.5;
    const tentCount = 5;
    for (let t = 0; t < tentCount; t++) {
      const tx = -bellW * 0.6 + t * (bellW * 1.2 / (tentCount - 1));
      const tentLen = size * (0.5 + (t % 2) * 0.25);
      ctx.strokeStyle = `rgba(220, 160, 255, ${0.5 + (t % 2) * 0.15})`;
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      for (let s = 1; s <= 4; s++) {
        const sy = s * tentLen / 4;
        const sx = tx + Math.sin(time * 2 + t * 1.2 + s * 0.8) * 6;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Inner highlight on bell
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.2, -bellH * 0.5, bellW * 0.25, bellH * 0.3, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  ambientSoundConfig: {
    loops: ['amb_underwater_bubbles'],
    periodic: [{ sound: 'amb_drip', intervalRange: [3, 10] }],
  },
};
