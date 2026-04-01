import type { ThemeConfig } from './types';

export const ROOFTOPS_THEME: ThemeConfig = {
  id: 'rooftops',
  nameKey: 'arena_rooftops',
  previewGradient: 'linear-gradient(to bottom, #FF6B35 0%, #FF8C5A 40%, #3A2A4A 100%)',
  previewIcon: '🏙️',

  sky: {
    gradient: [
      { offset: 0, color: '#FF6B35' },
      { offset: 0.25, color: '#FF8C5A' },
      { offset: 0.5, color: '#CC6A70' },
      { offset: 0.75, color: '#6A4A6A' },
      { offset: 1, color: '#2A1A3A' },
    ],
  },

  hills: [],

  ground: {
    surfaceColor: '#5A5060',
    surfaceThickness: 4,
  },

  platform: {
    floatingBodyColor: '#4A4050',
    floatingTopColor: '#6A5A6A',
    floatingAccentColor: undefined,
    groundBodyColor: '#3A3040',
    groundTopColor: '#5A5060',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Rooftop with gravel
        ctx.fillStyle = '#3A3040';
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = '#5A5060';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = 'rgba(80, 70, 90, 0.4)';
        for (let gx = x + 5; gx < x + w; gx += 8 + Math.random() * 6) {
          ctx.beginPath();
          ctx.arc(gx, y + 10 + Math.random() * 20, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#4A4050';
        ctx.fillRect(x, y, w, 2);
      } else if (w <= 35 && h >= 30) {
        // Chimney
        ctx.fillStyle = '#4A3A40';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(60, 45, 50, 0.5)';
        ctx.lineWidth = 1;
        for (let by = y + 5; by < y + h; by += 8) {
          ctx.beginPath();
          ctx.moveTo(x, by);
          ctx.lineTo(x + w, by);
          ctx.stroke();
        }
        ctx.fillStyle = '#5A4A50';
        ctx.fillRect(x - 2, y - 3, w + 4, 5);
        // Smoke
        ctx.strokeStyle = 'rgba(150, 140, 160, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - 3);
        ctx.quadraticCurveTo(x + w / 2 + 8, y - 15, x + w / 2 + 3, y - 25);
        ctx.stroke();
      } else if (w <= 55 && h <= 20) {
        // AC unit / balcony — looks like real building fixtures
        // AC box body
        ctx.fillStyle = '#7A7A88';
        ctx.fillRect(x, y, w, h);
        // Top grill
        ctx.fillStyle = '#8A8A98';
        ctx.fillRect(x, y, w, 3);
        // Vent slats
        ctx.fillStyle = '#5A5A68';
        for (let vy = y + 5; vy < y + h - 2; vy += 4) {
          ctx.fillRect(x + 3, vy, w - 6, 2);
        }
        // Side brackets mounting to wall
        ctx.fillStyle = '#5A5A68';
        ctx.fillRect(x - 2, y + 2, 3, h - 4);
        ctx.fillRect(x + w - 1, y + 2, 3, h - 4);
        // Balcony railing on top (if wide enough)
        if (w >= 45) {
          ctx.strokeStyle = '#6A6A78';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 2, y - 8);
          ctx.lineTo(x + w - 2, y - 8);
          ctx.stroke();
          for (let rx = x + 6; rx < x + w - 2; rx += 10) {
            ctx.beginPath();
            ctx.moveTo(rx, y);
            ctx.lineTo(rx, y - 8);
            ctx.stroke();
          }
        }
      } else if (w >= 200) {
        // Hallway floor — concrete with carpet runner
        ctx.fillStyle = '#38303E';
        ctx.fillRect(x, y + 2, w, h - 2);
        ctx.fillStyle = '#4A4050';
        ctx.fillRect(x, y, w, 3);
        // Carpet runner down the middle
        ctx.fillStyle = 'rgba(120, 40, 40, 0.15)';
        ctx.fillRect(x + w * 0.2, y + 3, w * 0.6, h - 4);
        // Door frames along hallway
        ctx.fillStyle = 'rgba(60, 50, 65, 0.4)';
        for (let dx = x + 30; dx < x + w - 30; dx += 60) {
          ctx.fillRect(dx, y - 28, 20, 28);
          ctx.fillStyle = 'rgba(255, 200, 100, 0.08)';
          ctx.fillRect(dx + 2, y - 26, 16, 24);
          ctx.fillStyle = 'rgba(60, 50, 65, 0.4)';
        }
      } else if (w <= 55 && h >= 25) {
        // Rooftop AC block
        ctx.fillStyle = '#5A5A68';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(70, 70, 80, 0.5)';
        ctx.lineWidth = 1;
        for (let vy = y + 4; vy < y + h - 2; vy += 4) {
          ctx.beginPath();
          ctx.moveTo(x + 2, vy);
          ctx.lineTo(x + w - 2, vy);
          ctx.stroke();
        }
        ctx.fillStyle = '#6A6A78';
        ctx.fillRect(x - 1, y - 2, w + 2, 3);
      } else {
        // Generic platform/walkway
        ctx.fillStyle = '#4A4050';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#6A5A6A';
        ctx.fillRect(x, y, w, 4);
      }
    },
  },

  clouds: {
    count: 4,
    color: 'rgba(255, 150, 100, 0.35)',
    minSize: 55,
    maxSize: 90,
    minSpeed: 3,
    maxSpeed: 7,
    yRange: [20, 70],
  },

  weather: {
    particleCount: 12,
    types: [
      { type: 'leaf', weight: 0.6, sizeRange: [3, 5], vxRange: [5, 20], vyRange: [5, 15], rotSpeedRange: [1, 4] },
      { type: 'ash', weight: 0.4, sizeRange: [2, 4], vxRange: [3, 15], vyRange: [3, 10], rotSpeedRange: [0.5, 2], color: 'rgba(200, 190, 180, 0.4)' },
    ],
  },

  wildlife: {
    count: 5,
    types: [
      { type: 'bird', weight: 1, colors: ['#2A2A3A', '#3A3A4A', '#5A5A6A'], speedRange: [30, 60], yRange: [0.05, 0.3] },
    ],
  },

  fog: {
    count: 6,
    baseY: 660,
    yVariance: 10,
    speedRange: [2, 4],
    alphaRange: [0.05, 0.1],
    color: '#6A5A7A',
    sizeX: 40,
    sizeY: 8,
  },

  ambientParticles: {
    count: 6,
    sizeRange: [1, 2],
    vxRange: [1, 5],
    vyRange: [-2, -8],
    alphaRange: [0.15, 0.35],
    colors: ['#FFCC88', '#FFD4AA'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  drawFarBackground: (ctx, arena) => {
    ctx.save();

    // Sunset glow (no sun disc)
    const sunGrd = ctx.createRadialGradient(300, 200, 10, 300, 200, 200);
    sunGrd.addColorStop(0, 'rgba(255, 200, 80, 0.2)');
    sunGrd.addColorStop(1, 'rgba(255, 150, 50, 0)');
    ctx.fillStyle = sunGrd;
    ctx.fillRect(100, 0, 400, 400);

    // === Building facades — tall structures extending up AND down from rooftops ===
    const buildings = [
      { x: 0, w: 320, roofY: 660, topY: 200, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
      { x: 470, w: 340, roofY: 640, topY: 150, color: '#222030', dark: '#1A1828', accent: '#282535' },
      { x: 960, w: 320, roofY: 650, topY: 180, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
    ];

    for (const b of buildings) {
      ctx.globalAlpha = 0.85;
      // Main wall — extends from top to bottom of screen
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.topY, b.w, 720 - b.topY);
      // Side edges — darker
      ctx.fillStyle = b.dark;
      ctx.fillRect(b.x, b.topY, 8, 720 - b.topY);
      ctx.fillRect(b.x + b.w - 8, b.topY, 8, 720 - b.topY);
      // Floor separator lines
      ctx.strokeStyle = 'rgba(15, 12, 20, 0.4)';
      ctx.lineWidth = 2;
      for (const plat of arena.platforms) {
        if (plat.x >= b.x && plat.x + plat.width <= b.x + b.w + 10 && plat.width >= 150) {
          ctx.beginPath();
          ctx.moveTo(b.x, plat.y);
          ctx.lineTo(b.x + b.w, plat.y);
          ctx.stroke();
        }
      }

      // Windows on facade — above AND below rooftop
      ctx.globalAlpha = 1;
      for (let wy = b.topY + 20; wy < 720; wy += 30) {
        // Skip window rows near hallway openings
        let nearHallway = false;
        for (const plat of arena.platforms) {
          if (plat.width >= 200 && plat.x >= b.x && plat.x + plat.width <= b.x + b.w + 10 && Math.abs(wy - (plat.y - 15)) < 20) {
            nearHallway = true;
            break;
          }
        }
        if (nearHallway) continue;

        for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 28) {
          // Window frame
          ctx.fillStyle = '#1A1520';
          ctx.fillRect(wx - 1, wy - 1, 14, 18);
          // Glass — warm or cool glow
          const lit = Math.sin(wx * 0.7 + wy * 0.3) > -0.2; // deterministic, not random
          ctx.fillStyle = lit ? 'rgba(255, 200, 100, 0.18)' : 'rgba(80, 100, 140, 0.08)';
          ctx.fillRect(wx, wy, 12, 16);
          // Cross divider
          ctx.strokeStyle = 'rgba(25, 20, 30, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(wx + 6, wy);
          ctx.lineTo(wx + 6, wy + 16);
          ctx.stroke();
        }
      }

      // Hallway opening — find the hallway platform for this building
      for (const plat of arena.platforms) {
        if (plat.width >= 200 && plat.x >= b.x && plat.x + plat.width <= b.x + b.w + 10 && plat.y < b.roofY) {
          // Dark hallway opening
          ctx.fillStyle = '#0A0818';
          ctx.fillRect(b.x, plat.y - 30, b.w, 30);
          // Hallway frame
          ctx.fillStyle = b.dark;
          ctx.fillRect(b.x, plat.y - 31, b.w, 2);
          ctx.fillRect(b.x, plat.y - 1, b.w, 2);
          // Hallway interior light
          ctx.fillStyle = 'rgba(255, 180, 80, 0.05)';
          ctx.fillRect(b.x + 10, plat.y - 28, b.w - 20, 25);
          // Furniture silhouettes inside hallway
          ctx.fillStyle = 'rgba(20, 15, 28, 0.6)';
          // Table
          ctx.fillRect(b.x + b.w * 0.3, plat.y - 14, 30, 12);
          ctx.fillRect(b.x + b.w * 0.3 + 3, plat.y - 2, 4, 2);
          ctx.fillRect(b.x + b.w * 0.3 + 23, plat.y - 2, 4, 2);
          // Lamp on table
          ctx.fillStyle = 'rgba(255, 200, 100, 0.12)';
          ctx.beginPath();
          ctx.arc(b.x + b.w * 0.3 + 15, plat.y - 18, 6, 0, Math.PI * 2);
          ctx.fill();
          // Shelf/cabinet on other side
          ctx.fillStyle = 'rgba(20, 15, 28, 0.6)';
          ctx.fillRect(b.x + b.w * 0.6, plat.y - 26, 25, 24);
          ctx.fillRect(b.x + b.w * 0.6 + 2, plat.y - 20, 21, 1);
          ctx.fillRect(b.x + b.w * 0.6 + 2, plat.y - 12, 21, 1);
        }
      }
    }

    // AC unit boxes visible on building facades (at AC platform positions)
    ctx.globalAlpha = 0.7;
    for (const plat of arena.platforms) {
      if (plat.width > 40 && plat.width <= 55 && plat.height <= 20) {
        // This is an AC/balcony — draw mounting bracket on building wall
        ctx.fillStyle = '#4A4858';
        ctx.fillRect(plat.x - 3, plat.y - 2, plat.width + 6, plat.height + 4);
        // Pipe/conduit running up from AC
        ctx.strokeStyle = 'rgba(80, 75, 90, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(plat.x + plat.width / 2, plat.y + plat.height);
        ctx.lineTo(plat.x + plat.width / 2, plat.y + plat.height + 30);
        ctx.stroke();
      }
    }

    // Distant skyline in gaps
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#0A0818';
    ctx.fillRect(330, 380, 60, 340);
    ctx.fillRect(370, 340, 80, 380);
    ctx.fillRect(820, 360, 70, 360);
    ctx.fillRect(870, 400, 60, 320);
    // Distant windows
    ctx.fillStyle = '#FFCC55';
    ctx.globalAlpha = 0.15;
    for (let wy = 400; wy < 680; wy += 25) {
      ctx.fillRect(345, wy, 4, 4);
      ctx.fillRect(390, wy + 8, 4, 4);
      ctx.fillRect(840, wy, 4, 4);
      ctx.fillRect(885, wy + 12, 4, 4);
    }

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    // Antennas on rooftops
    const drawAntenna = (ax: number, ay: number, h: number) => {
      ctx.strokeStyle = '#5A5A6A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay - h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 10, ay - h * 0.7);
      ctx.lineTo(ax + 10, ay - h * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 7, ay - h * 0.85);
      ctx.lineTo(ax + 7, ay - h * 0.85);
      ctx.stroke();
      ctx.fillStyle = '#FF0000';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(ax, ay - h, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawAntenna(160, arena.platforms[0].y, 40);
    drawAntenna(680, arena.platforms[4].y, 45);
    drawAntenna(1200, arena.platforms[9].y, 38);

    // Clothesline between chimneys on building B
    ctx.strokeStyle = '#6A6A7A';
    ctx.lineWidth = 1;
    const clY = arena.platforms[4].y - 25;
    ctx.beginPath();
    ctx.moveTo(545, clY);
    ctx.quadraticCurveTo(660, clY + 8, 775, clY);
    ctx.stroke();
    const clothColors = ['#CC4444', '#4444CC', '#44CC44', '#CCCC44'];
    for (let c = 0; c < 5; c++) {
      const t = (c + 0.5) / 5;
      const cx = 545 + (775 - 545) * t;
      const sagY = clY + 8 * 4 * t * (1 - t);
      ctx.fillStyle = clothColors[c % clothColors.length];
      ctx.fillRect(cx - 4, sagY + 2, 8, 10);
    }

    // Vent pipes on rooftops
    ctx.fillStyle = '#5A5060';
    ctx.fillRect(260, arena.platforms[0].y - 16, 14, 16);
    ctx.fillRect(260, arena.platforms[0].y - 19, 18, 4);
    ctx.fillRect(1170, arena.platforms[9].y - 14, 12, 14);
  },

  drawForegroundNature: (ctx, arena) => {
    // Roof edge railings
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#4A4050';
    ctx.lineWidth = 2;
    const drawRailing = (rx: number, ry: number, rw: number) => {
      ctx.beginPath();
      ctx.moveTo(rx, ry - 16);
      ctx.lineTo(rx + rw, ry - 16);
      ctx.stroke();
      for (let px = rx; px <= rx + rw; px += 18) {
        ctx.beginPath();
        ctx.moveTo(px, ry);
        ctx.lineTo(px, ry - 18);
        ctx.stroke();
      }
    };
    drawRailing(280, arena.platforms[0].y, 40);
    drawRailing(470, arena.platforms[4].y, 40);
    drawRailing(800, arena.platforms[4].y, 40);
    drawRailing(920, arena.platforms[9].y, 40);
    ctx.restore();

    // Foreground building edges
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1A1020';
    ctx.fillRect(-8, arena.platforms[0].y - 60, 35, 90);
    ctx.fillStyle = 'rgba(255, 200, 100, 0.12)';
    ctx.fillRect(3, arena.platforms[0].y - 45, 10, 12);
    ctx.fillRect(3, arena.platforms[0].y - 25, 10, 12);
    ctx.fillStyle = '#1A1020';
    ctx.fillRect(1258, arena.platforms[9].y - 55, 30, 85);
    ctx.fillStyle = 'rgba(255, 200, 100, 0.12)';
    ctx.fillRect(1264, arena.platforms[9].y - 40, 10, 12);
    ctx.restore();

    // Water tank on building A
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#2A2030';
    const wtY = arena.platforms[0].y;
    ctx.fillRect(270, wtY - 10, 4, 35);
    ctx.fillRect(295, wtY - 10, 4, 35);
    ctx.beginPath();
    ctx.moveTo(264, wtY - 10);
    ctx.lineTo(267, wtY - 42);
    ctx.lineTo(302, wtY - 42);
    ctx.lineTo(305, wtY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(273, wtY - 42);
    ctx.lineTo(284, wtY - 52);
    ctx.lineTo(296, wtY - 42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.rotation);
    if (w.type === 'leaf') {
      ctx.fillStyle = 'rgba(200, 190, 170, 0.35)';
      ctx.fillRect(-w.size, -w.size * 0.4, w.size * 2, w.size * 0.8);
    } else {
      ctx.fillStyle = w.color || 'rgba(200, 190, 180, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, w.size * 0.5, 0, Math.PI * 2);
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
    ctx.fillStyle = '#5A5050';
    ctx.fillRect(x + width * 0.05, by - height * 0.12, width * 0.9, height * 0.12);
    const nails = [
      { sx: 0.15, sh: 0.6, tilt: -0.08 }, { sx: 0.3, sh: 0.85, tilt: 0.03 },
      { sx: 0.5, sh: 1.0, tilt: 0 }, { sx: 0.7, sh: 0.8, tilt: -0.05 },
      { sx: 0.85, sh: 0.55, tilt: 0.06 },
    ];
    // Shared gradient for all nails (same color stops)
    const maxNh = height * 1.0; // tallest nail
    const rustGrd = ctx.createLinearGradient(0, 0, 0, -maxNh);
    rustGrd.addColorStop(0, '#7A5030');
    rustGrd.addColorStop(1, '#C07040');
    for (const n of nails) {
      const nx = x + width * n.sx;
      const nh = height * n.sh;
      const nw = width * 0.04;
      ctx.save();
      ctx.translate(nx, by - height * 0.12);
      ctx.rotate(n.tilt);
      ctx.fillStyle = rustGrd;
      ctx.beginPath();
      ctx.moveTo(-nw, 0); ctx.lineTo(-nw * 0.3, -nh);
      ctx.lineTo(nw * 0.3, -nh); ctx.lineTo(nw, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
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
    ctx.fillStyle = '#6A6A72';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.7, y);
    ctx.lineTo(x - halfW * 0.6, y - size * 0.45 / squash);
    ctx.lineTo(x + halfW * 0.6, y - size * 0.45 / squash);
    ctx.lineTo(x + halfW * 0.7, y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7A7A82';
    ctx.fillRect(x - halfW * 0.65, y - size * 0.48 / squash, halfW * 1.3, 3);
    const lidLift = Math.abs(bounceTimer) * 0.6;
    const lidY = y - size * 0.48 / squash - lidLift;
    ctx.fillStyle = '#7A7A85';
    ctx.beginPath();
    ctx.ellipse(x, lidY, halfW * 0.7, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};
