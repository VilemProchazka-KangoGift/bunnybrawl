import type { ArenaPack } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';

export const rooftops: ArenaPack = {
  // ---- Identity ----
  id: 'rooftops',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #FF6B35 0%, #FF8C5A 40%, #3A2A4A 100%)',
  previewIcon: '\u{1F3D9}\u{FE0F}',

  // ---- Translations ----
  translations: { en: 'Rooftops', cs: 'St\u0159echy', hi: '\u091B\u0924\u0947\u0902', fil: 'Bubungan' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 80, y: 480, width: 270, height: 240 },
    { x: 130, y: 440, width: 28, height: 40 },
    { x: 250, y: 444, width: 28, height: 36 },
    { x: 350, y: 505, width: 52, height: 20 },
    { x: 458, y: 430, width: 52, height: 20 },
    { x: 445, y: 550, width: 65, height: 14 },
    { x: 510, y: 370, width: 300, height: 80 },
    { x: 510, y: 550, width: 300, height: 24 },
    { x: 510, y: 580, width: 300, height: 140 },
    { x: 555, y: 335, width: 40, height: 35 },
    { x: 650, y: 330, width: 45, height: 40 },
    { x: 760, y: 338, width: 38, height: 32 },
    { x: 810, y: 550, width: 65, height: 14 },
    { x: 810, y: 430, width: 52, height: 20 },
    { x: 918, y: 360, width: 52, height: 20 },
    { x: 905, y: 480, width: 65, height: 14 },
    { x: 970, y: 300, width: 230, height: 80 },
    { x: 970, y: 480, width: 230, height: 24 },
    { x: 970, y: 510, width: 230, height: 210 },
    { x: 1200, y: 480, width: 65, height: 14 },
  ],
  spawnPoints: [
    { x: 200, y: 460 }, { x: 660, y: 350 }, { x: 1080, y: 280 },
    { x: 280, y: 460 }, { x: 660, y: 530 }, { x: 1080, y: 460 },
  ],
  allowFallOff: true,
  noSpawnZones: [
    { x: 510, y: 450, width: 300, height: 130 },
    { x: 510, y: 575, width: 300, height: 145 },
    { x: 970, y: 380, width: 230, height: 100 },
    { x: 970, y: 505, width: 230, height: 215 },
  ],

  // ---- Visual config ----
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
      if (isGround || (w >= 200 && h >= 25)) {
        // Solid building block -- thin rooftop gravel surface on top only
        const topH = Math.min(h, 8);
        ctx.fillStyle = '#3A3040';
        ctx.fillRect(x, y, w, topH);
        ctx.fillStyle = '#5A5060';
        ctx.fillRect(x, y, w, 4);
        ctx.fillStyle = 'rgba(80, 70, 90, 0.4)';
        for (let gx = x + 5; gx < x + w; gx += 8 + Math.random() * 6) {
          ctx.beginPath();
          ctx.arc(gx, y + 4 + Math.random() * 3, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#4A4050';
        ctx.fillRect(x, y, w, 2);
      } else if (w <= 35 && h >= 30) {
        // Chimney -- brick + smoke
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
        ctx.strokeStyle = 'rgba(150, 140, 160, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - 3);
        ctx.quadraticCurveTo(x + w / 2 + 8, y - 15, x + w / 2 + 3, y - 25);
        ctx.stroke();
      } else if (w >= 60 && w <= 90 && h <= 18) {
        // Balcony at hallway entrance -- concrete ledge + striped awning
        ctx.fillStyle = '#6A6A78';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#7A7A88';
        ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = '#5A5A68';
        ctx.fillRect(x - 2, y + 2, 3, h - 4);
        ctx.fillRect(x + w - 1, y + 2, 3, h - 4);
        // Awning canopy
        const awH = 13;
        ctx.fillStyle = '#8B3030';
        ctx.beginPath();
        ctx.moveTo(x, y - 1);
        ctx.lineTo(x + 4, y - awH);
        ctx.lineTo(x + w - 4, y - awH);
        ctx.lineTo(x + w, y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#C04040';
        for (let sx = x + 8; sx < x + w - 8; sx += 13) {
          const t0 = (sx - x) / w;
          const t1 = (sx + 5 - x) / w;
          const sy0 = y - 1 - (awH - 2) * Math.min(t0 * 3, (1 - t0) * 3, 1);
          const sy1 = y - 1 - (awH - 2) * Math.min(t1 * 3, (1 - t1) * 3, 1);
          ctx.beginPath();
          ctx.moveTo(sx, sy0);
          ctx.lineTo(sx + 5, sy1);
          ctx.lineTo(sx + 5, y - 1);
          ctx.lineTo(sx, y - 1);
          ctx.closePath();
          ctx.fill();
        }
        // Railing
        ctx.strokeStyle = '#5A5A68';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + w, y - 10);
        ctx.stroke();
        for (let rx = x + 5; rx < x + w; rx += 12) {
          ctx.beginPath();
          ctx.moveTo(rx, y);
          ctx.lineTo(rx, y - 10);
          ctx.stroke();
        }
      } else if (w <= 55 && h <= 22) {
        // AC outdoor unit -- chunky white box with prominent fan grill
        // Main housing
        ctx.fillStyle = '#D8D8E0';
        ctx.fillRect(x, y, w, h);
        // 3D depth -- darker bottom and right edges
        ctx.fillStyle = '#A0A0A8';
        ctx.fillRect(x, y + h - 3, w, 3);
        ctx.fillRect(x + w - 3, y, 3, h);
        // Frame border
        ctx.strokeStyle = '#808088';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        // Big fan grill circle -- the main visual feature
        const cx = x + w * 0.55;
        const cy = y + h / 2;
        const r = h * 0.36;
        // Fan grill backing
        ctx.fillStyle = '#404048';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
        ctx.fill();
        // Fan circle
        ctx.strokeStyle = '#909098';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Fan blades (cross)
        ctx.strokeStyle = '#707078';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, cy);
        ctx.lineTo(cx + r * 0.75, cy);
        ctx.moveTo(cx, cy - r * 0.75);
        ctx.lineTo(cx, cy + r * 0.75);
        ctx.stroke();
        // Vent slats on left portion
        ctx.fillStyle = '#B0B0B8';
        for (let vy = y + 3; vy < y + h - 3; vy += 3) {
          ctx.fillRect(x + 3, vy, w * 0.3, 1.5);
        }
        // Compressor bump on top
        ctx.fillStyle = '#C0C0C8';
        ctx.fillRect(x + w * 0.2, y - 3, w * 0.3, 4);
        ctx.fillStyle = '#A0A0A8';
        ctx.fillRect(x + w * 0.2, y - 4, w * 0.3, 1.5);
        // Rubber feet
        ctx.fillStyle = '#404048';
        ctx.fillRect(x + 4, y + h, 4, 2);
        ctx.fillRect(x + w - 8, y + h, 4, 2);
      } else if (w >= 200 && h < 25) {
        // Hallway floor -- warm wooden planks + carpet
        ctx.fillStyle = '#5A4030';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(40, 25, 15, 0.35)';
        ctx.lineWidth = 1;
        for (let py = y + 5; py < y + h; py += 5) {
          ctx.beginPath();
          ctx.moveTo(x, py);
          ctx.lineTo(x + w, py);
          ctx.stroke();
        }
        for (let row = 0; row < 4; row++) {
          const rowY = y + 1 + row * 5;
          const off = row % 2 === 0 ? 0 : 30;
          ctx.strokeStyle = 'rgba(40, 25, 15, 0.2)';
          for (let px = x + off + 20; px < x + w; px += 60) {
            ctx.beginPath();
            ctx.moveTo(px, rowY);
            ctx.lineTo(px, rowY + 4);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(140, 35, 35, 0.18)';
        ctx.fillRect(x + w * 0.25, y + 2, w * 0.5, h - 3);
        ctx.fillStyle = '#6A5040';
        ctx.fillRect(x, y, w, 2);
      } else if (w <= 55 && h >= 25) {
        // HVAC block -- vent slats + exhaust pipe
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
        ctx.fillStyle = '#5A5A64';
        ctx.fillRect(x + w / 2 - 3, y - 8, 6, 8);
        ctx.fillRect(x + w / 2 - 5, y - 10, 10, 3);
      } else {
        ctx.fillStyle = '#4A4050';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#6A5A6A';
        ctx.fillRect(x, y, w, 4);
      }
    },
  },

  // ---- Ambient systems ----
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
    baseY: 680,
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

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, arena) => {
    ctx.save();

    // Sunset glow
    const sunGrd = ctx.createRadialGradient(250, 170, 10, 250, 170, 200);
    sunGrd.addColorStop(0, 'rgba(255, 200, 80, 0.25)');
    sunGrd.addColorStop(1, 'rgba(255, 150, 50, 0)');
    ctx.fillStyle = sunGrd;
    ctx.fillRect(50, 0, 400, 400);

    // === Background buildings -- distant city skyline ===
    ctx.globalAlpha = 0.35;
    const bgBuildings = [
      // Left gap (0-80)
      { x: -10, w: 45, top: 380, color: '#14101C' },
      { x: 30, w: 55, top: 340, color: '#18121E' },
      // Gap 1 (350-510)
      { x: 355, w: 45, top: 360, color: '#14101C' },
      { x: 390, w: 60, top: 310, color: '#100C18' },
      { x: 440, w: 50, top: 380, color: '#18121E' },
      // Gap 2 (810-970)
      { x: 820, w: 50, top: 330, color: '#14101C' },
      { x: 860, w: 65, top: 290, color: '#100C18' },
      { x: 920, w: 45, top: 350, color: '#18121E' },
      // Right gap (1200-1280)
      { x: 1210, w: 50, top: 320, color: '#14101C' },
      { x: 1250, w: 40, top: 370, color: '#18121E' },
    ];
    for (const bg of bgBuildings) {
      ctx.fillStyle = bg.color;
      ctx.fillRect(bg.x, bg.top, bg.w, 720 - bg.top);
      // Tiny windows
      ctx.fillStyle = '#FFCC55';
      ctx.globalAlpha = 0.12;
      for (let wy = bg.top + 15; wy < 700; wy += 18) {
        for (let wx = bg.x + 5; wx < bg.x + bg.w - 5; wx += 12) {
          if (Math.sin(wx * 1.3 + wy * 0.7) > 0) {
            ctx.fillRect(wx, wy, 4, 5);
          }
        }
      }
      ctx.globalAlpha = 0.35;
      // Varied rooftops -- some with antenna, some with water tank
      ctx.fillStyle = bg.color;
      if (Math.sin(bg.x * 0.1) > 0.3) {
        // Antenna
        ctx.fillRect(bg.x + bg.w / 2 - 1, bg.top - 20, 2, 20);
        ctx.fillStyle = '#FF3333';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(bg.x + bg.w / 2, bg.top - 20, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35;
      } else if (Math.sin(bg.x * 0.2) > 0) {
        // Water tank silhouette
        ctx.fillRect(bg.x + bg.w * 0.3, bg.top - 12, bg.w * 0.4, 12);
      }
    }

    // === Main building facades ===
    const buildings = [
      { x: 80, w: 270, roofY: 480, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
      { x: 510, w: 300, roofY: 370, color: '#222030', dark: '#1A1828', accent: '#282535' },
      { x: 970, w: 230, roofY: 300, color: '#252030', dark: '#1C1828', accent: '#2A2538' },
    ];

    for (const b of buildings) {
      ctx.globalAlpha = 0.95;
      // Main wall -- facade starts at rooftop level
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.roofY, b.w, 720 - b.roofY);
      // Thick side edges
      ctx.fillStyle = b.dark;
      ctx.fillRect(b.x, b.roofY, 10, 720 - b.roofY);
      ctx.fillRect(b.x + b.w - 10, b.roofY, 10, 720 - b.roofY);
      // Parapet rim at rooftop edge -- sits exactly at building top
      ctx.fillStyle = b.accent;
      ctx.fillRect(b.x, b.roofY - 3, b.w, 5);
      ctx.fillStyle = b.dark;
      ctx.fillRect(b.x, b.roofY - 4, b.w, 2);

      // Concrete floor bands
      ctx.strokeStyle = 'rgba(15, 12, 20, 0.3)';
      ctx.lineWidth = 2;
      for (let fy = b.roofY + 45; fy < 720; fy += 45) {
        ctx.beginPath();
        ctx.moveTo(b.x, fy);
        ctx.lineTo(b.x + b.w, fy);
        ctx.stroke();
      }

      // Dense windows
      ctx.globalAlpha = 1;
      for (let wy = b.roofY + 15; wy < 720; wy += 26) {
        // Skip window rows in the hallway opening zone (upper block bottom to hallway floor)
        let inHallwayZone = false;
        for (const plat of arena.platforms) {
          if (plat.width >= 200 && plat.height >= 20 && plat.height < 30 &&
              plat.x >= b.x - 5 && plat.x + plat.width <= b.x + b.w + 5) {
            // The hallway opening spans from ~90px above the floor to the floor
            if (wy >= plat.y - 95 && wy <= plat.y + 5) {
              inHallwayZone = true;
              break;
            }
          }
        }
        if (inHallwayZone || (wy >= b.roofY - 8 && wy <= b.roofY + 8)) continue;

        for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 24) {
          ctx.fillStyle = '#1A1520';
          ctx.fillRect(wx - 1, wy - 1, 13, 17);
          const lit = Math.sin(wx * 0.7 + wy * 0.3) > -0.2;
          ctx.fillStyle = lit ? 'rgba(255, 200, 100, 0.18)' : 'rgba(80, 100, 140, 0.08)';
          ctx.fillRect(wx, wy, 11, 15);
          ctx.strokeStyle = 'rgba(25, 20, 30, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(wx + 5.5, wy);
          ctx.lineTo(wx + 5.5, wy + 15);
          ctx.stroke();
        }
      }

      // Hallway interiors -- rich indoor environment (90px tall opening)
      for (const plat of arena.platforms) {
        if (plat.width >= 200 && plat.height >= 20 && plat.height < 30 &&
            plat.x >= b.x - 5 && plat.x + plat.width <= b.x + b.w + 5) {
          const openH = 88;
          const openY = plat.y - openH;
          const floorY = plat.y;
          const ceilY = openY;
          const inset = 8;

          // === Wallpaper background ===
          ctx.fillStyle = '#3A2520';
          ctx.fillRect(b.x + inset, ceilY, b.w - inset * 2, openH);

          // Wainscoting -- darker lower wall panel
          const wainH = openH * 0.4;
          ctx.fillStyle = '#2E1C18';
          ctx.fillRect(b.x + inset, floorY - wainH, b.w - inset * 2, wainH);
          // Wainscoting trim rail
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, floorY - wainH - 2, b.w - inset * 2, 3);
          // Wainscoting panels
          ctx.strokeStyle = 'rgba(60, 35, 25, 0.25)';
          ctx.lineWidth = 1;
          for (let px = b.x + inset + 20; px < b.x + b.w - inset; px += 35) {
            ctx.strokeRect(px, floorY - wainH + 4, 28, wainH - 8);
          }

          // Upper wallpaper pattern stripes
          ctx.strokeStyle = 'rgba(80, 45, 30, 0.12)';
          for (let sy = ceilY + 4; sy < floorY - wainH; sy += 8) {
            ctx.beginPath();
            ctx.moveTo(b.x + inset + 2, sy);
            ctx.lineTo(b.x + b.w - inset - 2, sy);
            ctx.stroke();
          }

          // Baseboard
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, floorY - 4, b.w - inset * 2, 4);
          // Crown molding at ceiling
          ctx.fillStyle = '#4A3530';
          ctx.fillRect(b.x + inset, ceilY - 1, b.w - inset * 2, 3);

          // Ceiling light fixture
          ctx.fillStyle = 'rgba(200, 160, 80, 0.3)';
          ctx.fillRect(b.x + b.w * 0.45, ceilY + 1, 24, 4);
          ctx.fillStyle = 'rgba(255, 220, 140, 0.15)';
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.45, ceilY + 5);
          ctx.lineTo(b.x + b.w * 0.45 + 12, ceilY + 25);
          ctx.lineTo(b.x + b.w * 0.45 + 24, ceilY + 5);
          ctx.closePath();
          ctx.fill();

          // Warm light glow from lamp
          const glowGrd = ctx.createRadialGradient(
            b.x + b.w * 0.32, floorY - 30, 5,
            b.x + b.w * 0.32, floorY - 30, 65
          );
          glowGrd.addColorStop(0, 'rgba(255, 180, 80, 0.12)');
          glowGrd.addColorStop(1, 'rgba(255, 180, 80, 0)');
          ctx.fillStyle = glowGrd;
          ctx.fillRect(b.x + inset, ceilY, b.w - inset * 2, openH);

          // === Furniture ===
          // Tall bookshelf (left side)
          ctx.fillStyle = 'rgba(50, 30, 20, 0.7)';
          ctx.fillRect(b.x + 18, ceilY + 8, 22, openH - 14);
          ctx.fillStyle = 'rgba(60, 40, 25, 0.4)';
          for (let sy = ceilY + 14; sy < floorY - 6; sy += 10) {
            ctx.fillRect(b.x + 20, sy, 18, 2);
          }
          // Books on shelves (colored spines)
          const bookColors = ['#7A3030', '#304070', '#307040', '#705030'];
          for (let sy = ceilY + 16; sy < floorY - 10; sy += 10) {
            for (let bx = 0; bx < 3; bx++) {
              ctx.fillStyle = bookColors[(sy + bx) % bookColors.length];
              ctx.globalAlpha = 0.3;
              ctx.fillRect(b.x + 21 + bx * 5, sy, 4, 8);
            }
          }
          ctx.globalAlpha = 1;

          // Table with lamp
          ctx.fillStyle = 'rgba(50, 30, 20, 0.6)';
          const tblX = b.x + b.w * 0.3;
          ctx.fillRect(tblX, floorY - 18, 34, 16);
          ctx.fillRect(tblX + 3, floorY - 2, 3, 2);
          ctx.fillRect(tblX + 28, floorY - 2, 3, 2);
          // Lamp on table
          ctx.fillStyle = 'rgba(255, 200, 100, 0.22)';
          ctx.beginPath();
          ctx.arc(tblX + 17, floorY - 25, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(200, 160, 80, 0.3)';
          ctx.beginPath();
          ctx.moveTo(tblX + 10, floorY - 25);
          ctx.lineTo(tblX + 14, floorY - 40);
          ctx.lineTo(tblX + 20, floorY - 40);
          ctx.lineTo(tblX + 24, floorY - 25);
          ctx.closePath();
          ctx.fill();

          // Armchair (right side)
          ctx.fillStyle = 'rgba(70, 35, 25, 0.55)';
          const chX = b.x + b.w * 0.62;
          ctx.fillRect(chX, floorY - 22, 20, 20);
          ctx.fillRect(chX - 3, floorY - 30, 4, 28);
          ctx.fillRect(chX + 19, floorY - 28, 4, 26);
          // Seat cushion
          ctx.fillStyle = 'rgba(120, 50, 35, 0.3)';
          ctx.fillRect(chX + 2, floorY - 18, 16, 8);

          // Potted plant
          ctx.fillStyle = 'rgba(50, 30, 20, 0.5)';
          ctx.fillRect(b.x + b.w * 0.82, floorY - 10, 12, 10);
          ctx.fillStyle = 'rgba(40, 100, 40, 0.4)';
          ctx.beginPath();
          ctx.arc(b.x + b.w * 0.82 + 6, floorY - 16, 10, 0, Math.PI * 2);
          ctx.fill();

          // Picture frames on wall
          ctx.strokeStyle = 'rgba(80, 55, 35, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x + b.w * 0.48, ceilY + 10, 16, 12);
          ctx.strokeRect(b.x + b.w * 0.56, ceilY + 8, 12, 16);
          // Picture contents
          ctx.fillStyle = 'rgba(100, 80, 60, 0.12)';
          ctx.fillRect(b.x + b.w * 0.48 + 2, ceilY + 12, 12, 8);
          ctx.fillRect(b.x + b.w * 0.56 + 2, ceilY + 10, 8, 12);

          // Coat rack near door
          ctx.fillStyle = 'rgba(50, 30, 20, 0.45)';
          ctx.fillRect(b.x + b.w - 28, floorY - 2, 3, -40);
          ctx.fillRect(b.x + b.w - 34, floorY - 40, 15, 2);
          // Hanging coat
          ctx.fillStyle = 'rgba(60, 40, 70, 0.3)';
          ctx.fillRect(b.x + b.w - 33, floorY - 38, 6, 18);
        }
      }

      // Ground-level band
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#1A1525';
      ctx.fillRect(b.x, 705, b.w, 15);
    }

    // === Wall brackets for ACs and balconies ===
    ctx.globalAlpha = 0.8;
    for (const plat of arena.platforms) {
      const isAC = plat.width <= 55 && plat.height <= 20 && plat.height >= 10;
      const isBal = plat.width >= 60 && plat.width <= 90 && plat.height <= 18;
      if (!isAC && !isBal) continue;

      for (const b of buildings) {
        const pr = plat.x + plat.width;
        const br = b.x + b.w;
        let wallX = -1;
        // Attached to building's left wall (platform is left of building)
        if (pr >= b.x - 5 && pr <= b.x + 20 && plat.x < b.x) wallX = b.x;
        // Attached to building's right wall (platform is right of building)
        if (plat.x >= br - 20 && plat.x <= br + 5 && pr > br) wallX = br;
        if (wallX < 0) continue;

        const beamY = plat.y + plat.height - 2;
        const px = wallX < plat.x ? plat.x : pr;
        const startX = Math.min(px, wallX);
        const beamW = Math.abs(px - wallX);
        // Horizontal bracket beam
        ctx.fillStyle = '#5A5A68';
        ctx.fillRect(startX, beamY, beamW + 2, 4);
        // Wall anchor
        ctx.fillRect(wallX - 2, beamY - 8, 5, 12);
        // Diagonal brace
        ctx.strokeStyle = '#4A4A58';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wallX, beamY - 6);
        ctx.lineTo(px, beamY + 1);
        ctx.stroke();
      }
    }

    // === Clotheslines between buildings (attached to building walls) ===
    ctx.globalAlpha = 1;
    const drawClothesline = (x1: number, y1: number, x2: number, y2: number) => {
      // Wall attachment hooks
      ctx.fillStyle = '#5A5A68';
      ctx.fillRect(x1 - 2, y1 - 3, 5, 6);
      ctx.fillRect(x2 - 2, y2 - 3, 5, 6);
      // Rope with sag
      ctx.strokeStyle = '#6A6A7A';
      ctx.lineWidth = 1;
      const midY = Math.max(y1, y2) + 15;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, midY, x2, y2);
      ctx.stroke();
      // Hanging clothes -- windblown with varied shapes
      const colors = ['#CC4444', '#4444CC', '#44CC44', '#CCCC44', '#CC44CC', '#CC8844'];
      const n = Math.floor((x2 - x1) / 28);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const cx = x1 + (x2 - x1) * t;
        const sagY = Math.min(y1, y2) + (midY - Math.min(y1, y2)) * 4 * t * (1 - t);
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 0.65;
        // Wind angle -- items blow slightly right
        ctx.save();
        ctx.translate(cx, sagY + 2);
        ctx.rotate(0.12 + Math.sin(i * 1.7) * 0.08);
        if (i % 4 === 0) {
          // Shirt -- T shape
          ctx.fillRect(-4, 0, 8, 11);
          ctx.fillRect(-7, 0, 3, 5);
          ctx.fillRect(4, 0, 3, 5);
        } else if (i % 4 === 1) {
          // Pants
          ctx.fillRect(-3, 0, 6, 5);
          ctx.fillRect(-3, 5, 2, 7);
          ctx.fillRect(1, 5, 2, 7);
        } else if (i % 4 === 2) {
          // Towel / sheet -- flapping
          ctx.fillRect(-3, 0, 6, 14);
          ctx.fillStyle = colors[(i + 2) % colors.length];
          ctx.globalAlpha = 0.25;
          ctx.fillRect(-3, 4, 6, 2);
        } else {
          // Sock pair
          ctx.fillRect(-4, 0, 3, 8);
          ctx.fillRect(1, 0, 3, 8);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    };
    // Gap 1: B1 right wall (x=350) to B2 left wall (x=510)
    drawClothesline(350, 480 + 12, 510, 370 + 12);
    // Gap 2: B2 right wall (x=810) to B3 left wall (x=970)
    drawClothesline(810, 370 + 12, 970, 300 + 12);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    // Antennas on B1 right edge
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
    // B1 roof (P0, y=480)
    drawAntenna(330, arena.platforms[0].y, 45);
    drawAntenna(345, arena.platforms[0].y, 58);

    // Vent pipes
    ctx.fillStyle = '#5A5060';
    ctx.fillRect(180, arena.platforms[0].y - 14, 12, 14);
    ctx.fillRect(180, arena.platforms[0].y - 17, 16, 4);
    // B2 upper (P6 = index 6, y=370)
    ctx.fillRect(620, arena.platforms[6].y - 12, 10, 12);
    ctx.fillRect(620, arena.platforms[6].y - 15, 14, 4);
    // B3 upper (P16 = index 16, y=300)
    ctx.fillRect(1140, arena.platforms[16].y - 12, 10, 12);
  },

  drawForegroundNature: (ctx, arena) => {
    ctx.save();
    // Water tank on B1
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#2A2030';
    const wtY = arena.platforms[0].y;
    ctx.fillRect(170, wtY - 8, 4, 28);
    ctx.fillRect(195, wtY - 8, 4, 28);
    ctx.beginPath();
    ctx.moveTo(164, wtY - 8);
    ctx.lineTo(167, wtY - 38);
    ctx.lineTo(202, wtY - 38);
    ctx.lineTo(205, wtY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(173, wtY - 38);
    ctx.lineTo(184, wtY - 48);
    ctx.lineTo(196, wtY - 38);
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

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;
    ctx.fillStyle = '#5A5050';
    ctx.fillRect(x + width * 0.05, by - height * 0.12, width * 0.9, height * 0.12);
    const nails = [
      { sx: 0.15, sh: 0.6, tilt: -0.08 }, { sx: 0.3, sh: 0.85, tilt: 0.03 },
      { sx: 0.5, sh: 1.0, tilt: 0 }, { sx: 0.7, sh: 0.8, tilt: -0.05 },
      { sx: 0.85, sh: 0.55, tilt: 0.06 },
    ];
    const maxNh = height * 1.0;
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
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
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
  }),

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
  },
  musicFile: 'rooftops.mp3',
};
