import type { ArenaPack } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { drawTree, drawHangingVine, drawFgLeafCluster, drawFern } from '../../themes/drawPrimitives';
import { getFloatingPlatforms } from '../../themes/utils';

export const treetops: ArenaPack = {
  // ---- Identity ----
  id: 'treetops',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #1A3A1A 0%, #2D5A2D 40%, #4A8A4A 100%)',
  previewIcon: '\u{1F333}',

  // ---- Translations ----
  translations: { en: 'Treetops', cs: 'Koruny strom\u016F', hi: '\u092A\u0947\u0921\u093C\u094B\u0902 \u0915\u0940 \u091A\u094B\u091F\u0940', fil: 'Tuktok ng Puno' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 30, y: 600, width: 180, height: 24 },
    { x: 400, y: 590, width: 240, height: 24 },
    { x: 800, y: 600, width: 220, height: 24 },
    { x: 1100, y: 585, width: 160, height: 24 },
    { x: 120, y: 490, width: 200, height: 24 },
    { x: 460, y: 480, width: 180, height: 24 },
    { x: 700, y: 485, width: 160, height: 24 },
    { x: 1000, y: 475, width: 200, height: 24 },
    { x: 310, y: 540, width: 50, height: 20 },
    { x: 680, y: 545, width: 50, height: 20 },
    { x: 950, y: 535, width: 50, height: 20 },
    { x: 50, y: 380, width: 160, height: 24 },
    { x: 500, y: 370, width: 280, height: 24 },
    { x: 1050, y: 375, width: 160, height: 24 },
    { x: 440, y: 260, width: 300, height: 24 },
    { x: 300, y: 430, width: 70, height: 20 },
    { x: 880, y: 425, width: 70, height: 20 },
    { x: 280, y: 320, width: 70, height: 20 },
    { x: 850, y: 315, width: 70, height: 20 },
  ],
  spawnPoints: [
    { x: 120, y: 580 }, { x: 1180, y: 565 },
    { x: 500, y: 570 }, { x: 900, y: 580 },
    { x: 640, y: 240 }, { x: 220, y: 470 },
  ],
  allowFallOff: true,

  // ---- Visual config ----
  sky: {
    gradient: [
      { offset: 0, color: '#1A3A1A' },
      { offset: 0.3, color: '#1E4A1E' },
      { offset: 0.6, color: '#2D5A2D' },
      { offset: 1, color: '#3A6A3A' },
    ],
  },

  hills: [
    // Pushed below screen -- treetops has no ground, hills would float in the void
    { x: -20, baseY: 780, width: 400, height: 50, color: '#1A3A1A' },
    { x: 350, baseY: 780, width: 450, height: 40, color: '#153515' },
    { x: 750, baseY: 780, width: 380, height: 55, color: '#1A3A1A' },
    { x: 1050, baseY: 780, width: 350, height: 45, color: '#153515' },
  ],

  ground: {
    surfaceColor: '#2D5A2D',
    surfaceThickness: 3,
  },

  platform: {
    floatingBodyColor: '#5A3A20',
    floatingTopColor: '#7A5A30',
    floatingAccentColor: '#4A8A3A',
    groundBodyColor: '#4A3018',
    groundTopColor: '#6A4A28',
    drawMoss: true,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        // Thick branch base -- this is the "danger" zone at bottom
        ctx.fillStyle = '#2A1A0A';
        ctx.fillRect(x, y + 3, w, h - 3);
        ctx.fillStyle = '#4A3018';
        ctx.fillRect(x, y, w, 4);
      } else {
        // Branch platform -- organic shapes
        ctx.fillStyle = '#5A3A20';
        // Main branch body
        ctx.beginPath();
        ctx.moveTo(x - 5, y + h);
        ctx.quadraticCurveTo(x + w * 0.2, y - 2, x + w * 0.5, y);
        ctx.quadraticCurveTo(x + w * 0.8, y - 1, x + w + 5, y + h);
        ctx.lineTo(x + w + 3, y + h + 3);
        ctx.lineTo(x - 3, y + h + 3);
        ctx.closePath();
        ctx.fill();
        // Bark texture on top
        ctx.fillStyle = '#7A5A30';
        ctx.fillRect(x + 3, y, w - 6, 3);
        // Moss patches
        ctx.fillStyle = '#4A8A3A';
        ctx.globalAlpha = 0.6;
        for (let mx = x + 8; mx < x + w - 8; mx += 20 + Math.random() * 15) {
          ctx.beginPath();
          ctx.ellipse(mx, y, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Bark detail
        ctx.strokeStyle = '#4A2A10';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, y + 4);
        ctx.lineTo(x + w * 0.32, y + h - 2);
        ctx.stroke();
        if (w > 120) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.7, y + 3);
          ctx.lineTo(x + w * 0.68, y + h - 1);
          ctx.stroke();
        }
      }
    },
  },

  // ---- Ambient systems ----
  clouds: {
    count: 0,
    color: 'rgba(100, 150, 100, 0.3)',
    minSize: 40,
    maxSize: 60,
    minSpeed: 1,
    maxSpeed: 3,
    yRange: [20, 60],
  },

  weather: {
    particleCount: 35,
    types: [
      { type: 'leaf', weight: 0.7, sizeRange: [3, 7], vxRange: [-15, 15], vyRange: [15, 40], rotSpeedRange: [1, 4] },
      { type: 'petal', weight: 0.3, sizeRange: [2, 4], vxRange: [-10, 10], vyRange: [10, 25], rotSpeedRange: [2, 5] },
    ],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'bird', weight: 0.4, colors: ['#2A4A2A', '#3A5A3A', '#4A6A4A'], speedRange: [30, 60], yRange: [0.05, 0.3] },
      { type: 'butterfly', weight: 0.6, colors: ['#88CC44', '#AADD66', '#66AA22', '#CCEE88'], speedRange: [10, 25], yRange: [0.15, 0.7] },
    ],
  },

  fog: {
    count: 25,
    baseY: 660,
    yVariance: 30,
    speedRange: [2, 5],
    alphaRange: [0.15, 0.35],
    color: '#2A5A2A',
    sizeX: 55,
    sizeY: 12,
  },

  ambientParticles: {
    count: 18,
    sizeRange: [1, 2.5],
    vxRange: [-3, 3],
    vyRange: [-5, -15],
    alphaRange: [0.2, 0.5],
    colors: ['#FFFFAA', '#AAFFAA', '#CCFFCC'],
  },

  dayNight: {
    enabled: false,
    cycleDuration: 120,
    maxNightAlpha: 0,
    showFireflies: true,
    showShootingStars: false,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx, _arena) => {
    ctx.save();

    // Dense canopy above -- dappled light
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#0A2A0A';
    // Large overlapping leaf clusters forming canopy
    const canopyLeaves = [
      [-20, 20, 120], [80, 10, 100], [170, 30, 110], [270, 5, 130],
      [380, 25, 105], [470, 10, 120], [570, 20, 115], [670, 8, 125],
      [760, 28, 110], [860, 12, 120], [950, 22, 105], [1040, 6, 130],
      [1140, 18, 115], [1230, 10, 100],
    ];
    for (const [lx, ly, ls] of canopyLeaves) {
      ctx.beginPath();
      ctx.ellipse(lx as number, ly as number, (ls as number) * 0.6, (ls as number) * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lighter dappled spots (sunlight through canopy)
    ctx.fillStyle = '#4A8A4A';
    ctx.globalAlpha = 0.08;
    for (let dx = 30; dx < 1260; dx += 70) {
      const dy = 60 + Math.sin(dx * 0.03) * 20;
      ctx.beginPath();
      ctx.ellipse(dx, dy + 200, 25 + Math.sin(dx * 0.05) * 10, 150, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Decorative light beam piercing through canopy
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#FFFFAA';
    ctx.beginPath();
    ctx.moveTo(580, 0);
    ctx.lineTo(520, 720);
    ctx.lineTo(680, 720);
    ctx.lineTo(700, 0);
    ctx.closePath();
    ctx.fill();
    // Brighter core
    ctx.globalAlpha = 0.04;
    ctx.beginPath();
    ctx.moveTo(620, 0);
    ctx.lineTo(580, 720);
    ctx.lineTo(640, 720);
    ctx.lineTo(660, 0);
    ctx.closePath();
    ctx.fill();

    // Massive tree trunks spanning full height (canopy to abyss)
    ctx.fillStyle = '#2A1A0A';
    ctx.globalAlpha = 0.2;
    ctx.fillRect(50, 0, 40, 720);
    ctx.fillRect(380, 0, 50, 720);
    ctx.fillRect(750, 0, 45, 720);
    ctx.fillRect(1100, 0, 40, 720);

    ctx.restore();
  },

  drawBackgroundNature: (ctx, arena) => {
    // No ground in treetops -- use bottom of screen as tree root reference
    const y = 750;

    // Large trees rooted below (trunks visible going down)
    drawTree(ctx, 100, y, 70, {
      trunk: '#4A3018',
      bark: '#3A2010',
      foliage: [
        { color: '#1A5A1A', yOff: 0.4, rx: 0.6, ry: 0.35 },
        { color: '#2A7A2A', yOff: 0.65, rx: 0.5, ry: 0.3 },
        { color: '#3A8A3A', yOff: 0.85, rx: 0.35, ry: 0.22 },
      ],
    });
    drawTree(ctx, 640, y, 80, {
      trunk: '#4A3018',
      bark: '#3A2010',
      foliage: [
        { color: '#1A5A1A', yOff: 0.4, rx: 0.55, ry: 0.35 },
        { color: '#2A7A2A', yOff: 0.6, rx: 0.45, ry: 0.3 },
        { color: '#3A8A3A', yOff: 0.8, rx: 0.3, ry: 0.2 },
      ],
    });
    drawTree(ctx, 1180, y, 65, {
      trunk: '#4A3018',
      bark: '#3A2010',
      foliage: [
        { color: '#1A5A1A', yOff: 0.45, rx: 0.55, ry: 0.3 },
        { color: '#2A7A2A', yOff: 0.65, rx: 0.45, ry: 0.25 },
        { color: '#3A8A3A', yOff: 0.8, rx: 0.3, ry: 0.2 },
      ],
    });

    // Bird nests on platforms
    const drawNest = (nx: number, ny: number, size: number) => {
      ctx.fillStyle = '#5A3A18';
      ctx.beginPath();
      ctx.ellipse(nx, ny - 2, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Twigs
      ctx.strokeStyle = '#6A4A28';
      ctx.lineWidth = 1;
      for (let t = 0; t < 5; t++) {
        const angle = (t / 5) * Math.PI + 0.3;
        ctx.beginPath();
        ctx.moveTo(nx + Math.cos(angle) * size * 0.3, ny - 3);
        ctx.lineTo(nx + Math.cos(angle) * size * 0.7, ny - 6 - t);
        ctx.stroke();
      }
      // Eggs
      ctx.fillStyle = '#E8E8D8';
      ctx.beginPath();
      ctx.ellipse(nx - 3, ny - 5, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(nx + 3, ny - 5, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // Acorns
    const drawAcorn = (ax: number, ay: number) => {
      ctx.fillStyle = '#8B6914';
      ctx.beginPath();
      ctx.ellipse(ax, ay - 5, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cap
      ctx.fillStyle = '#5A3A18';
      ctx.beginPath();
      ctx.ellipse(ax, ay - 9, 5, 3, 0, Math.PI, 0);
      ctx.fill();
      // Stem
      ctx.strokeStyle = '#5A3A18';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 12);
      ctx.lineTo(ax, ay - 15);
      ctx.stroke();
    };

    // Platform decorations
    const floats = getFloatingPlatforms(arena.platforms);
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;

      // Hanging vines from every platform
      drawHangingVine(ctx, plat.x + 10, plat.y + plat.height, 20 + i * 3);
      drawHangingVine(ctx, plat.x + plat.width - 10, plat.y + plat.height, 18 + i * 2);

      if (plat.width > 200) {
        drawNest(mid, plat.y, 20);
        drawFern(ctx, plat.x + 15, plat.y, '#2A6A2A');
        drawFern(ctx, plat.x + plat.width - 15, plat.y, '#2A6A2A');
        drawAcorn(plat.x + 40, plat.y);
        drawAcorn(plat.x + plat.width - 40, plat.y);
      } else if (plat.width > 120) {
        if (i % 2 === 0) {
          drawNest(mid, plat.y, 15);
        } else {
          drawAcorn(mid - 8, plat.y);
          drawAcorn(mid + 8, plat.y);
        }
        drawFern(ctx, plat.x + 8, plat.y, '#2A6A2A');
      } else {
        drawAcorn(mid, plat.y);
      }
    }
  },

  drawForegroundNature: (ctx, arena) => {
    const floats = getFloatingPlatforms(arena.platforms);

    // Foreground leaves hanging down from top
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1A4A1A';
    for (let lx = -10; lx < 1300; lx += 50 + Math.random() * 40) {
      const ly = -5 + Math.sin(lx * 0.04) * 15;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 20 + Math.random() * 15, 12 + Math.random() * 8, Math.sin(lx * 0.02) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Foreground leaf clusters on platforms
    for (const plat of floats) {
      if (plat.width > 150) {
        drawFgLeafCluster(ctx, plat.x + plat.width * 0.3, plat.y, ['#1A5A1A', '#2A6A2A', '#3A7A3A']);
        drawFgLeafCluster(ctx, plat.x + plat.width * 0.7, plat.y, ['#1A5A1A', '#2A6A2A', '#3A7A3A']);
      }
    }

    // Bottom fog (deep forest abyss below -- at visible screen bottom)
    ctx.save();
    ctx.globalAlpha = 0.4;
    const fogGrd = ctx.createLinearGradient(0, 620, 0, 720);
    fogGrd.addColorStop(0, 'rgba(10, 30, 10, 0)');
    fogGrd.addColorStop(1, 'rgba(10, 30, 10, 0.9)');
    ctx.fillStyle = fogGrd;
    ctx.fillRect(0, 620, 1280, 100);
    ctx.restore();
  },

  // ---- Gameplay modifiers ----
  ghostConfig: {
    count: 4,
    speed: 60,
    size: 14,
    color: '#DDAA00',
    glowColor: '#CCAA22',
  },

  drawCustomGhost: (ctx, x, y, size, alpha, time) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha * 0.9;
    const s = size;

    // Wings (flapping fast)
    const wingAngle = Math.sin(time * 25) * 0.5;
    ctx.fillStyle = 'rgba(200, 220, 255, 0.4)';
    // Left wing
    ctx.save();
    ctx.rotate(-0.3 + wingAngle);
    ctx.beginPath();
    ctx.ellipse(-s * 0.5, -s * 0.2, s * 0.6, s * 0.25, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Right wing
    ctx.save();
    ctx.rotate(0.3 - wingAngle);
    ctx.beginPath();
    ctx.ellipse(s * 0.5, -s * 0.2, s * 0.6, s * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body -- yellow and black stripes
    ctx.fillStyle = '#DDAA00';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.35, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Black stripes
    ctx.fillStyle = '#1A1A00';
    ctx.fillRect(-s * 0.35, -s * 0.15, s * 0.7, s * 0.12);
    ctx.fillRect(-s * 0.3, s * 0.12, s * 0.6, s * 0.1);

    // Head
    ctx.fillStyle = '#1A1A00';
    ctx.beginPath();
    ctx.arc(0, -s * 0.55, s * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (angry red)
    ctx.fillStyle = '#FF3300';
    ctx.beginPath();
    ctx.arc(-s * 0.08, -s * 0.6, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.08, -s * 0.6, s * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Stinger
    ctx.fillStyle = '#1A1A00';
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.5);
    ctx.lineTo(0, s * 0.7);
    ctx.lineTo(s * 0.05, s * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  // ---- Audio ----
  ambientSoundConfig: {
    loops: ['amb_wind'],
    periodic: [{ sound: 'amb_bird_chirp', intervalRange: [8, 20] }],
  },

  musicFile: 'treetops.mp3',
};
