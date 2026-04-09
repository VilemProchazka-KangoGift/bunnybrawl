import type { ArenaPack } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import { getFloatingPlatforms } from '../../themes/utils';

let scanLinePattern: CanvasPattern | null = null;

// === Animated space objects visible through the hangar window ===

const WIN_X = 280, WIN_Y = 25, WIN_W = 720, WIN_H = 635;

interface SpaceObject {
  type: 'asteroid' | 'satellite';
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  delay: number;
}

let spaceObjects: SpaceObject[] = [];
let lastAnimTime = -1;

function createSpaceObject(delay: number): SpaceObject {
  const isAsteroid = Math.random() < 0.8;
  const horizontal = Math.random() > 0.25;
  const fromLeft = Math.random() > 0.5;
  const fromTop = Math.random() > 0.5;
  let x: number, y: number, vx: number, vy: number;

  if (horizontal) {
    x = fromLeft ? WIN_X - 40 : WIN_X + WIN_W + 40;
    y = WIN_Y + 60 + Math.random() * (WIN_H - 120);
    vx = fromLeft ? 10 + Math.random() * 18 : -(10 + Math.random() * 18);
    vy = (Math.random() - 0.5) * 6;
  } else {
    x = WIN_X + 60 + Math.random() * (WIN_W - 120);
    y = fromTop ? WIN_Y - 40 : WIN_Y + WIN_H + 40;
    vx = (Math.random() - 0.5) * 8;
    vy = fromTop ? 8 + Math.random() * 14 : -(8 + Math.random() * 14);
  }

  return {
    type: isAsteroid ? 'asteroid' : 'satellite',
    x, y, vx, vy,
    size: isAsteroid ? 6 + Math.random() * 8 : 8 + Math.random() * 6,
    rotation: isAsteroid ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * 0.4,
    rotSpeed: isAsteroid ? (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 0.08,
    delay,
  };
}

function resetSpaceAnimations() {
  spaceObjects = [];
  for (let i = 0; i < 3; i++) {
    spaceObjects.push(createSpaceObject(4 + i * 10));
  }
  lastAnimTime = -1;
}

function drawAsteroid(ctx: CanvasRenderingContext2D, obj: SpaceObject) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(obj.rotation);
  const s = obj.size;

  // Rocky body
  ctx.fillStyle = '#6A6A7A';
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.3);
  ctx.lineTo(-s * 0.3, -s * 0.8);
  ctx.lineTo(s * 0.4, -s * 0.7);
  ctx.lineTo(s * 0.8, -s * 0.1);
  ctx.lineTo(s * 0.5, s * 0.7);
  ctx.lineTo(-s * 0.2, s * 0.65);
  ctx.lineTo(-s * 0.75, s * 0.2);
  ctx.closePath();
  ctx.fill();

  // Lighter highlight
  ctx.fillStyle = '#8A8A9A';
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.6);
  ctx.lineTo(s * 0.3, -s * 0.5);
  ctx.lineTo(s * 0.5, -s * 0.1);
  ctx.lineTo(-s * 0.1, s * 0.1);
  ctx.closePath();
  ctx.fill();

  // Crater
  ctx.fillStyle = '#555566';
  ctx.beginPath();
  ctx.arc(s * 0.1, s * 0.1, s * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSatellite(ctx: CanvasRenderingContext2D, obj: SpaceObject) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(obj.rotation);
  const s = obj.size;

  // Solar panels -- bright blue to stand out against dark space
  ctx.fillStyle = '#3355CC';
  ctx.fillRect(-s * 1.4, -s * 0.25, s * 1.0, s * 0.5);
  ctx.fillRect(s * 0.4, -s * 0.25, s * 1.0, s * 0.5);
  // Panel grid lines
  ctx.strokeStyle = 'rgba(100, 160, 255, 0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, -s * 0.25); ctx.lineTo(-s * 0.9, s * 0.25);
  ctx.moveTo(s * 0.9, -s * 0.25); ctx.lineTo(s * 0.9, s * 0.25);
  ctx.moveTo(-s * 1.4, 0); ctx.lineTo(-s * 0.4, 0);
  ctx.moveTo(s * 0.4, 0); ctx.lineTo(s * 1.4, 0);
  ctx.stroke();
  // Panel highlight edge
  ctx.strokeStyle = 'rgba(150, 200, 255, 0.4)';
  ctx.strokeRect(-s * 1.4, -s * 0.25, s * 1.0, s * 0.5);
  ctx.strokeRect(s * 0.4, -s * 0.25, s * 1.0, s * 0.5);

  // Body -- bright metallic
  ctx.fillStyle = '#AABBCC';
  ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);
  ctx.strokeStyle = '#CCDDEE';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);

  // Dish antenna
  ctx.fillStyle = '#DDEEFF';
  ctx.beginPath();
  ctx.arc(0, -s * 0.35, s * 0.18, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#BBCCDD';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.35); ctx.lineTo(0, -s * 0.55);
  ctx.stroke();

  // Blinking light on body
  ctx.fillStyle = '#FF4444';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const spaceStation: ArenaPack = {
  // ---- Identity ----
  id: 'space_station',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #000010 0%, #0A0A2A 40%, #1A1A3A 100%)',
  previewIcon: '\u{1F680}',

  // ---- Translations ----
  translations: { en: 'Space Station', cs: 'Vesm\u00EDrn\u00E1 stanice', hi: '\u0905\u0902\u0924\u0930\u093F\u0915\u094D\u0937 \u0938\u094D\u091F\u0947\u0936\u0928', fil: 'Kalawakan' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: 660, width: 220, height: 60 },
    { x: 1060, y: 660, width: 220, height: 60 },
    { x: 45, y: 465, width: 165, height: 24 },
    { x: 25, y: 360, width: 180, height: 24 },
    { x: 60, y: 270, width: 140, height: 24 },
    { x: 1070, y: 445, width: 135, height: 24 },
    { x: 1095, y: 350, width: 155, height: 24 },
    { x: 1075, y: 260, width: 125, height: 24 },
    { x: 85, y: 625, width: 50, height: 35 },
    { x: 1140, y: 625, width: 45, height: 35 },
  ],
  spawnPoints: [
    { x: 100, y: 445 }, { x: 1135, y: 425 },
    { x: 100, y: 340 }, { x: 1170, y: 330 },
    { x: 110, y: 640 }, { x: 1160, y: 640 },
  ],
  effectZones: [
    { x: 250, y: 200, width: 780, height: 480, type: 'zero_g' },
  ],
  carrotZones: [
    { x: 300, y: 220, width: 680, height: 440 },
  ],
  noSprings: true,

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#000008' },
      { offset: 0.4, color: '#050515' },
      { offset: 0.7, color: '#0A0A20' },
      { offset: 1, color: '#0F0F2A' },
    ],
  },

  hills: [],

  ground: {
    surfaceColor: '#3A3A4A',
    surfaceThickness: 3,
  },

  platform: {
    floatingBodyColor: '#2A2A3A',
    floatingTopColor: '#4A4A5A',
    floatingAccentColor: '#00CCFF',
    groundBodyColor: '#1A1A2A',
    groundTopColor: '#3A3A4A',
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Metal floor plating
        ctx.fillStyle = '#1A1A2A';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#3A3A4A';
        ctx.fillRect(x, y, w, 4);
        // Grid pattern
        ctx.strokeStyle = 'rgba(60, 60, 80, 0.3)';
        ctx.lineWidth = 1;
        for (let gx = x; gx < x + w; gx += 20) {
          ctx.beginPath();
          ctx.moveTo(gx, y + 5);
          ctx.lineTo(gx, y + h);
          ctx.stroke();
        }
        for (let gy = y + 10; gy < y + h; gy += 12) {
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.lineTo(x + w, gy);
          ctx.stroke();
        }
        // LED strips
        ctx.fillStyle = 'rgba(0, 200, 255, 0.15)';
        ctx.fillRect(x, y, w, 2);
      } else {
        // Metal grating platform
        ctx.fillStyle = '#2A2A3A';
        ctx.fillRect(x, y + 2, w, h - 2);
        ctx.fillStyle = '#4A4A5A';
        ctx.fillRect(x, y, w, 3);
        // Grating holes
        ctx.fillStyle = 'rgba(10, 10, 20, 0.4)';
        for (let gx = x + 4; gx < x + w - 4; gx += 8) {
          ctx.fillRect(gx, y + 4, 4, h - 6);
        }
        // Edge LEDs
        ctx.fillStyle = 'rgba(0, 200, 255, 0.2)';
        ctx.fillRect(x, y, 2, h);
        ctx.fillRect(x + w - 2, y, 2, h);
        // Bottom glow
        ctx.fillStyle = 'rgba(0, 150, 255, 0.08)';
        ctx.fillRect(x, y + h, w, 5);
      }
    },
  },

  // ---- Ambient systems ----
  clouds: {
    count: 0,
    color: 'rgba(20, 20, 40, 0.3)',
    minSize: 40,
    maxSize: 60,
    minSpeed: 1,
    maxSpeed: 2,
    yRange: [20, 50],
  },

  weather: {
    particleCount: 15,
    types: [
      { type: 'spark', weight: 0.6, sizeRange: [1, 3], vxRange: [-8, 8], vyRange: [-10, -25], rotSpeedRange: [0, 1], color: '#00CCFF' },
      { type: 'ember', weight: 0.4, sizeRange: [1, 2], vxRange: [-5, 5], vyRange: [-5, -15], rotSpeedRange: [0, 0.5], color: '#FFAA00' },
    ],
  },

  wildlife: {
    count: 0,
    types: [],
  },

  fog: {
    count: 6,
    baseY: 660,
    yVariance: 10,
    speedRange: [1, 3],
    alphaRange: [0.05, 0.12],
    color: '#0044AA',
    sizeX: 50,
    sizeY: 8,
  },

  ambientParticles: {
    count: 10,
    sizeRange: [0.5, 1.5],
    vxRange: [-2, 2],
    vyRange: [-2, 2],
    alphaRange: [0.2, 0.5],
    colors: ['#00CCFF', '#0088FF', '#FFFFFF'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: false,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawAnimatedBackground: (ctx, _arena, time) => {
    // Reset on new match (time resets to near 0)
    if (time < lastAnimTime || spaceObjects.length === 0) {
      resetSpaceAnimations();
    }
    const dt = lastAnimTime < 0 ? 0 : Math.min(time - lastAnimTime, 0.1);
    lastAnimTime = time;

    // Update space objects
    for (let i = 0; i < spaceObjects.length; i++) {
      const obj = spaceObjects[i];
      if (obj.delay > 0) { obj.delay -= dt; continue; }
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.rotation += obj.rotSpeed * dt;

      // Off-window? Respawn with delay
      const m = 60;
      if (obj.x < WIN_X - m || obj.x > WIN_X + WIN_W + m ||
          obj.y < WIN_Y - m || obj.y > WIN_Y + WIN_H + m) {
        spaceObjects[i] = createSpaceObject(8 + Math.random() * 18);
      }
    }

    // Draw clipped to window
    ctx.save();
    ctx.beginPath();
    ctx.rect(WIN_X, WIN_Y, WIN_W, WIN_H);
    ctx.clip();

    for (const obj of spaceObjects) {
      if (obj.delay > 0) continue;
      ctx.globalAlpha = obj.type === 'satellite' ? 0.8 : 0.6;
      if (obj.type === 'asteroid') drawAsteroid(ctx, obj);
      else drawSatellite(ctx, obj);
    }

    ctx.restore();
  },

  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // === Hangar interior walls ===
    ctx.fillStyle = '#0E0E1A';
    ctx.fillRect(0, 0, 1280, 720);

    // Wall panel grid
    ctx.strokeStyle = 'rgba(30, 30, 50, 0.5)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < 720; gy += 50) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(1280, gy);
      ctx.stroke();
    }
    // Side wall vertical panels
    for (let gx = 0; gx < 250; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 720);
      ctx.stroke();
    }
    for (let gx = 1040; gx < 1280; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 720);
      ctx.stroke();
    }

    // === Large open hangar doors in center -- space visible through them ===
    // Door frame
    ctx.fillStyle = '#1A1A2A';
    ctx.fillRect(260, 20, 20, 640);   // Left door frame
    ctx.fillRect(1000, 20, 20, 640);  // Right door frame
    ctx.fillRect(260, 10, 760, 15);   // Top frame

    // Space visible through the opening
    ctx.fillStyle = '#020210';
    ctx.fillRect(280, 25, 720, 635);

    // Stars through the opening
    ctx.save();
    ctx.beginPath();
    ctx.rect(280, 25, 720, 635);
    ctx.clip();

    ctx.fillStyle = '#FFFFFF';
    const stars = [
      [320, 60, 1.5], [400, 100, 0.8], [480, 50, 1.2], [560, 120, 0.9],
      [640, 40, 1.4], [720, 90, 0.7], [800, 60, 1.1], [880, 130, 0.8],
      [960, 45, 1.3], [350, 180, 0.6], [500, 200, 1.0], [650, 170, 0.8],
      [780, 220, 0.9], [900, 190, 0.7], [430, 280, 0.6], [580, 300, 1.0],
      [700, 260, 0.8], [850, 310, 0.7], [380, 400, 0.5], [520, 380, 0.8],
      [670, 420, 0.6], [820, 370, 0.9], [940, 450, 0.7],
    ];
    for (const [sx, sy, sr] of stars) {
      ctx.globalAlpha = 0.3 + (sr as number) * 0.25;
      ctx.beginPath();
      ctx.arc(sx as number, sy as number, sr as number, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nebula through the opening
    ctx.globalAlpha = 0.1;
    const neb = ctx.createRadialGradient(500, 200, 10, 500, 200, 180);
    neb.addColorStop(0, '#4400FF');
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(320, 20, 360, 380);

    // Large Earth visible through hangar doors
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#1A5AAA';
    ctx.beginPath();
    ctx.arc(750, 350, 140, 0, Math.PI * 2);
    ctx.fill();
    // Continents
    ctx.fillStyle = '#2A8A3A';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(710, 310, 45, 35, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(780, 370, 35, 50, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(690, 400, 25, 20, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Ice caps
    ctx.fillStyle = '#DDEEFF';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(750, 215, 50, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(750, 485, 45, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Atmosphere glow
    ctx.globalAlpha = 0.2;
    const earthGlow = ctx.createRadialGradient(750, 350, 130, 750, 350, 180);
    earthGlow.addColorStop(0, 'rgba(100, 180, 255, 0.3)');
    earthGlow.addColorStop(1, 'rgba(100, 180, 255, 0)');
    ctx.fillStyle = earthGlow;
    ctx.fillRect(550, 150, 400, 400);

    ctx.restore(); // unclip

    // Hangar warning stripes on door edges
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#CCAA00';
    for (let sy = 30; sy < 660; sy += 20) {
      ctx.fillRect(262, sy, 16, 8);
      ctx.fillRect(1002, sy, 16, 8);
    }

    // Status lights on hangar frame
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#00FF44';
    ctx.beginPath(); ctx.arc(275, 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1005, 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FF4444';
    ctx.beginPath(); ctx.arc(290, 18, 3, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    const y = arena.platforms[0].y;

    // Control panels -- only on side decks
    const drawControlPanel = (px: number, py: number, pw: number, ph: number) => {
      ctx.fillStyle = '#2A2A3A';
      ctx.fillRect(px, py - ph, pw, ph);
      ctx.fillStyle = 'rgba(0, 100, 200, 0.2)';
      ctx.fillRect(px + 4, py - ph + 4, pw - 8, ph * 0.5);
      const btnColors = ['#00CC44', '#FFAA00', '#FF4444', '#00AAFF'];
      for (let b = 0; b < Math.min(4, Math.floor(pw / 10)); b++) {
        ctx.fillStyle = btnColors[b];
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(px + 8 + b * 10, py - 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#4A4A5A';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py - ph, pw, ph);
    };

    // Decorations only on left and right decks (not center void)
    drawControlPanel(80, y, 50, 35);
    drawControlPanel(1150, y, 55, 38);

    // Crates on decks only
    const drawCrate = (cx: number, cy: number, size: number) => {
      ctx.fillStyle = '#3A3A40';
      ctx.fillRect(cx - size / 2, cy - size, size, size);
      ctx.fillStyle = 'rgba(0, 200, 255, 0.3)';
      ctx.fillRect(cx - size * 0.3, cy - size * 0.7, size * 0.6, size * 0.4);
      ctx.strokeStyle = '#5A5A6A';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - size / 2, cy - size, size, size);
    };

    drawCrate(160, y, 22);
    drawCrate(1100, y, 20);

    // Cables on side walls only
    const drawCable = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 15, x2, y2);
      ctx.stroke();
    };

    drawCable(30, y - 40, 180, y - 30, '#FF4444');
    drawCable(35, y - 35, 175, y - 25, '#00AAFF');
    drawCable(1100, y - 45, 1240, y - 35, '#FFAA00');
    drawCable(1105, y - 40, 1235, y - 30, '#00CC44');

    // Platform decorations -- only on side stack platforms
    const floats = getFloatingPlatforms(arena.platforms).filter(p => p.x < 250 || p.x > 1000);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (i % 3 === 0) {
        drawControlPanel(mid - 20, plat.y, 40, 25);
      } else if (i % 3 === 1) {
        drawCrate(mid, plat.y, 16);
      } else {
        // Small antenna/sensor
        ctx.strokeStyle = '#5A5A6A';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mid, plat.y);
        ctx.lineTo(mid, plat.y - 20);
        ctx.stroke();
        ctx.fillStyle = '#00CCFF';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(mid, plat.y - 20, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;

    // Holographic scan lines (single pattern blit instead of 180 fillRects)
    if (!scanLinePattern) {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 4;
      const pc = c.getContext('2d')!;
      pc.fillStyle = '#00CCFF';
      pc.fillRect(0, 0, 1, 1);
      scanLinePattern = ctx.createPattern(c, 'repeat')!;
    }
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = scanLinePattern;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    // Large foreground structural beam -- left side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0D0D1A';
    // Main vertical beam
    ctx.fillRect(-10, gy - 75, 55, 105);
    // Horizontal crossbar
    ctx.fillRect(-10, gy - 55, 80, 8);
    // Diagonal brace
    ctx.beginPath();
    ctx.moveTo(45, gy - 55);
    ctx.lineTo(80, gy - 55);
    ctx.lineTo(45, gy + 5);
    ctx.closePath();
    ctx.fill();
    // Panel detail lines
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#2A2A4A';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, gy - 70, 30, 40);
    ctx.strokeRect(5, gy - 25, 30, 35);
    // Status light on beam
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#00FF88';
    ctx.beginPath();
    ctx.arc(20, gy - 60, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Large foreground structural beam -- right side
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0D0D1A';
    ctx.fillRect(1240, gy - 70, 50, 100);
    ctx.fillRect(1210, gy - 50, 70, 8);
    ctx.beginPath();
    ctx.moveTo(1240, gy - 50);
    ctx.lineTo(1210, gy - 50);
    ctx.lineTo(1240, gy + 5);
    ctx.closePath();
    ctx.fill();
    // Panel detail lines
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#2A2A4A';
    ctx.lineWidth = 1;
    ctx.strokeRect(1250, gy - 65, 28, 38);
    ctx.strokeRect(1250, gy - 22, 28, 32);
    // Status light
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.arc(1264, gy - 55, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Foreground control console silhouette -- center-right
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#0D0D1A';
    const cX = 900;
    // Console body
    ctx.beginPath();
    ctx.moveTo(cX - 35, gy + 10);
    ctx.lineTo(cX - 30, gy - 35);
    ctx.lineTo(cX - 20, gy - 45);
    ctx.lineTo(cX + 20, gy - 45);
    ctx.lineTo(cX + 30, gy - 35);
    ctx.lineTo(cX + 35, gy + 10);
    ctx.closePath();
    ctx.fill();
    // Screen area
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#00CCFF';
    ctx.fillRect(cX - 18, gy - 40, 36, 18);
    // Button row
    ctx.globalAlpha = 0.3;
    for (let bx = -12; bx <= 12; bx += 8) {
      ctx.fillStyle = bx === 4 ? '#FF4444' : '#00FF88';
      ctx.beginPath();
      ctx.arc(cX + bx, gy - 17, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Floor LEDs along ground (batched into 2 fills instead of 50)
    ctx.save();
    ctx.globalAlpha = 0.2;
    // Glow pass
    ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
    ctx.beginPath();
    for (let lx = 30; lx < 1250; lx += 50) {
      ctx.moveTo(lx + 8, gy + 3);
      ctx.arc(lx, gy + 3, 8, 0, Math.PI * 2);
    }
    ctx.fill();
    // Solid pass
    ctx.fillStyle = '#00CCFF';
    ctx.beginPath();
    for (let lx = 30; lx < 1250; lx += 50) {
      ctx.moveTo(lx + 2, gy + 3);
      ctx.arc(lx, gy + 3, 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  },

  drawWeatherParticle: (ctx, w) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    if (w.type === 'spark') {
      // Electric spark
      ctx.fillStyle = w.color || '#00CCFF';
      ctx.beginPath();
      ctx.arc(0, 0, w.size, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, w.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Warning light particle
      ctx.fillStyle = w.color || '#FFAA00';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, w.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // ---- Gameplay modifiers ----
  physics: {
    gravity: 0.5,
    jumpImpulse: 0.8,
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, fadeAlpha) => {
    // Dark metal panel base
    ctx.fillStyle = '#1A1A2A';
    ctx.fillRect(x, y + height * 0.7, width, height * 0.3);
    ctx.strokeStyle = '#3A3A4A';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + height * 0.7, width, height * 0.3);

    // Warning stripes on base
    ctx.fillStyle = '#CCAA00';
    for (let sx = x + 2; sx < x + width - 2; sx += 8) {
      ctx.fillRect(sx, y + height * 0.7 + 2, 4, height * 0.3 - 4);
    }

    // Electric sparks -- cyan lightning bolts (double-stroke glow, no shadowBlur)
    const boltCount = 3;
    // Glow pass (wide, translucent)
    ctx.strokeStyle = '#00CCFF';
    ctx.lineWidth = 5;
    ctx.globalAlpha = fadeAlpha * 0.3;
    for (let b = 0; b < boltCount; b++) {
      const bx = x + width * (0.2 + b * 0.3);
      const boltH = height * (0.5 + b * 0.15);
      ctx.beginPath();
      ctx.moveTo(bx, y + height * 0.7);
      let cy = y + height * 0.7;
      const target = y + height * 0.7 - boltH;
      while (cy > target) {
        const dx = (b % 2 === 0 ? 1 : -1) * width * 0.1;
        cy -= boltH * 0.3;
        ctx.lineTo(bx + dx, Math.max(cy, target));
        cy -= boltH * 0.15;
        if (cy > target) ctx.lineTo(bx, cy);
      }
      ctx.stroke();
    }
    // Sharp pass (thin, bright)
    ctx.strokeStyle = '#00EEFF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = fadeAlpha;
    for (let b = 0; b < boltCount; b++) {
      const bx = x + width * (0.2 + b * 0.3);
      const boltH = height * (0.5 + b * 0.15);
      ctx.beginPath();
      ctx.moveTo(bx, y + height * 0.7);
      let cy = y + height * 0.7;
      const target = y + height * 0.7 - boltH;
      while (cy > target) {
        const dx = (b % 2 === 0 ? 1 : -1) * width * 0.1;
        cy -= boltH * 0.3;
        ctx.lineTo(bx + dx, Math.max(cy, target));
        cy -= boltH * 0.15;
        if (cy > target) ctx.lineTo(bx, cy);
      }
      ctx.stroke();
    }

    // Spark glow at tips
    for (let b = 0; b < boltCount; b++) {
      const bx = x + width * (0.2 + b * 0.3);
      const boltH = height * (0.5 + b * 0.15);
      const glow = ctx.createRadialGradient(bx, y + height * 0.7 - boltH, 1, bx, y + height * 0.7 - boltH, 8);
      glow.addColorStop(0, 'rgba(0, 230, 255, 0.6)');
      glow.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(bx - 10, y + height * 0.7 - boltH - 10, 20, 20);
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, fadeAlpha) => {
    const halfW = size * 0.5;
    const squash = 1 + bounceTimer * 0.03;

    // Metal launch pad plate
    ctx.fillStyle = '#3A3A4A';
    ctx.fillRect(x - halfW, y - 4, halfW * 2, 4);
    // Pad surface
    ctx.fillStyle = '#4A4A5A';
    ctx.fillRect(x - halfW * 0.85, y - 6, halfW * 1.7, 3);
    // Chevron markings
    ctx.strokeStyle = '#CCAA00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.4, y - 5);
    ctx.lineTo(x, y - 7);
    ctx.lineTo(x + halfW * 0.4, y - 5);
    ctx.stroke();

    // Thrust glow beneath/above pad
    const thrustH = size * 0.6 * squash;
    const grd = ctx.createLinearGradient(x, y, x, y - thrustH);
    grd.addColorStop(0, 'rgba(0, 150, 255, 0.5)');
    grd.addColorStop(0.3, 'rgba(0, 200, 255, 0.3)');
    grd.addColorStop(1, 'rgba(0, 200, 255, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.6, y - 6);
    ctx.lineTo(x - halfW * 0.2, y - thrustH);
    ctx.lineTo(x + halfW * 0.2, y - thrustH);
    ctx.lineTo(x + halfW * 0.6, y - 6);
    ctx.closePath();
    ctx.fill();

    // Bright core
    ctx.fillStyle = 'rgba(150, 230, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y - thrustH * 0.3, halfW * 0.15, thrustH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Side LEDs
    ctx.fillStyle = '#00CCFF';
    ctx.globalAlpha = fadeAlpha * 0.6;
    ctx.beginPath();
    ctx.arc(x - halfW * 0.8, y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + halfW * 0.8, y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
  }),

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_space_hum'],
  },
  musicFile: 'space_station.mp3',
};
