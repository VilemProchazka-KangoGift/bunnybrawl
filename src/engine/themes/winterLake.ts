import type { ThemeConfig } from './types';
import { getFloatingPlatforms } from './utils';
import {
  drawPineTree, drawChristmasTree, drawSnowDrift, drawIcePatch, drawIcicle, drawIceCube,
  drawBigSnowman, drawIgloo, drawSnowman, drawSnowball,
  drawSnowballPyramid, drawLargeSnowballPyramid,
  drawFgBush,
  createThornRenderer, createSpringRenderer,
} from './drawPrimitives';

// Platform colors — shared between config fields and customDraw
const FLOAT_BODY = '#5A7A8C';
const FLOAT_TOP = '#D8E8F0';
const GROUND_BODY = '#4A6A7C';
const GROUND_TOP = '#E0EEF5';

export const WINTER_LAKE_THEME: ThemeConfig = {
  id: 'winter_lake',
  nameKey: 'arena_winter_lake',
  previewGradient: 'linear-gradient(to bottom, #2C3E6B 0%, #8FA8C8 60%, #D8E8F0 100%)',
  previewIcon: '❄️',

  sky: {
    gradient: [
      { offset: 0, color: '#2C3E6B' },
      { offset: 0.35, color: '#5B7BA5' },
      { offset: 0.7, color: '#8FA8C8' },
      { offset: 1, color: '#B8C8DC' },
    ],
  },

  hills: [
    { x: 0, baseY: 620, width: 350, height: 100, color: '#D8E8F0' },
    { x: 300, baseY: 630, width: 450, height: 80, color: '#C8D8E8' },
    { x: 700, baseY: 615, width: 380, height: 110, color: '#D0E0EA' },
    { x: 1000, baseY: 630, width: 350, height: 90, color: '#C4D4E4' },
  ],

  ground: {
    surfaceColor: '#E8F0F8',
    surfaceThickness: 5,
    // No grass blades in winter
  },

  platform: {
    floatingBodyColor: FLOAT_BODY,
    floatingTopColor: FLOAT_TOP,
    floatingAccentColor: undefined,
    groundBodyColor: GROUND_BODY,
    groundTopColor: GROUND_TOP,
    drawMoss: false,
    customDraw: (ctx, x, y, w, h, isGround) => {
      if (isGround) {
        ctx.fillStyle = GROUND_BODY;
        ctx.fillRect(x, y + 5, w, h - 5);
        ctx.fillStyle = GROUND_TOP;
        ctx.fillRect(x, y, w, 8);
        ctx.fillStyle = '#8AAABA';
        for (let dx = 15; dx < w; dx += 35 + Math.random() * 25) {
          ctx.fillRect(x + dx, y + 18 + Math.random() * 15, 3, 3);
        }
      } else {
        ctx.fillStyle = FLOAT_BODY;
        ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = FLOAT_TOP;
        ctx.fillRect(x, y, w, 6);
        ctx.fillStyle = 'rgba(200, 225, 245, 0.4)';
        ctx.fillRect(x, y, w, 2);
        drawIcicle(ctx, x + 4, y + h, 8 + Math.random() * 5);
        drawIcicle(ctx, x + w - 4, y + h, 7 + Math.random() * 6);
        if (w > 160) {
          drawIcicle(ctx, x + w / 2, y + h, 10 + Math.random() * 4);
        }
      }
    },
  },

  clouds: {
    count: 4,
    color: 'rgba(200, 215, 230, 0.5)',
    minSize: 50,
    maxSize: 80,
    minSpeed: 4,
    maxSpeed: 8,
    yRange: [35, 100],
  },

  weather: {
    particleCount: 50,
    types: [
      { type: 'snow', weight: 1, sizeRange: [2, 5], vxRange: [-15, 15], vyRange: [30, 80], rotSpeedRange: [-1, 1] },
    ],
  },

  wildlife: {
    count: 2,
    types: [
      { type: 'bird', weight: 1, colors: ['#4A4A4A', '#5C5C5C', '#6A6A6A'], speedRange: [25, 45], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 25,
    baseY: 655,
    yVariance: 15,
    speedRange: [3, 8],
    alphaRange: [0.15, 0.35],
    color: '#CCE0FF',
    sizeX: 50,
    sizeY: 10,
  },

  ambientParticles: {
    count: 8,
    sizeRange: [1, 2],
    vxRange: [-5, 5],
    vyRange: [5, 15],
    alphaRange: [0.2, 0.5],
    colors: ['#E8F0FF', '#FFFFFF'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: 120,
    maxNightAlpha: 0.6,
    showFireflies: false,
    showShootingStars: true,
  },

  drawBackgroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    const floats = getFloatingPlatforms(arena.platforms);

    // === LANDMARKS (background, edges) ===
    drawBigSnowman(ctx, 55, y, 90);
    drawIgloo(ctx, 1080, y, 180, 100);

    // === GROUND — sparse ===
    drawPineTree(ctx, 200, y, 75, true);
    drawChristmasTree(ctx, 640, y, 55);
    drawPineTree(ctx, 1200, y, 60, true);
    drawSnowman(ctx, 530, y, 32);
    drawIcePatch(ctx, 700, y, 220);

    // === ICE CUBES — 3D blocks aligned with solid platforms ===
    drawIceCube(ctx, 370, 610, 65, 50);    // left ground block
    drawIceCube(ctx, 870, 610, 65, 50);    // right ground block

    // === PLATFORM DECORATIONS — rich variety per platform ===
    for (let i = 0; i < floats.length; i++) {
      const plat = floats[i];
      const mid = plat.x + plat.width / 2;
      if (plat.width >= 350) {
        // Very wide — spaced out: tree, christmas, snowman, tree
        drawPineTree(ctx, plat.x + 35, plat.y, 45, true);
        drawChristmasTree(ctx, plat.x + plat.width * 0.35, plat.y, 38);
        drawSnowman(ctx, plat.x + plat.width * 0.58, plat.y, 26);
        drawPineTree(ctx, plat.x + plat.width - 35, plat.y, 42, true);
        drawIcicle(ctx, plat.x + 60, plat.y + plat.height, 10);
        drawIcicle(ctx, plat.x + plat.width - 60, plat.y + plat.height, 11);
      } else if (plat.width >= 200) {
        // Wide — trees + mixed decorations
        drawPineTree(ctx, plat.x + 25, plat.y, 38, true);
        drawChristmasTree(ctx, plat.x + plat.width - 28, plat.y, 32);
        if (i % 2 === 0) {
          drawSnowman(ctx, mid, plat.y, 25);
        } else {
          drawSnowball(ctx, mid - 15, plat.y, 5);
          drawSnowball(ctx, mid + 15, plat.y, 4);
        }
        drawIcicle(ctx, mid, plat.y + plat.height, 9);
      } else if (plat.width >= 140) {
        // Medium — tree + decoration
        if (i % 3 === 0) {
          drawChristmasTree(ctx, mid - 12, plat.y, 30);
          drawSnowball(ctx, mid + 22, plat.y, 4);
        } else if (i % 3 === 1) {
          drawPineTree(ctx, mid - 12, plat.y, 34, true);
          drawSnowman(ctx, mid + 28, plat.y, 24);
        } else {
          drawPineTree(ctx, mid + 10, plat.y, 32, true);
          drawSnowballPyramid(ctx, mid - 20, plat.y, 6);
        }
        drawSnowDrift(ctx, plat.x + 10, plat.y, 18, 2);
      } else {
        // Small — one item + accent
        if (i % 3 === 0) {
          drawPineTree(ctx, mid, plat.y, 20, true);
        } else if (i % 3 === 1) {
          drawSnowman(ctx, mid, plat.y, 24);
        } else {
          drawChristmasTree(ctx, mid, plat.y, 18);
        }
        drawSnowball(ctx, plat.x + 10, plat.y, 3);
      }
    }

    // === ICICLES under wide bridge ===
    const bridge = floats.find(p => p.width >= 350);
    if (bridge) {
      for (let i = 0; i < 6; i++) {
        drawIcicle(ctx, bridge.x + 30 + i * 60, bridge.y + bridge.height, 8 + Math.random() * 7);
      }
    }
  },

  drawFarBackground: (ctx, _arena) => {
    // Distant snowy mountain range
    ctx.save();
    ctx.globalAlpha = 0.35;

    // Far mountains — tall, faded
    ctx.fillStyle = '#9AB0C8';
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(80, 380);
    ctx.lineTo(200, 480);
    ctx.lineTo(320, 350);
    ctx.lineTo(440, 460);
    ctx.lineTo(520, 370);
    ctx.lineTo(640, 420);
    ctx.lineTo(780, 340);
    ctx.lineTo(900, 440);
    ctx.lineTo(1000, 360);
    ctx.lineTo(1120, 450);
    ctx.lineTo(1220, 380);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    // Snow caps on peaks
    ctx.fillStyle = '#D0E0F0';
    ctx.globalAlpha = 0.3;
    const peaks = [
      { x: 80, y: 380, w: 60 }, { x: 320, y: 350, w: 55 },
      { x: 520, y: 370, w: 50 }, { x: 780, y: 340, w: 60 },
      { x: 1000, y: 360, w: 55 }, { x: 1220, y: 380, w: 45 },
    ];
    for (const p of peaks) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.w * 0.4, p.y + 35);
      ctx.lineTo(p.x + p.w * 0.4, p.y + 35);
      ctx.closePath();
      ctx.fill();
    }

    // Nearer foothills
    ctx.fillStyle = '#8AA0B8';
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(-20, 660);
    ctx.lineTo(100, 500);
    ctx.lineTo(250, 540);
    ctx.lineTo(400, 490);
    ctx.lineTo(550, 530);
    ctx.lineTo(700, 480);
    ctx.lineTo(850, 520);
    ctx.lineTo(1000, 490);
    ctx.lineTo(1150, 530);
    ctx.lineTo(1300, 660);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawForegroundNature: (ctx, arena) => {
    const ground = arena.platforms[0];
    const gy = ground.y;
    const floats = getFloatingPlatforms(arena.platforms);

    // Foreground trees on ground
    drawPineTree(ctx, 50, gy, 65, true);
    drawPineTree(ctx, 1230, gy, 55, true);

    // Foreground trees on wide platforms
    for (const plat of floats) {
      if (plat.width >= 350) {
        drawPineTree(ctx, plat.x + plat.width * 0.45, plat.y, 28, true);
      }
    }

    // Large snowball pyramid — single foreground accent
    drawLargeSnowballPyramid(ctx, 850, gy, 10);

    // Snow bushes
    const snowBushColors = {
      backLayer: '#2A4A2A',
      mainBody: '#3A5A3A',
      leftLobe: '#345A34',
      rightLobe: '#305830',
      highlight: '#4A6A4A',
      highlight2: '#4A6A4A',
      berries: ['#CC3333', '#DD4444', '#BB2222'],
    };
    drawFgBush(ctx, 350, gy, 34, snowBushColors);
    // Snow cap on bush
    ctx.fillStyle = 'rgba(230, 240, 250, 0.75)';
    ctx.beginPath();
    ctx.ellipse(350, gy - 34 * 0.55, 34 * 0.55, 34 * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(355, gy - 34 * 0.65, 34 * 0.25, 34 * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawFgBush(ctx, 960, gy, 30, snowBushColors);
    // Snow cap on bush
    ctx.fillStyle = 'rgba(230, 240, 250, 0.75)';
    ctx.beginPath();
    ctx.ellipse(960, gy - 30 * 0.55, 30 * 0.55, 30 * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245, 250, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(965, gy - 30 * 0.65, 30 * 0.25, 30 * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawSnowDrift(ctx, 15, gy, 45, 6);
    drawSnowDrift(ctx, 1250, gy, 40, 5);
  },

  physics: {
    friction: 0.15,
  },

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;

    // Snow base mound
    ctx.fillStyle = 'rgba(220, 235, 250, 0.6)';
    ctx.beginPath();
    ctx.ellipse(x + width / 2, by, width * 0.45, height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ice crystal spikes — translucent blue/white
    const crystals = [
      { sx: 0.18, sh: 0.55, w: 0.1, tilt: -0.15 },
      { sx: 0.32, sh: 0.8, w: 0.09, tilt: -0.05 },
      { sx: 0.5, sh: 1.0, w: 0.11, tilt: 0 },
      { sx: 0.68, sh: 0.75, w: 0.09, tilt: 0.08 },
      { sx: 0.82, sh: 0.5, w: 0.08, tilt: 0.12 },
    ];
    for (const c of crystals) {
      const cxp = x + width * c.sx;
      const ch = height * c.sh;
      const cw = width * c.w;
      ctx.save();
      ctx.translate(cxp, by);
      ctx.rotate(c.tilt);

      // Crystal body — translucent blue
      const crystalGrd = ctx.createLinearGradient(0, 0, 0, -ch);
      crystalGrd.addColorStop(0, 'rgba(160, 200, 240, 0.6)');
      crystalGrd.addColorStop(0.5, 'rgba(180, 220, 255, 0.5)');
      crystalGrd.addColorStop(1, 'rgba(220, 240, 255, 0.3)');
      ctx.fillStyle = crystalGrd;
      ctx.beginPath();
      ctx.moveTo(-cw, 0);
      ctx.lineTo(-cw * 0.3, -ch * 0.6);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw * 0.3, -ch * 0.6);
      ctx.lineTo(cw, 0);
      ctx.closePath();
      ctx.fill();

      // Inner facet highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(-cw * 0.4, -ch * 0.1);
      ctx.lineTo(-cw * 0.1, -ch * 0.7);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw * 0.1, -ch * 0.5);
      ctx.lineTo(-cw * 0.1, -ch * 0.1);
      ctx.closePath();
      ctx.fill();

      // Crystal edge outline
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-cw, 0);
      ctx.lineTo(0, -ch);
      ctx.lineTo(cw, 0);
      ctx.stroke();

      ctx.restore();
    }
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
    const halfW = size * 0.5;
    const squash = 1 + bounceTimer * 0.03;
    const moundH = size * 0.4 / squash;

    // Snow mound body
    ctx.fillStyle = '#E8F0F8';
    ctx.beginPath();
    ctx.moveTo(x - halfW, y);
    ctx.quadraticCurveTo(x - halfW * 0.5, y - moundH * 1.3, x, y - moundH);
    ctx.quadraticCurveTo(x + halfW * 0.5, y - moundH * 1.3, x + halfW, y);
    ctx.closePath();
    ctx.fill();

    // Snow surface highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.6, y - moundH * 0.3);
    ctx.quadraticCurveTo(x, y - moundH * 1.1, x + halfW * 0.5, y - moundH * 0.4);
    ctx.quadraticCurveTo(x + halfW * 0.2, y - moundH * 0.8, x - halfW * 0.3, y - moundH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Shadow at base
    ctx.fillStyle = 'rgba(150, 180, 210, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * 0.9, size * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snow particles kicked up on bounce
    if (Math.abs(bounceTimer) > 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      const particleCount = 5;
      for (let p = 0; p < particleCount; p++) {
        const angle = (p / particleCount) * Math.PI - Math.PI * 0.1;
        const dist = halfW * 0.4 + Math.abs(bounceTimer) * 1.2;
        const px = x + Math.cos(angle) * dist;
        const py = y - moundH * 0.5 - Math.sin(angle) * dist * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + Math.abs(bounceTimer) * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }),

  drawCustomHazardZone: (ctx, x, y, width, height, _time) => {
    ctx.save();
    // Icicle spikes hanging downward
    const icicleCount = Math.floor(width / 12);
    for (let i = 0; i < icicleCount; i++) {
      const ix = x + 6 + i * (width / icicleCount);
      const ih = height + 15 + (i % 3) * 8;
      // Ice body
      ctx.fillStyle = 'rgba(180, 210, 240, 0.7)';
      ctx.beginPath();
      ctx.moveTo(ix - 4, y);
      ctx.lineTo(ix, y + ih);
      ctx.lineTo(ix + 4, y);
      ctx.closePath();
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(220, 240, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(ix - 1, y + 2);
      ctx.lineTo(ix, y + ih * 0.7);
      ctx.lineTo(ix + 1, y + 2);
      ctx.closePath();
      ctx.fill();
    }
    // Frost base along the platform bottom
    ctx.fillStyle = 'rgba(200, 220, 240, 0.3)';
    ctx.fillRect(x - 5, y - 2, width + 10, 4);
    ctx.restore();
  },
};
