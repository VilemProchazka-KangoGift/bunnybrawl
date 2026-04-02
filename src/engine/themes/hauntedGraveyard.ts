import type { ThemeConfig } from './types';
import { getFloatingPlatforms } from './utils';
import { createThornRenderer } from './drawPrimitives';

export const HAUNTED_GRAVEYARD_THEME: ThemeConfig = {
  id: 'haunted_graveyard',
  nameKey: 'arena_haunted_graveyard',
  previewGradient: 'linear-gradient(to bottom, #0A0015 0%, #1A0A30 40%, #2A1540 100%)',
  previewIcon: '👻',

  sky: {
    gradient: [
      { offset: 0, color: '#0A0015' },
      { offset: 0.3, color: '#120820' },
      { offset: 0.6, color: '#1A0A30' },
      { offset: 1, color: '#2A1540' },
    ],
  },

  hills: [
    { x: -20, baseY: 620, width: 380, height: 90, color: '#1A1528' },
    { x: 300, baseY: 630, width: 420, height: 70, color: '#151020' },
    { x: 670, baseY: 615, width: 400, height: 100, color: '#1A1528' },
    { x: 1000, baseY: 625, width: 380, height: 80, color: '#151020' },
  ],

  ground: {
    surfaceColor: '#3A3530',
    surfaceThickness: 4,
    grassBlades: {
      color: '#2A3520',
      spacing: 25,
      heightRange: [5, 9],
    },
  },

  platform: {
    floatingBodyColor: '#3A3040',
    floatingTopColor: '#5A4A60',
    floatingAccentColor: undefined,
    groundBodyColor: '#2A2530',
    groundTopColor: '#3A3530',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Muddy graveyard ground
        ctx.fillStyle = '#2A2530';
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = '#3A3530';
        ctx.fillRect(x, y, w, 5);
        // Dirt patches
        ctx.fillStyle = '#2A2018';
        for (let dx = x + 30; dx < x + w; dx += 60 + Math.random() * 50) {
          ctx.beginPath();
          ctx.ellipse(dx, y + 15, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Worn stone platform
        ctx.fillStyle = '#3A3040';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#5A4A60';
        ctx.fillRect(x, y, w, 4);
        // Cracks
        ctx.strokeStyle = 'rgba(20, 15, 25, 0.4)';
        ctx.lineWidth = 1;
        if (w > 100) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.4, y + 2);
          ctx.lineTo(x + w * 0.45, y + h);
          ctx.stroke();
        }
        // Moss
        ctx.fillStyle = 'rgba(40, 60, 30, 0.3)';
        ctx.fillRect(x, y + h - 3, w * 0.3, 3);
      }
    },
  },

  clouds: {
    count: 4,
    color: 'rgba(40, 30, 60, 0.4)',
    minSize: 60,
    maxSize: 100,
    minSpeed: 2,
    maxSpeed: 5,
    yRange: [30, 90],
  },

  weather: {
    particleCount: 15,
    types: [
      { type: 'ash', weight: 0.6, sizeRange: [2, 4], vxRange: [-8, 8], vyRange: [5, 15], rotSpeedRange: [0.5, 2], color: 'rgba(100, 80, 120, 0.4)' },
      { type: 'leaf', weight: 0.4, sizeRange: [3, 5], vxRange: [-10, 10], vyRange: [10, 25], rotSpeedRange: [1, 3] },
    ],
  },

  wildlife: {
    count: 4,
    types: [
      { type: 'bat', weight: 1, colors: ['#1A1A1A', '#2A2A2A', '#151515', '#252025'], speedRange: [35, 65], yRange: [0.05, 0.3] },
    ],
  },

  fog: {
    count: 35,
    baseY: 650,
    yVariance: 40,
    speedRange: [2, 6],
    alphaRange: [0.15, 0.4],
    color: '#4A3A5A',
    sizeX: 70,
    sizeY: 15,
  },

  ambientParticles: {
    count: 8,
    sizeRange: [1, 2],
    vxRange: [-2, 2],
    vyRange: [-3, -8],
    alphaRange: [0.15, 0.35],
    colors: ['#8A7AAA', '#6A5A8A'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: true,
    showShootingStars: false,
  },

  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // Stars (no moon — day/night disabled)
    ctx.fillStyle = '#CCBBDD';
    const stars = [
      [80, 25, 1.2], [200, 55, 0.8], [350, 20, 1.5], [480, 65, 1],
      [600, 30, 0.8], [750, 50, 1.3], [1050, 40, 1], [1150, 25, 1.4],
      [130, 70, 0.7], [420, 85, 1.1], [680, 45, 0.9], [1100, 60, 1.2],
      [250, 40, 0.8], [550, 75, 1], [1200, 50, 0.9],
    ];
    for (const [sx, sy, sr] of stars) {
      ctx.globalAlpha = 0.3 + (sr as number) * 0.15;
      ctx.beginPath();
      ctx.arc(sx as number, sy as number, sr as number, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dead tree silhouettes in background
    ctx.fillStyle = '#0A0515';
    ctx.globalAlpha = 0.35;
    const drawDeadSilhouette = (bx: number, bh: number) => {
      ctx.fillRect(bx - 4, 660 - bh, 8, bh);
      // Branches
      ctx.beginPath();
      ctx.moveTo(bx, 660 - bh * 0.7);
      ctx.lineTo(bx - 25, 660 - bh * 0.9);
      ctx.lineTo(bx - 30, 660 - bh * 1.0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0A0515';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, 660 - bh * 0.5);
      ctx.lineTo(bx + 20, 660 - bh * 0.7);
      ctx.lineTo(bx + 28, 660 - bh * 0.8);
      ctx.stroke();
    };
    drawDeadSilhouette(150, 120);
    drawDeadSilhouette(500, 100);
    drawDeadSilhouette(1100, 130);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;

    // Mausoleum wall details (platform is a solid 320x240 block)
    ctx.fillStyle = '#3A3040';
    ctx.fillRect(470, 444, 40, y - 444);   // Left wall accent
    ctx.fillRect(790, 444, 40, y - 444);   // Right wall accent
    ctx.fillStyle = '#2A2530';
    ctx.fillRect(475, 444, 30, y - 444);   // Left wall inner shade
    ctx.fillRect(795, 444, 30, y - 444);   // Right wall inner shade
    // Wall cracks
    ctx.strokeStyle = 'rgba(20, 15, 25, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(490, 480); ctx.lineTo(485, 550); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(810, 500); ctx.lineTo(815, 580); ctx.stroke();

    // Tombstones
    const drawTombstone = (tx: number, ty: number, style: number) => {
      ctx.fillStyle = '#4A4A5A';
      if (style === 0) {
        // Classic rounded top
        ctx.beginPath();
        ctx.moveTo(tx - 12, ty);
        ctx.lineTo(tx - 12, ty - 30);
        ctx.arc(tx, ty - 30, 12, Math.PI, 0);
        ctx.lineTo(tx + 12, ty);
        ctx.closePath();
        ctx.fill();
      } else if (style === 1) {
        // Cross tombstone
        ctx.fillRect(tx - 3, ty - 45, 6, 45);
        ctx.fillRect(tx - 12, ty - 35, 24, 6);
      } else {
        // Simple rectangle
        ctx.fillRect(tx - 10, ty - 28, 20, 28);
        ctx.fillStyle = '#5A5A6A';
        ctx.fillRect(tx - 10, ty - 28, 20, 3);
      }
      // RIP text suggestion
      ctx.fillStyle = 'rgba(80, 80, 100, 0.5)';
      ctx.fillRect(tx - 6, ty - 18, 12, 2);
      ctx.fillRect(tx - 5, ty - 14, 10, 1);
    };

    drawTombstone(100, y, 0);
    drawTombstone(250, y, 1);
    drawTombstone(430, y, 2);
    drawTombstone(600, y, 0);
    drawTombstone(780, y, 1);
    drawTombstone(950, y, 2);
    drawTombstone(1120, y, 0);

    // Jack-o-lanterns
    const drawJackOLantern = (jx: number, jy: number, size: number) => {
      // Pumpkin body
      ctx.fillStyle = '#CC6600';
      ctx.beginPath();
      ctx.ellipse(jx, jy - size * 0.5, size * 0.5, size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ribs
      ctx.strokeStyle = '#AA5500';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(jx, jy - size);
      ctx.lineTo(jx, jy);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(jx, jy - size * 0.5, size * 0.3, size * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Face — glowing eyes
      ctx.fillStyle = '#FFCC00';
      // Left eye
      ctx.beginPath();
      ctx.moveTo(jx - size * 0.2, jy - size * 0.6);
      ctx.lineTo(jx - size * 0.05, jy - size * 0.6);
      ctx.lineTo(jx - size * 0.12, jy - size * 0.75);
      ctx.closePath();
      ctx.fill();
      // Right eye
      ctx.beginPath();
      ctx.moveTo(jx + size * 0.2, jy - size * 0.6);
      ctx.lineTo(jx + size * 0.05, jy - size * 0.6);
      ctx.lineTo(jx + size * 0.12, jy - size * 0.75);
      ctx.closePath();
      ctx.fill();
      // Mouth
      ctx.beginPath();
      ctx.moveTo(jx - size * 0.2, jy - size * 0.35);
      ctx.lineTo(jx - size * 0.1, jy - size * 0.25);
      ctx.lineTo(jx, jy - size * 0.35);
      ctx.lineTo(jx + size * 0.1, jy - size * 0.25);
      ctx.lineTo(jx + size * 0.2, jy - size * 0.35);
      ctx.fill();
      // Stem
      ctx.fillStyle = '#4A6A2A';
      ctx.fillRect(jx - 2, jy - size * 1.05, 4, size * 0.1);
      // Glow
      const glow = ctx.createRadialGradient(jx, jy - size * 0.5, 2, jx, jy - size * 0.5, size);
      glow.addColorStop(0, 'rgba(255, 180, 0, 0.1)');
      glow.addColorStop(1, 'rgba(255, 120, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(jx - size, jy - size * 1.5, size * 2, size * 2);
    };

    drawJackOLantern(170, y, 20);
    drawJackOLantern(520, y, 18);
    drawJackOLantern(850, y, 22);
    drawJackOLantern(1200, y, 16);

    // Dead trees (foreground detail)
    const drawDeadTree = (dx: number, dy: number, size: number) => {
      ctx.fillStyle = '#2A2020';
      const tw = size * 0.12;
      ctx.fillRect(dx - tw / 2, dy - size, tw, size);
      ctx.strokeStyle = '#2A2020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx, dy - size * 0.6);
      ctx.lineTo(dx - size * 0.3, dy - size * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dx, dy - size * 0.4);
      ctx.lineTo(dx + size * 0.25, dy - size * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dx, dy - size);
      ctx.lineTo(dx + size * 0.1, dy - size * 1.1);
      ctx.stroke();
    };

    drawDeadTree(50, y, 70);
    drawDeadTree(350, y, 55);
    drawDeadTree(700, y, 65);
    drawDeadTree(1050, y, 60);

    // Platform decorations
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawTombstone(mid, plat.y, i % 3);
      } else if (i % 3 === 1) {
        drawJackOLantern(mid, plat.y, 14);
      } else {
        drawDeadTree(mid, plat.y, 30);
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Thick ground fog
    ctx.save();
    ctx.globalAlpha = 0.2;
    const fogGrd = ctx.createLinearGradient(0, gy - 40, 0, gy + 30);
    fogGrd.addColorStop(0, 'rgba(60, 40, 80, 0)');
    fogGrd.addColorStop(0.5, 'rgba(60, 40, 80, 0.4)');
    fogGrd.addColorStop(1, 'rgba(40, 25, 60, 0.6)');
    ctx.fillStyle = fogGrd;
    ctx.fillRect(0, gy - 40, 1280, 70);
    ctx.restore();

    // Iron fence sections
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#3A3A4A';
    ctx.lineWidth = 2;
    const drawFenceSection = (fx: number, fw: number) => {
      // Top rail
      ctx.beginPath();
      ctx.moveTo(fx, gy - 30);
      ctx.lineTo(fx + fw, gy - 30);
      ctx.stroke();
      // Bottom rail
      ctx.beginPath();
      ctx.moveTo(fx, gy - 8);
      ctx.lineTo(fx + fw, gy - 8);
      ctx.stroke();
      // Pickets
      for (let px = fx + 5; px < fx + fw; px += 12) {
        ctx.beginPath();
        ctx.moveTo(px, gy - 35);
        ctx.lineTo(px, gy);
        ctx.stroke();
        // Spear tip
        ctx.beginPath();
        ctx.moveTo(px - 2, gy - 35);
        ctx.lineTo(px, gy - 40);
        ctx.lineTo(px + 2, gy - 35);
        ctx.closePath();
        ctx.fillStyle = '#3A3A4A';
        ctx.fill();
      }
    };
    drawFenceSection(30, 100);
    drawFenceSection(1150, 100);
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.rotation);
    if (w.type === 'ash') {
      // Ghost-like mist particle
      ctx.fillStyle = w.color || 'rgba(100, 80, 120, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w.size, w.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dead leaf
      ctx.fillStyle = 'rgba(80, 60, 40, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w.size, w.size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, fadeAlpha) => {
    const cx = x + width / 2;
    const baseY = y + height;

    // Dirt mound at base
    ctx.fillStyle = '#3A3020';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, width * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arm coming out of ground
    const armH = height + 8;
    ctx.fillStyle = '#6A8A6A';
    ctx.fillRect(cx - 4, baseY - armH * 0.6, 8, armH * 0.6);
    // Wrist/forearm taper
    ctx.fillRect(cx - 3, baseY - armH * 0.7, 6, armH * 0.15);

    // Hand — palm
    ctx.fillStyle = '#5A7A5A';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - armH * 0.75, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fingers (3-4 gnarled fingers reaching up)
    ctx.strokeStyle = '#5A7A5A';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // Index finger
    ctx.beginPath();
    ctx.moveTo(cx - 5, baseY - armH * 0.78);
    ctx.quadraticCurveTo(cx - 8, baseY - armH * 0.9, cx - 6, baseY - armH);
    ctx.stroke();
    // Middle finger
    ctx.beginPath();
    ctx.moveTo(cx - 1, baseY - armH * 0.8);
    ctx.quadraticCurveTo(cx, baseY - armH * 0.95, cx + 1, baseY - armH * 1.05);
    ctx.stroke();
    // Ring finger
    ctx.beginPath();
    ctx.moveTo(cx + 4, baseY - armH * 0.78);
    ctx.quadraticCurveTo(cx + 7, baseY - armH * 0.88, cx + 5, baseY - armH * 0.95);
    ctx.stroke();
    // Thumb (curled)
    ctx.beginPath();
    ctx.moveTo(cx - 7, baseY - armH * 0.7);
    ctx.quadraticCurveTo(cx - 12, baseY - armH * 0.75, cx - 10, baseY - armH * 0.82);
    ctx.stroke();

    // Fingernails (dark tips)
    ctx.fillStyle = '#3A4A3A';
    ctx.beginPath();
    ctx.arc(cx - 6, baseY - armH, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 1, baseY - armH * 1.05, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5, baseY - armH * 0.95, 2, 0, Math.PI * 2);
    ctx.fill();

    // Green glow
    ctx.globalAlpha = fadeAlpha * 0.15;
    const glow = ctx.createRadialGradient(cx, baseY - armH * 0.5, 2, cx, baseY - armH * 0.5, 25);
    glow.addColorStop(0, '#44AA44');
    glow.addColorStop(1, 'rgba(40, 100, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 25, baseY - armH - 10, 50, armH + 20);
  }),

  ghostConfig: {
    count: 3,
    speed: 40,
    size: 30,
    color: 'rgba(180, 200, 220, 0.6)',
    glowColor: '#6688BB',
  },
};
