import type { ArenaPack } from '../types';
import type { Platform } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { createThornRenderer, createSpringRenderer } from '../../themes/drawPrimitives';
import { getFloatingPlatforms } from '../../themes/utils';
import {
  CAP_DEPTH, BODY_SEED_OFFSET, applyIsoInsets, mulberry32, seedFor,
  capFrontY, capBackY, skewPx,
  drawPlatformRightFace, drawPlatformCap,
  candyDrips, backIso, leftIso,
} from '../../themes/drawPrimitives';

const SPRINKLE_COLORS = ['#FF69B4', '#FFD700', '#87CEEB', '#98FB98', '#DDA0DD', '#FF6347'];

// Bg pass: cap + right face. Sit behind the player.
function drawCandyPlatformBg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y));
  const cF = capFrontY(platform);
  const cB = capBackY(platform);
  const sp = skewPx();

  // Right face — darker pink (shadow side)
  drawPlatformRightFace(ctx, platform, '#D06A98');

  // Edge profiles + iso parallelogram cap.
  const frontPts = candyDrips(platform.x, platform.width, cF, rng);
  const backPts = backIso(platform.x, platform.width, cB, sp);
  const leftPts = leftIso(cB, cF, platform.x, sp);

  // Cap — white frosting with rainbow sprinkles
  drawPlatformCap(ctx, platform, frontPts, backPts, {
    capColor: '#FFFDF7',
    capLight: 'rgba(255,255,255,0.4)',
    drawCapTexture: (ctx2, capFront, _capBack, skew) => {
      const n = Math.max(3, Math.floor(platform.width / 12));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + rng() * 0.4) / n;
        const v = 0.15 + rng() * 0.7;
        const sx = platform.x + u * platform.width + v * skew;
        const sy = capFront - v * CAP_DEPTH;
        const angle = rng() * Math.PI;
        const color = SPRINKLE_COLORS[Math.floor(rng() * SPRINKLE_COLORS.length)];
        ctx2.save();
        ctx2.translate(sx, sy);
        ctx2.rotate(angle);
        ctx2.fillStyle = color;
        ctx2.fillRect(-1.8, -0.55, 3.6, 1.1);
        ctx2.beginPath();
        ctx2.arc(-1.8, 0, 0.55, 0, Math.PI * 2);
        ctx2.arc(1.8, 0, 0.55, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.restore();
      }
    },
  }, leftPts);
}

// Fg pass: body face. Drawn after players for occlusion.
function drawCandyPlatformFg(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const rng = mulberry32(seedFor(platform.x, platform.y) ^ BODY_SEED_OFFSET);
  const cF = capFrontY(platform);
  const bodyTop = cF;
  const bodyH = platform.height - CAP_DEPTH / 2;

  // Body front face — pink layer cake gradient
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  g.addColorStop(0, '#FFB6CF');
  g.addColorStop(0.5, '#F590B0');
  g.addColorStop(1, '#D76894');
  ctx.fillStyle = g;
  ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);

  // Horizontal layer line — cream filling stripe across the cake
  if (bodyH >= 10) {
    const layerY = bodyTop + bodyH * 0.55;
    const layerH = Math.max(2, Math.min(4, bodyH * 0.15));
    ctx.fillStyle = '#FFE8D4';
    ctx.fillRect(platform.x, layerY, platform.width, layerH);
    ctx.fillStyle = 'rgba(160,70,100,0.25)';
    ctx.fillRect(platform.x, layerY + layerH, platform.width, 1);
  }

  // Crumb texture — tiny dark and light flecks across the cake body
  const crumbN = Math.max(3, Math.floor(platform.width / 9));
  for (let i = 0; i < crumbN; i++) {
    const px = platform.x + rng() * platform.width;
    const py = bodyTop + 2 + rng() * Math.max(1, bodyH - 4);
    const dark = rng() < 0.6;
    ctx.fillStyle = dark ? 'rgba(120,50,80,0.45)' : 'rgba(255,220,230,0.65)';
    ctx.beginPath();
    ctx.arc(px, py, 0.7 + rng() * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bottom bevel — deeper pink shadow at the cake's base
  ctx.fillStyle = 'rgba(120,40,70,0.3)';
  ctx.fillRect(platform.x, bodyTop + bodyH - 3, platform.width, 3);
}

export const candyLand: ArenaPack = {
  // ---- Identity ----
  id: 'candy_land',

  // ---- UI metadata ----
  previewGradient: 'linear-gradient(to bottom, #FFB6C1 0%, #FFDAB9 50%, #FFE4E1 100%)',
  previewIcon: '\u{1F36D}',

  // ---- Translations ----
  translations: { en: 'Candy Land', cs: 'Cukr\u00E1rna', hi: '\u0915\u0948\u0902\u0921\u0940 \u0932\u0948\u0902\u0921', fil: 'Candy Land' },

  // ---- Layout ----
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets([
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    { x: 460, y: 530, width: 360, height: 24 },
    { x: 510, y: 390, width: 260, height: 24 },
    { x: 560, y: 260, width: 160, height: 24 },
    { x: 30, y: 530, width: 180, height: 24 },
    { x: 1090, y: 510, width: 140, height: 24 },
    { x: 50, y: 350, width: 145, height: 24 },
    { x: 1100, y: 325, width: 115, height: 24 },
  ]),
  spawnPoints: [
    { x: 130, y: 510 }, { x: 1160, y: 490 },
    { x: 640, y: 510 }, { x: 640, y: 240 },
    { x: 120, y: 330 }, { x: 1155, y: 305 },
  ],
  bouncyPlatforms: [0, 1, 2, 3, 4, 5, 6, 7],
  noSprings: true,

  // ---- Visual config ----
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
  },

  // ---- Ambient systems ----
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

  // ---- Custom draw functions ----
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
      // Stick -- reaches from ground up to candy
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
    const floats = getFloatingPlatforms(arena.platforms);
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
      // Rotated rect (6x2) centered at (cx, cy)
      ctx.beginPath();
      ctx.moveTo(cx - 3 * cos + 1 * sin, cy - 3 * sin - 1 * cos);
      ctx.lineTo(cx + 3 * cos + 1 * sin, cy + 3 * sin - 1 * cos);
      ctx.lineTo(cx + 3 * cos - 1 * sin, cy + 3 * sin + 1 * cos);
      ctx.lineTo(cx - 3 * cos - 1 * sin, cy - 3 * sin + 1 * cos);
      ctx.fill();
    }
    ctx.restore();
  },

  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawCandyPlatformBg(ctx, platform);
  },
  drawPlatformOverlay: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    drawCandyPlatformFg(ctx, platform);
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

  drawCustomThorn: createThornRenderer((ctx, x, y, width, height, _fadeAlpha) => {
    const by = y + height;

    // Candy cane spikes -- red/white striped pointed sticks
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
  }),

  drawCustomSpring: createSpringRenderer((ctx, x, y, size, bounceTimer, _fadeAlpha) => {
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
  }),

  // ---- Audio ----
  musicFile: 'candy_land.mp3',
  // NAV-DATA-START — auto-generated, do not hand-edit
  navData: {
    edges: [
      [{t:1,y:'j',x:624},{t:4,y:'j',x:104},{t:5,y:'j',x:1144}],
      [{t:0,y:'d',x:788},{t:2,y:'j',x:624},{t:4,y:'j',x:460},{t:5,y:'j',x:788}],
      [{t:0,y:'d',x:738},{t:1,y:'d',x:738},{t:3,y:'j',x:624}],
      [{t:0,y:'d',x:688},{t:1,y:'d',x:688},{t:2,y:'d',x:688}],
      [{t:0,y:'d',x:178},{t:1,y:'j',x:178},{t:5,y:'j',x:30}],
      [{t:0,y:'d',x:1090},{t:6,y:'j',x:1198}],
      [{t:0,y:'d',x:163},{t:4,y:'d',x:50},{t:5,y:'d',x:50},{t:7,y:'j',x:50}],
      [{t:0,y:'d',x:1100},{t:4,y:'d',x:1183},{t:5,y:'d',x:1183}],
    ],
    nextHop: [[-1,1,1,1,4,5,5,5],[0,-1,2,2,4,5,5,5],[0,1,-1,3,0,0,0,0],[0,1,2,-1,0,0,0,0],[0,1,1,1,-1,5,5,5],[0,0,0,0,0,-1,6,6],[0,0,0,0,4,5,-1,7],[0,0,0,0,4,5,5,-1]],
    safeHop: [[-1,1,1,1,4,5,5,5],[0,-1,2,2,4,5,5,5],[0,1,-1,3,0,0,0,0],[0,1,2,-1,0,0,0,0],[0,1,1,1,-1,5,5,5],[0,0,0,0,0,-1,6,6],[0,0,0,0,4,5,-1,7],[0,0,0,0,4,5,5,-1]],
  },
  // NAV-DATA-END
};
