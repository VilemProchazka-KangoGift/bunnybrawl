// Foreground primitives — closer decorations drawn on top of platforms.

import type { Ctx2D } from '../../types';
import { fastSin } from '../../fastMath';

export interface FgBushColors {
  backLayer: string;
  mainBody: string;
  leftLobe: string;
  rightLobe: string;
  highlight: string;
  highlight2: string;
  berries: string[];
}

const DEFAULT_FG_BUSH_COLORS: FgBushColors = {
  backLayer: '#1E5C1E',
  mainBody: '#2B7A2B',
  leftLobe: '#338A33',
  rightLobe: '#2E8030',
  highlight: '#3DA63D',
  highlight2: '#3DA63D',
  berries: ['#CC3333', '#DD4444', '#BB2222'],
};

export function drawFgBush(
  ctx: Ctx2D,
  x: number,
  groundY: number,
  size: number,
  colors: FgBushColors = DEFAULT_FG_BUSH_COLORS,
): void {
  ctx.fillStyle = colors.backLayer;
  ctx.beginPath();
  ctx.ellipse(x, groundY - size * 0.35, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.mainBody;
  ctx.beginPath();
  ctx.ellipse(x + 2, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.leftLobe;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.3, groundY - size * 0.3, size * 0.35, size * 0.32, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.rightLobe;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, groundY - size * 0.35, size * 0.33, size * 0.3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.highlight;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.1, groundY - size * 0.55, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.highlight2;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.2, groundY - size * 0.5, size * 0.12, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors.berries[i % colors.berries.length];
    ctx.beginPath();
    ctx.arc(
      x + (i - 1) * size * 0.2 + (i * 3 % 5),
      groundY - size * 0.25 - (i * 7 % 6),
      2.5, 0, Math.PI * 2,
    );
    ctx.fill();
  }
}

/** bendX shifts the TIP of each blade only; base stays anchored at groundY.
 *  Default 0 = static draw. Used by ReactiveDecorationSystem to bend grass
 *  with wind / player proximity. */
export function drawTallGrass(ctx: Ctx2D, x: number, groundY: number, bladeCount: number, darkColor = '#2D7A2D', lightColor = '#3A8A3A', bendX = 0): void {
  for (let i = 0; i < bladeCount; i++) {
    const bx = x + (i - bladeCount / 2) * 6;
    const height = 14 + (i * 7 % 10);
    const lean = (i % 3 - 1) * 4;
    const tipX = bx + lean + bendX;
    const ctrlX = bx + lean * 0.5 + bendX * 0.55;

    ctx.strokeStyle = i % 2 === 0 ? darkColor : lightColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx, groundY);
    ctx.quadraticCurveTo(ctrlX, groundY - height * 0.6, tipX, groundY - height);
    ctx.stroke();

    if (i % 3 === 0) {
      ctx.strokeStyle = '#4CA64C';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 1, groundY);
      ctx.quadraticCurveTo(ctrlX + 1, groundY - height * 0.6, tipX + 1, groundY - height);
      ctx.stroke();
    }
  }
}

/** bendX shifts the stem TIP and frond attachment points proportionally to
 *  height. Base stays anchored at groundY. */
export function drawFern(ctx: Ctx2D, x: number, groundY: number, color = '#2D6B2D', bendX = 0): void {
  const height = 22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.quadraticCurveTo(x + 2 + bendX * 0.5, groundY - height * 0.5, x + 4 + bendX, groundY - height);
  ctx.stroke();

  const frondCount = 4;
  for (let i = 0; i < frondCount; i++) {
    const fy = groundY - 5 - i * 4;
    const fLen = 10 - i * 1.5;
    // Frond attachment point follows the bent stem proportionally.
    const stemBend = bendX * (i + 1) / frondCount;
    const stemX = x + 1 + stemBend;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = i < 2 ? '#2B7A2B' : '#3A9A3A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(stemX, fy);
      ctx.quadraticCurveTo(stemX + side * fLen * 0.7, fy - 3, stemX + side * fLen, fy - 1);
      ctx.stroke();
    }
  }
}

/** bendX shifts the BOTTOM tip; top stays anchored at (x, topY). The vine
 *  retains its baseline static curl (`Math.sin(x * 0.1) * 4`); bendX adds on
 *  top of that for dynamic wind / player lean. */
export function drawHangingVine(ctx: Ctx2D, x: number, topY: number, length: number, bendX = 0): void {
  ctx.strokeStyle = '#3A7A3A';
  ctx.lineWidth = 1.5;
  const baseSway = Math.sin(x * 0.1) * 4;
  // Bottom curve point and mid-control point both shifted by bendX,
  // weighted so the curve bends most at the tip.
  const tipX = x + baseSway * 0.5 + bendX;
  const ctrlX = x + baseSway + bendX * 0.7;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.quadraticCurveTo(ctrlX, topY + length * 0.6, tipX, topY + length);
  ctx.stroke();

  ctx.fillStyle = '#3D8B3D';
  for (let i = 0; i < 3; i++) {
    const ly = topY + (i + 1) * length * 0.25;
    // Leaves follow the bent curve proportionally to depth.
    const t = (i + 1) / 4;
    const lx = x + baseSway * t + bendX * t * t;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.ellipse(lx + side * 4, ly, 4, 2.5, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFgLeafCluster(ctx: Ctx2D, x: number, platY: number, colors = ['#2E7A2E', '#3A8C3A', '#4A9C4A']): void {
  ctx.fillStyle = colors[0];
  ctx.beginPath();
  ctx.ellipse(x - 6, platY - 4, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[1];
  ctx.beginPath();
  ctx.ellipse(x + 6, platY - 5, 7, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[2];
  ctx.beginPath();
  ctx.ellipse(x, platY - 7, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFgWildflower(ctx: Ctx2D, x: number, groundY: number, color: string, height: number): void {
  ctx.strokeStyle = '#2D6B2D';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x + 1, groundY - height);
  ctx.stroke();

  ctx.fillStyle = '#3A8A3A';
  ctx.beginPath();
  ctx.ellipse(x + 5, groundY - height * 0.5, 5, 2.5, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  const petalR = 4;
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + 1 + Math.cos(angle) * 4, groundY - height - 1 + Math.sin(angle) * 4, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE04A';
  ctx.beginPath();
  ctx.arc(x + 1, groundY - height - 1, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Tree stump — solid jumpable obstacle. Draws a cut trunk with rings and moss.
 *  x/topY is top-left corner, matching the platform position. */
export function drawTreeStump(ctx: Ctx2D, x: number, topY: number, width: number, height: number): void {
  // Bark body
  ctx.fillStyle = '#5C3A1E';
  ctx.fillRect(x, topY, width, height);

  // Bark texture lines
  ctx.strokeStyle = '#4A2E16';
  ctx.lineWidth = 1;
  for (let dy = 6; dy < height; dy += 8) {
    ctx.beginPath();
    ctx.moveTo(x + 2, topY + dy);
    ctx.lineTo(x + width - 2, topY + dy + (dy % 16 < 8 ? 2 : -2));
    ctx.stroke();
  }

  // Left/right bark edges (darker)
  ctx.fillStyle = '#4A2E16';
  ctx.fillRect(x, topY, 3, height);
  ctx.fillRect(x + width - 3, topY, 3, height);

  // Top face — cut surface with rings
  ctx.fillStyle = '#C49A6C';
  ctx.fillRect(x + 2, topY, width - 4, 6);

  // Annual rings on top
  ctx.strokeStyle = '#A07850';
  ctx.lineWidth = 0.8;
  const cx = x + width / 2;
  const cy = topY + 3;
  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * (width * 0.12), r * 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center dot
  ctx.fillStyle = '#8B6340';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Moss patches on sides
  ctx.fillStyle = '#4A8C3A';
  ctx.beginPath();
  ctx.ellipse(x + 4, topY + height * 0.6, 5, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3A7A2E';
  ctx.beginPath();
  ctx.ellipse(x + width - 5, topY + height * 0.4, 4, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Small mushroom growing on side
  ctx.fillStyle = '#F5F0E0';
  ctx.fillRect(x + width - 2, topY + height * 0.55, 4, 5);
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath();
  ctx.ellipse(x + width, topY + height * 0.55, 5, 3, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x + width - 1, topY + height * 0.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

// Animated rat sprite. Caller owns position, facing, and motion magnitude.
// `motion` ∈ [0,1] scales scurry/leg amplitude (use facingEase magnitude).
export function drawRat(
  ctx: Ctx2D,
  x: number, y: number,
  facing: 1 | -1,
  time: number,
  motion: number,
  fleeing: boolean,
): void {
  const scurry = fastSin(time * (fleeing ? 22 : 10)) * motion;
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.bezierCurveTo(-12, -2 + scurry, -16, 1, -18, -1 + scurry * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#5a4a3a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(11, -1);
  ctx.lineTo(11, 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -0.5, 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5a4a';
  ctx.beginPath();
  ctx.arc(5, -3, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(8, -1, 0.8, 0.8);
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const lx = -4 + i * 2.5;
    const lift = fastSin(time * 22 + i * 1.5) * motion * 0.8;
    ctx.moveTo(lx, 2);
    ctx.lineTo(lx, 4 - Math.max(0, lift));
  }
  ctx.stroke();
  ctx.restore();
}
