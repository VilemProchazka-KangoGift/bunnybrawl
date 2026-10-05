import type { Ctx2D, Platform } from '../../types';

// Selected Mixed Meadow study. These detailed static paths are drawn into the
// arena's background / foreground caches, never rebuilt in the animation loop.
const TAU = Math.PI * 2;
const palette = {
  ink: '#334937', shade: '#31523c', mid: '#6d8c4c', light: '#a3b966',
  tip: '#dfd992', earth: '#ad7953', earthLight: '#d5a77a', side: '#61422f',
  cap: '#a2bb67', width: 1.5,
} as const;
const leafySprays = [[-26, -14, -2.6], [-15, -26, -2.08], [0, -29, -1.55], [16, -23, -.95], [25, -11, -.32]] as const;
const leafyBerries = [[-22, -14], [10, -21], [22, -7]] as const;
const hedgeMarks = [[-25, -24], [-13, -31], [1, -35], [15, -28], [25, -20], [-13, -18], [5, -23], [14, -12]] as const;
const hedgeSprigs = [[-29, -21, -2.5], [-11, -33, -1.9], [11, -33, -.6], [29, -15, -.1]] as const;
const thicketSprigs = [[-18, -23, -2.4], [-8, -30, -1.9], [4, -30, -.8], [17, -25, -.6], [26, -15, -.8], [-22, -14, 2.8]] as const;
const lowLeaves = [[-29, 0, -2.3], [-18, 1, -1.8], [17, 1, -1.1], [28, 0, -.7]] as const;
const hedgeBerries = [[-25, -17], [-3, -29], [21, -16]] as const;
const berryOffsets = [[-1.8, 0], [1.5, 1.3]] as const;
const thicketFlowers = [[-20, -17], [-4, -31], [14, -21], [28, -9]] as const;
const mushroomSpots = [[-4, -15, 2.2], [3, -17, 2.7], [7, -12, 1.3]] as const;

function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, TAU);
  c.fill();
}

function leaf(c: Ctx2D, x: number, y: number, length: number, angle: number, fill: string): void {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.fillStyle = fill; c.strokeStyle = palette.ink; c.lineWidth = palette.width;
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(length * .04, -length * .38, length * .55, -length * .57, length * .82, -length * .21);
  c.quadraticCurveTo(length * .94, -length * .2, length, 0);
  c.bezierCurveTo(length * .7, length * .46, length * .23, length * .46, 0, 0);
  c.closePath(); c.fill(); c.stroke();
  c.lineWidth = .75;
  c.beginPath(); c.moveTo(length * .16, 0); c.lineTo(length * .77, 0); c.stroke();
  c.restore();
}

function drawLeafyBush(c: Ctx2D): void {
  const p = palette;
  // Continuous opaque core preserves the foreground hiding volume.
  c.fillStyle = p.shade; c.strokeStyle = p.ink; c.lineWidth = p.width;
  c.beginPath(); c.moveTo(-34, 0); c.lineTo(-33, -17); c.lineTo(-25, -25);
  c.lineTo(-18, -29); c.lineTo(-10, -37); c.lineTo(4, -38); c.lineTo(15, -32);
  c.lineTo(26, -26); c.lineTo(34, -16); c.lineTo(35, 0); c.closePath(); c.fill(); c.stroke();
  for (let i = 0; i < leafySprays.length; i++) {
    const [tx, ty, a] = leafySprays[i];
    c.strokeStyle = p.ink; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(i % 2 ? 3 : -4, 1); c.quadraticCurveTo(tx * .6, -10, tx, ty); c.stroke();
    for (let j = 0; j < 3; j++) {
      const t = .4 + j * .19, bx = tx * t, by = ty * t, len = 14 + j;
      leaf(c, bx, by, len, a - .78, j % 2 ? p.light : p.mid);
      leaf(c, bx, by, len * .92, a + .78 + .07, j % 2 ? p.mid : p.light);
    }
    leaf(c, tx * .89, ty * .89, 16, a, p.light);
  }
  for (let i = 0; i < 6; i++) {
    leaf(c, -29 + i * 10, -3 - (i % 2) * 4, 15, -1.9 + (i % 3) * .9, i % 2 ? p.mid : p.light);
  }
  for (const [bx, by] of leafyBerries) {
    oval(c, bx, by, 2.5, 2.7, '#d78066'); c.strokeStyle = p.ink; c.lineWidth = 1;
    c.beginPath(); c.arc(bx, by, 2.6, 0, TAU); c.stroke();
    oval(c, bx - .7, by - .9, .7, .7, '#ffe0a4');
  }
}

function shrubMass(c: Ctx2D, x: number, y: number, w: number, h: number): void {
  c.save(); c.translate(x, y); c.scale(w, h);
  c.fillStyle = palette.mid; c.strokeStyle = palette.ink; c.lineWidth = 1.1 / Math.max(w, h);
  c.beginPath(); c.moveTo(-1, .35);
  c.quadraticCurveTo(-1.12, .12, -.87, -.02); c.lineTo(-1.08, -.26);
  c.quadraticCurveTo(-.95, -.49, -.62, -.39); c.lineTo(-.74, -.65);
  c.quadraticCurveTo(-.48, -.81, -.29, -.57); c.lineTo(-.2, -.91);
  c.quadraticCurveTo(.08, -.93, .18, -.65); c.lineTo(.47, -.87);
  c.quadraticCurveTo(.79, -.77, .68, -.43); c.lineTo(.94, -.5);
  c.quadraticCurveTo(1.17, -.23, .91, -.08); c.lineTo(1.13, .17);
  c.quadraticCurveTo(.98, .45, .67, .32); c.lineTo(.61, .61);
  c.quadraticCurveTo(.3, .7, .12, .45); c.lineTo(-.17, .68);
  c.quadraticCurveTo(-.45, .65, -.46, .43); c.lineTo(-.79, .59);
  c.quadraticCurveTo(-1, .56, -1, .35); c.closePath(); c.fill(); c.stroke();
  c.restore();
  leaf(c, x - w * .13, y - h * .04, w * .52, -2.25, palette.light);
  leaf(c, x - w * .13, y - h * .04, w * .45, -.82, palette.mid);
}

function sprig(c: Ctx2D, x: number, y: number, angle: number, length: number): void {
  leaf(c, x, y, length, angle, palette.light);
  leaf(c, x, y, length * .8, angle - 1.2, palette.mid);
}

function drawShrub(c: Ctx2D, foreground: boolean, thicket: boolean): void {
  const p = palette;
  c.fillStyle = foreground ? p.shade : '#496447'; c.strokeStyle = p.ink; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-34, 0); c.quadraticCurveTo(-37, -5, -33, -9);
  c.lineTo(-37, -14); c.quadraticCurveTo(-36, -20, -30, -19);
  c.lineTo(-32, -25); c.quadraticCurveTo(-28, -29, -23, -26);
  c.lineTo(-24, -33); c.quadraticCurveTo(-20, -37, -16, -33);
  c.lineTo(-13, -40); c.quadraticCurveTo(-7, -43, -3, -37);
  c.lineTo(3, -42); c.quadraticCurveTo(10, -43, 12, -36);
  c.lineTo(18, -39); c.quadraticCurveTo(24, -36, 22, -30);
  c.lineTo(28, -31); c.quadraticCurveTo(34, -26, 30, -22);
  c.lineTo(36, -20); c.quadraticCurveTo(38, -13, 33, -11);
  c.lineTo(37, -7); c.quadraticCurveTo(38, -2, 32, 1);
  c.lineTo(27, -1); c.quadraticCurveTo(22, 5, 17, 1);
  c.lineTo(12, 3); c.quadraticCurveTo(7, 4, 4, 1);
  c.quadraticCurveTo(-1, 4, -6, 1); c.quadraticCurveTo(-13, 5, -18, 1);
  c.lineTo(-23, 3); c.quadraticCurveTo(-28, 4, -30, 0);
  c.closePath(); c.fill(); c.stroke();
  if (thicket) {
    shrubMass(c, -21, -20, 14, 17); shrubMass(c, -7, -30, 16, 15);
    shrubMass(c, 15, -22, 18, 13); shrubMass(c, 25, -10, 11, 11);
    for (const [x, y, a] of thicketSprigs) sprig(c, x, y, a, 8);
  } else {
    shrubMass(c, -17, -19, 18, 18); shrubMass(c, 5, -26, 20, 18);
    shrubMass(c, 23, -16, 12, 17); shrubMass(c, -3, -12, 24, 13);
    c.strokeStyle = p.light; c.lineWidth = 2;
    for (const [x, y] of hedgeMarks) {
      c.beginPath(); c.moveTo(x - 3, y + 1); c.quadraticCurveTo(x - 2, y - 3, x + 1, y - 2);
      c.quadraticCurveTo(x + 3, y - 4, x + 5, y - 1); c.stroke();
    }
    sprig(c, -10, -15, -2.5, 7); sprig(c, 12, -18, -.5, 7);
    for (const [x, y, a] of hedgeSprigs) sprig(c, x, y, a, 7);
  }
  for (const [x, y, a] of lowLeaves) leaf(c, x, y, 7, a, p.mid);
  if (thicket) {
    // Former Berry thicket uses the selected yellow Flowering blossoms.
    for (const [x, y] of thicketFlowers) {
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        oval(c, x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2.2, 1.8, '#f1d56e', a);
      }
      oval(c, x, y, 1.4, 1.4, '#b58342'); oval(c, x - .4, y - .5, .6, .6, '#fff0b3');
    }
  } else {
    for (const [x, y] of hedgeBerries) {
      for (const [dx, dy] of berryOffsets) {
        oval(c, x + dx, y + dy, 2, 2.2, '#bd675f');
        oval(c, x + dx - .55, y + dy - .65, .65, .65, '#f4b7a0');
      }
    }
  }
}

/** Stable placement shared with the approved mockup: Leafy, Hedge, Flower thicket. */
export function mixedBushIndex(x: number, y: number, foreground: boolean): number {
  if (y >= 650) {
    if (foreground) return x < 300 ? 0 : x < 800 ? 1 : x < 1080 ? 2 : 0;
    return x < 300 ? 1 : x < 600 ? 2 : x < 850 ? 0 : x < 1050 ? 1 : 2;
  }
  return (Math.floor(x / 150) + Math.floor(y / 110) + (foreground ? 0 : 1)) % 3;
}

export function drawMeadowBush(c: Ctx2D, x: number, groundY: number, size: number, foreground: boolean): void {
  c.save(); c.translate(x, groundY); c.scale(size / 50, size / 50);
  c.globalAlpha = 1; c.lineCap = 'round'; c.lineJoin = 'round';
  const index = mixedBushIndex(x, groundY, foreground);
  if (index === 0) drawLeafyBush(c);
  else drawShrub(c, foreground, index === 2);
  c.restore();
}

export function drawMeadowFlower(c: Ctx2D, x: number, y: number, color: string, height = 22): void {
  const p = palette;
  c.save(); c.strokeStyle = p.ink; c.lineWidth = p.width;
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 3, y - height * .5, x, y - height); c.stroke();
  leaf(c, x, y - height * .25, 8, -2.5, p.mid);
  leaf(c, x - 1, y - height * .5, 8, -.6, p.light);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, px = x + Math.cos(a) * 4, py = y - height + Math.sin(a) * 4;
    oval(c, px, py, 3.4, 2.4, color, a);
    c.strokeStyle = p.ink; c.lineWidth = .8;
    c.beginPath(); c.ellipse(px, py, 3.4, 2.4, a, 0, TAU); c.stroke();
  }
  oval(c, x, y - height, 2.7, 2.7, '#f6cf68'); c.restore();
}

export function drawMeadowMushroom(c: Ctx2D, x: number, y: number): void {
  c.save(); c.translate(x, y); c.strokeStyle = palette.ink; c.lineWidth = palette.width;
  c.fillStyle = '#eddbad'; c.beginPath(); c.moveTo(-2, -12); c.lineTo(3, -12); c.lineTo(4, 0);
  c.quadraticCurveTo(0, 2, -3, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#c4775b'; c.beginPath(); c.moveTo(-10, -11);
  c.bezierCurveTo(-9, -24, 9, -24, 11, -11); c.quadraticCurveTo(0, -7, -10, -11);
  c.closePath(); c.fill(); c.stroke();
  for (const [px, py, r] of mushroomSpots) oval(c, px, py, r, r * .65, '#fff0c6');
  c.restore();
}

export function drawMeadowPlatform(c: Ctx2D, platform: Platform, isGround: boolean): void {
  const q = palette, { x, y, width: w, height: h } = platform;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = q.ink; c.lineWidth = q.width;
  if (platform.style === 'stump') {
    c.fillStyle = q.earth; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y);
    c.lineTo(x + w - 2, y + h - 8); c.lineTo(x + w + 3, y + h); c.lineTo(x - 3, y + h);
    c.lineTo(x + 2, y + h - 9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = q.side; c.beginPath(); c.moveTo(x + w - 9, y + 2); c.lineTo(x + w, y);
    c.lineTo(x + w - 2, y + h - 8); c.lineTo(x + w + 3, y + h); c.lineTo(x + w - 8, y + h); c.closePath(); c.fill();
    for (let i = 0; i < 5; i++) {
      const bx = x + 6 + i * (w - 13) / 5;
      c.strokeStyle = i % 2 ? q.earthLight : q.ink; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(bx, y + 7); c.bezierCurveTo(bx - 3, y + h * .4, bx + 3, y + h * .65, bx - 1, y + h - 3); c.stroke();
    }
    oval(c, x + w / 2, y, w / 2, 8, q.earthLight);
    c.strokeStyle = q.ink; c.lineWidth = q.width;
    c.beginPath(); c.ellipse(x + w / 2, y, w / 2, 8, 0, 0, TAU); c.stroke();
    c.lineWidth = .8;
    for (let i = 1; i <= 3; i++) {
      c.beginPath(); c.ellipse(x + w * .49, y, w * .12 * i, 1.7 * i, 0, 0, TAU); c.stroke();
    }
    leaf(c, x + 3, y + h - 1, 10, -.9, q.mid); leaf(c, x + w - 6, y + h, 9, -2, q.light);
    c.restore(); return;
  }
  // Preserve the existing fake 3D depth: cap y +/- 8, back edge 8px right.
  // The middle of the cap remains the exact collision plane at platform.y.
  c.fillStyle = q.side; c.beginPath(); c.moveTo(x + w, y + 8); c.lineTo(x + w + 8, y - 8);
  c.lineTo(x + w + 8, y + h - 16); c.lineTo(x + w, y + h); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = q.earth; c.beginPath(); c.rect(x, y + 8, w, h - 8); c.fill(); c.stroke();
  c.fillStyle = q.side; c.fillRect(x, y + h - 4, w, 4);
  c.strokeStyle = q.earthLight; c.lineWidth = 2.6;
  c.beginPath(); c.moveTo(x + 3, y + 15); c.bezierCurveTo(x + w * .3, y + 11, x + w * .6, y + 20, x + w - 3, y + 15); c.stroke();
  for (let i = 0; i < Math.floor(w / 25); i++) {
    oval(c, x + 13 + i * 25, y + 18 + (i * 7 % Math.max(1, h - 22)), 2.4, 1.2, q.earthLight, -.25);
  }
  c.fillStyle = q.cap; c.strokeStyle = q.ink; c.lineWidth = q.width;
  c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + 8, y - 8);
  const n = Math.max(3, Math.ceil(w / 26));
  for (let i = 0; i < n; i++) {
    const a = x + 8 + i * w / n, b = x + 8 + (i + 1) * w / n;
    c.bezierCurveTo(a + w / n * .3, y - 11, b - w / n * .2, y - 9, b, y - 8);
  }
  c.lineTo(x + w, y + 8);
  for (let i = n; i > 0; i--) {
    const a = x + i * w / n, b = x + (i - 1) * w / n;
    c.bezierCurveTo(a - w / n * .2, y + 11, b + w / n * .25, y + 12, b, y + 8);
  }
  c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = q.tip; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x + 7, y); c.lineTo(x + w - 3, y); c.stroke();
  for (let i = 0; i < Math.floor(w / 21); i++) {
    const px = x + 13 + i * 21;
    c.strokeStyle = q.mid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - 2, y + 4); c.lineTo(px, y + 1); c.lineTo(px + 2, y + 4); c.stroke();
  }
  if (!isGround) {
    c.strokeStyle = q.ink; c.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) {
      const rx = x + w * (.19 + i * .3);
      c.beginPath(); c.moveTo(rx, y + h); c.quadraticCurveTo(rx - 4, y + h + 3, rx + 1, y + h + 6 - i); c.stroke();
    }
  }
  c.restore();
}

/** Front soil hides players below the landing plane, matching the art study. */
export function drawMeadowPlatformOverlay(c: Ctx2D, platform: Platform, isGround: boolean): void {
  if (platform.style === 'stump') return;
  c.save(); c.beginPath();
  c.rect(platform.x, platform.y + 4, platform.width, platform.height - 4);
  c.clip();
  drawMeadowPlatform(c, platform, isGround);
  c.restore();
}
